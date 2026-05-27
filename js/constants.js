/**
 * CREEP CRAFT: REBORN
 * Constants Module - v2.0
 */

// --- CONFIG & CONSTANTS ---
const TILE_SIZE = 32;
const ZOOM = 2; 

const GRAVITY = 0.5;
const TERM_VEL = 15;
const WORLD_W = 300; 
const WORLD_H = 100; 

// Block IDs
const B = {
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WOOD: 4, LEAF: 5, 
    COAL_ORE: 6, IRON_ORE: 7, GOLD_ORE: 8, DIAMOND_ORE: 9,
    BEDROCK: 10, PLANK: 11, BRICK: 12, CHEST: 13, WORKBENCH: 14,
    TORCH_PLACED: 15, FURNACE: 16,
    COAL_BLOCK: 17, IRON_BLOCK: 18, GOLD_BLOCK: 19, DIAMOND_BLOCK: 20
};

// Items
const ITEMS = {
    ...B,
    STICK: 100, 
    TORCH: 199, APPLE: 106,
    COAL: 107, DIAMOND: 108, 
    
    IRON_INGOT: 109,
    GOLD_INGOT: 110,
    EMERALD: 111,
    BREAD: 112,
    CLOCK: 113,
    
    // Materials
    LEATHER: 150, WOOL: 151,
    
    // Food
    PORK_RAW: 160, PORK_COOKED: 161,
    BEEF_RAW: 162, BEEF_COOKED: 163,
    MUTTON_RAW: 164, MUTTON_COOKED: 165,

    // Tools
    SHEARS: 600,
    
    // Pickaxes
    WOOD_PICK: 201, STONE_PICK: 101, IRON_PICK: 301, GOLD_PICK: 401, DIAMOND_PICK: 501,
    // Swords
    WOOD_SWORD: 202, STONE_SWORD: 102, IRON_SWORD: 302, GOLD_SWORD: 402, DIAMOND_SWORD: 502,
    // Axes
    WOOD_AXE: 204, STONE_AXE: 104, IRON_AXE: 304, GOLD_AXE: 404, DIAMOND_AXE: 504,
    // Shovels
    WOOD_SHOVEL: 203, STONE_SHOVEL: 103, IRON_SHOVEL: 303, GOLD_SHOVEL: 403, DIAMOND_SHOVEL: 503,
};

// Max Durability
const MAX_DUR = {
    [ITEMS.WOOD_PICK]: 59, [ITEMS.WOOD_AXE]: 59, [ITEMS.WOOD_SHOVEL]: 59, [ITEMS.WOOD_SWORD]: 59,
    [ITEMS.STONE_PICK]: 131, [ITEMS.STONE_AXE]: 131, [ITEMS.STONE_SHOVEL]: 131, [ITEMS.STONE_SWORD]: 131,
    [ITEMS.IRON_PICK]: 250, [ITEMS.IRON_AXE]: 250, [ITEMS.IRON_SHOVEL]: 250, [ITEMS.IRON_SWORD]: 250, [ITEMS.SHEARS]: 238,
    [ITEMS.GOLD_PICK]: 32, [ITEMS.GOLD_AXE]: 32, [ITEMS.GOLD_SHOVEL]: 32, [ITEMS.GOLD_SWORD]: 32,
    [ITEMS.DIAMOND_PICK]: 1561, [ITEMS.DIAMOND_AXE]: 1561, [ITEMS.DIAMOND_SHOVEL]: 1561, [ITEMS.DIAMOND_SWORD]: 1561,
};

// Tool mining speed multipliers
const TOOL_SPEED = {
    [ITEMS.WOOD_PICK]: 2, [ITEMS.WOOD_AXE]: 2, [ITEMS.WOOD_SHOVEL]: 2,
    [ITEMS.STONE_PICK]: 4, [ITEMS.STONE_AXE]: 4, [ITEMS.STONE_SHOVEL]: 4,
    [ITEMS.IRON_PICK]: 6, [ITEMS.IRON_AXE]: 6, [ITEMS.IRON_SHOVEL]: 6,
    [ITEMS.GOLD_PICK]: 12, [ITEMS.GOLD_AXE]: 12, [ITEMS.GOLD_SHOVEL]: 12,
    [ITEMS.DIAMOND_PICK]: 8, [ITEMS.DIAMOND_AXE]: 8, [ITEMS.DIAMOND_SHOVEL]: 8,
};

// Sword damage values
const SWORD_DAMAGE = {
    [ITEMS.WOOD_SWORD]: 4,
    [ITEMS.STONE_SWORD]: 5,
    [ITEMS.IRON_SWORD]: 6,
    [ITEMS.GOLD_SWORD]: 4,
    [ITEMS.DIAMOND_SWORD]: 7,
};

// Attack cooldown in milliseconds
const ATTACK_COOLDOWN = 500;

// Sound Materials
const BLOCK_SOUNDS = {
    [B.GRASS]: 'grass', [B.DIRT]: 'grass', [B.LEAF]: 'grass',
    [B.STONE]: 'stone', [B.COAL_ORE]: 'stone', [B.IRON_ORE]: 'stone', [B.GOLD_ORE]: 'stone', [B.DIAMOND_ORE]: 'stone', [B.BRICK]: 'stone', [B.FURNACE]: 'stone',
    [B.WOOD]: 'wood', [B.PLANK]: 'wood', [B.CHEST]: 'wood', [B.WORKBENCH]: 'wood',
    [B.BEDROCK]: 'stone',
};

const TOOL_COLORS = {
    WOOD: '#8d6e63', STONE: '#90a4ae', IRON: '#eceff1', GOLD: '#ffd54f', DIAMOND: '#4dd0e1'
};

const ITEM_DESC = {
    [B.DIRT]: { desc: "Just some dirt.", funny: "It's dirty." },
    [B.GRASS]: { desc: "Earthy block with grass.", funny: "Touch grass." },
    [B.STONE]: { desc: "Solid rock. Needs Pickaxe.", funny: "Hard as a rock." },
    [B.WOOD]: { desc: "Raw log. Fuel.", funny: "It's log!" },
    [B.LEAF]: { desc: "Foliage. Needs Shears.", funny: "Crunchy." },
    [B.COAL_ORE]: { desc: "Fossil fuel. Great for furnace.", funny: "Santa's gift." },
    [B.IRON_ORE]: { desc: "Strong metal. Smelt it.", funny: "Iron man?" },
    [B.GOLD_ORE]: { desc: "Shiny but soft. Smelt it.", funny: "Butter." },
    [B.DIAMOND_ORE]: { desc: "The ultimate gem.", funny: "Shiny blue!" },
    [B.PLANK]: { desc: "Building material. Fuel.", funny: "Splintery." },
    [B.BRICK]: { desc: "Strong block.", funny: "Don't throw it." },
    [B.CHEST]: { desc: "Stores items. Use 'R' to open.", funny: "Mimic check!" },
    [B.WORKBENCH]: { desc: "For advanced crafting.", funny: "Craft stuff here." },
    [B.FURNACE]: { desc: "Smelts ores and cooks food. Use 'R'.", funny: "Hot stuff." },
    [ITEMS.COAL]: { desc: "Fuel for furnace.", funny: "Dusty." },
    [ITEMS.DIAMOND]: { desc: "Precious gem.", funny: "Forever." },
    [B.COAL_BLOCK]: { desc: "Compact coal.", funny: "Black cube." },
    [B.IRON_BLOCK]: { desc: "Solid iron.", funny: "Heavy." },
    [B.GOLD_BLOCK]: { desc: "Solid gold.", funny: "Bling." },
    [B.DIAMOND_BLOCK]: { desc: "Solid diamond.", funny: "Flex." },
    [ITEMS.STICK]: { desc: "Tool handle. Fuel.", funny: "A stick." },
    [ITEMS.TORCH]: { desc: "Light source. RMB to Place.", funny: "Let there be light." },
    [ITEMS.APPLE]: { desc: "Heals 2 HP. RMB to Eat.", funny: "Yum!" },
    [ITEMS.SHEARS]: { desc: "Collects leaves/wool.", funny: "Snip snip." },
    [ITEMS.LEATHER]: { desc: "From Cows. Used for armor.", funny: "Moo." },
    [ITEMS.WOOL]: { desc: "From Sheep.", funny: "So soft." },
    [ITEMS.PORK_RAW]: { desc: "Heals 1 HP. Cook it!", funny: "Oink." },
    [ITEMS.PORK_COOKED]: { desc: "Heals 4 HP.", funny: "Bacon!" },
    [ITEMS.BEEF_RAW]: { desc: "Heals 1 HP. Cook it!", funny: "Raw steak." },
    [ITEMS.BEEF_COOKED]: { desc: "Heals 5 HP.", funny: "Medium rare." },
    [ITEMS.MUTTON_RAW]: { desc: "Heals 1 HP. Cook it!", funny: "Baa." },
    [ITEMS.MUTTON_COOKED]: { desc: "Heals 4 HP.", funny: "Lamb chop." },
    [ITEMS.WOOD_PICK]: { desc: "Basic mining tool.", funny: "Better than hands." },
    [ITEMS.STONE_PICK]: { desc: "Mines Iron.", funny: "Solid." },
    [ITEMS.IRON_PICK]: { desc: "Mines Gold/Diamond.", funny: "Reliable." },
    [ITEMS.DIAMOND_PICK]: { desc: "Mines everything fast.", funny: "Overpowered." },
    [ITEMS.CLOCK]: { desc: "Shows the current time.", funny: "Time flies so fast..."},
    [ITEMS.BREAD]: { desc: "Heals 1,5 HP.", funny: "Сooked until well done!"},
};

const BLOCKS = {
    [B.AIR]:   { color: null, pass: true },
    [B.DIRT]:  { color: '#5d4037', hard: 3 },
    [B.GRASS]: { color: '#388e3c', hard: 3, top: '#4caf50' },
    [B.STONE]: { color: '#757575', hard: 8 },
    [B.WOOD]:  { color: '#3e2723', hard: 5 },
    [B.LEAF]:  { color: '#2e7d32', hard: 1, pass: true },
    [B.COAL_ORE]:   { color: '#757575', hard: 10 },
    [B.IRON_ORE]:   { color: '#757575', hard: 12 },
    [B.GOLD_ORE]:   { color: '#757575', hard: 12 },
    [B.DIAMOND_ORE]:{ color: '#757575', hard: 15 },
    [B.BEDROCK]: { color: '#000000', hard: 999 },
    [B.PLANK]: { color: '#8d6e63', hard: 4 },
    [B.BRICK]: { color: '#795548', hard: 10 },
    [B.CHEST]: { color: '#e65100', hard: 3 },
    [B.WORKBENCH]: { color: '#d7ccc8', hard: 4 },
    [B.FURNACE]: { color: '#616161', hard: 5 },
    [B.TORCH_PLACED]: { color: null, hard: 0, pass: true, light: true },
    [B.COAL_BLOCK]: { color: '#111', hard: 10 },
    [B.IRON_BLOCK]: { color: '#eceff1', hard: 15 },
    [B.GOLD_BLOCK]: { color: '#ffd54f', hard: 15 },
    [B.DIAMOND_BLOCK]: { color: '#4dd0e1', hard: 20 },
};

const SMELT_RECIPES = {
    [ITEMS.PORK_RAW]: ITEMS.PORK_COOKED,
    [ITEMS.BEEF_RAW]: ITEMS.BEEF_COOKED,
    [ITEMS.MUTTON_RAW]: ITEMS.MUTTON_COOKED,
    [B.IRON_ORE]: ITEMS.IRON_INGOT, 
    [B.GOLD_ORE]: ITEMS.GOLD_INGOT 
};

const FUELS = {
    [ITEMS.COAL]: 80, [B.COAL_BLOCK]: 800, 
    [B.WOOD]: 15, [B.PLANK]: 15, [ITEMS.STICK]: 5
};

const RECIPES = [
    { out: {id: ITEMS.PLANK, n:4}, in: [{id: B.WOOD, n:1}], reqBench: false },
    { out: {id: B.WORKBENCH, n:1}, in: [{id: ITEMS.PLANK, n:4}], reqBench: false },
    { out: {id: ITEMS.STICK, n:2}, in: [{id: ITEMS.PLANK, n:1}], reqBench: false },
    { out: {id: ITEMS.TORCH, n:4}, in: [{id: ITEMS.STICK, n:1}, {id: ITEMS.COAL, n:1}], reqBench: false },
    { out: {id: B.FURNACE, n:1}, in: [{id: B.STONE, n:8}], reqBench: true },
    { out: {id: B.BRICK, n:1}, in: [{id: B.STONE, n:2}], reqBench: true },
    { out: {id: B.CHEST, n:1}, in: [{id: ITEMS.PLANK, n:8}], reqBench: true },
    
    // Block conversions
    { out: {id: B.COAL_BLOCK, n:1}, in: [{id: ITEMS.COAL, n:9}], reqBench: false },
    { out: {id: ITEMS.COAL, n:9}, in: [{id: B.COAL_BLOCK, n:1}], reqBench: false },
    { out: {id: B.IRON_BLOCK, n:1}, in: [{id: ITEMS.IRON_INGOT, n:9}], reqBench: true },
    { out: {id: ITEMS.IRON_INGOT, n:9}, in: [{id: B.IRON_BLOCK, n:1}], reqBench: true },
    { out: {id: B.GOLD_BLOCK, n:1}, in: [{id: ITEMS.GOLD_INGOT, n:9}], reqBench: true },
    { out: {id: ITEMS.GOLD_INGOT, n:9}, in: [{id: B.GOLD_BLOCK, n:1}], reqBench: true },
    { out: {id: B.DIAMOND_BLOCK, n:1}, in: [{id: ITEMS.DIAMOND, n:9}], reqBench: true },
    { out: {id: ITEMS.DIAMOND, n:9}, in: [{id: B.DIAMOND_BLOCK, n:1}], reqBench: true },
    
    // Tools - Wood
    { out: {id: ITEMS.WOOD_PICK, n:1}, in: [{id: ITEMS.PLANK, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.WOOD_AXE, n:1}, in: [{id: ITEMS.PLANK, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.WOOD_SHOVEL, n:1}, in: [{id: ITEMS.PLANK, n:1}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.WOOD_SWORD, n:1}, in: [{id: ITEMS.PLANK, n:2}, {id: ITEMS.STICK, n:1}], reqBench: true },
    
    // Tools - Stone
    { out: {id: ITEMS.STONE_PICK, n:1}, in: [{id: B.STONE, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.STONE_AXE, n:1}, in: [{id: B.STONE, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.STONE_SHOVEL, n:1}, in: [{id: B.STONE, n:1}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.STONE_SWORD, n:1}, in: [{id: B.STONE, n:2}, {id: ITEMS.STICK, n:1}], reqBench: true },
    
    // Tools - Iron
    { out: {id: ITEMS.IRON_PICK, n:1}, in: [{id: ITEMS.IRON_INGOT, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.IRON_AXE, n:1}, in: [{id: ITEMS.IRON_INGOT, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.IRON_SHOVEL, n:1}, in: [{id: ITEMS.IRON_INGOT, n:1}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.IRON_SWORD, n:1}, in: [{id: ITEMS.IRON_INGOT, n:2}, {id: ITEMS.STICK, n:1}], reqBench: true },
    { out: {id: ITEMS.SHEARS, n:1}, in: [{id: ITEMS.IRON_INGOT, n:2}], reqBench: true },
    
    // Tools - Gold
    { out: {id: ITEMS.GOLD_PICK, n:1}, in: [{id: ITEMS.GOLD_INGOT, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.GOLD_AXE, n:1}, in: [{id: ITEMS.GOLD_INGOT, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.GOLD_SHOVEL, n:1}, in: [{id: ITEMS.GOLD_INGOT, n:1}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.GOLD_SWORD, n:1}, in: [{id: ITEMS.GOLD_INGOT, n:2}, {id: ITEMS.STICK, n:1}], reqBench: true },
    
    // Tools - Diamond
    { out: {id: ITEMS.DIAMOND_PICK, n:1}, in: [{id: ITEMS.DIAMOND, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.DIAMOND_AXE, n:1}, in: [{id: ITEMS.DIAMOND, n:3}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.DIAMOND_SHOVEL, n:1}, in: [{id: ITEMS.DIAMOND, n:1}, {id: ITEMS.STICK, n:2}], reqBench: true },
    { out: {id: ITEMS.DIAMOND_SWORD, n:1}, in: [{id: ITEMS.DIAMOND, n:2}, {id: ITEMS.STICK, n:1}], reqBench: true },
    
    // Clock
    { out: {id: ITEMS.CLOCK, n:1}, in: [{id: ITEMS.GOLD_INGOT, n:4}, {id: ITEMS.DIAMOND, n:1}], reqBench: true },
    
    // Food
    { out: {id: ITEMS.BREAD, n:1}, in: [{id: B.GRASS, n:3}], reqBench: false },
];

// Experience points for different actions (Minecraft-like)
const XP_VALUES = {
    COAL_ORE: 1,
    IRON_ORE: 0, // Doesn't drop XP when mined, only when smelted
    GOLD_ORE: 0,
    DIAMOND_ORE: 7,
    SMELT_IRON: 1,
    SMELT_GOLD: 1,
    KILL_ZOMBIE: 5,
    KILL_SPIDER: 5,
    KILL_PIG: 3,
    KILL_COW: 3,
    KILL_SHEEP: 3,
};

// Fixed surface pattern based on original Creep Craft screenshots
// This is the height profile that mimics the original game
const FIXED_SURFACE_HEIGHTS = [
    // Start cave area (left side)
    ...Array(50).fill(38),  // Flat cave entrance area
    // Transition to surface
    38, 38, 37, 37, 36, 35, 35, 34, 34, 33,
    // Main surface with hills
    33, 33, 32, 32, 32, 31, 31, 31, 32, 32,
    33, 33, 34, 34, 34, 33, 33, 32, 32, 31,
    31, 31, 32, 32, 33, 33, 33, 34, 34, 35,
    35, 34, 34, 33, 33, 33, 32, 32, 32, 32,
    // Continue pattern...
];

// Mob health values (increased for better combat)
const MOB_HEALTH = {
    ZOMBIE: 20,      // Was probably lower
    SPIDER: 16,
    PIG: 10,
    COW: 10,
    SHEEP: 8,
};

// Mob damage values
const MOB_DAMAGE = {
    ZOMBIE: 3,
    SPIDER: 2,
};
