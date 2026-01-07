require('dotenv').config()
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * CẤU HÌNH TRỰC TIẾP TỪ FILE .env
 */
const BOT_USERNAME = process.env.BOT_USERNAME || 'MC_Bot_Combined';
const BOT_PASSWORD = process.env.BOT_PASSWORD || 'password123';
const BOT_HOST = process.env.BOT_HOST || 'localhost';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- CẤU HÌNH AI ---
let genAI = null;
let model = null;
let isAIEnabled = false;

if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        isAIEnabled = true;
    } catch (e) {
        console.error("Lỗi khởi tạo Gemini AI:", e.message);
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- TRẠNG THÁI CỦA BOT ---
let followTarget = null;
let isDigging = false;
let isAttacking = false;
let targetBlockName = null;
let targetEntity = null;
let targetMobName = null;
let targetPickupItem = null;
let isEating = false;
let isAutoEating = false;

let isIdleEnabled = true;
let lastIdleActionTime = Date.now();
let idleInterval = 7000;

let isGuardMode = false;
let guardPos = null;
let isFarming = false;
let isBodyguardMode = false;
let isAIInError = false; // Theo dõi trạng thái lỗi AI

let lastDoorOpenTime = 0;
let lastPickupTime = 0;

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

// --- AI TOOLS DEFINITION ---
const tools = [
    {
        functionDeclarations: [
            {
                name: "followPlayer",
                description: "Đi theo người chơi cụ thể. Dừng mọi chế độ tự động.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        username: { type: "STRING", description: "Tên người chơi." }
                    },
                    required: ["username"]
                }
            },
            {
                name: "stopAction",
                description: "Dừng mọi hành động (đi theo, đào, đánh, gác, farm).",
            },
            {
                name: "gotoLocation",
                description: "Di chuyển đến tọa độ X Y Z.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        x: { type: "NUMBER" },
                        y: { type: "NUMBER" },
                        z: { type: "NUMBER" }
                    },
                    required: ["x", "y", "z"]
                }
            },
            {
                name: "digBlock",
                description: "Tìm và đào một loại khối cụ thể liên tục.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        blockName: { type: "STRING", description: "Tên kỹ thuật của khối (ví dụ: 'oak_log')." }
                    },
                    required: ["blockName"]
                }
            },
            {
                name: "attackEntity",
                description: "Săn một loại mob hoặc người chơi cụ thể.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        entityName: { type: "STRING", description: "Tên mob (zombie, cow) hoặc username." }
                    },
                    required: ["entityName"]
                }
            },
            {
                name: "guardArea",
                description: "Đứng gác tại vị trí hiện tại và bảo vệ khu vực khỏi quái vật.",
            },
            {
                name: "startFarming",
                description: "Bắt đầu chế độ làm ruộng tự động (gặt và trồng cây).",
            },
            {
                name: "protectPlayer",
                description: "Trở thành vệ sĩ đi theo và bảo vệ một người chơi khỏi quái vật.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        username: { type: "STRING", description: "Tên người chơi cần bảo vệ." }
                    },
                    required: ["username"]
                }
            },
            {
                name: "storeItems",
                description: "Cất đồ đạc không cần thiết vào rương gần nhất.",
            },
            {
                name: "autoEquipArmor",
                description: "Tự tìm và mặc bộ giáp tốt nhất trong túi đồ.",
            },
            {
                name: "eatFood",
                description: "Tự động ăn thức ăn để hồi máu và độ đói.",
            },
            {
                name: "setIdleMode",
                description: "Bật hoặc tắt chế độ tự do (đi dạo, nhảy nhót khi rảnh).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        enabled: { type: "BOOLEAN" }
                    },
                    required: ["enabled"]
                }
            },
            {
                name: "dropItem",
                description: "Vứt đồ cho người chơi.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        itemName: { type: "STRING" },
                        count: { type: "NUMBER" }
                    },
                    required: ["itemName"]
                }
            },
            {
                name: "checkStatus",
                description: "Kiểm tra tình trạng bot (HP, Food, Pos).",
            }
        ]
    }
];

if (isAIEnabled) {
    model = genAI.getGenerativeModel({
        model: "gemini-flash-latest",
        systemInstruction: "Bạn là Local_Bot, một bot Minecraft thông minh. Bạn có thể thực hiện các hành động như đi theo người chơi, dừng lại, đi đến tọa độ, hoặc đào khối. Khi người chơi yêu cầu làm gì đó, hãy sử dụng công cụ tương ứng. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.",
        tools: tools
    });
}

const bot = mineflayer.createBot({
    host: BOT_HOST,
    username: BOT_USERNAME,
    version: false
})

bot.loadPlugin(pathfinder)

async function safeChat(message) {
    if (!message) return;
    // Đảm bảo message là chuỗi để tránh crash nếu nhận vào Promise hoặc đối tượng khác
    if (typeof message !== 'string') {
        if (message instanceof Promise) {
            message = await message;
        } else {
            message = String(message);
        }
    }
    const lines = message.split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
        bot.chat(line);
        await sleep(1000); // Khoảng chờ 1 giây giữa mỗi dòng
    }
}

// --- HELPER LOGGING ---
function logThink(msg) {
    console.log(`\x1b[36m[Bot]\x1b[0m ${msg}`);
}

// --- CONFIG ACTIONS ---
function configureMovements(bot) {
    const move = new Movements(bot);
    move.canEntityStandOn = false;
    move.allow1by1towers = true;
    move.allowParkour = true;
    move.allowSprinting = true;
    move.canOpenDoors = true;
    move.canOpenFenceGates = true;
    move.digCost = 10;
    move.placeCost = 1;

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

// --- LOGIC FUNCTIONS ---

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
    } else if (isGuardMode && guardPos) {
        if (bot.entity.position.distanceTo(guardPos) > 3 && !bot.pathfinder.isMoving()) {
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
                // wheat, carrots, potatoes: 7 | beetroots, nether_wart: 3
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
                    await sleep(800); // Đợi 1 chút để bot tự động nhặt hạt rơi ra đất

                    const seedName = SEED_TYPES[block.name];
                    const seed = bot.inventory.items().find(item => item.name === seedName);
                    if (seed) {
                        const dirt = bot.blockAt(target.pos); // Ở đây block chính là farmland vì cây đã bị đào mút rồi
                        // Nhưng cẩn thận: khi đào wheat, block tại pos đó trở thành air
                        // Ta cần đặt lên block farmland bên dưới
                        const farmland = bot.blockAt(target.pos.offset(0, -1, 0));
                        if (farmland && farmland.name === 'farmland') {
                            await bot.equip(seed, 'hand');
                            await bot.placeBlock(farmland, { x: 0, y: 1, z: 0 });
                            logThink(`Đã trồng lại ${seedName}.`);
                        }
                    }
                } else {
                    // Planting on empty farmland
                    const seed = bot.inventory.items().find(item => Object.values(SEED_TYPES).includes(item.name));
                    if (seed) {
                        logThink(`Phát hiện đất trống, đang đi trồng ${seed.name}...`);
                        await bot.pathfinder.goto(new goals.GoalGetToBlock(target.pos.x, target.pos.y, target.pos.z));
                        await bot.equip(seed, 'hand');
                        await bot.placeBlock(block, { x: 0, y: 1, z: 0 });
                        logThink(`Đã trồng ${seed.name} vào ô đất trống.`);
                    } else {
                        // Không có hạt giống, tìm việc khác hoặc đợi
                        await sleep(2000);
                    }
                }
            } catch (err) {
                // Lỗi di chuyển hoặc đào, bỏ qua tìm ô khác
            }
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

async function autoEat() {
    if (isAutoEating) return;
    isAutoEating = true;
    try {
        while (bot.food < 19 || bot.health < 20) {
            const food = bot.inventory.items().find(item => FOOD_NAMES.includes(item.name));
            if (!food) break;
            if (bot.food >= 20 && !food.name.includes('golden')) break;
            isEating = true;
            try {
                await bot.equip(food, 'hand');
                await bot.consume();
            } catch (err) { break; } finally { isEating = false; }
            await sleep(500);
        }
    } finally { isAutoEating = false; }
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
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        bot.activateItem();

        const startTime = Date.now();
        const chargeTime = item.name === 'bow' ? 1200 : 1100;

        while (Date.now() - startTime < chargeTime) {
            if (!target.isValid) break;
            const targetPos = target.position.offset(0, target.height * 0.8, 0);
            const botPos = bot.entity.position.offset(0, 1.6, 0);

            const dx = targetPos.x - botPos.x;
            const dy = targetPos.y - botPos.y;
            const dz = targetPos.z - botPos.z;
            const groundDist = Math.sqrt(dx * dx + dz * dz);

            const yaw = Math.atan2(-dx, -dz);
            const dist = bot.entity.position.distanceTo(target.position);
            const gravityComp = item.name === 'bow' ? 0.0015 * dist * dist : 0.0008 * dist * dist;
            const pitch = -Math.atan2(dy + gravityComp, groundDist);

            bot.look(yaw, pitch, true);
            await sleep(20);
        }

        bot.deactivateItem();
        await sleep(100);
    } catch (err) {
        logThink(`Lỗi khi tấn công tầm xa: ${err.message}`);
    }
}

async function startAttackLoop() {
    while (isAttacking && (targetEntity || targetMobName)) {
        if (bot.health < 16 || bot.food < 12) await autoEat();

        if (!targetEntity || !targetEntity.isValid) {
            const filter = e => (e.name === targetMobName || (e.username && e.username === targetMobName)) &&
                e.position.distanceTo(bot.entity.position) < 32 && e.isValid;
            const entity = bot.nearestEntity(filter);

            if (entity) {
                targetEntity = entity;
            } else {
                targetEntity = null;
                bot.pathfinder.setGoal(null);
                if (isGuardMode || isBodyguardMode) {
                    isAttacking = false;
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
        }

        // Né Creeper
        if (targetEntity.name === 'creeper') {
            const ignited = targetEntity.metadata ? targetEntity.metadata[16] : 0;
            if (ignited === 1 || ignited === true) {
                bot.setControlState('back', true);
                bot.setControlState('jump', true);
                bot.setControlState('sprint', true);
                await sleep(1200);
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
            await performRangedAttack(targetEntity);
        } else if (dist > 3.5) {
            bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true);
        } else {
            bot.lookAt(targetEntity.position.offset(0, targetEntity.height, 0));
            await equipForAction(targetEntity, 'attack');
            bot.attack(targetEntity);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function startDiggingLoop() {
    const failedBlocks = new Set();
    while (isDigging && targetBlockName) {
        if (bot.health < 15 || bot.food < 10) await autoEat();

        const blockType = bot.registry.blocksByName[targetBlockName];
        if (!blockType) { isDigging = false; break; }

        const candidates = bot.findBlocks({ matching: blockType.id, maxDistance: 32, count: 10 });
        const validPositions = candidates.filter(p => !failedBlocks.has(p.toString()));

        if (validPositions.length === 0) { isDigging = false; break; }

        const targetPos = validPositions.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b))[0];
        const block = bot.blockAt(targetPos);

        try {
            if (!isDigging) break;
            if (bot.entity.position.distanceTo(targetPos) > 4.5) {
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
            await sleep(500);
        } catch (err) {
            if (err.message.includes('Digging aborted')) continue;
            if (!isDigging) break;
            await sleep(1000);
        }
    }
}

async function spamSneak(count = 3) {
    if (isEating || isAutoEating) return;
    for (let i = 0; i < count; i++) {
        bot.setControlState('sneak', true);
        await sleep(120);
        bot.setControlState('sneak', false);
        await sleep(120);
    }
}

async function runIdleBehavior() {
    if (!isIdleEnabled || followTarget || isDigging || isAttacking || targetPickupItem || bot.pathfinder.isMoving() || isFarming || isGuardMode || isBodyguardMode) return;
    const now = Date.now();
    if (now - lastIdleActionTime < idleInterval) return;
    idleInterval = 5000 + Math.random() * 7000;
    lastIdleActionTime = now;
    const r = Math.random();
    try {
        if (r < 0.25) {
            const x = (Math.random() - 0.5) * 15, z = (Math.random() - 0.5) * 15;
            const targetPos = bot.entity.position.offset(x, 0, z);
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2));
        } else if (r < 0.45) {
            const player = bot.nearestEntity(e => e.type === 'player' && e.username !== bot.username);
            if (player && player.position.distanceTo(bot.entity.position) < 8) await bot.lookAt(player.position.offset(0, player.height, 0));
        } else if (r < 0.55) {
            bot.chat(IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]);
        } else if (r < 0.7) {
            for (let i = 0; i < 8; i++) { await bot.look(bot.entity.yaw + Math.PI / 4, bot.entity.pitch); await sleep(50); }
        } else if (r < 0.85) {
            bot.setControlState('jump', true); await sleep(200); bot.setControlState('jump', false);
        } else { await spamSneak(3); }
    } catch (err) { }
}

// --- BOT ACTIONS (UNIFIED) ---
const botActions = {
    followPlayer: (args) => {
        resetStates();
        const target = bot.players[args.username]?.entity;
        if (target) {
            followTarget = target;
            return `Đang đi theo ${args.username} nè!`;
        }
        return `Tui hổng thấy ${args.username} ở đâu cả.`;
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
            return `Hổng đến đó được ông ơi: ${err.message}`;
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
    protectPlayer: (args) => {
        resetStates();
        const target = bot.players[args.username]?.entity;
        if (target) {
            followTarget = target;
            isBodyguardMode = true;
            return `Ok! Tui sẽ đi theo và bảo vệ ${args.username} hết mình!`;
        }
        return `Tui không thấy ${args.username} đâu để bảo vệ hết.`;
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
        return "Đã ăn xong, hiện tại HP: " + Math.round(bot.health) + ", Food: " + bot.food;
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
        return `Sức khỏe: ${Math.round(bot.health)}/20 | Độ đói: ${Math.round(bot.food)}/20 | Vị trí: ${Math.round(bot.entity.position.x)} ${Math.round(bot.entity.position.y)} ${Math.round(bot.entity.position.z)}`;
    }
};

// --- MANUAL COMMAND HANDLER ---
async function showHelp() {
    const helpMsg = `📖 Manual Command Guide:
- follow: Follow player
- stop: Stop all actions
- goto [x] [y] [z]: Go to coordinates
- dig [block_name]: Dig blocks continuously
- attack [mob_name]: Hunt/Attack target
- guard: Guard current position
- farm: Start automated farming
- protect: Bodyguard mode
- store: Store items in chests
- armor: Auto-equip best armor
- status: Check HP/Food status
- scan: Scan for nearby mobs
- api: Reconnect AI service
- help: Show this guide`;
    await safeChat(helpMsg);
}

function handleManualCommand(username, message) {
    const args = message.split(' ');
    const command = args[0].toLowerCase();

    switch (command) {
        case 'follow':
            safeChat(botActions.followPlayer({ username }));
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
            safeChat(botActions.protectPlayer({ username }));
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
        case 'api':
            if (!GEMINI_API_KEY) {
                safeChat("❌ Bạn chưa cấu hình GEMINI_API_KEY trong file .env!");
                break;
            }
            safeChat("🔍 Đang kiểm tra lại kết nối AI...");
            (async () => {
                try {
                    const testChat = model.startChat();
                    await testChat.sendMessage("ping");
                    isAIInError = false;
                    isAIEnabled = true;
                    safeChat("✅ Kết nối AI đã sẵn sàng hoạt động trở lại!");
                } catch (e) {
                    safeChat(`❌ AI vẫn chưa sẵn sàng: ${e.message.includes('429') ? 'Vẫn đang bị giới hạn hạn mức (Quota).' : e.message}`);
                }
            })();
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
            const nearby = Object.values(bot.entities).filter(e => e.position.distanceTo(bot.entity.position) < 10).map(e => `[${e.type}] ${e.name}`).join(', ');
            safeChat(nearby || 'Không thấy gì.');
            break;
    }
}

// --- EVENTS ---

bot.on('spawn', () => {
    logThink('✅ Đã kết nối vào server!');
    setTimeout(() => {
        // Gửi lệnh một cách cẩn thận, có thể server không cần / nếu là server lậu cụ thể
        // Nhưng đa số là cần. Ta gửi cả hai để đảm bảo (mặc dù một cái sẽ lỗi)
        // Thử các biến thể lệnh login để tăng tỷ lệ thành công
        bot.chat(`/login ${BOT_PASSWORD}`);
        bot.chat(`/l ${BOT_PASSWORD}`); // Một số server dùng /l
        setTimeout(() => {
            bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
            bot.chat(`/reg ${BOT_PASSWORD} ${BOT_PASSWORD}`);
        }, 1500);
        logThink('🔑 Đã gửi lệnh đăng nhập/đăng ký.');
    }, 3000);
});

bot.on('messagestr', (message) => {
    console.log(`[Server] ${message}`);
    if (message.includes('/login') || message.includes('Dùng lệnh /login')) bot.chat(`/login ${BOT_PASSWORD}`);
    if (message.includes('/register') || message.includes('Dùng lệnh /register')) bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
});

bot.on('health', () => autoEat());

bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) {
        const attacker = Object.values(bot.entities).find(e => {
            if (!e || e.type !== 'mob') return false;
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

bot.on('physicTick', () => {
    if (isDigging || isAttacking) return;
    autoOpenDoors();
    runIdleBehavior();
    runGuardLogic();

    if (followTarget) {
        const p = followTarget.position;
        const b = bot.entity.position;
        const dist = b.distanceTo(p);

        if (dist < 2.5) {
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
        } else if (dist > 4 && !bot.pathfinder.isMoving()) {
            const defaultMove = configureMovements(bot);
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
        } else {
            targetPickupItem = null;
        }
    }
});

const chatHistory = [];

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (isAIEnabled) {
        try {
            const chat = model.startChat({ history: chatHistory });
            const prompt = `Người chơi ${username} nói: ${message}`;

            let result = await chat.sendMessage(prompt);
            let response = result.response;

            while (response.functionCalls()?.length > 0) {
                const toolResults = [];
                for (const call of response.functionCalls()) {
                    console.log(`[AI CALL]: ${call.name}`, call.args);
                    const action = botActions[call.name];
                    if (action) {
                        const resultText = await action(call.args);
                        toolResults.push({
                            functionResponse: {
                                name: call.name,
                                response: { content: resultText }
                            }
                        });
                    }
                }
                result = await chat.sendMessage(toolResults);
                response = result.response;
            }

            const reply = response.text().trim();
            if (reply) await safeChat(reply);

            chatHistory.push({ role: 'user', parts: [{ text: prompt }] });
            chatHistory.push({ role: 'model', parts: [{ text: reply }] });
            if (chatHistory.length > 20) chatHistory.splice(0, 2);
            isAIInError = false; // Reset trạng thái lỗi nếu AI chạy thành công
            return;
        } catch (error) {
            console.error("Lỗi AI, chuyển sang dùng lệnh thủ công:", error.message);
            if (!isAIInError) {
                isAIInError = true;
                safeChat("⚠️ AI đang bận hoặc hết hạn mức, mình chuyển sang chế độ thủ công nha! Gõ 'api' để thử kết nối lại.");
            }
        }
    }

    // Manual command handling (fallback hoặc nếu không có AI)
    handleManualCommand(username, message);
});

bot.on('error', (err) => console.log('⚠️ Lỗi:', err));
bot.on('kicked', (reason) => console.log('❌ Bị kick:', reason));
