require('dotenv').config()
const readline = require('readline')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * CẤU HÌNH TRỰC TIẾP TỪ FILE .env
 */
const rawHost = process.env.BOT_HOST || 'localhost';
let BOT_HOST = rawHost;
let BOT_PORT = process.env.BOT_PORT ? parseInt(process.env.BOT_PORT) : 25565;

if (rawHost.includes(':')) {
    const parts = rawHost.split(':');
    BOT_HOST = parts[0];
    BOT_PORT = parseInt(parts[1]) || BOT_PORT;
}

const BOT_USERNAME = process.env.BOT_USERNAME || 'AFK_Bot';
const BOT_PASSWORD = process.env.BOT_PASSWORD || 'password123';
const BOT_VERSION = process.env.BOT_VERSION || false;

const bot = mineflayer.createBot({
    host: BOT_HOST,
    port: BOT_PORT,
    username: BOT_USERNAME,
    version: BOT_VERSION,
    hideErrors: true
})

// Nạp plugin tìm đường
bot.loadPlugin(pathfinder)

// --- TRẠNG THÁI CỦA BOT ---
let followTarget = null;
let isDigging = false;
let isAttacking = false;
let targetBlockName = null;
let targetEntity = null;
let targetMobName = null;
let targetPickupItem = null;
let isEating = false;
let isAutoEating = false; // Guard cho vòng lặp autoEat

let isIdleEnabled = true;
let lastIdleActionTime = Date.now();
let idleInterval = 7000; // Khoảng chờ ngẫu nhiên từ 5-10s

let isGuardMode = false;
let guardPos = null;
let isFarming = false;
let isBodyguardMode = false;

const HOSTILE_MOBS = [
    'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime', 'magma_cube',
    'husk', 'drowned', 'pillager', 'ravager', 'vex', 'evoker', 'vindicator'
];

const CROP_TYPES = ['wheat', 'carrots', 'potatoes', 'beetroots', 'nether_wart'];
const SEED_TYPES = {
    'wheat': 'wheat_seeds',
    'carrots': 'carrot',
    'potatoes': 'potato',
    'beetroots': 'beetroot_seeds',
    'nether_wart': 'nether_wart'
};

const IDLE_MESSAGES = [
    "Trời hôm nay đẹp quá!",
    "Thèm ăn táo vàng quá...",
    "Có ai thấy tui không?",
    "Đứng yên một chỗ chán ghê.",
    "Bên kia có gì vui không ta?",
    "Hôm nay có ai muốn đi săn slime không?",
    "Tui cảm thấy Hiếu thật gay."
];

const FOOD_NAMES = [
    'cooked_beef', 'cooked_chicken', 'cooked_porkchop', 'cooked_mutton', 'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
    'baked_potato', 'bread', 'apple', 'carrot', 'golden_apple', 'golden_carrot', 'melon_slice', 'sweet_berries',
    'beef', 'chicken', 'porkchop', 'mutton', 'rabbit', 'cod', 'salmon', 'potato', 'rotten_flesh'
];

// --- HÀM GỬI TIN NHẮN AN TOÀN (CHỐNG KICK SPAM CHAT) ---
async function safeChat(message) {
    if (!message) return;
    if (typeof message !== 'string') {
        if (message instanceof Promise) {
            message = await message;
        } else {
            message = String(message);
        }
    }
    const lines = message.split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
        console.log(`\x1b[35m[Bot Chat]\x1b[0m ${line}`);
        bot.chat(line);
        await sleep(1000);
    }
}

// --- BIẾN COOLDOWN ---
let lastDoorOpenTime = 0;
let lastPickupTime = 0;

// --- HELPER LOGGING ---
function logThink(msg) {
    console.log(`\x1b[36m[Bot]\x1b[0m ${msg}`);
}

// --- CONFIG ACTIONS ---
function configureMovements(bot) {
    const move = new Movements(bot);

    // Cài đặt cơ bản
    move.canEntityStandOn = false;
    move.allow1by1towers = true;
    move.allowParkour = true;
    move.allowSprinting = true;
    move.placeCost = 1;

    // Cửa và phá hoại
    move.canOpenDoors = true;
    move.canOpenFenceGates = true;
    move.digCost = 10;

    // Scaffolding blocks
    move.scafoldingBlocks = [];
    const allowed = ['dirt', 'cobblestone', 'sand', 'netherrack', 'stone'];
    allowed.forEach(name => {
        const block = bot.registry.blocksByName[name];
        if (block) move.scafoldingBlocks.push(block.id);
    });

    return move;
}

function resetStates() {
    followTarget = null;
    isDigging = false;
    isAttacking = false;
    isGuardMode = false;
    isFarming = false;
    isBodyguardMode = false;
    targetBlockName = null;
    targetEntity = null;
    targetMobName = null;
    targetPickupItem = null;
}

// --- HÀM TÌM KIẾM NGƯỜI CHƠI THÔNG MINH & AN TOÀN ---
function isPlayerEntity(e) {
    if (!e || e === bot.entity || (bot.entity && e.id === bot.entity.id)) return false;
    return e.type === 'player' || e.name === 'player' || e.entityType === 155;
}

function getPlayerName(e) {
    if (!e) return null;
    if (e.username) return e.username;
    if (e.uuid && bot.uuidToUsername[e.uuid]) {
        e.username = bot.uuidToUsername[e.uuid];
        return e.username;
    }
    const foundP = Object.values(bot.players).find(p => p.uuid === e.uuid);
    if (foundP?.username) {
        e.username = foundP.username;
        return e.username;
    }
    return null;
}

function findPlayerSmart(name) {
    const rawName = (name || '').trim();
    const lowerName = rawName.toLowerCase();
    const isGeneric = !rawName || ['tui', 'tôi', 'me', 'bạn', 'người chơi'].includes(lowerName);

    // Đồng bộ lại entity cho các player trong bot.players
    for (const entity of Object.values(bot.entities)) {
        if (isPlayerEntity(entity)) {
            const pName = getPlayerName(entity);
            if (pName && bot.players[pName]) {
                bot.players[pName].entity = entity;
            }
        }
    }

    // 1. Tìm chính xác theo tên trong entities quanh bot
    if (!isGeneric) {
        const matchingEntity = Object.values(bot.entities).find(e => {
            if (!isPlayerEntity(e)) return false;
            const pName = getPlayerName(e);
            return pName && pName.toLowerCase() === lowerName;
        });
        if (matchingEntity) {
            return { entity: matchingEntity, name: getPlayerName(matchingEntity) || rawName };
        }
    }

    // 2. Tìm trong tablist bot.players
    if (!isGeneric) {
        const playerKey = Object.keys(bot.players).find(k => k.toLowerCase() === lowerName);
        if (playerKey) {
            const p = bot.players[playerKey];
            if (p?.entity && isPlayerEntity(p.entity)) {
                return { entity: p.entity, name: p.username };
            }
        }
    }

    // 3. Nếu bạn đang đứng gần bot (trong phạm vi 32 ô), tự động bắt thực thể người chơi gần nhất!
    const nearestPlayer = bot.nearestEntity(e => isPlayerEntity(e));
    if (nearestPlayer) {
        const pName = getPlayerName(nearestPlayer) || rawName || 'bạn';
        return { entity: nearestPlayer, name: pName };
    }

    // 4. Nếu có trong tablist nhưng entity chưa tải (ở xa ngoài tầm nhìn)
    if (!isGeneric) {
        const playerKey = Object.keys(bot.players).find(k => k.toLowerCase() === lowerName);
        if (playerKey) {
            const p = bot.players[playerKey];
            return { entity: null, name: p?.username || playerKey, isFar: true };
        }
    }

    return null;
}

// --- AUTO LOGIN (QUAN TRỌNG CHO SERVER PUBLIC) ---
bot.on('spawn', () => {
    logThink('✅ Đã kết nối vào server!');
    setTimeout(() => {
        bot.chat(`/login ${BOT_PASSWORD}`);
        bot.chat(`/l ${BOT_PASSWORD}`);
        setTimeout(() => {
            bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
            bot.chat(`/reg ${BOT_PASSWORD} ${BOT_PASSWORD}`);
        }, 1500);
        logThink('🔑 Đã gửi lệnh đăng nhập/đăng ký.');
    }, 3000);
});

let lastServerMessage = '';
let lastServerMessageTime = 0;

bot.on('messagestr', (message) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    if (trimmed.includes('/login') || trimmed.includes('Dùng lệnh /login')) bot.chat(`/login ${BOT_PASSWORD}`);
    if (trimmed.includes('/register') || trimmed.includes('Dùng lệnh /register')) bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);

    // Bỏ qua tin nhắn Actionbar/Tọa độ lặp lại
    if (/XYZ:\s*-?\d+/i.test(trimmed) || /☀|☁|🌧/.test(trimmed)) return;

    const now = Date.now();
    if (trimmed === lastServerMessage && now - lastServerMessageTime < 10000) return;
    lastServerMessage = trimmed;
    lastServerMessageTime = now;

    console.log(`\x1b[33m[Server]\x1b[0m ${trimmed}`);
});

// --- CÁC HÀM LOGIC CHIẾN ĐẤU & FARMING (GIỮ NGUYÊN TỪ BẢN LOCAL) ---

async function autoOpenDoors() {
    if (!bot.pathfinder.isMoving()) return;
    if (Date.now() - lastDoorOpenTime < 3000) return;

    const door = bot.findBlock({
        matching: blk => {
            const isDoor = blk.name.includes('_door') || blk.name.includes('_gate');
            const isOpen = blk.getProperties().open;
            return isDoor && !isOpen;
        },
        maxDistance: 2
    });

    if (door) {
        try {
            lastDoorOpenTime = Date.now();
            await bot.activateBlock(door);
            await new Promise(r => setTimeout(r, 500));
        } catch (err) { }
    }
}


async function runGuardLogic() {
    if ((!isGuardMode && !isBodyguardMode) || isAttacking) return;

    const scanRadius = isBodyguardMode ? 16 : 32;
    const filter = e => HOSTILE_MOBS.includes(e.name) && e.position.distanceTo(bot.entity.position) < scanRadius && e.isValid;
    const enemy = bot.nearestEntity(filter);

    if (enemy) {
        logThink(`Phát hiện kẻ thù ${enemy.name}! Đang tấn công bảo vệ...`);
        targetMobName = enemy.name;
        targetEntity = enemy;
        isAttacking = true;
        startAttackLoop();
    } else if (isGuardMode) {
        // Quay về vị trí canh gác nếu ở quá xa (chỉ áp dụng cho chế độ Guard cố định)
        if (guardPos && bot.entity.position.distanceTo(guardPos) > 3 && !bot.pathfinder.isMoving()) {
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z));
        }
    }
}

async function startFarmingLoop() {
    while (isFarming) {
        // Tìm tất cả cây đã chín
        const matureCrops = bot.findBlocks({
            matching: b => {
                if (!b || !b.position || !CROP_TYPES.includes(b.name)) return false;
                const age = b.metadata;
                return age >= 7 || (b.name === 'beetroots' && age >= 3) || (b.name === 'nether_wart' && age >= 3);
            },
            maxDistance: 16,
            count: 20
        });

        // Tìm tất cả ô đất trống (đã cuốc mà chưa trồng)
        const emptyFarmlands = bot.findBlocks({
            matching: b => {
                if (!b || !b.position || b.name !== 'farmland') return false;
                const blockAbove = bot.blockAt(b.position.offset(0, 1, 0));
                return blockAbove && blockAbove.name === 'air';
            },
            maxDistance: 16,
            count: 20
        });

        // Gộp lại và sắp xếp theo khoảng cách gần nhất
        const targets = [
            ...matureCrops.map(p => ({ pos: p, type: 'harvest' })),
            ...emptyFarmlands.map(p => ({ pos: p, type: 'plant' }))
        ].sort((a, b) => bot.entity.position.distanceTo(a.pos) - bot.entity.position.distanceTo(b.pos));

        if (targets.length > 0) {
            const target = targets[0];
            const block = bot.blockAt(target.pos);

            try {
                const move = configureMovements(bot);
                bot.pathfinder.setMovements(move);

                if (target.type === 'harvest') {
                    logThink(`Đang đi thu hoạch ${block.name}...`);
                    await bot.pathfinder.goto(new goals.GoalGetToBlock(target.pos.x, target.pos.y, target.pos.z));
                    await bot.dig(block);
                    await sleep(800);

                    const seedName = SEED_TYPES[block.name];
                    const seed = bot.inventory.items().find(item => item.name === seedName);
                    if (seed) {
                        const farmland = bot.blockAt(target.pos.offset(0, -1, 0));
                        if (farmland && farmland.name === 'farmland') {
                            await bot.equip(seed, 'hand');
                            await bot.placeBlock(farmland, { x: 0, y: 1, z: 0 });
                            logThink(`Đã trồng lại ${seedName}.`);
                        }
                    }
                } else {
                    const seed = bot.inventory.items().find(item => Object.values(SEED_TYPES).includes(item.name));
                    if (seed) {
                        logThink(`Phát hiện đất trống, đang đi trồng ${seed.name}...`);
                        await bot.pathfinder.goto(new goals.GoalGetToBlock(target.pos.x, target.pos.y, target.pos.z));
                        await bot.equip(seed, 'hand');
                        await bot.placeBlock(block, { x: 0, y: 1, z: 0 });
                        logThink(`Đã trồng ${seed.name} vào ô đất trống.`);
                    } else {
                        await sleep(2000);
                    }
                }
            } catch (err) { }
        } else {
            logThink("Không tìm thấy cây chín hay đất trống nào quanh đây.");
            await sleep(5000);
        }
        await sleep(500);
    }
}

async function storeItems() {
    const chestBlock = bot.findBlock({
        matching: b => b.name === 'chest' || b.name === 'trapped_chest' || b.name === 'barrel',
        maxDistance: 8
    });

    if (!chestBlock) return "Tui không tìm thấy cái rương nào quanh đây hết!";

    try {
        const move = configureMovements(bot);
        bot.pathfinder.setMovements(move);
        await bot.pathfinder.goto(new goals.GoalGetToBlock(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z));
        const chest = await bot.openChest(chestBlock);
        for (const item of bot.inventory.items()) {
            const isFood = FOOD_NAMES.includes(item.name);
            const isTool = item.name.includes('sword') || item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel');
            if (!isFood && !isTool) {
                try { await chest.deposit(item.type, null, item.count); await sleep(200); } catch (e) { }
            }
        }
        chest.close();
        return "Đã cất xong đồ đạc không cần thiết!";
    } catch (err) {
        return `Không thể mở rương: ${err.message}`;
    }
}

async function equipForAction(target, mode) {
    if (mode === 'dig') {
        const name = target.name;
        let toolType = null;
        if (name.includes('log') || name.includes('planks') || name.includes('wood')) toolType = '_axe';
        else if (name.includes('stone') || name.includes('iron') || name.includes('gold') || name.includes('diamond')) toolType = '_pickaxe';
        else if (name.includes('dirt') || name.includes('sand') || name.includes('grass')) toolType = '_shovel';

        if (toolType) {
            const tools = bot.inventory.items().filter(i => i.name.includes(toolType));
            if (tools.length > 0) try { await bot.equip(tools[0], 'hand'); } catch (e) { }
        }
    } else if (mode === 'attack') {
        const dist = target ? bot.entity.position.distanceTo(target.position) : 0;
        const bow = bot.inventory.items().find(i => i.name === 'bow');
        const arrows = bot.inventory.items().find(i => i.name.includes('arrow'));
        const trident = bot.inventory.items().find(i => i.name === 'trident');

        if (dist > 4 && dist < 25) {
            if (trident) {
                try { await bot.equip(trident, 'hand'); } catch (e) { }
            } else if (bow && arrows) {
                try { await bot.equip(bow, 'hand'); } catch (e) { }
            }
        } else {
            const weapon = bot.inventory.items().find(i => i.name.includes('sword')) || bot.inventory.items().find(i => i.name.includes('_axe'));
            if (weapon) try { await bot.equip(weapon, 'hand'); } catch (e) { }
        }
    }
}

async function performRangedAttack(target) {
    if (!target || !target.isValid) return;

    const bow = bot.inventory.items().find(i => i.name === 'bow');
    const arrows = bot.inventory.items().find(i => i.name.includes('arrow'));
    const trident = bot.inventory.items().find(i => i.name === 'trident');

    const item = trident || (bow && arrows ? bow : null);
    if (!item) return;

    try {
        await bot.equip(item, 'hand');

        // Dừng mọi di chuyển để tập trung ngắm
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();

        bot.activateItem();

        const startTime = Date.now();
        const chargeTime = item.name === 'bow' ? 1200 : 1100;

        while (Date.now() - startTime < chargeTime) {
            if (!target.isValid) break;

            // Lấy vị trí mục tiêu (nhắm vào phần thân/đầu)
            const targetPos = target.position.offset(0, target.height * 0.8, 0);
            const botPos = bot.entity.position.offset(0, 1.6, 0); // Vị trí mắt bot

            const dx = targetPos.x - botPos.x;
            const dy = targetPos.y - botPos.y;
            const dz = targetPos.z - botPos.z;
            const groundDist = Math.sqrt(dx * dx + dz * dz);

            // Tính toán góc nhìn thủ công dể đạt dộ chính xác cao nhất
            const yaw = Math.atan2(-dx, -dz);

            // Bù đắp trọng lực dựa trên khoảng cách
            const dist = bot.entity.position.distanceTo(target.position);
            const gravityComp = item.name === 'bow' ? 0.0015 * dist * dist : 0.0008 * dist * dist;
            const pitch = -Math.atan2(dy + gravityComp, groundDist);

            // Cập nhật hướng nhìn lập tức (force=true)
            bot.look(yaw, pitch, true);

            await sleep(20); // Cập nhật cực nhanh dể bám đuổi
        }

        bot.deactivateItem(); // Bắn hoặc Ném!
        await sleep(100);     // Đợi một chút dể item thực sự được phóng đi
    } catch (err) {
        logThink(`Lỗi khi tấn công tầm xa: ${err.message}`);
    }
}

async function autoEquipArmor() {
    const armorSlots = { head: ['helmet', 'cap'], torso: ['chestplate', 'tunic'], legs: ['leggings', 'pants'], feet: ['boots'] };
    const materials = ['netherite', 'diamond', 'iron', 'chainmail', 'gold', 'leather'];
    for (const slot of Object.keys(armorSlots)) {
        let bestArmor = null;
        for (const mat of materials) {
            for (const type of armorSlots[slot]) {
                const item = bot.inventory.items().find(i => i.name === `${mat}_${type}`);
                if (item) { bestArmor = item; break; }
            }
            if (bestArmor) break;
        }
        if (bestArmor) try { await bot.equip(bestArmor, slot); } catch (e) { }
    }
}

async function autoEat() {
    if (isAutoEating) return;
    isAutoEating = true;

    try {
        while (bot.food < 19 || bot.health < 20) {
            const food = bot.inventory.items().find(item => FOOD_NAMES.includes(item.name));
            if (!food) break;

            // Nếu thanh thức ăn đã đầy (20), chỉ ăn tiếp nếu đó là đồ ăn đặc biệt (như táo vàng để hồi máu/giáp ảo)
            // Nếu là đồ ăn thường thì dừng lại để tránh lỗi "Food is full"
            if (bot.food >= 20 && !food.name.includes('golden')) break;

            logThink(`Đang ưu tiên ăn ${food.name} để hồi phục... (HP: ${Math.round(bot.health)}, Food: ${bot.food})`);
            isEating = true;
            try {
                await bot.equip(food, 'hand');
                await bot.consume();
            } catch (err) {
                logThink(`Không thể ăn: ${err.message}`);
                break;
            } finally {
                isEating = false;
            }
            await new Promise(r => setTimeout(r, 500));
        }
    } finally {
        isAutoEating = false;
    }
}

async function spamSneak(count = 3) {
    if (isEating || isAutoEating) return;
    for (let i = 0; i < count; i++) {
        bot.setControlState('sneak', true);
        await new Promise(r => setTimeout(r, 120));
        bot.setControlState('sneak', false);
        await new Promise(r => setTimeout(r, 120));
    }
}

const playerSneakData = new Map(); // username -> { count: number, lastTime: number, lastState: boolean }

bot.on('entityUpdate', async (entity) => {
    if (entity.type !== 'player' || entity.username === bot.username) return;
    if (entity.position.distanceTo(bot.entity.position) > 8) return;

    const metadata = entity.metadata;
    if (!metadata || metadata[0] === undefined) return;

    const isCurrentlySneaking = Boolean(metadata[0] & 0x02);
    let data = playerSneakData.get(entity.username) || { count: 0, lastTime: 0, lastState: false };

    // Phát hiện thay đổi trạng thái từ không ngồi -> ngồi
    if (isCurrentlySneaking && !data.lastState) {
        const now = Date.now();
        if (now - data.lastTime < 1000) {
            data.count++;
        } else {
            data.count = 1;
        }
        data.lastTime = now;

        if (data.count >= 2) {
            await sleep(1000);
            logThink(`Bắt chước ${entity.username} chào hỏi!`);
            await spamSneak();
            data.count = 0; // Reset sau khi đã phản hồi
        }
    }

    data.lastState = isCurrentlySneaking;
    playerSneakData.set(entity.username, data);
});

bot.on('health', () => {
    autoEat();
});

async function runIdleBehavior() {
    if (!isIdleEnabled) return;
    // Không làm gì nếu đang bận việc chính hoặc đang farm/guard/protect
    if (followTarget || isDigging || isAttacking || targetPickupItem || bot.pathfinder.isMoving() || isFarming || isGuardMode || isBodyguardMode) return;

    const now = Date.now();
    if (now - lastIdleActionTime < idleInterval) return;

    // Ngẫu nhiên hóa khoảng thời gian chờ tiếp theo (từ 5 giây đến 12 giây)
    idleInterval = 5000 + Math.random() * 7000;
    lastIdleActionTime = now;
    const r = Math.random();

    try {
        if (r < 0.3) { // Đi dạo loanh quanh
            const x = (Math.random() - 0.5) * 15;
            const z = (Math.random() - 0.5) * 15;
            const targetPos = bot.entity.position.offset(x, 0, z);
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2));
        } else if (r < 0.6) { // Nhìn vào người chơi gần nhất hoặc nhìn xung quanh
            const player = bot.nearestEntity(e => isPlayerEntity(e));
            if (player && player.position.distanceTo(bot.entity.position) < 8) {
                await bot.lookAt(player.position.offset(0, player.height || 1.6, 0));
            } else {
                const yaw = Math.random() * Math.PI * 2;
                const pitch = (Math.random() - 0.5) * Math.PI;
                await bot.look(yaw, pitch);
            }
        } else if (r < 0.75) { // Xoay người một chút
            for (let i = 0; i < 6; i++) {
                await bot.look(bot.entity.yaw + Math.PI / 3, bot.entity.pitch);
                await sleep(60);
            }
        } else if (r < 0.9) { // Nhảy nhẹ một cái
            bot.setControlState('jump', true);
            await sleep(200);
            bot.setControlState('jump', false);
        } else { // Cúi chào nhẹ
            await spamSneak(2);
        }
    } catch (err) { }
}

async function startDiggingLoop() {
    const failedBlocks = new Set();
    while (isDigging && targetBlockName) {
        // Kiểm tra sức khỏe trước khi làm việc
        if (bot.health < 15 || bot.food < 10) {
            await autoEat();
        }

        const blockType = bot.registry.blocksByName[targetBlockName];
        if (!blockType) { isDigging = false; break; }

        const candidates = bot.findBlocks({ matching: blockType.id, maxDistance: 32, count: 10 });
        const validPositions = candidates.filter(p => !failedBlocks.has(p.toString()));

        if (validPositions.length === 0) { isDigging = false; break; }

        const targetPos = validPositions.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b))[0];
        const block = bot.blockAt(targetPos);

        try {
            if (!isDigging) break;
            if (!bot.canDigBlock(block)) {
                const move = configureMovements(bot);
                bot.pathfinder.setMovements(move);
                try {
                    await bot.pathfinder.goto(new goals.GoalGetToBlock(targetPos.x, targetPos.y, targetPos.z));
                } catch (e) {
                    failedBlocks.add(targetPos.toString());
                    continue;
                }
            }
            if (bot.canDigBlock(block)) {
                await equipForAction(block, 'dig');
                await bot.dig(block);
            } else {
                failedBlocks.add(targetPos.toString());
                continue;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
            if (err.message.includes('Digging aborted')) continue;
            if (!isDigging) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function startAttackLoop() {
    while (isAttacking && targetMobName) {
        // Ưu tiên ăn hồi máu trước khi săn
        if (bot.health < 16 || bot.food < 12) {
            await autoEat();
        }

        if (!targetEntity || !targetEntity.isValid) {
            // Tìm mục tiêu tiếp theo có cùng tên (Tăng phạm vi lên 32 dể săn Phantom)
            const filter = e => (e.name === targetMobName || (e.username && e.username === targetMobName)) &&
                e.position.distanceTo(bot.entity.position) < 32 && e.isValid;
            const entity = bot.nearestEntity(filter);

            if (entity) {
                targetEntity = entity;
                // Nếu là lệnh attack tay thì mới chat, còn tự động thì thôi cho đỡ spam
                if (!isGuardMode && !isBodyguardMode) bot.chat(`Săn tiếp ${targetMobName}!`);
            } else {
                targetEntity = null;
                bot.pathfinder.setGoal(null);

                // Nếu đang trong chế độ Vệ sĩ hoặc Canh gác, ta thoát loop để physicTick lo phần di chuyển
                if (isGuardMode || isBodyguardMode) {
                    isAttacking = false;
                    return;
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
        }

        // Né Creeper khi nó sắp nổ
        if (targetEntity.name === 'creeper') {
            const metadata = targetEntity.metadata;
            // Ở phiên bản mới, nổ thường nằm ở index 16 (0: bình thường, 1: đang nổ, -1: dừng nổ)
            const ignited = metadata ? metadata[16] : 0;
            if (ignited === 1 || ignited === true) {
                logThink("Creeper sắp nổ! Chạy ngay đi!");
                bot.setControlState('back', true);
                bot.setControlState('jump', true);
                bot.setControlState('sprint', true); // Chạy nhanh đi
                await sleep(1200); // Tăng thời gian chạy thoát lên 1.2 giây
                bot.setControlState('back', false);
                bot.setControlState('jump', false);
                bot.setControlState('sprint', false);
                continue;
            }
        }

        const dist = bot.entity.position.distanceTo(targetEntity.position);

        const bow = bot.inventory.items().find(i => i.name === 'bow');
        const arrows = bot.inventory.items().find(i => i.name.includes('arrow'));
        const trident = bot.inventory.items().find(i => i.name === 'trident');

        if (dist > 4 && dist < 25 && (trident || (bow && arrows))) {
            // Tầm xa + Có vũ khí tầm xa -> Tấn công tầm xa
            bot.pathfinder.setGoal(null); // Dừng lại để ngắm cho chuẩn
            await performRangedAttack(targetEntity);
        } else if (dist > 3.5) {
            // Tầm xa nhưng ko có vũ khí thích hợp -> Tiếp cận
            bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true);
        } else {
            // Tầm gần -> Cận chiến
            bot.lookAt(targetEntity.position.offset(0, targetEntity.height, 0));
            await equipForAction(targetEntity, 'attack');
            bot.attack(targetEntity);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

// --- BOT ACTIONS (THUẦN LỆNH) ---
const botActions = {
    followPlayer: (args = {}) => {
        resetStates();
        const targetInfo = findPlayerSmart(args.username);
        if (targetInfo?.entity) {
            followTarget = targetInfo.entity;
            return `Đang đi theo ${targetInfo.name} nè!`;
        }
        const pos = bot.entity.position;
        const botPos = `X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}, Z: ${Math.round(pos.z)}`;
        if (targetInfo?.isFar) {
            return `Tui thấy ${targetInfo.name} đang online nhưng bạn ở xa quá (ngoài tầm nhìn)! Tui đang ở tọa độ: ${botPos}. Bạn hãy lại gần tui nha!`;
        }
        return `Tui hổng thấy bạn ở đâu quanh đây cả! Tui đang đứng tại tọa độ: ${botPos}. Hãy lại gần tui nhé!`;
    },
    stopAction: () => {
        resetStates();
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        return "Đã dừng mọi việc rồi nha.";
    },
    gotoLocation: async (args) => {
        resetStates();
        try {
            const { x, y, z } = args;
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            await bot.pathfinder.goto(new goals.GoalBlock(x, y, z));
            return `Đã đến tọa độ ${x} ${y} ${z}!`;
        } catch (err) {
            return `Hổng đến đó được: ${err.message}`;
        }
    },
    digBlock: async (args) => {
        const { blockName } = args;
        if (isDigging && targetBlockName === blockName) return `Tui vẫn đang hì hục đào ${blockName} mà!`;
        resetStates();
        isDigging = true;
        targetBlockName = blockName;
        startDiggingLoop();
        return `Ok, để tui đi xử đẹp mấy khối ${blockName} cho!`;
    },
    attackEntity: async (args) => {
        const { entityName } = args;
        resetStates();
        targetMobName = entityName;
        isAttacking = true;
        startAttackLoop();
        return `Xung phong! Săn ${entityName}!`;
    },
    guardArea: () => {
        resetStates();
        isGuardMode = true;
        guardPos = bot.entity.position.clone();
        return `Nhận lệnh! Đang gác tại tọa độ ${Math.round(guardPos.x)}, ${Math.round(guardPos.y)}, ${Math.round(guardPos.z)}`;
    },
    startFarming: () => {
        resetStates();
        isFarming = true;
        startFarmingLoop();
        return "Bắt đầu làm ruộng thôi nào! Tui sẽ gặt và trồng lại cây cho.";
    },
    protectPlayer: (args = {}) => {
        resetStates();
        const targetInfo = findPlayerSmart(args.username);
        if (targetInfo?.entity) {
            followTarget = targetInfo.entity;
            isBodyguardMode = true;
            return `Ok! Tui sẽ đi theo và bảo vệ ${targetInfo.name} hết mình!`;
        }
        const pos = bot.entity.position;
        const botPos = `X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}, Z: ${Math.round(pos.z)}`;
        if (targetInfo?.isFar) {
            return `Tui thấy ${targetInfo.name} đang online nhưng bạn ở xa quá! Tui đang ở tọa độ: ${botPos}. Hãy lại gần tui để tui bảo vệ nha!`;
        }
        return `Tui không thấy bạn đâu để bảo vệ hết! Tui đang ở tọa độ: ${botPos}.`;
    },
    storeItems: async () => {
        return await storeItems();
    },
    autoEquipArmor: async () => {
        await autoEquipArmor();
        return "Đã kiểm tra và mặc bộ giáp tốt nhất có thể!";
    },
    eatFood: async () => {
        await autoEat();
        return `Đã ăn xong, hiện tại HP: ${Math.round(bot.health)}, Food: ${Math.round(bot.food)}`;
    },
    setIdleMode: (args) => {
        isIdleEnabled = args.enabled;
        return `Đã ${args.enabled ? 'bật' : 'tắt'} chế độ tự chơi (Idle Mode).`;
    },
    dropItem: async (args) => {
        const { itemName, count = 1 } = args;
        const item = bot.inventory.items().find(i => i.name === itemName);
        if (!item) return `Tui làm gì có ${itemName} mà vứt.`;
        try {
            await bot.toss(item.type, null, count);
            return `Đã vứt ${count} cái ${itemName} ra đất.`;
        } catch (err) {
            return `Lỗi vứt đồ: ${err.message}`;
        }
    },
    checkStatus: () => {
        return `HP: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20 | Vị trí: X: ${Math.round(bot.entity.position.x)}, Y: ${Math.round(bot.entity.position.y)}, Z: ${Math.round(bot.entity.position.z)}`;
    }
};

// --- HƯỚNG DẪN LỆNH ---
async function showHelp() {
    const helpMsg = `📖 Danh Sách Lệnh (Thuần Lệnh 0ms):
- follow [tên]: Đi theo bạn
- stop: Dừng mọi hành động
- goto [x] [y] [z]: Đi tới tọa độ
- dig [tên_khối]: Đào khối liên tục
- attack [tên_quái]: Săn/Đánh quái vật
- guard: Canh gác tại chỗ
- farm: Làm ruộng tự động
- protect [tên]: Vệ sĩ bảo vệ bạn
- store: Cất đồ vào rương
- armor: Mặc bộ giáp tốt nhất
- drop [item] [số_lượng]: Vứt đồ
- dropall: Xả sạch túi đồ
- eat: Ăn đồ ăn hồi máu/đói
- status: Xem máu, đói & tọa độ
- scan: Quét thực thể quanh bot
- idle [on/off]: Bật/tắt tự do
- help: Hiện bảng này`;
    await safeChat(helpMsg);
}

// --- XỬ LÝ LỆNH TRỰC TIẾP ---
function handleManualCommand(username, message) {
    const args = message.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    switch (command) {
        case 'follow':
            safeChat(botActions.followPlayer({ username: args[1] || username }));
            break;
        case 'stop':
            safeChat(botActions.stopAction());
            break;
        case 'goto':
            if (args.length < 4) return;
            botActions.gotoLocation({ x: parseFloat(args[1]), y: parseFloat(args[2]), z: parseFloat(args[3]) }).then(res => safeChat(res));
            break;
        case 'dig':
            if (args.length < 2) return;
            botActions.digBlock({ blockName: args[1] }).then(res => safeChat(res));
            break;
        case 'attack':
            if (args.length < 2) return;
            botActions.attackEntity({ entityName: args[1] }).then(res => safeChat(res));
            break;
        case 'guard':
            safeChat(botActions.guardArea());
            break;
        case 'farm':
            safeChat(botActions.startFarming());
            break;
        case 'protect':
            safeChat(botActions.protectPlayer({ username: args[1] || username }));
            break;
        case 'store':
            botActions.storeItems().then(res => safeChat(res));
            break;
        case 'armor':
            botActions.autoEquipArmor().then(res => safeChat(res));
            break;
        case 'status':
            safeChat(botActions.checkStatus());
            break;
        case 'help':
            showHelp();
            break;
        case 'drop':
            if (args.length < 2) return;
            botActions.dropItem({ itemName: args[1], count: parseInt(args[2]) || 1 }).then(res => safeChat(res));
            break;
        case 'dropall':
            bot.chat('Đang xả hết đồ...');
            (async () => {
                for (const i of bot.inventory.items()) {
                    try { await bot.tossStack(i); await sleep(200); } catch (e) { }
                }
                bot.chat('Đã xả xong!');
            })();
            break;
        case 'scan':
            const nearby = Object.values(bot.entities)
                .filter(e => e && e !== bot.entity && e.position.distanceTo(bot.entity.position) < 10)
                .map(e => `[${e.type}] ${e.username || e.name}`)
                .join(', ');
            safeChat(nearby ? `Quanh bot có: ${nearby}` : 'Không thấy thực thể nào quanh đây.');
            break;
        case 'eat':
            botActions.eatFood().then(res => safeChat(res));
            break;
        case 'idle':
            if (args[1] === 'on') {
                safeChat(botActions.setIdleMode({ enabled: true }));
            } else if (args[1] === 'off') {
                safeChat(botActions.setIdleMode({ enabled: false }));
            } else {
                safeChat(`Chế độ tự chơi đang: ${isIdleEnabled ? 'BẬT' : 'TẮT'}. Gõ "idle on" hoặc "idle off" để đổi.`);
            }
            break;
        case 'sleep':
            const bed = bot.findBlock({
                matching: block => bot.isABed(block),
                maxDistance: 5
            });
            if (bed) {
                bot.sleep(bed).then(() => safeChat('Khò khò... ngủ ngon nhé!')).catch(err => safeChat(`Tui không ngủ được: ${err.message}`));
            } else {
                safeChat('Tui không tìm thấy cái giường nào quanh đây hết!');
            }
            break;
        case 'wake':
            bot.wake().then(() => safeChat('Chào buổi sáng!')).catch(err => safeChat(`Không dậy được: ${err.message}`));
            break;
    }
}

// --- EVENTS ---

bot.on('physicTick', () => {
    if (isDigging || isAttacking) return;
    autoOpenDoors();
    runIdleBehavior();
    runGuardLogic();

    if (followTarget) {
        if (!followTarget.isValid) {
            const reFound = findPlayerSmart(followTarget.username);
            if (reFound?.entity) followTarget = reFound.entity;
            else return;
        }
        const p = followTarget.position;
        const b = bot.entity.position;
        const dist = b.distanceTo(p);

        if (dist < 2.5) {
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
        } else if (dist > 3.5 && !bot.pathfinder.isMoving()) {
            const defaultMove = configureMovements(bot);
            bot.pathfinder.setMovements(defaultMove);
            bot.pathfinder.setGoal(new goals.GoalFollow(followTarget, 2), true);
        }
        bot.lookAt(p.offset(0, followTarget.height || 1.6, 0));
    } else {
        const itemFilter = e => (e.name === 'item' || e.type === 'object') && e.position.distanceTo(bot.entity.position) < 10;
        const itemInterest = bot.nearestEntity(itemFilter);

        if (itemInterest) {
            if (targetPickupItem && targetPickupItem.id === itemInterest.id) {
                if (bot.pathfinder.isMoving()) return;
                if (Date.now() - lastPickupTime < 2000) return;
            }
            targetPickupItem = itemInterest;
            lastPickupTime = Date.now();
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            bot.pathfinder.setGoal(new goals.GoalFollow(itemInterest, 1), true);
        } else {
            targetPickupItem = null;
        }
    }
});

bot.on('chat', (username, message) => {
    if (!username) return;
    const lowerUser = username.toLowerCase();
    if (lowerUser === bot.username.toLowerCase() || lowerUser === BOT_USERNAME.toLowerCase() || lowerUser === 'server' || lowerUser === 'system') return;
    if (/XYZ:\s*-?\d+/i.test(message) || /☀|☁|🌧/.test(message)) return;

    handleManualCommand(username, message);
});

bot.on('error', (err) => console.log('⚠️ Lỗi:', err));
bot.on('kicked', (reason) => console.log('❌ Bị kick:', reason));

// --- NHẬN LỆNH TRỰC TIẾP TỪ TERMINAL (CLI) ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', (line) => {
    const input = line.trim();
    if (!input) return;

    // 1. Chat tin nhắn vào server: "say <nội dung>" hoặc "chat <nội dung>"
    if (input.startsWith('say ') || input.startsWith('chat ')) {
        const text = input.substring(input.indexOf(' ') + 1);
        bot.chat(text);
        console.log(`\x1b[32m[Terminal Chat]\x1b[0m ${text}`);
        return;
    }

    // 2. Gửi lệnh server Minecraft (bắt đầu bằng /): /tp, /spawn, /home, /tpa...
    if (input.startsWith('/')) {
        bot.chat(input);
        console.log(`\x1b[32m[Terminal Server Cmd]\x1b[0m ${input}`);
        return;
    }

    // 3. Thực thi lệnh điều khiển bot trực tiếp (farm, guard, dig, stop, status, goto, armor, store...)
    console.log(`\x1b[32m[Terminal Lệnh Bot]\x1b[0m ${input}`);
    handleManualCommand('Terminal', input);
});
