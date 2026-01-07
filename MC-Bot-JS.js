require('dotenv').config()
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * CẤU HÌNH TRỰC TIẾP TỪ FILE .env
 */
const BOT_USERNAME = process.env.BOT_USERNAME || 'AFK_Bot';
const BOT_PASSWORD = process.env.BOT_PASSWORD || 'password123';
const BOT_HOST = process.env.BOT_HOST || 'localhost';

const bot = mineflayer.createBot({
    host: BOT_HOST,
    username: BOT_USERNAME,
    version: false
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

// --- AUTO LOGIN (QUAN TRỌNG CHO SERVER PUBLIC) ---
bot.on('spawn', () => {
    console.log('✅ Đã kết nối vào server!');

    // Tự động đăng nhập/đăng ký
    // Thử login trước, nếu chưa đăng ký thì đăng ký
    // Lưu ý: Logic này chỉ là ví dụ cơ bản, tùy server mà lệnh có thể khác (/login, /l, /reg)
    setTimeout(() => {
        bot.chat(`/login ${BOT_PASSWORD}`);
        bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
        console.log('🔑 Đã gửi lệnh đăng nhập/đăng ký.');
    }, 2000); // Đợi 2s sau khi vào để server tải tài nguyên
});

bot.on('messagestr', (message) => {
    // Tự động xử lý captcha nếu có (ví dụ: "Nhập mã 1234 để tiếp tục")
    // Phần này phức tạp, cần tùy chỉnh theo server
    console.log(`[Server] ${message}`);

    if (message.includes('/login') || message.includes('Dùng lệnh /login')) {
        bot.chat(`/login ${BOT_PASSWORD}`);
    }
    if (message.includes('/register') || message.includes('Dùng lệnh /register')) {
        bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
    }
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
        // 1. Tìm cây chín để gặt
        let target = bot.findBlock({
            matching: b => {
                if (!CROP_TYPES.includes(b.name)) return false;
                const age = b.metadata;
                return age >= 7 || (b.name === 'beetroots' && age >= 3) || (b.name === 'nether_wart' && age >= 3);
            },
            maxDistance: 16
        });

        if (target) {
            try {
                logThink(`Đang gặt ${target.name} tại ${target.position}...`);
                const move = configureMovements(bot);
                bot.pathfinder.setMovements(move);
                await bot.pathfinder.goto(new goals.GoalGetToBlock(target.position.x, target.position.y, target.position.z));

                await bot.dig(target);
                await sleep(500);

                // Trồng lại ngay
                const seedName = SEED_TYPES[target.name];
                const seed = bot.inventory.items().find(item => item.name === seedName);
                if (seed) {
                    const dirt = bot.blockAt(target.position.offset(0, -1, 0));
                    await bot.equip(seed, 'hand');
                    await bot.placeBlock(dirt, { x: 0, y: 1, z: 0 });
                }
            } catch (err) {
                logThink(`Lỗi khi gặt: ${err.message}`);
            }
        } else {
            // 2. Nếu không có cây chín, tìm đất trống để trồng
            const emptyFarmland = bot.findBlock({
                matching: b => {
                    if (!b || !b.position || b.name !== 'farmland') return false;
                    const blockAbove = bot.blockAt(b.position.offset(0, 1, 0));
                    return blockAbove && blockAbove.name === 'air';
                },
                maxDistance: 16
            });

            if (emptyFarmland) {
                // Tìm hạt giống bất kỳ trong túi
                const seed = bot.inventory.items().find(item => Object.values(SEED_TYPES).includes(item.name));
                if (seed) {
                    try {
                        logThink(`Đang trồng ${seed.name} vào đất trống tại ${emptyFarmland.position}...`);
                        const move = configureMovements(bot);
                        bot.pathfinder.setMovements(move);
                        await bot.pathfinder.goto(new goals.GoalGetToBlock(emptyFarmland.position.x, emptyFarmland.position.y, emptyFarmland.position.z));

                        await bot.equip(seed, 'hand');
                        await bot.placeBlock(emptyFarmland, { x: 0, y: 1, z: 0 });
                    } catch (err) {
                        logThink(`Lỗi khi trồng: ${err.message}`);
                    }
                } else {
                    logThink("Không có cây chín và cũng hết hạt giống để trồng rồi!");
                    await sleep(5000);
                }
            } else {
                logThink("Mọi thứ đã xong xuôi, đang chờ cây lớn...");
                await sleep(5000);
            }
        }
        await sleep(1000);
    }
}

async function storeItems() {
    const chestBlock = bot.findBlock({
        matching: b => b.name === 'chest' || b.name === 'trapped_chest' || b.name === 'barrel',
        maxDistance: 8
    });

    if (!chestBlock) {
        bot.chat("Tui không tìm thấy cái rương nào quanh đây hết!");
        return;
    }

    try {
        const move = configureMovements(bot);
        bot.pathfinder.setMovements(move);
        await bot.pathfinder.goto(new goals.GoalGetToBlock(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z));

        const chest = await bot.openChest(chestBlock);
        bot.chat("Đang cất đồ...");

        for (const item of bot.inventory.items()) {
            // Không cất thức ăn, vũ khí và công cụ quan trọng
            const isFood = FOOD_NAMES.includes(item.name);
            const isTool = item.name.includes('sword') || item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel');

            if (!isFood && !isTool) {
                try {
                    await chest.deposit(item.type, null, item.count);
                    await sleep(200);
                } catch (e) { }
            }
        }
        chest.close();
        bot.chat("Đã cất xong đồ đạc không cần thiết!");
    } catch (err) {
        bot.chat(`Không thể mở rương: ${err.message}`);
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
        if (r < 0.25) { // Đi dạo loanh quanh (tăng phạm vi lên 15)
            const x = (Math.random() - 0.5) * 15;
            const z = (Math.random() - 0.5) * 15;
            const targetPos = bot.entity.position.offset(x, 0, z);
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2));
            logThink("Đang đi dạo xa xa cho thoải mái...");
        } else if (r < 0.45) { // Nhìn vào người chơi gần nhất
            const playerFilter = e => e.type === 'player' && e.username !== bot.username;
            const player = bot.nearestEntity(playerFilter);
            if (player && player.position.distanceTo(bot.entity.position) < 8) {
                await bot.lookAt(player.position.offset(0, player.height, 0));
                logThink(`Nhìn xem ${player.username} đang làm gì...`);
            } else { // Nếu không có người thì nhìn xung quanh
                const yaw = Math.random() * Math.PI * 2;
                const pitch = (Math.random() - 0.5) * Math.PI;
                await bot.look(yaw, pitch);
            }
        } else if (r < 0.55) { // Nhắn tin bâng quơ
            const msg = IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)];
            bot.chat(msg);
        } else if (r < 0.7) { // Nháy mắt / Quay vòng vòng (Spin)
            logThink("Đang quẩy một tí!");
            for (let i = 0; i < 8; i++) {
                await bot.look(bot.entity.yaw + Math.PI / 4, bot.entity.pitch);
                await sleep(50);
            }
        } else if (r < 0.85) { // Nhảy lên
            bot.setControlState('jump', true);
            await sleep(200);
            bot.setControlState('jump', false);
        } else { // Spam ngồi
            await spamSneak(3);
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

// --- EVENTS ---

bot.on('physicTick', () => {
    if (isDigging || isAttacking) return;
    autoOpenDoors();
    runIdleBehavior(); // Chạy hành vi lúc rảnh rỗi
    runGuardLogic();   // Chạy chế độ canh gác

    if (followTarget) {
        const p = followTarget.position;
        const b = bot.entity.position;
        const dist = b.distanceTo(p);

        if (dist < 2.5) {
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
        } else if (dist > 4 && !bot.pathfinder.isMoving()) {
            const defaultMove = new Movements(bot);
            defaultMove.canEntityStandOn = false;
            bot.pathfinder.setMovements(defaultMove);
            bot.pathfinder.setGoal(new goals.GoalFollow(followTarget, 3), true);
        }
        bot.lookAt(p.offset(0, followTarget.height, 0));
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
            return;
        } else {
            targetPickupItem = null;
        }

        // Đã xóa phần tự động nhìn người chơi ở đây để tránh việc bot "chằm chằm" nhìn bạn khi đi dạo.
        // Logic nhìn người chơi đã được đưa vào runIdleBehavior với tỉ lệ ngẫu nhiên.
    }
});

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    try {
        const args = message.split(' ');
        const command = args[0].toLowerCase();

        if (['follow', 'stop', 'goto', 'dig', 'attack', 'guard', 'farm', 'protect'].includes(command)) {
            isDigging = false;
            isAttacking = false;
            isGuardMode = false;
            isFarming = false;
            isBodyguardMode = false;
            followTarget = null;
            targetBlockName = null;
            targetEntity = null;
            targetMobName = null;
            targetPickupItem = null;
        }

        switch (command) {
            case 'follow':
                const target = bot.players[username]?.entity;
                if (target) { followTarget = target; bot.chat('Ok!'); }
                break;
            case 'stop':
                bot.pathfinder.setGoal(null); bot.clearControlStates(); bot.chat('Đã dừng.');
                break;
            case 'goto':
                if (args.length < 4) return;
                const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
                bot.chat(`Đi tới ${x} ${y} ${z}`);
                const move = configureMovements(bot);
                bot.pathfinder.setMovements(move);
                bot.pathfinder.goto(new goals.GoalBlock(x, y, z)).catch(e => { });
                break;
            case 'dig':
                if (args.length < 2) return;
                targetBlockName = args[1]; isDigging = true; startDiggingLoop();
                bot.chat('Đào ' + targetBlockName);
                break;
            case 'attack':
                if (args.length < 2) return;
                targetMobName = args[1]; isAttacking = true; targetEntity = null; startAttackLoop();
                bot.chat('Săn ' + targetMobName);
                break;
            case 'guard':
                isGuardMode = true;
                guardPos = bot.entity.position.clone();
                bot.chat(`Đang gác tại tọa độ ${Math.round(guardPos.x)}, ${Math.round(guardPos.y)}, ${Math.round(guardPos.z)}`);
                break;
            case 'farm':
                isFarming = true;
                bot.chat('Bắt đầu làm ruộng thôi nào!');
                startFarmingLoop();
                break;
            case 'protect':
                const protectTarget = bot.players[username]?.entity;
                if (protectTarget) {
                    followTarget = protectTarget;
                    isBodyguardMode = true;
                    bot.chat('Tui sẽ bảo vệ bạn hết mình!');
                } else {
                    bot.chat('Tui không thấy bạn đâu hết!');
                }
                break;
            case 'store':
                await storeItems();
                break;
            case 'drop':
                if (args.length < 2) return;
                const itemName = args[1];
                const count = parseInt(args[2]) || 1;
                const itemToDrop = bot.inventory.items().find(i => i.name === itemName);
                if (itemToDrop) {
                    try {
                        await bot.toss(itemToDrop.type, null, count);
                        bot.chat(`Đã xả ${count} ${itemName}.`);
                    } catch (err) {
                        bot.chat(`Không thể xả đồ: ${err.message}`);
                    }
                } else {
                    bot.chat(`Tui không tìm thấy ${itemName} trong túi đồ!`);
                }
                break;
            case 'armor':
                await autoEquipArmor(); bot.chat('Đã mặc giáp.');
                break;
            case 'dropall':
                bot.chat('Đang xả hết đồ...');
                for (const i of bot.inventory.items()) {
                    try {
                        await bot.tossStack(i);
                        await sleep(200);
                    } catch (e) { }
                }
                bot.chat('Đã xả xong!');
                break;
            case 'scan':
                const nearby = Object.values(bot.entities).filter(e => e.position.distanceTo(bot.entity.position) < 10).map(e => `[${e.type}] ${e.name}`).join(', ');
                bot.chat(nearby || 'Không thấy gì.');
                break;
            case 'status':
                bot.chat(`HP: ${Math.round(bot.health)} | Food: ${Math.round(bot.food)}`);
                break;
            case 'sleep':
                const bed = bot.findBlock({
                    matching: block => bot.isABed(block),
                    maxDistance: 5
                });
                if (bed) {
                    try {
                        await bot.sleep(bed);
                        bot.chat('Khò khò... ngủ ngon nhé!');
                    } catch (err) {
                        bot.chat(`Tui không ngủ được: ${err.message}`);
                    }
                } else {
                    bot.chat('Tui không tìm thấy cái giường nào quanh đây hết!');
                }
                break;
            case 'wake':
                try {
                    await bot.wake();
                    bot.chat('Chào buổi sáng!');
                } catch (err) {
                    bot.chat(`Không dậy được: ${err.message}`);
                }
                break;
            case 'idle':
                if (args[1] === 'on') {
                    isIdleEnabled = true;
                    bot.chat('Đã bật chế độ tự chơi (Idle Mode).');
                } else if (args[1] === 'off') {
                    isIdleEnabled = false;
                    bot.chat('Đã tắt chế độ tự chơi.');
                } else {
                    bot.chat(`Chế độ tự chơi đang: ${isIdleEnabled ? 'BẬT' : 'TẮT'}. Gõ "idle on/off" để thay đổi.`);
                }
                break;
            case 'eat':
                await autoEat();
                if (!isEating && bot.food >= 20 && bot.health >= 20) bot.chat('Tui no rồi, máu cũng đầy nữa!');
                else if (!isEating) bot.chat('Tui không có đồ ăn phù hợp trong túi!');
                break;
        }
    } catch (err) {
        console.log('⚠️ Lỗi lệnh chat:', err);
    }
});

bot.on('error', (err) => console.log('⚠️ Lỗi:', err));
bot.on('kicked', (reason) => console.log('❌ Bị kick:', reason));
// Tự động đánh trả khi bị tấn công
bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) {
        const attacker = Object.values(bot.entities).find(e => {
            if (!e || e.type !== 'mob') return false; // Chỉ đánh trả quái vật, không đánh người chơi
            return e.position.distanceTo(bot.entity.position) < 5;
        });

        if (attacker && !isAttacking) {
            logThink(`Bị ${attacker.name} tấn công! Đang phản công...`);
            targetMobName = attacker.name;
            targetEntity = attacker;
            isAttacking = true;
            startAttackLoop();
        }
    }
});
