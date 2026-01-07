require('dotenv').config()
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- CẤU HÌNH AI & TOOLS ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- CẤU HÌNH SERVER ---
const BOT_PASSWORD = process.env.BOT_PASSWORD;
const BOT_USERNAME = process.env.BOT_USERNAME || 'AFK_2';
const BOT_HOST = process.env.BOT_HOST || 'sv.lelam.net';

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

const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  systemInstruction: "Bạn là Local_Bot, một bot Minecraft thông minh. Bạn có thể thực hiện các hành động như đi theo người chơi, dừng lại, đi đến tọa độ, hoặc đào khối. Khi người chơi yêu cầu làm gì đó, hãy sử dụng công cụ tương ứng. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.",
  tools: tools
});


const bot = mineflayer.createBot({
  host: BOT_HOST,
  username: BOT_USERNAME,
  version: false
})

bot.loadPlugin(pathfinder)

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

let lastDoorOpenTime = 0;
let lastPickupTime = 0;

function logThink(msg) {
  console.log(`\x1b[36m[Bot]\x1b[0m ${msg}`);
}

function configureMovements(bot) {
  const move = new Movements(bot);
  move.canEntityStandOn = false;
  move.allow1by1towers = true;
  move.allowParkour = true;
  move.allowSprinting = true;
  move.canOpenDoors = true;
  move.canOpenFenceGates = true;
  return move;
}

// --- HÀM HỖ TRỢ ĐÀO LIÊN TỤC ---
async function startDiggingLoop() {
  while (isDigging && targetBlockName) {
    const blockType = bot.registry.blocksByName[targetBlockName];
    if (!blockType) {
      bot.chat(`Tui hổng biết khối ${targetBlockName} là gì hết.`);
      isDigging = false;
      break;
    }

    const block = bot.findBlock({
      matching: blockType.id,
      maxDistance: 32
    });

    if (!block) {
      bot.chat(`Hết khối ${targetBlockName} quanh đây rồi ông ơi! Tui nghỉ nha.`);
      isDigging = false;
      break;
    }

    try {
      if (!isDigging) break; // Check lại xem có bị stop khi đang đi chuyển không

      // Nếu block ở xa thì đến gần, gần rồi thì ko cần pathfinder setGoal nữa để tránh ngắt quãng
      if (bot.entity.position.distanceTo(block.position) > 4.5) {
        await bot.pathfinder.goto(new goals.GoalLookAtBlock(block.position, bot.world));
      }

      await bot.dig(block);
      // Đợi tí rồi tìm tiếp
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.log('Lỗi khi đào:', err.message);
      // Nếu lỗi do bị gián đoạn (stop) thì thoát loop
      if (!isDigging) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// --- HÀM HỖ TRỢ CHIẾN ĐẤU ---
async function startAttackLoop() {
  while (isAttacking && (targetEntity || targetMobName)) {
    // Ưu tiên ăn hồi máu trước khi săn
    if (bot.health < 16 || bot.food < 12) {
      await autoEat();
    }

    if (!targetEntity || !targetEntity.isValid) {
      const filter = e => (e.name === targetMobName || (e.username && e.username === targetMobName)) &&
        e.position.distanceTo(bot.entity.position) < 16 && e.isValid;
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
    if (dist > 3.5) {
      bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true);
    } else {
      bot.lookAt(targetEntity.position.offset(0, targetEntity.height, 0));
      await equipForAction(targetEntity, 'attack');
      bot.attack(targetEntity);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

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

  const scanRadius = isBodyguardMode ? 12 : 16;
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
        logThink(`Đang gặt ${target.name}...`);
        const move = configureMovements(bot);
        bot.pathfinder.setMovements(move);
        await bot.pathfinder.goto(new goals.GoalGetToBlock(target.position.x, target.position.y, target.position.z));
        await bot.dig(target);
        await sleep(500);

        const seedName = SEED_TYPES[target.name];
        const seed = bot.inventory.items().find(item => item.name === seedName);
        if (seed) {
          const dirt = bot.blockAt(target.position.offset(0, -1, 0));
          await bot.equip(seed, 'hand');
          await bot.placeBlock(dirt, { x: 0, y: 1, z: 0 });
        }
      } catch (err) { }
    } else {
      const emptyFarmland = bot.findBlock({
        matching: b => {
          if (!b || b.name !== 'farmland') return false;
          const blockAbove = bot.blockAt(b.position.offset(0, 1, 0));
          return blockAbove && blockAbove.name === 'air';
        },
        maxDistance: 16
      });

      if (emptyFarmland) {
        const seed = bot.inventory.items().find(item => Object.values(SEED_TYPES).includes(item.name));
        if (seed) {
          try {
            const move = configureMovements(bot);
            bot.pathfinder.setMovements(move);
            await bot.pathfinder.goto(new goals.GoalGetToBlock(emptyFarmland.position.x, emptyFarmland.position.y, emptyFarmland.position.z));
            await bot.equip(seed, 'hand');
            await bot.placeBlock(emptyFarmland, { x: 0, y: 1, z: 0 });
          } catch (err) { }
        } else {
          await sleep(5000);
        }
      } else {
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
    const weapon = bot.inventory.items().find(i => i.name.includes('sword')) || bot.inventory.items().find(i => i.name.includes('_axe'));
    if (weapon) try { await bot.equip(weapon, 'hand'); } catch (e) { }
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

// --- CÁC HÀNH ĐỘNG CỦA BOT ---
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

bot.on('spawn', () => {
  logThink('✅ Đã kết nối vào server!');
  setTimeout(() => {
    bot.chat(`/login ${BOT_PASSWORD}`);
    bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
    logThink('🔑 Đã gửi lệnh đăng nhập/đăng ký.');
  }, 2000);
});

bot.on('messagestr', (message) => {
  // Log tin nhắn server ra console để dễ theo dõi
  console.log(`[Server] ${message}`);

  if (message.includes('/login') || message.includes('Dùng lệnh /login')) {
    bot.chat(`/login ${BOT_PASSWORD}`);
  }
  if (message.includes('/register') || message.includes('Dùng lệnh /register')) {
    bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
  }
});

const playerSneakData = new Map();
bot.on('entityUpdate', async (entity) => {
  if (entity.type !== 'player' || entity.username === bot.username) return;
  if (entity.position.distanceTo(bot.entity.position) > 8) return;

  const metadata = entity.metadata;
  if (!metadata || metadata[0] === undefined) return;

  const isCurrentlySneaking = Boolean(metadata[0] & 0x02);
  let data = playerSneakData.get(entity.username) || { count: 0, lastTime: 0, lastState: false };

  if (isCurrentlySneaking && !data.lastState) {
    const now = Date.now();
    if (now - data.lastTime < 1000) data.count++;
    else data.count = 1;
    data.lastTime = now;

    if (data.count >= 2) {
      await sleep(1000);
      logThink(`Bắt chước ${entity.username} chào hỏi!`);
      await spamSneak();
      data.count = 0;
    }
  }
  data.lastState = isCurrentlySneaking;
  playerSneakData.set(entity.username, data);
});

bot.on('health', () => {
  autoEat();
});

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

// Giữ lại logic deadzone cho việc follow và tự động hóa
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

// --- LOGIC CHAT VỚI GEMINI (FULL LOOP) ---
const chatHistory = [];

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  try {
    const chat = model.startChat({ history: chatHistory });
    const prompt = `Người chơi ${username} nói: ${message}`;

    let result = await chat.sendMessage(prompt);
    let response = result.response;

    // Vòng lặp xử lý Tool Calls (nếu có)
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

      // Gửi kết quả thực thi lại cho AI để nó trả lời người chơi
      result = await chat.sendMessage(toolResults);
      response = result.response;
    }

    const reply = response.text().trim();
    if (reply) bot.chat(reply);

    // Lưu lịch sử (giới hạn để tránh đầy bộ nhớ)
    chatHistory.push({ role: 'user', parts: [{ text: prompt }] });
    chatHistory.push({ role: 'model', parts: [{ text: reply }] });
    if (chatHistory.length > 20) chatHistory.splice(0, 2);

  } catch (error) {
    console.error("Lỗi AI:", error);
    bot.chat("Tui hơi lag tí, ông nói lại được hông?");
  }
});

bot.on('error', (err) => console.log('⚠️ Lỗi:', err));
bot.on('kicked', (reason) => console.log('❌ Bị kick:', reason));