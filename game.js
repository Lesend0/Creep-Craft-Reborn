/**
 * CREEP CRAFT: REBORN
 * Engine Beta 1.0 - Nether Update
 */

// --- CONFIG & CONSTANTS ---
const TILE_SIZE = 32;
let ZOOM = 3; // User-facing zoom level (1–4). Default = 3.
let ENABLE_VIGNETTE = true;
let CLOUD_HEIGHT = 0;

// Converts user-facing ZOOM (1–4) into a real pixel scale factor.
// Visible blocks in height at each level:
//   ZOOM 1 → 32 blocks, ZOOM 2 → 16, ZOOM 3 → 8, ZOOM 4 → 4
// Intermediate values are linearly interpolated.
// Width is always 2× height (enforced by the scale being uniform + 2:1 aspect concept,
// but actual aspect ratio follows the canvas).
function getTargetBlocksH(zoomLevel) {
    const stops = [
        [1, 32],
        [2, 16],
        [3, 8],
        [4, 4],
    ];
    if (zoomLevel <= stops[0][0]) return stops[0][1];
    if (zoomLevel >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
        const [z0, b0] = stops[i];
        const [z1, b1] = stops[i + 1];
        if (zoomLevel >= z0 && zoomLevel <= z1) {
            const t = (zoomLevel - z0) / (z1 - z0);
            return b0 + (b1 - b0) * t;
        }
    }
    return 8; // fallback
}

function getEffectiveZoom() {
    const ch = (typeof canvas !== 'undefined' && canvas) ? canvas.height : 600;
    const targetH = getTargetBlocksH(ZOOM) * TILE_SIZE; // desired logical height in pixels
    return ch / targetH;
}

const GRAVITY = 0.5;
const TERM_VEL = 15;
// Мир теперь симметричный: 10 000 блоков влево + 10 000 блоков вправо от спавна
// (всего 20 000 блоков по X). По Y увеличиваем до 256 блоков, чтобы дать
// «майнкрафтовский» лимит постройки в 256 блоков (8192 px).
const WORLD_W = 20000;
const WORLD_H = 256;
// Тайл-координата, на которую сдвинуто старое (нулевое) начало мира.
// Старая стартовая пещера занимала x=0..95, спавн был на x=14.
// Сдвигаем на 10 000, чтобы спавн оказался в центре карты (≈ блок 10014).
const WORLD_OFFSET_X = 10000;
// Старая поверхность была на y=40 при WORLD_H=100. Чтобы сохранить ту же
// «глубину под бедроком» (60 блоков), новая поверхность — на y = WORLD_H-60 = 196.
const WORLD_OFFSET_Y = WORLD_H - 100; // = 156, прибавляется ко всем «старым» Y.
// Минимальная Y-координата тайла, на которой можно ставить блок.
// Хранилище ограничено 0..WORLD_H-1, а игроку разрешено летать выше — поэтому
// при попытке поставить блок выше 0 показываем красное предупреждение.
const BUILD_LIMIT_TY = 0;

// Block IDs
const B = {
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WOOD: 4, LEAF: 5,
    COAL_ORE: 6, IRON_ORE: 7, GOLD_ORE: 8, DIAMOND_ORE: 9,
    BEDROCK: 10, PLANK: 11, BRICK: 12, CHEST: 13, WORKBENCH: 14,
    TORCH_PLACED: 15, FURNACE: 16,
    COAL_BLOCK: 17, IRON_BLOCK: 18, GOLD_BLOCK: 19, DIAMOND_BLOCK: 20, BED: 21,
    // V5: farming
    FARMLAND: 22, WHEAT_0: 23, WHEAT_1: 24, WHEAT_2: 25, WHEAT_3: 26,
    // V7: liquids. 0 = full block, 7 = thinnest slice.
    // Источник-ли данная клетка — хранится отдельно в world.waterSources / world.lavaSources.
    WATER_0: 30, WATER_1: 31, WATER_2: 32, WATER_3: 33, WATER_4: 34, WATER_5: 35, WATER_6: 36, WATER_7: 37,
    LAVA_0: 40, LAVA_1: 41, LAVA_2: 42, LAVA_3: 43, LAVA_4: 44, LAVA_5: 45, LAVA_6: 46, LAVA_7: 47,
    // V8.4: Fire & TNT
    FIRE: 48, TNT: 49,
    // V9: Sand & Gravel
    SAND: 50, GRAVEL: 51,
    // V10: Cobblestone, Glass, Bookshelf, Stairs, Slabs, Fences
    COBBLESTONE: 60, GLASS: 61, BOOKSHELF: 62,
    OBSIDIAN: 67,
    WOOD_STAIRS: 63, COBBLE_STAIRS: 64, STONE_STAIRS: 65, BRICK_STAIRS: 66,
    WOOD_SLAB: 70, STONE_SLAB: 71, COBBLE_SLAB: 72, BRICK_SLAB: 73,
    WOOD_FENCE: 80, COBBLE_FENCE: 81, BRICK_FENCE: 82, WOOD_GATE: 83,
    // V11: Clay block (drops clay items, smelts to brick block)
    CLAY_BLOCK: 90,
    // V12: Doors, trapdoors, lever, ladder + new slab variants
    WOOD_DOOR: 91, WOOD_TRAPDOOR: 92, LEVER: 93, LADDER: 94,
    DIRT_SLAB: 95, SAND_SLAB: 96, GLASS_SLAB: 97, BOOKSHELF_SLAB: 98,
    // V13: Music player (jukebox)
    JUKEBOX: 99,

    // V14: Flowers (single-block plants). All pass-through, instant-break.
    // IDs deliberately placed in the 195-242 range to avoid clashing with item
    // ids in 100-138 (gold ingot, bread, feather, book, …) and 150-205 (wool,
    // food, hoes, buckets, tools).
    POPPY: 210, DANDELION: 211, BLUE_ORCHID: 212, ALLIUM: 213,
    AZURE_BLUET: 214, RED_TULIP: 215, ORANGE_TULIP: 216, WHITE_TULIP: 217, PINK_TULIP: 218,
    OXEYE_DAISY: 219, CORNFLOWER: 220, LILY_OF_THE_VALLEY: 221,
    // V14: Two-block tall flowers/plants — bottom + top halves.
    SUNFLOWER_BOTTOM: 222, SUNFLOWER_TOP: 223,
    LILAC_BOTTOM:     224, LILAC_TOP:     225,
    ROSE_BUSH_BOTTOM: 226, ROSE_BUSH_TOP: 227,
    PEONY_BOTTOM:     228, PEONY_TOP:     229,
    // V14: Grass plants — short (1 tile) and tall (2 tiles).
    SHORT_GRASS: 230, TALL_GRASS_BOTTOM: 231, TALL_GRASS_TOP: 232,
    SUGARCANE: 233,

    // V14: Snow biome
    SNOW_BLOCK: 240, SNOW_LAYER: 241, ICE: 242, PACKED_ICE: 243,

    // Beta 1.1: Desert / Beach / Ocean biome blocks.
    // CACTUS — pass=true так что снаряды/частицы пролетают, но игрок получает урон контактом.
    // DEAD_BUSH — мелкое растение пустыни, как куст, дропает палку.
    // SANDSTONE — спрессованный песок, образуется под слоем песка в пустыне.
    // IDs выбраны в свободной зоне 244..249 (между PACKED_ICE=243 и NETHERRACK=250),
    // т.к. `world.tiles` — Uint8Array и не хранит значения ≥ 256.
    CACTUS: 244, DEAD_BUSH: 245, SANDSTONE: 246,

    // Beta 1.0: Nether dimension blocks
    // Тематические блоки Незера, расширенные для более «майнкрафтовского» вида.
    // SOUL_SAND / MAGMA_BLOCK / NETHER_BRICK добавлены в свободные слоты 247..249
    // (между SANDSTONE=246 и NETHERRACK=250) — Uint8Array безопасен (<256).
    SOUL_SAND: 247,         // Dark brown soul-sand on the Nether floor
    MAGMA_BLOCK: 248,       // Glowing magma block — usually crusts over lava
    NETHER_BRICK: 249,      // Dark red brick — ruined fortress fragments
    NETHERRACK: 250,        // Red rock filling the Nether
    QUARTZ_ORE: 251,        // Found in netherrack — drops nether quartz
    QUARTZ_BLOCK: 252,      // Crafted decorative quartz block
    GLOWSTONE: 253,         // Light source on Nether ceilings
    PORTAL: 254,            // Active Nether portal block (purple swirl)

    // V16: Wool Blocks
    WHITE_WOOL: 151,
    ORANGE_WOOL: 260,
    MAGENTA_WOOL: 261,
    LIGHT_BLUE_WOOL: 262,
    YELLOW_WOOL: 263,
    LIME_WOOL: 264,
    PINK_WOOL: 265,
    GRAY_WOOL: 266,
    LIGHT_GRAY_WOOL: 267,
    CYAN_WOOL: 268,
    PURPLE_WOOL: 269,
    BLUE_WOOL: 270,
    BROWN_WOOL: 271,
    GREEN_WOOL: 272,
    RED_WOOL: 273,
    BLACK_WOOL: 274,
};

// V14: Helpers for flower / grass plant identification.
function isSingleFlower(id) {
    return id >= B.POPPY && id <= B.LILY_OF_THE_VALLEY;
}
function isTallPlantBottom(id) {
    return id === B.SUNFLOWER_BOTTOM || id === B.LILAC_BOTTOM ||
           id === B.ROSE_BUSH_BOTTOM || id === B.PEONY_BOTTOM ||
           id === B.TALL_GRASS_BOTTOM;
}
function isTallPlantTop(id) {
    return id === B.SUNFLOWER_TOP || id === B.LILAC_TOP ||
           id === B.ROSE_BUSH_TOP || id === B.PEONY_TOP ||
           id === B.TALL_GRASS_TOP;
}
function tallPlantOtherHalf(id) {
    // Returns the matching half id for any tall-plant tile, or 0 if not tall.
    if (id === B.SUNFLOWER_BOTTOM) return B.SUNFLOWER_TOP;
    if (id === B.SUNFLOWER_TOP)    return B.SUNFLOWER_BOTTOM;
    if (id === B.LILAC_BOTTOM)     return B.LILAC_TOP;
    if (id === B.LILAC_TOP)        return B.LILAC_BOTTOM;
    if (id === B.ROSE_BUSH_BOTTOM) return B.ROSE_BUSH_TOP;
    if (id === B.ROSE_BUSH_TOP)    return B.ROSE_BUSH_BOTTOM;
    if (id === B.PEONY_BOTTOM)     return B.PEONY_TOP;
    if (id === B.PEONY_TOP)        return B.PEONY_BOTTOM;
    if (id === B.TALL_GRASS_BOTTOM) return B.TALL_GRASS_TOP;
    if (id === B.TALL_GRASS_TOP)    return B.TALL_GRASS_BOTTOM;
    return 0;
}
function isGrassPlant(id) {
    return id === B.SHORT_GRASS || id === B.TALL_GRASS_BOTTOM || id === B.TALL_GRASS_TOP;
}
function isFlowerOrPlant(id) {
    return isSingleFlower(id) || isTallPlantBottom(id) || isTallPlantTop(id) || isGrassPlant(id) || id === B.SUGARCANE;
}

// V7: хелперы для определения жидкостей
function isWater(id) { return id >= B.WATER_0 && id <= B.WATER_7; }
function isLava(id) { return id >= B.LAVA_0 && id <= B.LAVA_7; }
function isLiquid(id) { return isWater(id) || isLava(id); }
// уровень: 0 (полный блок) ... 7 (тоньше всего)
function liquidLevel(id) {
    if (isWater(id)) return id - B.WATER_0;
    if (isLava(id)) return id - B.LAVA_0;
    return -1;
}
function liquidBaseId(id) {
    if (isWater(id)) return B.WATER_0;
    if (isLava(id)) return B.LAVA_0;
    return -1;
}

// =========================================================================
// FIRE TABLES (Minecraft-like spread)
// FIRE_FLAMMABILITY: chance a block is set on fire by an adjacent fire (catch).
// FIRE_ENCOURAGEMENT: how strongly a flammable block encourages fire to ignite
//   AIR cells adjacent to it. Higher = more likely to set the neighbour aflame.
// Numbers approximate vanilla values (planks/wood are mid-range, leaves & wool
// catch easily, log itself is harder to ignite but encourages strongly).
// =========================================================================
const FIRE_FLAMMABILITY = {};
const FIRE_ENCOURAGEMENT = {};
(function buildFireTables() {
    const set = (id, fl, en) => {
        if (id === undefined) return;
        FIRE_FLAMMABILITY[id] = fl;
        FIRE_ENCOURAGEMENT[id] = en;
    };
    set(B.WOOD,            5,  5);
    set(B.PLANK,           20, 5);
    set(B.LEAF,            60, 30);
    set(B.WOOD_STAIRS,     20, 5);
    set(B.WOOD_SLAB,       20, 5);
    set(B.WOOD_FENCE,      20, 5);
    set(B.WOOD_DOOR,       20, 5);
    set(B.WOOD_TRAPDOOR,   20, 5);
    set(B.WOOD_GATE,       20, 5);
    set(B.BOOKSHELF,       30, 20);
    set(B.BOOKSHELF_SLAB,  30, 20);
    set(B.BED,             20, 5);
    set(B.LADDER,          20, 5);
    set(B.WHEAT_3,         60, 30);
    set(B.WHEAT_2,         60, 30);
    set(B.WHEAT_1,         60, 30);
    set(B.WHEAT_0,         60, 30);
})();

// Blocks that can hold fire above them (any solid flammable + some specials).
function isFireSupport(id) {
    if (id === undefined || id === B.AIR) return false;
    if (FIRE_FLAMMABILITY[id] !== undefined) return true;
    // Most solid non-liquid blocks support fire briefly but don't fuel it.
    // We treat them as non-supporting so fire over stone burns out fast.
    return false;
}

// Sample the maximum flammability of the 4 cardinal neighbours.
// (Vanilla uses 6 sides in 3D — we use 4 in 2D.)
function fireEncouragement(world, x, y) {
    let enc = 0;
    const sides = [
        world.getTile(x - 1, y), world.getTile(x + 1, y),
        world.getTile(x, y - 1), world.getTile(x, y + 1)
    ];
    for (let i = 0; i < sides.length; i++) {
        const v = FIRE_ENCOURAGEMENT[sides[i]];
        if (v !== undefined && v > enc) enc = v;
    }
    return enc;
}

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
    CLOCK: 113, GLOWSTONE_DUST: 114,
    // Mats
    LEATHER: 150, WHITE_WOOL: 151,

    // Colored Wools
    ORANGE_WOOL: 260, MAGENTA_WOOL: 261, LIGHT_BLUE_WOOL: 262, YELLOW_WOOL: 263,
    LIME_WOOL: 264, PINK_WOOL: 265, GRAY_WOOL: 266, LIGHT_GRAY_WOOL: 267,
    CYAN_WOOL: 268, PURPLE_WOOL: 269, BLUE_WOOL: 270, BROWN_WOOL: 271,
    GREEN_WOOL: 272, RED_WOOL: 273, BLACK_WOOL: 274,

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
    // V5: Hoes
    WOOD_HOE: 205, STONE_HOE: 105, IRON_HOE: 305, GOLD_HOE: 405, DIAMOND_HOE: 505,

    // V5: farming items
    WHEAT_SEEDS: 170, WHEAT: 171,

    // V6: buckets
    BUCKET: 180, WATER_BUCKET: 181, LAVA_BUCKET: 182,

    // V8.4: Tools
    FLINT_AND_STEEL: 183,

    // V11: Materials & containers
    FEATHER: 130, BOOK: 131, FLINT: 132, CLAY: 133, STRING: 134,
    GOLD_NUGGET: 135, IRON_NUGGET: 136,
    EMPTY_BOTTLE: 137, WATER_BOTTLE: 138,
    SUGAR: 139, PAPER: 140, GUNPOWDER: 141,
    BRICK_ITEM: 142,

    // V16: Mob drops & combat
    SPIDER_EYE: 143,
    ROTTEN_FLESH: 144,
    BONE: 145,
    BONE_MEAL: 146,
    BOW: 147,
    ARROW: 148,
    ENDER_PEARL: 149,

    // V13: Music discs — placed in a JUKEBOX to play music.
    MUSIC_DISC_NOSTALGIC: 800,
    MUSIC_DISC_QUIRKY:    801,

    // === БРОНЯ (5 материалов × 3 части) ===
    // Кожаная — самая дешёвая, базовая защита.
    LEATHER_HELMET:     700, LEATHER_CHESTPLATE:     701, LEATHER_BOOTS:     702,
    // Кольчужная — крафтится из железных слитков (как в MC из кольчуги), но мы упрощаем — из слитков.
    CHAIN_HELMET:       710, CHAIN_CHESTPLATE:       711, CHAIN_BOOTS:       712,
    // Железная — основной материал.
    IRON_HELMET:        720, IRON_CHESTPLATE:        721, IRON_BOOTS:        722,
    // Золотая — слабая защита, но красиво.
    GOLD_HELMET:        730, GOLD_CHESTPLATE:        731, GOLD_BOOTS:        732,
    // Алмазная — лучшая защита.
    DIAMOND_HELMET:     740, DIAMOND_CHESTPLATE:     741, DIAMOND_BOOTS:     742,

    // V14: 16 vanilla Minecraft dye colours, crafted from flowers + other sources.
    WHITE_DYE:      900,
    ORANGE_DYE:     901,
    MAGENTA_DYE:    902,
    LIGHT_BLUE_DYE: 903,
    YELLOW_DYE:     904,
    LIME_DYE:       905,
    PINK_DYE:       906,
    GRAY_DYE:       907,
    LIGHT_GRAY_DYE: 908,
    CYAN_DYE:       909,
    PURPLE_DYE:     910,
    BLUE_DYE:       911,
    BROWN_DYE:      912,
    GREEN_DYE:      913,
    RED_DYE:        914,
    BLACK_DYE:      915,

    // Beta 1.0: Nether items
    QUARTZ:         920,
    GHAST_TEAR:     921,
    FIRE_CHARGE:    922,
    PAINTING:       850,
};

// Global dye colors mapping
const DYE_COLORS = {
    [ITEMS.WHITE_DYE]:      '#fafafa',
    [ITEMS.ORANGE_DYE]:     '#ef6c00',
    [ITEMS.MAGENTA_DYE]:    '#c2185b',
    [ITEMS.LIGHT_BLUE_DYE]: '#4fc3f7',
    [ITEMS.YELLOW_DYE]:     '#fbc02d',
    [ITEMS.LIME_DYE]:       '#7cb342',
    [ITEMS.PINK_DYE]:       '#f48fb1',
    [ITEMS.GRAY_DYE]:       '#616161',
    [ITEMS.LIGHT_GRAY_DYE]: '#bdbdbd',
    [ITEMS.CYAN_DYE]:       '#0097a7',
    [ITEMS.PURPLE_DYE]:     '#6a1b9a',
    [ITEMS.BLUE_DYE]:       '#1565c0',
    [ITEMS.BROWN_DYE]:      '#5d4037',
    [ITEMS.GREEN_DYE]:      '#2e7d32',
    [ITEMS.RED_DYE]:        '#c62828',
    [ITEMS.BLACK_DYE]:      '#212121'
};

const WOOL_BY_DYE = {
    [ITEMS.WHITE_DYE]:      ITEMS.WHITE_WOOL,
    [ITEMS.ORANGE_DYE]:     ITEMS.ORANGE_WOOL,
    [ITEMS.MAGENTA_DYE]:    ITEMS.MAGENTA_WOOL,
    [ITEMS.LIGHT_BLUE_DYE]: ITEMS.LIGHT_BLUE_WOOL,
    [ITEMS.YELLOW_DYE]:     ITEMS.YELLOW_WOOL,
    [ITEMS.LIME_DYE]:       ITEMS.LIME_WOOL,
    [ITEMS.PINK_DYE]:       ITEMS.PINK_WOOL,
    [ITEMS.GRAY_DYE]:       ITEMS.GRAY_WOOL,
    [ITEMS.LIGHT_GRAY_DYE]: ITEMS.LIGHT_GRAY_WOOL,
    [ITEMS.CYAN_DYE]:       ITEMS.CYAN_WOOL,
    [ITEMS.PURPLE_DYE]:     ITEMS.PURPLE_WOOL,
    [ITEMS.BLUE_DYE]:       ITEMS.BLUE_WOOL,
    [ITEMS.BROWN_DYE]:      ITEMS.BROWN_WOOL,
    [ITEMS.GREEN_DYE]:      ITEMS.GREEN_WOOL,
    [ITEMS.RED_DYE]:        ITEMS.RED_WOOL,
    [ITEMS.BLACK_DYE]:      ITEMS.BLACK_WOOL
};

const WOOL_GROUP = [
    ITEMS.WHITE_WOOL, ITEMS.ORANGE_WOOL, ITEMS.MAGENTA_WOOL, ITEMS.LIGHT_BLUE_WOOL,
    ITEMS.YELLOW_WOOL, ITEMS.LIME_WOOL, ITEMS.PINK_WOOL, ITEMS.GRAY_WOOL,
    ITEMS.LIGHT_GRAY_WOOL, ITEMS.CYAN_WOOL, ITEMS.PURPLE_WOOL, ITEMS.BLUE_WOOL,
    ITEMS.BROWN_WOOL, ITEMS.GREEN_WOOL, ITEMS.RED_WOOL, ITEMS.BLACK_WOOL
];

// Max Durability
const MAX_DUR = {
    [ITEMS.WOOD_PICK]: 59, [ITEMS.WOOD_AXE]: 59, [ITEMS.WOOD_SHOVEL]: 59, [ITEMS.WOOD_SWORD]: 59, [ITEMS.WOOD_HOE]: 59,
    [ITEMS.STONE_PICK]: 131, [ITEMS.STONE_AXE]: 131, [ITEMS.STONE_SHOVEL]: 131, [ITEMS.STONE_SWORD]: 131, [ITEMS.STONE_HOE]: 131,
    [ITEMS.IRON_PICK]: 250, [ITEMS.IRON_AXE]: 250, [ITEMS.IRON_SHOVEL]: 250, [ITEMS.IRON_SWORD]: 250, [ITEMS.IRON_HOE]: 250, [ITEMS.SHEARS]: 238,
    [ITEMS.GOLD_PICK]: 32, [ITEMS.GOLD_AXE]: 32, [ITEMS.GOLD_SHOVEL]: 32, [ITEMS.GOLD_SWORD]: 32, [ITEMS.GOLD_HOE]: 32,
    [ITEMS.DIAMOND_PICK]: 1561, [ITEMS.DIAMOND_AXE]: 1561, [ITEMS.DIAMOND_SHOVEL]: 1561, [ITEMS.DIAMOND_SWORD]: 1561, [ITEMS.DIAMOND_HOE]: 1561,
    [ITEMS.FLINT_AND_STEEL]: 64,
    [ITEMS.BOW]: 384,
    // Броня — значения как в Minecraft.
    [ITEMS.LEATHER_HELMET]:     55,  [ITEMS.LEATHER_CHESTPLATE]:     80,  [ITEMS.LEATHER_BOOTS]:     65,
    [ITEMS.CHAIN_HELMET]:       165, [ITEMS.CHAIN_CHESTPLATE]:       240, [ITEMS.CHAIN_BOOTS]:       195,
    [ITEMS.IRON_HELMET]:        165, [ITEMS.IRON_CHESTPLATE]:        240, [ITEMS.IRON_BOOTS]:        195,
    [ITEMS.GOLD_HELMET]:        77,  [ITEMS.GOLD_CHESTPLATE]:        112, [ITEMS.GOLD_BOOTS]:        91,
    [ITEMS.DIAMOND_HELMET]:     363, [ITEMS.DIAMOND_CHESTPLATE]:     528, [ITEMS.DIAMOND_BOOTS]:     429,
};

// V6: переопределения стакаемости для предметов, которые не должны стакаться до 64.
// По умолчанию в игре стак = 64; для перечисленных применяется свой лимит.
// Предметы с MAX_DUR игнорируют этот список (они всегда по 1 в слоте).
const MAX_STACK = {
    [ITEMS.BUCKET]: 16,       // пустые вёдра — как в Minecraft
    [ITEMS.WATER_BUCKET]: 1,  // заполненные — один в слоте
    [ITEMS.LAVA_BUCKET]: 1,
    // V13: music discs — never stack (like Minecraft)
    [ITEMS.MUSIC_DISC_NOSTALGIC]: 1,
    [ITEMS.MUSIC_DISC_QUIRKY]: 1,
    // V16: Ender pearl — vanilla MC stacks to 16 in one slot.
    [ITEMS.ENDER_PEARL]: 16,
};
function getMaxStack(id) {
    return MAX_STACK[id] !== undefined ? MAX_STACK[id] : 64;
}

// Соответствие предмета слоту брони ('head' | 'chest' | 'legs').
// Используется для drag&drop экипировки в окне инвентаря.
const ARMOR_ITEMS = {
    [ITEMS.LEATHER_HELMET]:  'head',  [ITEMS.LEATHER_CHESTPLATE]:  'chest', [ITEMS.LEATHER_BOOTS]:  'legs',
    [ITEMS.CHAIN_HELMET]:    'head',  [ITEMS.CHAIN_CHESTPLATE]:    'chest', [ITEMS.CHAIN_BOOTS]:    'legs',
    [ITEMS.IRON_HELMET]:     'head',  [ITEMS.IRON_CHESTPLATE]:     'chest', [ITEMS.IRON_BOOTS]:     'legs',
    [ITEMS.GOLD_HELMET]:     'head',  [ITEMS.GOLD_CHESTPLATE]:     'chest', [ITEMS.GOLD_BOOTS]:     'legs',
    [ITEMS.DIAMOND_HELMET]:  'head',  [ITEMS.DIAMOND_CHESTPLATE]:  'chest', [ITEMS.DIAMOND_BOOTS]:  'legs',
};

// Очки защиты каждой части брони (Minecraft-like).
// Сумма всех экипированных частей даёт общую защиту (макс 20 пунктов = 10 иконок).
const ARMOR_PROTECTION = {
    [ITEMS.LEATHER_HELMET]:    1, [ITEMS.LEATHER_CHESTPLATE]:    3, [ITEMS.LEATHER_BOOTS]:    1,
    [ITEMS.CHAIN_HELMET]:      2, [ITEMS.CHAIN_CHESTPLATE]:      5, [ITEMS.CHAIN_BOOTS]:      1,
    [ITEMS.IRON_HELMET]:       2, [ITEMS.IRON_CHESTPLATE]:       6, [ITEMS.IRON_BOOTS]:       2,
    [ITEMS.GOLD_HELMET]:       2, [ITEMS.GOLD_CHESTPLATE]:       5, [ITEMS.GOLD_BOOTS]:       1,
    [ITEMS.DIAMOND_HELMET]:    3, [ITEMS.DIAMOND_CHESTPLATE]:    8, [ITEMS.DIAMOND_BOOTS]:    3,
};

// Цветовая палитра материала брони — используется и для иконки в инвентаре,
// и для оверлея поверх Крипера.
const ARMOR_MATERIAL = {
    [ITEMS.LEATHER_HELMET]:     'leather', [ITEMS.LEATHER_CHESTPLATE]:     'leather', [ITEMS.LEATHER_BOOTS]:     'leather',
    [ITEMS.CHAIN_HELMET]:       'chain',   [ITEMS.CHAIN_CHESTPLATE]:       'chain',   [ITEMS.CHAIN_BOOTS]:       'chain',
    [ITEMS.IRON_HELMET]:        'iron',    [ITEMS.IRON_CHESTPLATE]:        'iron',    [ITEMS.IRON_BOOTS]:        'iron',
    [ITEMS.GOLD_HELMET]:        'gold',    [ITEMS.GOLD_CHESTPLATE]:        'gold',    [ITEMS.GOLD_BOOTS]:        'gold',
    [ITEMS.DIAMOND_HELMET]:     'diamond', [ITEMS.DIAMOND_CHESTPLATE]:     'diamond', [ITEMS.DIAMOND_BOOTS]:     'diamond',
};

// Палитра материала брони — base / light / dark / edge.
const ARMOR_PALETTE = {
    leather: { base: '#8d6e63', light: '#a1887f', dark: '#5d4037', edge: '#3e2723' },
    chain:   { base: '#9e9e9e', light: '#cfd8dc', dark: '#616161', edge: '#424242' },
    iron:    { base: '#e0e0e0', light: '#ffffff', dark: '#9e9e9e', edge: '#616161' },
    gold:    { base: '#fdd835', light: '#fff59d', dark: '#f57f17', edge: '#bf360c' },
    diamond: { base: '#4dd0e1', light: '#b2ebf2', dark: '#0097a7', edge: '#006064' },
};

function getArmorSlot(itemId)       { return ARMOR_ITEMS[itemId] || null; }
function isArmorItem(itemId)        { return ARMOR_ITEMS[itemId] !== undefined; }
function getArmorProtection(itemId) { return ARMOR_PROTECTION[itemId] || 0; }
function getArmorMaterial(itemId)   { return ARMOR_MATERIAL[itemId] || null; }
function getArmorPalette(itemId) {
    const m = getArmorMaterial(itemId);
    return ARMOR_PALETTE[m] || null;
}

// Хелпер: dragSource выглядит как 'craft2x2-out' или 'craft3x3-out'?
function srcKeyIsCraftOut(src) {
    return src === 'craft2x2-out' || src === 'craft3x3-out';
}

// Tool mining speed multipliers (like Minecraft)
const TOOL_SPEED = {
    [ITEMS.WOOD_PICK]: 2, [ITEMS.WOOD_AXE]: 2, [ITEMS.WOOD_SHOVEL]: 2,
    [ITEMS.STONE_PICK]: 4, [ITEMS.STONE_AXE]: 4, [ITEMS.STONE_SHOVEL]: 4,
    [ITEMS.IRON_PICK]: 6, [ITEMS.IRON_AXE]: 6, [ITEMS.IRON_SHOVEL]: 6,
    [ITEMS.GOLD_PICK]: 12, [ITEMS.GOLD_AXE]: 12, [ITEMS.GOLD_SHOVEL]: 12,
    [ITEMS.DIAMOND_PICK]: 8, [ITEMS.DIAMOND_AXE]: 8, [ITEMS.DIAMOND_SHOVEL]: 8,
};

// XP Values for scoring system
const XP_VALUES = {
    COAL_ORE: 1,
    IRON_ORE: 2,
    GOLD_ORE: 3,
    DIAMOND_ORE: 7,
    KILL_ZOMBIE: 5,
    KILL_SPIDER: 5,
    KILL_SKELETON: 5,
    KILL_ENDERMAN: 12,
    KILL_PIG: 1,
    KILL_COW: 1,
    KILL_SHEEP: 1,
};

// Sound Materials
const BLOCK_SOUNDS = {
    [B.GRASS]: 'grass', [B.DIRT]: 'grass', [B.LEAF]: 'grass',
    [B.STONE]: 'stone', [B.COAL_ORE]: 'stone', [B.IRON_ORE]: 'stone', [B.GOLD_ORE]: 'stone', [B.DIAMOND_ORE]: 'stone', [B.BRICK]: 'stone', [B.FURNACE]: 'stone',
    [B.WOOD]: 'wood', [B.PLANK]: 'wood', [B.CHEST]: 'wood', [B.WORKBENCH]: 'wood',
    [B.BEDROCK]: 'stone',
    // V5: farming
    [B.FARMLAND]: 'grass',
    [B.WHEAT_0]: 'grass', [B.WHEAT_1]: 'grass', [B.WHEAT_2]: 'grass', [B.WHEAT_3]: 'grass',
    // V7: liquids treated as "soft" for step sounds
    [B.WATER_0]: 'grass', [B.LAVA_0]: 'stone',
    [B.FIRE]: 'grass', [B.TNT]: 'wood',
    // V9: Sand & Gravel
    [B.SAND]: 'grass', [B.GRAVEL]: 'stone',
    // V10: new blocks
    [B.COBBLESTONE]: 'stone', [B.GLASS]: 'stone', [B.BOOKSHELF]: 'wood', [B.OBSIDIAN]: 'stone',
    [B.WOOD_STAIRS]: 'wood', [B.COBBLE_STAIRS]: 'stone', [B.STONE_STAIRS]: 'stone', [B.BRICK_STAIRS]: 'stone',
    [B.WOOD_SLAB]: 'wood', [B.STONE_SLAB]: 'stone', [B.COBBLE_SLAB]: 'stone', [B.BRICK_SLAB]: 'stone',
    [B.WOOD_FENCE]: 'wood', [B.COBBLE_FENCE]: 'stone', [B.BRICK_FENCE]: 'stone',
    // V11: clay
    [B.CLAY_BLOCK]: 'grass',
    // V12: doors / trapdoor / lever / ladder + new slab variants
    [B.WOOD_DOOR]: 'wood', [B.WOOD_TRAPDOOR]: 'wood', [B.LEVER]: 'wood', [B.LADDER]: 'wood', [B.WOOD_GATE]: 'wood',
    [B.DIRT_SLAB]: 'grass', [B.SAND_SLAB]: 'grass',
    [B.GLASS_SLAB]: 'stone', [B.BOOKSHELF_SLAB]: 'wood',
    // V13: jukebox — wooden frame with a record on top
    [B.JUKEBOX]: 'wood',
    // V14: flowers/plants — soft grass sound
    [B.POPPY]: 'grass', [B.DANDELION]: 'grass', [B.BLUE_ORCHID]: 'grass',
    [B.ALLIUM]: 'grass', [B.AZURE_BLUET]: 'grass',
    [B.RED_TULIP]: 'grass', [B.ORANGE_TULIP]: 'grass',
    [B.WHITE_TULIP]: 'grass', [B.PINK_TULIP]: 'grass',
    [B.OXEYE_DAISY]: 'grass', [B.CORNFLOWER]: 'grass', [B.LILY_OF_THE_VALLEY]: 'grass',
    [B.SUNFLOWER_BOTTOM]: 'grass', [B.SUNFLOWER_TOP]: 'grass',
    [B.LILAC_BOTTOM]: 'grass', [B.LILAC_TOP]: 'grass',
    [B.ROSE_BUSH_BOTTOM]: 'grass', [B.ROSE_BUSH_TOP]: 'grass',
    [B.PEONY_BOTTOM]: 'grass', [B.PEONY_TOP]: 'grass',
    [B.SHORT_GRASS]: 'grass', [B.TALL_GRASS_BOTTOM]: 'grass', [B.TALL_GRASS_TOP]: 'grass', [B.SUGARCANE]: 'grass',
    // V14: snow biome
    [B.SNOW_BLOCK]: 'grass', [B.SNOW_LAYER]: 'grass',
    [B.ICE]: 'stone', [B.PACKED_ICE]: 'stone',
    // Beta 1.1: desert biome
    [B.CACTUS]: 'grass', [B.DEAD_BUSH]: 'grass', [B.SANDSTONE]: 'stone',
    // Beta 1.0: nether
    [B.NETHERRACK]: 'stone', [B.QUARTZ_ORE]: 'stone', [B.QUARTZ_BLOCK]: 'stone',
    [B.GLOWSTONE]: 'stone', [B.PORTAL]: 'grass',
    [B.SOUL_SAND]: 'grass', [B.MAGMA_BLOCK]: 'stone', [B.NETHER_BRICK]: 'stone',
    // V16: Wool
    [B.WHITE_WOOL]: 'grass', [B.ORANGE_WOOL]: 'grass', [B.MAGENTA_WOOL]: 'grass', [B.LIGHT_BLUE_WOOL]: 'grass',
    [B.YELLOW_WOOL]: 'grass', [B.LIME_WOOL]: 'grass', [B.PINK_WOOL]: 'grass', [B.GRAY_WOOL]: 'grass',
    [B.LIGHT_GRAY_WOOL]: 'grass', [B.CYAN_WOOL]: 'grass', [B.PURPLE_WOOL]: 'grass', [B.BLUE_WOOL]: 'grass',
    [B.BROWN_WOOL]: 'grass', [B.GREEN_WOOL]: 'grass', [B.RED_WOOL]: 'grass', [B.BLACK_WOOL]: 'grass',
};

const TOOL_COLORS = {
    WOOD: '#8d6e63', STONE: '#90a4ae', IRON: '#eceff1', GOLD: '#ffd54f', DIAMOND: '#4dd0e1'
};

const ITEM_DESC = {
    // --- Blocks ---
    [B.DIRT]: { desc: "Just some dirt.", funny: "Zero calories, zero flavor, zero regrets." },
    [B.GRASS]: { desc: "Earthy block with grass. Drops dirt, sometimes seeds.", funny: "Touch grass. No, SERIOUSLY, go outside." },
    [B.STONE]: { desc: "Solid rock. Needs Pickaxe.", funny: "Rock, paper, skull — guess which wins?" },
    [B.WOOD]: { desc: "Raw log. Fuel.", funny: "It's log, it's log, it's big, it's heavy, it's wood!" },
    [B.LEAF]: { desc: "Foliage. Needs Shears.", funny: "Autumn's crunchy autobiography." },
    [B.COAL_ORE]: { desc: "Fossil fuel. Great for furnace.", funny: "Naughty list starter pack." },
    [B.IRON_ORE]: { desc: "Strong metal. Smelt it.", funny: "Ferrous wheel — no tickets needed." },
    [B.GOLD_ORE]: { desc: "Shiny but soft. Smelt it.", funny: "Looks buttery. Don't bite. Dentists hate this." },
    [B.DIAMOND_ORE]: { desc: "The ultimate gem.", funny: "Cursed by pirates. Mine anyway." },
    [B.BEDROCK]: { desc: "Unbreakable foundation.", funny: "Your pickaxe breaks before your dreams do." },
    [B.PLANK]: { desc: "Building material. Fuel.", funny: "One splinter away from a tetanus shot." },
    [B.BRICK]: { desc: "Strong block.", funny: "Throw responsibly. Or don't — I'm a tooltip, not a cop." },
    [B.CHEST]: { desc: "Stores items. Use 'E' to open.", funny: "Open with caution. Or a stick. Mostly caution." },
    [B.WORKBENCH]: { desc: "For advanced crafting.", funny: "Where dreams meet splinters." },
    [B.FURNACE]: { desc: "Smelts ores and cooks food. Use 'E'.", funny: "Home of the 'oops, that was raw' moment." },
    [B.COAL_BLOCK]: { desc: "Compact coal. Long-lasting fuel.", funny: "Nine pieces of regret, stacked neatly." },
    [B.IRON_BLOCK]: { desc: "Solid iron. 9 ingots in one.", funny: "Deadlift simulator — now with less gym." },
    [B.GOLD_BLOCK]: { desc: "Solid gold. Pure flex.", funny: "Rapper starter pack. Batteries not included." },
    [B.DIAMOND_BLOCK]: { desc: "Solid diamond. Ultimate flex.", funny: "Solid proof you have no social life. Congrats!" },
    [B.BED]: { desc: "Sleep to set spawn and skip night.", funny: "Where nightmares skip your turn." },
    // V5: farming blocks
    [B.FARMLAND]: { desc: "Tilled soil. Plant seeds on it.", funny: "100% more soil, 0% Wi-Fi." },
    [B.WHEAT_0]: { desc: "Wheat sprout. Wait for it to grow.", funny: "Wheat, but like — a baby version." },
    [B.WHEAT_1]: { desc: "Young wheat. Growing up.", funny: "Going through a phase. Don't ask." },
    [B.WHEAT_2]: { desc: "Almost ripe wheat.", funny: "Patience: the real crop." },
    [B.WHEAT_3]: { desc: "Ripe wheat! Harvest for grain.", funny: "Time to harvest. And brag to the cows." },

    // --- Raw materials ---
    [ITEMS.STICK]: { desc: "Tool handle. Fuel.", funny: "Stick. Just... stick. What did you expect?" },
    [ITEMS.COAL]: { desc: "Fuel for furnace.", funny: "Breathe it in. No, wait — don't." },
    [ITEMS.DIAMOND]: { desc: "Precious gem.", funny: "Engagement ring, solo tier." },
    [ITEMS.IRON_INGOT]: { desc: "Smelted iron. Used for tools, armor, buckets.", funny: "One ingot from greatness. Or a spoon." },
    [ITEMS.GOLD_INGOT]: { desc: "Smelted gold. Soft but shiny.", funny: "Bank heist confetti." },
    [ITEMS.EMERALD]: { desc: "Rare green gem.", funny: "Rarer than your average apology." },
    [ITEMS.LEATHER]: { desc: "From Cows. Used for armor.", funny: "One cow's final cameo." },
    [ITEMS.WHITE_WOOL]: { desc: "From Sheep. Used for beds.", funny: "Sheep's pajamas. Literally." },

    // --- Food ---
    [ITEMS.APPLE]: { desc: "Heals 2 HP. RMB to Eat.", funny: "Keeps doctors away. Zombies, not so much." },
    [ITEMS.BREAD]: { desc: "Heals 3 HP. RMB to Eat.", funny: "Ancient wisdom: carbs fix everything." },
    [ITEMS.PORK_RAW]: { desc: "Heals 1 HP. Cook it!", funny: "Bacon's awkward teenage years." },
    [ITEMS.PORK_COOKED]: { desc: "Heals 4 HP.", funny: "Bacon makes everything better. Even regret." },
    [ITEMS.BEEF_RAW]: { desc: "Heals 1 HP. Cook it!", funny: "Steak tartare — for the brave and foolish." },
    [ITEMS.BEEF_COOKED]: { desc: "Heals 5 HP.", funny: "Chef's kiss. Gordon Ramsay nods approvingly." },
    [ITEMS.MUTTON_RAW]: { desc: "Heals 1 HP. Cook it!", funny: "Little lamb's last moo-ment." },
    [ITEMS.MUTTON_COOKED]: { desc: "Heals 4 HP.", funny: "Deliciously unnecessary." },

    // --- Utility ---
    [ITEMS.TORCH]: { desc: "Light source. RMB to Place.", funny: "Keeps darkness, monsters, and loneliness away." },
    [ITEMS.SHEARS]: { desc: "Collects leaves/wool.", funny: "Barber license not required." },
    [ITEMS.CLOCK]: { desc: "Shows the current time.", funny: "Kindly reminds you that sleep is a luxury." },

    // --- Pickaxes ---
    [ITEMS.WOOD_PICK]: { desc: "Basic mining tool. Mines Stone/Coal.", funny: "Slightly better than punching rocks. Slightly." },
    [ITEMS.STONE_PICK]: { desc: "Mines Iron.", funny: "Hit rocks with rocks. Evolution in action." },
    [ITEMS.IRON_PICK]: { desc: "Mines Gold/Diamond.", funny: "Tested by generations of miners and memes." },
    [ITEMS.GOLD_PICK]: { desc: "Super fast but breaks quickly.", funny: "Breaks faster than New Year's resolutions." },
    [ITEMS.DIAMOND_PICK]: { desc: "Mines everything fast.", funny: "Turns mountains into pebbles. Mostly." },

    // --- Swords ---
    [ITEMS.WOOD_SWORD]: { desc: "Basic weapon. 4 damage.", funny: "Pointy stick with delusions of grandeur." },
    [ITEMS.STONE_SWORD]: { desc: "Sharper blade. 5 damage.", funny: "Yabba dabba doom." },
    [ITEMS.IRON_SWORD]: { desc: "Reliable blade. 6 damage.", funny: "Swooshy. Pointy. Reliable. A classic trio." },
    [ITEMS.GOLD_SWORD]: { desc: "Pretty but weak. 4 damage.", funny: "Looks heroic. Performs like a butter knife." },
    [ITEMS.DIAMOND_SWORD]: { desc: "Deadly blade. 7 damage.", funny: "An expensive solution to a monster problem." },

    // --- Axes ---
    [ITEMS.WOOD_AXE]: { desc: "Chops wood fast.", funny: "The tree's worst nightmare." },
    [ITEMS.STONE_AXE]: { desc: "Better wood chopping.", funny: "Flannel shirt sold separately." },
    [ITEMS.IRON_AXE]: { desc: "Strong axe for wood.", funny: "Trees unionize at the sight of this." },
    [ITEMS.GOLD_AXE]: { desc: "Fast but fragile.", funny: "Looks great. Gets tired in two swings." },
    [ITEMS.DIAMOND_AXE]: { desc: "Best axe for wood.", funny: "One swing, one forest's worth of trauma." },

    // --- Shovels ---
    [ITEMS.WOOD_SHOVEL]: { desc: "Digs dirt fast.", funny: "Not a knight. Just a dude with a shovel." },
    [ITEMS.STONE_SHOVEL]: { desc: "Better digging.", funny: "Dig it. You're welcome." },
    [ITEMS.IRON_SHOVEL]: { desc: "Strong shovel.", funny: "For secrets, bodies, and buried treasure." },
    [ITEMS.GOLD_SHOVEL]: { desc: "Fast but fragile.", funny: "Breaks before you find anything. Classic." },
    [ITEMS.DIAMOND_SHOVEL]: { desc: "Best shovel.", funny: "Digs so fast, gravity files a complaint." },

    // --- V5: Hoes ---
    [ITEMS.WOOD_HOE]: { desc: "Tills grass/dirt into farmland.", funny: "Hoe, hoe, hoe — it's farming season!" },
    [ITEMS.STONE_HOE]: { desc: "Tills grass/dirt into farmland.", funny: "Plowing through life, one row at a time." },
    [ITEMS.IRON_HOE]: { desc: "Tills grass/dirt into farmland.", funny: "Tills faster than your patience ends." },
    [ITEMS.GOLD_HOE]: { desc: "Tills fast but breaks quickly.", funny: "Farming with drip. Breaks at first glance." },
    [ITEMS.DIAMOND_HOE]: { desc: "Tills forever.", funny: "The cow saw this and called its lawyer." },

    // --- V5: Farming items ---
    [ITEMS.WHEAT_SEEDS]: { desc: "Plant on farmland. RMB to sow.", funny: "One seed, infinite sandwiches." },
    [ITEMS.WHEAT]: { desc: "Ripe grain. Use to craft bread.", funny: "Soon-to-be bread. The crumbs of fate." },

    // --- V6: Buckets ---
    [ITEMS.BUCKET]: { desc: "Carries water or lava. RMB on source to fill.", funny: "An existential crisis in metal form." },
    [ITEMS.WATER_BUCKET]: { desc: "A bucket of water. RMB to pour.", funny: "Warning: first three rows get wet." },
    [ITEMS.LAVA_BUCKET]: { desc: "A bucket of lava. RMB to pour. Careful!", funny: "Spicy! Like, terminally spicy." },

    // --- V7: Liquid blocks ---
    [B.WATER_0]: { desc: "Flowing water. Slows movement.", funny: "Moist alert. Dry pants not guaranteed." },
    [B.LAVA_0]: { desc: "Burning lava. Deals damage and sets you on fire!", funny: "Childhood game intensifies. You lost." },

    // --- V8.4: Fire & TNT ---
    [B.TNT]: { desc: "Explosive block. Ignite with Fire or Flint & Steel.", funny: "Safety glasses not included." },
    [ITEMS.FLINT_AND_STEEL]: { desc: "Ignites fires and TNT. RMB to use.", funny: "Arsonist's best friend." },

    // --- V9: Sand & Gravel ---
    [B.SAND]: { desc: "Falls when unsupported. Found near lakes.", funny: "Pocket beach. Sandcastles not included." },
    [B.GRAVEL]: { desc: "Falls when unsupported. Sometimes drops flint.", funny: "Nature's ball pit. Disappointment guaranteed." },

    // --- V10: Cobblestone, Glass, Bookshelf, Stairs, Slabs, Fences ---
    [B.COBBLESTONE]: { desc: "Rough rock. Smelt to get smooth Stone back.", funny: "Stone, but it forgot to comb its hair." },
    [B.OBSIDIAN]: { desc: "Volcanic rock. Extremely hard. Requires Diamond Pickaxe.", funny: "Tears of a frustrated miner." },
    [B.GLASS]: { desc: "Transparent block. Smelted from Sand. Shears to keep.", funny: "100% see-through. 0% privacy." },
    [B.BOOKSHELF]: { desc: "A shelf of books. Knowledge is power.", funny: "Looks smart, never been read." },
    [B.WOOD_STAIRS]: { desc: "Wooden stairs. For going up.", funny: "Why didn't the wood take the elevator?" },
    [B.COBBLE_STAIRS]: { desc: "Cobblestone stairs. Sturdy.", funny: "Step by step, like a rocky song." },
    [B.STONE_STAIRS]: { desc: "Polished stone stairs.", funny: "Smooth criminal — but stairs." },
    [B.BRICK_STAIRS]: { desc: "Brick stairs. Classic look.", funny: "The Stairway to Brick Heaven." },
    [B.WOOD_SLAB]: { desc: "Half-height wooden block.", funny: "It's a plank, but on a diet." },
    [B.STONE_SLAB]: { desc: "Half-height stone block.", funny: "Half a stone. Twice the regret." },
    [B.COBBLE_SLAB]: { desc: "Half-height cobblestone block.", funny: "Cobble lite — now with 50% less rock." },
    [B.BRICK_SLAB]: { desc: "Half-height brick block.", funny: "A brick, sliced thin like deli meat." },
    [B.WOOD_FENCE]: { desc: "Wooden fence. Keeps mobs out.", funny: "Good fences make good neighbors." },
    [B.COBBLE_FENCE]: { desc: "Cobblestone fence. Tougher than wood.", funny: "Rocks holding hands. Cute." },
    [B.BRICK_FENCE]: { desc: "Brick fence. Premium edition.", funny: "Robust enough to keep out the wolf." },

    // --- V11: New materials & containers ---
    [B.CLAY_BLOCK]: { desc: "Soft clay block. Drops 4 clay items when mined.", funny: "Sculptor's starter pack. Imagination sold separately." },
    [ITEMS.FEATHER]: { desc: "Soft feather. Used for crafting.", funny: "Tickle warning. Use responsibly." },
    [ITEMS.BOOK]: { desc: "A book. Knowledge bound in leather.", funny: "Don't judge it by its cover." },
    [ITEMS.FLINT]: { desc: "Sharp shard from gravel. For Flint & Steel.", funny: "Sparks fly. Eyebrows beware." },
    [ITEMS.CLAY]: { desc: "Lump of clay. Smelt to make a brick.", funny: "Squishy. Disturbingly squishy." },
    [ITEMS.BRICK_ITEM]: { desc: "A fired clay brick. Used to craft Brick Blocks.", funny: "Hard, red, and smells like an oven." },
    [ITEMS.STRING]: { desc: "Thin string. From spiders.", funny: "Strung along — literally." },
    [ITEMS.SPIDER_EYE]: { desc: "Spider eye. Drops from spiders.", funny: "It blinked at me. I think." },
    [ITEMS.ROTTEN_FLESH]: { desc: "Rotten flesh. Drops from zombies. Eating it is risky.", funny: "Smells like Tuesday at the morgue." },
    [ITEMS.BONE]: { desc: "A bone. Drops from skeletons. Craft into Bone Meal.", funny: "Skeleton's emotional support stick." },
    [ITEMS.BONE_MEAL]: { desc: "Bone meal. RMB on wheat to grow it, or on grass for flowers.", funny: "Plant steroids, totally legal." },
    [ITEMS.BOW]: { desc: "A bow. Hold RMB to draw, release to fire an arrow.", funny: "Robin Hood starter pack." },
    [ITEMS.ARROW]: { desc: "An arrow. Ammunition for the Bow.", funny: "Pointy end goes that way." },
    [ITEMS.ENDER_PEARL]: { desc: "Ender pearl. RMB to throw — teleports you on impact.", funny: "One-trip ticket to anywhere. Don't lose it." },
    [ITEMS.GOLD_NUGGET]: { desc: "A small piece of gold. 9 = 1 ingot.", funny: "Pocket-sized bling." },
    [ITEMS.IRON_NUGGET]: { desc: "A small piece of iron. 9 = 1 ingot.", funny: "Tiny but mighty." },
    [ITEMS.EMPTY_BOTTLE]: { desc: "Empty glass bottle. RMB on water to fill.", funny: "Half empty? Try fully empty." },
    [ITEMS.WATER_BOTTLE]: { desc: "Bottle of water. Hold RMB to drink (heals 1 HP).", funny: "Stay hydrated, brave creeper." },

    // --- V12: Doors, trapdoor, lever, ladder + new slab variants ---
    [B.WOOD_DOOR]: { desc: "Wooden door. RMB to open/close. R/F to rotate.", funny: "Knock knock. Who's there? A creeper." },
    [B.WOOD_TRAPDOOR]: { desc: "Wooden trapdoor. RMB to open/close. R/F to rotate.", funny: "Mind your step!" },
    [B.WOOD_GATE]: { desc: "Wooden fence gate. RMB to open/close.", funny: "A polite way to say 'keep out'." },
    [B.LEVER]: { desc: "Place on top/bottom/sides of blocks. RMB to toggle.", funny: "Switching on the chaos." },
    [B.LADDER]: { desc: "Place on background blocks to climb up.", funny: "One rung at a time." },
    [B.DIRT_SLAB]: { desc: "Half-height dirt block.", funny: "Half-baked. Like most plans." },
    [B.SAND_SLAB]: { desc: "Half-height sand block.", funny: "Half the beach, double the sand-in-pants." },
    [B.GLASS_SLAB]: { desc: "Half-height glass block.", funny: "Half see-through. Twice as awkward." },
    [B.BOOKSHELF_SLAB]: { desc: "Half-height bookshelf. For shorter wisdom.", funny: "Half the books, half the dust." },
    // V13: jukebox + music discs
    [B.JUKEBOX]: { desc: "RMB with a Music Disc to play it. RMB empty-handed to eject.", funny: "Drop the needle, hold the silence." },
    [ITEMS.MUSIC_DISC_NOSTALGIC]: { desc: "Music Disc — Nostalgic Action. Use on a Jukebox.", funny: "A B-side from a memory you almost had." },
    [ITEMS.MUSIC_DISC_QUIRKY]: { desc: "Music Disc — Quirky & Funky. Use on a Jukebox.", funny: "Funkier than a wet sheep." },

    // --- V14: Flowers & plants ---
    [B.POPPY]:              { desc: "A bright red poppy. Craft into Red Dye.",       funny: "Poppin' off." },
    [B.DANDELION]:          { desc: "A yellow dandelion. Craft into Yellow Dye.",     funny: "Make a wish!" },
    [B.BLUE_ORCHID]:        { desc: "A blue orchid. Craft into Light Blue Dye.",      funny: "Swamp royalty." },
    [B.ALLIUM]:              { desc: "A magenta allium. Craft into Magenta Dye.",      funny: "Fancy onion." },
    [B.AZURE_BLUET]:        { desc: "A tiny azure bluet. Craft into Light Gray Dye.", funny: "Smol but cute." },
    [B.RED_TULIP]:          { desc: "A red tulip. Craft into Red Dye.",                funny: "Two lips, one petal." },
    [B.ORANGE_TULIP]:       { desc: "An orange tulip. Craft into Orange Dye.",         funny: "Vitamin C-shaped." },
    [B.WHITE_TULIP]:        { desc: "A white tulip. Craft into Light Gray Dye.",       funny: "Pure of heart." },
    [B.PINK_TULIP]:         { desc: "A pink tulip. Craft into Pink Dye.",              funny: "Aww." },
    [B.OXEYE_DAISY]:        { desc: "An oxeye daisy. Craft into Light Gray Dye.",      funny: "Loves me, loves me not." },
    [B.CORNFLOWER]:         { desc: "A cornflower. Craft into Blue Dye.",              funny: "Definitely not corn." },
    [B.LILY_OF_THE_VALLEY]: { desc: "A lily of the valley. Craft into White Dye.",     funny: "Smells better than it sounds." },
    [B.SUNFLOWER_BOTTOM]:   { desc: "A sunflower. 2 blocks tall. Craft into Yellow Dye.", funny: "Always facing the sun." },
    [B.SUNFLOWER_TOP]:      { desc: "The top half of a sunflower.",                    funny: "Petal-rich." },
    [B.LILAC_BOTTOM]:       { desc: "A lilac. 2 blocks tall. Craft into Magenta Dye.", funny: "Smell that?" },
    [B.LILAC_TOP]:          { desc: "The top half of a lilac.",                        funny: "Pretty in lilac." },
    [B.ROSE_BUSH_BOTTOM]:   { desc: "A rose bush. 2 blocks tall. Craft into Red Dye.", funny: "Roses are red, dirt is brown." },
    [B.ROSE_BUSH_TOP]:      { desc: "The top half of a rose bush.",                    funny: "Prickly." },
    [B.PEONY_BOTTOM]:       { desc: "A peony. 2 blocks tall. Craft into Pink Dye.",    funny: "Peony for your thoughts." },
    [B.PEONY_TOP]:          { desc: "The top half of a peony.",                        funny: "Bloomin' beautiful." },
    [B.SHORT_GRASS]:        { desc: "Tall grass. Break to collect Wheat Seeds.",       funny: "Touch grass." },
    [B.TALL_GRASS_BOTTOM]:  { desc: "Tall grass. 2 blocks tall. Drops seeds.",         funny: "Above-average grass." },
    [B.TALL_GRASS_TOP]:     { desc: "The top half of tall grass.",                     funny: "Reach for the sky." },

    [B.SUGARCANE]:          { desc: "Reeds found near water. Craft into sugar or paper.", funny: "Sweet." },
    [ITEMS.SUGAR]:          { desc: "Sweet dust. Use for... something.",               funny: "Cavity incoming." },
    [ITEMS.GLOWSTONE_DUST]: { desc: "Glowing dust. Dropped from Glowstone.",           funny: "Shiny and bright." },
    [ITEMS.PAPER]:          { desc: "Used for crafting books.",                        funny: "Paper cuts hurt." },
    [ITEMS.GUNPOWDER]:      { desc: "Explosive dust. Used to craft TNT.",              funny: "Sneeze and you die." },

    // --- V14: Snow biome ---
    [B.SNOW_BLOCK]:         { desc: "A block of compact snow.",                        funny: "Brrr." },
    [B.SNOW_LAYER]:         { desc: "A thin layer of snow.",                           funny: "Yellow snow not recommended." },
    [B.ICE]:                { desc: "Frozen water. Slippery!",                         funny: "Watch your step." },
    [B.PACKED_ICE]:         { desc: "Hard-packed ice. Doesn't melt.",                  funny: "Cold as ice." },

    // --- Beta 1.1: Desert / Beach blocks ---
    [B.CACTUS]:             { desc: "Prickly desert plant. Hurts to touch!",           funny: "Hug at your own risk." },
    [B.DEAD_BUSH]:          { desc: "A dried-out shrub. Drops sticks.",                funny: "Used to have dreams." },
    [B.SANDSTONE]:          { desc: "Compressed sand. Stronger than sand.",            funny: "Sand, but with ambition." },

    // --- V14: Dyes ---
    [ITEMS.WHITE_DYE]:      { desc: "White dye from Lily of the Valley.",   funny: "Plain." },
    [ITEMS.ORANGE_DYE]:     { desc: "Orange dye from Orange Tulips.",       funny: "Spicy." },
    [ITEMS.MAGENTA_DYE]:    { desc: "Magenta dye from Alliums or Lilacs.",  funny: "Bold choice." },
    [ITEMS.LIGHT_BLUE_DYE]: { desc: "Light blue dye from Blue Orchids.",    funny: "Cool tones." },
    [ITEMS.YELLOW_DYE]:     { desc: "Yellow dye from Dandelions/Sunflowers.", funny: "Sunny." },
    [ITEMS.LIME_DYE]:       { desc: "Lime dye (Green + White).",            funny: "Citrusy." },
    [ITEMS.PINK_DYE]:       { desc: "Pink dye from Pink Tulips or Peony.",  funny: "Tickled pink." },
    [ITEMS.GRAY_DYE]:       { desc: "Gray dye (Black + White).",            funny: "50 shades, just one." },
    [ITEMS.LIGHT_GRAY_DYE]: { desc: "Light gray dye from many flowers.",    funny: "A whisper of color." },
    [ITEMS.CYAN_DYE]:       { desc: "Cyan dye (Blue + Green).",             funny: "Splashy." },
    [ITEMS.PURPLE_DYE]:     { desc: "Purple dye (Red + Blue).",             funny: "Royal stuff." },
    [ITEMS.BLUE_DYE]:       { desc: "Blue dye from Cornflowers.",           funny: "Mood: blue." },
    [ITEMS.BROWN_DYE]:      { desc: "Brown dye from Cocoa Beans (TODO).",   funny: "Earthy." },
    [ITEMS.GREEN_DYE]:      { desc: "Green dye from smelting Cactus (TODO).", funny: "Eco-friendly." },
    [ITEMS.RED_DYE]:        { desc: "Red dye from Poppies, Tulips, Rose Bush.", funny: "Red alert." },
    [ITEMS.BLACK_DYE]:      { desc: "Black dye from Ink Sacs (TODO).",      funny: "Goth phase." },

    // --- Armor: leather ---
    [ITEMS.LEATHER_HELMET]:     { desc: "+1 Armor. Better than nothing.",          funny: "Looks like a wet leaf hat." },
    [ITEMS.LEATHER_CHESTPLATE]: { desc: "+3 Armor. A snug leather vest.",          funny: "Smells like wet cow." },
    [ITEMS.LEATHER_BOOTS]:      { desc: "+1 Armor. Soft leather boots.",           funny: "Squelch squelch." },
    // --- Armor: chain ---
    [ITEMS.CHAIN_HELMET]:       { desc: "+2 Armor. Metal mesh hood.",              funny: "Itchy. Very itchy." },
    [ITEMS.CHAIN_CHESTPLATE]:   { desc: "+5 Armor. Cool, jingly, decent defense.", funny: "Sounds like a chandelier." },
    [ITEMS.CHAIN_BOOTS]:        { desc: "+1 Armor. Chain-link boots.",             funny: "Toes know terror." },
    // --- Armor: iron ---
    [ITEMS.IRON_HELMET]:        { desc: "+2 Armor. Solid metal helm.",             funny: "Echo chamber for your thoughts." },
    [ITEMS.IRON_CHESTPLATE]:    { desc: "+6 Armor. The classic protection.",       funny: "Heavy is the chest that wears the crown." },
    [ITEMS.IRON_BOOTS]:         { desc: "+2 Armor. Iron-clad boots.",              funny: "Tap dance? Forget it." },
    // --- Armor: gold ---
    [ITEMS.GOLD_HELMET]:        { desc: "+2 Armor. Shiny but soft.",               funny: "Royalty starter pack." },
    [ITEMS.GOLD_CHESTPLATE]:    { desc: "+5 Armor. Looks rich, breaks fast.",      funny: "All bling, no bite." },
    [ITEMS.GOLD_BOOTS]:         { desc: "+1 Armor. Crispy gold boots.",            funny: "Drip incoming." },
    // --- Armor: diamond ---
    [ITEMS.DIAMOND_HELMET]:     { desc: "+3 Armor. The ultimate helm.",            funny: "Bling AND survival." },
    [ITEMS.DIAMOND_CHESTPLATE]: { desc: "+8 Armor. Best chest protection.",        funny: "Mob's worst nightmare." },
    [ITEMS.DIAMOND_BOOTS]:      { desc: "+3 Armor. Indestructible boots.",         funny: "Step lightly, walk safely." },

    // Beta 1.0: Nether
    [B.NETHERRACK]:    { desc: "Red rock from the Nether. Burns forever.",        funny: "Smells like dragon farts." },
    [B.SOUL_SAND]:     { desc: "Whispering dark sand from the Nether floor.",     funny: "Don't step in it, it's bottomless." },
    [B.MAGMA_BLOCK]:   { desc: "Crusted-over lava. Burns and glows.",              funny: "Floor is lava — literally." },
    [B.NETHER_BRICK]:  { desc: "Hardened brick from a Nether fortress ruin.",      funny: "Built by something with bigger plans than yours." },
    [B.QUARTZ_ORE]:    { desc: "Quartz ore from the Nether. Mine with a pickaxe.", funny: "Sparkly hell stone." },
    [B.QUARTZ_BLOCK]:  { desc: "Compact Nether Quartz. Decorative block.",        funny: "White like overworld snow." },
    [B.GLOWSTONE]:     { desc: "Brightly glowing block found in the Nether.",     funny: "Built-in night light." },
    [B.PORTAL]:        { desc: "Active Nether portal. Stand inside to travel.",   funny: "Don't blink." },
    [ITEMS.QUARTZ]:    { desc: "Nether Quartz crystal. Used for decoration.",     funny: "Hell's diamonds, kind of." },
    [ITEMS.GHAST_TEAR]:{ desc: "A tear from a sad Ghast. Rare drop.",             funny: "Stings the soul." },
    [ITEMS.FIRE_CHARGE]:{ desc: "A handful of Nether fire. RMB to throw.",        funny: "Tiny ghast spit." },
    [ITEMS.PAINTING]:  { desc: "A beautiful painting. Place on background walls.", funny: "It's art, you wouldn't understand." },
    // V16: Wool descriptions
    [B.WHITE_WOOL]: { desc: "White wool block.", funny: "Sheep's winter coat." },
    [B.ORANGE_WOOL]: { desc: "Orange wool block.", funny: "Bright and fluffy." },
    [B.MAGENTA_WOOL]: { desc: "Magenta wool block.", funny: "A bold fashion statement." },
    [B.LIGHT_BLUE_WOOL]: { desc: "Light blue wool block.", funny: "Fluffy like a cloud." },
    [B.YELLOW_WOOL]: { desc: "Yellow wool block.", funny: "Sunny and soft." },
    [B.LIME_WOOL]: { desc: "Lime wool block.", funny: "Sour apple fluff." },
    [B.PINK_WOOL]: { desc: "Pink wool block.", funny: "Bubblegum sheep." },
    [B.GRAY_WOOL]: { desc: "Gray wool block.", funny: "Gloomy fluff." },
    [B.LIGHT_GRAY_WOOL]: { desc: "Light gray wool block.", funny: "Dusty wool." },
    [B.CYAN_WOOL]: { desc: "Cyan wool block.", funny: "Teal appeal." },
    [B.PURPLE_WOOL]: { desc: "Purple wool block.", funny: "Royal fluff." },
    [B.BLUE_WOOL]: { desc: "Blue wool block.", funny: "Deep blue sea of wool." },
    [B.BROWN_WOOL]: { desc: "Brown wool block.", funny: "Earthy tones." },
    [B.GREEN_WOOL]: { desc: "Green wool block.", funny: "Camouflage sheep." },
    [B.RED_WOOL]: { desc: "Red wool block.", funny: "Stop sign fluff." },
    [B.BLACK_WOOL]: { desc: "Black wool block.", funny: "Baa baa black sheep." },
};

const BLOCKS = {
    [B.AIR]: { color: null, pass: true },
    [B.DIRT]: { color: '#5d4037', hard: 3 },
    [B.GRASS]: { color: '#388e3c', hard: 3, top: '#4caf50' },
    [B.STONE]: { color: '#757575', hard: 8 },
    [B.WOOD]: { color: '#3e2723', hard: 5 },
    [B.LEAF]: { color: '#2e7d32', hard: 1, pass: true },
    [B.COAL_ORE]: { color: '#757575', hard: 10 },
    [B.IRON_ORE]: { color: '#757575', hard: 12 },
    [B.GOLD_ORE]: { color: '#757575', hard: 12 },
    [B.DIAMOND_ORE]: { color: '#757575', hard: 15 },
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
    [B.BED]: { color: '#e53935', hard: 1, pass: true },
    // V5: farming
    [B.FARMLAND]: { color: '#4e342e', hard: 2 },
    [B.WHEAT_0]: { color: '#8bc34a', hard: 0, pass: true },
    [B.WHEAT_1]: { color: '#a5d6a7', hard: 0, pass: true },
    [B.WHEAT_2]: { color: '#cddc39', hard: 0, pass: true },
    [B.WHEAT_3]: { color: '#f9a825', hard: 0, pass: true },

    // V8.4: Fire & TNT
    [B.FIRE]: { color: '#ff9800', hard: 0, pass: true, light: true },
    [B.TNT]: { color: '#d32f2f', hard: 1 },
    // V9: Sand & Gravel
    [B.SAND]: { color: '#e8d9a0', hard: 3 },
    [B.GRAVEL]: { color: '#7a7a7a', hard: 3 },
    // V10: Cobblestone, Glass, Bookshelf
    [B.COBBLESTONE]: { color: '#7a7a7a', hard: 8 },
    [B.OBSIDIAN]: { color: '#1a1025', hard: 40 },
    [B.GLASS]: { color: '#b3e5fc', hard: 1 },
    [B.BOOKSHELF]: { color: '#8d6e63', hard: 4 },
    // V10: Stairs (full collision; visually stepped)
    [B.WOOD_STAIRS]: { color: '#8d6e63', hard: 4 },
    [B.COBBLE_STAIRS]: { color: '#7a7a7a', hard: 8 },
    [B.STONE_STAIRS]: { color: '#9a9a9a', hard: 8 },
    [B.BRICK_STAIRS]: { color: '#8d3e2b', hard: 10 },
    // V10: Slabs (full collision; visually half-height)
    [B.WOOD_SLAB]: { color: '#8d6e63', hard: 3 },
    [B.STONE_SLAB]: { color: '#9a9a9a', hard: 6 },
    [B.COBBLE_SLAB]: { color: '#7a7a7a', hard: 6 },
    [B.BRICK_SLAB]: { color: '#8d3e2b', hard: 8 },
    // V10: Fences (full collision; visually thin)
    [B.WOOD_FENCE]: { color: '#8d6e63', hard: 3 },
    [B.COBBLE_FENCE]: { color: '#7a7a7a', hard: 6 },
    [B.BRICK_FENCE]: { color: '#8d3e2b', hard: 8 },
    // V11: Clay block — soft, drops 4 clay items with shovel
    [B.CLAY_BLOCK]: { color: '#a4b3c4', hard: 3 },
    // V12: Doors / trapdoor / lever / ladder
    // pass=true means player can walk through (closed door blocks via separate logic below)
    [B.WOOD_DOOR]: { color: '#8d6e63', hard: 3, pass: true },
    [B.WOOD_TRAPDOOR]: { color: '#8d6e63', hard: 3, pass: true },
    [B.WOOD_GATE]: { color: '#8d6e63', hard: 3, pass: true },
    [B.LEVER]: { color: '#8d6e63', hard: 1, pass: true },
    [B.LADDER]: { color: '#8d6e63', hard: 1, pass: true },
    // V12: New slab variants
    [B.DIRT_SLAB]: { color: '#5d4037', hard: 3 },
    [B.SAND_SLAB]: { color: '#e8d9a0', hard: 3 },
    [B.GLASS_SLAB]: { color: '#b3e5fc', hard: 1 },
    [B.BOOKSHELF_SLAB]: { color: '#8d6e63', hard: 4 },

    // V16: Wool Blocks
    [B.WHITE_WOOL]: { color: '#fafafa', hard: 1 },
    [B.ORANGE_WOOL]: { color: '#fb8c00', hard: 1 },
    [B.MAGENTA_WOOL]: { color: '#d81b60', hard: 1 },
    [B.LIGHT_BLUE_WOOL]: { color: '#03a9f4', hard: 1 },
    [B.YELLOW_WOOL]: { color: '#fbc02d', hard: 1 },
    [B.LIME_WOOL]: { color: '#7cb342', hard: 1 },
    [B.PINK_WOOL]: { color: '#f48fb1', hard: 1 },
    [B.GRAY_WOOL]: { color: '#616161', hard: 1 },
    [B.LIGHT_GRAY_WOOL]: { color: '#bdbdbd', hard: 1 },
    [B.CYAN_WOOL]: { color: '#00bcd4', hard: 1 },
    [B.PURPLE_WOOL]: { color: '#8e24aa', hard: 1 },
    [B.BLUE_WOOL]: { color: '#1976d2', hard: 1 },
    [B.BROWN_WOOL]: { color: '#795548', hard: 1 },
    [B.GREEN_WOOL]: { color: '#388e3c', hard: 1 },
    [B.RED_WOOL]: { color: '#e53935', hard: 1 },
    [B.BLACK_WOOL]: { color: '#212121', hard: 1 },
    // V13: jukebox — wooden frame with a record on top.
    [B.JUKEBOX]: { color: '#5d4037', hard: 4 },

    // V14: Flowers — pass-through, instant break (hard 0).
    [B.POPPY]:              { color: '#e53935', hard: 0, pass: true, flower: true },
    [B.DANDELION]:          { color: '#fdd835', hard: 0, pass: true, flower: true },
    [B.BLUE_ORCHID]:        { color: '#26c6da', hard: 0, pass: true, flower: true },
    [B.ALLIUM]:              { color: '#ab47bc', hard: 0, pass: true, flower: true },
    [B.AZURE_BLUET]:        { color: '#e1f5fe', hard: 0, pass: true, flower: true },
    [B.RED_TULIP]:          { color: '#e53935', hard: 0, pass: true, flower: true },
    [B.ORANGE_TULIP]:       { color: '#fb8c00', hard: 0, pass: true, flower: true },
    [B.WHITE_TULIP]:        { color: '#eceff1', hard: 0, pass: true, flower: true },
    [B.PINK_TULIP]:         { color: '#f48fb1', hard: 0, pass: true, flower: true },
    [B.OXEYE_DAISY]:        { color: '#fafafa', hard: 0, pass: true, flower: true },
    [B.CORNFLOWER]:         { color: '#3949ab', hard: 0, pass: true, flower: true },
    [B.LILY_OF_THE_VALLEY]: { color: '#f5f5f5', hard: 0, pass: true, flower: true },

    // V14: Tall plants (2-block) — pass-through, instant break.
    [B.SUNFLOWER_BOTTOM]:   { color: '#388e3c', hard: 0, pass: true, flower: true },
    [B.SUNFLOWER_TOP]:      { color: '#fbc02d', hard: 0, pass: true, flower: true },
    [B.LILAC_BOTTOM]:       { color: '#388e3c', hard: 0, pass: true, flower: true },
    [B.LILAC_TOP]:          { color: '#ba68c8', hard: 0, pass: true, flower: true },
    [B.ROSE_BUSH_BOTTOM]:   { color: '#388e3c', hard: 0, pass: true, flower: true },
    [B.ROSE_BUSH_TOP]:      { color: '#c62828', hard: 0, pass: true, flower: true },
    [B.PEONY_BOTTOM]:       { color: '#388e3c', hard: 0, pass: true, flower: true },
    [B.PEONY_TOP]:          { color: '#f8bbd0', hard: 0, pass: true, flower: true },

    // V14: Grass plants — pass-through, instant break (drop seeds).
    [B.SHORT_GRASS]:        { color: '#66bb6a', hard: 0, pass: true, plant: true },
    [B.TALL_GRASS_BOTTOM]:  { color: '#66bb6a', hard: 0, pass: true, plant: true },
    [B.TALL_GRASS_TOP]:     { color: '#81c784', hard: 0, pass: true, plant: true },
    [B.SUGARCANE]:          { color: '#8bc34a', hard: 0, pass: true, plant: true },

    // V14: Snow biome.
    [B.SNOW_BLOCK]:         { color: '#fafafa', hard: 2 },
    [B.SNOW_LAYER]:         { color: '#fafafa', hard: 0, pass: true, snowy: true },
    [B.ICE]:                { color: '#b3e5fc', hard: 3, slippery: true },
    [B.PACKED_ICE]:         { color: '#90caf9', hard: 4, slippery: true },

    // Beta 1.1: Desert / Beach blocks.
    // Кактус — pass=true (игрок проходит сквозь, но получает урон по контакту).
    // Сухой куст — мини-растение, дропает палку.
    // Песчаник — спрессованный песок, твёрже песка, не падает от гравитации.
    [B.CACTUS]:             { color: '#558b2f', hard: 1, pass: true, cactus: true },
    [B.DEAD_BUSH]:          { color: '#8d6e63', hard: 0, pass: true, plant: true },
    [B.SANDSTONE]:          { color: '#e6d59a', hard: 6 },

    // Beta 1.0: Nether blocks.
    // SOUL_SAND — мягкий тёмно-коричневый блок (как в Minecraft, замедляет, но
    // здесь без замедления — добавим визуально для атмосферы).
    // MAGMA_BLOCK — тлеющий блок, излучает свет (light: true), часто рядом с лавой.
    // NETHER_BRICK — прочный декоративный блок руин, как в Nether Fortress.
    [B.SOUL_SAND]:          { color: '#4a342a', hard: 2 },
    [B.MAGMA_BLOCK]:        { color: '#8a2814', hard: 3, light: true },
    [B.NETHER_BRICK]:       { color: '#2a0a0a', hard: 8 },
    [B.NETHERRACK]:         { color: '#6a1e1e', hard: 2 },
    [B.QUARTZ_ORE]:         { color: '#6a1e1e', hard: 6 },
    [B.QUARTZ_BLOCK]:       { color: '#ece4d6', hard: 5 },
    [B.GLOWSTONE]:          { color: '#ffe082', hard: 1, light: true },
    [B.PORTAL]:             { color: '#7b1fa2', hard: 0, pass: true, light: true, portal: true },
};

// V7: регистрируем 8 уровней воды и 8 уровней лавы в BLOCKS.
// pass=true — игрок проходит; liquid — маркер для коллизий/симуляции.
(function registerLiquids() {
    for (let i = 0; i <= 7; i++) {
        BLOCKS[B.WATER_0 + i] = { color: '#1976d2', hard: 0, pass: true, liquid: 'water', level: i };
        BLOCKS[B.LAVA_0 + i] = { color: '#e65100', hard: 0, pass: true, liquid: 'lava', level: i, light: true };
    }
})();

// =====================================================================
// V13: PARTIAL BLOCK COLLISION
// ---------------------------------------------------------------------
// Раньше любой "не-pass" блок был жёстким кубом 32×32 пикселя. Теперь у
// каждого блока есть форма столкновения — список AABB (в пикселях
// относительно левого-верхнего угла своего тайла). Физика сущностей,
// рикошет частиц и проверка «не положу ли я блок в игрока» теперь
// читают этот список вместо того, чтобы считать клетку сплошной.
//
// По умолчанию:
//   pass=true                 → []          (нет коллизии)
//   обычный блок (!pass)      → [полный 32×32]
// Специальные формы (BLOCK_SHAPE):
//   'slab'    — нижняя половина  (32×16)
//   'stairs'  — нижняя половина + ступенька 16×16 по углу, заданному meta.rot
//   'fence'   — центральный столб 8×32 + перекладины к соседним сплошным блокам
//
// Закрытая дверь и закрытый люк формально pass=true, но при этом ставят
// твёрдые AABB — логика «закрыта = пройти нельзя» сохраняется.
// =====================================================================
// =====================================================================
// Beta 1.1: BIOME CLIMATE (temperature & humidity, Minecraft-style)
// ---------------------------------------------------------------------
// Каждому биому задаём температуру и влажность по канонической шкале
// Майнкрафта (т ≈ 0.0..2.0, влажность 0.0..1.0):
//   snow    — холодный, средняя влажность
//   ocean   — прохладный, влажный
//   beach   — тёплый, средне-влажный
//   plains  — умеренный, средне-влажный
//   desert  — горячий, сухой
// Используется для:
//   • замораживания воды (temperature < 0.15 = вода превращается в лёд),
//   • выбора снега vs дождя (cold → снег, hot → нет осадков),
//   • контактного урона кактусом (только desert),
//   • базового цвета травы (косвенно: snow → snow_layer, desert → песок).
// =====================================================================
const BIOME_CLIMATE = {
    'snow':       { temperature: 0.0, humidity: 0.5, sandy: false, dry: false, frozen: true  },
    'ocean':      { temperature: 0.5, humidity: 0.5, sandy: false, dry: false, frozen: false },
    'beach':      { temperature: 0.8, humidity: 0.4, sandy: true,  dry: false, frozen: false },
    'plains':     { temperature: 0.8, humidity: 0.4, sandy: false, dry: false, frozen: false },
    'desert':     { temperature: 2.0, humidity: 0.0, sandy: true,  dry: true,  frozen: false },
    'cave_area':  { temperature: 0.8, humidity: 0.4, sandy: false, dry: false, frozen: false },
};
function getBiomeClimate(biome) {
    return BIOME_CLIMATE[biome] || BIOME_CLIMATE['plains'];
}

const BLOCK_SHAPE = {};
[B.WOOD_SLAB, B.STONE_SLAB, B.COBBLE_SLAB, B.BRICK_SLAB,
 B.DIRT_SLAB, B.SAND_SLAB, B.GLASS_SLAB, B.BOOKSHELF_SLAB]
    .forEach(id => BLOCK_SHAPE[id] = 'slab');
[B.WOOD_STAIRS, B.COBBLE_STAIRS, B.STONE_STAIRS, B.BRICK_STAIRS]
    .forEach(id => BLOCK_SHAPE[id] = 'stairs');
[B.WOOD_FENCE, B.COBBLE_FENCE, B.BRICK_FENCE]
    .forEach(id => BLOCK_SHAPE[id] = 'fence');

// Максимальная высота "ступеньки", на которую сущность сама шагает
// без прыжка (auto step-up). 17 px чуть больше половины тайла —
// этого достаточно для полублока / нижнего марша ступенек, но
// сплошной блок (32 px) не пускает.
const STEP_UP_MAX = 17;

// Возвращает массив AABB в пикселях относительно (0,0) своего тайла.
// `rotOverride` нужен для превью при установке: «как будет выглядеть
// коллизия, если я положу блок с rot=R», когда meta ещё не записана.
function getBlockAABBs(id, tx, ty, rotOverride) {
    if (id === B.AIR) return EMPTY_AABBS;
    const b = BLOCKS[id];
    if (!b) return EMPTY_AABBS;

    // Двери и люки: формально pass=true, но в "закрытом" состоянии — твёрдые.
    if (id === B.WOOD_DOOR) {
        const m = (typeof world !== 'undefined' && world && world.blockMeta)
            ? world.blockMeta[`${tx},${ty},1`] : null; // 1 = LAYER.MID
        if (m && m.state === 'open') return EMPTY_AABBS;
        return FULL_AABBS;
    }
    if (id === B.WOOD_GATE) {
        const m = (typeof world !== 'undefined' && world && world.blockMeta)
            ? world.blockMeta[`${tx},${ty},1`] : null;
        if (m && m.state === 'open') return EMPTY_AABBS;
        return FULL_AABBS;
    }
    if (id === B.WOOD_TRAPDOOR) {
        const m = (typeof world !== 'undefined' && world && world.blockMeta)
            ? world.blockMeta[`${tx},${ty},1`] : null;
        if (m && m.state === 'open') return EMPTY_AABBS;
        // Закрытый люк = тонкая твёрдая плита поверх клетки.
        return [{ x: 0, y: 0, w: TILE_SIZE, h: Math.max(4, TILE_SIZE * 0.18) }];
    }

    if (b.pass) return EMPTY_AABBS;

    const shape = BLOCK_SHAPE[id];
    if (!shape) return FULL_AABBS;

    const HALF = TILE_SIZE / 2;

    if (shape === 'slab') {
        return SLAB_AABBS;
    }

    if (shape === 'fence') {
        const POST = Math.round(TILE_SIZE * 0.25);
        const POST_X = (TILE_SIZE - POST) / 2;
        const aabbs = [{ x: POST_X, y: 0, w: POST, h: TILE_SIZE }];
        // Перекладины к соседям, если те являются сплошными блоками.
        if (typeof world !== 'undefined' && world) {
            const RAIL_H = Math.round(TILE_SIZE * 0.18);
            const RAIL_TOP_Y = Math.round(TILE_SIZE * 0.22);
            const RAIL_MID_Y = Math.round(TILE_SIZE * 0.62);
            const connects = (otherId) => {
                if (otherId === B.AIR) return false;
                const ob = BLOCKS[otherId];
                if (!ob) return false;
                if (ob.pass) {
                    // Только закрытая дверь среди pass-блоков считается твёрдой
                    return (otherId === B.WOOD_DOOR);
                }
                return true;
            };
            if (connects(world.getTile(tx - 1, ty))) {
                aabbs.push({ x: 0, y: RAIL_TOP_Y, w: POST_X, h: RAIL_H });
                aabbs.push({ x: 0, y: RAIL_MID_Y, w: POST_X, h: RAIL_H });
            }
            if (connects(world.getTile(tx + 1, ty))) {
                const rx = POST_X + POST;
                aabbs.push({ x: rx, y: RAIL_TOP_Y, w: TILE_SIZE - rx, h: RAIL_H });
                aabbs.push({ x: rx, y: RAIL_MID_Y, w: TILE_SIZE - rx, h: RAIL_H });
            }
        }
        return aabbs;
    }

    if (shape === 'stairs') {
        let rot = rotOverride;
        if (rot === undefined) {
            const meta = (typeof world !== 'undefined' && world && world.blockMeta)
                ? world.blockMeta[`${tx},${ty},1`] : null;
            rot = (meta && meta.rot) || 0;
        }
        rot = ((rot % 4) + 4) % 4;
        // rot=0 (визуал по drawBlock): нижняя половина целиком + угол слева сверху.
        // Поворот идёт по часовой стрелке (как ctx.rotate(rot * π/2)):
        //   1 → левая колонка + правый верхний угол
        //   2 → верхняя половина целиком + правый нижний угол
        //   3 → правая колонка + левый нижний угол
        if (rot === 0) return [
            { x: 0,    y: HALF, w: TILE_SIZE, h: HALF },
            { x: 0,    y: 0,    w: HALF,      h: HALF },
        ];
        if (rot === 1) return [
            { x: 0,    y: 0,    w: HALF,      h: TILE_SIZE },
            { x: HALF, y: 0,    w: HALF,      h: HALF },
        ];
        if (rot === 2) return [
            { x: 0,    y: 0,    w: TILE_SIZE, h: HALF },
            { x: HALF, y: HALF, w: HALF,      h: HALF },
        ];
        return [
            { x: HALF, y: 0,    w: HALF,      h: TILE_SIZE },
            { x: 0,    y: HALF, w: HALF,      h: HALF },
        ];
    }

    return FULL_AABBS;
}

// Кешированные «обычные» формы — чтобы не аллоцировать массив на каждом
// тике для миллионов вызовов на сплошных блоках.
const EMPTY_AABBS = Object.freeze([]);
const FULL_AABBS  = Object.freeze([Object.freeze({ x: 0, y: 0, w: TILE_SIZE, h: TILE_SIZE })]);
const SLAB_AABBS  = Object.freeze([Object.freeze({ x: 0, y: TILE_SIZE / 2, w: TILE_SIZE, h: TILE_SIZE / 2 })]);

// Пересекаются ли два AABB?
function aabbIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Точечная проверка: попадает ли (px,py) в коллизию мира?
function pointInWorldCollision(px, py) {
    if (typeof world === 'undefined' || !world) return false;
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    const id = world.getTile(tx, ty);
    if (id === B.AIR) return false;
    const aabbs = getBlockAABBs(id, tx, ty);
    for (let i = 0; i < aabbs.length; i++) {
        const a = aabbs[i];
        const ax = tx * TILE_SIZE + a.x;
        const ay = ty * TILE_SIZE + a.y;
        if (px >= ax && px < ax + a.w && py >= ay && py < ay + a.h) return true;
    }
    return false;
}

// AABB-сущность vs мир: пересекает ли (x,y,w,h) хоть один AABB любого блока
// в покрываемой области? Используется для проверки места при установке блоков
// и при поиске «свободно ли над головой» в auto step-up.
function aabbIntersectsWorld(x, y, w, h, map) {
    const m = map || world;
    if (!m) return false;
    const minX = Math.floor(x / TILE_SIZE);
    const maxX = Math.floor((x + w - 0.01) / TILE_SIZE);
    const minY = Math.floor(y / TILE_SIZE);
    const maxY = Math.floor((y + h - 0.01) / TILE_SIZE);
    for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
            const id = m.getTile(tx, ty);
            if (id === B.AIR) continue;
            const aabbs = getBlockAABBs(id, tx, ty);
            for (let i = 0; i < aabbs.length; i++) {
                const a = aabbs[i];
                const ax = tx * TILE_SIZE + a.x;
                const ay = ty * TILE_SIZE + a.y;
                if (aabbIntersect(x, y, w, h, ax, ay, a.w, a.h)) return true;
            }
        }
    }
    return false;
}

// Версия aabbIntersectsWorld для проверки места под планируемую установку
// блока. Если планируемый блок имеет частичную форму (например, полублок),
// игрок может стоять в верхней половине той же клетки — и установка
// разрешается. tileTx/tileTy/placedId/placedRot задают будущий блок.
function entityIntersectsPlacedBlock(entityX, entityY, entityW, entityH, tileTx, tileTy, placedId, placedRot) {
    const aabbs = getBlockAABBs(placedId, tileTx, tileTy, placedRot);
    for (let i = 0; i < aabbs.length; i++) {
        const a = aabbs[i];
        const ax = tileTx * TILE_SIZE + a.x;
        const ay = tileTy * TILE_SIZE + a.y;
        if (aabbIntersect(entityX, entityY, entityW, entityH, ax, ay, a.w, a.h)) return true;
    }
    return false;
}

const SMELT_RECIPES = {
    [ITEMS.PORK_RAW]: ITEMS.PORK_COOKED,
    [ITEMS.BEEF_RAW]: ITEMS.BEEF_COOKED,
    [ITEMS.MUTTON_RAW]: ITEMS.MUTTON_COOKED,
    [B.IRON_ORE]: ITEMS.IRON_INGOT,
    [B.GOLD_ORE]: ITEMS.GOLD_INGOT,
    // V10: песок → стекло, булыжник → гладкий камень
    [B.SAND]: B.GLASS,
    [B.COBBLESTONE]: B.STONE,
    // V11: глина (предмет) → кирпич
    [ITEMS.CLAY]: ITEMS.BRICK_ITEM,
};
const FUELS = {
    [ITEMS.COAL]: 80, [B.COAL_BLOCK]: 800,
    [B.WOOD]: 15, [B.PLANK]: 15, [ITEMS.STICK]: 5,
    // V7: ведро лавы — долгое топливо как в MC (20000 тиков = ~1000 секунд при x20 скорости горения)
    [ITEMS.LAVA_BUCKET]: 1000,
    // V10: деревянные ступени, полублоки, заборы и книжные полки горят как доски
    [B.WOOD_STAIRS]: 15, [B.WOOD_SLAB]: 7, [B.WOOD_FENCE]: 15, [B.BOOKSHELF]: 15,
    // V12: деревянные двери, люк, лестница, рычаг и книжная полка-полублок тоже горят
    [B.WOOD_DOOR]: 10, [B.WOOD_TRAPDOOR]: 7, [B.LADDER]: 5, [B.LEVER]: 3, [B.BOOKSHELF_SLAB]: 7, [B.WOOD_GATE]: 10,
};

// Shape-based рецепты в стиле Minecraft.
//   shape   — массив строк (rows), символы = ингредиенты по позициям.
//             '.' или ' ' = пустая клетка.
//   key     — карта символ → id предмета.
//   shapeless — список id предметов (по 1 шт каждый), без формы.
// Пол-универсально: рецепт работает в 2x2 если его shape <= 2x2 или shapeless <= 4.
// Иначе требует верстак (3x3).
//
// Старые рецепты с `in: [...]` — это слитные превращения блоков (9-в-1 и обратно).
const RECIPES = [
    { out: { id: B.GLOWSTONE, n: 1 }, shape: [['D','D'],['D','D']], key: { D: ITEMS.GLOWSTONE_DUST } },
    // === БАЗОВЫЕ 2x2-РЕЦЕПТЫ ===
    { out: { id: ITEMS.PLANK,    n: 4 }, shape: [['W']],           key: { W: B.WOOD } },
    { out: { id: ITEMS.STICK,    n: 4 }, shape: [['P'], ['P']],    key: { P: ITEMS.PLANK } },
    { out: { id: B.WORKBENCH,    n: 1 }, shape: [['P','P'], ['P','P']], key: { P: ITEMS.PLANK } },
    { out: { id: ITEMS.TORCH,    n: 4 }, shape: [['C'], ['S']],    key: { C: ITEMS.COAL, S: ITEMS.STICK } },

    // === 3x3 БЛОКИ ===
    { out: { id: ITEMS.PAINTING, n: 1 }, shape: [['S','S','S'],['S','W','S'],['S','S','S']], key: { S: ITEMS.STICK, W: ITEMS.WHITE_WOOL } },
    { out: { id: B.CHEST,    n: 1 }, shape: [['P','P','P'],['P','.','P'],['P','P','P']], key: { P: ITEMS.PLANK } },
    { out: { id: B.FURNACE,  n: 1 }, shape: [['S','S','S'],['S','.','S'],['S','S','S']], key: { S: B.COBBLESTONE } },

    // === ИНСТРУМЕНТЫ (3x3) ===
    // Pickaxes — 3 материала сверху, палка в середине, палка снизу.
    { out: { id: ITEMS.WOOD_PICK,    n: 1 }, shape: [['P','P','P'],['.','S','.'],['.','S','.']], key: { P: ITEMS.PLANK,        S: ITEMS.STICK } },
    { out: { id: ITEMS.STONE_PICK,   n: 1 }, shape: [['M','M','M'],['.','S','.'],['.','S','.']], key: { M: B.COBBLESTONE,      S: ITEMS.STICK } },
    { out: { id: ITEMS.IRON_PICK,    n: 1 }, shape: [['M','M','M'],['.','S','.'],['.','S','.']], key: { M: ITEMS.IRON_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.GOLD_PICK,    n: 1 }, shape: [['M','M','M'],['.','S','.'],['.','S','.']], key: { M: ITEMS.GOLD_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.DIAMOND_PICK, n: 1 }, shape: [['M','M','M'],['.','S','.'],['.','S','.']], key: { M: ITEMS.DIAMOND,      S: ITEMS.STICK } },

    // Swords — 1 материал сверху, 1 материал в центре, палка снизу.
    { out: { id: ITEMS.WOOD_SWORD,    n: 1 }, shape: [['P'],['P'],['S']], key: { P: ITEMS.PLANK,      S: ITEMS.STICK } },
    { out: { id: ITEMS.STONE_SWORD,   n: 1 }, shape: [['M'],['M'],['S']], key: { M: B.COBBLESTONE,    S: ITEMS.STICK } },
    { out: { id: ITEMS.IRON_SWORD,    n: 1 }, shape: [['M'],['M'],['S']], key: { M: ITEMS.IRON_INGOT, S: ITEMS.STICK } },
    { out: { id: ITEMS.GOLD_SWORD,    n: 1 }, shape: [['M'],['M'],['S']], key: { M: ITEMS.GOLD_INGOT, S: ITEMS.STICK } },
    { out: { id: ITEMS.DIAMOND_SWORD, n: 1 }, shape: [['M'],['M'],['S']], key: { M: ITEMS.DIAMOND,    S: ITEMS.STICK } },

    // Axes — топор: 2 материала + палка
    { out: { id: ITEMS.WOOD_AXE,    n: 1 }, shape: [['P','P'],['P','S'],['.','S']], key: { P: ITEMS.PLANK,        S: ITEMS.STICK } },
    { out: { id: ITEMS.STONE_AXE,   n: 1 }, shape: [['M','M'],['M','S'],['.','S']], key: { M: B.COBBLESTONE,      S: ITEMS.STICK } },
    { out: { id: ITEMS.IRON_AXE,    n: 1 }, shape: [['M','M'],['M','S'],['.','S']], key: { M: ITEMS.IRON_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.GOLD_AXE,    n: 1 }, shape: [['M','M'],['M','S'],['.','S']], key: { M: ITEMS.GOLD_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.DIAMOND_AXE, n: 1 }, shape: [['M','M'],['M','S'],['.','S']], key: { M: ITEMS.DIAMOND,      S: ITEMS.STICK } },

    // Shovels — 1 материал + 2 палки
    { out: { id: ITEMS.WOOD_SHOVEL,    n: 1 }, shape: [['P'],['S'],['S']], key: { P: ITEMS.PLANK,        S: ITEMS.STICK } },
    { out: { id: ITEMS.STONE_SHOVEL,   n: 1 }, shape: [['M'],['S'],['S']], key: { M: B.COBBLESTONE,      S: ITEMS.STICK } },
    { out: { id: ITEMS.IRON_SHOVEL,    n: 1 }, shape: [['M'],['S'],['S']], key: { M: ITEMS.IRON_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.GOLD_SHOVEL,    n: 1 }, shape: [['M'],['S'],['S']], key: { M: ITEMS.GOLD_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.DIAMOND_SHOVEL, n: 1 }, shape: [['M'],['S'],['S']], key: { M: ITEMS.DIAMOND,      S: ITEMS.STICK } },

    // Hoes — 2 материала горизонтально, 2 палки вниз
    { out: { id: ITEMS.WOOD_HOE,    n: 1 }, shape: [['P','P'],['.','S'],['.','S']], key: { P: ITEMS.PLANK,        S: ITEMS.STICK } },
    { out: { id: ITEMS.STONE_HOE,   n: 1 }, shape: [['M','M'],['.','S'],['.','S']], key: { M: B.COBBLESTONE,      S: ITEMS.STICK } },
    { out: { id: ITEMS.IRON_HOE,    n: 1 }, shape: [['M','M'],['.','S'],['.','S']], key: { M: ITEMS.IRON_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.GOLD_HOE,    n: 1 }, shape: [['M','M'],['.','S'],['.','S']], key: { M: ITEMS.GOLD_INGOT,   S: ITEMS.STICK } },
    { out: { id: ITEMS.DIAMOND_HOE, n: 1 }, shape: [['M','M'],['.','S'],['.','S']], key: { M: ITEMS.DIAMOND,      S: ITEMS.STICK } },

    // Ножницы — 2 железа по диагонали
    { out: { id: ITEMS.SHEARS, n: 1 }, shape: [['.','I'],['I','.']], key: { I: ITEMS.IRON_INGOT } },

    { out: { id: B.BED, n: 1 }, shape: [['W','W','W'],['P','P','P']], key: { W: WOOL_GROUP, P: ITEMS.PLANK } },

    // V16: Bow — 3 sticks + 3 strings (Minecraft layout simplified)
    { out: { id: ITEMS.BOW, n: 1 }, in: [{ id: ITEMS.STICK, n: 3 }, { id: ITEMS.STRING, n: 3 }], reqBench: true },
    // V16: Arrow — 1 flint + 1 stick + 1 feather → 4 arrows
    { out: { id: ITEMS.ARROW, n: 4 }, in: [{ id: ITEMS.FLINT, n: 1 }, { id: ITEMS.STICK, n: 1 }, { id: ITEMS.FEATHER, n: 1 }], reqBench: false },
    // V16: Bone meal — 1 bone → 3 bone meal
    { out: { id: ITEMS.BONE_MEAL, n: 3 }, in: [{ id: ITEMS.BONE, n: 1 }], reqBench: false },

    // === БЛОЧНЫЕ ПРЕВРАЩЕНИЯ (9-в-1 и обратно) — legacy формат ===
    { out: { id: B.COAL_BLOCK, n: 1 }, in: [{ id: ITEMS.COAL, n: 9 }], reqBench: true },
    { out: { id: ITEMS.COAL, n: 9 }, in: [{ id: B.COAL_BLOCK, n: 1 }], reqBench: false },
    { out: { id: B.IRON_BLOCK, n: 1 }, in: [{ id: ITEMS.IRON_INGOT, n: 9 }], reqBench: true },
    { out: { id: ITEMS.IRON_INGOT, n: 9 }, in: [{ id: B.IRON_BLOCK, n: 1 }], reqBench: false },
    { out: { id: B.DIAMOND_BLOCK, n: 1 }, in: [{ id: ITEMS.DIAMOND, n: 9 }], reqBench: true },
    { out: { id: ITEMS.DIAMOND, n: 9 }, in: [{ id: B.DIAMOND_BLOCK, n: 1 }], reqBench: false },
    { out: { id: B.GOLD_BLOCK, n: 1 }, in: [{ id: ITEMS.GOLD_INGOT, n: 9 }], reqBench: true },
    { out: { id: ITEMS.GOLD_INGOT, n: 9 }, in: [{ id: B.GOLD_BLOCK, n: 1 }], reqBench: true },
    // Beta 1.0: Nether Quartz Block from 4 quartz (2x2)
    { out: { id: B.QUARTZ_BLOCK, n: 1 }, in: [{ id: ITEMS.QUARTZ, n: 4 }], reqBench: true },

    // === ДОПОЛНИТЕЛЬНЫЕ 3x3 РЕЦЕПТЫ ===
    // Bread: 3 пшеницы в ряд
    { out: { id: ITEMS.BREAD,  n: 1 }, shape: [['W','W','W']],                            key: { W: ITEMS.WHEAT } },
    // Bucket: 3 железа V-образно
    { out: { id: ITEMS.BUCKET, n: 1 }, shape: [['I','.','I'],['.','I','.']],              key: { I: ITEMS.IRON_INGOT } },
    // Brick block: 4 brick-item 2x2
    { out: { id: B.BRICK,      n: 1 }, shape: [['B','B'],['B','B']],                      key: { B: ITEMS.BRICK_ITEM } },
    // Bookshelf: 3 книги в середине, 6 досок сверху и снизу
    { out: { id: B.BOOKSHELF,  n: 1 }, shape: [['P','P','P'],['B','B','B'],['P','P','P']], key: { P: ITEMS.PLANK, B: ITEMS.BOOK } },

    // Flint & Steel: shapeless — кремень + железо
    { out: { id: ITEMS.FLINT_AND_STEEL, n: 1 }, shapeless: [ITEMS.IRON_INGOT, ITEMS.FLINT] },

    // TNT: чередуем песок и порох (упрощённо)
    { out: { id: B.TNT, n: 1 }, in: [{ id: B.SAND, n: 4 }, { id: ITEMS.GUNPOWDER, n: 5 }], reqBench: true },

    // --- V10: Stairs — stairs-shape (6 материала → 4 ступеньки) ---
    // Shape is required to disambiguate from doors/trapdoors which also use 6 planks.
    { out: { id: B.WOOD_STAIRS, n: 4 }, shape: [['M','.','.'],['M','M','.'],['M','M','M']], key: { M: ITEMS.PLANK },     reqBench: true },
    { out: { id: B.COBBLE_STAIRS, n: 4 }, shape: [['M','.','.'],['M','M','.'],['M','M','M']], key: { M: B.COBBLESTONE }, reqBench: true },
    { out: { id: B.STONE_STAIRS, n: 4 }, shape: [['M','.','.'],['M','M','.'],['M','M','M']], key: { M: B.STONE },       reqBench: true },
    { out: { id: B.BRICK_STAIRS, n: 4 }, shape: [['M','.','.'],['M','M','.'],['M','M','M']], key: { M: B.BRICK },       reqBench: true },

    // --- V10: Slabs — single row (3 материала → 6 полублоков) ---
    { out: { id: B.WOOD_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: ITEMS.PLANK },      reqBench: true },
    { out: { id: B.STONE_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.STONE },         reqBench: true },
    { out: { id: B.COBBLE_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.COBBLESTONE },  reqBench: true },
    { out: { id: B.BRICK_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.BRICK },         reqBench: true },

    // --- V10: Fences (4 материала + 2 палки → 3 забора) ---
    { out: { id: B.WOOD_FENCE, n: 3 }, in: [{ id: ITEMS.PLANK, n: 4 }, { id: ITEMS.STICK, n: 2 }], reqBench: true },
    { out: { id: B.COBBLE_FENCE, n: 3 }, in: [{ id: B.COBBLESTONE, n: 4 }, { id: ITEMS.STICK, n: 2 }], reqBench: true },
    { out: { id: B.BRICK_FENCE, n: 3 }, in: [{ id: B.BRICK, n: 4 }, { id: ITEMS.STICK, n: 2 }], reqBench: true },

    // --- V11: Book — обложка из кожи, страницы из бумаги ---
    { out: { id: ITEMS.BOOK, n: 1 }, in: [{ id: ITEMS.LEATHER, n: 1 }, { id: ITEMS.PAPER, n: 3 }], reqBench: false },
    { out: { id: ITEMS.PAPER, n: 3 }, in: [{ id: B.SUGARCANE, n: 3 }], reqBench: false },
    { out: { id: ITEMS.SUGAR, n: 1 }, in: [{ id: B.SUGARCANE, n: 1 }], reqBench: false },

    // --- V11: Iron / Gold ingot ↔ nugget (туда и обратно) ---
    { out: { id: ITEMS.IRON_NUGGET, n: 9 }, in: [{ id: ITEMS.IRON_INGOT, n: 1 }], reqBench: false },
    { out: { id: ITEMS.IRON_INGOT, n: 1 }, in: [{ id: ITEMS.IRON_NUGGET, n: 9 }], reqBench: false },
    { out: { id: ITEMS.GOLD_NUGGET, n: 9 }, in: [{ id: ITEMS.GOLD_INGOT, n: 1 }], reqBench: false },
    { out: { id: ITEMS.GOLD_INGOT, n: 1 }, in: [{ id: ITEMS.GOLD_NUGGET, n: 9 }], reqBench: false },

    // --- V11: 4 нитки → 1 шерсть (как в Minecraft) ---
    { out: { id: ITEMS.WHITE_WOOL, n: 1 }, in: [{ id: ITEMS.STRING, n: 4 }], reqBench: false },

    // --- V11: 4 глины (предмета) → 1 блок глины; и обратно ---
    { out: { id: B.CLAY_BLOCK, n: 1 }, in: [{ id: ITEMS.CLAY, n: 4 }], reqBench: false },

    // --- V11: 3 стекла → 3 пустых бутылки ---
    { out: { id: ITEMS.EMPTY_BOTTLE, n: 3 }, in: [{ id: B.GLASS, n: 3 }], reqBench: true },

    // --- V12: Doors, trapdoor, lever, ladder + new slab variants ---
    // Door: 2-wide × 3-tall — same 6 planks as stairs/trapdoor, shape disambiguates.
    { out: { id: B.WOOD_DOOR, n: 3 }, shape: [['M','M'],['M','M'],['M','M']], key: { M: ITEMS.PLANK }, reqBench: true },
    // Trapdoor: 3-wide × 2-tall — same 6 planks, shape disambiguates.
    { out: { id: B.WOOD_TRAPDOOR, n: 2 }, shape: [['M','M','M'],['M','M','M']], key: { M: ITEMS.PLANK }, reqBench: true },
    { out: { id: B.WOOD_GATE, n: 1 }, shape: [['S','M','S'],['S','M','S']], key: { S: ITEMS.STICK, M: ITEMS.PLANK }, reqBench: true },
    { out: { id: B.LEVER, n: 1 }, in: [{ id: ITEMS.STICK, n: 1 }, { id: B.COBBLESTONE, n: 1 }], reqBench: false },
    { out: { id: B.LADDER, n: 3 }, in: [{ id: ITEMS.STICK, n: 7 }], reqBench: true },
    { out: { id: B.DIRT_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.DIRT },      reqBench: true },
    { out: { id: B.SAND_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.SAND },      reqBench: true },
    { out: { id: B.GLASS_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.GLASS },    reqBench: true },
    { out: { id: B.BOOKSHELF_SLAB, n: 6 }, shape: [['M','M','M']], key: { M: B.BOOKSHELF }, reqBench: true },

    // --- V13: Jukebox — 8 planks + 1 diamond (like Minecraft) ---
    { out: { id: B.JUKEBOX, n: 1 }, in: [{ id: ITEMS.PLANK, n: 8 }, { id: ITEMS.DIAMOND, n: 1 }], reqBench: true },

    // --- V14: Dye crafting from flowers (1 flower → 1 dye, 2-block flowers → 2 dyes) ---
    { out: { id: ITEMS.RED_DYE,        n: 1 }, in: [{ id: B.POPPY,              n: 1 }], reqBench: false },
    { out: { id: ITEMS.RED_DYE,        n: 1 }, in: [{ id: B.RED_TULIP,          n: 1 }], reqBench: false },
    { out: { id: ITEMS.RED_DYE,        n: 2 }, in: [{ id: B.ROSE_BUSH_BOTTOM,   n: 1 }], reqBench: false },
    { out: { id: ITEMS.YELLOW_DYE,     n: 1 }, in: [{ id: B.DANDELION,          n: 1 }], reqBench: false },
    { out: { id: ITEMS.YELLOW_DYE,     n: 2 }, in: [{ id: B.SUNFLOWER_BOTTOM,   n: 1 }], reqBench: false },
    { out: { id: ITEMS.LIGHT_BLUE_DYE, n: 1 }, in: [{ id: B.BLUE_ORCHID,        n: 1 }], reqBench: false },
    { out: { id: ITEMS.MAGENTA_DYE,    n: 1 }, in: [{ id: B.ALLIUM,             n: 1 }], reqBench: false },
    { out: { id: ITEMS.MAGENTA_DYE,    n: 2 }, in: [{ id: B.LILAC_BOTTOM,       n: 1 }], reqBench: false },
    { out: { id: ITEMS.LIGHT_GRAY_DYE, n: 1 }, in: [{ id: B.AZURE_BLUET,        n: 1 }], reqBench: false },
    { out: { id: ITEMS.LIGHT_GRAY_DYE, n: 1 }, in: [{ id: B.WHITE_TULIP,        n: 1 }], reqBench: false },
    { out: { id: ITEMS.LIGHT_GRAY_DYE, n: 1 }, in: [{ id: B.OXEYE_DAISY,        n: 1 }], reqBench: false },
    { out: { id: ITEMS.ORANGE_DYE,     n: 1 }, in: [{ id: B.ORANGE_TULIP,       n: 1 }], reqBench: false },
    { out: { id: ITEMS.PINK_DYE,       n: 1 }, in: [{ id: B.PINK_TULIP,         n: 1 }], reqBench: false },
    { out: { id: ITEMS.PINK_DYE,       n: 2 }, in: [{ id: B.PEONY_BOTTOM,       n: 1 }], reqBench: false },
    { out: { id: ITEMS.BLUE_DYE,       n: 1 }, in: [{ id: B.CORNFLOWER,         n: 1 }], reqBench: false },
    { out: { id: ITEMS.WHITE_DYE,      n: 1 }, in: [{ id: B.LILY_OF_THE_VALLEY, n: 1 }], reqBench: false },

    // V14: Mixed dye recipes (vanilla Minecraft mixing rules).
    { out: { id: ITEMS.LIME_DYE,    n: 2 }, in: [{ id: ITEMS.GREEN_DYE, n: 1 }, { id: ITEMS.WHITE_DYE, n: 1 }], reqBench: false },
    { out: { id: ITEMS.GRAY_DYE,    n: 2 }, in: [{ id: ITEMS.BLACK_DYE, n: 1 }, { id: ITEMS.WHITE_DYE, n: 1 }], reqBench: false },
    { out: { id: ITEMS.CYAN_DYE,    n: 2 }, in: [{ id: ITEMS.BLUE_DYE,  n: 1 }, { id: ITEMS.GREEN_DYE, n: 1 }], reqBench: false },
    { out: { id: ITEMS.PURPLE_DYE,  n: 2 }, in: [{ id: ITEMS.BLUE_DYE,  n: 1 }, { id: ITEMS.RED_DYE,   n: 1 }], reqBench: false },
    { out: { id: ITEMS.PINK_DYE,    n: 2 }, in: [{ id: ITEMS.RED_DYE,   n: 1 }, { id: ITEMS.WHITE_DYE, n: 1 }], reqBench: false },
    { out: { id: ITEMS.LIGHT_GRAY_DYE, n: 2 }, in: [{ id: ITEMS.GRAY_DYE, n: 1 }, { id: ITEMS.WHITE_DYE, n: 1 }], reqBench: false },
    { out: { id: ITEMS.ORANGE_DYE,  n: 2 }, in: [{ id: ITEMS.RED_DYE,   n: 1 }, { id: ITEMS.YELLOW_DYE, n: 1 }], reqBench: false },
    { out: { id: ITEMS.MAGENTA_DYE, n: 2 }, in: [{ id: ITEMS.PURPLE_DYE, n: 1 }, { id: ITEMS.PINK_DYE, n: 1 }], reqBench: false },

    // V14: Snow biome crafting.
    { out: { id: B.SNOW_BLOCK,  n: 1 }, in: [{ id: B.SNOW_LAYER, n: 4 }], reqBench: false },
    { out: { id: B.PACKED_ICE,  n: 1 }, in: [{ id: B.ICE, n: 9 }], reqBench: true },

    // === БРОНЯ (3x3-крафт, как в Minecraft) ===
    // Шлем — 5 материалов в форме перевёрнутого "U" (верх + бока).
    { out: { id: ITEMS.LEATHER_HELMET,  n: 1 }, shape: [['L','L','L'],['L','.','L']], key: { L: ITEMS.LEATHER } },
    { out: { id: ITEMS.CHAIN_HELMET,    n: 1 }, shape: [['N','N','N'],['N','.','N']], key: { N: ITEMS.IRON_NUGGET } },
    { out: { id: ITEMS.IRON_HELMET,     n: 1 }, shape: [['I','I','I'],['I','.','I']], key: { I: ITEMS.IRON_INGOT } },
    { out: { id: ITEMS.GOLD_HELMET,     n: 1 }, shape: [['G','G','G'],['G','.','G']], key: { G: ITEMS.GOLD_INGOT } },
    { out: { id: ITEMS.DIAMOND_HELMET,  n: 1 }, shape: [['D','D','D'],['D','.','D']], key: { D: ITEMS.DIAMOND } },

    // Нагрудник — 8 материалов: верхние боковые + полный 2 ряда снизу.
    { out: { id: ITEMS.LEATHER_CHESTPLATE,  n: 1 }, shape: [['L','.','L'],['L','L','L'],['L','L','L']], key: { L: ITEMS.LEATHER } },
    { out: { id: ITEMS.CHAIN_CHESTPLATE,    n: 1 }, shape: [['N','.','N'],['N','N','N'],['N','N','N']], key: { N: ITEMS.IRON_NUGGET } },
    { out: { id: ITEMS.IRON_CHESTPLATE,     n: 1 }, shape: [['I','.','I'],['I','I','I'],['I','I','I']], key: { I: ITEMS.IRON_INGOT } },
    { out: { id: ITEMS.GOLD_CHESTPLATE,     n: 1 }, shape: [['G','.','G'],['G','G','G'],['G','G','G']], key: { G: ITEMS.GOLD_INGOT } },
    { out: { id: ITEMS.DIAMOND_CHESTPLATE,  n: 1 }, shape: [['D','.','D'],['D','D','D'],['D','D','D']], key: { D: ITEMS.DIAMOND } },

    // Ботинки — 4 материала: два ряда по бокам.
    { out: { id: ITEMS.LEATHER_BOOTS,  n: 1 }, shape: [['L','.','L'],['L','.','L']], key: { L: ITEMS.LEATHER } },
    { out: { id: ITEMS.CHAIN_BOOTS,    n: 1 }, shape: [['N','.','N'],['N','.','N']], key: { N: ITEMS.IRON_NUGGET } },
    { out: { id: ITEMS.IRON_BOOTS,     n: 1 }, shape: [['I','.','I'],['I','.','I']], key: { I: ITEMS.IRON_INGOT } },
    { out: { id: ITEMS.GOLD_BOOTS,     n: 1 }, shape: [['G','.','G'],['G','.','G']], key: { G: ITEMS.GOLD_INGOT } },
    { out: { id: ITEMS.DIAMOND_BOOTS,  n: 1 }, shape: [['D','.','D'],['D','.','D']], key: { D: ITEMS.DIAMOND } },

    // V16: Wool dyeing recipes
    ...WOOL_GROUP.flatMap(woolId => 
        Object.keys(DYE_COLORS).map(dyeId => ({
            out: { id: WOOL_BY_DYE[dyeId], n: 1 },
            shapeless: [woolId, parseInt(dyeId)],
            bench: false
        }))
    ),
];

// --- SYSTEMS ---

class AudioSys {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
        this.soundVolume = 1.0;
        this.musicVolume = 1.0;
        this.playingMusic = false;
        this.musicInterval = null;

        // --- V9 audio rebuild: master bus → reverb send → compressor → out ---
        // Master gain + warm low-pass + bus compressor for glue.
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.9;
        this.masterFilter = this.ctx.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 9600;
        this.masterFilter.Q.value = 0.5;
        this.masterComp = this.ctx.createDynamicsCompressor();
        this.masterComp.threshold.value = -16;
        this.masterComp.knee.value = 10;
        this.masterComp.ratio.value = 3.2;
        this.masterComp.attack.value = 0.004;
        this.masterComp.release.value = 0.18;
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.masterComp);
        this.masterComp.connect(this.ctx.destination);

        // --- Reverb ---
        // Convolver fed by an offline-generated impulse response: short hall.
        // Gives every sound a sense of space without external assets.
        this.convolver = this.ctx.createConvolver();
        this.convolver.buffer = this._buildImpulseResponse(2.6, 2.4);
        // Pre-delay highpass so the wet signal does not muddy bass.
        this.reverbHP = this.ctx.createBiquadFilter();
        this.reverbHP.type = 'highpass';
        this.reverbHP.frequency.value = 220;
        this.reverbWet = this.ctx.createGain();
        this.reverbWet.gain.value = 0.55;
        this.convolver.connect(this.reverbHP);
        this.reverbHP.connect(this.reverbWet);
        this.reverbWet.connect(this.masterGain);

        // --- Music sub-graph ---
        // musicBus → musicLP (gentle warm cap) → master.
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.6;
        this.musicLP = this.ctx.createBiquadFilter();
        this.musicLP.type = 'lowpass';
        this.musicLP.frequency.value = 5400;
        this.musicLP.Q.value = 0.3;
        this.musicBus.connect(this.musicLP);
        this.musicLP.connect(this.masterGain);
        // Music reverb send (heavier than SFX).
        this.musicSend = this.ctx.createGain();
        this.musicSend.gain.value = 0.35;
        this.musicBus.connect(this.musicSend);
        this.musicSend.connect(this.convolver);

        // --- SFX sub-graph ---
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 1.0;
        this.sfxBus.connect(this.masterGain);
        // SFX reverb send (subtle, only the tail).
        this.sfxSend = this.ctx.createGain();
        this.sfxSend.gain.value = 0.12;
        this.sfxBus.connect(this.sfxSend);
        this.sfxSend.connect(this.convolver);

        // --- Ambient bus (wind, birds, crickets, cave drone) ---
        // Has its own volume separate from music for fine balance.
        this.ambientBus = this.ctx.createGain();
        this.ambientBus.gain.value = 0.0; // crossfaded by ambient manager
        this.ambientBus.connect(this.masterGain);
        this.ambientSend = this.ctx.createGain();
        this.ambientSend.gain.value = 0.25;
        this.ambientBus.connect(this.ambientSend);
        this.ambientSend.connect(this.convolver);

        // Persistent ambient layers (created lazily on first call).
        this._ambient = {
            wind: null,
            cave: null,
            crickets: null,
            rainNoise: null,
        };
        this._ambientTargets = { wind: 0, cave: 0, crickets: 0, rain: 0 };

        // Music scheduler state (for layered music).
        this._music = {
            running: false,
            mode: 'menu',         // 'menu' | 'day' | 'night' | 'cave'
            nextStart: 0,
            currentVoices: [],
        };

        // Pre-built shared noise buffer for crackles/wind.
        this._whiteNoiseBuffer = null;
        this._pinkNoiseBuffer = null;

        // --- OGG-based music (V13) ---
        // Files loaded from disk, played through the WebAudio musicBus via
        // MediaElementSource so they get all the same processing/volume.
        this.menuMusicFiles = [
            'Music/Main Menu/MainMenu_1.ogg',
            'Music/Main Menu/MainMenu_2.ogg',
            'Music/Main Menu/MainMenu_3.ogg',
        ];
        this.gameplayMusicFiles = [
            'Music/Gameplay/Gameplay_1.ogg',
            'Music/Gameplay/Gameplay_2.ogg',
            'Music/Gameplay/Gameplay_3.ogg',
        ];
        // Map of music disc item IDs → .ogg path. Filled in lazily after ITEMS
        // is fully defined (see _ensureDiscPaths()).
        this.musicDiscFiles = null;
        // The currently playing background music (HTMLAudioElement) — menu or gameplay.
        this.currentMusicElement = null;
        this.currentMusicSource = null; // MediaElementSource node for currentMusicElement
        // Active jukebox tracks keyed by "tx,ty" → { audio, source, panner, gain, itemId }
        this.activeDiscs = {};
        // Pending music start — kept in case autoplay was blocked before user
        // interaction. Will be triggered by _resumeAudio().
        this._pendingMusicStart = null;
    }

    // Lazily build music disc map. ITEMS may not be defined yet when AudioSys
    // is constructed because both are at module top level; this defers until
    // first use (after the whole script has run).
    _ensureDiscPaths() {
        if (this.musicDiscFiles) return this.musicDiscFiles;
        this.musicDiscFiles = {};
        if (typeof ITEMS !== 'undefined') {
            if (ITEMS.MUSIC_DISC_NOSTALGIC != null) {
                this.musicDiscFiles[ITEMS.MUSIC_DISC_NOSTALGIC] = 'Music/Music Discs/Nostalgic Action.ogg';
            }
            if (ITEMS.MUSIC_DISC_QUIRKY != null) {
                this.musicDiscFiles[ITEMS.MUSIC_DISC_QUIRKY] = 'Music/Music Discs/Quirky & Funky.ogg';
            }
        }
        return this.musicDiscFiles;
    }

    // Build an HTMLAudioElement routed through the music bus. Returns
    // { audio, source } where audio is the element and source is the
    // MediaElementSource (so callers can disconnect/connect to a panner).
    _buildAudioGraph(path, opts = {}) {
        const audio = new Audio(encodeURI(path));
        const isLocalFile = window.location.protocol === 'file:';
        if (!isLocalFile) {
            audio.crossOrigin = 'anonymous';
        }
        audio.preload = 'auto';
        audio.loop = !!opts.loop;
        
        let source = null;
        if (!isLocalFile) {
            audio.volume = 1.0; // gain handled by music bus
            try {
                source = this.ctx.createMediaElementSource(audio);
                source.connect(this.musicBus);
            } catch (e) {
                // Fallback: at least the audio element will still play directly.
                source = null;
            }
        }
        
        if (source === null) {
            // Fallback for file:/// protocol: bypass Web Audio API to prevent silence due to CORS taint.
            // Direct volume applied to the HTMLAudioElement.
            const vol = this.musicVolume !== undefined ? this.musicVolume : 1.0;
            audio.volume = 0.6 * vol;
        }
        return { audio, source };
    }

    // Stop & detach the currently playing background music.
    _stopCurrentMusic() {
        if (this.currentMusicElement) {
            try { this.currentMusicElement.pause(); } catch (e) { }
            try { this.currentMusicElement.currentTime = 0; } catch (e) { }
        }
        if (this.currentMusicSource) {
            try { this.currentMusicSource.disconnect(); } catch (e) { }
        }
        this.currentMusicElement = null;
        this.currentMusicSource = null;
        this._music.nextStart = 0;
    }

    // Try to (re)start any music that was deferred due to autoplay policy.
    _resumeAudio() {
        try {
            if (this.ctx.state === 'suspended') this.ctx.resume();
        } catch (e) { }
        if (this._pendingMusicStart) {
            const fn = this._pendingMusicStart;
            this._pendingMusicStart = null;
            try { fn(); } catch (e) { }
        }
        // Resume any active jukebox audio that got blocked.
        for (const key in this.activeDiscs) {
            const d = this.activeDiscs[key];
            if (d && d.audio && d.audio.paused) {
                d.audio.play().catch(() => { });
            }
        }
        if (this.currentMusicElement && this.currentMusicElement.paused) {
            this.currentMusicElement.play().catch(() => { });
        }
    }

    // Pick a random file path from a list, avoiding repeating the last one if possible.
    _pickRandomTrack(list, lastPath) {
        if (!list || list.length === 0) return null;
        if (list.length === 1) return list[0];
        let candidate;
        let tries = 0;
        do {
            candidate = list[(Math.random() * list.length) | 0];
            tries++;
        } while (candidate === lastPath && tries < 8);
        return candidate;
    }

    // Internal: start playing a random file from `fileList`, stopping current music.
    _playRandomOgg(fileList, mode) {
        if (!this.enabled || !fileList || fileList.length === 0) return 0;
        const previous = this.currentMusicElement ? this.currentMusicElement.src : null;
        this._stopCurrentMusic();
        const path = this._pickRandomTrack(fileList, previous);
        if (!path) return 0;
        const { audio, source } = this._buildAudioGraph(path, { loop: false });
        this.currentMusicElement = audio;
        this.currentMusicSource = source;
        this._music.mode = mode;
        // Once metadata loads, update nextStart so musicTimeRemaining works.
        const onMeta = () => {
            if (audio === this.currentMusicElement && audio.duration && !isNaN(audio.duration)) {
                this._music.nextStart = this.ctx.currentTime + audio.duration;
            }
        };
        audio.addEventListener('loadedmetadata', onMeta);
        // When the song ends naturally, mark nextStart so caller knows to schedule next.
        audio.addEventListener('ended', () => {
            if (audio === this.currentMusicElement) {
                this._music.nextStart = this.ctx.currentTime;
            }
        });
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch(() => {
                // Autoplay blocked — queue for retry on first user interaction.
                this._pendingMusicStart = () => this._playRandomOgg(fileList, mode);
            });
        }
        // Optimistic estimate while metadata loads (3 minutes). Will be
        // overwritten in onMeta().
        this._music.nextStart = this.ctx.currentTime + 180;
        return 180;
    }

    // --- Build a tiny impulse response from filtered/decaying noise ---
    // duration in seconds, decayPow controls tail steepness.
    _buildImpulseResponse(duration = 2.4, decayPow = 2.0) {
        const sr = this.ctx.sampleRate;
        const len = Math.max(1, Math.floor(sr * duration));
        const ir = this.ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const data = ir.getChannelData(ch);
            // Combine two random pink-ish noises with slight stereo offset.
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < len; i++) {
                const t = i / len;
                const env = Math.pow(1 - t, decayPow);
                const w = Math.random() * 2 - 1;
                // Cheap pink filter (Paul Kellett).
                b0 = 0.99765 * b0 + w * 0.0990460;
                b1 = 0.96300 * b1 + w * 0.2965164;
                b2 = 0.57000 * b2 + w * 1.0526913;
                const pink = b0 + b1 + b2 + w * 0.1848;
                data[i] = pink * env * 0.18;
            }
        }
        return ir;
    }

    _getNoiseBuffer(pink = false) {
        const cached = pink ? this._pinkNoiseBuffer : this._whiteNoiseBuffer;
        if (cached) return cached;
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        if (pink) {
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < len; i++) {
                const w = Math.random() * 2 - 1;
                b0 = 0.99765 * b0 + w * 0.0990460;
                b1 = 0.96300 * b1 + w * 0.2965164;
                b2 = 0.57000 * b2 + w * 1.0526913;
                data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
            }
            this._pinkNoiseBuffer = buf;
        } else {
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this._whiteNoiseBuffer = buf;
        }
        return buf;
    }

    // --- Persistent ambient layer helpers ---
    // Each ambient layer is a long-running BufferSource (noise) routed through
    // its own filter+gain. Volume is controlled smoothly, not start/stop.
    _ensureWind() {
        if (this._ambient.wind) return this._ambient.wind;
        const src = this.ctx.createBufferSource();
        src.buffer = this._getNoiseBuffer(true);
        src.loop = true;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.2;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 120;
        // Slow LFO modulating cutoff for "gusts".
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.18;
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
        const g = this.ctx.createGain();
        g.gain.value = 0;
        src.connect(hp); hp.connect(lp); lp.connect(g);
        g.connect(this.ambientBus);
        try { src.start(); lfo.start(); } catch (e) { }
        return (this._ambient.wind = { src, gain: g });
    }
    _ensureCaveDrone() {
        if (this._ambient.cave) return this._ambient.cave;
        // Two detuned low oscillators + slow LFO on filter for "wind through cave".
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        o1.type = 'sine'; o2.type = 'sine';
        o1.frequency.value = 56;
        o2.frequency.value = 41;
        const o1g = this.ctx.createGain(); o1g.gain.value = 0.65;
        const o2g = this.ctx.createGain(); o2g.gain.value = 0.5;
        const mix = this.ctx.createGain(); mix.gain.value = 1;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 1.2;
        const lfo = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.frequency.value = 0.07;
        lfoG.gain.value = 110;
        lfo.connect(lfoG); lfoG.connect(lp.frequency);
        // Subtle noise wash on top.
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getNoiseBuffer(true);
        noise.loop = true;
        const noiseLP = this.ctx.createBiquadFilter();
        noiseLP.type = 'lowpass'; noiseLP.frequency.value = 220;
        const noiseG = this.ctx.createGain();
        noiseG.gain.value = 0.35;
        noise.connect(noiseLP); noiseLP.connect(noiseG); noiseG.connect(mix);
        o1.connect(o1g); o1g.connect(mix);
        o2.connect(o2g); o2g.connect(mix);
        mix.connect(lp);
        const out = this.ctx.createGain();
        out.gain.value = 0;
        lp.connect(out);
        out.connect(this.ambientBus);
        try { o1.start(); o2.start(); lfo.start(); noise.start(); } catch (e) { }
        return (this._ambient.cave = { src: o1, gain: out });
    }
    _ensureCrickets() {
        if (this._ambient.crickets) return this._ambient.crickets;
        // Crickets = pulsing high-passed noise with periodic tremolo.
        const src = this.ctx.createBufferSource();
        src.buffer = this._getNoiseBuffer(false);
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 5400; bp.Q.value = 12;
        // Fast tremolo for the cricket "tk-tk-tk".
        const trem = this.ctx.createOscillator();
        const tremG = this.ctx.createGain();
        trem.type = 'square'; trem.frequency.value = 14; tremG.gain.value = 0.5;
        const tremMix = this.ctx.createGain();
        tremMix.gain.value = 0.5;
        trem.connect(tremG); tremG.connect(tremMix.gain);
        const g = this.ctx.createGain();
        g.gain.value = 0;
        src.connect(bp); bp.connect(tremMix); tremMix.connect(g);
        g.connect(this.ambientBus);
        try { src.start(); trem.start(); } catch (e) { }
        return (this._ambient.crickets = { src, gain: g });
    }

    // Set ambient layer target volumes. Smooth crossfades happen automatically
    // (the ambient manager calls this with desired values; we ramp).
    setAmbient(targets) {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        const ramp = 1.6;
        const apply = (layer, target, peak) => {
            if (!layer) return;
            const v = Math.max(0, Math.min(1, target)) * peak;
            try {
                layer.gain.gain.cancelScheduledValues(now);
                layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
                layer.gain.gain.linearRampToValueAtTime(v, now + ramp);
            } catch (e) { }
        };
        if (targets.wind != null) apply(this._ensureWind(), targets.wind, 0.18);
        if (targets.cave != null) apply(this._ensureCaveDrone(), targets.cave, 0.35);
        if (targets.crickets != null) apply(this._ensureCrickets(), targets.crickets, 0.06);
        // Master ambient bus volume — listens to musicVolume so sliders also tame ambient.
        const ambVol = 0.85 * this.musicVolume;
        try {
            this.ambientBus.gain.cancelScheduledValues(now);
            this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, now);
            this.ambientBus.gain.linearRampToValueAtTime(ambVol, now + 0.5);
        } catch (e) { }
    }
    silenceAmbient() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        try {
            this.ambientBus.gain.cancelScheduledValues(now);
            this.ambientBus.gain.linearRampToValueAtTime(0, now + 0.4);
        } catch (e) { }
    }

    // Single-shot bird chirp — short pitch sweep.
    playBird(panX = null) {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        const baseFreq = 1800 + Math.random() * 1400;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(baseFreq, now);
        o.frequency.exponentialRampToValueAtTime(baseFreq * (1.4 + Math.random() * 0.5), now + 0.06);
        o.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, now + 0.18);
        const peak = 0.06 * this.musicVolume;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        o.connect(g);
        if (panX != null && this.ctx.createStereoPanner) {
            const pan = this.ctx.createStereoPanner();
            pan.pan.value = Math.max(-0.7, Math.min(0.7, panX));
            g.connect(pan);
            pan.connect(this.ambientBus);
        } else {
            g.connect(this.ambientBus);
        }
        o.start(now);
        o.stop(now + 0.22);
        // Sometimes a second-trill chirp.
        if (Math.random() < 0.35) {
            setTimeout(() => this.playBird(panX), 90 + Math.random() * 60);
        }
    }

    // Distant thunder rumble — low-freq filtered noise burst.
    playThunder() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        const dur = 1.6 + Math.random() * 1.2;
        const src = this.ctx.createBufferSource();
        src.buffer = this._getNoiseBuffer(false);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 220;
        const g = this.ctx.createGain();
        const peak = 0.16 * this.musicVolume;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(lp); lp.connect(g); g.connect(this.ambientBus);
        // Strong reverb send for distance.
        const send = this.ctx.createGain();
        send.gain.value = 0.7;
        g.connect(send); send.connect(this.convolver);
        src.start(now);
        src.stop(now + dur + 0.05);
    }

    // Возвращает ноду, к которой нужно подключать осциллятор/шум:
    // isMusic → musicBus, иначе → sfxBus
    _busFor(isMusic) { return isMusic ? this.musicBus : this.sfxBus; }

    // Получить панораму −1..1 и затухание для позиционированного звука (моб в мире → стерео).
    // V8.3: учитываем 2D-расстояние (X и Y) и жёсткий cutoff — звуки за пределами ~3 половин экрана
    // становятся неслышимыми. Это чинит "мобы грохочут шагами с любого расстояния".
    _spatial(worldX, worldY = null) {
        if (worldX == null) return { pan: 0, atten: 1, inRange: true };
        const _ez = getEffectiveZoom();
        const halfW = canvas ? canvas.width / (_ez * 2) : 200;
        const halfH = canvas ? canvas.height / (_ez * 2) : 150;
        const cx = (typeof camX !== 'undefined' ? camX : 0) + halfW;
        const cy = (typeof camY !== 'undefined' ? camY : 0) + halfH;
        const dx = worldX - cx;
        const dy = worldY == null ? 0 : (worldY - cy);
        // Пан — только по горизонтали (вертикальный пан в 2D-игре звучит странно)
        const pan = Math.max(-0.85, Math.min(0.85, dx / (halfW * 1.2)));
        // Затухание — по настоящему 2D-расстоянию
        const dist = Math.sqrt(dx * dx + dy * dy);
        const refDist = halfW;          // внутри этого радиуса — почти без потерь
        const maxDist = halfW * 3;      // дальше этого — полная тишина
        let atten;
        if (dist <= refDist) {
            atten = 1.0;
        } else if (dist >= maxDist) {
            atten = 0;
        } else {
            const t = (dist - refDist) / (maxDist - refDist);
            atten = (1 - t) * (1 - t); // квадратичный rolloff — естественнее линейного
        }
        return { pan, atten, inRange: atten > 0.01 };
    }

    // Helper: Play tone with pitch variation for more natural sound
    playTone(freq, type, dur, vol = 0.1, pitchVar = 0, isMusic = false, panX = null, panY = null) {
        if (!this.enabled || this.ctx.state === 'suspended') {
            if (this.enabled) this.ctx.resume();
            return;
        }
        const volumeMultiplier = isMusic ? this.musicVolume : this.soundVolume;
        const sp = this._spatial(panX, panY);
        // V8.3: если звук позиционирован и слишком далеко — не создаём ноды вообще.
        if (panX != null && !sp.inRange) return;
        const variation = 1 + (Math.random() - 0.5) * pitchVar;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * variation, this.ctx.currentTime);
        // Envelope: быстрый attack + экспоненциальный decay (мягче чем линейный)
        const now = this.ctx.currentTime;
        const peak = vol * volumeMultiplier * sp.atten;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + Math.min(0.02, dur * 0.2));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain);
        if (panX != null && this.ctx.createStereoPanner) {
            const pan = this.ctx.createStereoPanner();
            pan.pan.value = sp.pan;
            gain.connect(pan);
            pan.connect(this._busFor(isMusic));
        } else {
            gain.connect(this._busFor(isMusic));
        }
        osc.start();
        osc.stop(now + dur);
    }

    // Helper: Layered tone for richer sound
    playLayeredTone(freqs, type, dur, vol = 0.1, isMusic = false) {
        if (!this.enabled) return;
        freqs.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, type, dur, vol / freqs.length, 0.05, isMusic), i * 5);
        });
    }

    // Improved noise with filtering for different textures
    // V8.3: panX/panY — мировые координаты источника. Если заданы, звук панорамируется
    // и затухает по 2D-расстоянию до камеры; за пределами cutoff вообще не играет.
    playNoise(dur, vol = 0.1, filterFreq = null, isMusic = false, panX = null, panY = null) {
        if (!this.enabled) return;
        const sp = this._spatial(panX, panY);
        if (panX != null && !sp.inRange) return;
        const volumeMultiplier = isMusic ? this.musicVolume : this.soundVolume;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        const peak = vol * volumeMultiplier * sp.atten;
        gain.gain.setValueAtTime(peak, now);
        gain.gain.linearRampToValueAtTime(0, now + dur);

        if (filterFreq) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            noise.connect(filter);
            filter.connect(gain);
        } else {
            noise.connect(gain);
        }

        if (panX != null && this.ctx.createStereoPanner) {
            const pan = this.ctx.createStereoPanner();
            pan.pan.value = sp.pan;
            gain.connect(pan);
            pan.connect(this._busFor(isMusic));
        } else {
            gain.connect(this._busFor(isMusic));
        }
        noise.start();
    }

    // Minecraft-like footstep sounds
    // V8.3: panX/panY — мировые координаты источника шага. Если переданы,
    // шаг будет панорамирован и затухать по расстоянию до камеры; далёкие
    // шаги мобов полностью заглушаются cutoff'ом в _spatial.
    playStep(blockId, panX = null, panY = null) {
        // Быстрый отказ, если моб далеко от игрока — чтобы не создавать ноды впустую.
        if (panX != null) {
            const sp = this._spatial(panX, panY);
            if (!sp.inRange) return;
        }
        let type = BLOCK_SOUNDS[blockId] || 'stone';
        const pitch = 0.9 + Math.random() * 0.2; // Pitch variation

        if (type === 'grass') {
            // Soft, muffled grass sound
            this.playNoise(0.08, 0.04, 2000, false, panX, panY);
            this.playTone(180 * pitch, 'sine', 0.06, 0.02, 0, false, panX, panY);
        } else if (type === 'dirt') {
            // Slightly harder than grass
            this.playNoise(0.07, 0.05, 1500, false, panX, panY);
            this.playTone(150 * pitch, 'triangle', 0.05, 0.03, 0, false, panX, panY);
        } else if (type === 'stone') {
            // Solid, pleasant stone click
            this.playTone(200 * pitch, 'triangle', 0.03, 0.03, 0, false, panX, panY);
            this.playTone(150 * pitch, 'sine', 0.03, 0.03, 0, false, panX, panY);
            this.playNoise(0.04, 0.03, 1800, false, panX, panY);
        } else if (type === 'wood') {
            // Hollow, woody knock sound - Minecraft-like
            this.playTone(120 * pitch, 'sine', 0.12, 0.045, 0, false, panX, panY);
            this.playTone(240 * pitch, 'triangle', 0.08, 0.03, 0, false, panX, panY);
            this.playNoise(0.06, 0.025, 800, false, panX, panY);
        } else {
            this.playTone(150 * pitch, 'square', 0.05, 0.05, 0, false, panX, panY);
        }
    }

    // Enhanced sound effects
    playSound(name, blockId = null) {
        if (name === 'jump') {
            // Cloth-rustle whoosh + small body grunt.
            this.playNoise(0.08, 0.04, 1800);
            this.playTone(280, 'sine', 0.12, 0.06);
            setTimeout(() => this.playTone(200, 'sine', 0.09, 0.04), 25);
        }

        if (name === 'land') {
            // Soft landing thud.
            this.playTone(110, 'sine', 0.12, 0.10);
            this.playNoise(0.08, 0.06, 600);
        }

        if (name === 'hit') {
            // Layered punch with body slap.
            this.playLayeredTone([70, 110, 160, 220], 'square', 0.12, 0.18);
            this.playNoise(0.06, 0.10, 700);
            setTimeout(() => this.playTone(90, 'sawtooth', 0.08, 0.06), 35);
        }

        if (name === 'break') {
            let type = BLOCK_SOUNDS[blockId] || 'stone';
            if (type === 'grass' || type === 'dirt') {
                // Grass/dirt: soft crumble with low thump.
                this.playNoise(0.18, 0.20, 1100);
                this.playNoise(0.10, 0.10, 2400);
                this.playTone(110, 'triangle', 0.14, 0.10);
                setTimeout(() => this.playNoise(0.08, 0.07, 900), 80);
            } else if (type === 'wood') {
                // Wood: layered crack + splinter trail.
                this.playLayeredTone([100, 150, 210, 280, 340], 'triangle', 0.22, 0.15);
                this.playTone(170, 'sine', 0.16, 0.09);
                this.playNoise(0.14, 0.10, 480);
                setTimeout(() => this.playNoise(0.10, 0.06, 380), 50);
                setTimeout(() => this.playTone(220, 'triangle', 0.06, 0.04), 110);
            } else {
                // Stone: meaty crack + crumble + bright "ping".
                this.playLayeredTone([180, 270, 360, 540], 'triangle', 0.26, 0.18);
                this.playNoise(0.16, 0.16, 700);
                this.playTone(160, 'sine', 0.16, 0.10);
                setTimeout(() => this.playTone(820, 'sine', 0.05, 0.04), 20);
                setTimeout(() => this.playNoise(0.10, 0.07, 1200), 80);
            }
        }

        if (name === 'place') {
            // Heavier "thunk" with material-aware overtone.
            const type = BLOCK_SOUNDS[blockId] || 'stone';
            if (type === 'wood') {
                this.playTone(220, 'sine', 0.10, 0.10);
                this.playTone(140, 'triangle', 0.12, 0.07);
            } else if (type === 'grass' || type === 'dirt') {
                this.playNoise(0.07, 0.07, 1100);
                this.playTone(150, 'triangle', 0.10, 0.06);
            } else {
                this.playTone(300, 'sine', 0.08, 0.10);
                this.playTone(180, 'triangle', 0.10, 0.07);
                this.playNoise(0.05, 0.04, 1800);
            }
        }

        if (name === 'hurt') {
            // Heavier impact + grunt.
            this.playTone(180, 'sawtooth', 0.14, 0.13);
            setTimeout(() => this.playTone(110, 'sawtooth', 0.22, 0.10), 70);
            this.playNoise(0.12, 0.07, 500);
            setTimeout(() => this.playTone(80, 'square', 0.08, 0.05), 130);
        }

        if (name === 'eat') {
            // Three quick chomps with crispness.
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    this.playTone(320 + Math.random() * 140, 'square', 0.07, 0.06);
                    this.playNoise(0.05, 0.04, 1400);
                    if (i === 2) this.playTone(540, 'sine', 0.08, 0.04);
                }, i * 110);
            }
        }

        if (name === 'mob_hit') {
            // Mob damage — blockId is the world X of the source.
            this.playTone(130, 'square', 0.16, 0.13, 0, false, blockId);
            this.playNoise(0.10, 0.08, 600, false, blockId);
            setTimeout(() => this.playTone(95, 'sawtooth', 0.10, 0.06, 0, false, blockId), 60);
        }

        if (name === 'achieve') {
            // Triumphant chime with shimmering tail.
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
            notes.forEach((note, i) => {
                setTimeout(() => {
                    this.playTone(note, 'sine', 0.55, 0.09);
                    this.playTone(note * 2, 'sine', 0.55, 0.04);
                    this.playTone(note / 2, 'triangle', 0.45, 0.03);
                }, i * 140);
            });
            // Sparkle.
            for (let i = 0; i < 6; i++) {
                setTimeout(() => this.playTone(1500 + Math.random() * 1200, 'sine', 0.08, 0.025), 600 + i * 60);
            }
        }

        if (name === 'loot') {
            // Crystalline pickup — three notes ascending.
            this.playTone(700, 'sine', 0.14, 0.08);
            setTimeout(() => this.playTone(932, 'sine', 0.18, 0.09), 70);
            setTimeout(() => this.playTone(1245, 'triangle', 0.16, 0.06), 140);
            setTimeout(() => this.playTone(1660, 'sine', 0.10, 0.04), 200);
        }

        if (name === 'button_click') {
            // Crisp Minecraft-style click.
            this.playTone(620, 'sine', 0.07, 0.13);
            setTimeout(() => this.playTone(820, 'sine', 0.05, 0.08), 28);
        }

        if (name === 'button_hover') {
            // Tiny hover blip.
            this.playTone(900, 'sine', 0.04, 0.04);
        }

        if (name === 'drop') {
            this.playTone(320, 'sine', 0.09, 0.06);
            this.playNoise(0.07, 0.05, 2200);
            setTimeout(() => this.playTone(170, 'triangle', 0.09, 0.05), 40);
        }

        if (name === 'craft') {
            // Pleasing four-note up-arpeggio (C major add9).
            this.playTone(523.25, 'sine', 0.10, 0.08);
            setTimeout(() => this.playTone(659.25, 'triangle', 0.10, 0.07), 60);
            setTimeout(() => this.playTone(783.99, 'sine', 0.10, 0.07), 130);
            setTimeout(() => this.playTone(987.77, 'triangle', 0.14, 0.05), 200);
        }

        if (name === 'levelup') {
            // Big rising chord.
            const chord = [392.00, 493.88, 587.33, 783.99]; // G B D G
            chord.forEach((f, i) => setTimeout(() => {
                this.playTone(f, 'sine', 0.6, 0.08);
                this.playTone(f * 2, 'sine', 0.6, 0.04);
            }, i * 60));
        }

        if (name === 'pig_snort') {
            this.playNoise(0.14, 0.10, 900, false, blockId);
            this.playTone(140, 'sawtooth', 0.12, 0.06, 0.08, false, blockId);
            setTimeout(() => this.playTone(120, 'sawtooth', 0.10, 0.05, 0.10, false, blockId), 80);
        }
        if (name === 'cow_moo') {
            this.playTone(220, 'sawtooth', 0.25, 0.08, 0.05, false, blockId);
            setTimeout(() => this.playTone(160, 'sawtooth', 0.40, 0.09, 0.05, false, blockId), 180);
            setTimeout(() => this.playTone(110, 'sine', 0.25, 0.05, 0, false, blockId), 350);
        }
        if (name === 'sheep_baa') {
            const base = 380;
            this.playTone(base, 'triangle', 0.22, 0.07, 0.12, false, blockId);
            setTimeout(() => this.playTone(base * 0.85, 'triangle', 0.18, 0.06, 0.08, false, blockId), 100);
            setTimeout(() => this.playTone(base * 0.7, 'sine', 0.14, 0.04, 0, false, blockId), 200);
        }
        if (name === 'mob_panic') {
            this.playTone(800, 'square', 0.06, 0.08, 0.2, false, blockId);
            setTimeout(() => this.playTone(650, 'square', 0.07, 0.08, 0.2, false, blockId), 70);
        }
        if (name === 'eat_grass') {
            this.playNoise(0.10, 0.035, 1800, false, blockId);
            setTimeout(() => this.playNoise(0.08, 0.03, 1500, false, blockId), 120);
        }

        if (name === 'splash') {
            // Water splash — bright noise + droplets.
            this.playNoise(0.18, 0.14, 4000);
            for (let i = 0; i < 4; i++) {
                setTimeout(() => this.playTone(800 + Math.random() * 500, 'sine', 0.06, 0.04), i * 35);
            }
        }
        if (name === 'sizzle') {
            // Lava/fire fizz when extinguishing.
            this.playNoise(0.6, 0.10, 3500);
            setTimeout(() => this.playNoise(0.4, 0.06, 2400), 120);
        }
    }

    // --- Music engine v2 ---
    // Plays melody + bass + pad voices together using exponential AD envelopes.
    // Notes are MIDI offsets relative to a root (C4=261.63Hz at offset 0).
    // step: [midiOffset|null, durSeconds, volScale?]
    _scheduleVoice(part, voice = 'melody', startTime = null) {
        if (!this.enabled || !part || part.length === 0) return 0;
        const now = startTime != null ? startTime : this.ctx.currentTime + 0.05;
        let cursor = now;
        const baseVol = this.musicVolume;
        for (const step of part) {
            const [note, dur, vScale = 1] = step;
            if (note != null) {
                const freq = 261.63 * Math.pow(2, note / 12);
                if (voice === 'melody') {
                    // Sine + soft triangle octave (Minecraft-like bell).
                    this._musicNote(freq, dur, 'sine', 0.045 * vScale * baseVol, cursor, 0.02, 0.6);
                    this._musicNote(freq * 2, dur * 0.85, 'triangle', 0.014 * vScale * baseVol, cursor + 0.01, 0.02, 0.65);
                } else if (voice === 'bass') {
                    // Pure sine sub bass + slight triangle harmonic.
                    this._musicNote(freq * 0.5, dur, 'sine', 0.075 * vScale * baseVol, cursor, 0.06, 0.7);
                    this._musicNote(freq, dur * 0.7, 'triangle', 0.018 * vScale * baseVol, cursor + 0.02, 0.04, 0.6);
                } else if (voice === 'pad') {
                    // Slow attack pad — two slightly detuned sines.
                    this._musicNote(freq, dur, 'sine', 0.024 * vScale * baseVol, cursor, dur * 0.45, dur * 0.55);
                    this._musicNote(freq * 1.005, dur, 'sine', 0.017 * vScale * baseVol, cursor + 0.01, dur * 0.45, dur * 0.55);
                    this._musicNote(freq * 0.5, dur, 'sine', 0.014 * vScale * baseVol, cursor + 0.02, dur * 0.4, dur * 0.5);
                } else if (voice === 'pluck') {
                    // Sharp pluck (for arpeggios).
                    this._musicNote(freq, Math.min(dur, 0.6), 'triangle', 0.04 * vScale * baseVol, cursor, 0.005, 0.25);
                }
            }
            cursor += dur;
        }
        return cursor - now; // total length scheduled
    }
    _musicNote(freq, dur, type, peak, startTime, atk, rel) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const a = Math.max(0.005, Math.min(atk, dur * 0.4));
        const r = Math.max(0.05, Math.min(rel, dur * 0.85));
        g.gain.setValueAtTime(0.0001, startTime);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startTime + a);
        // Hold near peak briefly, then exponential release.
        const sustainEnd = startTime + Math.max(a, dur - r);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.6), sustainEnd);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur + 0.02);
        osc.connect(g);
        g.connect(this.musicBus);
        try {
            osc.start(startTime);
            osc.stop(startTime + dur + 0.05);
        } catch (e) { }
    }

    // --- V13: OGG-based music ---
    // playMenuMusic() / playMusic() now play a random .ogg track from the
    // Music/ folder instead of generating procedural tones.
    playMenuMusic() {
        return this._playRandomOgg(this.menuMusicFiles, 'menu');
    }

    playMusic(mode = 'day') {
        // All three gameplay tracks rotate regardless of day/night/cave mode —
        // the loop in update() still controls *when* a new song starts.
        return this._playRandomOgg(this.gameplayMusicFiles, mode);
    }

    // --- Music discs (jukebox) ---
    // Start playing a music disc at tile (tx, ty). Returns true if the disc
    // was recognised and started. Audio is routed through a stereo panner so
    // the disc is heard from its world position.
    playMusicDisc(itemId, tx, ty) {
        const map = this._ensureDiscPaths();
        const path = map[itemId];
        if (!path) return false;
        const key = `${tx},${ty}`;
        this.stopMusicDisc(tx, ty);
        const audio = new Audio(encodeURI(path));
        
        const isLocalFile = window.location.protocol === 'file:';
        if (!isLocalFile) {
            audio.crossOrigin = 'anonymous';
        }
        audio.preload = 'auto';
        audio.loop = false;
        
        let source = null;
        let panner = null;
        let gain = null;
        
        if (!isLocalFile) {
            audio.volume = 1.0;
            try {
                source = this.ctx.createMediaElementSource(audio);
                gain = this.ctx.createGain();
                gain.gain.value = 0.0; // updated each tick by update_jukebox_audio()
                if (this.ctx.createStereoPanner) {
                    panner = this.ctx.createStereoPanner();
                    panner.pan.value = 0;
                    source.connect(panner);
                    panner.connect(gain);
                } else {
                    source.connect(gain);
                }
                gain.connect(this.musicBus);
            } catch (e) {
                source = null;
                gain = null;
                panner = null;
            }
        } else {
            // Direct playback volume handled in updateDiscAudio
            audio.volume = 0.0; 
        }
        const entry = { audio, source, panner, gain, itemId, tx, ty };
        this.activeDiscs[key] = entry;
        audio.addEventListener('ended', () => {
            if (this.activeDiscs[key] === entry) this.stopMusicDisc(tx, ty);
        });
        const p = audio.play();
        if (p && typeof p.then === 'function') p.catch(() => { });
        return true;
    }

    stopMusicDisc(tx, ty) {
        const key = `${tx},${ty}`;
        const d = this.activeDiscs[key];
        if (!d) return;
        try { d.audio.pause(); } catch (e) { }
        try { d.audio.currentTime = 0; } catch (e) { }
        if (d.source) { try { d.source.disconnect(); } catch (e) { } }
        if (d.panner) { try { d.panner.disconnect(); } catch (e) { } }
        if (d.gain)   { try { d.gain.disconnect(); } catch (e) { } }
        delete this.activeDiscs[key];
    }

    stopAllMusicDiscs() {
        for (const key in this.activeDiscs) {
            const [tx, ty] = key.split(',').map(Number);
            this.stopMusicDisc(tx, ty);
        }
    }

    // Called from the main loop to update spatialisation of active discs.
    updateDiscAudio(playerCenterX, playerCenterY) {
        const maxDist = 14 * TILE_SIZE; // hearing range in pixels
        for (const key in this.activeDiscs) {
            const d = this.activeDiscs[key];
            if (!d) continue;
            const cx = d.tx * TILE_SIZE + TILE_SIZE / 2;
            const cy = d.ty * TILE_SIZE + TILE_SIZE / 2;
            const dx = cx - playerCenterX;
            const dy = cy - playerCenterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let atten = 1 - dist / maxDist;
            if (atten < 0) atten = 0;
            if (atten > 1) atten = 1;
            if (d.gain) {
                d.gain.gain.setTargetAtTime(atten * this.musicVolume, this.ctx.currentTime, 0.05);
            } else if (d.audio) {
                d.audio.volume = atten * this.musicVolume;
            }
            if (d.panner) {
                const pan = Math.max(-1, Math.min(1, dx / (8 * TILE_SIZE)));
                d.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.05);
            }
        }
    }

    _playSong(song, mode) {
        if (!song) return 0;
        const start = this.ctx.currentTime + 0.1;
        // Apply tempo factor by stretching durations once at schedule time.
        const stretch = (part, t) => part.map(s => [s[0], s[1] * t, s[2]]);
        const t = song.tempo || 1;
        const lenM = this._scheduleVoice(stretch(song.melody, t), 'melody', start);
        // Bass and pad start at the same time but loop their own length to fill.
        const total = lenM;
        if (song.bass) {
            let cursor = start;
            const bassPart = stretch(song.bass, t);
            const bassLen = bassPart.reduce((a, s) => a + s[1], 0);
            while (cursor < start + total - 0.05 && bassLen > 0.05) {
                this._scheduleVoice(bassPart, 'bass', cursor);
                cursor += bassLen;
            }
        }
        if (song.pad) {
            let cursor = start;
            const padPart = stretch(song.pad, t);
            const padLen = padPart.reduce((a, s) => a + s[1], 0);
            while (cursor < start + total - 0.05 && padLen > 0.05) {
                this._scheduleVoice(padPart, 'pad', cursor);
                cursor += padLen;
            }
        }
        this._music.mode = mode;
        this._music.nextStart = start + total;
        return total;
    }

    // Return seconds until the currently playing song ends (0 if none).
    musicTimeRemaining() {
        if (this.currentMusicElement) {
            const a = this.currentMusicElement;
            if (a.ended || a.paused) {
                // If we deferred playing due to autoplay, treat as 0 remaining.
                if (this._pendingMusicStart) return 0;
                if (a.ended) return 0;
            }
            if (a.duration && !isNaN(a.duration) && isFinite(a.duration)) {
                return Math.max(0, a.duration - a.currentTime);
            }
            // Metadata not loaded yet — pretend the song is still long so the
            // scheduler doesn't immediately stomp it.
            return 30;
        }
        return Math.max(0, this._music.nextStart - this.ctx.currentTime);
    }

    // Cave one-shot ambience (drips, distant moans, stones).
    playCaveAmbience() {
        if (!this.enabled) return;
        const type = Math.floor(Math.random() * 5);
        if (type === 0) {
            // Low rumble swelling and fading.
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.value = 38 + Math.random() * 30;
            osc.type = 'triangle';
            const now = this.ctx.currentTime;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.07 * this.musicVolume, now + 1.6);
            gain.gain.linearRampToValueAtTime(0.0001, now + 5.5);
            osc.connect(gain);
            gain.connect(this.musicBus);
            osc.start(now);
            osc.stop(now + 5.6);
        } else if (type === 1) {
            // Eerie whistle (two-note dyad).
            const freq = 280 + Math.random() * 320;
            this.playTone(freq, 'sine', 2.4, 0.05);
            setTimeout(() => this.playTone(freq * 1.18, 'sine', 2.0, 0.035), 700);
        } else if (type === 2) {
            // Water drip cluster.
            const drips = 2 + (Math.random() * 3 | 0);
            for (let i = 0; i < drips; i++) {
                setTimeout(() => {
                    const f = 800 + Math.random() * 600;
                    // Drip = sharp tone + tail; reverb makes it cavernous.
                    this.playTone(f, 'sine', 0.08, 0.06);
                    this.playTone(f * 0.6, 'sine', 0.18, 0.03);
                }, i * 380 + Math.random() * 220);
            }
        } else if (type === 3) {
            // Distant moan / void breath.
            this.playLayeredTone([55, 82, 110, 138], 'triangle', 3.2, 0.06);
        } else {
            // Stone clink (one isolated metallic ping).
            this.playTone(420 + Math.random() * 200, 'sine', 0.06, 0.04);
            setTimeout(() => this.playTone(310, 'sine', 0.18, 0.03), 70);
        }
    }
}

// --- PARTICLE SYSTEM v2 ---
// Типы: 'chunk' (осколок блока), 'spark' (искра), 'blood', 'smoke',
// 'flame' (огонёк факела/печки), 'leaf' (листопад), 'glow' (самосвечение без физики),
// 'dust' (парящая пыль в пещере), 'ambient' (светляк)
class Particle {
    constructor(x, y, color, opts = {}) {
        this.x = x; this.y = y;
        this.type = opts.type || 'chunk';
        this.color = color;

        // базовые скорости — каждый тип переопределяет
        const sp = opts.speed ?? 3;
        this.vx = opts.vx ?? (Math.random() - 0.5) * sp * 2;
        this.vy = opts.vy ?? (Math.random() - 0.5) * sp * 2;

        this.life = opts.life ?? 1.0;
        this.maxLife = this.life;
        this.size = opts.size ?? (Math.random() * 3 + 2);
        this.gravity = opts.gravity ?? 0.2;
        this.drag = opts.drag ?? 1.0;
        this.glow = opts.glow ?? false;
        this.rot = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.15;
        this.decay = opts.decay ?? 0.04;
        this.bounce = opts.bounce ?? false;
        this.grounded = false;
    }

    update() {
        if (this.grounded) {
            // лежит на земле — медленно тает
            this.life -= this.decay * 0.3;
            return;
        }
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.drag;
        this.vy = this.vy * this.drag + this.gravity;
        this.rot += this.rotSpeed;
        this.life -= this.decay;

        // простая "коллизия" с тайлами — проверяем только для chunk/blood.
        // V13: учитываем частичные AABB (полублоки, ступеньки, заборы).
        if (this.bounce && world && pointInWorldCollision(this.x, this.y)) {
            // отскок / прилипание
            this.vy = -Math.abs(this.vy) * 0.35;
            this.vx *= 0.5;
            if (Math.abs(this.vy) < 0.8) {
                this.grounded = true;
                // Поднимаем частицу так, чтобы её точка перестала пересекать
                // блок. Идём вверх с шагом 1px, пока не освободимся, но не
                // больше TILE_SIZE — это безопасный потолок.
                let safety = TILE_SIZE;
                while (safety-- > 0 && pointInWorldCollision(this.x, this.y)) {
                    this.y--;
                }
            }
        }
    }

    draw(ctx) {
        const a = Math.max(0, Math.min(1, this.life / this.maxLife));
        ctx.save();

        if (this.type === 'smoke') {
            const s = this.size * (1 + (1 - a) * 2);
            ctx.globalAlpha = a * 0.55;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'flame') {
            const s = this.size * (0.7 + a * 0.9);
            ctx.globalAlpha = a;
            // горячее ядро → холодный край
            const cold = a < 0.4;
            ctx.fillStyle = cold ? '#5a1f00' : (a < 0.7 ? '#ff6a00' : '#ffd24a');
            ctx.beginPath();
            ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
            ctx.fill();
            if (!cold) {
                ctx.globalAlpha = a * 0.5;
                ctx.fillStyle = '#fff6c2';
                ctx.beginPath();
                ctx.arc(this.x, this.y, s * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.type === 'spark') {
            ctx.globalAlpha = a;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(this.x - 1, this.y - 1, 2, 2);
        } else if (this.type === 'glow' || this.type === 'ambient') {
            ctx.globalAlpha = a * 0.9;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 12;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'leaf') {
            ctx.globalAlpha = a;
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.7);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(-this.size / 2, this.size * 0.2, this.size, 1);
        } else if (this.type === 'blood') {
            ctx.globalAlpha = a;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            if (this.grounded) {
                ctx.fillStyle = 'rgba(80,0,0,0.5)';
                ctx.fillRect(this.x - this.size, this.y, this.size * 2, 1);
            }
        } else if (this.type === 'dust') {
            ctx.globalAlpha = a * 0.35;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, 1, 1);
        } else {
            // chunk — осколок блока, с "пиксельным" видом
            ctx.globalAlpha = a;
            ctx.fillStyle = this.color;
            const s = this.size;
            ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
            // тёмная кромка для объёма
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(this.x - s / 2, this.y + s / 2 - 1, s, 1);
        }
        ctx.restore();
    }
}

// Хелперы для спавна эффектов
const VFX = {
    blockBreak(px, py, color) {
        for (let i = 0; i < 15; i++) {
            game.particles.push(new Particle(
                px + Math.random() * TILE_SIZE,
                py + Math.random() * TILE_SIZE,
                color,
                {
                    type: 'chunk', speed: 4.5, gravity: 0.4, life: 0.8 + Math.random() * 0.6,
                    decay: 0.02, size: 1 + Math.random() * 4, drag: 0.94, bounce: true
                }
            ));
        }
        // яркая вспышка в центре
        for (let i = 0; i < 5; i++) {
            game.particles.push(new Particle(
                px + TILE_SIZE / 2, py + TILE_SIZE / 2, '#ffffff',
                { type: 'spark', speed: 3, life: 0.4, decay: 0.1, gravity: 0.1 }
            ));
        }
        // густое облако пыли
        for (let i = 0; i < 6; i++) {
            game.particles.push(new Particle(
                px + TILE_SIZE / 2 + (Math.random() - 0.5) * 20,
                py + TILE_SIZE / 2 + (Math.random() - 0.5) * 20,
                '#d7ccc8',
                {
                    type: 'smoke', vx: (Math.random() - 0.5) * 2.5, vy: -1.2 - Math.random() * 1.2,
                    life: 0.8, decay: 0.03, size: 4 + Math.random() * 4, gravity: -0.01, drag: 0.92
                }
            ));
        }
    },
    landingImpact(x, y) {
        for (let i = 0; i < 8; i++) {
            game.particles.push(new Particle(
                x + (Math.random() - 0.5) * 16, y, '#9e9e9e',
                {
                    type: 'smoke', vx: (Math.random() - 0.5) * 3, vy: -0.5 - Math.random(),
                    life: 0.5, decay: 0.05, size: 3 + Math.random() * 3, gravity: -0.05, drag: 0.9
                }
            ));
        }
    },
    blockPlace(px, py, color) {
        for (let i = 0; i < 6; i++) {
            game.particles.push(new Particle(
                px + Math.random() * TILE_SIZE,
                py + Math.random() * TILE_SIZE,
                color,
                {
                    type: 'chunk', speed: 1.5, gravity: 0.3, life: 0.5,
                    decay: 0.06, size: 2 + Math.random() * 2
                }
            ));
        }
    },
    hit(x, y, color = '#ff3b3b') {
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1 + Math.random() * 3;
            game.particles.push(new Particle(x, y, color, {
                type: 'blood', vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1,
                life: 0.9, decay: 0.035, size: 2 + Math.random() * 2, bounce: true, gravity: 0.3
            }));
        }
    },
    death(x, y, color = '#ff0000') {
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 2 + Math.random() * 4;
            game.particles.push(new Particle(x, y, color, {
                type: 'blood', vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
                life: 1.1, decay: 0.025, size: 2 + Math.random() * 3, bounce: true, gravity: 0.35
            }));
        }
        // вспышка
        for (let i = 0; i < 6; i++) {
            game.particles.push(new Particle(x, y, '#ffeb3b', {
                type: 'spark', speed: 5, life: 0.6, decay: 0.06, gravity: 0.1
            }));
        }
    },
    pickaxeSpark(x, y) {
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            game.particles.push(new Particle(x, y, '#fff3a0', {
                type: 'spark', vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 1,
                life: 0.35, decay: 0.08, gravity: 0.3
            }));
        }
    },
    torchFlame(x, y) {
        if (Math.random() < 0.6) {
            game.particles.push(new Particle(
                x + (Math.random() - 0.5) * 2, y,
                '#ff8a00',
                {
                    type: 'flame', vx: (Math.random() - 0.5) * 0.4, vy: -0.8 - Math.random() * 0.3,
                    life: 0.55, decay: 0.05, size: 1.8 + Math.random() * 1.2, gravity: -0.02, drag: 0.96
                }
            ));
        }
        if (Math.random() < 0.15) {
            game.particles.push(new Particle(x, y - 6, '#555', {
                type: 'smoke', vx: (Math.random() - 0.5) * 0.5, vy: -0.7,
                life: 0.9, decay: 0.025, size: 1.5 + Math.random() * 1.5, gravity: -0.03, drag: 0.97
            }));
        }
    },
    furnaceSmoke(x, y) {
        if (Math.random() < 0.5) {
            game.particles.push(new Particle(x + (Math.random() - 0.5) * 8, y,
                'rgba(70,70,70,1)',
                {
                    type: 'smoke', vx: (Math.random() - 0.3) * 0.6, vy: -1.0 - Math.random() * 0.4,
                    life: 1.4, decay: 0.018, size: 3 + Math.random() * 3, gravity: -0.04, drag: 0.98
                }));
        }
        if (Math.random() < 0.35) {
            game.particles.push(new Particle(x + (Math.random() - 0.5) * 4, y,
                '#ff9100',
                {
                    type: 'flame', vy: -0.5, vx: (Math.random() - 0.5) * 0.3,
                    life: 0.4, decay: 0.06, size: 1.2 + Math.random() * 1.2, gravity: -0.02, drag: 0.95
                }));
        }
    },
    // V8.3: облачко при выбросе предмета
    dropPuff(x, y) {
        for (let i = 0; i < 6; i++) {
            game.particles.push(new Particle(x + (Math.random() - 0.5) * 8, y,
                '#d7ccc8',
                {
                    type: 'smoke', vx: (Math.random() - 0.5) * 1.2, vy: -0.5 - Math.random() * 0.8,
                    life: 0.6, decay: 0.04, size: 2 + Math.random() * 2, gravity: -0.02, drag: 0.93
                }));
        }
    },
    // V8.3: крафт — мягкие искры
    craftSparkle(x, y) {
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            game.particles.push(new Particle(x, y, '#ffeb3b', {
                type: 'spark',
                vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 0.5,
                life: 0.55, decay: 0.05, size: 1 + Math.random() * 1.5, gravity: 0.08
            }));
        }
    },
    // V8.3: восклицательный знак из частиц над моба в панике
    mobPanic(x, y) {
        for (let i = 0; i < 4; i++) {
            game.particles.push(new Particle(x + (Math.random() - 0.5) * 6, y - 8,
                '#ff5252',
                {
                    type: 'spark', vx: (Math.random() - 0.5) * 1.2, vy: -2 - Math.random() * 0.5,
                    life: 0.45, decay: 0.07, size: 1.5 + Math.random(), gravity: 0.05
                }));
        }
    }
};


class Inventory {
    constructor(size = 27) {
        this.slots = new Array(size).fill(null);
        this.capacity = size;
        this.selected = 0;
    }
    add(id, count = 1, dur = null) {
        if (MAX_DUR[id]) {
            for (let i = 0; i < this.capacity; i++) {
                if (!this.slots[i]) {
                    this.slots[i] = { id, count: 1, dur: (dur !== null ? dur : MAX_DUR[id]) };
                    count--;
                    if (count === 0) return true;
                }
            }
            return count === 0;
        }
        const maxStack = getMaxStack(id); // V6: предметы вроде ведра имеют свой лимит
        for (let i = 0; i < this.capacity; i++) {
            if (this.slots[i] && this.slots[i].id === id && this.slots[i].count < maxStack) {
                let space = maxStack - this.slots[i].count;
                let add = Math.min(space, count);
                this.slots[i].count += add;
                count -= add;
                if (count === 0) return true;
            }
        }
        for (let i = 0; i < this.capacity; i++) {
            if (!this.slots[i]) {
                let add = Math.min(maxStack, count);
                this.slots[i] = { id, count: add };
                count -= add;
                if (count === 0) return true;
            }
        }
        return count === 0;
    }
    remove(id, count = 1) {
        for (let i = 0; i < this.capacity; i++) {
            if (this.slots[i] && this.slots[i].id === id) {
                if (this.slots[i].count >= count) {
                    this.slots[i].count -= count;
                    if (this.slots[i].count <= 0) this.slots[i] = null;
                    return true;
                } else {
                    count -= this.slots[i].count;
                    this.slots[i] = null;
                }
            }
        }
        return false;
    }
    has(id, count = 1) {
        let found = 0;
        for (let i = 0; i < this.capacity; i++) {
            if (this.slots[i] && this.slots[i].id === id) found += this.slots[i].count;
        }
        return found >= count;
    }
    getSelected() { return this.slots[this.selected]; }
    swap(i, j) {
        if (i >= this.capacity || j >= this.capacity) return;
        let temp = this.slots[i];
        this.slots[i] = this.slots[j];
        this.slots[j] = temp;
    }
}

class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.vx = 0; this.vy = 0;
        this.grounded = false;
        this.dead = false;
        this.fallStartY = y;
        this.hurtTimer = 0;
        this.stepTimer = 0;
    }
    update(dt, map) {
        if (this.hurtTimer > 0) this.hurtTimer--;

        if (this instanceof Player && this.flying) {
            this.grounded = false;
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0) this.x = 0;
            if (this.x > WORLD_W * TILE_SIZE - this.w) this.x = WORLD_W * TILE_SIZE - this.w;
            // Потолок над миром убран: игрок может лететь сколь угодно высоко
            // (отрицательные пиксельные Y допустимы, тайлов там просто нет).
            if (this.y > WORLD_H * TILE_SIZE) this.y = WORLD_H * TILE_SIZE;
            return;
        }

        this.grounded = false;
        this.vy += GRAVITY;
        if (this.vy > TERM_VEL) this.vy = TERM_VEL;
        this.y += this.vy;

        if (this.vy < 0) this.fallStartY = this.y;

        this._resolveCollisionY(map);
        this.x += this.vx;
        this._resolveCollisionX(map);

        // Steps
        if (this.grounded && Math.abs(this.vx) > 0.1) {
            this.stepTimer++;
            if (this.stepTimer > 20) {
                this.stepTimer = 0;
                let tx = Math.floor((this.x + this.w / 2) / TILE_SIZE);
                let ty = Math.floor((this.y + this.h + 2) / TILE_SIZE);
                let t = map.getTile(tx, ty);
                if (t !== B.AIR) {
                    // V8.3: шаги игрока всегда слышны, шаги мобов — 3D.
                    const isPlayer = this instanceof Player;
                    const srcX = isPlayer ? null : this.x + this.w / 2;
                    const srcY = isPlayer ? null : this.y + this.h / 2;
                    game.audio.playStep(t, srcX, srcY);
                }
            }
        }

        if (this.x < 0) this.x = 0;
        if (this.x > WORLD_W * TILE_SIZE - this.w) {
            this.x = WORLD_W * TILE_SIZE - this.w;
            this.dir *= -1;
        }
        if (this.y > WORLD_H * TILE_SIZE) this.die();
    }

    // Собирает все AABB-коллизии сущности с миром в текущей позиции.
    // Возвращает массив объектов { ax, ay, aw, ah, tx, ty, id } — каждый
    // элемент это один «кубик» (целый блок, половинка слаба, столб забора).
    _gatherCollisions(map) {
        const out = [];
        const minX = Math.floor(this.x / TILE_SIZE);
        const maxX = Math.floor((this.x + this.w - 0.01) / TILE_SIZE);
        const minY = Math.floor(this.y / TILE_SIZE);
        const maxY = Math.floor((this.y + this.h - 0.01) / TILE_SIZE);
        for (let ty = minY; ty <= maxY; ty++) {
            for (let tx = minX; tx <= maxX; tx++) {
                const id = map.getTile(tx, ty);
                if (id === B.AIR) continue;
                const aabbs = getBlockAABBs(id, tx, ty);
                for (let i = 0; i < aabbs.length; i++) {
                    const a = aabbs[i];
                    const ax = tx * TILE_SIZE + a.x;
                    const ay = ty * TILE_SIZE + a.y;
                    if (aabbIntersect(this.x, this.y, this.w, this.h, ax, ay, a.w, a.h)) {
                        out.push({ ax, ay, aw: a.w, ah: a.h, tx, ty, id });
                    }
                }
            }
        }
        return out;
    }

    // Y-фаза: gravity уже применена, this.y сдвинут. Расталкиваем сущность
    // обратно по высоте, выбирая ближайшую противоположную грань среди
    // всех пересечённых AABB. Фильтр по pre-move позиции отсекает боковые
    // AABB (например, стенку рядом), которые мы пересекаем не «сверху»
    // или «снизу», а сбоку — иначе их можно было бы спутать с полом.
    _resolveCollisionY(map) {
        const cols = this._gatherCollisions(map);
        if (!cols.length) return;
        const preBottom = this.y + this.h - this.vy;
        const preTop    = this.y - this.vy;
        if (this.vy > 0) {
            // Падали вниз — садимся на самую верхнюю крышу AABB (минимальный ay)
            // среди тех, чей верх был ниже нас до движения.
            let topMost = Infinity;
            for (let i = 0; i < cols.length; i++) {
                if (cols[i].ay + 0.5 >= preBottom && cols[i].ay < topMost) {
                    topMost = cols[i].ay;
                }
            }
            if (topMost === Infinity) return; // только боковые AABB — обработает X-фаза
            if (this instanceof Player) {
                // Вода смягчает падение.
                let cushioned = false;
                const minTX = Math.floor(this.x / TILE_SIZE);
                const maxTX = Math.floor((this.x + this.w - 0.01) / TILE_SIZE);
                const minTY = Math.floor(this.y / TILE_SIZE);
                const maxTY = Math.floor((this.y + this.h - 0.01) / TILE_SIZE);
                for (let cy = minTY; cy <= maxTY && !cushioned; cy++) {
                    for (let cx = minTX; cx <= maxTX && !cushioned; cx++) {
                        if (isWater(map.getTile(cx, cy))) cushioned = true;
                    }
                }
                if (!cushioned) {
                    const fallDist = (this.y - this.fallStartY) / TILE_SIZE;
                    if (fallDist > 4) game.damagePlayer(Math.floor(fallDist - 3));
                    if (this.vy > 7) {
                        VFX.landingImpact(this.x + this.w / 2, topMost);
                        game.screenShake = Math.max(game.screenShake || 0, this.vy * 0.3);
                        game.audio.playSound('break', B.DIRT);
                    }
                }
            }
            this.y = topMost - this.h;
            this.grounded = true;
            this.fallStartY = this.y;
            this.vy = 0;
        } else if (this.vy < 0) {
            // Прыгали вверх — упёрлись в потолок (самая нижняя крыша среди тех,
            // чей низ был выше макушки сущности до движения).
            let lowest = -Infinity;
            for (let i = 0; i < cols.length; i++) {
                const bot = cols[i].ay + cols[i].ah;
                if (bot - 0.5 <= preTop && bot > lowest) {
                    lowest = bot;
                }
            }
            if (lowest === -Infinity) return;
            this.y = lowest;
            this.vy = 0;
        }
    }

    // X-фаза: сначала пробуем auto step-up (подняться на полублок / ступень
    // без прыжка), а если не получается — упираемся горизонтально в ближайшую
    // вертикальную грань AABB.
    _resolveCollisionX(map) {
        const cols = this._gatherCollisions(map);
        if (!cols.length) return;

        // Auto step-up: достаточно поднять сущность так, чтобы её низ оказался
        // на верхушке СамогоВерхнего из мешающих AABB. Если требуемый подъём
        // ≤ STEP_UP_MAX и над сущностью на новой высоте свободно — поднимаемся.
        let highestTop = Infinity;
        for (let i = 0; i < cols.length; i++) {
            if (cols[i].ay < highestTop) highestTop = cols[i].ay;
        }
        const entityBottom = this.y + this.h;
        const lift = entityBottom - highestTop;
        if (lift > 0 && lift <= STEP_UP_MAX) {
            const candidateY = highestTop - this.h;
            if (!aabbIntersectsWorld(this.x, candidateY, this.w, this.h, map)) {
                this.y = candidateY;
                this.grounded = true;
                this.fallStartY = this.y;
                return;
            }
        }

        // Иначе — обычное горизонтальное упирание.
        if (this.vx > 0) {
            let minLeft = Infinity;
            for (let i = 0; i < cols.length; i++) {
                if (cols[i].ax < minLeft) minLeft = cols[i].ax;
            }
            this.x = minLeft - this.w;
        } else if (this.vx < 0) {
            let maxRight = -Infinity;
            for (let i = 0; i < cols.length; i++) {
                const r = cols[i].ax + cols[i].aw;
                if (r > maxRight) maxRight = r;
            }
            this.x = maxRight;
        }
        if (this instanceof Enemy || this instanceof PassiveMob) {
            if (this.grounded) this.vy = -7.5;
            else this.dir *= -1;
        }
        this.vx = 0;
    }

    die() {
        this.dead = true;
        VFX.death(this.x + this.w / 2, this.y + this.h / 2, '#c62828');
        game.screenShake = Math.max(game.screenShake || 0, 6);
    }
}

class Player extends Entity {
    constructor(x, y) {
        super(x, y, 20, 56);
        this.speed = 3.5;
        this.jumpPower = -7.8;
        this.hp = 10;
        this.maxHp = 10;
        // 36 слотов = 3 ряда основного инвентаря (27) + 9 слотов хотбара (последний ряд).
        // Хотбар (нижний ряд) — это те 9 слотов, между которыми игрок переключается вне инвентаря.
        this.inv = new Inventory(36);
        this.inv.capacity = 36;
        // Доспехи: голова, тело, ноги.
        this.armor = { head: null, chest: null, legs: null };
        // Крафт-сетки (живут на игроке, чтобы класть/забирать без потери).
        this.craft2x2 = [null, null, null, null];
        this.craft3x3 = [null, null, null, null, null, null, null, null, null];
        // Кулдаун атаки
        this.lastAttackTime = 0;
        this.attackCooldown = 500; // 0.5 секунды между атаками
        this.invincible = false; // Invincibility flag
        // V7: жидкостные статусы
        this.burnTimer = 0;      // тиков до конца горения (каждый 2-й тик сжигает 1 HP)
        this.inWater = false;    // обновляется каждый кадр
        this.inLava = false;
        this.lavaDamageTimer = 0; // кулдаун прямого урона от лавы
        // Beta 1.0: portal teleport state
        this.portalTimer = 0;
        this.portalCooldown = 0;
    }
    control(keys) {
        if (game.isUiOpen()) {
            this.vx = 0;
            return;
        }

        this.vx = 0;
        if (keys['KeyA'] || keys['ArrowLeft']) this.vx = -this.speed;
        if (keys['KeyD'] || keys['ArrowRight']) this.vx = this.speed;

        if (this.flying) {
            this.vy = 0;
            if (keys['KeyW'] || keys['ArrowUp'] || keys['Space']) this.vy = -this.speed;
            if (keys['KeyS'] || keys['ArrowDown']) this.vy = this.speed;
            return;
        }

        // V14: Ladder climbing — while overlapping a LADDER tile, holding Space/W
        // (or ArrowUp) moves the player upward at climb speed regardless of gravity.
        // Holding S/ArrowDown descends slowly. Releasing both lets the player
        // "stick" to the ladder (slow fall) so they don't drop off instantly.
        let onLadder = false;
        if (world) {
            const minTX = Math.floor(this.x / TILE_SIZE);
            const maxTX = Math.floor((this.x + this.w - 0.01) / TILE_SIZE);
            const minTY = Math.floor(this.y / TILE_SIZE);
            const maxTY = Math.floor((this.y + this.h - 0.01) / TILE_SIZE);
            for (let ty = minTY; ty <= maxTY && !onLadder; ty++) {
                for (let tx = minTX; tx <= maxTX && !onLadder; tx++) {
                    if (world.getTile(tx, ty) === B.LADDER) onLadder = true;
                }
            }
        }
        if (onLadder) {
            const upHeld = !!(keys['Space'] || keys['ArrowUp'] || keys['KeyW']);
            const downHeld = !!(keys['KeyS'] || keys['ArrowDown']);
            if (upHeld) {
                this.vy = -3.5; // climb up
            } else if (downHeld) {
                this.vy = 3;    // climb down
            } else {
                // Cling to the ladder: clamp downward velocity so the player slides
                // slowly instead of falling.
                if (this.vy > 1.5) this.vy = 1.5;
            }
            // Reset fall tracking so leaving the ladder doesn't trigger fall damage.
            this.fallStartY = this.y;
            this.grounded = false;
            return;
        }

        if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && this.grounded) {
            this.vy = this.jumpPower;
            this.grounded = false;
            this.fallStartY = this.y;
            game.audio.playSound('jump');
        }
    }

    canAttack() {
        return Date.now() - this.lastAttackTime >= this.attackCooldown;
    }

    attack() {
        this.lastAttackTime = Date.now();
    }
}

class Enemy extends Entity {
    constructor(x, y, type) {
        super(x, y, 24, 56);
        this.type = type;
        // type: 0=zombie, 1=spider, 2=skeleton, 3=enderman
        // УВЕЛИЧЕННОЕ ЗДОРОВЬЕ для лучшего баланса боя
        if (type === 0) this.hp = 20;        // Зомби
        else if (type === 1) this.hp = 16;   // Паук
        else if (type === 2) this.hp = 20;   // Скелет
        else if (type === 3) this.hp = 40;   // Эндермен
        else this.hp = 20;
        this.maxHp = this.hp;
        if (type === 1) { this.w = 30; this.h = 16; }
        else if (type === 3) { this.w = 22; this.h = 96; } // Эндермен — 3 блока (96 пикселей)
        this.dir = Math.random() > 0.5 ? 1 : -1;
        this.lastAttackTime = 0;

        // V16: Skeleton bow drawing state.
        // 'idle' — moving / kiting; 'drawing' — aiming, counting up draw time;
        // After release, returns to 'idle' with a reload cooldown.
        this.bowState = 'idle';
        this.bowDraw = 0;            // 0..60 frames of drawing
        this.bowReload = 0;          // cooldown frames after firing

        // V16: Enderman aggro state. Stays neutral until attacked OR until the
        // player's mouse cursor lingers inside the enderman's head for 1 sec.
        this.aggro = false;          // currently chasing the player
        this.starredTime = 0;        // frames the cursor has been inside head
        this.teleportCD = 0;         // frames until next teleport can happen
    }
    ai(dt, map, player) {
        // Tick down generic timers each frame.
        if (this.bowReload > 0) this.bowReload--;
        if (this.teleportCD > 0) this.teleportCD--;

        const overlapX = (this.x < player.x + player.w) && (this.x + this.w > player.x);
        const overlapY = (this.y < player.y + player.h) && (this.y + this.h > player.y);

        if (this.type === 0) {
            let dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);
            // HOTFIX: дистанция обнаружения поднята с 300 до 500 (~15 тайлов),
            // чтобы зомби реально преследовал игрока, а не зависал в режиме блуждания.
            if (dist < 500 && !player.dead) {
                this.dir = player.x > this.x ? 1 : -1;
                this.vx = this.dir * 1.5;
                // HOTFIX: проверка препятствия на уровне ног/тела (не головы),
                // чтобы зомби перепрыгивал одноблочные стены, как пауки.
                const feetY = Math.floor((this.y + this.h - 2) / TILE_SIZE);
                const aheadX = Math.floor((this.x + this.w / 2 + this.dir * (this.w / 2 + 4)) / TILE_SIZE);
                if (this.grounded && map.isSolid(aheadX, feetY)) {
                    this.vy = -7;
                }
            } else {
                this.vx = this.dir * 1.0;
                let nextTileX = Math.floor((this.x + this.w / 2 + (this.dir * 20)) / TILE_SIZE);
                let nextTileY = Math.floor((this.y + this.h + 2) / TILE_SIZE);
                if (!map.isSolid(nextTileX, nextTileY) && this.grounded) {
                    this.dir *= -1;
                }
            }
        } else if (this.type === 1) {
            let dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);
            // HOTFIX: аналогично — паук ловит дальше и прыгает корректно.
            if (dist < 400 && !player.dead) {
                this.vx = (player.x > this.x ? 1 : -1) * 2.5;
                const feetY = Math.floor((this.y + this.h - 2) / TILE_SIZE);
                const dir = player.x > this.x ? 1 : -1;
                const aheadX = Math.floor((this.x + this.w / 2 + dir * (this.w / 2 + 4)) / TILE_SIZE);
                if (this.grounded && map.isSolid(aheadX, feetY)) {
                    this.vy = -7.5;
                }
            } else {
                this.vx = 0;
            }
        } else if (this.type === 2) {
            // V16: Skeleton. Maintains kiting distance, draws bow, then fires.
            const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
            const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 600 && !player.dead) {
                this.dir = dx > 0 ? 1 : -1;
                // Kite: if too close, back off; if far, approach; otherwise stand & draw.
                if (dist < 180) {
                    this.vx = -this.dir * 1.6;
                } else if (dist > 380) {
                    this.vx = this.dir * 1.6;
                    const feetY = Math.floor((this.y + this.h - 2) / TILE_SIZE);
                    const aheadX = Math.floor((this.x + this.w / 2 + this.dir * (this.w / 2 + 4)) / TILE_SIZE);
                    if (this.grounded && map.isSolid(aheadX, feetY)) {
                        this.vy = -7;
                    }
                } else {
                    this.vx = 0;
                }
                // Bow logic: charge to full, then release a single arrow.
                if (this.bowReload <= 0) {
                    this.bowState = 'drawing';
                    this.bowDraw++;
                    if (this.bowDraw >= 50) {
                        // Fire!
                        if (typeof Arrow !== 'undefined') {
                            const sx = this.x + this.w / 2;
                            const sy = this.y + 14; // head height
                            const tx = player.x + player.w / 2;
                            const ty = player.y + player.h / 2;
                            const dxN = tx - sx, dyN = ty - sy;
                            const len = Math.max(1, Math.sqrt(dxN * dxN + dyN * dyN));
                            const speed = 13;
                            const vx = (dxN / len) * speed;
                            const vy = (dyN / len) * speed - 1.5; // slight upward arc compensation
                            const arr = new Arrow(sx, sy, vx, vy, /*fromPlayer*/false, /*damage*/ 4);
                            if (typeof arrows !== 'undefined') arrows.push(arr);
                        }
                        if (game && game.audio) game.audio.playSound('mob_hit', this.x);
                        this.bowDraw = 0;
                        this.bowReload = 60; // ~1 sec
                        this.bowState = 'idle';
                    }
                }
            } else {
                this.vx = this.dir * 0.8;
                this.bowDraw = 0;
                this.bowState = 'idle';
                let nextTileX = Math.floor((this.x + this.w / 2 + (this.dir * 20)) / TILE_SIZE);
                let nextTileY = Math.floor((this.y + this.h + 2) / TILE_SIZE);
                if (!map.isSolid(nextTileX, nextTileY) && this.grounded) {
                    this.dir *= -1;
                }
            }
        } else if (this.type === 3) {
            // V16: Enderman. Neutral by default. Aggro is triggered by being hit
            // (set elsewhere) or by the player looking at its head for 1 second
            // (handled in the game loop). When aggro'd, dashes at the player and
            // occasionally teleports behind/around them.
            if (this.aggro && !player.dead) {
                const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
                this.dir = dx > 0 ? 1 : -1;
                this.vx = this.dir * 2.2;
                const feetY = Math.floor((this.y + this.h - 2) / TILE_SIZE);
                const aheadX = Math.floor((this.x + this.w / 2 + this.dir * (this.w / 2 + 4)) / TILE_SIZE);
                if (this.grounded && map.isSolid(aheadX, feetY)) {
                    this.vy = -7.5;
                }
                // Occasional short-range teleport to surprise the player.
                if (this.teleportCD <= 0 && Math.random() < 0.005) {
                    this._tryTeleportNear(player, map);
                    this.teleportCD = 240;
                }
            } else {
                // Idle wandering — neutral mob behaviour.
                this.vx = this.dir * 0.6;
                let nextTileX = Math.floor((this.x + this.w / 2 + (this.dir * 20)) / TILE_SIZE);
                let nextTileY = Math.floor((this.y + this.h + 2) / TILE_SIZE);
                if (!map.isSolid(nextTileX, nextTileY) && this.grounded) {
                    this.dir *= -1;
                }
            }
        }

        // Melee contact damage. Skeletons rely on arrows and don't melee hard;
        // endermen only damage when aggro'd.
        if (overlapX && overlapY && !player.dead) {
            const wantsMelee = (this.type !== 2) && (this.type !== 3 || this.aggro);
            if (wantsMelee && Date.now() - this.lastAttackTime > 1000) {
                let baseDmg = 0;
                if (this.type === 0) baseDmg = 3;       // Zombie
                else if (this.type === 1) baseDmg = 2;  // Spider
                else if (this.type === 3) baseDmg = 7;  // Enderman (hard punch)
                const diff = (typeof game !== 'undefined' && game.difficulty != null) ? game.difficulty : 2;
                const mult = [0, 0.5, 1, 1.5][diff] ?? 1;
                let damage = Math.max(0, Math.round(baseDmg * mult));
                if (damage > 0) game.damagePlayer(damage);
                this.vx = -this.vx * 2;
                this.lastAttackTime = Date.now();
            }
        }
    }

    // V16: Pick a nearby empty surface to teleport to. Used by endermen
    // both for aggro repositioning and the "ouch, water!" escape.
    _tryTeleportNear(player, map) {
        const tries = 8;
        for (let i = 0; i < tries; i++) {
            const offX = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 120);
            const targetX = player.x + offX;
            const tx = Math.floor(targetX / TILE_SIZE);
            if (tx < 1 || tx >= WORLD_W - 1) continue;
            // Find ground from current y upward/downward.
            const startY = Math.floor((this.y + this.h / 2) / TILE_SIZE);
            for (let dy = -3; dy <= 6; dy++) {
                const ty = startY + dy;
                if (ty < 1 || ty >= WORLD_H - 1) continue;
                if (map.isSolid(tx, ty) && !map.isSolid(tx, ty - 1) && !map.isSolid(tx, ty - 2)) {
                    this.x = tx * TILE_SIZE + (TILE_SIZE - this.w) / 2;
                    this.y = (ty - 1) * TILE_SIZE - (this.h - TILE_SIZE);
                    this.vx = 0; this.vy = 0;
                    if (typeof VFX !== 'undefined' && VFX.death) {
                        VFX.death(this.x + this.w / 2, this.y + this.h / 2, '#9c27b0');
                    }
                    return true;
                }
            }
        }
        return false;
    }

    // V11/V16: дропы враждебных мобов
    die() {
        super.die();
        if (typeof player === 'undefined' || !player) return;
        if (this.type === 0) {
            // Зомби — 0–2 куска гнилой плоти
            const n = (Math.random() * 3) | 0;
            if (n > 0) player.inv.add(ITEMS.ROTTEN_FLESH, n);
        } else if (this.type === 1) {
            // Паук — 1–2 нити + шанс на паучий глаз (1/3)
            const stringCount = 1 + ((Math.random() * 2) | 0);
            player.inv.add(ITEMS.STRING, stringCount);
            if (Math.random() < 0.33) player.inv.add(ITEMS.SPIDER_EYE, 1);
        } else if (this.type === 2) {
            // Скелет — 0–2 кости + шанс выронить лук (8.5%)
            const boneCount = (Math.random() * 3) | 0;
            if (boneCount > 0) player.inv.add(ITEMS.BONE, boneCount);
            const arrowCount = (Math.random() * 3) | 0;
            if (arrowCount > 0) player.inv.add(ITEMS.ARROW, arrowCount);
            if (Math.random() < 0.085) player.inv.add(ITEMS.BOW, 1);
        } else if (this.type === 3) {
            // Эндермен — 0–1 эндер-перл (50%)
            if (Math.random() < 0.5) player.inv.add(ITEMS.ENDER_PEARL, 1);
        }
        if (game && game.audio) game.audio.playSound('break');
    }
}

class PassiveMob extends Entity {
    constructor(x, y, type) {
        let w = type === 0 ? 24 : 28;
        let h = type === 0 ? 16 : 22;
        super(x, y, w, h);
        this.mobType = type;
        // type: 0=pig, 1=cow, 2=sheep
        this.hp = type === 0 ? 10 : (type === 1 ? 10 : 8);
        this.maxHp = this.hp;
        this.dir = Math.random() > 0.5 ? 1 : -1;

        // --- V8.3: состояния ---
        // 'wander'  — неторопливо идёт в сторону dir
        // 'idle'    — стоит
        // 'curious' — смотрит на игрока, стоит
        // 'flee'    — убегает от игрока (после удара)
        // 'eat'     — жуёт траву (стоит и слегка покачивается)
        this.state = 'idle';
        this.stateTimer = 60 + Math.random() * 120;
        this.fleeTimer = 0;
        this.panic = 0;
        this.eatBob = 0;              // используется для анимации (визуально в draw может читаться)
        // Индивидуальная «черта характера» — немного разная скорость у каждого моба
        this.personality = 0.85 + Math.random() * 0.3;  // ≈0.85..1.15
        this._lastHp = this.hp;
    }

    // Вызывается снаружи, когда игрок ударил моба (см. место боя — оно уже уменьшает hp).
    // Здесь просто триггерим побег, если замечаем свежий урон.
    _checkJustHurt() {
        if (this.hp < this._lastHp) {
            this.state = 'flee';
            this.stateTimer = 180 + Math.random() * 120;
            this.panic = 1;
            // бежим от игрока
            this.dir = (this.x < player.x) ? -1 : 1;
            this._lastHp = this.hp;
            // V8.3: крик боли/паники
            if (game && game.audio) {
                game.audio.playSound('mob_panic', this.x);
                setTimeout(() => game.audio.playSound(this._voiceName(), this.x), 120);
            }
            // V8.3: частицы «!»
            if (typeof VFX !== 'undefined') {
                VFX.mobPanic(this.x + this.w / 2, this.y);
            }
        } else {
            this._lastHp = this.hp;
        }
    }

    _voiceName() {
        return this.mobType === 0 ? 'pig_snort'
            : this.mobType === 1 ? 'cow_moo'
                : 'sheep_baa';
    }

    _pickNewState(distToPlayer) {
        // При близком игроке мобы иногда становятся любопытными (поворачиваются и смотрят),
        // иногда просто стоят, иногда идут по своим делам. Если очень близко — чаще любопытны.
        if (distToPlayer < 160 && Math.random() < 0.35) {
            this.state = 'curious';
            this.stateTimer = 80 + Math.random() * 60;
            this.dir = (this.x < player.x) ? 1 : -1;
            return;
        }
        const roll = Math.random();
        if (roll < 0.35) {
            this.state = 'idle';
            this.stateTimer = 100 + Math.random() * 160;
        } else if (roll < 0.55) {
            // Едят траву (только если стоят на ней и есть дёрн под ногами)
            const fx = Math.floor((this.x + this.w / 2) / TILE_SIZE);
            const fy = Math.floor((this.y + this.h + 2) / TILE_SIZE);
            const floor = world.getTile(fx, fy);
            if (floor === B.GRASS) {
                this.state = 'eat';
                this.stateTimer = 120 + Math.random() * 100;
                return;
            }
            this.state = 'idle';
            this.stateTimer = 90;
        } else {
            this.state = 'wander';
            this.stateTimer = 160 + Math.random() * 240;
            this.dir = Math.random() > 0.5 ? 1 : -1;
        }
    }

    update(dt, map) {
        this._checkJustHurt();

        const dxToPlayer = (player.x + player.w / 2) - (this.x + this.w / 2);
        const dyToPlayer = (player.y + player.h / 2) - (this.y + this.h / 2);
        const distToPlayer = Math.sqrt(dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer);

        // Стадное поведение: если рядом такой же моб — подтянуться к нему.
        // Делаем это редким «импульсом», а не постоянной силой, чтобы стадо не слипалось.
        let herdDir = 0;
        if (this.state === 'wander' && Math.random() < 0.01) {
            let closestSame = null, closestDist = 999;
            for (const other of passives) {
                if (other === this || other.mobType !== this.mobType) continue;
                const d = Math.abs(other.x - this.x);
                if (d < closestDist && d > 40 && d < 300) { closestDist = d; closestSame = other; }
            }
            if (closestSame) {
                herdDir = closestSame.x > this.x ? 1 : -1;
                if (Math.random() < 0.7) this.dir = herdDir;
            }
        }

        // Панический режим: если игрок очень близко, переключаемся в flee без удара
        // (только свиньи/овцы — коровы флегматичны).
        if (this.state !== 'flee' && distToPlayer < 60 && this.mobType !== 1 && Math.random() < 0.02) {
            this.state = 'flee';
            this.stateTimer = 90;
            this.dir = dxToPlayer > 0 ? -1 : 1;
            this.panic = 0.6;
        }

        this.stateTimer--;
        if (this.stateTimer <= 0) {
            this._pickNewState(distToPlayer);
        }

        // --- движение в зависимости от состояния ---
        const baseSpeed = 0.5 * this.personality;
        if (this.state === 'idle' || this.state === 'curious' || this.state === 'eat') {
            this.vx = 0;
            // Любопытство: постоянно смотрим на игрока
            if (this.state === 'curious') {
                this.dir = dxToPlayer > 0 ? 1 : -1;
            }
            if (this.state === 'eat') {
                // лёгкое покачивание (визуальное — увеличиваем eatBob, draw может им пользоваться)
                this.eatBob = (this.eatBob + 0.12) % (Math.PI * 2);
                // звук жевания очень редко (чтоб не спамило)
                if (game && game.audio && Math.random() < 0.008 && distToPlayer < 280) {
                    game.audio.playSound('eat_grass', this.x);
                }
            }
        } else if (this.state === 'wander') {
            this.vx = this.dir * baseSpeed;
        } else if (this.state === 'flee') {
            // убегаем быстрее
            this.vx = this.dir * baseSpeed * 2.6;
            this.panic = Math.max(0, this.panic - 0.002);
            // небольшой «панический» прыжок иногда
            if (this.grounded && Math.random() < 0.015) this.vy = -6.5;
        }

        // V8.3: редкий амбиентный «голос» моба
        if (game && game.audio && this.state !== 'flee' && distToPlayer < 360) {
            // ~раз в 4-12 секунд в среднем (60fps)
            if (Math.random() < 0.0015) {
                game.audio.playSound(this._voiceName(), this.x);
            }
        }

        // Проверка препятствия впереди (со стеной/обрывом)
        if (this.vx !== 0) {
            const ahead = this.dir > 0 ? this.x + this.w + 5 : this.x - 5;
            const tx = Math.floor(ahead / TILE_SIZE);
            const tyFoot = Math.floor((this.y + this.h - 5) / TILE_SIZE);
            const tyAhead = Math.floor((this.y + this.h + 4) / TILE_SIZE);

            // 1) перед носом стенка — попробовать запрыгнуть, иначе развернуться
            if (map.isSolid(tx, tyFoot) && this.grounded) {
                if (!map.isSolid(tx, tyFoot - 1)) {
                    this.vy = -6;
                } else {
                    this.dir *= -1;
                }
            }
            // 2) впереди обрыв — развернуться, чтобы не падать (в режиме wander / curious, но не в flee)
            else if (this.state !== 'flee' && this.grounded && !map.isSolid(tx, tyAhead)) {
                // только если обрыв глубокий (иначе пусть идут по холмам)
                if (!map.isSolid(tx, tyAhead + 1)) this.dir *= -1;
            }
        }

        super.update(dt, map);
    }

    die() {
        super.die();
        let drops = [];
        if (this.mobType === 0) drops.push(ITEMS.PORK_RAW);
        else if (this.mobType === 1) { drops.push(ITEMS.BEEF_RAW); drops.push(ITEMS.LEATHER); }
        else if (this.mobType === 2) {
            drops.push(ITEMS.MUTTON_RAW);
            if (this.woolBlockId) drops.push(this.woolBlockId);
            else drops.push(ITEMS.WHITE_WOOL);
            // V11: овца с 70% шансом роняет 1–2 пера (заменитель курицы)
            if (Math.random() < 0.7) {
                const featherCount = 1 + ((Math.random() * 2) | 0);
                for (let i = 0; i < featherCount; i++) drops.push(ITEMS.FEATHER);
            }
        }

        drops.forEach(d => player.inv.add(d, 1));
        game.audio.playSound('break');
    }
}

// Blast resistance per block id (Minecraft-style). Higher = harder to break.
// Bedrock is essentially infinite. Stone/ores ~30, dirt/wood ~3, glass/leaves ~0.3.
const BLAST_RESISTANCE = (() => {
    const r = {};
    r[B.BEDROCK]      = 3600000;
    r[B.WATER_0]      = 500;  // liquids absorb a lot
    r[B.LAVA_0]       = 500;
    r[B.STONE]        = 30;
    r[B.COBBLESTONE]  = 30;
    r[B.STONE_STAIRS] = 30;
    r[B.STONE_SLAB]   = 30;
    r[B.COBBLE_STAIRS] = 30;
    r[B.COBBLE_SLAB]  = 30;
    r[B.COBBLE_FENCE] = 30;
    r[B.COAL_ORE]     = 30;
    r[B.IRON_ORE]     = 30;
    r[B.GOLD_ORE]     = 30;
    r[B.DIAMOND_ORE]  = 30;
    r[B.IRON_BLOCK]   = 30;
    r[B.GOLD_BLOCK]   = 30;
    r[B.DIAMOND_BLOCK] = 30;
    r[B.COAL_BLOCK]   = 30;
    r[B.BRICK]        = 30;
    r[B.BRICK_STAIRS] = 30;
    r[B.BRICK_SLAB]   = 30;
    r[B.BRICK_FENCE]  = 30;
    r[B.FURNACE]      = 17;
    r[B.WORKBENCH]    = 12;
    r[B.WOOD]         = 10;
    r[B.PLANK]        = 15;
    r[B.WOOD_STAIRS]  = 15;
    r[B.WOOD_SLAB]    = 15;
    r[B.WOOD_FENCE]   = 15;
    r[B.WOOD_DOOR]    = 15;
    r[B.WOOD_TRAPDOOR] = 15;
    r[B.WOOD_GATE] = 15;
    r[B.BOOKSHELF]    = 7;
    r[B.BOOKSHELF_SLAB] = 7;
    r[B.CHEST]        = 12;
    r[B.DIRT]         = 2.5;
    r[B.DIRT_SLAB]    = 2.5;
    r[B.GRASS]        = 2.5;
    r[B.SAND]         = 2.5;
    r[B.SAND_SLAB]    = 2.5;
    r[B.GRAVEL]       = 3;
    r[B.CLAY_BLOCK]   = 3;
    r[B.FARMLAND]     = 3;
    r[B.GLASS]        = 0.3;
    r[B.GLASS_SLAB]   = 0.3;
    r[B.LEAF]         = 0.2;
    r[B.TNT]          = 0;        // TNT chain detonates trivially
    r[B.TORCH_PLACED] = 0;
    r[B.LADDER]       = 0.4;
    r[B.LEVER]        = 0.5;
    r[B.BED]          = 0.2;
    r[B.WHEAT_0]      = 0;
    r[B.WHEAT_1]      = 0;
    r[B.WHEAT_2]      = 0;
    r[B.WHEAT_3]      = 0;
    // V14: flowers/grass = trivially weak; snow/ice = soft.
    r[B.POPPY]               = 0;
    r[B.DANDELION]           = 0;
    r[B.BLUE_ORCHID]         = 0;
    r[B.ALLIUM]              = 0;
    r[B.AZURE_BLUET]         = 0;
    r[B.RED_TULIP]           = 0;
    r[B.ORANGE_TULIP]        = 0;
    r[B.WHITE_TULIP]         = 0;
    r[B.PINK_TULIP]          = 0;
    r[B.OXEYE_DAISY]         = 0;
    r[B.CORNFLOWER]          = 0;
    r[B.LILY_OF_THE_VALLEY]  = 0;
    r[B.SUNFLOWER_BOTTOM]    = 0;
    r[B.SUNFLOWER_TOP]       = 0;
    r[B.LILAC_BOTTOM]        = 0;
    r[B.LILAC_TOP]           = 0;
    r[B.ROSE_BUSH_BOTTOM]    = 0;
    r[B.ROSE_BUSH_TOP]       = 0;
    r[B.PEONY_BOTTOM]        = 0;
    r[B.PEONY_TOP]           = 0;
    r[B.SHORT_GRASS]         = 0;
    r[B.TALL_GRASS_BOTTOM]   = 0;
    r[B.TALL_GRASS_TOP]      = 0;
    r[B.SNOW_LAYER]          = 0.5;
    r[B.SNOW_BLOCK]          = 1;
    r[B.ICE]                 = 2.5;
    r[B.PACKED_ICE]          = 2.5;
    // Beta 1.1: Desert blocks.
    r[B.CACTUS]              = 0.4;
    r[B.DEAD_BUSH]           = 0;
    r[B.SANDSTONE]           = 4;   // softer than stone, harder than dirt
    return r;
})();

function getBlastResistance(id) {
    if (id === undefined || id === B.AIR) return 0;
    if (BLAST_RESISTANCE[id] !== undefined) return BLAST_RESISTANCE[id];
    return 6; // default for unknown blocks
}

class PrimedTNT extends Entity {
    constructor(x, y) {
        super(x, y, 28, 28);
        // Minecraft TNT fuse is 80 game ticks at 20 tps = 4s.
        // This engine runs update() at 60fps with dt≈1, so 240 == 4s.
        this.fuse = 240;
        // Vanilla: primed TNT has effectively no horizontal velocity when
        // lit by hand / flint & steel — it just sits where it was placed.
        // Only TNT primed by a nearby explosion gets a directional kick
        // (PrimedTNT instances spawned from explode() override these).
        this.vx = 0;
        this.vy = -3.0;          // small upward "pop" on prime (vanilla 0.2 ~ -3px/frame here)
        this.hp = 999;
        this.maxHp = 999;
        this.flash = 0;
        if (game && game.audio) game.audio.playSound('break'); // ignition pop
    }

    update(dt, map) {
        this.fuse -= dt;
        // Flash speeds up as fuse approaches 0 (like Minecraft).
        const flashRate = this.fuse < 60 ? 6 : (this.fuse < 120 ? 12 : 20);
        this.flash = (Math.floor(this.fuse / flashRate) % 2 === 0) ? 1 : 0;

        // Emit a little smoke trail.
        if (Math.random() < 0.4) {
            game.particles.push(new Particle(
                this.x + 14 + (Math.random() - 0.5) * 8,
                this.y + 2 + (Math.random() - 0.5) * 4,
                '#dcdcdc',
                { type: 'smoke', speed: 0.6, life: 0.8, decay: 0.04, gravity: -0.03 }
            ));
        }

        if (this.fuse <= 0) {
            this.dead = true;
            this.explode();
        }
        super.update(dt, map);

        // Vanilla drag: horizontal motion decays in the air (×0.98/tick)
        // and almost stops on the ground (×0.7/tick). Without this the
        // primed block slides indefinitely after the slightest nudge.
        this.vx *= this.grounded ? 0.7 : 0.98;
        if (Math.abs(this.vx) < 0.02) this.vx = 0;
    }

    explode() {
        if (game && game.audio) game.audio.playSound('mob_hit');
        game.shake = 24;

        const centerX = this.x + 14;
        const centerY = this.y + 14;
        const tx = Math.floor(centerX / TILE_SIZE);
        const ty = Math.floor(centerY / TILE_SIZE);

        // --- Particles: bright core + smoke ring ---
        for (let i = 0; i < 28; i++) {
            const ang = (i / 28) * Math.PI * 2;
            const sp = 6 + Math.random() * 4;
            game.particles.push(new Particle(
                centerX, centerY, ['#fff', '#ffeb3b', '#ff9800', '#ff5722'][(Math.random() * 4) | 0],
                { type: 'spark', speed: sp, life: 0.9, decay: 0.04, gravity: 0,
                  vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp }
            ));
        }
        for (let i = 0; i < 24; i++) {
            game.particles.push(new Particle(
                centerX + (Math.random() - 0.5) * 24,
                centerY + (Math.random() - 0.5) * 24, '#222',
                { type: 'smoke', speed: 2 + Math.random() * 2, life: 1.6, decay: 0.018, gravity: -0.05 }
            ));
        }

        // --- Damage entities (with distance falloff) ---
        const POWER = 4.0;                   // Minecraft TNT power
        const radiusPx = POWER * 2 * TILE_SIZE;
        [player, ...enemies, ...passives].forEach(e => {
            if (e === this) return;
            const ex = e.x + (e.w || 0) / 2;
            const ey = e.y + (e.h || 0) / 2;
            const dx = ex - centerX;
            const dy = ey - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= radiusPx) return;
            // Vanilla impact = (1 - d/R) * exposure. We don't trace exposure in 2D,
            // assume 1.0. Damage = (impact^2 + impact) * 7 * power + 1.
            const impact = 1 - dist / radiusPx;
            const dmg = Math.floor((impact * impact + impact) * 7 * POWER + 1);
            // Knockback applies to everything (including the player) — independent
            // of the hurtTimer i-frame check inside damagePlayer.
            if (dist > 0.01) {
                e.vx += (dx / dist) * impact * 14;
                e.vy += (dy / dist) * impact * 14 - 3;
            }
            if (e === player) {
                // Route through damagePlayer so armor/HUD/death-screen all fire.
                // `force=true` bypasses the hurtTimer i-frame so a lethal blast
                // still kills you even if you were just hit a moment ago.
                game.damagePlayer(dmg, true);
            } else {
                e.hp -= dmg;
                e.hurtTimer = 10;
                if (e.hp <= 0 && typeof e.die === 'function') e.die();
            }
        });

        // --- Destroy blocks via ray-cast (Minecraft style) ---
        // Cast rays from the centre in all directions; each ray loses intensity
        // both with distance and with the blast resistance of blocks it passes.
        // When a block's blast resistance is too high relative to the remaining
        // intensity, the ray stops without breaking that block.
        const destroyed = new Set();
        const RAYS = 64;                   // 2D — denser than vanilla's 16 per axis
        for (let r = 0; r < RAYS; r++) {
            const ang = (r / RAYS) * Math.PI * 2;
            // Random intensity 0.7..1.3 of base — gives an organic, lumpy radius.
            let intensity = (0.7 + Math.random() * 0.6) * POWER;
            const step = 0.3;             // ray step in tiles
            const dxs = Math.cos(ang) * step * TILE_SIZE;
            const dys = Math.sin(ang) * step * TILE_SIZE;
            let rx = centerX, ry = centerY;
            while (intensity > 0) {
                rx += dxs; ry += dys;
                const bx = Math.floor(rx / TILE_SIZE);
                const by = Math.floor(ry / TILE_SIZE);
                const id = world.getTile(bx, by);
                if (id === undefined) break;
                if (id !== B.AIR) {
                    const res = getBlastResistance(id);
                    // Each step costs (res/5 + 0.3) * 0.3 of intensity.
                    intensity -= (res / 5 + 0.3) * step;
                    if (intensity <= 0) break;
                    destroyed.add(`${bx},${by}`);
                }
                intensity -= 0.225 * step;
            }
        }

        // Apply destruction — chain-detonate TNT, drop a fraction of items.
        // Minecraft yields ~1/power of blocks; we add to player inventory directly
        // if the player is within auto-pickup range (no item entities exist in this
        // engine), otherwise the block is lost.
        const dropChance = 1 / POWER;
        const playerCx = player.x + (player.w || 16) / 2;
        const playerCy = player.y + (player.h || 16) / 2;
        const PICKUP_RANGE_SQ = (TILE_SIZE * 12) ** 2;
        destroyed.forEach(k => {
            const [xs, ys] = k.split(',');
            const bx = xs | 0, by = ys | 0;
            const id = world.getTile(bx, by);
            if (id === B.AIR || id === B.BEDROCK) return;
            if (isLiquid(id)) return;
            if (id === B.TNT) {
                world.setTile(bx, by, B.AIR);
                const tnt = new PrimedTNT(bx * TILE_SIZE + 2, by * TILE_SIZE + 2);
                tnt.fuse = 10 + Math.random() * 30;
                // Chain-detonated TNT inherits an outward velocity from the
                // explosion that primed it (vanilla behaviour). Hand-lit TNT
                // stays still — see the constructor's vx=0/vy=-3 default.
                const ddx = (bx * TILE_SIZE + TILE_SIZE / 2) - centerX;
                const ddy = (by * TILE_SIZE + TILE_SIZE / 2) - centerY;
                const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                tnt.vx = (ddx / dd) * 2.5;
                tnt.vy = (ddy / dd) * 2.5 - 2.5;
                passives.push(tnt);
                return;
            }
            // Visual break particles for the destroyed block.
            const col = BLOCKS[id] && BLOCKS[id].color ? BLOCKS[id].color : '#888';
            if (typeof VFX !== 'undefined' && VFX.blockBreak) {
                VFX.blockBreak(bx * TILE_SIZE, by * TILE_SIZE, col);
            }
            world.setTile(bx, by, B.AIR);
            // Auto-collect a fraction into the player's inventory, mirroring vanilla
            // loot yield without requiring an item-entity system.
            if (Math.random() < dropChance) {
                const ddx = bx * TILE_SIZE + 16 - playerCx;
                const ddy = by * TILE_SIZE + 16 - playerCy;
                if (ddx * ddx + ddy * ddy < PICKUP_RANGE_SQ) {
                    try { player.inv.add(id, 1); } catch (_) {}
                }
            }
        });

        // After destruction, give a small chance to spawn fire on flammable
        // blocks that survived adjacent to destroyed ones — only ~⅓ of true MC
        // TNT does this, but it adds character.
        destroyed.forEach(k => {
            const [xs, ys] = k.split(',');
            const bx = xs | 0, by = ys | 0;
            if (Math.random() > 0.12) return;
            // Check neighbours under the destroyed cell — if anything flammable is
            // exposed and the cell itself is AIR now, ignite occasionally.
            if (world.getTile(bx, by) !== B.AIR) return;
            const below = world.getTile(bx, by + 1);
            if (FIRE_FLAMMABILITY[below] !== undefined) {
                world.setTile(bx, by, B.FIRE);
                world.fireAge[`${bx},${by}`] = 0;
            }
        });

        world.lightmapDirty = true;
    }
}

function igniteTNT(tx, ty) {
    if (world.getTile(tx, ty) === B.TNT) {
        world.setTile(tx, ty, B.AIR);
        const tnt = new PrimedTNT(tx * TILE_SIZE + 2, ty * TILE_SIZE + 2);
        passives.push(tnt);
    }
}

// V16: Arrow projectile. Used by both the player (bow) and skeletons.
// Moves with simple ballistics, dies on contact with a solid block or an entity.
class Arrow {
    constructor(x, y, vx, vy, fromPlayer, damage) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.w = 6; this.h = 2;
        this.fromPlayer = !!fromPlayer;
        this.damage = damage != null ? damage : 2;
        this.dead = false;
        this.life = 180; // ~3 sec until despawn
        this.angle = Math.atan2(vy, vx);
        this.stuck = false;
        this.stuckTimer = 0;
    }

    update(dt, map) {
        if (this.dead) return;
        if (this.stuck) {
            this.stuckTimer++;
            if (this.stuckTimer > 200) this.dead = true;
            return;
        }
        this.life--;
        if (this.life <= 0) { this.dead = true; return; }

        // Ballistics: gravity + slight drag.
        this.vy += 0.18;
        this.x += this.vx;
        this.y += this.vy;
        this.angle = Math.atan2(this.vy, this.vx);

        // Out of world
        if (this.y > WORLD_H * TILE_SIZE || this.x < 0 || this.x > WORLD_W * TILE_SIZE) {
            this.dead = true; return;
        }

        // Tile collision (use tip of arrow).
        const tipX = this.x + Math.cos(this.angle) * 8;
        const tipY = this.y + Math.sin(this.angle) * 8;
        const tx = Math.floor(tipX / TILE_SIZE);
        const ty = Math.floor(tipY / TILE_SIZE);
        if (map.isSolid && map.isSolid(tx, ty)) {
            this.stuck = true;
            this.vx = 0; this.vy = 0;
            if (game && game.audio) game.audio.playSound('place');
            return;
        }

        // Entity hits.
        if (this.fromPlayer) {
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (tipX > e.x && tipX < e.x + e.w && tipY > e.y && tipY < e.y + e.h) {
                    e.hp -= this.damage;
                    e.hurtTimer = 5;
                    e.vx = (e.x < this.x ? -1 : 1) * 4;
                    e.vy = -2;
                    if (typeof VFX !== 'undefined' && VFX.hit) VFX.hit(tipX, tipY, '#c62828');
                    if (game && game.audio) game.audio.playSound('mob_hit', e.x + e.w / 2);
                    // V16: Hitting an Enderman with an arrow makes it teleport
                    // away ("avoidance"), not aggro-charge.
                    if (e.type === 3 && typeof e._tryTeleportNear === 'function') {
                        e._tryTeleportNear(player, map);
                    }
                    if (e.hp <= 0 && typeof e.die === 'function') {
                        e.die();
                        if (typeof stats !== 'undefined') stats.kills++;
                        if (typeof game !== 'undefined' && game.addScore) {
                            let xp = 0;
                            if (e.type === 0) xp = XP_VALUES.KILL_ZOMBIE;
                            else if (e.type === 1) xp = XP_VALUES.KILL_SPIDER;
                            else if (e.type === 2) xp = XP_VALUES.KILL_SKELETON;
                            else if (e.type === 3) xp = XP_VALUES.KILL_ENDERMAN;
                            if (xp) game.addScore(xp);
                        }
                    }
                    this.dead = true;
                    return;
                }
            }
            for (let i = 0; i < passives.length; i++) {
                const e = passives[i];
                if (!e || e instanceof PrimedTNT) continue;
                if (tipX > e.x && tipX < e.x + e.w && tipY > e.y && tipY < e.y + e.h) {
                    e.hp -= this.damage;
                    e.hurtTimer = 5;
                    if (typeof VFX !== 'undefined' && VFX.hit) VFX.hit(tipX, tipY, '#c62828');
                    if (e.hp <= 0 && typeof e.die === 'function') e.die();
                    this.dead = true;
                    return;
                }
            }
        } else {
            // From mob → hits player.
            if (tipX > player.x && tipX < player.x + player.w && tipY > player.y && tipY < player.y + player.h) {
                if (game && game.damagePlayer) game.damagePlayer(this.damage);
                if (typeof VFX !== 'undefined' && VFX.hit) VFX.hit(tipX, tipY, '#c62828');
                this.dead = true;
                return;
            }
        }
    }
}

// V16: Thrown ender pearl. RMB-thrown by the player. On impact (tile or entity),
// teleports the player to the impact location, applies fall damage, and dies.
class EnderPearl {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.w = 8; this.h = 8;
        this.dead = false;
        this.life = 300; // 5 sec
        this.trailTimer = 0;
    }
    update(dt, map) {
        if (this.dead) return;
        this.life--;
        if (this.life <= 0) { this.dead = true; return; }

        this.vy += 0.22;
        this.x += this.vx;
        this.y += this.vy;

        // Trail particles
        this.trailTimer++;
        if (this.trailTimer % 2 === 0 && typeof Particle !== 'undefined' && game && game.particles) {
            game.particles.push(new Particle(
                this.x + 4, this.y + 4,
                ['#7e57c2', '#9c27b0', '#ce93d8'][(Math.random() * 3) | 0],
                { type: 'spark', speed: 0.4, life: 0.6, decay: 0.06, gravity: 0.02 }
            ));
        }

        if (this.y > WORLD_H * TILE_SIZE || this.x < 0 || this.x > WORLD_W * TILE_SIZE) {
            this._teleport(this.x, this.y - 32);
            return;
        }

        const tx = Math.floor((this.x + 4) / TILE_SIZE);
        const ty = Math.floor((this.y + 4) / TILE_SIZE);
        if (map.isSolid && map.isSolid(tx, ty)) {
            this._teleport(this.x, this.y - 16);
            return;
        }

        // Entity collisions — also teleport on hit, with damage to the entity.
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (this.x + this.w > e.x && this.x < e.x + e.w &&
                this.y + this.h > e.y && this.y < e.y + e.h) {
                e.hp -= 1;
                e.hurtTimer = 5;
                this._teleport(this.x, this.y - 16);
                return;
            }
        }
    }
    _teleport(px, py) {
        if (this.dead) return;
        this.dead = true;
        if (typeof player === 'undefined' || !player) return;
        // Drop a chunk of fall damage on arrival (like vanilla MC: 5 HP).
        const diff = (typeof game !== 'undefined' && game.difficulty != null) ? game.difficulty : 2;
        const dmg = [0, 2, 4, 5][diff] ?? 4;
        // Particle burst at departure
        if (typeof VFX !== 'undefined' && VFX.death) {
            VFX.death(player.x + player.w / 2, player.y + player.h / 2, '#9c27b0');
        }
        // Snap player to landing spot — adjust for player height.
        const newX = Math.max(0, Math.min(WORLD_W * TILE_SIZE - player.w, px - player.w / 2));
        const newY = Math.max(0, py - player.h);
        player.x = newX;
        player.y = newY;
        player.vx = 0;
        player.vy = 0;
        player.fallStartY = player.y;
        if (typeof VFX !== 'undefined' && VFX.death) {
            VFX.death(player.x + player.w / 2, player.y + player.h / 2, '#9c27b0');
        }
        if (game && game.damagePlayer && dmg > 0) game.damagePlayer(dmg);
        if (game && game.audio) game.audio.playSound('break');
    }
}

// V16: Global arrays for projectiles. Declared up front so other code that
// references them (Enemy.ai, summon command, draw loop) does not hit a TDZ.
let arrows = [];
let pearls = [];

// Beta 1.0: Ghast fireballs (in-flight projectiles).
let fireballs = [];

// Beta 1.0: Ghast fireball. Slow homing-ish projectile launched by ghasts.
// Explodes on contact with a solid block, an entity, or the player.
class Fireball {
    constructor(x, y, vx, vy, fromGhast) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.w = 12; this.h = 12;
        this.fromGhast = !!fromGhast;
        this.dead = false;
        this.life = 240;
    }
    update(dt, map) {
        if (this.dead) return;
        this.life--;
        if (this.life <= 0) { this.dead = true; return; }
        this.x += this.vx;
        this.y += this.vy;
        // Trail particles.
        if (Math.random() < 0.8) {
            game.particles.push(new Particle(
                this.x + this.w / 2 + (Math.random() - 0.5) * 4,
                this.y + this.h / 2 + (Math.random() - 0.5) * 4,
                ['#ff9800', '#ffeb3b', '#ff5722'][(Math.random() * 3) | 0],
                { type: 'spark', vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
                  life: 0.4, decay: 0.06, size: 2, gravity: 0 }
            ));
        }
        // Solid block collision.
        const cx = Math.floor((this.x + this.w / 2) / TILE_SIZE);
        const cy = Math.floor((this.y + this.h / 2) / TILE_SIZE);
        if (map.isSolid(cx, cy)) {
            this.explode(cx, cy);
            return;
        }
        // Player collision.
        if (player && !player.dead) {
            if (this.x < player.x + player.w && this.x + this.w > player.x &&
                this.y < player.y + player.h && this.y + this.h > player.y) {
                if (!player.invincible) game.damagePlayer(4);
                this.explode(cx, cy);
                return;
            }
        }
    }
    explode(tx, ty) {
        this.dead = true;
        game.audio.playSound('break');
        for (let i = 0; i < 20; i++) {
            game.particles.push(new Particle(
                this.x + this.w / 2 + (Math.random() - 0.5) * 16,
                this.y + this.h / 2 + (Math.random() - 0.5) * 16,
                ['#ff9800', '#ffeb3b', '#ff5722', '#bf360c'][(Math.random() * 4) | 0],
                { type: 'spark', vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                  life: 0.7, decay: 0.05, size: 3, gravity: 0 }
            ));
        }
        // Small fire-starting splash (no block damage, just light a fire on netherrack).
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const fx = tx + dx, fy = ty + dy;
            if (world.getTile(fx, fy) === B.AIR) {
                const below = world.getTile(fx, fy + 1);
                if (below === B.NETHERRACK || below === B.STONE || below === B.PLANK || below === B.WOOD) {
                    if (Math.random() < 0.4) {
                        world.setTile(fx, fy, B.FIRE);
                        world.fireAge[`${fx},${fy}`] = 0;
                    }
                }
            }
        }
    }
}

// Beta 1.0: Ghast — flying Nether mob that shoots fireballs.
class Ghast {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 64; this.h = 64;
        this.vx = 0; this.vy = 0;
        this.hp = 10;
        this.maxHp = 10;
        this.dead = false;
        this.dir = Math.random() > 0.5 ? 1 : -1;
        this.driftTimer = 60 + (Math.random() * 120) | 0;
        this.fireCooldown = 80 + (Math.random() * 80) | 0;
        this.bobPhase = Math.random() * Math.PI * 2;
    }
    update(dt, map) {
        if (this.dead) return;
        this.bobPhase += 0.04;
        this.driftTimer--;
        if (this.driftTimer <= 0) {
            this.dir = Math.random() > 0.5 ? 1 : -1;
            this.driftTimer = 60 + (Math.random() * 180) | 0;
        }
        this.vx = this.dir * 0.5;
        this.vy = Math.sin(this.bobPhase) * 0.6;
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off walls/ceiling lightly.
        const tx = Math.floor((this.x + this.w / 2) / TILE_SIZE);
        const ty = Math.floor((this.y + this.h / 2) / TILE_SIZE);
        if (map.isSolid(tx + (this.dir > 0 ? 2 : -2), ty)) this.dir *= -1;

        // Try to fire at player when in range.
        if (!player || player.dead) return;
        const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
        const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 600) {
            this.fireCooldown--;
            if (this.fireCooldown <= 0) {
                const speed = 4;
                const len = Math.max(1, dist);
                const vx = (dx / len) * speed;
                const vy = (dy / len) * speed;
                fireballs.push(new Fireball(this.x + this.w / 2 - 6, this.y + this.h / 2 - 6, vx, vy, true));
                game.audio.playSound('mob_hit', this.x);
                this.fireCooldown = 180 + (Math.random() * 120) | 0;
            }
        } else {
            this.fireCooldown = Math.max(this.fireCooldown, 80);
        }
    }
    takeDamage(dmg) {
        this.hp -= dmg;
        if (this.hp <= 0) this.die();
    }
    die() {
        this.dead = true;
        if (player && Math.random() < 0.25) player.inv.add(ITEMS.GHAST_TEAR, 1);
        game.audio.playSound('break');
        stats.kills++;
    }
}
let ghasts = [];

// Beta 1.0: Zombie Pigman (zombie piglin) — нейтральный пока на него не нападут;
// при ударе одного — агрятся ВСЕ зомби-пиглины на поле. Это единственный
// «свинолюд» в игре: обычных piglin-ов нет — только их зомби-вариант.
class Pigman {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 24; this.h = 56;
        this.vx = 0; this.vy = 0;
        this.hp = 14; this.maxHp = 14;
        this.dead = false;
        this.dir = Math.random() > 0.5 ? 1 : -1;
        this.aggro = false;
        this.attackCooldown = 0;
        this.grounded = false;
    }
    update(dt, map) {
        if (this.dead) return;

        // Gravity + ground collision (simple).
        this.vy += GRAVITY;
        if (this.vy > TERM_VEL) this.vy = TERM_VEL;
        this.y += this.vy;
        const footTX = Math.floor((this.x + this.w / 2) / TILE_SIZE);
        const footTY = Math.floor((this.y + this.h) / TILE_SIZE);
        if (map.isSolid(footTX, footTY)) {
            this.y = footTY * TILE_SIZE - this.h;
            this.vy = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }

        // Horizontal AI.
        if (this.aggro && player && !player.dead) {
            this.dir = (player.x > this.x) ? 1 : -1;
            this.vx = this.dir * 1.4;
        } else {
            this.vx = this.dir * 0.5;
        }
        this.x += this.vx;
        // Wall/cliff turn-around.
        const aheadTX = Math.floor((this.x + this.w / 2 + this.dir * (this.w / 2 + 4)) / TILE_SIZE);
        const groundTY = Math.floor((this.y + this.h + 2) / TILE_SIZE);
        if (map.isSolid(aheadTX, groundTY - 1) && this.grounded) {
            // Wall ahead — try to jump.
            this.vy = -7;
        } else if (!this.aggro && this.grounded && !map.isSolid(aheadTX, groundTY)) {
            // Cliff ahead — turn around (only when wandering peacefully).
            this.dir *= -1;
        }

        // Attack player on contact.
        if (this.aggro && player && !player.dead && this.attackCooldown <= 0) {
            const overlapX = (this.x < player.x + player.w) && (this.x + this.w > player.x);
            const overlapY = (this.y < player.y + player.h) && (this.y + this.h > player.y);
            if (overlapX && overlapY) {
                game.damagePlayer(3);
                this.attackCooldown = 45;
            }
        }
        if (this.attackCooldown > 0) this.attackCooldown--;
    }
    takeDamage(dmg) {
        this.hp -= dmg;
        if (!this.aggro) {
            this.aggro = true;
            // Alert every pigman on the field.
            for (const p of pigmen) p.aggro = true;
        }
        if (this.hp <= 0) this.die();
    }
    die() {
        this.dead = true;
        if (player) {
            // Дроп зомби-пиглина: золотые самородки (всегда), золотые слитки
            // (часть случаев) и редкий золотой меч с уже изношенной прочностью.
            const nuggets = 1 + ((Math.random() * 3) | 0); // 1..3
            player.inv.add(ITEMS.GOLD_NUGGET, nuggets);
            if (Math.random() < 0.25) {
                player.inv.add(ITEMS.GOLD_INGOT, 1);
            }
            if (Math.random() < 0.035) {
                // Меч с уже истраченной прочностью — оставляем 1..max-2 единиц.
                const max = MAX_DUR[ITEMS.GOLD_SWORD] || 32;
                const dur = 1 + ((Math.random() * (max - 2)) | 0);
                player.inv.add(ITEMS.GOLD_SWORD, 1, dur);
            }
        }
        game.audio.playSound('break');
        stats.kills++;
    }
}
let pigmen = [];

// Beta 1.0: Generate the Nether dimension into the existing World's tile
// arrays (in-place). Имитирует «майнкрафтовский» Незер: огромные пещеры
// неровной формы, потолок со сталактитами и кластерами глоустоуна, столбы
// и колонны нетеррака, большие лавовые озёра с магма-блоками по краям,
// пятна соул-сэнда вблизи лавы и редкие фрагменты руин из нетер-кирпича.
function buildNetherWorld(w) {
    const W = w.w, H = w.h;
    w.tiles = new Uint8Array(W * H);
    w.tilesBg = new Uint8Array(W * H);
    w.tilesFg = new Uint8Array(W * H);
    w.blockMeta = {};
    w.furnaces = {};
    w.chests = {};
    w.crops = {};
    w.waterSources = new Set();
    w.lavaSources = new Set();
    w.fires = new Set();
    w.fireAge = {};
    w.liquidQueue = new Set();
    w.biomeMap = null;
    w.bgObjects = [];

    const set = (x, y, id) => { w.tiles[y * W + x] = id; };
    const setBg = (x, y, id) => { w.tilesBg[y * W + x] = id; };
    const getT = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? B.BEDROCK : w.tiles[y * W + x];
    // Простейший Value-noise через сглаживание псевдо-случайных значений.
    // Используется для естественной формы потолка/пола и стенок пещер.
    const hash = (a, b) => {
        let n = (a * 73856093) ^ (b * 19349663) ^ ((w.seed | 0) * 83492791);
        n = (n >>> 0) % 100000;
        return n / 100000;
    };
    const noise1 = (x, scale) => {
        const xs = x / scale;
        const x0 = Math.floor(xs), xf = xs - x0;
        const a = hash(x0, 17), b = hash(x0 + 1, 17);
        const t = xf * xf * (3 - 2 * xf);
        return a + (b - a) * t;
    };

    // Top bedrock cap (3 rows).
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < 3; y++) set(x, y, B.BEDROCK);
    }
    // Bottom bedrock cap.
    for (let x = 0; x < W; x++) {
        for (let y = H - 3; y < H; y++) set(x, y, B.BEDROCK);
    }

    // Слой потолка: не плоский, а неровный — комбинация двух частот шума,
    // как «свод» пещеры в Minecraft. Толщина варьируется 22..30 блоков.
    const roofBaseY = 28;
    const roofY = new Int32Array(W);
    for (let x = 0; x < W; x++) {
        const noise = (noise1(x, 60) - 0.5) * 8 + (noise1(x + 9999, 18) - 0.5) * 3;
        roofY[x] = Math.max(8, Math.min(40, Math.floor(roofBaseY + noise)));
    }
    for (let x = 0; x < W; x++) {
        for (let y = 3; y < roofY[x]; y++) {
            set(x, y, B.NETHERRACK);
            setBg(x, y, B.NETHERRACK);
        }
    }

    // Сталактиты — короткие висячие «зубцы» нетеррака с нижней стороны свода.
    for (let x = 2; x < W - 2; x++) {
        if (Math.random() < 0.06) {
            const len = 1 + ((Math.random() * 3) | 0);
            for (let dy = 0; dy < len; dy++) {
                const yy = roofY[x] + dy;
                if (yy < H - 4) set(x, yy, B.NETHERRACK);
            }
        }
    }

    // Кластеры глоустоуна на потолке (увеличенные, более «майнкрафтовые»).
    for (let i = 0; i < Math.floor(W / 18); i++) {
        const cx = 2 + ((Math.random() * (W - 4)) | 0);
        const cy = roofY[cx] + 1;
        if (cy < 4 || cy >= H - 4) continue;
        // Кластер 2–4 блока в ширину/высоту.
        const sw = 1 + ((Math.random() * 3) | 0);
        const sh = 1 + ((Math.random() * 2) | 0);
        for (let dx = -sw; dx <= sw; dx++) {
            for (let dy = 0; dy < sh; dy++) {
                if (Math.random() < 0.7) {
                    const xx = cx + dx, yy = cy + dy;
                    if (xx >= 1 && xx < W - 1 && yy < H - 4) {
                        if (getT(xx, yy) === B.AIR) set(xx, yy, B.GLOWSTONE);
                    }
                }
            }
        }
    }

    // Пол — также неровный, но более выраженные холмы (как пол Незера).
    const floorBaseY = 75;
    const floorY = new Int32Array(W);
    for (let x = 0; x < W; x++) {
        const noise = (noise1(x + 4242, 80) - 0.5) * 14 +
                      (noise1(x + 1717, 22) - 0.5) * 5 +
                      (noise1(x + 8000, 6) - 0.5) * 1.5;
        floorY[x] = Math.max(roofY[x] + 12, Math.min(H - 8, Math.floor(floorBaseY + noise)));
    }
    for (let x = 0; x < W; x++) {
        for (let y = floorY[x]; y < H - 3; y++) {
            set(x, y, B.NETHERRACK);
            setBg(x, y, B.NETHERRACK);
        }
    }

    // Пещерные «карманы» — выкусываем дополнительные полости внутри толщи
    // нетеррака, чтобы получились вторичные тоннели и ниши.
    const pocketCount = Math.floor(W / 30);
    for (let i = 0; i < pocketCount; i++) {
        const cx = 4 + ((Math.random() * (W - 8)) | 0);
        const cy = roofY[cx] + 4 + ((Math.random() * Math.max(2, floorY[cx] - roofY[cx] - 6)) | 0);
        const rw = 3 + ((Math.random() * 6) | 0);
        const rh = 2 + ((Math.random() * 4) | 0);
        for (let dx = -rw; dx <= rw; dx++) {
            for (let dy = -rh; dy <= rh; dy++) {
                const xx = cx + dx, yy = cy + dy;
                if (xx < 1 || xx >= W - 1 || yy < 4 || yy >= H - 4) continue;
                const t = (dx * dx) / (rw * rw) + (dy * dy) / (rh * rh);
                if (t <= 1 && getT(xx, yy) === B.NETHERRACK) {
                    set(xx, yy, B.AIR);
                    setBg(xx, yy, B.NETHERRACK);
                }
            }
        }
    }

    // Колонны нетеррака — соединяют пол и потолок, как «pillars» в Minecraft.
    for (let i = 0; i < Math.floor(W / 80); i++) {
        const cx = 6 + ((Math.random() * (W - 12)) | 0);
        const width = 1 + ((Math.random() * 2) | 0);
        for (let dx = -width; dx <= width; dx++) {
            const xx = cx + dx;
            if (xx < 1 || xx >= W - 1) continue;
            for (let y = roofY[xx]; y < floorY[xx]; y++) {
                set(xx, y, B.NETHERRACK);
            }
        }
    }

    // Жилы кварц-руды — несколько компактных «комков», как в Minecraft.
    const oreCount = Math.floor(W * 0.06);
    for (let i = 0; i < oreCount; i++) {
        const x = 2 + ((Math.random() * (W - 4)) | 0);
        const y = roofY[x] + 2 + ((Math.random() * Math.max(2, (H - roofY[x] - 8))) | 0);
        if (getT(x, y) === B.NETHERRACK) {
            const size = 2 + ((Math.random() * 3) | 0);
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    if (Math.random() < 0.55 && getT(x + dx, y + dy) === B.NETHERRACK) {
                        set(x + dx, y + dy, B.QUARTZ_ORE);
                    }
                }
            }
        }
    }

    // Большие лавовые озёра. Карман с лавой по краям получает «корку» магма-блоков
    // и узкие пляжи соул-сэнда — как в Minecraft.
    const lakeCount = Math.max(20, Math.floor(W / 180));
    for (let i = 0; i < lakeCount; i++) {
        const cx = 20 + ((Math.random() * (W - 40)) | 0);
        const surfaceY = floorY[cx] + 1 + ((Math.random() * 3) | 0);
        if (surfaceY >= H - 6) continue;
        const halfWidth = 18 + ((Math.random() * 45) | 0);
        const depth = 4 + ((Math.random() * 5) | 0);
        for (let dx = -halfWidth; dx <= halfWidth; dx++) {
            const xx = cx + dx;
            if (xx < 1 || xx >= W - 1) continue;
            const t = 1 - (dx * dx) / (halfWidth * halfWidth);
            if (t <= 0) continue;
            const dHere = Math.max(1, Math.floor(depth * t));
            // Air над бассейном.
            for (let yy = roofY[xx] + 4; yy < surfaceY; yy++) {
                if (getT(xx, yy) !== B.BEDROCK) set(xx, yy, B.AIR);
            }
            // Лава.
            for (let dy = 0; dy < dHere && surfaceY + dy < H - 3; dy++) {
                set(xx, surfaceY + dy, B.LAVA_0);
                w.lavaSources.add(`${xx},${surfaceY + dy}`);
                w.queueLiquid(xx, surfaceY + dy);
            }
            // Магма-блоки по дну/краям лавы.
            const edge = halfWidth - Math.abs(dx);
            if (edge <= 2 && Math.random() < 0.7) {
                const yy = surfaceY + dHere;
                if (yy < H - 4 && getT(xx, yy) === B.NETHERRACK) set(xx, yy, B.MAGMA_BLOCK);
            } else if (Math.random() < 0.15) {
                const yy = surfaceY + dHere;
                if (yy < H - 4 && getT(xx, yy) === B.NETHERRACK) set(xx, yy, B.MAGMA_BLOCK);
            }
        }
        // Узкие пляжи соул-сэнда по бокам поверхности лавы.
        for (let side = -1; side <= 1; side += 2) {
            let xx = cx + side * (halfWidth + 1);
            for (let k = 0; k < 3 + ((Math.random() * 4) | 0); k++) {
                xx += side;
                if (xx < 1 || xx >= W - 1) break;
                const yy = surfaceY - 1;
                if (yy < 4 || yy >= H - 4) break;
                if (getT(xx, yy) === B.AIR && getT(xx, yy + 1) === B.NETHERRACK) {
                    set(xx, yy + 1, B.SOUL_SAND);
                }
            }
        }
    }

    // Мелкие «лужи» лавы — для разнообразия.
    for (let i = 0; i < Math.floor(W / 50); i++) {
        const cx = 4 + ((Math.random() * (W - 8)) | 0);
        const cy = floorY[cx] + 2 + ((Math.random() * 6) | 0);
        if (cy >= H - 4) continue;
        const len = 3 + ((Math.random() * 8) | 0);
        for (let dx = -len; dx <= len; dx++) {
            const xx = cx + dx;
            if (xx < 1 || xx >= W - 1) continue;
            if (getT(xx, cy) === B.NETHERRACK || getT(xx, cy) === B.AIR) {
                for (let dy = 0; dy < 2 && cy + dy < H - 3; dy++) {
                    set(xx, cy + dy, B.LAVA_0);
                    w.lavaSources.add(`${xx},${cy + dy}`);
                    w.queueLiquid(xx, cy + dy);
                }
            }
        }
    }

    // Пятна соул-сэнда на полу — небольшие «лужи», как в Minecraft Soul Sand Valley.
    for (let i = 0; i < Math.floor(W / 35); i++) {
        const cx = 4 + ((Math.random() * (W - 8)) | 0);
        const surfY = floorY[cx];
        if (surfY < 4 || surfY >= H - 4) continue;
        const r = 2 + ((Math.random() * 4) | 0);
        for (let dx = -r; dx <= r; dx++) {
            const xx = cx + dx;
            if (xx < 1 || xx >= W - 1) continue;
            const t = 1 - (dx * dx) / (r * r);
            if (t <= 0) continue;
            const yy = floorY[xx];
            if (yy < H - 4 && getT(xx, yy) === B.NETHERRACK && getT(xx, yy - 1) === B.AIR) {
                set(xx, yy, B.SOUL_SAND);
            }
        }
    }

    // Фрагменты руин нетер-крепости: 1–2 случайные «стены» из нетер-кирпича,
    // невысокие, частично разрушенные.
    for (let i = 0; i < Math.max(3, Math.floor(W / 250)); i++) {
        const baseX = 8 + ((Math.random() * (W - 16)) | 0);
        const groundY = floorY[baseX];
        if (groundY < 6 || groundY >= H - 6) continue;
        const wallW = 5 + ((Math.random() * 7) | 0);
        const wallH = 2 + ((Math.random() * 3) | 0);
        for (let dx = 0; dx < wallW; dx++) {
            const xx = baseX + dx;
            if (xx < 1 || xx >= W - 1) continue;
            for (let dy = 0; dy < wallH; dy++) {
                const yy = groundY - 1 - dy;
                if (yy < 4) continue;
                // Часть кирпичей выбиты — оставляем дыры.
                if (Math.random() < 0.85 && getT(xx, yy) === B.AIR) {
                    set(xx, yy, B.NETHER_BRICK);
                }
            }
        }
        // Колонна на одном из краёв — повыше.
        const colX = baseX + (Math.random() < 0.5 ? 0 : wallW - 1);
        for (let dy = 0; dy < wallH + 2; dy++) {
            const yy = groundY - 1 - dy;
            if (yy < 4) break;
            if (Math.random() < 0.9 && getT(colX, yy) === B.AIR) set(colX, yy, B.NETHER_BRICK);
        }
    }

    // Дополнительные кластеры глоустоуна, упавшие на пол (редкие — в основном на потолке).
    for (let i = 0; i < Math.floor(W / 150); i++) {
        const x = 3 + ((Math.random() * (W - 6)) | 0);
        const y = floorY[x] - 1;
        if (y > roofY[x] && y < H - 4 && getT(x, y) === B.AIR) {
            set(x, y, B.GLOWSTONE);
        }
    }

    // «Парящие» платформы / висячие острова нетеррака в середине пещеры.
    // В Minecraft Незере свод не пустой — между потолком и полом есть множество
    // плоских платформ и каменных «карнизов», на которых можно стоять. Делаем
    // несколько штук с разной высотой и формой: чаще плоские лепёшки 4–10
    // блоков шириной, иногда с глоустоуном/кварцевой жилой и с прилегающими
    // сталактитами вниз.
    const platformCount = Math.max(8, Math.floor(W / 28));
    for (let i = 0; i < platformCount; i++) {
        const cx = 6 + ((Math.random() * (W - 12)) | 0);
        // Высота между потолком и полом — берём середину со случайным смещением.
        const top = roofY[cx] + 3;
        const bot = floorY[cx] - 4;
        if (bot - top < 6) continue;
        const cy = top + ((Math.random() * (bot - top)) | 0);
        const halfW = 2 + ((Math.random() * 5) | 0);  // полу-ширина 2..6 → ширина 5..13
        const halfT = 1 + ((Math.random() * 2) | 0);  // толщина 1..3
        for (let dx = -halfW; dx <= halfW; dx++) {
            const xx = cx + dx;
            if (xx < 1 || xx >= W - 1) continue;
            // Эллиптический профиль — край платформы тоньше середины.
            const edgeT = Math.max(1, Math.floor(halfT * (1 - (dx * dx) / (halfW * halfW + 1))));
            for (let dy = 0; dy < edgeT; dy++) {
                const yy = cy + dy;
                if (yy < 4 || yy >= H - 4) continue;
                if (getT(xx, yy) === B.AIR) set(xx, yy, B.NETHERRACK);
            }
        }
        // 20% платформ имеют глоустоун-вкрапление на верхней грани.
        if (Math.random() < 0.2) {
            const gx = cx + ((Math.random() * 3 | 0) - 1);
            const gy = cy - 1;
            if (gx >= 1 && gx < W - 1 && gy >= 4 && gy < H - 4 && getT(gx, gy) === B.AIR) {
                set(gx, gy, B.GLOWSTONE);
            }
        }
        // 25% платформ имеют 1–2 сталактита вниз.
        if (Math.random() < 0.25) {
            const stx = cx + ((Math.random() * (2 * halfW + 1) | 0) - halfW);
            if (stx >= 1 && stx < W - 1) {
                const startY = cy + halfT;
                const len = 1 + ((Math.random() * 2) | 0);
                for (let k = 0; k < len; k++) {
                    const yy = startY + k;
                    if (yy < H - 4 && getT(stx, yy) === B.AIR) set(stx, yy, B.NETHERRACK);
                }
            }
        }
        // 10% платформ имеют жилу кварца внутри.
        if (Math.random() < 0.10) {
            const qx = cx + ((Math.random() * (2 * halfW - 1) | 0) - (halfW - 1));
            const qy = cy + ((Math.random() * halfT) | 0);
            if (qx >= 1 && qx < W - 1 && qy < H - 4 && getT(qx, qy) === B.NETHERRACK) {
                set(qx, qy, B.QUARTZ_ORE);
            }
        }
    }

    // Узкие висячие «мосты» от потолка вниз: короткие столбы нетеррака,
    // не доходящие до пола. Делают свод визуально менее плоским.
    for (let i = 0; i < Math.floor(W / 60); i++) {
        const x = 3 + ((Math.random() * (W - 6)) | 0);
        const top = roofY[x];
        const len = 3 + ((Math.random() * 6) | 0);
        for (let dy = 0; dy < len; dy++) {
            const yy = top + dy;
            if (yy < H - 4 && getT(x, yy) === B.AIR) set(x, yy, B.NETHERRACK);
        }
    }

    // Гравий в Незере: небольшие «осыпи» на полу и на крупных платформах.
    // В Minecraft гравий встречается в Незере на полу как редкое включение;
    // мы кладём его поверх нетеррака патчами по 2–5 блоков шириной.
    const gravelPatches = Math.max(6, Math.floor(W / 60));
    for (let i = 0; i < gravelPatches; i++) {
        const cx = 3 + ((Math.random() * (W - 6)) | 0);
        // Сначала ищем поверхность снизу платформы или пола под точкой.
        let surfY = -1;
        for (let y = roofY[cx]; y < H - 3; y++) {
            if (getT(cx, y) === B.NETHERRACK && getT(cx, y - 1) === B.AIR) {
                surfY = y;
                break;
            }
        }
        if (surfY < 0) continue;
        const width = 2 + ((Math.random() * 4) | 0);
        for (let dx = -width; dx <= width; dx++) {
            const xx = cx + dx;
            if (xx < 1 || xx >= W - 1) continue;
            // Шероховатые края — пропускаем некоторые блоки.
            if (Math.random() > 0.85) continue;
            // Подгоняем surfY под текущую колонку (мог сместиться на платформе).
            let sy = surfY;
            // Если в этой колонке поверхность чуть выше/ниже — корректируем.
            if (getT(xx, sy) !== B.NETHERRACK) {
                if (getT(xx, sy - 1) === B.NETHERRACK) sy = sy - 1;
                else if (getT(xx, sy + 1) === B.NETHERRACK) sy = sy + 1;
                else continue;
            }
            // 1–2 блока толщиной гравий вглубь.
            const thick = 1 + ((Math.random() * 2) | 0);
            for (let dy = 0; dy < thick; dy++) {
                const yy = sy + dy;
                if (yy >= H - 4) break;
                if (getT(xx, yy) === B.NETHERRACK) set(xx, yy, B.GRAVEL);
            }
        }
    }

    // Чуть больше гравия — встроенные «жилы» внутри сплошной породы пола.
    for (let i = 0; i < Math.floor(W / 40); i++) {
        const x = 2 + ((Math.random() * (W - 4)) | 0);
        const y = floorY[x] + 1 + ((Math.random() * Math.max(2, H - floorY[x] - 6)) | 0);
        if (y >= H - 4) continue;
        if (getT(x, y) === B.NETHERRACK) {
            const size = 2 + ((Math.random() * 2) | 0);
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    if (Math.random() < 0.6 && getT(x + dx, y + dy) === B.NETHERRACK) {
                        set(x + dx, y + dy, B.GRAVEL);
                    }
                }
            }
        }
    }

    w.lightmapDirty = true;
}

// Restore a saved tile/state snapshot onto an existing World.
function restoreSnapshot(w, snap) {
    if (!snap) return;
    w.tiles = snap.tiles;
    w.tilesBg = snap.tilesBg;
    w.tilesFg = snap.tilesFg;
    w.blockMeta = snap.blockMeta || {};
    w.furnaces = snap.furnaces || {};
    w.chests = snap.chests || {};
    w.crops = snap.crops || {};
    w.paintings = snap.paintings || [];
    w.waterSources = snap.waterSources || new Set();
    w.lavaSources = snap.lavaSources || new Set();
    w.fires = snap.fires || new Set();
    w.fireAge = snap.fireAge || {};
    w.liquidQueue = snap.liquidQueue || new Set();
    w.biomeMap = snap.biomeMap || null;
    w.tempMap  = snap.tempMap  || null;
    w.humMap   = snap.humMap   || null;
    w.bgObjects = snap.bgObjects || [];
    w.lightmapDirty = true;
}

// Beta 1.0: Sprinkle initial zombie pigmen + ghasts around the player after teleport.
// Все «свинолюди» — зомби-пиглины (нейтральные пока на них не нападут).
function spawnNetherMobs() {
    pigmen = []; ghasts = []; fireballs = [];
    const W = world.w;
    const center = Math.floor(player.x / TILE_SIZE);
    // Zombie Pigmen on the netherrack floor near player.
    for (let i = 0; i < 6; i++) {
        const dx = (Math.random() < 0.5 ? -1 : 1) * (8 + ((Math.random() * 40) | 0));
        const tx = center + dx;
        if (tx < 4 || tx >= W - 4) continue;
        // Поверхность через findNetherSafeY — корректно для неровного свода.
        const floorTY = findNetherSafeY(tx);
        if (floorTY > 4 && floorTY < world.h - 4) {
            pigmen.push(new Pigman(tx * TILE_SIZE + 4, (floorTY - 2) * TILE_SIZE));
        }
    }
    // Ghasts hover above.
    for (let i = 0; i < 2; i++) {
        const dx = (Math.random() < 0.5 ? -1 : 1) * (12 + ((Math.random() * 30) | 0));
        const tx = center + dx;
        if (tx < 4 || tx >= W - 4) continue;
        ghasts.push(new Ghast(tx * TILE_SIZE, 35 * TILE_SIZE));
    }
}

// Beta 1.0: Find the first netherrack floor below the roof at column tx.
// Сначала находим AIR (открытая пещера), потом первый солидный блок ниже —
// это и есть пол. Так корректно работает с неровным сводом/пещерами и не
// «застревает» в нетеррак-потолке.
function findNetherSafeY(tx) {
    const H = world.h;
    let inAir = false;
    for (let y = 4; y < H - 5; y++) {
        const t = world.getTile(tx, y);
        const passable = (t === B.AIR || t === B.PORTAL);
        if (!inAir) {
            if (passable) inAir = true;
            continue;
        }
        // В воздухе — ищем первый твёрдый блок (или лаву — игроку не повезло).
        if (!passable) return y;
    }
    return 75;
}

// Beta 1.0: Find the top of the overworld surface at column tx.
function findOverworldSafeY(tx) {
    for (let y = 0; y < world.h - 5; y++) {
        if (world.isSolid(tx, y)) return y;
    }
    return 200;
}

// Beta 1.0: Place (or repair) a 2×3 obsidian portal frame at column tx with
// its bottom row at floorTY. Used on arrival in both dimensions so the player
// always has a visible portal they can walk back into.
//
// The frame and PORTAL interior are placed in the BACKGROUND layer so the
// player can walk through them after teleporting — otherwise a MID-layer frame
// fully encloses the spawn point and traps the player inside.
function ensureReturnPortal(tx, floorTY) {
    // Portal interior occupies x=[tx, tx+1], y=[floorTY-3, floorTY-1] (3 tall).
    const x0 = tx, x1 = tx + 1;
    const yTop = floorTY - 3, yBot = floorTY - 1;
    // First clear a 4-wide × 5-tall pocket in the MID layer so the player has
    // room to stand and walk out without being blocked by terrain.
    for (let yy = yTop - 1; yy <= yBot + 1; yy++) {
        for (let xx = x0 - 1; xx <= x1 + 1; xx++) {
            if (yy < 0 || yy >= world.h || xx < 0 || xx >= world.w) continue;
            // Don't carve through bedrock.
            if (world.getTile(xx, yy) === B.BEDROCK) continue;
            world.setTile(xx, yy, B.AIR);
        }
    }
    // Solid MID floor pad so the player doesn't fall through when arriving.
    for (let xx = x0 - 1; xx <= x1 + 1; xx++) {
        if (xx >= 0 && xx < world.w && floorTY < world.h) {
            world.setTile(xx, floorTY, B.OBSIDIAN);
        }
    }
    // Portal frame in BG layer (visible but pass-through, so player can walk out).
    for (let xx = x0; xx <= x1; xx++) {
        world.setTile(xx, yTop - 1, B.OBSIDIAN, LAYER.BG);   // top
    }
    for (let yy = yTop; yy <= yBot; yy++) {
        world.setTile(x0 - 1, yy, B.OBSIDIAN, LAYER.BG); // left
        world.setTile(x1 + 1, yy, B.OBSIDIAN, LAYER.BG); // right
    }
    // Portal interior cells — also BG so the inPortal scan still catches them
    // and the obsidian frame visually surrounds the swirling portal.
    for (let yy = yTop; yy <= yBot; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
            world.setTile(xx, yy, B.PORTAL, LAYER.BG);
        }
    }
}

// --- SEEDED RANDOM ---
class SeededRandom {
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// --- BLOCK LAYERS ---
const LAYER = { BG: 0, MID: 1, FG: 2 };
const LAYER_NAMES = ['Background', 'Middle', 'Foreground'];

// --- RLE (Run-Length Encoding) for tile arrays ---
// Сжимает Uint8Array в плоский массив пар [id, count, id, count, ...].
// Используется чтобы три слоя тайлов (BG/MID/FG, ~30000 элементов каждый)
// уместились в квоту localStorage (~5 MB).
function rleEncode(arr) {
    if (!arr || !arr.length) return [];
    const out = [];
    let cur = arr[0], cnt = 1;
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] === cur && cnt < 65535) {
            cnt++;
        } else {
            out.push(cur, cnt);
            cur = arr[i];
            cnt = 1;
        }
    }
    out.push(cur, cnt);
    return out;
}
function rleDecode(rle, expectedLen) {
    const out = new Uint8Array(expectedLen);
    let p = 0;
    for (let i = 0; i < rle.length; i += 2) {
        const id = rle[i], cnt = rle[i + 1];
        for (let k = 0; k < cnt && p < expectedLen; k++) out[p++] = id;
    }
    return out;
}

// --- WORLD MANAGER (multi-world singleplayer) ---
// Хранит каждый мир в отдельном ключе localStorage, плюс общий индекс с метаданными.
// Это даёт возможность создавать/переименовывать/удалять миры через UI,
// и обходит лимит квоты (каждый мир ~600KB-1.5MB благодаря RLE).
const WorldManager = {
    INDEX_KEY: 'voxel_venture_worlds_index',
    WORLD_PREFIX: 'voxel_venture_world_',
    LEGACY_KEY: 'voxel_venture_save',

    list() {
        try { return JSON.parse(localStorage.getItem(this.INDEX_KEY)) || []; }
        catch (e) { return []; }
    },
    saveIndex(index) {
        try { localStorage.setItem(this.INDEX_KEY, JSON.stringify(index)); }
        catch (e) { console.warn('World index save failed', e); }
    },
    create({ name, seed, difficulty, cheats }) {
        const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const meta = {
            id,
            name: name || 'World',
            createdAt: Date.now(),
            lastPlayedAt: Date.now(),
            seed: (seed === null || seed === undefined) ? Math.floor(Math.random() * 999999) : seed,
            difficulty: difficulty || 'normal',
            cheats: !!cheats,
            day: 1,
            version: 2
        };
        const idx = this.list();
        idx.push(meta);
        this.saveIndex(idx);
        return meta;
    },
    rename(id, newName) {
        const idx = this.list();
        const w = idx.find(x => x.id === id);
        if (w) { w.name = newName; this.saveIndex(idx); }
    },
    delete(id) {
        const idx = this.list().filter(x => x.id !== id);
        this.saveIndex(idx);
        localStorage.removeItem(this.WORLD_PREFIX + id);
    },
    migrateLegacy() {
        // Старый формат: один общий сейв в LEGACY_KEY. Конвертируем в новый мир и удаляем старый ключ.
        const raw = localStorage.getItem(this.LEGACY_KEY);
        if (!raw) return;
        try {
            const oldData = JSON.parse(raw);
            const meta = this.create({
                name: 'Legacy World',
                seed: oldData.seed,
                difficulty: 'normal',
                cheats: true
            });
            // Конвертируем старый незажатый массив tiles в RLE-формат.
            const newData = Object.assign({}, oldData, {
                version: 2,
                tilesRle: oldData.tilesRle ? oldData.tilesRle : rleEncode(oldData.tiles || []),
                tilesBgRle: oldData.tilesBgRle || [],
                tilesFgRle: oldData.tilesFgRle || []
            });
            delete newData.tiles;
            try {
                localStorage.setItem(this.WORLD_PREFIX + meta.id, JSON.stringify(newData));
                localStorage.removeItem(this.LEGACY_KEY);
            } catch (e) {
                console.warn('Legacy migration: write failed (quota?)', e);
            }
        } catch (e) {
            console.warn('Legacy migration: parse failed', e);
        }
    }
};

// --- Misc helpers ---
function hashStringToSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h) % 999999;
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function formatRelativeTime(ts) {
    if (!ts) return 'never';
    const delta = Math.floor((Date.now() - ts) / 1000);
    if (delta < 60) return 'just now';
    if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
    if (delta < 86400) return Math.floor(delta / 3600) + 'h ago';
    return Math.floor(delta / 86400) + 'd ago';
}

// --- PAINTINGS ---
const PAINTING_FILES = [
    'Beach.png', 'Bookshelf Drawing.png', 'Creep Craft.png', 'Creeper Anatomy.png', 'Creeper Under Tree.png', 
    'Enderman.png', 'Forager.png', 'Ghast.png', 'Kingdom.png', 'Lambs.png', 'Map_Geographie.png', 
    'Newbies.png', 'Rose.png', 'Skeletons.png', 'Statue.png', 'Steak.png', 'Two Lambs.png', 'Village.png', 
    'Zombie Piglins.png', 'Zombies.png'
];
const PAINTINGS_CACHE = [];
PAINTING_FILES.forEach(file => {
    const img = new Image();
    img.src = 'pictures/' + file;
    // We wait for load to assign block sizes based on aspect ratio
    img.blocksW = 3;
    img.blocksH = 3;
    img.onload = () => {
        // Calculate dimensions maintaining aspect ratio, max 4 blocks (4 * 32 = 128)
        const ratio = img.width / img.height;
        if (ratio >= 1) {
            img.blocksW = 4;
            img.blocksH = Math.max(2, Math.round(4 / ratio));
        } else {
            img.blocksH = 4;
            img.blocksW = Math.max(2, Math.round(4 * ratio));
        }
    };
    PAINTINGS_CACHE.push(img);
});

// --- WORLD GENERATION ---
class World {
    constructor(seed = null) {
        this.seed = seed || Math.floor(Math.random() * 999999);
        this.rng = new SeededRandom(this.seed);
        this.w = WORLD_W;
        this.h = WORLD_H;
        this.tiles = new Uint8Array(this.w * this.h);
        this.tilesBg = new Uint8Array(this.w * this.h); // Layer system: background (no collision, dimmed 50%)
        this.tilesFg = new Uint8Array(this.w * this.h); // Layer system: foreground (no collision, brightened 30%, fades when entity inside)
        this.furnaces = {};
        this.chests = {};
        this.crops = {}; // V5: активно растущие посевы {"x,y": {timer}}
        // V12: метаданные блоков (направление/состояние): {"x,y,layer": {dir, state, ...}}
        // dir: 'up'|'down'|'left'|'right'|'bg' для факелов/рычагов/лестниц,
        // 0|1|2|3 (поворот по часовой) для ступенек/брёвен/дверей/люков.
        // state: 'open'|'closed' для дверей/люков, 'on'|'off' для рычага.
        this.blockMeta = {};
        this.paintings = []; // {x, y, w, h, imgIndex}
        // V7: жидкости
        this.waterSources = new Set(); // "x,y" — ключи источников воды
        this.lavaSources = new Set();
        this.fires = new Set(); // V8.4: "x,y" of active fires
        this.fireAge = {}; // Minecraft-like fire spread: age 0..15, decides spread/burnout
        this.liquidQueue = new Set(); // "x,y" клеток, которые ждут обновления
        this.liquidTick = 0;         // счётчик кадров для тротлинга
        this.clouds = [];
        this.bgObjects = [];
        // V14: biome map — index by column. 'plains' | 'snow' (and 'cave_area' for the reference start).
        // Decided up-front so flora generation, snow piles, and dirt→grass spread can all reference it.
        this.biomeMap = null;
        // Beta 1.1: biomes are now assigned BEFORE the terrain pass so that
        // generateStoryMap can shape oceans/deserts/beaches correctly. Climate
        // maps (temperature/humidity) are populated here too.
        this.generateBiomes();
        this.generateStoryMap();
        this.applyBiomeSurface();    // Beta 1.1: post-process — sand/sandstone/seafloor.
        this.fillOceanWater();       // Beta 1.1: заливаем океанские столбцы водой до уровня моря.
        this.generateSurfaceLakes(); // V9: озёра на поверхности с песком и гравием
        this.generateCaves();
        this.generateLiquids();   // V7: генерация источников в пещерах
        this.settleLiquids(200);  // V7: симулируем ~200 тиков чтобы растеклось ещё до старта игры
        this.generateFlora();     // V14: цветы, трава, снежный покров — все по сидy
        this.generateClouds();
        this.generateBackground();
    }

    // Minecraft-style fire spread.
    //
    // Each fire tile has an "age" 0..15. Age ticks up every scheduled tick; a
    // higher age means lower spread chance. In vanilla each fire block has its
    // OWN scheduled tick (~30 + rand(10) ticks ≈ 1.5–2 s). We mirror that by
    // giving every fire a small per-frame probability of running its tick,
    // which is much closer to vanilla than the old "process all fires together
    // once every ~10 frames" approach (that produced pulsy, runaway spread).
    //
    // The spread formula matches vanilla:
    //     catchOdds = (encouragement + 40 + difficulty*7) / (age + 30)
    //     yProbability = 100 for the column directly above (or at/below), and
    //                    100 + (dy-1)*100 for higher cells (so fire prefers
    //                    spreading into the cell directly above the source).
    //     ignite when rand.nextInt(yProbability) <= catchOdds
    //
    // Fires over a non-flammable support die quickly; fires at max age die
    // probabilistically. Water on any neighbour extinguishes immediately.
    tickFire() {
        if (!this.fires || this.fires.size === 0) return;

        // ~1 scheduled tick per fire every ~1.7 s at 60 fps (vanilla ~1.5–2 s).
        const TICK_PROB = 0.01;

        const currentFires = Array.from(this.fires);
        for (let i = 0; i < currentFires.length; i++) {
            const key = currentFires[i];
            const [xs, ys] = key.split(',');
            const tx = xs | 0, ty = ys | 0;
            const cur = this.getTile(tx, ty);

            // Stale entry — the cell was overwritten (e.g. gravity, /setblock).
            if (cur !== B.FIRE) {
                this.fires.delete(key);
                delete this.fireAge[key];
                continue;
            }

            // Adjacent water extinguishes EVERY frame (not just on scheduled
            // tick) so fire reacts instantly to a thrown water bucket.
            if (isWater(this.getTile(tx + 1, ty)) || isWater(this.getTile(tx - 1, ty)) ||
                isWater(this.getTile(tx, ty + 1)) || isWater(this.getTile(tx, ty - 1))) {
                this.setTile(tx, ty, B.AIR);
                this.fires.delete(key);
                delete this.fireAge[key];
                if (game && game.audio) game.audio.playSound('place');
                for (let k = 0; k < 5; k++) {
                    game.particles.push(new Particle(
                        tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#fff',
                        { type: 'smoke', speed: 2, life: 0.8, decay: 0.05, gravity: -0.05 }
                    ));
                }
                continue;
            }

            // Run the rest of the logic only on a scheduled tick.
            if (Math.random() > TICK_PROB) continue;

            const below = this.getTile(tx, ty + 1);
            const supported = isFireSupport(below);
            const age = this.fireAge[key] | 0;

            // Vanilla: with no flammable support and a random roll, fire just
            // dies. With age >= 15 it also has a chance to die regardless of
            // support. The 1/N chances here are per-scheduled-tick.
            if (!supported && Math.random() < 0.5) {
                this.setTile(tx, ty, B.AIR);
                this.fires.delete(key);
                delete this.fireAge[key];
                continue;
            }
            if (age >= 15 && Math.random() < 0.25) {
                this.setTile(tx, ty, B.AIR);
                this.fires.delete(key);
                delete this.fireAge[key];
                continue;
            }

            // Age up (1–3 per scheduled tick, capped at 15).
            const newAge = Math.min(15, age + 1 + ((Math.random() * 3) | 0));
            this.fireAge[key] = newAge;

            // Occasionally consume the supporting fuel block (vanilla burns
            // the block underneath after enough age).
            if (supported && newAge >= 4 && Math.random() < 0.08) {
                const fid = this.getTile(tx, ty + 1);
                if (FIRE_FLAMMABILITY[fid] !== undefined) {
                    this.setTile(tx, ty + 1, B.AIR);
                }
            }

            // Spread to neighbouring AIR cells. Cube around the fire in MC is
            // (-1..1, -1..4, -1..1); in 2D we use the (-1..1, -1..4) slab.
            const difficulty = 1; // normal — vanilla uses 0/1/2/3
            for (let dy = -1; dy <= 4; dy++) {
                // yProbability matches vanilla: lower => higher chance.
                const yProb = (dy <= 1) ? 100 : (100 + (dy - 1) * 100);
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const cx = tx + dx;
                    const cy = ty - dy; // dy > 0 means above (screen-up)
                    if (this.getTile(cx, cy) !== B.AIR) continue;

                    const enc = fireEncouragement(this, cx, cy);
                    if (enc <= 0) continue;

                    const catchOdds = Math.floor((enc + 40 + difficulty * 7) / (newAge + 30));
                    if (catchOdds <= 0) continue;
                    if (((Math.random() * yProb) | 0) > catchOdds) continue;

                    // Water on any neighbour of the candidate aborts ignition.
                    if (isWater(this.getTile(cx + 1, cy)) || isWater(this.getTile(cx - 1, cy)) ||
                        isWater(this.getTile(cx, cy + 1)) || isWater(this.getTile(cx, cy - 1))) {
                        continue;
                    }

                    this.setTile(cx, cy, B.FIRE);
                    this.fires.add(`${cx},${cy}`);
                    // New fires inherit a slightly aged value so they don't
                    // burn forever in a chain (vanilla: age + rand(5)).
                    this.fireAge[`${cx},${cy}`] = Math.min(15, newAge + ((Math.random() * 5) | 0));
                }
            }

            // Direct 4-neighbour ignition of TNT — flames touch TNT, it primes.
            const neighbors = [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]];
            for (let j = 0; j < neighbors.length; j++) {
                const [nx, ny] = neighbors[j];
                if (this.getTile(nx, ny) === B.TNT) igniteTNT(nx, ny);
            }
        }
    }

    // V14: Dirt → Grass spread (Minecraft-style). On each tick we pick a random
    // tile in the player's view; if it is DIRT with AIR above and an adjacent
    // GRASS block (within a 3×3 horizontal × 5 vertical box), it converts to
    // GRASS. Snow-biome columns are skipped (those stay dirt under snow).
    tickGrassSpread() {
        if (typeof player === 'undefined' || !player) return;
        // Throttle: only run once every 30 frames (~2 attempts/sec at 60fps).
        this._grassTick = (this._grassTick || 0) + 1;
        if (this._grassTick % 30 !== 0) return;

        // Sample 8 random candidate tiles around the player each tick.
        const pcx = Math.floor(player.x / TILE_SIZE);
        const pcy = Math.floor(player.y / TILE_SIZE);
        const radius = 40;
        for (let k = 0; k < 8; k++) {
            const x = pcx + (Math.random() * 2 * radius - radius) | 0;
            const y = pcy + (Math.random() * 2 * radius - radius) | 0;
            if (x < 1 || x >= this.w - 1 || y < 1 || y >= this.h - 2) continue;
            if (this.getTile(x, y) !== B.DIRT) continue;
            // Need open air (or pass-through plant) directly above for grass to grow.
            const above = this.getTile(x, y - 1);
            if (above !== B.AIR && !(BLOCKS[above] && BLOCKS[above].pass)) continue;
            // Snow biome columns: dirt stays dirt under the snow layer.
            // Beta 1.1: dirt also stays dirt в пустыне/пляже/океане — там либо нет травы вовсе,
            // либо сверху песок, и зелень туда не должна расползаться.
            const biomeCheck = this.getBiomeAt(x);
            if (biomeCheck === 'snow' || biomeCheck === 'desert' || biomeCheck === 'beach' || biomeCheck === 'ocean') continue;
            // Look for adjacent grass within a 3×3×5 region (3 wide, 5 tall, like MC).
            let hasGrass = false;
            for (let dy = -3; dy <= 1 && !hasGrass; dy++) {
                for (let dx = -1; dx <= 1 && !hasGrass; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (this.getTile(x + dx, y + dy) === B.GRASS) hasGrass = true;
                }
            }
            if (hasGrass) {
                this.setTile(x, y, B.GRASS);
            }
        }
    }

    // Beta 1.1: Climate-driven freezing — water exposed to sky in a cold column
    // (temperature < 0.15, как в Minecraft) постепенно превращается в лёд.
    // Раньше критерием был биом 'snow'; теперь — реальная температура колонны,
    // т.е. узкие холодные «языки» внутри plains тоже замерзают, а тёплые края
    // снежного биома — нет.
    tickFreezing() {
        if (typeof player === 'undefined' || !player) return;
        this._freezeTick = (this._freezeTick || 0) + 1;
        if (this._freezeTick % 60 !== 0) return;
        const pcx = Math.floor(player.x / TILE_SIZE);
        const pcy = Math.floor(player.y / TILE_SIZE);
        const radius = 40;
        for (let k = 0; k < 6; k++) {
            const x = pcx + (Math.random() * 2 * radius - radius) | 0;
            const y = pcy + (Math.random() * 2 * radius - radius) | 0;
            if (x < 1 || x >= this.w - 1 || y < 1 || y >= this.h - 2) continue;
            if (this.getTemperatureAt(x) >= 0.15) continue;
            const id = this.getTile(x, y);
            if (!isWater(id)) continue;
            // Only freeze if the column directly above is air/snow (no roof).
            let exposed = true;
            for (let yy = y - 1; yy >= Math.max(0, y - 8); yy--) {
                const t = this.getTile(x, yy);
                if (t === B.AIR || t === B.SNOW_LAYER) continue;
                exposed = false; break;
            }
            if (!exposed) continue;
            // Remove the water source if any and place ice.
            const key = `${x},${y}`;
            if (this.waterSources.has(key)) this.waterSources.delete(key);
            this.setTile(x, y, B.ICE);
            this.queueLiquidCross(x, y);
        }
    }

    // V5: тик роста посевов. Вызывается из главного цикла.
    // Для каждой активной посадки уменьшаем таймер; при достижении 0
    // переводим блок на следующую стадию и сбрасываем таймер.
    // WHEAT_3 из tickCrops убирается — полностью вырос.
    tickCrops() {
        // База: примерно 25 секунд на стадию (при 60 fps ~ 1500 тиков).
        // Немного рандомизируем, чтобы посевы не росли синхронно.
        const BASE_GROW = 1500;
        for (const key in this.crops) {
            const c = this.crops[key];
            c.timer--;
            if (c.timer <= 0) {
                const [xs, ys] = key.split(',');
                const x = xs | 0, y = ys | 0;
                const cur = this.getTile(x, y);
                if (cur === B.SUGARCANE) {
                    const above = this.getTile(x, y - 1);
                    if (above === B.AIR) {
                        let h = 1;
                        let cy = y + 1;
                        while (this.getTile(x, cy) === B.SUGARCANE) { h++; cy++; }
                        if (h < 3) {
                            this.setTile(x, y - 1, B.SUGARCANE);
                            delete this.crops[key];
                            this.registerCrop(x, y - 1);
                            continue;
                        }
                    }
                    delete this.crops[key];
                    continue;
                }

                // безопасность: если блок уже не пшеница (разрушили/заменили) — убираем из списка
                if (cur < B.WHEAT_0 || cur > B.WHEAT_3) {
                    delete this.crops[key];
                    continue;
                }
                if (cur === B.WHEAT_3) {
                    // Полностью вырос — снимаем с учёта.
                    delete this.crops[key];
                    continue;
                }
                this.setTile(x, y, cur + 1);
                if (cur + 1 === B.WHEAT_3) {
                    delete this.crops[key];
                } else {
                    c.timer = BASE_GROW + ((Math.random() * 600) | 0);
                }
            }
        }
    }

    // V5: при посадке / при загрузке мира ставим таймер на росток.
    registerCrop(x, y) {
        const key = `${x},${y}`;
        this.crops[key] = { timer: 1500 + ((Math.random() * 600) | 0) };
    }

    generateClouds() {
        this.clouds = [];
        // Minecraft style: 2 layers of blocky clouds.
        const layerCfg = [
            { count: 12, yMin: 5680, yMax: 5760, blockSize: 24, speed: 0.05, parallax: 0.2, scale: 0.8 },
            { count: 20, yMin: 5800, yMax: 5950, blockSize: 32, speed: 0.15, parallax: 0.4, scale: 1.0 },
        ];
        
        for (let li = 0; li < layerCfg.length; li++) {
            const L = layerCfg[li];
            for (let i = 0; i < L.count; i++) {
                const segments = [];
                // Generate a random blocky cloud shape
                const cloudWidthBlocks = 5 + Math.floor(Math.random() * 8); // 5 to 12 blocks wide
                for (let j = 0; j < cloudWidthBlocks; j++) {
                    const blockHeight = 1 + Math.floor(Math.random() * 3); // 1 to 3 blocks high
                    // Bottom aligned (all segments start at same bottom Y)
                    segments.push({
                        x: j * L.blockSize,
                        y: -blockHeight * L.blockSize,
                        w: L.blockSize,
                        h: blockHeight * L.blockSize
                    });
                }
                
                this.clouds.push({
                    layer: li,
                    parallax: L.parallax,
                    scale: L.scale,
                    x: Math.random() * this.w * TILE_SIZE,
                    // Apply user-defined cloud height offset
                    y: (L.yMin + Math.random() * (L.yMax - L.yMin)) - CLOUD_HEIGHT,
                    w: cloudWidthBlocks * L.blockSize,
                    speed: L.speed * (0.8 + Math.random() * 0.4),
                    segments,
                });
            }
        }
    }

    generateBackground() {
        this.bgObjects = [];
        this.mountainPoints = [];

        // --- НАСТРОЙКА ФОНА ---
        // Увеличили высоту гор (baseHeight) и амплитуду
        // hPoints теперь генерируют более высокие горы
        let hPoints = [];
        for (let i = 0; i <= this.w / 10; i++) {
            // Было Math.random()*60 + 40 -> Стало выше: Math.random()*100 + 150
            hPoints.push(Math.random() * 100 + 150);
        }

        for (let i = 0; i < this.w; i += 1) {
            let idx = Math.floor(i / 10);
            let t = (i % 10) / 10;
            // Интерполяция высоты
            let h = hPoints[idx] * (1 - t) + (hPoints[idx + 1] || hPoints[idx]) * t;

            // Сохраняем точки для отрисовки
            this.mountainPoints.push({ x: i, h: h });

            // --- ГЕНЕРАЦИЯ ДЕРЕВЬЕВ НА ФОНЕ ---
            // Сажаем дерево каждые ~20 блоков, если случайность позволяет
            if (i % 5 === 0 && Math.random() > 0.4) {
                // Дерево "стоит" на горе (h - высота горы от низа экрана)
                // y координата будет: Высота мира - Высота горы
                this.bgObjects.push({
                    type: 'bg_tree', // Используем новый тип для отрисовки
                    x: i * TILE_SIZE,
                    y: (WORLD_H * TILE_SIZE) - h, // Точная позиция на вершине холма
                    size: 0.5 + Math.random() * 0.5 // Вариация размера
                });
            }
        }
    }

    // Beta 1.1: Assign a biome per column based on temperature × humidity noise
    // (Minecraft-style climate map). Two low-frequency noise octaves drive a
    // 0..1 temperature value and a 0..1 humidity value per column; we then look
    // up the biome that matches that climate cell:
    //   cold + any humidity  → snow
    //   hot  + dry           → desert
    //   any  + very dry/low  → ocean (low noise band)
    //   else                 → plains
    // Beaches are *added* afterwards as a 3-block transition strip wherever a
    // land biome touches an ocean biome.
    // The original start cave area (lx 0..95) stays 'plains' so spawn behaves
    // correctly, and a small protected strip on either side keeps the spawn
    // area free of oceans/deserts no matter what the noise says.
    generateBiomes() {
        const OX = WORLD_OFFSET_X;
        this.biomeMap = new Array(this.w);
        this.tempMap  = new Float32Array(this.w);
        this.humMap   = new Float32Array(this.w);
        // Continentalness noise — drives where oceans sit (low values = ocean).
        // Slow + tiny noise dimensions give Minecraft-like ~200-400 block strips.
        for (let x = 0; x < this.w; x++) {
            const lx = x - OX;
            // Temperature: 0 = cold (snow), 1 = scorching (desert). Use big octave so
            // climates change gradually across hundreds of blocks.
            const tBig   = this._noiseOctave(x, 320, 7001);
            const tSmall = this._noiseOctave(x, 80,  7002);
            const temperature = tBig * 0.75 + tSmall * 0.25;
            // Humidity: 0 = arid (desert!), 1 = wet (forests/oceans).
            const hBig   = this._noiseOctave(x, 280, 7011);
            const hSmall = this._noiseOctave(x, 70,  7012);
            const humidity = hBig * 0.75 + hSmall * 0.25;
            this.tempMap[x] = temperature;
            this.humMap[x]  = humidity;

            // Spawn area is always plains.
            if (lx >= -40 && lx <= 130) { this.biomeMap[x] = 'plains'; continue; }

            // Continentalness — separate channel for ocean placement.
            const cont = this._noiseOctave(x, 480, 7021) * 0.7
                       + this._noiseOctave(x, 120, 7022) * 0.3;

            // 1) Oceans first — low continentalness wins regardless of climate.
            if (cont < 0.32) { this.biomeMap[x] = 'ocean'; continue; }

            // 2) Climate-driven land biomes:
            if (temperature < 0.32)              { this.biomeMap[x] = 'snow';   continue; }
            if (temperature > 0.72 && humidity < 0.35) { this.biomeMap[x] = 'desert'; continue; }
            this.biomeMap[x] = 'plains';
        }

        // Smooth single-column flickers (size-1 islands merge with neighbours).
        for (let pass = 0; pass < 2; pass++) {
            for (let x = 1; x < this.w - 1; x++) {
                if (this.biomeMap[x] !== this.biomeMap[x - 1] &&
                    this.biomeMap[x] !== this.biomeMap[x + 1]) {
                    this.biomeMap[x] = this.biomeMap[x - 1];
                }
            }
        }

        // Beta 1.1: Stamp beaches — a 3-block buffer of 'beach' wherever land
        // borders an ocean. Pure Minecraft behavior: never put beaches against
        // snow/desert biomes (those keep their own shoreline).
        const BEACH_W = 3;
        const isLandWarm = (b) => b === 'plains'; // beaches only border plains
        const before = this.biomeMap.slice();
        for (let x = 1; x < this.w - 1; x++) {
            if (before[x] !== 'ocean') continue;
            for (let d = 1; d <= BEACH_W; d++) {
                const xl = x - d, xr = x + d;
                if (xl >= 0 && isLandWarm(before[xl])) this.biomeMap[xl] = 'beach';
                if (xr <  this.w && isLandWarm(before[xr])) this.biomeMap[xr] = 'beach';
            }
        }
    }

    // Beta 1.1: biome at world column x (defaults to 'plains' before generation).
    getBiomeAt(x) {
        return (this.biomeMap && this.biomeMap[x]) ? this.biomeMap[x] : 'plains';
    }
    // Beta 1.1: climate sampling — used by freeze/rain logic and debug overlays.
    getTemperatureAt(x) {
        if (this.tempMap && x >= 0 && x < this.w) return this.tempMap[x];
        return getBiomeClimate(this.getBiomeAt(x)).temperature;
    }
    getHumidityAt(x) {
        if (this.humMap && x >= 0 && x < this.w) return this.humMap[x];
        return getBiomeClimate(this.getBiomeAt(x)).humidity;
    }

    // Beta 1.1: After the base terrain has been laid down, convert topsoil
    // depending on biome:
    //   • desert — top 4-5 blocks become SAND, then SANDSTONE just below as a
    //     supporting layer (mimics Minecraft).
    //   • beach  — top ~3 blocks become SAND, with SANDSTONE below.
    //   • ocean  — top of the seafloor is SAND on top of GRAVEL/DIRT mix.
    // Plains/snow keep the grass+dirt produced by generateStoryMap.
    // The reference cave area (lx 0..27) is left alone — its stone is hand-set.
    applyBiomeSurface() {
        const OX = WORLD_OFFSET_X;
        const SEA_LEVEL = 40 + WORLD_OFFSET_Y;
        for (let x = 0; x < this.w; x++) {
            const lx = x - OX;
            if (lx >= 0 && lx <= 27) continue; // protected cave area
            const biome = this.getBiomeAt(x);
            if (biome === 'plains' || biome === 'snow' || biome === 'cave_area') continue;

            // Find top non-air tile (surface).
            let gy = -1;
            for (let y = 0; y < this.h - 2; y++) {
                const t = this.tiles[y * this.w + x];
                if (t !== B.AIR) { gy = y; break; }
            }
            if (gy < 0) continue;

            if (biome === 'desert') {
                // 4 blocks of sand + 2 blocks of sandstone below.
                for (let d = 0; d < 4; d++) {
                    const y = gy + d;
                    if (y >= this.h - 2) break;
                    const t = this.tiles[y * this.w + x];
                    if (t === B.GRASS || t === B.DIRT) this.tiles[y * this.w + x] = B.SAND;
                }
                for (let d = 4; d < 6; d++) {
                    const y = gy + d;
                    if (y >= this.h - 2) break;
                    const t = this.tiles[y * this.w + x];
                    if (t === B.DIRT || t === B.STONE) this.tiles[y * this.w + x] = B.SANDSTONE;
                }
            } else if (biome === 'beach') {
                // 3 blocks of sand + 1 block of sandstone below.
                for (let d = 0; d < 3; d++) {
                    const y = gy + d;
                    if (y >= this.h - 2) break;
                    const t = this.tiles[y * this.w + x];
                    if (t === B.GRASS || t === B.DIRT) this.tiles[y * this.w + x] = B.SAND;
                }
                const ssY = gy + 3;
                if (ssY < this.h - 2) {
                    const t = this.tiles[ssY * this.w + x];
                    if (t === B.DIRT || t === B.STONE) this.tiles[ssY * this.w + x] = B.SANDSTONE;
                }
            } else if (biome === 'ocean') {
                // Seafloor: top tile sand, next tile sand or gravel pocket;
                // ВСЁ остальное (бывший DIRT) превращаем в STONE, чтобы дно
                // было плотным — иначе пещеры под океаном вскрывают рыхлый грунт
                // и вода затапливает их.
                // Top sand layer.
                const t0 = this.tiles[gy * this.w + x];
                if (t0 === B.GRASS || t0 === B.DIRT) this.tiles[gy * this.w + x] = B.SAND;
                // 2nd row: sand or gravel for visual variety.
                const y1 = gy + 1;
                if (y1 < this.h - 2) {
                    const t1 = this.tiles[y1 * this.w + x];
                    if (t1 === B.DIRT) {
                        this.tiles[y1 * this.w + x] = (((x * 31 + this.seed) & 3) === 0) ? B.GRAVEL : B.SAND;
                    }
                }
                // Everything below the top 2 rows: convert any remaining DIRT/GRASS to STONE.
                for (let y = gy + 2; y < this.h - 2; y++) {
                    const t = this.tiles[y * this.w + x];
                    if (t === B.DIRT || t === B.GRASS) this.tiles[y * this.w + x] = B.STONE;
                    else if (t === B.AIR) break; // hit a void (shouldn't happen for ocean column)
                }
            }
        }
    }

    // Beta 1.1: Fill every air cell above the seafloor (up to sea level) in
    // ocean biomes with water source blocks. Adjacent non-ocean columns get a
    // 1-block ledge of water too so the shoreline visually merges with beaches.
    fillOceanWater() {
        const OX = WORLD_OFFSET_X;
        const SEA_LEVEL = 40 + WORLD_OFFSET_Y; // y where water surface should sit
        for (let x = 0; x < this.w; x++) {
            const lx = x - OX;
            if (lx >= 0 && lx <= 27) continue; // protected cave area
            if (this.getBiomeAt(x) !== 'ocean') continue;
            // Walk down from sea level until we hit the seafloor; replace AIR
            // with water source blocks.
            for (let y = SEA_LEVEL; y < this.h - 2; y++) {
                const id = this.tiles[y * this.w + x];
                if (id === B.AIR) {
                    this.tiles[y * this.w + x] = B.WATER_0;
                    this.waterSources.add(`${x},${y}`);
                } else if (!isWater(id)) {
                    break; // hit the seafloor
                }
            }
        }
    }

    // V14: Procedural flora — flowers, grass, and snow-biome features.
    // Runs after the surface terrain and lakes are settled. Uses the world seed
    // so each world is deterministic.
    generateFlora() {
        const OX = WORLD_OFFSET_X;
        // Single-block flower palette (vanilla overworld).
        const FLOWERS = [
            B.POPPY, B.DANDELION, B.BLUE_ORCHID, B.ALLIUM, B.AZURE_BLUET,
            B.RED_TULIP, B.ORANGE_TULIP, B.WHITE_TULIP, B.PINK_TULIP,
            B.OXEYE_DAISY, B.CORNFLOWER, B.LILY_OF_THE_VALLEY,
        ];
        const TALL_PLANTS = [
            { bot: B.SUNFLOWER_BOTTOM, top: B.SUNFLOWER_TOP },
            { bot: B.LILAC_BOTTOM,     top: B.LILAC_TOP     },
            { bot: B.ROSE_BUSH_BOTTOM, top: B.ROSE_BUSH_TOP },
            { bot: B.PEONY_BOTTOM,     top: B.PEONY_TOP     },
        ];
        // PRNG seeded from the world seed (separate from this.rng so we don't
        // disturb other generators).
        const rng = new SeededRandom(this.seed ^ 0xF10E5);

        // Find top-most grass column for every x so we don't have to scan twice.
        const findGroundY = (x) => {
            for (let y = Math.max(0, WORLD_OFFSET_Y - 30); y < this.h - 5; y++) {
                const t = this.getTile(x, y);
                if (t !== B.AIR) return y;
            }
            return -1;
        };

        for (let x = 5; x < this.w - 5; x++) {
            const lx = x - OX;
            // Don't touch the reference cave area (lx 0..27 is the cave & stone pillar).
            if (lx >= 0 && lx <= 27) continue;

            const gy = findGroundY(x);
            if (gy < 0) continue;
            const surface = this.getTile(x, gy);
            const above = this.getTile(x, gy - 1);
            const above2 = this.getTile(x, gy - 2);
            // Only plant where there's free space above the ground tile.
            if (above !== B.AIR) continue;

            const biome = this.getBiomeAt(x);

            if (biome === 'snow') {
                // Snow biome: convert top-most dirt/grass to snowy surface + add a snow layer above.
                if (surface === B.GRASS || surface === B.DIRT) {
                    // Keep dirt/grass underneath; just blanket the top with a snow layer.
                    this.setTile(x, gy - 1, B.SNOW_LAYER);
                }
                // Snow biomes get only sparse grass and a touch of cornflowers/azure bluets.
                const r = rng.next();
                if (r < 0.03 && above2 === B.AIR && surface !== B.SAND) {
                    // tall grass under the snow layer? Snow biome is mostly bare —
                    // skip tall grass entirely to keep the snowfield clean.
                }
                continue;
            }

            // Beta 1.1: ocean — never plant anything on the seafloor.
            if (biome === 'ocean') continue;

            // Beta 1.1: desert — only cacti and dead bushes, on sand.
            if (biome === 'desert') {
                if (surface !== B.SAND) continue;
                const r = rng.next();
                if (r < 0.012) {
                    // Cactus: 1..3 blocks tall, but only if the side-blocks at every
                    // tier are empty (vanilla cactus rule).
                    const h = 1 + ((rng.next() * 3) | 0); // 1..3
                    let okSides = true;
                    for (let k = 0; k < h; k++) {
                        const cy = gy - 1 - k;
                        if (cy < 0) { okSides = false; break; }
                        if (this.getTile(x - 1, cy) !== B.AIR) { okSides = false; break; }
                        if (this.getTile(x + 1, cy) !== B.AIR) { okSides = false; break; }
                        if (this.getTile(x, cy) !== B.AIR) { okSides = false; break; }
                    }
                    if (okSides) {
                        for (let k = 0; k < h; k++) this.setTile(x, gy - 1 - k, B.CACTUS);
                    }
                } else if (r < 0.04) {
                    this.setTile(x, gy - 1, B.DEAD_BUSH);
                }
                continue;
            }

            // Beta 1.1: beach — keep the strip clean (no plants on sand).
            if (biome === 'beach') continue;

            // Plains-biome flora — only on grass / dirt blocks.
            if (surface !== B.GRASS && surface !== B.DIRT) continue;

            // Density: reduced surface grass/flowers to match Minecraft closer.
            if (rng.next() >= 0.05) continue;

            // Of those columns, pick the kind:
            //   ~65% short or tall grass (mostly short)
            //   ~25% single flower
            //   ~ 5% tall flower (sunflower / lilac / rose bush / peony)
            //   ~ 5% nothing — keeps occasional bare patches inside flora bands
            const kind = rng.next();
            if (kind < 0.65) {
                if (rng.next() < 0.20 && above2 === B.AIR && gy - 2 >= 0) {
                    this.setTile(x, gy - 1, B.TALL_GRASS_BOTTOM);
                    this.setTile(x, gy - 2, B.TALL_GRASS_TOP);
                } else {
                    this.setTile(x, gy - 1, B.SHORT_GRASS);
                }
            } else if (kind < 0.90) {
                const fid = FLOWERS[(rng.next() * FLOWERS.length) | 0];
                this.setTile(x, gy - 1, fid);
            } else if (kind < 0.95 && above2 === B.AIR && gy - 2 >= 0) {
                const tp = TALL_PLANTS[(rng.next() * TALL_PLANTS.length) | 0];
                this.setTile(x, gy - 1, tp.bot);
                this.setTile(x, gy - 2, tp.top);
            }
            // remaining ~5%: empty — gives the eye some breathing room.
        }

        // --- Snow biome: freeze surface water + ice the lakes ---
        for (let x = 0; x < this.w; x++) {
            if (this.getBiomeAt(x) !== 'snow') continue;
            // Walk a small vertical window around the surface; freeze top water sources.
            for (let y = Math.max(0, WORLD_OFFSET_Y - 30); y < this.h - 5; y++) {
                const id = this.getTile(x, y);
                if (id === B.AIR) continue;
                if (isWater(id)) {
                    const above = this.getTile(x, y - 1);
                    if (above === B.AIR || above === B.SNOW_LAYER) {
                        // Surface water freezes to ice.
                        const key = `${x},${y}`;
                        if (this.waterSources.has(key)) this.waterSources.delete(key);
                        this.setTile(x, y, B.ICE);
                    }
                }
                // Stop after we've processed a chunk past the surface.
                if (id !== B.AIR && id !== B.SNOW_LAYER && y > WORLD_OFFSET_Y + 50) break;
            }
        }
    }

    generateStoryMap() {
        // =======================================================
        // CREEP CRAFT: REBORN — Location from original reference
        // Image: 4988×516 px, block ≈ 52×45 px → 96 blocks wide
        // ВСЕ старые «локальные» координаты (0..95 по X, ~40 по Y)
        // сдвинуты на WORLD_OFFSET_X / WORLD_OFFSET_Y, чтобы стартовая
        // пещера оказалась в центре расширенного мира.
        // =======================================================

        const OX = WORLD_OFFSET_X;          // 10000
        const OY = WORLD_OFFSET_Y;          // 156
        const SURFACE_Y = 40 + OY;          // 196 — базовая высота поверхности

        // --- HEIGHTMAP (surface grass Y for each column) ---
        // Mountain area (lx:0-17): no grass, solid stone
        // Flat terrain (lx:20-79): grass at SURFACE_Y
        // Hill right (lx:80-95): grass rises from SURFACE_Y up by 5
        // Вне «оригинальной» зоны 0..95 — мягкая синусоида и в плюс, и в минус.
        let heights = [];
        for (let x = 0; x < this.w; x++) {
            const lx = x - OX; // локальная координата относительно стартовой пещеры
            if (lx >= 0 && lx <= 19) {
                heights[x] = SURFACE_Y; // mountain area, will be overwritten
            } else if (lx >= 36 && lx <= 57) {
                heights[x] = SURFACE_Y - 1;
            } else if (lx >= 80 && lx <= 95) {
                let rise = 0;
                if (lx >= 82 && lx < 84) rise = 2;
                else if (lx >= 84 && lx < 86) rise = 3;
                else if (lx >= 86 && lx < 90) rise = 4;
                else if (lx >= 90 && lx <= 95) rise = 5;
                heights[x] = SURFACE_Y - rise;
            } else if (lx >= 0 && lx <= 95) {
                heights[x] = SURFACE_Y;
            } else {
                // V12: «майнкрафтоподобный» рельеф на основе value-noise с октавами.
                // Семплируем хэшированную случайную высоту по якорным точкам и
                // плавно интерполируем (smoothstep) — получается «блочный» но
                // природный профиль с равнинами, холмами и редкими горами.
                let h = this._mcSurfaceHeight(x);
                // Beta 1.1: biome-driven height bias.
                //   ocean  — drops 6..14 blocks below sea level (basin),
                //   beach  — flat just above sea level (no spikes),
                //   desert — gentle dunes, suppressed mountains.
                const biome = this.getBiomeAt(x);
                if (biome === 'ocean') {
                    // Push the seafloor well below the surface; depth bowl uses
                    // distance from the nearest non-ocean column for a smooth basin.
                    const depthN = this._noiseOctave(x, 96, 7301);
                    h = -(6 + depthN * 8);   // surface = SURFACE_Y - (negative) = below water level
                } else if (biome === 'beach') {
                    // Beaches sit ~1 block above sea level (sea level = SURFACE_Y).
                    h = Math.min(h, 1);
                    h = Math.max(h, 0);
                } else if (biome === 'desert') {
                    // Smooth dunes only, no harsh mountain spikes.
                    const dune = this._noiseOctave(x, 28, 7401);
                    h = (dune - 0.5) * 6;
                }
                heights[x] = SURFACE_Y - Math.floor(h);
            }
        }

        // --- STEP 1: Fill base terrain (grass/dirt/stone/ores) ---
        // Beta 1.2: dirt depth varies per column via _dirtDepthAt() so the
        // dirt→stone boundary isn't a dead-flat 3-block band like before.
        for (let x = 0; x < this.w; x++) {
            let baseH = heights[x];
            const dirtDepth = this._dirtDepthAt(x); // 3..6 blocks
            for (let y = 0; y < this.h; y++) {
                let idx = y * this.w + x;
                if (y >= this.h - 2) this.tiles[idx] = B.BEDROCK;
                else if (y > baseH + dirtDepth) {
                    this.tiles[idx] = B.STONE;
                    // Ore veins: rarer-first, depth-gated. Slightly denser than
                    // before so caves still feel rewarding without spamming.
                    let r = Math.random();
                    let oreType = null;
                    const depth = y - baseH; // depth from surface
                    if (depth > 30 && r > 0.997) oreType = B.DIAMOND_ORE;
                    else if (depth > 20 && r > 0.994) oreType = B.GOLD_ORE;
                    else if (depth > 10 && r > 0.988) oreType = B.IRON_ORE;
                    else if (depth > 4  && r > 0.978) oreType = B.COAL_ORE;
                    if (oreType) {
                        this.tiles[idx] = oreType;
                        this._placeOreVein(x, y, oreType, 3 + Math.floor(Math.random() * 5));
                    }
                } else if (y > baseH) this.tiles[idx] = B.DIRT;
                else if (y === baseH) this.tiles[idx] = B.GRASS;
                else this.tiles[idx] = B.AIR;
            }
        }

        // Beta 1.2: Minecraft-style dirt/gravel patches embedded in upper stone.
        // MC scatters small "disks" of dirt and gravel through the upper layers
        // to break up the monotonous stone band right below the topsoil. We
        // place a handful per 100 columns at random shallow positions; each is
        // a flat 3-5 wide × 2-3 tall ellipse that only overwrites STONE.
        this._scatterMineralPatches(heights);

        // --- STEP 2: Stone mountain (local x:0-17) ---
        // Stepped profile: top of stone per column (going higher left→right→left)
        const mountainTop = [
            26, 26, 27, 27, 28, 28, 29, 29, 30, 30, // lx:0-9
            31, 31, 31, 31, 31, 32, 33, 34            // lx:10-17
        ];
        for (let lx = 0; lx < mountainTop.length; lx++) {
            const x = lx + OX;
            for (let y = mountainTop[lx] + OY; y <= 45 + OY; y++) {
                if (y < this.h - 2) this.setTile(x, y, B.STONE);
            }
        }
        // Left wall extension (lx=0-4 solid from peak to deep underground)
        for (let lx = 0; lx <= 4; lx++) {
            const x = lx + OX;
            for (let y = mountainTop[lx] + OY; y < this.h - 2; y++) {
                if (this.getTile(x, y) !== B.BEDROCK) {
                    this.setTile(x, y, B.STONE);
                }
            }
        }

        // --- STEP 3: Cave ---
        // Layout (left→right): 1free + 2chest + 2free + 1pit + 1bench + 6tunnel
        // Cave air: 4 blocks, ceiling: 5 blocks stone
        // Cave floor (items sit here): SURFACE_Y
        const caveFloor = SURFACE_Y;        // = 40 + OY
        const caveAirTop = SURFACE_Y - 4;    // topmost air row (= 36 + OY)
        const ceilingTop = SURFACE_Y - 9;    // topmost ceiling row (= 31 + OY)
        const caveLeft = 5 + OX;          // first interior column
        const caveRight = 17 + OX;          // last interior column (exit)

        // Ensure solid stone around the cave (walls, ceiling, floor)
        // NOTE: stop at caveRight, NOT caveRight+1, so x=18 stays as normal terrain
        // Start at ceilingTop (not -1) to get exactly 5 blocks of ceiling
        for (let x = caveLeft - 1; x <= caveRight; x++) {
            for (let y = ceilingTop; y <= caveFloor + 3; y++) {
                if (y >= 0 && y < this.h - 2) {
                    this.setTile(x, y, B.STONE);
                }
            }
        }

        // Carve cave air (4 blocks: y=36,37,38,39)
        for (let x = caveLeft; x <= caveRight; x++) {
            for (let y = caveAirTop; y < caveFloor; y++) {
                this.setTile(x, y, B.AIR);
            }
        }

        // Ensure ceiling stone (5 blocks: y=31,32,33,34,35)
        for (let x = caveLeft; x <= caveRight; x++) {
            for (let y = ceilingTop; y < caveAirTop; y++) {
                this.setTile(x, y, B.STONE);
            }
        }

        // --- STEP 4: Cave items ---
        // lx=5: free walking space (floor stays solid)
        // lx=6,7: double chest
        this.setTile(6 + OX, caveFloor - 1, B.CHEST);
        this.setTile(7 + OX, caveFloor - 1, B.CHEST);
        // lx=8,9: free
        // lx=10: pit — carve all the way down
        for (let y = caveFloor; y < this.h - 2; y++) {
            this.setTile(10 + OX, y, B.AIR);
        }
        // lx=11: workbench
        this.setTile(11 + OX, caveFloor - 1, B.WORKBENCH);
        // lx=12-17: tunnel (already carved as air)

        // --- STEP 5: Stone floor extends 10 blocks past cave exit ---
        // lx=18..27: stone floor continues
        for (let lx = 18; lx <= 27; lx++) {
            const x = lx + OX;
            // Clear air above
            for (let y = 0; y < caveFloor; y++) {
                this.setTile(x, y, B.AIR);
            }
            // Stone floor: 1 block at surface + 3 blocks below (replacing dirt)
            this.setTile(x, caveFloor, B.STONE);
            this.setTile(x, caveFloor + 1, B.STONE);
            this.setTile(x, caveFloor + 2, B.STONE);
            this.setTile(x, caveFloor + 3, B.STONE);
        }

        // --- STEP 5b: Stone pillar at cave exit ---
        // 1 block wide, 2 blocks tall, at lx=18
        this.setTile(18 + OX, caveFloor - 1, B.STONE);
        this.setTile(18 + OX, caveFloor - 2, B.STONE);

        // lx=28+: grass terrain resumes
        for (let lx = 28; lx <= 29; lx++) {
            const x = lx + OX;
            this.setTile(x, heights[x], B.GRASS);
        }

        // --- STEP 6: (V7 удалено) Зелёные плавающие платформы ---
        // Ранее здесь генерировались "парящие" полосы травы на y=37 в нескольких местах.
        // По запросу разработчика они убраны, т.к. выглядели как баг — висящие в воздухе блоки дёрна.
        // Если позже понадобятся плавучие острова — лучше делать их полноценными: грунт под травой, деревья, склон.

        // --- STEP 7: Spawn point ---
        // Старая позиция: (452, 1224) — 14-й блок по X, ~38-й по Y. Сдвигаем
        // на новые офсеты, чтобы спавн оказался в стартовой пещере по центру мира.
        this.spawnX = (14 + OX) * TILE_SIZE;
        this.spawnY = (38 + OY) * TILE_SIZE + 8;

        // --- STEP 8: Trees ---
        // Beta 1.2: tree placement uses a per-column density derived from a
        // low-frequency noise so forests have dense clusters and clearings,
        // instead of a fixed-grid pattern. Minimum spacing prevents leaf
        // crowns from overlapping into a wall of green.
        // В оригинальной зоне (lx=0..95) деревьев не сажаем — там пещера и
        // референсный пейзаж. Снаружи — равномерно по обе стороны.
        let lastTreeX = -10;
        for (let x = 2; x < this.w - 10; x++) {
            const lx = x - OX;
            if (lx >= 0 && lx <= 95) continue;          // skip reference image area
            // Beta 1.1: no trees in desert/ocean/beach (only forests/plains/snow get trees).
            const biome = this.getBiomeAt(x);
            if (biome === 'desert' || biome === 'ocean' || biome === 'beach') continue;
            // Minimum 2-block gap so canopies don't fully merge.
            if (x - lastTreeX < 2) continue;

            // Forest density: low-frequency noise gives wide forest patches
            // (~64 blocks across) with sparse meadow strips between.
            const density = this._noiseOctave(x, 64, 9101);
            // Sparser overall in snow (taiga-style), denser in plains forest
            // pockets. ~10% chance per column at the densest, ~1% at sparsest.
            const baseChance = biome === 'snow' ? 0.04 : 0.10;
            const treeChance = baseChance * density * density;
            if (Math.random() > treeChance) continue;

            let y = 0;
            while (y < this.h && this.getTile(x, y) === B.AIR) y++;
            if (this.getTile(x, y) !== B.GRASS) continue;

            const treeLayer = Math.random() < 0.5 ? LAYER.FG : LAYER.BG;
            this.growTree(x, y, treeLayer);
            lastTreeX = x;
        }
    }

    fillChest(x, y, items) {
        const key = `${x},${y}`;
        this.chests[key] = new Array(27).fill(null);
        items.forEach((it, i) => {
            if (i < 27) {
                let dur = MAX_DUR[it.id] || null;
                this.chests[key][i] = { id: it.id, count: it.count, dur: dur };
            }
        });
    }

    generateCaves() {
        // ===========================================================
        //  Beta 1.2: Minecraft-style cave generation.
        //
        //  Four systems run in sequence:
        //   1) Long winding tunnels (cave worms) with inertia → MC corridors.
        //   2) Bumpy caverns / rooms — overlapping spheres make irregular voids.
        //   3) Vertical ravines / shafts → connect upper and lower layers.
        //   4) Cheese pockets — tiny isolated air bubbles peppered through the
        //      deep stone for that "swiss cheese" look from MC 1.18+.
        //  Finally we expose ore veins along cave walls and convert any
        //  orphaned sand/gravel that got exposed by carving back to stone
        //  (otherwise lake bottoms next to a tunnel produce ugly yellow
        //  patches in the cave walls).
        // ===========================================================
        const SAFE_Y = 45 + WORLD_OFFSET_Y;   // = 201 — глобальный верхний предел
        const BEDROCK_Y = this.h - 2;            // = 254 — слой бедрока

        // Шансы появления руд (0.0 = никогда, 1.0 = всегда).
        // Чем ВЫШЕ порог, тем РЕЖЕ руда (см. условие r > порог).
        const CHANCE = {
            COAL: 0.96,  // 4%
            IRON: 0.97,  // 3%
            GOLD: 0.98,  // 2%
            DIAMOND: 0.99   // 1%
        };

        // Beta 1.1: Для каждой колонки считаем минимальную глубину, на которой
        // разрешено копать. Под океанами оставляем ≥5-блочную «крышу» из камня
        // под морским дном — иначе пещеры пробивают дно и весь океан стекает в
        // подземелья. Под сушей действует общий SAFE_Y.
        const OCEAN_FLOOR_BUFFER = 5;
        const minCarveY = new Int16Array(this.w);
        for (let x = 0; x < this.w; x++) {
            if (this.getBiomeAt(x) === 'ocean') {
                // Найти y морского дна (первый не-вода, не-воздух блок сверху).
                let floorY = -1;
                for (let y = 0; y < this.h - 2; y++) {
                    const t = this.tiles[y * this.w + x];
                    if (t === B.AIR || isWater(t)) continue;
                    floorY = y; break;
                }
                if (floorY < 0) floorY = SAFE_Y;
                minCarveY[x] = Math.max(SAFE_Y, floorY + OCEAN_FLOOR_BUFFER);
            } else {
                minCarveY[x] = SAFE_Y;
            }
        }

        // Безопасный диапазон тайла, в котором разрешено копать.
        const inWorld = (x, y) =>
            x >= 1 && x < this.w - 1 && y >= minCarveY[x] && y < BEDROCK_Y;

        // Эллиптический «бур» — вырезает воздух в (cx,cy) с радиусами rx/ry.
        // Туннели делаем приплюснутыми по высоте (ry < rx), как в Minecraft —
        // чтобы пещеры были «вытянутыми» горизонтально, а не идеальные сферы.
        // Beta 1.1: не вырезаем тайлы с водой и не вскрываем камень, у которого
        // прямо над ним вода (иначе пещера сразу превратится в подводный сток).
        const carve = (cx, cy, rx, ry) => {
            const rx2 = rx * rx, ry2 = ry * ry;
            const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
            const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
            for (let y = y0; y <= y1; y++) {
                const dy = y - cy;
                for (let x = x0; x <= x1; x++) {
                    const dx = x - cx;
                    if ((dx * dx) / rx2 + (dy * dy) / ry2 > 1) continue;
                    if (!inWorld(x, y)) continue;
                    const cur = this.getTile(x, y);
                    if (cur === B.BEDROCK) continue;
                    if (isWater(cur)) continue; // do not eat water tiles
                    // If the tile directly above is water, leave this tile in place
                    // (otherwise we'd punch a hole and the water would pour in).
                    if (isWater(this.getTile(x, y - 1))) continue;
                    this.setTile(x, y, B.AIR);
                }
            }
        };

        // ---- 1) ДЛИННЫЕ ИЗВИВАЮЩИЕСЯ ТУННЕЛИ ----
        // Beta 1.2: больше «червей» с большей инерцией — реже резкие повороты,
        // лучше характерный MC-look. Радиус «дышит» так, чтобы внутри туннеля
        // встречались как узкие проходы, так и комнаты-расширения.
        const TUNNEL_COUNT = Math.max(160, Math.floor(this.w / 60));
        for (let i = 0; i < TUNNEL_COUNT; i++) {
            let x = Math.random() * this.w;
            let y = SAFE_Y + Math.random() * (BEDROCK_Y - SAFE_Y - 4);
            // Smoother yaw with stronger inertia → fewer ugly 90° kinks.
            let yaw = Math.random() * Math.PI * 2;
            let yawVel = (Math.random() - 0.5) * 0.05;
            let pitch = (Math.random() - 0.5) * 0.3;

            const length = 220 + (Math.random() * 360 | 0); // 220..580 шагов
            const baseR = 1.3 + Math.random() * 1.8;       // 1.3..3.1

            for (let s = 0; s < length; s++) {
                // Сглаженное изменение направления через "ускорение", а не
                // прямой рандом на каждом шаге — туннели плавно изгибаются.
                yawVel += (Math.random() - 0.5) * 0.06;
                yawVel = Math.max(-0.18, Math.min(0.18, yawVel));
                yaw += yawVel;
                pitch += (Math.random() - 0.5) * 0.08;
                pitch = Math.max(-0.45, Math.min(0.45, pitch));

                // Радиус «дышит» — две гармоники для нерегулярности.
                const rMul = 1
                    + 0.4 * Math.sin(s * 0.05 + i * 0.7)
                    + 0.2 * Math.sin(s * 0.12 + i * 1.3);
                const rx = baseR * rMul;
                const ry = Math.max(1, rx * 0.6);

                x += Math.cos(yaw);
                y += Math.sin(yaw) * 0.5 + pitch;

                if (x < 2 || x >= this.w - 2) break;
                if (y < SAFE_Y) { y = SAFE_Y + 1; pitch = Math.abs(pitch); }
                if (y >= BEDROCK_Y - 1) break;

                carve(x, y, rx, ry);

                // ~2%: туннель внезапно расширяется в карман — мини-каверна.
                if (Math.random() < 0.02) {
                    const roomR = 3 + Math.random() * 3;
                    const blobs = 2 + (Math.random() * 3 | 0);
                    for (let k = 0; k < blobs; k++) {
                        const ox = (Math.random() - 0.5) * roomR;
                        const oy = (Math.random() - 0.5) * roomR * 0.6;
                        carve(x + ox, y + oy, roomR * (0.7 + Math.random() * 0.4),
                              roomR * (0.5 + Math.random() * 0.3));
                    }
                }
            }
        }

        // ---- 2) КРУПНЫЕ КАВЕРНЫ / КОМНАТЫ ----
        // Beta 1.2: чаще и крупнее. Минкрафт сильно полагается на «cheese caves» —
        // большие открытые залы вглубине.
        const ROOM_COUNT = Math.max(40, Math.floor(this.w / 300));
        for (let i = 0; i < ROOM_COUNT; i++) {
            const cx = 5 + Math.random() * (this.w - 10);
            // Чаще размещаем глубоко — у поверхности воздухом не злоупотребляем.
            const depthBias = Math.pow(Math.random(), 0.7);
            const cy = SAFE_Y + 6 + depthBias * (BEDROCK_Y - SAFE_Y - 10);
            const r = 4 + Math.random() * 6; // 4..10

            // «Бугристая» комната = несколько перекрывающихся сфер.
            const blobs = 6 + (Math.random() * 8 | 0);
            for (let k = 0; k < blobs; k++) {
                const ox = (Math.random() - 0.5) * r * 1.6;
                const oy = (Math.random() - 0.5) * r * 0.9;
                const br = r * (0.5 + Math.random() * 0.55);
                carve(cx + ox, cy + oy, br, br * 0.7);
            }
        }

        // ---- 3) ВЕРТИКАЛЬНЫЕ ШАХТЫ / УЩЕЛЬЯ ----
        // Редкие, но соединяют верх и низ — отличный путь к глубоким пещерам.
        const SHAFT_COUNT = Math.max(10, Math.floor(this.w / 900));
        for (let i = 0; i < SHAFT_COUNT; i++) {
            let xx = 5 + Math.random() * (this.w - 10);
            const top = SAFE_Y + 1 + Math.random() * 6;
            const bot = BEDROCK_Y - 3 - Math.random() * 5;
            for (let y = top; y < bot; y++) {
                xx += (Math.random() - 0.5) * 0.7;
                const rx = 1.0 + 0.6 * Math.sin(y * 0.12 + i) + Math.random() * 0.6;
                carve(xx, y, Math.max(0.8, rx), 1.2);
            }
        }

        // ---- 4) CHEESE POCKETS — маленькие изолированные карманы ----
        // Beta 1.2: разбросанные крошечные пустоты придают камню
        // «сырный» вид, как в MC 1.18+. Не вскрывают воду (carve фильтрует).
        const POCKET_COUNT = Math.max(80, Math.floor(this.w / 50));
        for (let i = 0; i < POCKET_COUNT; i++) {
            const px = 3 + Math.random() * (this.w - 6);
            // Только в глубокой зоне, чтобы не дырявить дёрн/поверхность.
            const py = SAFE_Y + 10 + Math.random() * (BEDROCK_Y - SAFE_Y - 15);
            const pr = 1.2 + Math.random() * 1.5;
            carve(px, py, pr, pr * 0.7);
        }

        // ---- 5) ПОДЧИЩАЕМ ОБНАЖЁННЫЙ ПЕСОК/ГРАВИЙ В СТЕНАХ ПЕЩЕР ----
        // Когда туннель проходит рядом с зоной озёрного дна, рядом с воздухом
        // могут оказаться блоки песка/гравия посреди камня — они выглядят как
        // ярко-жёлтые пятна. В MC такого нет, потому что cave-mask режется
        // отдельно. Здесь конвертируем такие изолированные не-каменные блоки
        // обратно в STONE. Достаточно глубоко от поверхности, чтобы не трогать
        // законные пляжи и озёра.
        const CLEANUP_TOP = SAFE_Y + 3; // оставляем приповерхностный слой как есть
        for (let y = CLEANUP_TOP; y < BEDROCK_Y; y++) {
            for (let x = 1; x < this.w - 1; x++) {
                const id = this.tiles[y * this.w + x];
                if (id !== B.SAND && id !== B.GRAVEL && id !== B.DIRT) continue;
                // Сосед-воздух → значит этот блок «голый» в пещере.
                const hasAirNb =
                    this.tiles[y * this.w + x - 1] === B.AIR ||
                    this.tiles[y * this.w + x + 1] === B.AIR ||
                    (y > 0           && this.tiles[(y - 1) * this.w + x] === B.AIR) ||
                    (y < this.h - 1  && this.tiles[(y + 1) * this.w + x] === B.AIR);
                if (!hasAirNb) continue;
                // Если над ним есть вода — пусть остаётся (это легитимное дно).
                let hasWaterAbove = false;
                for (let dy = 1; dy <= 3; dy++) {
                    const ay = y - dy;
                    if (ay < 0) break;
                    if (isWater(this.tiles[ay * this.w + x])) { hasWaterAbove = true; break; }
                }
                if (hasWaterAbove) continue;
                this.tiles[y * this.w + x] = B.STONE;
            }
        }

        // ---- 6) РУДЫ НА СТЕНАХ ПЕЩЕР ----
        // Проходим только по STONE, у которых есть сосед-AIR — это «открытая»
        // стена пещеры. Так руды видны игроку и встречаются именно там, где
        // он будет копать (как в Minecraft при ходьбе по пещерам).
        for (let y = SAFE_Y; y < BEDROCK_Y; y++) {
            for (let x = 1; x < this.w - 1; x++) {
                if (this.getTile(x, y) !== B.STONE) continue;
                const nearAir =
                    this.getTile(x - 1, y) === B.AIR ||
                    this.getTile(x + 1, y) === B.AIR ||
                    this.getTile(x, y - 1) === B.AIR ||
                    this.getTile(x, y + 1) === B.AIR;
                if (!nearAir) continue;

                const r = Math.random();
                let ore = null;
                if (y > 70 + WORLD_OFFSET_Y && r > CHANCE.DIAMOND) ore = B.DIAMOND_ORE;
                else if (y > 50 + WORLD_OFFSET_Y && r > CHANCE.GOLD) ore = B.GOLD_ORE;
                else if (y > 20 + WORLD_OFFSET_Y && r > CHANCE.IRON) ore = B.IRON_ORE;
                else if (r > CHANCE.COAL) ore = B.COAL_ORE;
                if (ore) {
                    this.setTile(x, y, ore);
                    this._placeOreVein(x, y, ore, 2 + (Math.random() * 3 | 0));
                }
            }
        }
    }

    // V12: детерминированный хэш для value-noise (по сидy + координате).
    // Возвращает число в [0, 1). Скачок битов даёт «псевдослучайный» вид.
    _hash01(ix) {
        // 32-битная смесь — простая, но шумная.
        let h = (ix | 0) ^ ((this.seed * 0x9E3779B1) | 0);
        h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B);
        h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
        h ^= h >>> 16;
        // В диапазон [0, 1).
        return ((h >>> 0) % 1000003) / 1000003;
    }

    // V12: одна октава value-noise со smoothstep-интерполяцией между якорями.
    // spacing — расстояние (в блоках) между опорными точками; salt — соль для хэша,
    // чтобы разные октавы не совпадали по фазе.
    _noiseOctave(x, spacing, salt) {
        const i0 = Math.floor(x / spacing);
        const t = (x - i0 * spacing) / spacing;
        const a = this._hash01(i0 + salt);
        const b = this._hash01(i0 + 1 + salt);
        // smoothstep — мягкий, но достаточно «природный» переход.
        const s = t * t * (3 - 2 * t);
        return a * (1 - s) + b * s; // [0, 1]
    }

    // Beta 1.2: Surface heightmap in Minecraft style.
    //
    // Layers of value-noise sampled at falling frequencies (continentalness →
    // erosion → hills → bumps → grain) produce gentle rolling plains broken by
    // occasional taller hill clusters and rare mountain ranges. The result is
    // the familiar MC look: long flat stretches, soft hills, and dramatic
    // mountains only when several octaves align.
    _mcSurfaceHeight(x) {
        // Continentalness — very low frequency. Sets the broad "high vs low"
        // band so terrain trends gently across hundreds of blocks instead of
        // jittering every column.
        const cont    = this._noiseOctave(x, 220, 6101);
        // Erosion — mid-frequency wide-area smoothing. Multiplies onto hills
        // so hilly zones stay hilly and flat zones stay flat (MC erosion noise).
        const erosion = this._noiseOctave(x, 110, 6202);
        // Hills / bumps / grain — descending frequency for natural fractal feel.
        const hills   = this._noiseOctave(x, 48,  1001);
        const bumps   = this._noiseOctave(x, 18,  2002);
        const grain   = this._noiseOctave(x, 6,   3003);
        // Mountain mask — only fires above a threshold so peaks are a feature,
        // not a constant noise floor.
        const mountainMask  = this._noiseOctave(x, 140, 4004);
        const mountainShape = this._noiseOctave(x, 60,  5005);

        // Base relief: gentle plains (~±3) + soft hill amplitude weighted by the
        // continentalness band. Erosion damps the hills in "smooth" zones.
        const hillAmp = 14 * cont;                       // 0..14, mostly mid
        const erosionDamp = 0.35 + 0.65 * erosion;       // 0.35..1
        let h = (cont - 0.5) * 10
              + (hills - 0.5) * hillAmp * erosionDamp
              + (bumps - 0.5) * 5
              + (grain - 0.5) * 2;

        // Mountain ridges: ~10% of x by area. Above 0.72 mask the height ramps
        // up sharply; pow(>1) gives sharper peaks while still tapering smoothly
        // into the surrounding hills.
        if (mountainMask > 0.72) {
            const m = (mountainMask - 0.72) / 0.28;      // 0..1 inside mountain belt
            h += Math.pow(m, 1.5) * mountainShape * 30;
        }
        return h;
    }

    // Beta 1.2: Variable dirt depth per column. Returns a value in [3..6] so
    // the topsoil thickness varies block-to-block instead of forming the dead-
    // flat 3-block band of the old generator. The noise uses a small spacing
    // so neighbours can differ ±1 block — looks chunky like MC.
    _dirtDepthAt(x) {
        const n = this._noiseOctave(x, 7, 8101);
        return 3 + Math.floor(n * 4); // 3,4,5,6
    }

    // V9: Размещение вейна руды — «шагающий» генератор кладки из 2–4 блоков
    _placeOreVein(startX, startY, oreId, maxSize) {
        let x = startX, y = startY;
        for (let i = 1; i < maxSize; i++) {
            // Случайный шаг к соседу
            if (Math.random() < 0.5) x += (Math.random() < 0.5 ? -1 : 1);
            else y += (Math.random() < 0.5 ? -1 : 1);
            // Границы и проверка
            if (x < 1 || x >= this.w - 1 || y < 1 || y >= this.h - 2) break;
            const t = this.getTile(x, y);
            if (t === B.STONE) {
                this.setTile(x, y, oreId);
            }
        }
    }

    // Beta 1.2: Scatter Minecraft-style dirt & gravel "disks" through the upper
    // stone band. Each disk is a small flat ellipse (3-5 wide × 2-3 tall) that
    // only replaces STONE. Patches are kept shallow (within ~24 blocks of the
    // surface) so the deep-cave gameplay isn't diluted.
    _scatterMineralPatches(heights) {
        // ~1 patch every 5 columns gives the right vanilla density.
        const patchCount = Math.floor(this.w / 5);
        for (let i = 0; i < patchCount; i++) {
            const x = 2 + Math.floor(Math.random() * (this.w - 4));
            const lx = x - WORLD_OFFSET_X;
            if (lx >= 0 && lx <= 27) continue; // protect the reference cave area
            const baseH = heights[x];
            // Depth band: 4..24 below the surface. Skip the topsoil entirely.
            const dirtDepth = this._dirtDepthAt(x);
            const yMin = baseH + dirtDepth + 1;
            const yMax = baseH + dirtDepth + 24;
            const cy = yMin + Math.floor(Math.random() * (yMax - yMin));
            if (cy >= this.h - 4) continue;

            // 70% dirt patches (visually similar to surface), 30% gravel disks.
            const id = (Math.random() < 0.7) ? B.DIRT : B.GRAVEL;
            const rx = 2 + Math.floor(Math.random() * 2); // 2..3 → width 5..7
            const ry = 1 + Math.floor(Math.random() * 2); // 1..2 → height 3..5
            const rx2 = rx * rx, ry2 = ry * ry;
            for (let dy = -ry; dy <= ry; dy++) {
                for (let dx = -rx; dx <= rx; dx++) {
                    if ((dx * dx) / rx2 + (dy * dy) / ry2 > 1) continue;
                    const px = x + dx, py = cy + dy;
                    if (px < 1 || px >= this.w - 1) continue;
                    if (py < 1 || py >= this.h - 2) continue;
                    if (this.tiles[py * this.w + px] === B.STONE) {
                        this.tiles[py * this.w + px] = id;
                    }
                }
            }
        }
    }

    // V12: Генерация озёр на поверхности в стиле Minecraft.
    //  - размеры от маленьких прудов (6 бл.) до больших озёр (~24 бл.);
    //  - неровный (рваный) бордюр — депт по колонке слегка дрожит;
    //  - пляжи: 2-3 блока песка вокруг + второй слой DIRT→SAND;
    //  - выравниваем уровень воды по самому НИЗКОМУ грунту в зоне (как в MC),
    //    чтобы вода всегда была заподлицо, а не «висела» над краем;
    //  - редкие лавовые «озёра» (~5%) делаем мельче и обкладываем камнем.
    generateSurfaceLakes() {
        const OX = WORLD_OFFSET_X;
        const OY = WORLD_OFFSET_Y;
        const lakeCount = 25 + Math.floor(Math.random() * 36); // 25..60

        const getGroundY = (x) => {
            for (let y = Math.max(0, OY - 30); y < this.h - 5; y++) {
                const t = this.getTile(x, y);
                if (t === B.GRASS || t === B.DIRT || t === B.STONE || t === B.SAND) return y;
            }
            return -1;
        };

        let placed = 0;
        let attempts = 0;
        const usedRanges = [];

        while (placed < lakeCount && attempts < lakeCount * 12) {
            attempts++;

            // Минкрафтовый разброс размеров: чаще «лужи» 6-10 шириной,
            // изредка крупные озёра до 24 блоков.
            const rSize = Math.random();
            let lakeWidth;
            if (rSize < 0.55) lakeWidth = 6 + Math.floor(Math.random() * 5);   // 6..10
            else if (rSize < 0.9) lakeWidth = 10 + Math.floor(Math.random() * 7); // 10..16
            else lakeWidth = 16 + Math.floor(Math.random() * 9); // 16..24

            const lakeX = 5 + Math.floor(Math.random() * (this.w - lakeWidth - 10));
            const lx = lakeX - OX;
            if (lx >= -5 && lx <= 100) continue;

            const lakeEnd = lakeX + lakeWidth;
            let overlaps = false;
            for (const range of usedRanges) {
                if (lakeX < range.end + 8 && lakeEnd > range.start - 8) { overlaps = true; break; }
            }
            if (overlaps) continue;

            // Уровень воды = САМАЯ НИЗКАЯ точка грунта в зоне (как в MC).
            // Так озеро всегда заполнено до краёв и не «свисает» с холма.
            let minGroundY = Infinity;
            let valid = 0;
            for (let x = lakeX; x < lakeEnd; x++) {
                const gy = getGroundY(x);
                if (gy > 0) { if (gy < minGroundY) minGroundY = gy; valid++; }
            }
            if (valid < 3 || !isFinite(minGroundY)) continue;

            // Поверхность воды — на 1 блок ниже минимума, чтобы вода была
            // заглублена и края не торчали (как берег у пруда).
            const waterTop = minGroundY + 1;

            const isLava = Math.random() < 0.05;
            // Лава мельче, вода поглубже.
            const lakeDepth = isLava
                ? 1 + Math.floor(Math.random() * 2)         // 1..2
                : 2 + Math.floor(Math.random() * 4);         // 2..5

            // Удаляем деревья и листья (любого слоя) в зоне будущего озера —
            // чтобы не оставались плавающие куски.
            for (let x = lakeX - 1; x <= lakeEnd + 1; x++) {
                for (let y = waterTop - 12; y <= waterTop + lakeDepth + 1; y++) {
                    if (x < 0 || x >= this.w || y < 0) continue;
                    if (this.getTile(x, y) === B.WOOD || this.getTile(x, y) === B.LEAF) this.setTile(x, y, B.AIR);
                    if (this.getTile(x, y, LAYER.FG) === B.WOOD || this.getTile(x, y, LAYER.FG) === B.LEAF) this.setTile(x, y, B.AIR, LAYER.FG);
                    if (this.getTile(x, y, LAYER.BG) === B.WOOD || this.getTile(x, y, LAYER.BG) === B.LEAF) this.setTile(x, y, B.AIR, LAYER.BG);
                }
            }

            // Профиль глубины по колонкам: эллиптический + «рваный» шум,
            // чтобы дно не выглядело как идеальный синус.
            const depthProfile = new Array(lakeWidth);
            for (let i = 0; i < lakeWidth; i++) {
                const cx = (i + 0.5) / lakeWidth;            // 0..1
                const bowl = Math.sin(cx * Math.PI);          // 0..1..0
                // Рваный край: ±1 случайных блока, чаще в центре, реже у краёв.
                const jitter = (Math.random() - 0.4) * 0.5;
                let d = Math.round(lakeDepth * (bowl + jitter * (bowl > 0.3 ? 1 : 0)));
                if (d < 0) d = 0;
                if (d > lakeDepth) d = lakeDepth;
                depthProfile[i] = d;
            }

            // Выкапываем впадину + срезаем грунт над уровнем воды,
            // чтобы не было «потолка» из земли над озером.
            for (let i = 0; i < lakeWidth; i++) {
                const x = lakeX + i;
                if (x < 1 || x >= this.w - 1) continue;
                const d = depthProfile[i];
                // Срезаем всё выше waterTop в этой колонке (поверхность холма «выравниваем»
                // в чашу до отметки waterTop).
                const gy = getGroundY(x);
                if (gy > 0 && gy < waterTop) {
                    for (let y = gy; y < waterTop; y++) {
                        const t = this.getTile(x, y);
                        if (t !== B.AIR && t !== B.BEDROCK) this.setTile(x, y, B.AIR);
                    }
                }
                // Само ложе озера — от waterTop до waterTop + d - 1.
                for (let dy = 0; dy < d; dy++) {
                    const y = waterTop + dy;
                    if (y >= this.h - 3) continue;
                    const t = this.getTile(x, y);
                    if (t !== B.AIR && t !== B.BEDROCK) this.setTile(x, y, B.AIR);
                }
            }

            // Дно: 1 слой основного материала, под ним второй слой смешанный.
            // Beta 1.2: не перезаписываем STONE — иначе песок/гравий «протекает»
            // в каменный слой и пещеры, прокопанные снизу, обнажают эти жёлтые
            // пятна посреди серого камня (баг с скриншота).
            for (let i = 0; i < lakeWidth; i++) {
                const x = lakeX + i;
                if (x < 1 || x >= this.w - 1) continue;
                const d = depthProfile[i];
                if (d < 1) continue;
                const bottomY = waterTop + d;
                if (bottomY >= this.h - 2) continue;

                // Первый слой дна
                let b1;
                if (isLava) {
                    b1 = B.STONE;
                } else {
                    const r = Math.random();
                    if (r < 0.10) b1 = B.CLAY_BLOCK;
                    else if (r < 0.75) b1 = B.SAND;
                    else b1 = B.GRAVEL;
                }
                // Beta 1.2: только земля/трава/воздух могут превратиться в песок —
                // камень/бедрок остаются нетронутыми.
                const cur1 = this.getTile(x, bottomY);
                if (cur1 === B.DIRT || cur1 === B.GRASS || cur1 === B.AIR) {
                    this.setTile(x, bottomY, b1);
                }

                // Второй слой — переход к стандартным породам.
                if (bottomY + 1 < this.h - 2) {
                    let b2;
                    if (isLava) {
                        b2 = B.STONE;
                    } else {
                        const r2 = Math.random();
                        if (r2 < 0.08) b2 = B.CLAY_BLOCK;
                        else if (r2 < 0.45) b2 = B.SAND;
                        else if (r2 < 0.75) b2 = B.GRAVEL;
                        else b2 = B.DIRT;
                    }
                    // Перезаписываем только если там не камень/бедрок —
                    // не хотим стереть пещерные пустоты под озером, дайте им свободу.
                    const cur = this.getTile(x, bottomY + 1);
                    if (cur === B.DIRT || cur === B.GRASS || cur === B.AIR) {
                        this.setTile(x, bottomY + 1, b2);
                    }
                }
            }

            // Уплотняем стены бассейна (1 блок по бокам внутри впадины) —
            // чтобы вода не вытекала в случайные пещеры.
            for (const side of [lakeX - 1, lakeEnd]) {
                if (side < 1 || side >= this.w - 1) continue;
                for (let dy = 0; dy <= lakeDepth; dy++) {
                    const y = waterTop + dy;
                    if (y >= this.h - 2) continue;
                    if (this.getTile(side, y) === B.AIR) {
                        this.setTile(side, y, isLava ? B.STONE : B.SAND);
                    }
                }
            }

            // Заливаем жидкостью весь вырытый объём (от waterTop до дна).
            for (let i = 0; i < lakeWidth; i++) {
                const x = lakeX + i;
                if (x < 1 || x >= this.w - 1) continue;
                const d = depthProfile[i];
                if (d < 1) continue;
                for (let dy = 0; dy < d; dy++) {
                    const y = waterTop + dy;
                    if (y >= this.h - 3) continue;
                    if (this.getTile(x, y) === B.AIR) {
                        if (isLava) this.placeLavaSource(x, y);
                        else this.placeWaterSource(x, y);
                    }
                }
            }

            // Пляжи: песок на 2-3 блока вокруг + второй слой DIRT→SAND.
            // Получаем характерный песчаный «бережок» как у воды в MC.
            const beachRadius = isLava ? 1 : 2 + (Math.random() < 0.5 ? 1 : 0);
            for (let side = -beachRadius; side <= lakeWidth + beachRadius - 1; side++) {
                const bx = lakeX + side;
                if (bx < 1 || bx >= this.w - 1) continue;
                const gy = getGroundY(bx);
                if (gy < 0) continue;
                const top = this.getTile(bx, gy);
                if (isLava) {
                    if (top === B.GRASS || top === B.DIRT) this.setTile(bx, gy, B.STONE);
                } else {
                    if (top === B.GRASS || top === B.DIRT) this.setTile(bx, gy, B.SAND);
                    if (gy + 1 < this.h - 2 && this.getTile(bx, gy + 1) === B.DIRT) {
                        this.setTile(bx, gy + 1, B.SAND);
                    }
                    if (gy + 2 < this.h - 2 && Math.random() < 0.45 && this.getTile(bx, gy + 2) === B.DIRT) {
                        this.setTile(bx, gy + 2, B.SAND);
                    }
                }
                
                // Sugarcane generation on sand/dirt blocks near water.
                if (!isLava && gy > 0 && Math.random() < 0.15) {
                    const topTile = this.getTile(bx, gy);
                    if (topTile === B.SAND || topTile === B.DIRT || topTile === B.GRASS) {
                        const caneHeight = 1 + Math.floor(Math.random() * 3); // 1-3 blocks tall
                        for (let h = 1; h <= caneHeight; h++) {
                            if (gy - h >= 0 && this.getTile(bx, gy - h) === B.AIR) {
                                this.setTile(bx, gy - h, B.SUGARCANE);
                                if (h === caneHeight) {
                                    this.registerCrop(bx, gy - h);
                                }
                            } else {
                                break;
                            }
                        }
                    }
                }
            }

            usedRanges.push({ start: lakeX, end: lakeEnd });
            placed++;
        }
    }

    // V9: Гравитация для песка/гравия — замедленная (каждые 4 тика)
    tickFallingBlocks() {
        // Проверяем только в видимой области + небольшой запас (для производительности)
        // Если нет player — значит ещё не запущен, пропускаем
        if (typeof player === 'undefined' || !player) return;
        // Тротлинг: падение раз в 4 кадра для естественной скорости
        this._fallingTick = (this._fallingTick || 0) + 1;
        if (this._fallingTick % 4 !== 0) return;

        const _ez = typeof getEffectiveZoom === 'function' ? getEffectiveZoom() : 2;
        const viewW = (typeof canvas !== 'undefined' ? canvas.width / _ez : 800) / TILE_SIZE;
        const viewH = (typeof canvas !== 'undefined' ? canvas.height / _ez : 600) / TILE_SIZE;
        const pcx = Math.floor(player.x / TILE_SIZE);
        const pcy = Math.floor(player.y / TILE_SIZE);
        const margin = 5;
        const sx = Math.max(0, pcx - Math.ceil(viewW / 2) - margin);
        const ex = Math.min(this.w - 1, pcx + Math.ceil(viewW / 2) + margin);
        const sy = Math.max(0, pcy - Math.ceil(viewH / 2) - margin);
        const ey = Math.min(this.h - 2, pcy + Math.ceil(viewH / 2) + margin);

        // Идём снизу вверх, чтобы каскадно падающие блоки корректно обрабатывались
        for (let y = ey; y >= sy; y--) {
            for (let x = sx; x <= ex; x++) {
                const t = this.getTile(x, y);
                if (t !== B.SAND && t !== B.GRAVEL) continue;
                const below = this.getTile(x, y + 1);
                if (below === B.AIR) {
                    this.setTile(x, y, B.AIR);
                    this.setTile(x, y + 1, t);
                } else if (BLOCKS[below] && BLOCKS[below].liquid) {
                    // Падение в воду/лаву — вытесняем жидкость
                    const lk = `${x},${y + 1}`;
                    if (this.waterSources.has(lk)) this.removeWaterSource(x, y + 1);
                    if (this.lavaSources.has(lk)) this.removeLavaSource(x, y + 1);
                    this.setTile(x, y, B.AIR);
                    this.setTile(x, y + 1, t);
                    this.queueLiquidCross(x, y);
                    this.queueLiquidCross(x, y + 1);
                }
            }
        }
    }

    // V12: Сажаем дерево на указанном слое (по умолчанию — MID, как раньше).
    // Если layer = LAYER.FG / LAYER.BG, ствол и листья кладём в декоративный
    // слой — игрок сможет проходить сквозь дерево, оно его не блокирует.
    // При посадке в FG/BG не трогаем существующие MID-блоки.
    //
    // Beta 1.2: variable height (4..7) и форма кроны — небольшие «дубы» с
    // компактной верхушкой, иногда крупные с более широкой шапкой. Имитирует
    // MC-style oak (height 4-6) и occasional «large oak» (height 7-8).
    growTree(x, y, layer) {
        const onDecor = (layer === LAYER.FG || layer === LAYER.BG);
        // 80% small/medium oak (4-6), 20% tall oak (7-8). Tall trees get wider
        // canopies. Without this every tree was a copy-paste 4-6 tall blob.
        const isTall = Math.random() < 0.2;
        const h = isTall ? (7 + (Math.random() * 2 | 0))
                         : (4 + (Math.random() * 3 | 0));
        const canopyRadius = isTall ? 3 : 2;

        // Ствол
        for (let i = 1; i <= h; i++) {
            const ty = y - i;
            if (ty < 0) break;
            if (onDecor) {
                // Не перекрываем существующий MID-блок (например, склон/камень)
                if (this.getTile(x, ty) !== B.AIR) continue;
                this.setTile(x, ty, B.WOOD, layer);
            } else {
                this.setTile(x, ty, B.WOOD);
            }
        }
        // Крона — pseudo-spherical with a tapered top row for that MC oak silhouette.
        const topY = y - h;
        for (let lx = x - canopyRadius; lx <= x + canopyRadius; lx++) {
            for (let ly = topY - 2; ly <= topY + 1; ly++) {
                if (ly < 0) continue;
                const dx = Math.abs(lx - x);
                const dy = Math.abs(ly - (topY - 1));
                // Cull corners — keeps the cross-section round-ish.
                if (dx + dy > canopyRadius + 1) continue;
                if (dx === canopyRadius && dy === canopyRadius) continue;
                // Top crown row is narrower (MC tapered top).
                if (ly === topY - 2 && dx > canopyRadius - 1) continue;
                if (onDecor) {
                    if (this.getTile(lx, ly) !== B.AIR) continue;          // MID занят — не рисуем
                    if (this.getTile(lx, ly, layer) !== B.AIR) continue;    // в нашем слое уже что-то
                    this.setTile(lx, ly, B.LEAF, layer);
                } else {
                    if (this.getTile(lx, ly) === B.AIR) this.setTile(lx, ly, B.LEAF);
                }
            }
        }
    }

    getTile(x, y, layer) {
        // По X / по нижней границе — за пределами мира считается «бедрок» (твёрдая стена).
        if (x < 0 || x >= this.w || y >= this.h) return B.BEDROCK;
        // Над миром (y < 0) — бесконечное небо: возвращаем AIR, чтобы игрок
        // мог свободно лететь вверх в режиме noclip.
        if (y < 0) return B.AIR;
        const idx = y * this.w + x;
        if (layer === LAYER.BG) return this.tilesBg[idx];
        if (layer === LAYER.FG) return this.tilesFg[idx];
        return this.tiles[idx]; // default: LAYER.MID
    }
    setTile(x, y, id, layer) {
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
        const idx = y * this.w + x;
        if (layer === LAYER.BG) {
            this.tilesBg[idx] = id;
            // BG за стеной — не влияет на свет и не участвует в огне
            return;
        }
        if (layer === LAYER.FG) {
            this.tilesFg[idx] = id;
            this.lightmapDirty = true; // FG может содержать факелы
            return;
        }
        // MID — стандартное поведение
        this.tiles[idx] = id;
        this.lightmapDirty = true;
        // V8.4: Track fire.
        // When a fire cell is replaced by anything else (block placed on it,
        // gravel falling through, /setblock, etc.) we must also clear the age
        // entry — otherwise fireAge leaks memory and a re-ignited cell would
        // inherit a stale age value and burn out instantly.
        const k = `${x},${y}`;
        if (id === B.FIRE) {
            this.fires.add(k);
            if (this.fireAge[k] === undefined) this.fireAge[k] = 0;
        } else if (this.fires.has(k)) {
            this.fires.delete(k);
            delete this.fireAge[k];
        }
    }
    isSolid(x, y) {
        // Коллизия только по среднему слою — BG/FG не блокируют движение
        let t = this.getTile(x, y);
        if (t === 0) return false;
        // V12: closed doors and trapdoors block, open ones don't (override BLOCKS.pass).
        if (t === B.WOOD_DOOR) {
            const m = this.blockMeta && this.blockMeta[`${x},${y},${LAYER.MID}`];
            return !(m && m.state === 'open');
        }
        if (t === B.WOOD_TRAPDOOR || t === B.WOOD_GATE) {
            const m = this.blockMeta && this.blockMeta[`${x},${y},${LAYER.MID}`];
            return !(m && m.state === 'open');
        }
        return !BLOCKS[t].pass;
    }

    // Возвращает приблизительный уровень освещённости (0..15) для клетки (tx, ty).
    // Берёт максимум из «небесного» света (заблокирован сплошными блоками над клеткой
    // и убавлен временем суток) и света от ближайших источников (факелы, глоустоун,
    // лава, огонь, печка, портал, магма). Используется системой спавна мобов:
    // в Minecraft враждебные мобы появляются при свете ≤ 7.
    getSpawnLight(tx, ty) {
        if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return 15;

        // Свет от источников — ищем в радиусе 8 клеток, по манхэттенской метрике
        // (как в Minecraft: distance уменьшает на 1 за каждый шаг).
        let bl = 0;
        const R = 8;
        for (let oy = -R; oy <= R; oy++) {
            for (let ox = -R; ox <= R; ox++) {
                const d = Math.abs(ox) + Math.abs(oy);
                if (d > 15) continue;
                const xx = tx + ox, yy = ty + oy;
                if (xx < 0 || xx >= this.w || yy < 0 || yy >= this.h) continue;
                const idM = this.getTile(xx, yy);
                const idF = this.getTile(xx, yy, LAYER.FG);
                let emit = 0;
                if (idM === B.TORCH_PLACED || idF === B.TORCH_PLACED) emit = 14;
                else if (idM === B.GLOWSTONE || idF === B.GLOWSTONE) emit = 15;
                else if (idM === B.FIRE) emit = 15;
                else if (isLava(idM)) emit = 15;
                else if (idM === B.MAGMA_BLOCK) emit = 3;
                else if (idM === B.PORTAL) emit = 11;
                else if (idM === B.FURNACE) {
                    const k = `${xx},${yy}`;
                    if (this.furnaces && this.furnaces[k] && this.furnaces[k].fuelTime > 0) emit = 13;
                }
                if (emit > 0) {
                    const local = emit - d;
                    if (local > bl) bl = local;
                }
            }
        }
        if (bl < 0) bl = 0;

        // Небесный свет: если выше клетки нет сплошных блоков — клетка под открытым
        // небом и получает свет в зависимости от времени суток. Внутри Незера —
        // полностью отсутствует (как и в Minecraft).
        let sky = 0;
        if (typeof game === 'undefined' || !game.inNether) {
            let blocked = false;
            for (let yy = ty - 1; yy >= 0; yy--) {
                if (this.isSolid(tx, yy)) { blocked = true; break; }
            }
            if (!blocked) {
                let dayMul = 1;
                if (typeof time !== 'undefined') {
                    if (time >= 0.55 && time < 0.85) dayMul = 0.27;            // ночь ≈ 4
                    else if (time >= 0.40 && time < 0.55) {
                        // закат: 1 → 0.27
                        const t = (time - 0.40) / 0.15;
                        dayMul = 1 - t * (1 - 0.27);
                    } else if (time >= 0.85) {
                        // рассвет: 0.27 → 1
                        const t = (time - 0.85) / 0.15;
                        dayMul = 0.27 + t * (1 - 0.27);
                    }
                }
                sky = Math.round(15 * dayMul);
            }
        }
        const total = Math.max(sky, bl);
        return Math.max(0, Math.min(15, total));
    }

    // ============== V7: LIQUIDS ==============

    // Ключ для Set/Map
    _lk(x, y) { return `${x},${y}`; }

    // Помечает клетку как нуждающуюся в обновлении в следующем тике жидкостей
    queueLiquid(x, y) {
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
        this.liquidQueue.add(this._lk(x, y));
    }

    // Пометить клетку и её 4 соседа на проверку
    queueLiquidCross(x, y) {
        this.queueLiquid(x, y);
        this.queueLiquid(x - 1, y);
        this.queueLiquid(x + 1, y);
        this.queueLiquid(x, y - 1);
        this.queueLiquid(x, y + 1);
    }

    // Источник-ли данная клетка (level 0 + запись в sources)
    isWaterSource(x, y) { return this.waterSources.has(this._lk(x, y)); }
    isLavaSource(x, y) { return this.lavaSources.has(this._lk(x, y)); }

    // Поставить источник. Если над air — он "разольётся" следующими тиками.
    placeWaterSource(x, y) {
        this.setTile(x, y, B.WATER_0);
        this.waterSources.add(this._lk(x, y));
        this.queueLiquidCross(x, y);
    }
    placeLavaSource(x, y) {
        this.setTile(x, y, B.LAVA_0);
        this.lavaSources.add(this._lk(x, y));
        this.queueLiquidCross(x, y);
    }

    // Удалить источник и поставить клетку в очередь на иссякание
    removeWaterSource(x, y) {
        this.waterSources.delete(this._lk(x, y));
        this.queueLiquidCross(x, y);
    }
    removeLavaSource(x, y) {
        this.lavaSources.delete(this._lk(x, y));
        this.queueLiquidCross(x, y);
    }

    // Может ли жидкость "течь" в данную клетку (она пуста или содержит жидкость того же типа с большим уровнем)
    canFlowInto(x, y, type) {
        const t = this.getTile(x, y);
        if (t === B.AIR) return true;
        const bb = BLOCKS[t];
        // Ничего не поломаем в твёрдых блоках
        if (!bb.pass) return false;
        // Декор-проходимые (факел, кровать, пшеница) — смываются водой/лавой
        if (!bb.liquid) return true;
        // Та же жидкость: заливаем, если тот уровень выше (level больше = слабее)
        if (bb.liquid === type) return false; // уже залита
        return false;
    }

    // Главный тик жидкостей — обрабатываем очередь порциями, чтобы не убить FPS.
    // Вызывается каждый кадр из update()
    tickLiquids() {
        this.liquidTick++;
        // Вода обновляется каждые 5 кадров (≈12 раз в секунду — почти Minecraft-овский
        // тик), лава — каждые 30 (медленнее). Раньше вода тикала только 4 раза
        // в секунду, из-за чего разливание из ведра выглядело "залипшим".
        const waterTurn = (this.liquidTick % 5) === 0;
        const lavaTurn = (this.liquidTick % 30) === 0;
        if (!waterTurn && !lavaTurn) return;

        const MAX_PER_TICK = 100; // потолок — чтоб не зависнуть
        const items = Array.from(this.liquidQueue);
        this.liquidQueue.clear();
        let processed = 0;

        for (const key of items) {
            if (processed >= MAX_PER_TICK) {
                // недообработали — вернём обратно на следующий кадр
                this.liquidQueue.add(key);
                continue;
            }
            const [xs, ys] = key.split(',');
            const x = xs | 0, y = ys | 0;
            const t = this.getTile(x, y);
            const b = BLOCKS[t];

            // Клетка пустая: может ли в неё натечь вода/лава сверху или с боков?
            if (t === B.AIR) {
                this._tryFillFromNeighbors(x, y, waterTurn, lavaTurn);
                processed++;
                continue;
            }

            if (!b.liquid) { processed++; continue; }

            // Тиким этот тип только в "его" очередь
            const isW = b.liquid === 'water';
            if (isW && !waterTurn) { this.queueLiquid(x, y); continue; }
            if (!isW && !lavaTurn) { this.queueLiquid(x, y); continue; }

            this._updateLiquidCell(x, y, isW ? 'water' : 'lava');
            processed++;
        }
    }

    // Попытка заполнить пустую клетку жидкостью от верхнего соседа или с боков
    _tryFillFromNeighbors(x, y, waterTurn, lavaTurn) {
        // Сверху
        const up = this.getTile(x, y - 1);
        const upB = BLOCKS[up];
        if (upB && upB.liquid) {
            if ((upB.liquid === 'water' && waterTurn) || (upB.liquid === 'lava' && lavaTurn)) {
                // Вода/лава падает сверху → создаём клетку уровня 0 (полную)
                const baseId = upB.liquid === 'water' ? B.WATER_0 : B.LAVA_0;
                this.setTile(x, y, baseId);
                this.queueLiquidCross(x, y);
                return;
            }
        }
        // С боков — самый низкий соседний уровень + 1
        let bestType = null;
        let bestLevel = 8;
        let hasSourceSide = 0;
        for (const dx of [-1, 1]) {
            const s = this.getTile(x + dx, y);
            const sB = BLOCKS[s];
            if (!sB || !sB.liquid) continue;
            if ((sB.liquid === 'water' && !waterTurn) || (sB.liquid === 'lava' && !lavaTurn)) continue;
            const lvl = sB.level;
            // Жидкость может течь вбок только если сама уровня <7
            if (lvl >= 7) continue;
            // V7 fix: не допускаем растекания от падающего соседа.
            // Соседняя жидкость без источника и без твёрдой опоры снизу сама "падает" —
            // от неё горизонтальных ответвлений в воздухе быть не должно.
            const sideIsSource = sB.liquid === 'water' ? this.isWaterSource(x + dx, y)
                : this.isLavaSource(x + dx, y);
            if (!sideIsSource) {
                const nBelow = this.getTile(x + dx, y + 1);
                const nBelowB = BLOCKS[nBelow];
                if (nBelow === B.AIR) continue;
                if (nBelowB && nBelowB.liquid === sB.liquid) continue;
            }
            if (lvl + 1 < bestLevel) {
                bestLevel = lvl + 1;
                bestType = sB.liquid;
            }
            // MC-эффект: два источника рядом → новая клетка сама источник. Упростим: только для воды.
            if (sB.liquid === 'water' && sideIsSource) hasSourceSide++;
        }
        if (bestType) {
            // Проверим — не пытается ли лава течь в клетку рядом с водой (или наоборот)?
            // Встреча лава/вода: лава → stone, вода сталкивается с лавой → cobblestone у MC.
            // Упростим: если соседняя клетка воды — лава застывает в камень; наоборот — лава превращается в камень.
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const n = this.getTile(x + dx, y + dy);
                const nB = BLOCKS[n];
                if (!nB || !nB.liquid) continue;
                if (nB.liquid !== bestType) {
                    // столкновение: делаем обсидиан
                    this.setTile(x, y, B.OBSIDIAN);
                    // вода рядом тоже "забирает" тепло, но не испаряется
                    this.queueLiquidCross(x, y);
                    return;
                }
            }
            // Создаём жидкость новой клеткой
            const base = bestType === 'water' ? B.WATER_0 : B.LAVA_0;
            let newId = base + bestLevel;
            // Если оба источника воды рядом — эта клетка сама станет источником
            if (bestType === 'water' && hasSourceSide >= 2) {
                newId = B.WATER_0;
                this.waterSources.add(this._lk(x, y));
            }
            this.setTile(x, y, newId);
            this.queueLiquidCross(x, y);
        }
    }

    // Обновление уже существующей жидкой клетки
    _updateLiquidCell(x, y, type) {
        const isSource = type === 'water' ? this.isWaterSource(x, y) : this.isLavaSource(x, y);
        const base = type === 'water' ? B.WATER_0 : B.LAVA_0;
        const cur = this.getTile(x, y);
        const curLvl = cur - base;

        // 1) Течь вниз всегда, если можно, уровнем 0
        const below = this.getTile(x, y + 1);
        const belowB = BLOCKS[below];
        if (below === B.AIR) {
            this.setTile(x, y + 1, base);
            // столкновение с противоположной жидкостью снизу
            this.queueLiquidCross(x, y + 1);
        } else if (belowB && belowB.liquid && belowB.liquid === type) {
            // уже наша — возможно, обновить (ничего не делаем, там своя очередь)
        } else if (belowB && belowB.liquid && belowB.liquid !== type) {
            // Лава над водой → нижняя клетка станет обсидианом
            this.setTile(x, y + 1, B.OBSIDIAN);
            this.queueLiquidCross(x, y + 1);
        }

        // 2) Если НЕ источник — проверить, поддерживают ли соседи
        if (!isSource) {
            // Должен быть хотя бы один сосед выше меня по уровню (меньшее число) того же типа или сверху жидкость
            let supported = false;
            const up = this.getTile(x, y - 1);
            const upB = BLOCKS[up];
            if (upB && upB.liquid === type) supported = true;
            if (!supported) {
                for (const dx of [-1, 1]) {
                    const n = this.getTile(x + dx, y);
                    const nB = BLOCKS[n];
                    if (nB && nB.liquid === type && nB.level < curLvl) { supported = true; break; }
                }
            }
            if (!supported) {
                // Иссякаем
                this.setTile(x, y, B.AIR);
                this.queueLiquidCross(x, y);
                return;
            }
        }

        // 3) Течь вбок, если можно (только если не на уровне 7)
        // V7 fix: жидкость не должна растекаться по горизонтали в воздухе.
        // Растекаемся только если снизу есть опора (твёрдый/непроходимый блок или иной не-жидкий проходимый декор).
        // Если снизу воздух или своя же жидкость — мы "падаем", а не "течём".
        const belowForSpread = this.getTile(x, y + 1);
        const belowBForSpread = BLOCKS[belowForSpread];
        let canSpreadSideways = true;
        if (belowForSpread === B.AIR) canSpreadSideways = false;
        else if (belowBForSpread && belowBForSpread.liquid === type) canSpreadSideways = false;

        if (canSpreadSideways && curLvl < 7) {
            // Сначала проверим — можно ли упасть вниз (ниже у пустых соседних клеток)?
            // MC: жидкость предпочитает искать путь вниз в радиусе 4-5 клеток
            for (const dx of [-1, 1]) {
                const s = this.getTile(x + dx, y);
                if (s === B.AIR) {
                    this.setTile(x + dx, y, base + (curLvl + 1));
                    this.queueLiquidCross(x + dx, y);
                } else {
                    const sB = BLOCKS[s];
                    if (sB && sB.liquid && sB.liquid === type && (s - base) > curLvl + 1) {
                        // существующая клетка того же типа, но слабее — "подпитаем"
                        this.setTile(x + dx, y, base + (curLvl + 1));
                        this.queueLiquidCross(x + dx, y);
                    } else if (sB && sB.liquid && sB.liquid !== type) {
                        // столкновение типов — превратить соседа в обсидиан
                        this.setTile(x + dx, y, B.OBSIDIAN);
                        this.queueLiquidCross(x + dx, y);
                    }
                }
            }
        }
    }

    // Симуляция N тиков подряд — для settle после генерации
    settleLiquids(n) {
        // Временно разрешаем всем типам обновляться каждый тик
        const savedQueue = this.liquidQueue;
        for (let i = 0; i < n; i++) {
            this.liquidTick = 0; // каждый проход эмулируем "water+lava turn"
            // форсим и water (tick%5==0), и lava (tick%30==0): выставляем tick=0 ок
            const items = Array.from(this.liquidQueue);
            this.liquidQueue.clear();
            for (const key of items) {
                const [xs, ys] = key.split(',');
                const x = xs | 0, y = ys | 0;
                const t = this.getTile(x, y);
                const b = BLOCKS[t];
                if (t === B.AIR) {
                    this._tryFillFromNeighbors(x, y, true, true);
                } else if (b && b.liquid) {
                    this._updateLiquidCell(x, y, b.liquid);
                }
            }
            if (this.liquidQueue.size === 0) break; // ничего не осталось — можно раньше выйти
        }
    }

    // Случайные озёра воды/лавы в пещерах
    generateLiquids() {
        // ===========================================================
        //  V10: Жидкости в пещерах в стиле Minecraft.
        //  - Лавовые озёра — в нижней трети мира (как «lava level 11»).
        //  - Водные бассейны — на средних глубинах.
        //  - «Висячие» источники с потолков — дают капли воды/лавы.
        //  Озёра растекаются в стороны вдоль ровного пола, образуя
        //  настоящие лужи, а не одиночные блоки.
        // ===========================================================
        const SAFE_Y = 45 + WORLD_OFFSET_Y;
        const BEDROCK_Y = this.h - 2;
        const LAVA_DEPTH_Y = 70 + WORLD_OFFSET_Y; // лава — глубже этой границы
        const LAVA_DRIP_Y = 60 + WORLD_OFFSET_Y; // капли лавы — чуть выше

        const isCave = (x, y) =>
            x >= 1 && x < this.w - 1 &&
            y >= SAFE_Y && y < BEDROCK_Y &&
            this.getTile(x, y) === B.AIR;

        const adjLava = (x, y) =>
            isLava(this.getTile(x - 1, y)) || isLava(this.getTile(x + 1, y)) ||
            isLava(this.getTile(x, y - 1)) || isLava(this.getTile(x, y + 1));
        const adjWater = (x, y) =>
            isWater(this.getTile(x - 1, y)) || isWater(this.getTile(x + 1, y)) ||
            isWater(this.getTile(x, y - 1)) || isWater(this.getTile(x, y + 1));

        // Растекаемся вдоль плоского пола: ставим источники, пока соседняя
        // клетка тоже воздух с твёрдым полом снизу. Получается полноценная
        // «лужа», как в Minecraft, а не одиночный блок жидкости.
        const fillPuddle = (sx, sy, makeSource, maxRun = 12) => {
            let placed = 0;
            if (isCave(sx, sy) && this.isSolid(sx, sy + 1)) {
                makeSource(sx, sy); placed++;
            } else {
                return 0;
            }
            for (let dx = 1; dx <= maxRun; dx++) {
                const x = sx + dx;
                if (!isCave(x, sy) || !this.isSolid(x, sy + 1)) break;
                makeSource(x, sy); placed++;
            }
            for (let dx = 1; dx <= maxRun; dx++) {
                const x = sx - dx;
                if (!isCave(x, sy) || !this.isSolid(x, sy + 1)) break;
                makeSource(x, sy); placed++;
            }
            return placed;
        };

        // ---- 1) ЛАВОВЫЕ ОЗЁРА (глубокие, у бедрока) ----
        const lavaLakeTarget = Math.max(40, Math.floor(this.w / 100));   // ≈ 200
        let lavaLakes = 0;
        for (let a = 0; lavaLakes < lavaLakeTarget && a < lavaLakeTarget * 30; a++) {
            const x = 2 + (Math.random() * (this.w - 4) | 0);
            const y = LAVA_DEPTH_Y + (Math.random() * (BEDROCK_Y - 1 - LAVA_DEPTH_Y) | 0);
            if (!isCave(x, y)) continue;
            if (!this.isSolid(x, y + 1)) continue;
            if (adjWater(x, y)) continue;
            if (fillPuddle(x, y, (px, py) => this.placeLavaSource(px, py), 14) > 0) {
                lavaLakes++;
            }
        }

        // ---- 2) КАПЛИ ЛАВЫ С ПОТОЛКА ----
        const lavaCeilTarget = Math.max(20, Math.floor(this.w / 250));    // ≈ 80
        let lavaCeil = 0;
        for (let a = 0; lavaCeil < lavaCeilTarget && a < lavaCeilTarget * 30; a++) {
            const x = 2 + (Math.random() * (this.w - 4) | 0);
            const y = LAVA_DRIP_Y + (Math.random() * (BEDROCK_Y - 1 - LAVA_DRIP_Y) | 0);
            if (!isCave(x, y)) continue;
            // Настоящий потолок: сверху камень, снизу — воздух (полость).
            if (this.getTile(x, y - 1) !== B.STONE) continue;
            if (this.getTile(x, y + 1) !== B.AIR) continue;
            if (adjWater(x, y)) continue;
            this.placeLavaSource(x, y);
            lavaCeil++;
        }

        // ---- 3) ВОДНЫЕ БАССЕЙНЫ (средние глубины) ----
        const waterLakeTarget = Math.max(40, Math.floor(this.w / 100));  // ≈ 200
        let waterLakes = 0;
        for (let a = 0; waterLakes < waterLakeTarget && a < waterLakeTarget * 30; a++) {
            const x = 2 + (Math.random() * (this.w - 4) | 0);
            // Вода — почти по всей пещерной зоне, но реже встречается на самой глубине.
            const y = SAFE_Y + 2 + (Math.random() * (BEDROCK_Y - SAFE_Y - 6) | 0);
            // Поглубже — шанс воды снижается (там доминирует лава).
            if (y > LAVA_DEPTH_Y && Math.random() < 0.5) continue;
            if (!isCave(x, y)) continue;
            if (!this.isSolid(x, y + 1)) continue;
            if (adjLava(x, y)) continue;
            if (fillPuddle(x, y, (px, py) => this.placeWaterSource(px, py), 14) > 0) {
                waterLakes++;
            }
        }

        // ---- 4) ВОДНЫЕ РОДНИКИ С ПОТОЛКА ----
        const waterSpringTarget = Math.max(25, Math.floor(this.w / 200)); // ≈ 100
        let waterSprings = 0;
        for (let a = 0; waterSprings < waterSpringTarget && a < waterSpringTarget * 30; a++) {
            const x = 2 + (Math.random() * (this.w - 4) | 0);
            const y = SAFE_Y + 2 + (Math.random() * (BEDROCK_Y - SAFE_Y - 4) | 0);
            if (!isCave(x, y)) continue;
            if (this.getTile(x, y - 1) !== B.STONE) continue;
            if (this.getTile(x, y + 1) !== B.AIR) continue;
            if (adjLava(x, y)) continue;
            this.placeWaterSource(x, y);
            waterSprings++;
        }
    }
}

// --- MAIN GAME ---

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let world, player, enemies = [], passives = [], particles = [];
let keys = {};
let mouse = { x: 0, y: 0, down: false, right: false };
let camX = 0, camY = 0;
let time = 0.0;
let day = 1;
let dayLen = 24000;
let gameRunning = false;
let stats = { mined: 0, kills: 0, timePlayed: 0, placed: 0, slept: false, nightsSurvived: 0, atesBread: false, atesApple: false };
let achievements = [];
let achieved = new Set();
let breakProgress = 0;
let breakStage = 0;
let breakTarget = { x: -1, y: -1, layer: LAYER.MID };
let activeBuildLayer = LAYER.MID; // циклится клавишей B (Mid → Fg → Bg → Mid)

let dragSource = -1;
let dragStartInv = false;
let openFurnacePos = null;
let openChestPos = null;
let openChestDoublePos = null;
let invHighlight = -1;
let musicTimer = 200;
let caveSoundTimer = 500;
let totalScore = 0;

const game = {
    audio: new AudioSys(),
    particles: [],
    placedBlocks: {},
    miningMultiplier: 1.0,
    difficulty: 'normal', // 'easy' | 'normal' | 'hard'
    cheatsEnabled: true,  // Управляется флагом мира при загрузке/создании
    currentWorldId: null, // id текущего активного мира (null = в меню/legacy)
    menuMusicInterval: null,
    screenShake: 0,
    fps: 60,
    _fpsTimer: 0,
    _fpsCount: 0,
    _lastFrame: 0,
    _ambientTimer: 0,

    init() {
        // Сначала мигрируем legacy-сейв в новую систему миров, если он есть.
        if (typeof WorldManager !== 'undefined') WorldManager.migrateLegacy();

        this.bindEvents();
        this.setupAchievements();

        // Старая кнопка btn-load оставлена для совместимости.
        const btnLoad = document.getElementById('btn-load');
        if (btnLoad && localStorage.getItem('voxel_venture_save')) btnLoad.disabled = false;

        const searchInput = document.getElementById('craft-search');
        if (searchInput) searchInput.addEventListener('input', () => this.renderCraftList());
        
        const wbSearchInput = document.getElementById('workbench-craft-search');
        if (wbSearchInput) wbSearchInput.addEventListener('input', () => this.renderCraftList());

        // Live ghost suggestion for the chat command input.
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('input', e => this.updateChatSuggestion(e.target.value));
            chatInput.addEventListener('focus',  e => this.updateChatSuggestion(e.target.value));
            chatInput.addEventListener('blur',   () => {
                const sug = document.getElementById('chat-suggest');
                if (sug) sug.innerText = '';
            });
        }

        // V13: many browsers block autoplay until first user gesture. Wire up
        // a single-shot resume hook so menu music starts as soon as the user
        // clicks/touches/presses a key.
        const resume = () => {
            if (this.audio && this.audio._resumeAudio) this.audio._resumeAudio();
        };
        const onceOpts = { once: true, capture: true };
        window.addEventListener('pointerdown', resume, onceOpts);
        window.addEventListener('keydown', resume, onceOpts);
        window.addEventListener('touchstart', resume, onceOpts);

        // Start menu music
        this.startMenuMusic();
    },

    startMenuMusic() {
        // Play first song immediately and chain follow-ups using the actual
        // remaining length, so back-to-back songs overlap naturally instead of
        // stomping each other every 35s.
        this.audio.playMenuMusic();
        if (this.menuMusicInterval) clearInterval(this.menuMusicInterval);
        const tick = () => {
            if (gameRunning) return; // game took over
            const remaining = this.audio.musicTimeRemaining();
            if (remaining < 0.6) {
                this.audio.playMenuMusic();
            }
        };
        this.menuMusicInterval = setInterval(tick, 1500);
    },

    stopMenuMusic() {
        if (this.menuMusicInterval) {
            clearInterval(this.menuMusicInterval);
            this.menuMusicInterval = null;
        }
        // V13: also stop the currently playing menu .ogg file.
        if (this.audio && this.audio._stopCurrentMusic) this.audio._stopCurrentMusic();
        // Reset gameplay scheduler so the first gameplay track starts cleanly.
        if (this.audio) this._musicGap = null;
        // Silence ambient/wind layers when leaving the menu.
        if (this.audio && this.audio.silenceAmbient) this.audio.silenceAmbient();
    },

    setupAchievements() {
        achievements = [
            { id: 'wood', name: 'Getting Wood', desc: 'Punch a tree.', check: () => player.inv.has(B.WOOD) },
            { id: 'bench', name: 'Crafter', desc: 'Craft a Crafting Table.', check: () => player.inv.has(B.WORKBENCH) },
            { id: 'pick', name: 'Time to Mine', desc: 'Craft a Pickaxe.', check: () => player.inv.has(ITEMS.WOOD_PICK) || player.inv.has(ITEMS.STONE_PICK) },
            { id: 'furnace', name: 'Hot Topic', desc: 'Craft a Furnace.', check: () => player.inv.has(B.FURNACE) },
            { id: 'iron', name: 'Acquire Hardware', desc: 'Smelt an Iron Ingot.', check: () => player.inv.has(ITEMS.IRON_INGOT) },
            { id: 'diamond', name: 'Diamonds!', desc: 'Mine a Diamond.', check: () => player.inv.has(ITEMS.DIAMOND) },
            { id: 'loot', name: 'Treasure Hunter', desc: 'Open a chest.', check: () => false },
            { id: 'slayer', name: 'Monster Hunter', desc: 'Kill a monster.', check: () => stats.kills >= 1 },
            { id: 'chef', name: 'Master Chef', desc: 'Cook food.', check: () => player.inv.has(ITEMS.PORK_COOKED) || player.inv.has(ITEMS.BEEF_COOKED) || player.inv.has(ITEMS.MUTTON_COOKED) },
            // V4 — новые достижения
            { id: 'torch', name: 'Let There Be Light', desc: 'Craft a torch.', check: () => player.inv.has(ITEMS.TORCH) },
            { id: 'sleep', name: 'Sweet Dreams', desc: 'Sleep in a bed.', check: () => stats.slept === true },
            { id: 'deep', name: 'Into the Depths', desc: 'Descend to cave depth.', check: () => player && player.y > (70 + WORLD_OFFSET_Y) * TILE_SIZE },
            { id: 'slayer10', name: 'Monster Slayer', desc: 'Kill 10 monsters.', check: () => stats.kills >= 10 },
            { id: 'survivor', name: 'Night Survivor', desc: 'Survive your first night.', check: () => stats.nightsSurvived >= 1 },
            { id: 'architect', name: 'Architect', desc: 'Place 50 blocks.', check: () => stats.placed >= 50 },
            { id: 'timekeeper', name: 'Time Keeper', desc: 'Obtain a clock.', check: () => player.inv.has(ITEMS.CLOCK) },
            { id: 'rich', name: 'Tycoon', desc: 'Craft a Diamond Block.', check: () => player.inv.has(B.DIAMOND_BLOCK) },
            { id: 'sword', name: 'En Garde', desc: 'Craft any sword.', check: () => player.inv.has(ITEMS.WOOD_SWORD) || player.inv.has(ITEMS.STONE_SWORD) || player.inv.has(ITEMS.IRON_SWORD) || player.inv.has(ITEMS.DIAMOND_SWORD) },
            { id: 'miner', name: 'Mining Maniac', desc: 'Mine 100 blocks.', check: () => stats.mined >= 100 },
            { id: 'bread', name: 'Daily Bread', desc: 'Eat a loaf of bread.', check: () => stats.atesBread === true },
            { id: 'apple', name: 'An Apple a Day', desc: 'Eat an apple.', check: () => stats.atesApple === true }
        ];
    },

    // V4: страницы Commands Encyclopedia с пагинацией
    _commandsPages: [
        {
            title: 'Player & Movement',
            entries: [
                { cmd: '/home', desc: 'Return to your spawn point or bed.' },
                { cmd: '/tp X Y', desc: 'Teleport to block coordinates.' },
                { cmd: '/heal', desc: 'Restore health to full.' },
                { cmd: '/noclip', desc: 'Toggle flying. WASD for directions.' },
                { cmd: '/speed N', desc: 'Set walk speed (default 3.5).' },
                { cmd: '/jump N', desc: 'Set jump power (default 7.8).' }
            ]
        },
        {
            title: 'World & Time',
            entries: [
                { cmd: '/time day', desc: 'Set time to morning.' },
                { cmd: '/time night', desc: 'Set time to night.' },
                { cmd: '/difficulty 0-3', desc: 'Peaceful, Easy, Normal, Hard.' },
                { cmd: '/mining N', desc: 'Mining speed multiplier.' },
                { cmd: '/invincible on/off', desc: 'Toggle damage immunity.' }
            ]
        },
        {
            title: 'Items & Mobs',
            entries: [
                { cmd: '/give ITEM [count]', desc: 'Give yourself an item.' },
                { cmd: '/clear', desc: 'Empty your inventory.' },
                { cmd: '/summon zombie', desc: 'Spawn a zombie near you.' },
                { cmd: '/summon spider', desc: 'Spawn a spider near you.' },
                { cmd: '/summon skeleton', desc: 'Spawn a skeleton near you.' },
                { cmd: '/summon enderman', desc: 'Spawn an enderman near you.' },
                { cmd: '/summon pig', desc: 'Spawn a pig near you.' },
                { cmd: '/summon cow', desc: 'Spawn a cow near you.' },
                { cmd: '/summon sheep', desc: 'Spawn a sheep near you.' },
                { cmd: '/kill mobs', desc: 'Remove all entities.' },
                { cmd: '/kill enemies', desc: 'Remove all hostile mobs.' },
                { cmd: '/help', desc: 'Show short command list in chat.' }
            ]
        }
    ],
    _currentCmdPage: 0,

    setupCommandsUI() {
        const prev = document.getElementById('btn-cmd-prev');
        const next = document.getElementById('btn-cmd-next');
        if (!prev || !next) return; // HTML ещё не готов — пропускаем тихо
        prev.onclick = () => { this.audio.playSound('button_click'); this.gotoCmdPage(this._currentCmdPage - 1); };
        next.onclick = () => { this.audio.playSound('button_click'); this.gotoCmdPage(this._currentCmdPage + 1); };
        // первая отрисовка (чтобы при открытии через Help всё уже было готово)
        this.gotoCmdPage(0);
    },

    gotoCmdPage(idx) {
        const pages = this._commandsPages;
        if (idx < 0 || idx >= pages.length) return;
        this._currentCmdPage = idx;

        // заголовок страницы
        const titleEl = document.getElementById('cmd-page-title');
        if (titleEl) titleEl.innerText = pages[idx].title;

        // контент
        const content = document.getElementById('cmd-page-content');
        if (content) {
            content.innerHTML = '';
            pages[idx].entries.forEach(e => {
                const div = document.createElement('div');
                div.className = 'cmd-entry';
                div.innerHTML = `<b>${e.cmd}</b><span>${e.desc}</span>`;
                content.appendChild(div);
            });
        }

        // точки-индикаторы
        const dots = document.getElementById('cmd-dots');
        if (dots) {
            dots.innerHTML = '';
            for (let i = 0; i < pages.length; i++) {
                const d = document.createElement('div');
                d.className = 'cmd-dot' + (i === idx ? ' active' : '');
                d.onclick = () => { this.audio.playSound('button_click'); this.gotoCmdPage(i); };
                dots.appendChild(d);
            }
        }

        // кнопки prev/next
        const prev = document.getElementById('btn-cmd-prev');
        const next = document.getElementById('btn-cmd-next');
        if (prev) prev.disabled = (idx === 0);
        if (next) next.disabled = (idx === pages.length - 1);
    },

    isUiOpen() {
        return !document.getElementById('screen-inventory').classList.contains('hidden') ||
            !document.getElementById('screen-furnace').classList.contains('hidden') ||
            !document.getElementById('screen-chest').classList.contains('hidden') ||
            !document.getElementById('screen-story').classList.contains('hidden') ||
            !document.getElementById('screen-achievements').classList.contains('hidden') ||
            !document.getElementById('screen-help').classList.contains('hidden') ||
            !document.getElementById('screen-chat').classList.contains('hidden') ||
            !document.getElementById('screen-settings').classList.contains('hidden') ||
            !document.getElementById('screen-pause').classList.contains('hidden') ||
            (document.getElementById('screen-workbench') && !document.getElementById('screen-workbench').classList.contains('hidden')) ||
            (document.getElementById('screen-commands') && !document.getElementById('screen-commands').classList.contains('hidden'));
    },

    // Открыто только меню паузы (а не игровой UI)
    isPauseOpen() {
        return !document.getElementById('screen-pause').classList.contains('hidden');
    },

    toggleChat() {
        const chat = document.getElementById('screen-chat');
        if (!chat) return;
        if (chat.classList.contains('hidden')) {
            chat.classList.remove('hidden');
            // Re-show any faded-out lines while the user is typing.
            const hist = document.getElementById('chat-history-area');
            if (hist) {
                Array.from(hist.children).forEach(p => { p.style.opacity = '1'; });
            }
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = '';
                input.focus();
            }
            // Reset autocomplete suggestion.
            const sug = document.getElementById('chat-suggest');
            if (sug) sug.innerText = '';
        } else {
            chat.classList.add('hidden');
            const input = document.getElementById('chat-input');
            if (input) input.blur();
            const sug = document.getElementById('chat-suggest');
            if (sug) sug.innerText = '';
        }
    },

    executeCommand(cmd) {
        if (cmd.trim().length > 0) {
            this.addChatMessage('> ' + cmd);
        }
        const parts = cmd.trim().split(' ');
        const command = parts[0].toLowerCase();
        // Cheats-gate: если в текущем мире читы отключены — блокируем команды.
        if (this.cheatsEnabled === false) {
            this.sysMessage('Cheats are disabled in this world.');
            return;
        }
        switch (command) {
            case '/tp': case '/teleport':
                if (parts.length >= 3) {
                    const x = parseInt(parts[1]) * TILE_SIZE;
                    const y = parseInt(parts[2]) * TILE_SIZE;
                    if (!isNaN(x) && !isNaN(y)) {
                        player.x = x; player.y = y;
                        this.sysMessage(`Teleported to ${parts[1]}, ${parts[2]}`);
                    }
                }
                break;
            case '/give':
                if (parts.length >= 2) {
                    let itemName = parts[1].toUpperCase();
                    let count = 1;

                    // Проверка: если частей больше 2
                    if (parts.length > 2) {
                        const possibleCount = parseInt(parts[2]);

                        // Если 3-я часть ЭТО НЕ ЧИСЛО (например, "pickaxe" или "pick"),
                        // значит это часть названия предмета
                        if (isNaN(possibleCount)) {
                            itemName += '_' + parts[2].toUpperCase();
                            // Если есть 4-я часть, то это может быть количество (например: /give diamond pick 64)
                            if (parts.length > 3) {
                                const nextCount = parseInt(parts[3]);
                                if (!isNaN(nextCount)) count = nextCount;
                            }
                        } else {
                            // Если это число, значит это количество
                            count = possibleCount;
                        }
                    }

                    let itemId = null;
                    // Ищем предмет по ID
                    for (let key in ITEMS) { if (key === itemName) { itemId = ITEMS[key]; break; } }
                    // Если не нашли в предметах, ищем в блоках
                    if (itemId === null) {
                        for (let key in B) { if (key === itemName) { itemId = B[key]; break; } }
                    }

                    if (itemId !== null) {
                        player.inv.add(itemId, count);
                        this.sysMessage(`Given ${count}x ${itemName}`);
                        this.updateHUD();
                    } else {
                        // Теперь вместо бага вы увидите сообщение, если ошиблись в названии
                        this.sysMessage(`Unknown item: ${itemName}`);
                    }
                }
                break;
            case '/kill':
                if (parts[1] === 'mobs') { enemies = []; passives = []; arrows = []; pearls = []; this.sysMessage('All mobs killed'); }
                else if (parts[1] === 'enemies') { enemies = []; arrows = []; this.sysMessage('All enemies killed'); }
                break;
            case '/home':
                if (world) {
                    // Beta 1.0: if currently in the Nether, return to the
                    // overworld first — otherwise /home would teleport the
                    // player inside the netherrack at the overworld spawn TX/TY.
                    if (this.inNether && this.overworldSnapshot) {
                        // Force a clean dimension swap and ignore the in/out
                        // toggle in doNetherTeleport by clearing the snapshot
                        // assumption: doNetherTeleport handles the swap.
                        this.doNetherTeleport();
                    }
                    player.x = world.spawnX;
                    player.y = world.spawnY;
                    player.vx = 0; player.vy = 0;
                    // Reset fall tracking so the teleport itself doesn't register as a fall.
                    player.fallStartY = player.y;
                    player.portalTimer = 0;
                    player.portalCooldown = 60;
                    this.sysMessage('Teleported to home');
                }
                break;
            case '/summon':
                if (parts.length >= 2) {
                    const mobType = parts[1].toLowerCase();
                    if (mobType === 'zombie') enemies.push(new Enemy(player.x, player.y, 0));
                    else if (mobType === 'spider') enemies.push(new Enemy(player.x, player.y, 1));
                    else if (mobType === 'skeleton') enemies.push(new Enemy(player.x, player.y, 2));
                    else if (mobType === 'enderman') enemies.push(new Enemy(player.x, player.y, 3));
                    else if (mobType === 'pig') passives.push(new PassiveMob(player.x, player.y, 0));
                    else if (mobType === 'cow') passives.push(new PassiveMob(player.x, player.y, 1));
                    else if (mobType === 'sheep') passives.push(new PassiveMob(player.x, player.y, 2));
                    else { this.sysMessage(`Unknown mob: ${mobType}`); break; }
                    this.sysMessage(`Summoned ${mobType}`);
                }
                break;
            case '/clear':
                for (let i = 0; i < player.inv.capacity; i++) {
                    player.inv.slots[i] = null;
                }
                this.updateHUD();
                this.sysMessage('Inventory cleared');
                break;
            case '/noclip':
                player.flying = !player.flying;
                this.sysMessage(`Noclip: ${player.flying ? 'ON' : 'OFF'}`);
                break;
            case '/difficulty':
                if (parts.length >= 2) {
                    const val = parseInt(parts[1]);
                    if (!isNaN(val) && val >= 0 && val <= 3) {
                        this.difficulty = val;
                        document.getElementById('difficulty-slider').value = val;
                        const diffNames = ['Peaceful', 'Easy', 'Normal', 'Hard'];
                        document.getElementById('difficulty-value').innerText = diffNames[val];
                        if (val === 0) enemies.length = 0;
                        this.sysMessage(`Difficulty set to ${diffNames[val]}`);
                    }
                }
                break;
            case '/speed':
                if (parts.length >= 2) {
                    const speed = parseFloat(parts[1]);
                    if (!isNaN(speed) && speed > 0 && speed <= 20) {
                        player.speed = speed;
                        this.sysMessage(`Speed set to ${speed}`);
                    }
                }
                break;
            case '/mining':
                if (parts.length >= 2) {
                    const speed = parseFloat(parts[1]);
                    if (!isNaN(speed) && speed > 0) {
                        this.miningMultiplier = speed;
                        this.sysMessage(`Mining speed: x${speed}`);
                    }
                }
                break;
            case '/layer':
                if (parts.length >= 2) {
                    const arg = parts[1].toLowerCase();
                    const m = { bg: 0, background: 0, mid: 1, middle: 1, fg: 2, foreground: 2 };
                    const n = m[arg] !== undefined ? m[arg] : parseInt(arg);
                    if (n >= 0 && n <= 2) {
                        activeBuildLayer = n;
                        this.sysMessage(`Build layer: ${LAYER_NAMES[n]}`);
                        this.updateLayerHud();
                    } else {
                        this.sysMessage('Usage: /layer bg|mid|fg');
                    }
                } else {
                    this.sysMessage('Usage: /layer bg|mid|fg');
                }
                break;

            case '/jump':
                if (parts.length >= 2) {
                    const power = parseFloat(parts[1]);
                    if (!isNaN(power)) {
                        // В игре прыжок - это отрицательная вертикальная скорость.
                        // Если игрок введет 10, мы сделаем -10.
                        player.jumpPower = -Math.abs(power);
                        this.sysMessage(`Jump power set to ${Math.abs(power)}`);
                    }
                }
                break;
            case '/time':
                if (parts.length >= 2) {
                    if (parts[1] === 'day') { time = 0.0; this.sysMessage('Time set to day'); }
                    else if (parts[1] === 'night') { time = 0.5; this.sysMessage('Time set to night'); }
                }
                break;
            case '/heal':
                player.hp = player.maxHp;
                this.updateHUD();
                this.sysMessage('Healed!');
                break;
            case '/invincible':
                if (parts.length >= 2) {
                    const value = parts[1].toLowerCase();
                    if (value === 'true' || value === '1' || value === 'on') {
                        player.invincible = true;
                        this.sysMessage('Invincibility enabled');
                    } else if (value === 'false' || value === '0' || value === 'off') {
                        player.invincible = false;
                        this.sysMessage('Invincibility disabled');
                    } else {
                        this.sysMessage('Usage: /invincible <true|false>');
                    }
                } else {
                    this.sysMessage('Usage: /invincible <true|false>');
                }
                break;
            case '/help':
                this.sysMessage('Commands: /tp, /give, /kill, /speed, /time, /heal, /mining, /jump, /invincible');
                break;
            default:
                this.sysMessage(`Unknown command: ${command}`);
        }
    },

    addScore(points) {
        totalScore += points;
    },

    reset() {
        // Get seed from input field or generate random
        const seedInput = document.getElementById('seed-input');
        let seed = null;
        if (seedInput && seedInput.value.trim()) {
            // Convert string to number - use hash if not numeric
            const val = seedInput.value.trim();
            seed = parseInt(val);
            if (isNaN(seed)) {
                // String hash
                seed = 0;
                for (let i = 0; i < val.length; i++) {
                    seed = ((seed << 5) - seed) + val.charCodeAt(i);
                    seed = seed & seed;
                }
                seed = Math.abs(seed);
            }
        }
        world = new World(seed);
        player = new Player(world.spawnX, world.spawnY);
        // Starter kit (story mode): iron pick + clock + food
        player.inv.add(ITEMS.IRON_PICK, 1);
        player.inv.add(ITEMS.CLOCK, 1);
        enemies = [];
        passives = [];
        arrows = [];
        pearls = [];
        this.particles = [];
        time = 0.0;
        day = 1;
        totalScore = 0;
        stats = { mined: 0, kills: 0, timePlayed: 0 };
        achieved.clear();
        this.save();
        this.updateHUD();
    },

    save() {
        const data = {
            version: 2, // v2: трёхслойные тайлы + RLE-сжатие
            tilesRle: rleEncode(world.tiles),
            tilesBgRle: rleEncode(world.tilesBg),
            tilesFgRle: rleEncode(world.tilesFg),
            furnaces: world.furnaces,
            chests: world.chests,
            crops: world.crops, // V5: таймеры посевов
            blockMeta: world.blockMeta, // V12: ориентация/состояние факелов, дверей, ступенек и т.д.
            // V7: источники жидкостей
            waterSources: Array.from(world.waterSources),
            lavaSources: Array.from(world.lavaSources),
            seed: world.seed,
            px: player.x, py: player.y,
            inv: player.inv.slots,
            capacity: player.inv.capacity,
            armor: player.armor,
            stats: stats,
            day: day, time: time,
            score: totalScore,
            achieved: Array.from(achieved)
        };
        try {
            const json = JSON.stringify(data);
            // Если активен мир из WorldManager — пишем в свой ключ, иначе в legacy.
            if (this.currentWorldId && typeof WorldManager !== 'undefined') {
                localStorage.setItem(WorldManager.WORLD_PREFIX + this.currentWorldId, json);
                const idx = WorldManager.list();
                const meta = idx.find(w => w.id === this.currentWorldId);
                if (meta) {
                    meta.lastPlayedAt = Date.now();
                    meta.day = day;
                    WorldManager.saveIndex(idx);
                }
            } else {
                localStorage.setItem('voxel_venture_save', json);
            }
            const btnLoad = document.getElementById('btn-load');
            if (btnLoad) btnLoad.disabled = false;
        } catch (e) {
            // С увеличенным миром (20000×256 ≈ 5 MB байт тайлов) JSON может
            // превышать квоту localStorage. Не падаем — просто сообщаем игроку.
            console.warn('Save failed:', e);
            this.sysMessage('Save failed: world too large for browser storage.');
        }
    },

    load(worldId) {
        // Если передан id — читаем из ключа WorldManager. Иначе пытаемся загрузить legacy-сейв.
        let raw = null;
        if (worldId && typeof WorldManager !== 'undefined') {
            raw = localStorage.getItem(WorldManager.WORLD_PREFIX + worldId);
        } else {
            raw = localStorage.getItem('voxel_venture_save');
        }
        if (!raw) return false;
        try {
            const data = JSON.parse(raw);
            world = new World(data.seed || Math.floor(Math.random() * 999999));
            const expectedTiles = WORLD_W * WORLD_H;
            // v2 (RLE) → декодируем; legacy (распакованный массив tiles) → читаем напрямую.
            if (data.tilesRle && Array.isArray(data.tilesRle)) {
                world.tiles = rleDecode(data.tilesRle, expectedTiles);
            } else if (data.tiles && data.tiles.length === expectedTiles) {
                world.tiles = new Uint8Array(data.tiles);
            } else {
                console.warn(`Save tile data missing/invalid (expected ${expectedTiles} tiles); regenerating world from seed.`);
            }
            // Слои BG/FG — могут отсутствовать в старых сейвах.
            if (data.tilesBgRle && Array.isArray(data.tilesBgRle)) {
                world.tilesBg = rleDecode(data.tilesBgRle, expectedTiles);
            }
            if (data.tilesFgRle && Array.isArray(data.tilesFgRle)) {
                world.tilesFg = rleDecode(data.tilesFgRle, expectedTiles);
            }
            world.furnaces = data.furnaces || {};
            world.chests = data.chests || {};
            world.blockMeta = data.blockMeta || {}; // V12: orientation/state for special blocks
            // V7: источники жидкостей
            world.waterSources = new Set(data.waterSources || []);
            world.lavaSources = new Set(data.lavaSources || []);
            world.liquidQueue = new Set();
            // Заново поставим в очередь все жидкости, чтобы правильно обновлялись
            for (let x = 0; x < world.w; x++) {
                for (let y = 0; y < world.h; y++) {
                    const t = world.tiles[y * world.w + x];
                    if (BLOCKS[t] && BLOCKS[t].liquid) world.queueLiquid(x, y);
                }
            }
            // V5: восстанавливаем активные посевы. Если сохранение старое —
            // пересканируем мир и находим WHEAT_0..WHEAT_2 блоки.
            if (data.crops) {
                world.crops = data.crops;
            } else {
                world.crops = {};
                for (let x = 0; x < world.w; x++) {
                    for (let y = 0; y < world.h; y++) {
                        const t = world.getTile(x, y);
                        if ((t >= B.WHEAT_0 && t <= B.WHEAT_2) || t === B.SUGARCANE) {
                            if (t === B.SUGARCANE && world.getTile(x, y - 1) === B.AIR) {
                                world.registerCrop(x, y);
                            } else if (t !== B.SUGARCANE) {
                                world.registerCrop(x, y);
                            }
                        }
                    }
                }
            }
            player = new Player(data.px, data.py);
            // V16: clear projectiles + mobs when loading a fresh world.
            enemies = []; passives = []; arrows = []; pearls = [];
            // Нормализуем массив слотов под новую ёмкость 36.
            const loadedSlots = data.inv || [];
            const normSlots = new Array(36).fill(null);
            for (let i = 0; i < Math.min(36, loadedSlots.length); i++) {
                const s = loadedSlots[i];
                // Старые сейвы могли содержать рюкзак — выбрасываем.
                if (s && s.id !== 700 /* BACKPACK */) normSlots[i] = s;
            }
            player.inv.slots = normSlots;
            player.inv.capacity = 36;
            // Восстановление брони
            if (data.armor) player.armor = data.armor;
            stats = data.stats || { mined: 0, kills: 0, timePlayed: 0 };
            day = data.day;
            time = data.time;
            totalScore = data.score || 0;
            achieved = new Set(data.achieved || []);

            // Подхватываем настройки текущего мира (cheats, difficulty).
            if (worldId && typeof WorldManager !== 'undefined') {
                this.currentWorldId = worldId;
                const meta = WorldManager.list().find(w => w.id === worldId);
                if (meta) {
                    this.cheatsEnabled = !!meta.cheats;
                    this.difficulty = meta.difficulty || 'normal';
                    if (player) this.applyDifficultyToPlayer();
                }
            } else {
                // Legacy-загрузка: для совместимости разрешаем читы.
                this.currentWorldId = null;
                this.cheatsEnabled = true;
                this.difficulty = 'normal';
            }
            activeBuildLayer = LAYER.MID;
            this.updateLayerHud();
            return true;
        } catch (e) { console.error("Load failed", e); return false; }
    },

    applyDifficultyToPlayer() {
        // Применяет настройки сложности к игроку. Множители HP.
        // Урон мобов умножается отдельно в game.difficultyDamageMul().
        if (!player) return;
        if (this.difficulty === 'easy') {
            player.maxHp = 15;
        } else if (this.difficulty === 'hard') {
            player.maxHp = 7;
        } else {
            player.maxHp = 10;
        }
        // Не понижаем текущий HP насильно (просто кэп при необходимости).
        if (player.hp > player.maxHp) player.hp = player.maxHp;
    },

    difficultyDamageMul() {
        if (this.difficulty === 'easy') return 0.5;
        if (this.difficulty === 'hard') return 1.5;
        return 1.0;
    },

    // Beta 1.0: Start the wobble-and-fade transition into/out of the Nether.
    // Runs a 90-frame overlay where the screen swirls purple, then calls
    // doNetherTeleport() at the apex to actually swap dimensions.
    beginNetherTeleport() {
        if (this.teleporting) return;
        this.teleporting = true;
        this.teleportFrame = 0;
        this.audio.playSound('place');
    },

    // Actually perform the dimension swap. Called at the visual apex of the
    // teleport overlay. Saves overworld state, builds (or restores) the nether,
    // and spawns the player at the scaled coordinate (1:8 ratio).
    doNetherTeleport() {
        if (!player) return;
        const goingToNether = !this.inNether;
        const snapshot = (w) => ({
            tiles: w.tiles, tilesBg: w.tilesBg, tilesFg: w.tilesFg,
            blockMeta: w.blockMeta, furnaces: w.furnaces, chests: w.chests, crops: w.crops,
            waterSources: w.waterSources, lavaSources: w.lavaSources,
            fires: w.fires, fireAge: w.fireAge, liquidQueue: w.liquidQueue,
            biomeMap: w.biomeMap, tempMap: w.tempMap, humMap: w.humMap,
            bgObjects: w.bgObjects,
            playerX: player.x, playerY: player.y,
            enemies, passives,
        });

        if (goingToNether) {
            this.overworldSnapshot = snapshot(world);
            if (!this.netherSnapshot) {
                buildNetherWorld(world);
            } else {
                restoreSnapshot(world, this.netherSnapshot);
            }
            this.inNether = true;

            const baseTX = Math.floor(this.overworldSnapshot.playerX / TILE_SIZE);
            const netherTX = Math.max(8, Math.min(world.w - 9, Math.floor(baseTX / 8)));
            const safeTY = findNetherSafeY(netherTX);
            ensureReturnPortal(netherTX, safeTY);
            // Drop the player inside the portal's middle row.
            player.x = netherTX * TILE_SIZE + 4;
            player.y = (safeTY - 2) * TILE_SIZE;
            player.vx = 0; player.vy = 0;
            player.fallStartY = player.y; // avoid fall damage on arrival
            player.portalTimer = 0;
            player.portalCooldown = 120; // ~2 s grace so we don't ping-pong

            enemies = []; passives = []; arrows = []; pearls = [];
            spawnNetherMobs();
        } else {
            this.netherSnapshot = snapshot(world);
            restoreSnapshot(world, this.overworldSnapshot);
            this.inNether = false;

            const netherTX = Math.floor(this.netherSnapshot.playerX / TILE_SIZE);
            const owTX = Math.max(8, Math.min(world.w - 9, netherTX * 8));
            const safeTY = findOverworldSafeY(owTX);
            ensureReturnPortal(owTX, safeTY);
            player.x = owTX * TILE_SIZE + 4;
            player.y = (safeTY - 2) * TILE_SIZE;
            player.vx = 0; player.vy = 0;
            player.fallStartY = player.y; // avoid fall damage on arrival
            player.portalTimer = 0;
            player.portalCooldown = 120;

            // Clear nether-only mobs/projectiles when returning to overworld.
            pigmen = []; ghasts = []; fireballs = [];
            enemies = this.overworldSnapshot.enemies || [];
            passives = this.overworldSnapshot.passives || [];
            arrows = []; pearls = [];
        }
        world.lightmapDirty = true;
    },

    bindEvents() {
        window.addEventListener('keydown', e => {
            // 1. Сначала проверяем, находится ли игрок в поле ввода (чат или сид)
            const activeEl = document.activeElement;
            const isTyping = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';

            if (isTyping) {
                // Если это чат и нажали Enter
                if (activeEl.id === 'chat-input' && e.code === 'Enter') {
                    const cmd = activeEl.value.trim();
                    activeEl.value = '';
                    this.toggleChat();
                    if (cmd.length > 0) {
                        if (cmd.startsWith('/')) {
                            this.executeCommand(cmd);
                        } else {
                            this.addChatMessage(`<Creeper>: ${cmd}`);
                        }
                    }
                    return;
                }
                // Tab: accept the current autocomplete suggestion (like Minecraft).
                if (activeEl.id === 'chat-input' && e.code === 'Tab') {
                    e.preventDefault();
                    const completed = this.autocompleteChat(activeEl.value);
                    if (completed !== null) {
                        activeEl.value = completed;
                        this.updateChatSuggestion(activeEl.value);
                    }
                    return;
                }
                // Если нажали Escape в поле ввода — просто снимаем фокус или закрываем чат
                if (e.code === 'Escape') {
                    activeEl.blur();
                    if (activeEl.id === 'chat-input') this.toggleChat();
                    return;
                }
                // ВАЖНО: Если мы пишем текст, мы выходим из функции здесь.
                // Мы НЕ делаем e.preventDefault() для пробела, чтобы он напечатался.
                return;
            }

            // 2. Если мы НЕ в поле ввода, тогда блокируем прокрутку пробелом
            if (e.code === 'Space') e.preventDefault();
            keys[e.code] = true;
            if (e.code.startsWith('Digit')) {
                if (!this.isUiOpen()) {
                    let n = parseInt(e.code.replace('Digit', ''));
                    if (n > 0 && n <= 9) player.inv.selected = n - 1;
                }
            }
            // B — циклит активный слой постройки (Mid → Fg → Bg → Mid)
            if (e.code === 'KeyB' && !this.isUiOpen() && gameRunning) {
                activeBuildLayer = (activeBuildLayer + 1) % 3;
                this.sysMessage(`Build layer: ${LAYER_NAMES[activeBuildLayer]}`);
                this.updateLayerHud();
            }
            if (e.code === 'KeyE') {
                // В меню паузы клавиша E игнорируется — иначе можно открыть
                // инвентарь поверх паузы.
                if (this.isPauseOpen()) {
                    // no-op
                } else if (this.isUiOpen()) {
                    this.closeAllUi();
                } else {
                    // Проверяем, наведен ли курсор на контейнер
                    const _ez2 = getEffectiveZoom();
                    const worldMx = (mouse.x / _ez2) + camX;
                    const worldMy = (mouse.y / _ez2) + camY;
                    const tx = Math.floor(worldMx / TILE_SIZE);
                    const ty = Math.floor(worldMy / TILE_SIZE);
                    const t = world.getTile(tx, ty);

                    // Проверка дистанции
                    const dist = Math.sqrt((player.x + 10 - worldMx) ** 2 + (player.y + 28 - worldMy) ** 2);

                    if ((t === B.CHEST || t === B.FURNACE || t === B.WORKBENCH) && dist < 120) {
                        this.openContainer(t, tx, ty);
                    } else {
                        // Если не на контейнере - открываем инвентарь
                        this.toggleInventory();
                    }
                }
            }
            if (e.code === 'Backquote' || e.code === 'Slash') {
                if (!this.isUiOpen()) this.toggleChat();
            }
            // V8.2: Q в открытом инвентаре — выбросить 1 предмет из hovered слота.
            if (e.code === 'KeyQ') {
                const invOpen = !document.getElementById('screen-inventory').classList.contains('hidden');
                if (invOpen) {
                    e.preventDefault();
                    this.dropFromHighlight(false);
                }
            }
            // V12: R / F — поворачивают полупрозрачное превью НОВОГО блока, который сейчас в руке.
            // Реальное вращение применяется на следующем правом клике, во время размещения.
            if ((e.code === 'KeyR' || e.code === 'KeyF') && !this.isUiOpen() && gameRunning) {
                const delta = (e.code === 'KeyR') ? 1 : 3; // R=CW, F=CCW (3 = -1 mod 4)
                pendingRotation = (pendingRotation + delta) % 4;
                game.audio.playSound('place');
            }
            if (e.code === 'Escape') {
                // Escape в паузе — закрыть паузу. Если открыт другой UI — закрыть его.
                if (this.isPauseOpen()) this.togglePause();
                else if (this.isUiOpen()) this.closeAllUi();
                else this.togglePause();
            }
            if (e.code === 'F3') document.getElementById('debug-overlay').classList.toggle('hidden');
            this.updateHUD();
        });
        window.addEventListener('keyup', e => keys[e.code] = false);
        window.addEventListener('blur', () => keys = {}); // Safety: clear keys on lost focus

        window.addEventListener('wheel', e => {
            // 1. Если открыт интерфейс (инвентарь) - НЕ блокируем стандартное поведение.
            // Это позволит списку рецептов прокручиваться силами браузера.
            if (this.isUiOpen()) return;

            // 2. Если мы в игре - блокируем скролл страницы и меняем оружие
            e.preventDefault();

            // Логика смены предмета в руках
            if (e.deltaY > 0) player.inv.selected = (player.inv.selected + 1) % 9;
            else player.inv.selected = (player.inv.selected - 1 + 9) % 9;

            this.updateHUD();
        }, { passive: false });

        canvas.addEventListener('mousemove', e => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });
        canvas.addEventListener('mousedown', e => {
            mouse.down = true;
            mouse.right = e.button === 2;
        });
        canvas.addEventListener('mouseup', e => {
            // V16: Fire the bow on RMB release if it was being drawn.
            if (e.button === 2 && player && player.bowDrawTime > 0) {
                const sel = player.inv.getSelected();
                if (sel && sel.id === ITEMS.BOW && player.inv.has(ITEMS.ARROW, 1)) {
                    const t = Math.min(60, player.bowDrawTime);
                    const pct = t / 60;
                    // Vanilla MC arrow damage scales with power: full draw ≈ 9 dmg.
                    let dmg;
                    if (pct < 0.3) dmg = 1;
                    else if (pct < 0.6) dmg = 3;
                    else if (pct < 0.95) dmg = 6;
                    else dmg = 9;
                    const _ez = (typeof getEffectiveZoom === 'function') ? getEffectiveZoom() : 1;
                    const wMx = (mouse.x / _ez) + camX;
                    const wMy = (mouse.y / _ez) + camY;
                    const sx = player.x + player.w / 2;
                    const sy = player.y + 16;
                    const dx = wMx - sx;
                    const dy = wMy - sy;
                    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                    const speed = 6 + pct * 14;
                    const vx = (dx / len) * speed;
                    const vy = (dy / len) * speed;
                    arrows.push(new Arrow(sx, sy, vx, vy, true, dmg));
                    player.inv.remove(ITEMS.ARROW, 1);
                    // Bow durability tick when actually firing.
                    if (sel.dur !== undefined) {
                        sel.dur--;
                        if (sel.dur <= 0) player.inv.remove(ITEMS.BOW, 1);
                    }
                    if (game && game.audio) game.audio.playSound('mob_hit', sx);
                    game.updateHUD();
                }
                player.bowDrawTime = 0;
            }
            mouse.down = false;
            breakProgress = 0;
            // V11: сбросить прогресс питья, если ПКМ отпустили до завершения глотка
            if (typeof game !== 'undefined' && game) game.drinkProgress = 0;
        });
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        document.getElementById('btn-start').onclick = () => {
            this.audio.playSound('button_click');
            const fade = document.createElement('div');
            fade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.4s ease;';
            document.getElementById('game-container').appendChild(fade);
            requestAnimationFrame(() => { fade.style.opacity = '1'; });
            setTimeout(() => {
                this.reset();
                this.startGame();
                fade.style.transition = 'opacity 1.2s ease';
                fade.style.opacity = '0';
                setTimeout(() => fade.remove(), 1300);
            }, 450);
        };
        document.getElementById('btn-load').onclick = () => {
            this.audio.playSound('button_click');
            if (!this.load()) return;
            const fade = document.createElement('div');
            fade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.4s ease;';
            document.getElementById('game-container').appendChild(fade);
            requestAnimationFrame(() => { fade.style.opacity = '1'; });
            setTimeout(() => {
                this.startGame();
                fade.style.transition = 'opacity 1.2s ease';
                fade.style.opacity = '0';
                setTimeout(() => fade.remove(), 1300);
            }, 450);
        };

        // --- Worlds system buttons ---
        const btnSp = document.getElementById('btn-singleplayer');
        if (btnSp) btnSp.onclick = () => { this.audio.playSound('button_click'); this.openWorldsScreen(); };

        const btnWorldsBack = document.getElementById('btn-worlds-back');
        if (btnWorldsBack) btnWorldsBack.onclick = () => {
            this.audio.playSound('button_click');
            document.getElementById('screen-worlds').classList.add('hidden');
            document.getElementById('screen-start').classList.remove('hidden');
        };
        const btnWorldCreate = document.getElementById('btn-world-create');
        if (btnWorldCreate) btnWorldCreate.onclick = () => {
            this.audio.playSound('button_click');
            document.getElementById('screen-worlds').classList.add('hidden');
            document.getElementById('screen-world-create').classList.remove('hidden');
            // reset form
            document.getElementById('wc-name').value = '';
            document.getElementById('wc-seed').value = '';
            document.getElementById('wc-difficulty').value = 'normal';
            document.getElementById('wc-cheats').checked = false;
        };
        const btnWcBack = document.getElementById('btn-wc-back');
        if (btnWcBack) btnWcBack.onclick = () => {
            this.audio.playSound('button_click');
            document.getElementById('screen-world-create').classList.add('hidden');
            document.getElementById('screen-worlds').classList.remove('hidden');
        };
        const btnWcCreate = document.getElementById('btn-wc-create');
        if (btnWcCreate) btnWcCreate.onclick = () => {
            this.audio.playSound('button_click');
            const name = (document.getElementById('wc-name').value || '').trim() || 'World';
            const seedRaw = (document.getElementById('wc-seed').value || '').trim();
            let seed = null;
            if (seedRaw.length > 0) {
                const n = parseInt(seedRaw);
                seed = isNaN(n) ? hashStringToSeed(seedRaw) : n;
            }
            const difficulty = document.getElementById('wc-difficulty').value;
            const cheats = document.getElementById('wc-cheats').checked;
            const meta = WorldManager.create({ name, seed, difficulty, cheats });
            this.startNewWorld(meta);
        };
        document.getElementById('btn-resume').onclick = () => { this.audio.playSound('button_click'); this.togglePause(); };
        document.getElementById('btn-save').onclick = () => { this.audio.playSound('button_click'); this.save(); alert('Game Saved'); };
        document.getElementById('btn-achievements-menu').onclick = () => { this.audio.playSound('button_click'); this.showAchievements(); };
        document.getElementById('btn-achievements-pause').onclick = () => { this.audio.playSound('button_click'); this.showAchievements(); };
        document.getElementById('btn-story').onclick = () => { this.audio.playSound('button_click'); document.getElementById('screen-story').classList.remove('hidden'); };
        document.getElementById('btn-help').onclick = () => { this.audio.playSound('button_click'); document.getElementById('screen-help').classList.remove('hidden'); };

        // V4: пагинация команд в Commands Encyclopedia
        this.setupCommandsUI();
        document.getElementById('btn-settings-menu').onclick = () => { this.audio.playSound('button_click'); this.openSettings(); };
        document.getElementById('btn-settings-pause').onclick = () => { this.audio.playSound('button_click'); this.openSettings(); };
        document.getElementById('btn-settings-close').onclick = () => { this.audio.playSound('button_click'); document.getElementById('screen-settings').classList.add('hidden'); };

        document.getElementById('btn-menu').onclick = () => { this.audio.playSound('button_click'); this.save(); location.reload(); };
        document.getElementById('btn-respawn').onclick = () => {
            // Beta 1.0: if the player died in the Nether, swap back to the
            // overworld snapshot before placing them at spawn. Otherwise
            // world.spawnX/Y are overworld coordinates and we'd respawn inside
            // a netherrack column.
            if (this.inNether && this.overworldSnapshot) {
                this.netherSnapshot = (w => ({
                    tiles: w.tiles, tilesBg: w.tilesBg, tilesFg: w.tilesFg,
                    blockMeta: w.blockMeta, furnaces: w.furnaces, chests: w.chests, crops: w.crops,
                    waterSources: w.waterSources, lavaSources: w.lavaSources,
                    fires: w.fires, fireAge: w.fireAge, liquidQueue: w.liquidQueue,
                    biomeMap: w.biomeMap, tempMap: w.tempMap, humMap: w.humMap,
                    bgObjects: w.bgObjects,
                    playerX: player.x, playerY: player.y,
                    enemies, passives,
                }))(world);
                restoreSnapshot(world, this.overworldSnapshot);
                this.inNether = false;
                pigmen = []; ghasts = []; fireballs = [];
                enemies = this.overworldSnapshot.enemies || [];
                passives = this.overworldSnapshot.passives || [];
                arrows = []; pearls = [];
                world.lightmapDirty = true;
            }
            player.hp = player.maxHp; player.x = world.spawnX; player.y = world.spawnY;
            player.vx = 0; player.vy = 0; player.dead = false; player.hurtTimer = 0;
            // Reset fall tracking so the spawn position doesn't trigger fall damage.
            player.fallStartY = player.y;
            // V7 fix: сбрасываем жидкостные статусы, иначе игрок сгорает сразу после возрождения
            player.burnTimer = 0;
            player.lavaDamageTimer = 0;
            player.inWater = false;
            player.inLava = false;
            player.portalTimer = 0;
            player.portalCooldown = 60;
            document.getElementById('screen-gameover').classList.add('hidden');
            gameRunning = true; requestLoop();
        };

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.onclick = () => {
                this.audio.playSound('button_click');
                if (confirm('Current progress is not saved. Are you sure you want to return to the main menu?')) {
                    location.reload();
                }
            };
        }

        // V8.2: кнопки «Drop Item» и «Drop All»
        const btnDropOne = document.getElementById('btn-drop-one');
        const btnDropAll = document.getElementById('btn-drop-all');
        if (btnDropOne) btnDropOne.onclick = () => { this.audio.playSound('button_click'); this.dropFromHighlight(false); };
        if (btnDropAll) btnDropAll.onclick = () => { this.audio.playSound('button_click'); this.dropFromHighlight(true); };
        // Кнопки сортировки
        const btnSortStack = document.getElementById('btn-sort-stack');
        const btnSortType  = document.getElementById('btn-sort-type');
        if (btnSortStack) btnSortStack.onclick = () => { this.audio.playSound('button_click'); this.sortInventory('stack'); };
        if (btnSortType)  btnSortType.onclick  = () => { this.audio.playSound('button_click'); this.sortInventory('type');  };
        document.getElementById('chk-sound').onchange = (e) => {
            this.audio.enabled = e.target.checked;
            // V13: pause/resume HTMLAudioElement-based tracks too.
            if (!this.audio.enabled) {
                if (this.audio.currentMusicElement) {
                    try { this.audio.currentMusicElement.pause(); } catch (er) { }
                }
                for (const k in this.audio.activeDiscs) {
                    try { this.audio.activeDiscs[k].audio.pause(); } catch (er) { }
                }
            } else {
                if (this.audio.currentMusicElement) {
                    this.audio.currentMusicElement.play().catch(() => { });
                }
                for (const k in this.audio.activeDiscs) {
                    this.audio.activeDiscs[k].audio.play().catch(() => { });
                }
            }
        };

        const updateVignette = (e) => {
            ENABLE_VIGNETTE = e.target.checked;
            document.getElementById('chk-vignette-settings').checked = ENABLE_VIGNETTE;
            const pauseChk = document.getElementById('chk-vignette-pause');
            if (pauseChk) pauseChk.checked = ENABLE_VIGNETTE;
        };
        document.getElementById('chk-vignette-settings').onchange = updateVignette;
        const pauseChk = document.getElementById('chk-vignette-pause');
        if (pauseChk) pauseChk.onchange = updateVignette;

        // Settings sliders
        const cloudSlider = document.getElementById('cloud-height-slider');
        if (cloudSlider) {
            cloudSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                CLOUD_HEIGHT = val;
                document.getElementById('cloud-height-value').innerText = val;
                if (typeof world !== 'undefined' && world) {
                    world._cloudsSorted = false;
                    world.generateClouds();
                }
            };
        }

        document.getElementById('sound-volume').oninput = (e) => {
            const val = parseInt(e.target.value);
            this.audio.soundVolume = val / 100;
            document.getElementById('sound-volume-value').innerText = val + '%';
        };

        document.getElementById('music-volume').oninput = (e) => {
            const val = parseInt(e.target.value);
            this.audio.musicVolume = val / 100;
            // V13: also scale the music bus so HTMLAudioElement-based tracks
            // (menu/gameplay .ogg + jukebox discs) respect the slider too.
            if (this.audio.musicBus) {
                this.audio.musicBus.gain.value = 0.6 * this.audio.musicVolume;
            }
            // For local file playback bypass where MediaElementSource is null
            if (this.audio.currentMusicElement && !this.audio.currentMusicSource) {
                this.audio.currentMusicElement.volume = 0.6 * this.audio.musicVolume;
            }
            document.getElementById('music-volume-value').innerText = val + '%';
        };

        document.getElementById('zoom-slider').oninput = (e) => {
            const val = parseFloat(e.target.value);
            ZOOM = val;
            document.getElementById('zoom-value').innerText = val + 'x';
        };

        document.getElementById('difficulty-slider').oninput = (e) => {
            const val = parseInt(e.target.value);
            this.difficulty = val;
            const diffNames = ['Peaceful', 'Easy', 'Normal', 'Hard'];
            document.getElementById('difficulty-value').innerText = diffNames[val];
            if (val === 0 && typeof enemies !== 'undefined') {
                enemies.length = 0; // Clear enemies on peaceful
            }
        };

        // V14: Hover sound on main-menu buttons (Minecraft-like tick on focus).
        const menuRoot = document.getElementById('screen-start');
        if (menuRoot) {
            menuRoot.addEventListener('mouseover', (e) => {
                const btn = e.target.closest('button');
                if (!btn || btn.disabled || btn.classList.contains('hidden')) return;
                if (this._lastHoverBtn === btn) return;
                this._lastHoverBtn = btn;
                this.audio.playSound('button_hover');
            });
            menuRoot.addEventListener('mouseout', (e) => {
                const btn = e.target.closest('button');
                if (btn && this._lastHoverBtn === btn) this._lastHoverBtn = null;
            });
        }
    },

    // --- Multi-world UI ---
    openWorldsScreen() {
        document.getElementById('screen-start').classList.add('hidden');
        document.getElementById('screen-worlds').classList.remove('hidden');
        this.renderWorldsList();
    },

    renderWorldsList() {
        const container = document.getElementById('worlds-list');
        if (!container) return;
        const worlds = WorldManager.list().sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
        if (!worlds.length) {
            container.innerHTML = '<div class="empty-list">No worlds yet. Click "Create New World" to start.</div>';
            return;
        }
        container.innerHTML = worlds.map(w => `
            <div class="world-row" data-id="${escapeHtml(w.id)}">
                <div class="world-info">
                    <div class="world-name">${escapeHtml(w.name)}</div>
                    <div class="world-meta">Day ${w.day || 1} · ${capitalize(w.difficulty || 'normal')} · Seed ${w.seed} · ${formatRelativeTime(w.lastPlayedAt)}${w.cheats ? ' · <span style="color:#ffd54f">cheats</span>' : ''}</div>
                </div>
                <div class="world-actions">
                    <button class="btn-play"   data-id="${escapeHtml(w.id)}">Play</button>
                    <button class="btn-rename" data-id="${escapeHtml(w.id)}">Rename</button>
                    <button class="btn-delete" data-id="${escapeHtml(w.id)}">Delete</button>
                </div>
            </div>`).join('');

        container.querySelectorAll('.btn-play').forEach(b => {
            b.onclick = () => { this.audio.playSound('button_click'); this.playWorld(b.dataset.id); };
        });
        container.querySelectorAll('.btn-rename').forEach(b => {
            b.onclick = () => {
                const newName = prompt('New name:');
                if (newName && newName.trim().length > 0) {
                    WorldManager.rename(b.dataset.id, newName.trim().slice(0, 32));
                    this.renderWorldsList();
                }
            };
        });
        container.querySelectorAll('.btn-delete').forEach(b => {
            b.onclick = () => {
                if (confirm('Delete this world? This cannot be undone.')) {
                    WorldManager.delete(b.dataset.id);
                    this.renderWorldsList();
                }
            };
        });
    },

    playWorld(id) {
        if (!this.load(id)) { alert('Failed to load world.'); return; }
        document.getElementById('screen-worlds').classList.add('hidden');
        document.getElementById('screen-start').classList.add('hidden');
        const fade = document.createElement('div');
        fade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.4s ease;';
        document.getElementById('game-container').appendChild(fade);
        requestAnimationFrame(() => { fade.style.opacity = '1'; });
        setTimeout(() => {
            this.startGame();
            fade.style.transition = 'opacity 1.2s ease';
            fade.style.opacity = '0';
            setTimeout(() => fade.remove(), 1300);
        }, 450);
    },

    startNewWorld(meta) {
        this.currentWorldId = meta.id;
        this.cheatsEnabled = !!meta.cheats;
        this.difficulty = meta.difficulty || 'normal';
        activeBuildLayer = LAYER.MID;

        document.getElementById('screen-world-create').classList.add('hidden');
        document.getElementById('screen-worlds').classList.add('hidden');
        document.getElementById('screen-start').classList.add('hidden');

        // Передаём seed через скрытый seed-input — reset() читает его оттуда.
        const seedInput = document.getElementById('seed-input');
        if (seedInput) seedInput.value = String(meta.seed);

        const fade = document.createElement('div');
        fade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.4s ease;';
        document.getElementById('game-container').appendChild(fade);
        requestAnimationFrame(() => { fade.style.opacity = '1'; });
        setTimeout(() => {
            this.reset();
            this.applyDifficultyToPlayer();
            this.startGame();
            // Сразу делаем первый сейв — чтобы мир материализовался в localStorage.
            try { this.save(); } catch (e) { }
            fade.style.transition = 'opacity 1.2s ease';
            fade.style.opacity = '0';
            setTimeout(() => fade.remove(), 1300);
        }, 450);
    },

    openSettings() {
        // Initialize slider values to current settings
        const soundVol = Math.round(this.audio.soundVolume * 100);
        const musicVol = Math.round(this.audio.musicVolume * 100);

        const cloudSlider = document.getElementById('cloud-height-slider');
        if (cloudSlider) {
            cloudSlider.value = CLOUD_HEIGHT;
            document.getElementById('cloud-height-value').innerText = CLOUD_HEIGHT;
        }

        document.getElementById('sound-volume').value = soundVol;
        document.getElementById('sound-volume-value').innerText = soundVol + '%';

        document.getElementById('music-volume').value = musicVol;
        document.getElementById('music-volume-value').innerText = musicVol + '%';

        document.getElementById('zoom-slider').value = ZOOM;
        document.getElementById('zoom-value').innerText = ZOOM + 'x';

        document.getElementById('difficulty-slider').value = this.difficulty;
        const diffNames = ['Peaceful', 'Easy', 'Normal', 'Hard'];
        document.getElementById('difficulty-value').innerText = diffNames[this.difficulty];

        document.getElementById('screen-settings').classList.remove('hidden');
    },

    startGame() {
        // Stop menu music when starting the game
        this.stopMenuMusic();

        document.getElementById('screen-start').classList.add('hidden');
        document.getElementById('ui-hud').classList.remove('hidden');
        gameRunning = true;
        // Start music shortly after interaction
        setTimeout(() => this.audio.playMusic(), 1000);
        requestLoop();
    },

    showAchievements() {
        const list = document.getElementById('ach-list-container');
        list.innerHTML = '';
        achievements.forEach(a => {
            const div = document.createElement('div');
            div.className = 'ach-item' + (achieved.has(a.id) ? ' unlocked' : '');

            const iconCvs = document.createElement('canvas');
            iconCvs.width = 32; iconCvs.height = 32;
            let iconId = ITEMS.APPLE;
            if (a.id === 'wood') iconId = B.WOOD;
            else if (a.id === 'bench') iconId = B.WORKBENCH;
            else if (a.id === 'pick') iconId = ITEMS.WOOD_PICK;
            else if (a.id === 'furnace') iconId = B.FURNACE;
            else if (a.id === 'iron') iconId = ITEMS.IRON_INGOT;
            else if (a.id === 'diamond') iconId = ITEMS.DIAMOND;
            else if (a.id === 'loot') iconId = B.CHEST;
            else if (a.id === 'slayer') iconId = ITEMS.WOOD_SWORD;
            else if (a.id === 'chef') iconId = ITEMS.BEEF_COOKED;
            // V4
            else if (a.id === 'torch') iconId = ITEMS.TORCH;
            else if (a.id === 'sleep') iconId = B.BED;
            else if (a.id === 'deep') iconId = ITEMS.COAL;
            else if (a.id === 'slayer10') iconId = ITEMS.IRON_SWORD;
            else if (a.id === 'survivor') iconId = ITEMS.WHITE_WOOL;
            else if (a.id === 'architect') iconId = B.BRICK;
            else if (a.id === 'timekeeper') iconId = ITEMS.CLOCK;
            else if (a.id === 'rich') iconId = B.DIAMOND_BLOCK;
            else if (a.id === 'sword') iconId = ITEMS.DIAMOND_SWORD;
            else if (a.id === 'miner') iconId = ITEMS.DIAMOND_PICK;
            else if (a.id === 'bread') iconId = ITEMS.BREAD;
            else if (a.id === 'apple') iconId = ITEMS.APPLE;

            drawItemIcon(iconCvs.getContext('2d'), iconId, null);

            const textDiv = document.createElement('div');
            textDiv.className = 'ach-text';
            textDiv.innerHTML = `<h4>${a.name}</h4><p>${a.desc}</p>`;

            div.appendChild(iconCvs);
            div.appendChild(textDiv);
            list.appendChild(div);
        });
        // V4: счётчик прогресса в заголовке
        const header = document.getElementById('ach-progress');
        if (header) header.innerText = `${achieved.size} / ${achievements.length} unlocked`;
        document.getElementById('screen-achievements').classList.remove('hidden');
    },

    interact() {
        const _ez3 = getEffectiveZoom();
        const worldMx = (mouse.x / _ez3) + camX;
        const worldMy = (mouse.y / _ez3) + camY;
        const tx = Math.floor(worldMx / TILE_SIZE);
        const ty = Math.floor(worldMy / TILE_SIZE);

        let t = world.getTile(tx, ty);
        if (t !== B.CHEST && t !== B.FURNACE) {
            let ptx = Math.floor((player.x + 10) / TILE_SIZE);
            let pty = Math.floor((player.y + 28) / TILE_SIZE);
            t = world.getTile(ptx, pty);
            if (t === B.CHEST || t === B.FURNACE) {
                this.openContainer(t, ptx, pty);
                return;
            }
        } else {
            this.openContainer(t, tx, ty);
        }
    },

    openContainer(id, x, y) {
        if (id === B.FURNACE) this.openFurnace(x, y);
        if (id === B.CHEST) this.openChest(x, y);
        if (id === B.WORKBENCH) this.openWorkbench(x, y);
    },

    closeAllUi() {
        // При закрытии возвращаем содержимое крафт-сеток и cursor item в инвентарь,
        // чтобы игрок не терял предметы.
        if (this._flushCursorItem) this._flushCursorItem();
        if (player && player.craft2x2) this.flushCraft2x2();
        if (player && player.craft3x3) this.flushCraft3x3();
        document.getElementById('screen-inventory').classList.add('hidden');
        document.getElementById('screen-furnace').classList.add('hidden');
        document.getElementById('screen-chest').classList.add('hidden');
        document.getElementById('screen-story').classList.add('hidden');
        document.getElementById('screen-achievements').classList.add('hidden');
        document.getElementById('screen-help').classList.add('hidden');
        document.getElementById('screen-chat').classList.add('hidden');
        document.getElementById('screen-settings').classList.add('hidden');
        const wb = document.getElementById('screen-workbench');
        if (wb) wb.classList.add('hidden');
        if (document.getElementById('screen-commands')) document.getElementById('screen-commands').classList.add('hidden');
        // HOTFIX: снять фокус с любого инпута при закрытии UI — иначе игнорируются
        // игровые клавиши (isTyping остаётся true).
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        openFurnacePos = null;
        openChestPos = null;
        openChestDoublePos = null;
        document.getElementById('drag-ghost').style.display = 'none';
    },

    toggleInventory() {
        const el = document.getElementById('screen-inventory');
        el.classList.toggle('hidden');
        if (!el.classList.contains('hidden')) {
            invHighlight = player.inv.selected;
            this.renderInventory();
            this._startCreeperLoop();
        } else {
            this._flushCursorItem();
            this.flushCraft2x2();
            document.getElementById('drag-ghost').style.display = 'none';
        }
    },

    openWorkbench(x, y) {
        document.getElementById('screen-workbench').classList.remove('hidden');
        invHighlight = player.inv.selected;
        this.renderWorkbench();
    },

    renderWorkbench() {
        this._ensureDnDBound();
        const grid3 = document.getElementById('craft3x3-grid');
        const out   = document.getElementById('craft3x3-out');
        const inv   = document.getElementById('workbench-inv');
        const hot   = document.getElementById('workbench-hotbar');
        if (!grid3 || !out || !inv || !hot) return;
        grid3.innerHTML = '';
        inv.innerHTML = '';
        hot.innerHTML = '';

        const makeInvSlot = (i) => {
            const s = player.inv.slots[i];
            const div = document.createElement('div');
            div.className = 'slot' + (i === player.inv.selected ? ' selected' : '');
            div.dataset.slot = 'inv:' + i;
            if (s) {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), s.id, s.dur);
                div.appendChild(cvs);
                const sp = document.createElement('span');
                sp.className = 'count';
                sp.innerText = (MAX_DUR[s.id]) ? '' : s.count;
                div.appendChild(sp);
            }
            div.onmouseenter = () => this.updateItemDesc(s);
            div.onmouseleave = () => this.updateItemDesc(null);
            return div;
        };
        for (let i = 9; i < 36; i++) inv.appendChild(makeInvSlot(i));
        for (let i = 0; i < 9; i++)  hot.appendChild(makeInvSlot(i));

        for (let i = 0; i < 9; i++) {
            const it = player.craft3x3[i];
            const div = document.createElement('div');
            div.className = 'slot';
            div.dataset.slot = 'c3:' + i;
            if (it) {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), it.id, it.dur);
                div.appendChild(cvs);
                const sp = document.createElement('span');
                sp.className = 'count';
                sp.innerText = (MAX_DUR[it.id]) ? '' : it.count;
                div.appendChild(sp);
            }
            div.onmouseenter = () => this.updateItemDesc(it);
            div.onmouseleave = () => this.updateItemDesc(null);
            grid3.appendChild(div);
        }

        out.innerHTML = '';
        out.dataset.slot = 'c3-out';
        const result = this._currentCraftResult(true);
        out.classList.toggle('has-result', !!result);
        const stage3 = document.getElementById('craft3x3-stage');
        if (stage3) stage3.classList.toggle('has-result', !!result);
        if (result) {
            const cvs = document.createElement('canvas');
            cvs.width = 36; cvs.height = 36;
            drawItemIcon(cvs.getContext('2d'), result.id);
            out.appendChild(cvs);
            if (result.n > 1) {
                const sp = document.createElement('span');
                sp.className = 'count';
                sp.innerText = result.n;
                out.appendChild(sp);
            }
            out.onmouseenter = () => this.updateItemDesc({ id: result.id, count: result.n });
        } else {
            out.onmouseenter = null;
        }
        out.onmouseleave = () => this.updateItemDesc(null);
        
        this.renderCraftList();
    },

    openFurnace(x, y) {
        const key = `${x},${y}`;
        if (!world.furnaces[key]) world.furnaces[key] = { input: null, fuel: null, output: null, burn: 0, maxBurn: 0, cook: 0 };
        openFurnacePos = key;
        document.getElementById('screen-furnace').classList.remove('hidden');
        this.renderFurnace();
    },

    renderFurnace() {
        if (!openFurnacePos) return;
        const f = world.furnaces[openFurnacePos];
        this._ensureDnDBound();

        const slots = {
            'furnace:in': f.input,
            'furnace:fuel': f.fuel,
            'furnace:out': f.output
        };

        for (const [key, item] of Object.entries(slots)) {
            const el = document.querySelector(`.furnace-slot[data-slot="${key}"]`);
            if (!el) continue;
            el.innerHTML = '';
            if (item) {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), item.id, item.dur);
                el.appendChild(cvs);
                if (!MAX_DUR[item.id]) {
                    const sp = document.createElement('span');
                    sp.className = 'count';
                    sp.innerText = item.count;
                    el.appendChild(sp);
                }
            }
        }
        
        // Progress bars
        const burnBar = document.getElementById('furnace-burn-bar');
        if (burnBar) burnBar.style.width = (f.maxBurn ? (f.burn / f.maxBurn * 100) : 0) + '%';
        const cookBar = document.getElementById('furnace-cook-bar');
        if (cookBar) cookBar.style.width = (f.cook / 200 * 100) + '%';
    },

    openChest(x, y) {
        const key = `${x},${y}`;
        if (!world.chests[key]) world.chests[key] = new Array(27).fill(null);

        openChestDoublePos = null;
        if (world.getTile(x - 1, y) === B.CHEST) openChestDoublePos = `${x - 1},${y}`;
        else if (world.getTile(x + 1, y) === B.CHEST) openChestDoublePos = `${x + 1},${y}`;

        if (openChestDoublePos && !world.chests[openChestDoublePos]) {
            world.chests[openChestDoublePos] = new Array(27).fill(null);
        }

        openChestPos = key;
        // V4: динамический заголовок — если рядом есть второй сундук, показываем "LARGE CHEST",
        // иначе просто "CHEST" (как в Minecraft).
        const titleEl = document.getElementById('chest-title');
        if (titleEl) titleEl.innerText = openChestDoublePos ? 'LARGE CHEST' : 'CHEST';
        if (!achieved.has('loot')) { achieved.add('loot'); game.showToast('Achievement: Treasure Hunter'); }
        document.getElementById('screen-chest').classList.remove('hidden');
        this.renderChest();
    },

    renderChest() {
        if (!openChestPos) return;
        const chest1 = world.chests[openChestPos];
        const chest2 = openChestDoublePos ? world.chests[openChestDoublePos] : null;
        this._ensureDnDBound();

        const getChestItem = (i) => i < 27 ? chest1[i] : chest2[i - 27];

        const renderGrid = (elId, isPlayer) => {
            const grid = document.getElementById(elId);
            grid.innerHTML = '';
            const maxSlots = isPlayer ? player.inv.capacity : (chest2 ? 54 : 27);

            for (let i = 0; i < maxSlots; i++) {
                const s = isPlayer ? player.inv.slots[i] : getChestItem(i);
                const div = document.createElement('div');
                div.className = 'slot';
                div.dataset.slot = isPlayer ? ('inv:' + i) : ('chest:' + i);

                if (s) {
                    const cvs = document.createElement('canvas');
                    cvs.width = 32; cvs.height = 32;
                    drawItemIcon(cvs.getContext('2d'), s.id, s.dur);
                    div.appendChild(cvs);
                    const sp = document.createElement('span');
                    sp.className = 'count';
                    sp.innerText = (MAX_DUR[s.id]) ? '' : s.count;
                    div.appendChild(sp);
                }
                grid.appendChild(div);
            }
        };

        renderGrid('chest-grid', false);
        renderGrid('chest-inv', true);
    },

    togglePause() {
        const pScreen = document.getElementById('screen-pause');
        if (!gameRunning && pScreen.classList.contains('hidden')) return;

        if (!gameRunning) {
            pScreen.classList.add('hidden');
            gameRunning = true;
            requestLoop();
        } else {
            gameRunning = false;
            pScreen.classList.remove('hidden');
        }
    },

    damagePlayer(amt, force = false) {
        // `force=true` is used by explosive damage (TNT, Creeper) where i-frames
        // should NOT save the player — otherwise a lethal blast can silently
        // empty the hearts without ever triggering the game-over screen.
        if (player.dead || player.invincible || player.flying) return;
        if (!force && player.hurtTimer > 0) return;
        // Множитель сложности: easy ×0.5, normal ×1.0, hard ×1.5.
        const scaled = Math.max(1, Math.round(amt * this.difficultyDamageMul()));

        // Защита бронёй: каждый пункт защиты снижает урон на 4% (как в Minecraft).
        // 20 пунктов = 80% снижения. Округляем вверх, но не меньше 1 при урон >0.
        const armorPts = this.getPlayerArmorPoints();
        let finalDmg = scaled;
        if (armorPts > 0) {
            const reduction = Math.min(20, armorPts) * 0.04;
            finalDmg = Math.max(1, Math.ceil(scaled * (1 - reduction)));
            // Изнашиваем каждую надетую часть на 1 пункт прочности.
            // Сломанная (dur<=0) — снимается из слота.
            for (const slot of ['head', 'chest', 'legs']) {
                const it = player.armor[slot];
                if (!it || !MAX_DUR[it.id]) continue;
                it.dur = (it.dur != null ? it.dur : MAX_DUR[it.id]) - 1;
                if (it.dur <= 0) {
                    player.armor[slot] = null;
                    if (this.audio) this.audio.playSound('break');
                    this.addChatMessage(`${getItemName(it.id)} broke!`);
                }
            }
        }

        player.hp -= finalDmg;
        player.hurtTimer = 10;
        this.audio.playSound('hurt');
        // VFX: screen shake и кровь
        this.screenShake = Math.max(this.screenShake, 3 + amt * 0.8);
        VFX.hit(player.x + player.w / 2, player.y + player.h / 2, '#c62828');
        this.updateHUD();
        // Если открыт инвентарь — обновить отображение брони (на случай поломки).
        const invScreen = document.getElementById('screen-inventory');
        if (invScreen && !invScreen.classList.contains('hidden')) {
            this.renderArmor();
        }
        if (player.hp <= 0) {
            player.die();
            this.screenShake = 12;
            VFX.death(player.x + player.w / 2, player.y + player.h / 2, '#c62828');
            this.closeAllUi();
            gameRunning = false;
            // Показываем статистику
            document.getElementById('go-days').innerText = day;
            document.getElementById('go-score').innerText = totalScore;
            document.getElementById('go-kills').innerText = stats.kills;
            document.getElementById('go-blocks').innerText = stats.mined;
            document.getElementById('screen-gameover').classList.remove('hidden');
        }
    },

    checkAchievements() {
        achievements.forEach(a => {
            if (!achieved.has(a.id) && a.check()) {
                achieved.add(a.id);
                this.audio.playSound('achieve');
                this.showToast(`Achievement: ${a.name}`);
            }
        });
    },

    // List of every chat command (and their first-argument hints) for
    // Minecraft-style ghost-text autocomplete.
    _commandSpecs: [
        { cmd: '/tp', hint: '<x> <y>' },
        { cmd: '/teleport', hint: '<x> <y>' },
        { cmd: '/give', hint: '<item> [count]' },
        { cmd: '/kill', hint: 'mobs|enemies' },
        { cmd: '/home', hint: '' },
        { cmd: '/summon', hint: 'zombie|spider|skeleton|enderman|pig|cow|sheep' },
        { cmd: '/clear', hint: '' },
        { cmd: '/noclip', hint: '' },
        { cmd: '/difficulty', hint: '<0-3>' },
        { cmd: '/speed', hint: '<n>' },
        { cmd: '/mining', hint: '<n>' },
        { cmd: '/layer', hint: 'bg|mid|fg' },
        { cmd: '/jump', hint: '<n>' },
        { cmd: '/time', hint: 'day|night' },
        { cmd: '/heal', hint: '' },
        { cmd: '/invincible', hint: '<true|false>' },
        { cmd: '/help', hint: '' },
    ],

    // Returns the best matching command for the current input, or null.
    findBestCommand(text) {
        if (!text || !text.startsWith('/')) return null;
        const parts = text.split(' ');
        const head = parts[0].toLowerCase();
        // Exact match -> show its hint only
        const exact = this._commandSpecs.find(s => s.cmd === head);
        if (exact) return exact;
        // Prefix match -> first command that starts with what we typed
        return this._commandSpecs.find(s => s.cmd.startsWith(head)) || null;
    },

    // Apply the autocomplete (called on Tab).
    autocompleteChat(text) {
        const m = this.findBestCommand(text);
        if (!m) return null;
        const parts = text.split(' ');
        if (parts.length === 1) {
            // Replace head with the full command name, leave a trailing space if it has args.
            return m.cmd + (m.hint ? ' ' : '');
        }
        return null;
    },

    // Render the grey ghost suggestion behind the chat input.
    updateChatSuggestion(text) {
        const sug = document.getElementById('chat-suggest');
        if (!sug) return;
        if (!text || !text.startsWith('/')) {
            sug.innerText = '';
            return;
        }
        const m = this.findBestCommand(text);
        if (!m) {
            sug.innerText = '';
            return;
        }
        const parts = text.split(' ');
        const head = parts[0].toLowerCase();
        if (parts.length === 1) {
            // Show: <typed><rest-of-command><hint>
            if (m.cmd === head) {
                // exact head — just show the hint after a space
                sug.innerText = text + (m.hint ? ' ' + m.hint : '');
            } else {
                // typed a prefix — show the completion in grey
                sug.innerText = text + m.cmd.slice(text.length) + (m.hint ? ' ' + m.hint : '');
            }
        } else {
            // Typed past the command name — only show remaining hint tokens.
            sug.innerText = text + (text.endsWith(' ') ? '' : ' ') + (m.hint || '');
        }
    },

    addChatMessage(msg) {
        const hist = document.getElementById('chat-history-area');
        if (!hist) return;
        const p = document.createElement('div');
        p.className = 'chat-line';
        p.style.cssText = 'background: rgba(0,0,0,0.55); color: #fff; text-shadow: 1px 1px 0 #000;' +
                          'font-family: VT323, monospace; font-size: 18px;' +
                          'padding: 2px 8px; transition: opacity 0.9s ease; opacity: 1;' +
                          'border-left: 3px solid rgba(255,255,255,0.18);';
        p.innerText = msg;
        hist.appendChild(p);
        while (hist.children.length > 30) hist.removeChild(hist.firstChild);

        // While chat is open, all messages stay solid. When closed, each line
        // is visible for ~7s then fades out (Minecraft default behavior).
        const HIDE_AFTER = 7000;
        const FADE_AFTER = 8000;
        setTimeout(() => {
            if (!p.parentNode) return;
            const chatOpen = !document.getElementById('screen-chat').classList.contains('hidden');
            if (chatOpen) return; // keep visible while user is typing
            p.style.opacity = '0';
        }, HIDE_AFTER);
        setTimeout(() => { if (p.parentNode) p.remove(); }, FADE_AFTER);
    },

    // V4: системные сообщения (команды, /give, etc) идут ТОЛЬКО в чат.
    sysMessage(msg) {
        this.addChatMessage(msg);
    },

    // Красное предупреждение «не можешь поставить блок выше лимита постройки»
    // (как в Minecraft, всплывает прямо над хотбаром).
    showBuildLimitWarning() {
        const el = document.getElementById('hud-build-warning');
        if (!el) return;
        el.innerText = `You cannot place a block above the build limit (Y=${BUILD_LIMIT_TY})`;
        el.classList.add('visible');
        clearTimeout(this._buildWarnTimer);
        this._buildWarnTimer = setTimeout(() => el.classList.remove('visible'), 2000);
    },

    showToast(msg) {
        // V4: showToast is for achievements only (toast + chat echo).
        // Commands use sysMessage (chat only).
        this.addChatMessage(msg);
        const area = document.getElementById('toast-area');
        if (!area) return;
        const div = document.createElement('div');
        div.className = 'toast';

        // Strip the "Achievement: " prefix if present, since we render that as a sub-header.
        let title = msg;
        let sub = 'ADVANCEMENT MADE!';
        const m = msg.match(/^Achievement:\s*(.+)$/i);
        if (m) { title = m[1]; sub = 'ADVANCEMENT MADE!'; }

        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.innerText = '★';

        const txt = document.createElement('div');
        txt.className = 'toast-text';
        const subEl = document.createElement('span');
        subEl.className = 'toast-sub';
        subEl.innerText = sub;
        
        const ttlEl = document.createElement('span');
        ttlEl.className = 'toast-title';
        ttlEl.innerText = title;
        txt.appendChild(subEl);
        txt.appendChild(ttlEl);

        div.appendChild(icon);
        div.appendChild(txt);
        area.appendChild(div);
        setTimeout(() => { if (div.parentNode) div.remove(); }, 4000);
    },

    // --- RENDER UI ---

    // V8.3: определить тип предмета для Minecraft-стиль тултипа.
    // Возвращает { label, cls } либо null для пустой ячейки.
    _getItemType(id) {
        if (typeof BLOCKS !== 'undefined' && BLOCKS[id]) {
            return { label: 'Block', cls: 'item-type-block' };
        }
        if (MAX_DUR[id]) {
            // Ищем имя константы по значению — дешевле, чем таскать отдельный словарь типов.
            const key = Object.keys(ITEMS).find(k => ITEMS[k] === id) || '';
            if (key.includes('SWORD')) return { label: 'Weapon', cls: 'item-type-weapon' };
            if (key.includes('SHEARS')) return { label: 'Tool', cls: 'item-type-tool' };
            return { label: 'Tool', cls: 'item-type-tool' };
        }
        const foodIds = [
            ITEMS.APPLE, ITEMS.BREAD,
            ITEMS.PORK_RAW, ITEMS.PORK_COOKED,
            ITEMS.BEEF_RAW, ITEMS.BEEF_COOKED,
            ITEMS.MUTTON_RAW, ITEMS.MUTTON_COOKED,
        ].filter(x => x !== undefined);
        if (foodIds.includes(id)) {
            return { label: 'Food', cls: 'item-type-food' };
        }
        return { label: 'Material', cls: 'item-type-material' };
    },

    updateItemDesc(item) {
        const dIcon = document.getElementById('inv-detail-icon');
        const dText = document.getElementById('inv-detail-text');
        const dContainer = document.getElementById('inv-details');

        dIcon.innerHTML = '';
        if (item) {
            if (dContainer) dContainer.style.display = 'flex';
            const cvs = document.createElement('canvas');
            cvs.width = 64; cvs.height = 64;
            const c = cvs.getContext('2d');
            c.imageSmoothingEnabled = false;
            c.scale(2, 2);
            drawItemIcon(c, item.id);
            dIcon.appendChild(cvs);

            const meta = ITEM_DESC[item.id] || { desc: 'Unknown item.', funny: '' };
            const type = this._getItemType(item.id);
            const typeTag = type
                ? `<span class="item-type-tag ${type.cls}">${type.label}</span>`
                : '';

            let durHtml = '';
            if (item.dur !== undefined && MAX_DUR[item.id]) {
                const max = MAX_DUR[item.id];
                const ratio = Math.max(0, Math.min(1, item.dur / max));
                // Цвет полосы — зелёный → жёлтый → красный по остатку прочности.
                const hue = Math.round(120 * ratio);
                durHtml = `<span class="item-durability">Durability: ${item.dur}/${max}
                    <span class="item-durability-bar">
                        <span class="item-durability-bar-fill"
                              style="width:${(ratio * 100).toFixed(1)}%; background:hsl(${hue}, 70%, 45%);"></span>
                    </span></span>`;
            }

            const funnyHtml = meta.funny
                ? `<span class="item-desc-funny">${meta.funny}</span>`
                : '';

            dText.innerHTML =
                `<h3>${typeTag}${getItemName(item.id)}</h3>` +
                `<p>${meta.desc}${funnyHtml}${durHtml}</p>`;
        } else {
            dText.innerHTML = `<h3>Empty</h3><p>Select an item.</p>`;
            const dContainer = document.getElementById('inv-details');
            if (dContainer) dContainer.style.display = 'none';
        }
        // V8.2: синхронизируем состояние кнопок выброса при каждом обновлении описания
        this.updateDropButtons(item);
    },

    // V8.2: Активность кнопок Drop / Drop All зависит от того,
    // наведён ли курсор на слот с предметом.
    updateDropButtons(item) {
        const btnOne = document.getElementById('btn-drop-one');
        const btnAll = document.getElementById('btn-drop-all');
        if (!btnOne || !btnAll) return;
        const has = !!(item && item.count > 0);
        btnOne.disabled = !has;
        // Кнопка "Drop All" полезна только когда в стаке больше одного
        btnAll.disabled = !(has && item.count > 1);
        if (has) {
            btnOne.innerText = `Drop Item (Q)`;
            btnAll.innerText = `Drop All (x${item.count})`;
        } else {
            btnOne.innerText = `Drop Item (Q)`;
            btnAll.innerText = `Drop All`;
        }
    },

    // V8.2: Выбросить предмет из выделенного в инвентаре слота.
    // all=false → 1 штука; all=true → весь стак. Инструменты всегда выбрасываются целиком.
    dropFromHighlight(all = false) {
        if (invHighlight < 0 || invHighlight >= player.inv.capacity) return;
        const s = player.inv.slots[invHighlight];
        if (!s) return;

        const isTool = !!MAX_DUR[s.id];
        // Сколько выбрасываем:
        // - инструмент: всегда 1 предмет (у него count=1 всегда)
        // - стак: либо 1, либо весь
        const dropCount = (isTool ? 1 : (all ? s.count : 1));

        // Удаление
        if (isTool) {
            // У инструментов есть durability — просто очищаем слот
            player.inv.slots[invHighlight] = null;
        } else {
            s.count -= dropCount;
            if (s.count <= 0) player.inv.slots[invHighlight] = null;
        }

        this.audio.playSound('drop');
        VFX.dropPuff(player.x + player.w / 2, player.y + player.h / 2);
        this.addChatMessage(`Dropped ${getItemName(s.id)}${dropCount > 1 ? ` x${dropCount}` : ''}`);

        // Перерисовать UI
        this.renderInventory();
        this.updateHUD();
        this.updateItemDesc(player.inv.slots[invHighlight]);
    },

    // ===== ЕДИНАЯ СИСТЕМА DRAG&DROP ДЛЯ ВСЕХ СЛОТОВ =====
    // Каждый рендерер ставит data-slot на свой DOM-элемент:
    //   "inv:N"      — обычный слот игрока (0..35), N=0..8 это хотбар
    //   "armor:S"    — слот брони, S ∈ {head, chest, legs}
    //   "c2:N"       — крафт 2x2 в инвентаре, N=0..3
    //   "c3:N"       — крафт 3x3 в верстаке, N=0..8
    //   "c2-out"     — выход 2x2 (read-only)
    //   "c3-out"     — выход 3x3 (read-only)
    //   "chest:N"    — слот сундука
    //   "furnace:S"  — S ∈ {in, fuel, out}
    // Глобальные mousedown/mousemove/mouseup перехватывают всё через делегирование.
    _slotApi(key) {
        const t = key.split(':');
        if (t[0] === 'inv') {
            const i = +t[1];
            return {
                get: () => player.inv.slots[i],
                set: (v) => { player.inv.slots[i] = v; },
                canAccept: () => true,
                readOnly: false,
            };
        }
        if (t[0] === 'armor') {
            const s = t[1];
            return {
                get: () => player.armor[s],
                set: (v) => { player.armor[s] = v; },
                canAccept: (item) => !item || this._isArmorFor(item.id, s),
                readOnly: false,
            };
        }
        if (t[0] === 'c2') {
            const i = +t[1];
            return {
                get: () => player.craft2x2[i],
                set: (v) => { player.craft2x2[i] = v; },
                canAccept: () => true,
                readOnly: false,
                onChange: () => {},
            };
        }
        if (t[0] === 'c3') {
            const i = +t[1];
            return {
                get: () => player.craft3x3[i],
                set: (v) => { player.craft3x3[i] = v; },
                canAccept: () => true,
                readOnly: false,
            };
        }
        if (key === 'c2-out') {
            return {
                get: () => {
                    const r = this._currentCraftResult(false);
                    if (!r) return null;
                    return { id: r.id, count: r.n, dur: MAX_DUR[r.id] || null };
                },
                set: () => {},
                canAccept: () => false,
                readOnly: true,
                takeAll: () => {
                    const r = this._currentCraftResult(false);
                    if (!r) return null;
                    this.consumeCraft2x2();
                    return { id: r.id, count: r.n, dur: MAX_DUR[r.id] || null };
                },
            };
        }
        if (key === 'c3-out') {
            return {
                get: () => {
                    const r = this._currentCraftResult(true);
                    if (!r) return null;
                    return { id: r.id, count: r.n, dur: MAX_DUR[r.id] || null };
                },
                set: () => {},
                canAccept: () => false,
                readOnly: true,
                takeAll: () => {
                    const r = this._currentCraftResult(true);
                    if (!r) return null;
                    this.consumeCraft3x3();
                    return { id: r.id, count: r.n, dur: MAX_DUR[r.id] || null };
                },
            };
        }
        if (t[0] === 'chest') {
            const i = +t[1];
            return {
                get: () => {
                    const c1 = world.chests[openChestPos];
                    const c2 = openChestDoublePos ? world.chests[openChestDoublePos] : null;
                    if (!c1) return null;
                    return i < 27 ? c1[i] : c2[i - 27];
                },
                set: (v) => {
                    const c1 = world.chests[openChestPos];
                    const c2 = openChestDoublePos ? world.chests[openChestDoublePos] : null;
                    if (!c1) return;
                    if (i < 27) c1[i] = v; else c2[i - 27] = v;
                },
                canAccept: () => true,
                readOnly: false,
            };
        }
        if (t[0] === 'furnace') {
            const s = t[1];
            return {
                get: () => {
                    const f = world.furnaces[openFurnacePos];
                    if (!f) return null;
                    if (s === 'in') return f.input;
                    if (s === 'fuel') return f.fuel;
                    if (s === 'out') return f.output;
                    return null;
                },
                set: (v) => {
                    const f = world.furnaces[openFurnacePos];
                    if (!f) return;
                    if (s === 'in') f.input = v;
                    if (s === 'fuel') f.fuel = v;
                    if (s === 'out') f.output = v;
                },
                canAccept: (item) => {
                    if (s === 'in') return !item || !!SMELT_RECIPES[item.id];
                    if (s === 'fuel') return !item || !!FUELS[item.id];
                    return false;
                },
                readOnly: (s === 'out'),
                takeAll: () => {
                    const f = world.furnaces[openFurnacePos];
                    if (!f || !f.output) return null;
                    const r = f.output;
                    f.output = null;
                    return r;
                }
            };
        }
        return null;
    },

    // ===== CURSOR-ITEM МОДЕЛЬ (стиль Minecraft) =====
    // У игрока на курсоре висит "плавающий" предмет (this.cursorItem).
    // ЛКМ на слот:
    //   • курсор пуст → взять всю стопку из слота
    //   • курсор с предметом и слот пуст / тот же тип / другой тип → положить/swap
    // ПКМ на слот:
    //   • курсор пуст → взять половину (округление вверх)
    //   • курсор с предметом → положить 1 шт (или swap если другой тип)
    // Выход 2x2 / 3x3 — особый: ЛКМ берёт результат, ПКМ — тоже всё; пустой курсор обязателен,
    //   либо тот же тип и есть место.
    _ensureDnDBound() {
        if (this._dndBound) return;
        this._dndBound = true;
        const ghost = document.getElementById('drag-ghost');
        this.cursorItem = null;

        const refreshGhost = (x, y) => {
            ghost.innerHTML = '';
            if (!this.cursorItem) {
                ghost.style.display = 'none';
                return;
            }
            const c = document.createElement('canvas');
            c.width = 32; c.height = 32;
            drawItemIcon(c.getContext('2d'), this.cursorItem.id, this.cursorItem.dur);
            ghost.appendChild(c);
            if (!MAX_DUR[this.cursorItem.id] && this.cursorItem.count > 1) {
                const sp = document.createElement('span');
                sp.className = 'count';
                sp.innerText = this.cursorItem.count;
                ghost.appendChild(sp);
            }
            if (typeof x === 'number') {
                ghost.style.left = x + 'px';
                ghost.style.top = y + 'px';
            }
            ghost.style.display = 'block';
        };

        // PERF: rerenderAll вызывается из mousemove/RMB-drag — без троттла он
        // дёргает renderInventory + renderCraftList (124 рецепта × ~3 канваса)
        // десятки раз в секунду. Сворачиваем все вызовы в один на кадр через rAF.
        let _rerenderScheduled = false;
        const _doRerender = () => {
            _rerenderScheduled = false;
            if (!document.getElementById('screen-inventory').classList.contains('hidden')) this.renderInventory();
            if (document.getElementById('screen-workbench') && !document.getElementById('screen-workbench').classList.contains('hidden')) this.renderWorkbench();
            if (openChestPos) this.renderChest();
            if (openFurnacePos) this.renderFurnace();
            this.updateHUD();
            refreshGhost();
        };
        const rerenderAll = () => {
            if (_rerenderScheduled) return;
            _rerenderScheduled = true;
            requestAnimationFrame(_doRerender);
        };
        this._rerenderUI = rerenderAll;

        // Заглушаем контекстное меню в окнах инвентаря — иначе ПКМ открывает меню браузера.
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('#screen-inventory, #screen-workbench, #screen-chest, #screen-furnace, #drag-ghost')) {
                e.preventDefault();
            }
        });

        let rmbHeld = false;
        let lastHoveredSlotKey = null;

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) rmbHeld = false;
        });

        document.addEventListener('mousemove', (e) => {
            if (this.cursorItem) refreshGhost(e.clientX, e.clientY);

            // Логика быстрого заполнения при зажатой ПКМ
            if (rmbHeld && this.cursorItem) {
                const slotEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
                if (slotEl) {
                    const key = slotEl.dataset.slot;
                    if (key !== lastHoveredSlotKey) {
                        lastHoveredSlotKey = key;
                        const api = this._slotApi(key);
                        if (api && !api.readOnly && api.canAccept(this.cursorItem)) {
                            const slotItem = api.get();
                            // Если слот пустой или содержит такой же предмет, кладем 1 штуку
                            if (!slotItem || (slotItem.id === this.cursorItem.id && !MAX_DUR[slotItem.id] && slotItem.count < getMaxStack(slotItem.id))) {
                                if (!slotItem) {
                                    api.set({ id: this.cursorItem.id, count: 1 });
                                } else {
                                    slotItem.count += 1;
                                    api.set(slotItem);
                                }
                                this.cursorItem.count -= 1;
                                if (this.cursorItem.count <= 0) this.cursorItem = null;
                                this.audio.playSound('place');
                                refreshGhost(e.clientX, e.clientY);
                                rerenderAll();
                            }
                        }
                    }
                } else {
                    lastHoveredSlotKey = null;
                }
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                rmbHeld = true;
                const slotEl = e.target.closest('[data-slot]');
                if (slotEl) lastHoveredSlotKey = slotEl.dataset.slot;
            }
            const slotEl = e.target.closest('[data-slot]');
            if (!slotEl) {
                // Клик мимо слота — выбросить cursor item в мир (если есть и мы вне UI?).
                // Чтобы избежать случайных потерь — игнорируем, если клик внутри окна инвентаря.
                if (this.cursorItem && !e.target.closest('#screen-inventory, #screen-workbench, #screen-chest, #screen-furnace, #drag-ghost')) {
                    // Сначала вернём в инвентарь — это безопасный default.
                    player.inv.add(this.cursorItem.id, this.cursorItem.count, this.cursorItem.dur);
                    this.cursorItem = null;
                    rerenderAll();
                }
                return;
            }

            const key = slotEl.dataset.slot;
            const api = this._slotApi(key);
            if (!api) return;
            e.preventDefault();

            const isRight = (e.button === 2);
            const isLeft  = (e.button === 0);
            if (!isLeft && !isRight) return;

            // Read-only слот результата
            if (api.readOnly) {
                const out = api.get();
                if (!out) return;
                // Можно взять, только если курсор пуст или это тот же предмет (и влезает).
                if (!this.cursorItem) {
                    this.cursorItem = api.takeAll();
                } else if (this.cursorItem.id === out.id && !MAX_DUR[out.id]) {
                    const ms = getMaxStack(out.id);
                    if (this.cursorItem.count + out.count <= ms) {
                        this.cursorItem.count += out.count;
                        api.takeAll();
                    }
                }
                refreshGhost(e.clientX, e.clientY);
                this.audio.playSound('craft');
                VFX.craftSparkle(player.x + player.w / 2, player.y + player.h / 2);
                rerenderAll();
                return;
            }

            // Подсветка для подписи
            if (key.startsWith('inv:')) {
                invHighlight = +key.split(':')[1];
                this.updateItemDesc(api.get());
            }

            const slotItem = api.get();

            if (!this.cursorItem) {
                // ===== ВЗЯТЬ С СЛОТА =====
                if (!slotItem) return;
                if (isLeft) {
                    this.cursorItem = { id: slotItem.id, count: slotItem.count, dur: slotItem.dur };
                    api.set(null);
                } else {
                    // ПКМ — взять половину (округление вверх). Для инструментов — всю стопку.
                    if (MAX_DUR[slotItem.id]) {
                        this.cursorItem = { id: slotItem.id, count: slotItem.count, dur: slotItem.dur };
                        api.set(null);
                    } else {
                        const half = Math.ceil(slotItem.count / 2);
                        this.cursorItem = { id: slotItem.id, count: half };
                        const remain = slotItem.count - half;
                        if (remain > 0) api.set({ ...slotItem, count: remain });
                        else api.set(null);
                    }
                }
            } else {
                // ===== ПОЛОЖИТЬ ИЗ КУРСОРА В СЛОТ =====
                if (!api.canAccept(this.cursorItem)) return;
                if (!slotItem) {
                    if (isLeft || MAX_DUR[this.cursorItem.id]) {
                        // Положить всё
                        api.set(this.cursorItem);
                        this.cursorItem = null;
                    } else {
                        // ПКМ + стопка → положить 1
                        api.set({ id: this.cursorItem.id, count: 1 });
                        this.cursorItem.count -= 1;
                        if (this.cursorItem.count <= 0) this.cursorItem = null;
                    }
                } else if (slotItem.id === this.cursorItem.id && !MAX_DUR[slotItem.id]) {
                    const ms = getMaxStack(slotItem.id);
                    const space = ms - slotItem.count;
                    if (space <= 0) return; // полный слот
                    if (isLeft) {
                        const mv = Math.min(space, this.cursorItem.count);
                        slotItem.count += mv;
                        this.cursorItem.count -= mv;
                        if (this.cursorItem.count <= 0) this.cursorItem = null;
                        api.set(slotItem);
                    } else {
                        // ПКМ — положить 1
                        slotItem.count += 1;
                        this.cursorItem.count -= 1;
                        if (this.cursorItem.count <= 0) this.cursorItem = null;
                        api.set(slotItem);
                    }
                } else {
                    // другой тип — swap, если src api тоже принимает slotItem
                    if (api.canAccept(this.cursorItem)) {
                        const tmp = this.cursorItem;
                        this.cursorItem = { ...slotItem };
                        api.set(tmp);
                    }
                }
            }
            refreshGhost(e.clientX, e.clientY);
            this.audio.playSound('place');
            rerenderAll();
        });
    },

    // Возвращает cursor item обратно в инвентарь — вызывается при закрытии UI.
    _flushCursorItem() {
        if (this.cursorItem) {
            player.inv.add(this.cursorItem.id, this.cursorItem.count, this.cursorItem.dur);
            this.cursorItem = null;
            const ghost = document.getElementById('drag-ghost');
            if (ghost) ghost.style.display = 'none';
        }
    },

    renderInventory() {
        this._ensureDnDBound();
        const mainGrid = document.getElementById('main-inventory');
        const hotbarGrid = document.getElementById('hotbar-inventory');
        mainGrid.innerHTML = '';
        if (hotbarGrid) hotbarGrid.innerHTML = '';

        if (invHighlight >= 0 && invHighlight < player.inv.capacity) {
            this.updateItemDesc(player.inv.slots[invHighlight]);
        }

        const makeSlot = (i) => {
            const s = player.inv.slots[i];
            const div = document.createElement('div');
            let cls = 'slot';
            if (i === player.inv.selected) cls += ' selected';
            if (i === invHighlight) cls += ' inv-active';
            div.className = cls;
            div.dataset.slot = 'inv:' + i;
            if (s) {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), s.id, s.dur);
                div.appendChild(cvs);
                const span = document.createElement('span');
                span.className = 'count';
                span.innerText = (MAX_DUR[s.id]) ? '' : s.count;
                div.appendChild(span);
            }
            div.onmouseenter = () => {
                if (this._drag) return;
                invHighlight = i;
                this.updateItemDesc(s);
                document.querySelectorAll('.slot.inv-active').forEach(el => el.classList.remove('inv-active'));
                div.classList.add('inv-active');
                this.updateDropButtons();
            };
            div.onmouseleave = () => {
                if (this._drag) return;
                if (invHighlight === i) {
                    invHighlight = -1;
                    this.updateItemDesc(null);
                    div.classList.remove('inv-active');
                    this.updateDropButtons();
                }
            };
            return div;
        };
        for (let i = 9; i < 36; i++) mainGrid.appendChild(makeSlot(i));
        if (hotbarGrid) {
            for (let i = 0; i < 9; i++) hotbarGrid.appendChild(makeSlot(i));
        }

        this.renderArmor();
        this.renderCreeperPreview();
        this.renderCraft2x2();
        this.renderCraftList();
        this.updateDropButtons();
    },

    renderArmor() {
        ['head', 'chest', 'legs'].forEach(slot => {
            const el = document.querySelector(`.armor-slot[data-armor="${slot}"]`);
            if (!el) return;
            el.innerHTML = '';
            el.dataset.slot = 'armor:' + slot;
            const item = player.armor[slot];
            if (item) {
                el.classList.add('filled');
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), item.id, item.dur);
                el.appendChild(cvs);
            } else {
                el.classList.remove('filled');
            }
        });
    },

    _isArmorFor(itemId, slot) {
        const armorMap = (typeof ARMOR_ITEMS !== 'undefined') ? ARMOR_ITEMS : {};
        return armorMap[itemId] === slot;
    },

    renderCreeperPreview() {
        const cvs = document.getElementById('creeper-preview-canvas');
        if (!cvs) return;
        const c = cvs.getContext('2d');
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, cvs.width, cvs.height);
        
        c.save();
        const scale = 2.5;
        c.scale(scale, scale);
        
        const pivotX = (cvs.width / 2) / scale;
        const feetY = (cvs.height - 5) / scale;
        
        const fakeP = {
            x: pivotX - 10,
            y: feetY - 58,
            vx: 0, hurtTimer: 0, burnTimer: 0, inWater: false,
            // Передаём текущую экипировку, чтобы предпросмотр Крипера в инвентаре
            // мгновенно отражал то, что игрок носит.
            armor: player ? player.armor : null,
        };

        if (typeof drawCreeper === 'function') drawCreeper(c, fakeP, 2);
        c.restore();
    },

    _startCreeperLoop() {
        if (this._creeperLoopRunning) return;
        this._creeperLoopRunning = true;
        const tick = () => {
            const open = !document.getElementById('screen-inventory').classList.contains('hidden');
            if (!open) { this._creeperLoopRunning = false; return; }
            this.renderCreeperPreview();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    // ===== 2x2 КРАФТ В ИНВЕНТАРЕ =====
    renderCraft2x2() {
        const grid = document.getElementById('craft2x2-grid');
        const out  = document.getElementById('craft2x2-out');
        if (!grid || !out) return;
        grid.innerHTML = '';

        for (let i = 0; i < 4; i++) {
            const it = player.craft2x2[i];
            const div = document.createElement('div');
            div.className = 'slot';
            div.dataset.slot = 'c2:' + i;
            if (it) {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), it.id, it.dur);
                div.appendChild(cvs);
                const span = document.createElement('span');
                span.className = 'count';
                span.innerText = (MAX_DUR[it.id]) ? '' : it.count;
                div.appendChild(span);
            }
            grid.appendChild(div);
        }

        out.innerHTML = '';
        out.dataset.slot = 'c2-out';
        const result = this._currentCraftResult(false);
        out.classList.toggle('has-result', !!result);
        if (result) {
            const cvs = document.createElement('canvas');
            cvs.width = 36; cvs.height = 36;
            drawItemIcon(cvs.getContext('2d'), result.id);
            out.appendChild(cvs);
            if (result.n > 1) {
                const span = document.createElement('span');
                span.className = 'count';
                span.innerText = result.n;
                out.appendChild(span);
            }
        }
    },

    // Подбор рецепта для 2x2 / 3x3 сетки.
    // Поддерживает три формата:
    //   • shape: [['P','P'],['P','P']] + key: { P: ITEMS.PLANK } — позиционный
    //   • shapeless: [ITEMS.PLANK, ITEMS.PLANK] — только наличие, без позиций
    //   • legacy: in: [{id,n}] — список ингредиентов с количеством (sum-based)
    _currentCraftResult(is3x3) {
        const size = is3x3 ? 3 : 2;
        const cells = is3x3 ? player.craft3x3 : player.craft2x2;
        // Собираем матрицу size × size; рассчитываем bounding box непустых клеток.
        const grid = [];
        let minR = size, maxR = -1, minC = size, maxC = -1;
        for (let r = 0; r < size; r++) {
            const row = [];
            for (let cIdx = 0; cIdx < size; cIdx++) {
                const it = cells[r * size + cIdx];
                row.push(it);
                if (it) {
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                    if (cIdx < minC) minC = cIdx;
                    if (cIdx > maxC) maxC = cIdx;
                }
            }
            grid.push(row);
        }
        if (maxR < 0) return null; // пусто

        // Сумма ингредиентов по типам
        const sumByType = {};
        for (let r = 0; r < size; r++)
            for (let cIdx = 0; cIdx < size; cIdx++)
                if (grid[r][cIdx]) sumByType[grid[r][cIdx].id] = (sumByType[grid[r][cIdx].id] || 0) + 1;

        const fitsRecipe = (r) => {
            if (r.bench === true && !is3x3) return false; // 3x3-only
            if (r.shape && r.key) {
                const sh = r.shape;
                if (sh.length > size) return false;
                const sw = Math.max(...sh.map(row => row.length));
                if (sw > size) return false;
                const bh = maxR - minR + 1, bw = maxC - minC + 1;
                if (sh.length !== bh || sw !== bw) return false;
                for (let rr = 0; rr < bh; rr++) {
                    for (let cc = 0; cc < bw; cc++) {
                        const sym = (sh[rr][cc] || ' ');
                        const cell = grid[minR + rr][minC + cc];
                        if (sym === ' ' || sym === '.') {
                            if (cell) return false;
                        } else {
                            const needId = r.key[sym];
                            if (Array.isArray(needId)) {
                                if (!cell || !needId.includes(cell.id)) return false;
                            } else {
                                if (!cell || cell.id !== needId) return false;
                            }
                        }
                    }
                }
                return true;
            }
            if (r.shapeless) {
                // Каждый элемент списка — один требуемый предмет (по 1 штуке).
                const need = {};
                for (const id of r.shapeless) need[id] = (need[id] || 0) + 1;
                const sumIds = Object.keys(sumByType);
                if (sumIds.length !== Object.keys(need).length) return false;
                for (const id of sumIds) if (sumByType[id] !== need[+id]) return false;
                return true;
            }
            if (r.in) {
                // Старый формат: суммарное соответствие количеств.
                if (r.reqBench && !is3x3) return false;
                if (r.in.length !== Object.keys(sumByType).length) return false;
                for (const ing of r.in) if ((sumByType[ing.id] || 0) !== ing.n) return false;
                return true;
            }
            return false;
        };
        const match = RECIPES.find(fitsRecipe);
        return match ? match.out : null;
    },

    // Можно ли рецепт скрафтить в 2x2 (т.е. в инвентаре, без верстака)?
    _recipeFitsIn2x2(r) {
        if (r.bench === true) return false;
        if (r.reqBench === true) return false;
        if (r.shape) {
            if (r.shape.length > 2) return false;
            if (Math.max(...r.shape.map(row => row.length)) > 2) return false;
        }
        if (r.shapeless && r.shapeless.length > 4) return false;
        return true;
    },

    // Кладёт ингредиенты рецепта в крафт-сетку (2x2 или 3x3).
    // Берёт из инвентаря (включая хотбар). Если предмета не хватает — не кладёт ничего.
    autoFillRecipe(recipe, is3x3) {
        const grid = is3x3 ? player.craft3x3 : player.craft2x2;
        const size = is3x3 ? 3 : 2;
        // Сначала возвращаем содержимое сетки в инвентарь (на случай если там что-то лежит).
        for (let i = 0; i < grid.length; i++) {
            const it = grid[i];
            if (it) {
                player.inv.add(it.id, it.count, it.dur);
                grid[i] = null;
            }
        }
        // Готовим целевую раскладку
        const layout = []; // {row,col,id}
        if (recipe.shape && recipe.key) {
            const sh = recipe.shape;
            for (let r = 0; r < sh.length; r++) {
                for (let c = 0; c < sh[r].length; c++) {
                    const sym = sh[r][c];
                    if (sym && sym !== ' ' && sym !== '.') {
                        let idToUse = recipe.key[sym];
                        if (Array.isArray(idToUse)) {
                            let found = idToUse[0];
                            for (const id of idToUse) {
                                let count = 0;
                                for(let sr=0; sr<sh.length; sr++)
                                    for(let sc=0; sc<sh[sr].length; sc++)
                                        if(sh[sr][sc] === sym) count++;
                                if (player.inv.has(id, count)) {
                                    found = id;
                                    break;
                                }
                            }
                            idToUse = found;
                        }
                        layout.push({ row: r, col: c, id: idToUse });
                    }
                }
            }
        } else if (recipe.shapeless) {
            // Раскладываем подряд
            for (let i = 0; i < recipe.shapeless.length; i++) {
                layout.push({ row: Math.floor(i / size), col: i % size, id: recipe.shapeless[i] });
            }
        } else if (recipe.in) {
            // Старый формат — раскладываем подряд по 1 штуке (визуально условно)
            let i = 0;
            for (const ing of recipe.in) {
                for (let k = 0; k < ing.n; k++) {
                    if (i >= size * size) break;
                    layout.push({ row: Math.floor(i / size), col: i % size, id: ing.id });
                    i++;
                }
            }
        }
        // Проверяем наличие
        const need = {};
        for (const l of layout) need[l.id] = (need[l.id] || 0) + 1;
        for (const id of Object.keys(need)) {
            if (!player.inv.has(+id, need[id])) {
                this.sysMessage && this.sysMessage('Not enough ingredients');
                return false;
            }
        }
        // Берём из инвентаря и кладём
        for (const l of layout) {
            player.inv.remove(l.id, 1);
            grid[l.row * size + l.col] = { id: l.id, count: 1 };
        }
        return true;
    },

    consumeCraft2x2() {
        for (let i = 0; i < 4; i++) {
            if (player.craft2x2[i]) {
                player.craft2x2[i].count--;
                if (player.craft2x2[i].count <= 0) player.craft2x2[i] = null;
            }
        }
    },

    consumeCraft3x3() {
        for (let i = 0; i < 9; i++) {
            if (player.craft3x3[i]) {
                player.craft3x3[i].count--;
                if (player.craft3x3[i].count <= 0) player.craft3x3[i] = null;
            }
        }
    },

    // Возвращает ингредиенты из крафт-сетки обратно в инвентарь (при закрытии).
    flushCraft2x2() {
        for (let i = 0; i < 4; i++) {
            const it = player.craft2x2[i];
            if (it) {
                player.inv.add(it.id, it.count, it.dur);
                player.craft2x2[i] = null;
            }
        }
    },
    flushCraft3x3() {
        for (let i = 0; i < 9; i++) {
            const it = player.craft3x3[i];
            if (it) {
                player.inv.add(it.id, it.count, it.dur);
                player.craft3x3[i] = null;
            }
        }
    },

    updateDropButtons() {
        const one = document.getElementById('btn-drop-one');
        const all = document.getElementById('btn-drop-all');
        if (!one || !all) return;
        const has = invHighlight >= 0 && invHighlight < player.inv.capacity && player.inv.slots[invHighlight];
        one.disabled = !has;
        all.disabled = !has;
    },

    // Сортировка инвентаря. Сохраняем хотбар (слоты 0..8) на месте — в Minecraft
    // привычка к расположению хотбара важна. Сортируем только основные слоты 9..35.
    // mode === 'stack' — только объединяем одинаковые предметы в стопки.
    // mode === 'type'  — то же плюс сортируем по типу/id (блоки → инструменты → еда → разное).
    sortInventory(mode) {
        const START = 9, END = 36;
        // Собираем все непустые слоты основного инвентаря (без инструментов с durability —
        // их объединить нельзя).
        const collected = [];
        for (let i = START; i < END; i++) {
            const s = player.inv.slots[i];
            if (s) collected.push({ ...s });
            player.inv.slots[i] = null;
        }
        // Слияние стопок одинаковых предметов.
        const merged = [];
        for (const it of collected) {
            if (MAX_DUR[it.id]) { merged.push(it); continue; }
            const m = merged.find(x => x.id === it.id && !MAX_DUR[x.id]);
            if (m) {
                m.count += it.count;
            } else {
                merged.push(it);
            }
        }
        // Разбиваем переполненные стопки до maxStack.
        const final = [];
        for (const it of merged) {
            if (MAX_DUR[it.id]) { final.push(it); continue; }
            const ms = getMaxStack(it.id);
            while (it.count > ms) {
                final.push({ id: it.id, count: ms });
                it.count -= ms;
            }
            if (it.count > 0) final.push(it);
        }
        if (mode === 'type') {
            final.sort((a, b) => {
                if (a.id !== b.id) return a.id - b.id;
                return b.count - a.count;
            });
        }
        // Раскладываем обратно
        for (let i = 0; i < final.length && (START + i) < END; i++) {
            player.inv.slots[START + i] = final[i];
        }
        this.renderInventory();
        this.updateHUD();
    },

    // Возвращает список ингредиентов рецепта в форме [{id,n}] —
    // унифицирует доступ для UI: shape+key / shapeless / legacy in.
    _recipeIngredients(r) {
        if (r.shape && r.key) {
            const m = {};
            for (const row of r.shape) for (const ch of row) {
                if (ch && ch !== ' ' && ch !== '.') {
                    const id = r.key[ch];
                    m[id] = (m[id] || 0) + 1;
                }
            }
            return Object.keys(m).map(id => ({ id: +id, n: m[id] }));
        }
        if (r.shapeless) {
            const m = {};
            for (const id of r.shapeless) m[id] = (m[id] || 0) + 1;
            return Object.keys(m).map(id => ({ id: +id, n: m[id] }));
        }
        return r.in || [];
    },

    // Кому в каком окне разрешён рецепт.
    _recipeAllowedInGrid(r, is3x3) {
        if (is3x3) return true; // верстак крафтит всё
        return this._recipeFitsIn2x2(r);
    },

    // PERF: главный hotspot инвентаря. Раньше каждый rerender создавал заново
    // 124 кнопки × DOM-узлы + canvas-рендеры → ~130 мс на вызов. Теперь
    // строим DOM один раз на (контейнер, набор рецептов), сохраняем ссылки и
    // на ребилде только обновляем счётчики/доступность/видимость по поиску.
    _craftListBuild(container, recipes, isWorkbench) {
        const cache = {
            container,
            recipes,
            // Параллельные массивы — индекс совпадает с recipes.
            btns: [],
            chips: [],     // chips[i] = [{el, lbl, ing}]
            allowed: [],   // bool: помещается ли в эту сетку
            names: [],
            // Сохранённые состояния — чтобы не дёргать DOM зря.
            lastVisible: [],
            lastCan: [],
            lastChipOk: [],   // bool[][]
            lastTitles: [],   // string[][]
        };
        const frag = document.createDocumentFragment();
        recipes.forEach((r, idx) => {
            const allowed = this._recipeAllowedInGrid(r, isWorkbench);
            cache.allowed.push(allowed);
            cache.names.push(getItemName(r.out.id));
            if (!allowed) {
                cache.btns.push(null);
                cache.chips.push(null);
                cache.lastVisible.push(false);
                cache.lastCan.push(null);
                cache.lastChipOk.push(null);
                cache.lastTitles.push(null);
                return;
            }
            const ingredients = this._recipeIngredients(r);

            const btn = document.createElement('button');
            btn.className = 'craft-btn';

            // 1) Иконка результата
            const outWrap = document.createElement('div');
            outWrap.className = 'craft-out-icon';
            const outCvs = document.createElement('canvas');
            outCvs.width = 40; outCvs.height = 40;
            const oc = outCvs.getContext('2d');
            oc.imageSmoothingEnabled = false;
            oc.scale(40 / 32, 40 / 32);
            drawItemIcon(oc, r.out.id);
            outWrap.appendChild(outCvs);
            if (r.out.n > 1) {
                const outBadge = document.createElement('span');
                outBadge.className = 'craft-out-badge';
                outBadge.textContent = `x${r.out.n}`;
                outWrap.appendChild(outBadge);
            }
            btn.appendChild(outWrap);

            // 2) Центр: название + ингредиенты
            const center = document.createElement('div');
            center.className = 'craft-center';
            const title = document.createElement('div');
            title.className = 'craft-title';
            title.textContent = cache.names[idx];
            center.appendChild(title);

            const ingRow = document.createElement('div');
            ingRow.className = 'craft-ing-row';
            const chipRefs = [];
            ingredients.forEach((ing, jdx) => {
                if (jdx > 0) {
                    const plus = document.createElement('span');
                    plus.className = 'craft-plus';
                    plus.textContent = '+';
                    ingRow.appendChild(plus);
                }
                const chip = document.createElement('span');
                chip.className = 'craft-ing';
                const iCvs = document.createElement('canvas');
                iCvs.width = 20; iCvs.height = 20;
                const ic = iCvs.getContext('2d');
                ic.imageSmoothingEnabled = false;
                ic.scale(20 / 32, 20 / 32);
                drawItemIcon(ic, ing.id);
                chip.appendChild(iCvs);
                const lbl = document.createElement('span');
                lbl.className = 'craft-ing-count';
                lbl.textContent = `x${ing.n}`;
                chip.appendChild(lbl);
                ingRow.appendChild(chip);
                chipRefs.push({ el: chip, lbl, ing });
            });

            center.appendChild(ingRow);
            btn.appendChild(center);

            btn.onclick = () => {
                const ok = this.autoFillRecipe(r, isWorkbench);
                if (ok) {
                    this.audio.playSound('button_click');
                    if (isWorkbench) this.renderWorkbench();
                    else this.renderInventory();
                }
            };

            cache.btns.push(btn);
            cache.chips.push(chipRefs);
            cache.lastVisible.push(true);
            cache.lastCan.push(null);
            cache.lastChipOk.push(new Array(chipRefs.length).fill(null));
            cache.lastTitles.push(new Array(chipRefs.length).fill(null));
            frag.appendChild(btn);
        });
        container.innerHTML = '';
        container.appendChild(frag);
        return cache;
    },

    _craftListUpdate(cache, term) {
        // Считаем суммы в инвентаре один раз — оно одинаково для всех чипов.
        const invSums = {};
        const slots = player.inv.slots;
        for (let k = 0; k < player.inv.capacity; k++) {
            const s = slots[k];
            if (s) invSums[s.id] = (invSums[s.id] || 0) + s.count;
        }

        for (let i = 0; i < cache.recipes.length; i++) {
            if (!cache.allowed[i]) continue;
            const btn = cache.btns[i];
            const matchesSearch = !term || cache.names[i].toLowerCase().includes(term);
            if (matchesSearch !== cache.lastVisible[i]) {
                btn.style.display = matchesSearch ? '' : 'none';
                cache.lastVisible[i] = matchesSearch;
            }
            if (!matchesSearch) continue;

            const chips = cache.chips[i];
            let can = true;
            const chipOk = cache.lastChipOk[i];
            const chipTitles = cache.lastTitles[i];
            for (let j = 0; j < chips.length; j++) {
                const ing = chips[j].ing;
                const have = invSums[ing.id] || 0;
                const ok = have >= ing.n;
                if (!ok) can = false;
                if (chipOk[j] !== ok) {
                    chips[j].el.classList.toggle('craft-ing-missing', !ok);
                    chipOk[j] = ok;
                }
                const ttl = `${getItemName(ing.id)} — have ${have}/${ing.n}`;
                if (chipTitles[j] !== ttl) {
                    chips[j].el.title = ttl;
                    chipTitles[j] = ttl;
                }
            }
            if (cache.lastCan[i] !== can) {
                btn.classList.toggle('craft-btn-disabled', !can);
                btn.disabled = !can;
                cache.lastCan[i] = can;
            }
        }
    },

    renderCraftList() {
        const isWorkbench = !document.getElementById('screen-workbench')?.classList.contains('hidden');
        const container = document.getElementById(isWorkbench ? 'workbench-crafting-recipes' : 'crafting-recipes');
        if (!container) return;
        const searchEl = document.getElementById(isWorkbench ? 'workbench-craft-search' : 'craft-search');
        const term = searchEl ? searchEl.value.toLowerCase() : '';

        this._craftListCache = this._craftListCache || {};
        const key = isWorkbench ? 'wb' : 'inv';
        let cache = this._craftListCache[key];
        // Перестраиваем DOM с нуля только если контейнер ещё пуст или
        // потерял наши кнопки (например, кто-то снаружи сделал innerHTML='').
        if (!cache || cache.container !== container || container.firstChild !== (cache.btns.find(b => b))) {
            cache = this._craftListBuild(container, RECIPES, isWorkbench);
            this._craftListCache[key] = cache;
        }
        this._craftListUpdate(cache, term);
    },

    isNearWorkbench() {
        let px = Math.floor(player.x / TILE_SIZE);
        let py = Math.floor(player.y / TILE_SIZE);
        for (let x = px - 3; x <= px + 3; x++) {
            for (let y = py - 3; y <= py + 3; y++) {
                if (world.getTile(x, y) === B.WORKBENCH) return true;
            }
        }
        return false;
    },

    renderFurnace(onlyAnim = false) {
        if (!openFurnacePos) return;
        const f = world.furnaces[openFurnacePos];
        this._ensureDnDBound();

        // --- АНИМАЦИЯ (Огонь и Стрелка) ---
        // Рисуем это ВСЕГДА, каждый кадр
        const fireEl = document.getElementById('furnace-fire');
        const arrowEl = document.getElementById('furnace-arrow');

        // 1. Огонь
        let cFire = fireEl.querySelector('canvas');
        if (!cFire) {
            fireEl.innerHTML = '';
            cFire = document.createElement('canvas'); cFire.width = 30; cFire.height = 30;
            fireEl.appendChild(cFire);
        }
        const ctxF = cFire.getContext('2d');
        ctxF.clearRect(0, 0, 30, 30);
        this.drawIconSymbol(ctxF, 'fire', '#555');

        if (f.maxBurn > 0 && f.burn > 0) {
            const burnPct = f.burn / f.maxBurn;
            const h = 30;
            const clipH = h * burnPct;
            ctxF.save();
            ctxF.beginPath();
            ctxF.rect(0, h - clipH, 30, clipH);
            ctxF.clip();
            this.drawIconSymbol(ctxF, 'fire', '#ff5722');
            ctxF.restore();
        }

        // 2. Стрелка
        let cArrow = arrowEl.querySelector('canvas');
        if (!cArrow) {
            arrowEl.innerHTML = '';
            cArrow = document.createElement('canvas'); cArrow.width = 40; cArrow.height = 30;
            arrowEl.appendChild(cArrow);
        }
        const ctxA = cArrow.getContext('2d');
        ctxA.clearRect(0, 0, 40, 30);
        this.drawIconSymbol(ctxA, 'arrow', '#555');

        if (f.cook > 0) {
            const cookPct = f.cook / 200;
            const w = 40;
            const clipW = w * cookPct;
            ctxA.save();
            ctxA.beginPath();
            ctxA.rect(0, 0, clipW, 30);
            ctxA.clip();
            this.drawIconSymbol(ctxA, 'arrow', '#ffffff');
            ctxA.restore();
        }

        if (onlyAnim) return;

        // --- ОТРИСОВКА СЛОТОВ ПЕЧКИ ---
        const renderSlot = (elId, item, type) => {
            const el = document.getElementById(elId);
            el.innerHTML = '';
            el.dataset.slot = 'furnace:' + type;
            el.onmouseenter = () => this.updateItemDesc(item);
            el.onmouseleave = () => this.updateItemDesc(null);

            if (item) {
                const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), item.id, item.dur);
                el.appendChild(cvs);
                const sp = document.createElement('span'); sp.className = 'count'; sp.innerText = item.count;
                el.appendChild(sp);
            }
        };

        renderSlot('furnace-in', f.input, 'in');
        renderSlot('furnace-fuel', f.fuel, 'fuel');
        renderSlot('furnace-out', f.output, 'out');

        // --- ИНВЕНТАРЬ ИГРОКА ---
        const grid = document.getElementById('furnace-inv');
        const hotbar = document.getElementById('furnace-hotbar');
        if (grid) grid.innerHTML = '';
        if (hotbar) hotbar.innerHTML = '';

        const makeInvSlot = (i) => {
            const s = player.inv.slots[i];
            const div = document.createElement('div');
            div.className = 'slot' + (i === player.inv.selected ? ' selected' : '');
            div.dataset.slot = 'inv:' + i;
            if (s) {
                const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 32;
                drawItemIcon(cvs.getContext('2d'), s.id, s.dur);
                div.appendChild(cvs);
                const sp = document.createElement('span'); sp.className = 'count'; sp.innerText = (MAX_DUR[s.id]) ? '' : s.count;
                div.appendChild(sp);
            }
            div.onmouseenter = () => this.updateItemDesc(s);
            div.onmouseleave = () => this.updateItemDesc(null);
            return div;
        };

        if (grid && hotbar) {
            for (let i = 9; i < player.inv.capacity; i++) grid.appendChild(makeInvSlot(i));
            for (let i = 0; i < 9; i++) hotbar.appendChild(makeInvSlot(i));
        } else if (grid) {
            for (let i = 0; i < player.inv.capacity; i++) grid.appendChild(makeInvSlot(i));
        }
    },

    drawIconSymbol(ctx, type, color) {
        ctx.fillStyle = color;
        if (type === 'fire') {
            // Улучшенный пиксельный огонь (Pixel Art)
            // База
            ctx.fillRect(4, 20, 22, 8);
            ctx.fillRect(2, 24, 26, 4);
            // Языки пламени
            ctx.fillRect(6, 12, 6, 12); // Левый
            ctx.fillRect(14, 6, 4, 18); // Центр (высокий)
            ctx.fillRect(20, 14, 6, 10); // Правый

            // Если это активный огонь (цветной), добавим желтую сердцевину для красоты
            if (color !== '#555') {
                ctx.fillStyle = '#ffeb3b';
                ctx.fillRect(15, 12, 2, 6);
                ctx.fillRect(8, 18, 2, 2);
            }
        } else if (type === 'arrow') {
            // Пиксельная стрелка
            ctx.beginPath();
            ctx.moveTo(2, 10);
            ctx.lineTo(22, 10);
            ctx.lineTo(22, 2);
            ctx.lineTo(38, 15); // Острие
            ctx.lineTo(22, 28);
            ctx.lineTo(22, 20);
            ctx.lineTo(2, 20);
            ctx.fill();
        }
    },

    renderChest() {
        if (!openChestPos) return;
        const chest1 = world.chests[openChestPos];
        const chest2 = openChestDoublePos ? world.chests[openChestDoublePos] : null;
        this._ensureDnDBound();

        const getChestItem = (i) => i < 27 ? chest1[i] : chest2[i - 27];

        const renderGrid = (elId, isPlayer, startIdx = 0, endIdx = null) => {
            const grid = document.getElementById(elId);
            if (!grid) return;
            grid.innerHTML = '';
            const maxSlots = isPlayer ? player.inv.capacity : (chest2 ? 54 : 27);
            const end = endIdx !== null ? endIdx : maxSlots;

            for (let i = startIdx; i < end; i++) {
                const s = isPlayer ? player.inv.slots[i] : getChestItem(i);
                const div = document.createElement('div');
                div.className = 'slot';
                div.dataset.slot = isPlayer ? ('inv:' + i) : ('chest:' + i);

                if (s) {
                    const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 32;
                    drawItemIcon(cvs.getContext('2d'), s.id, s.dur);
                    div.appendChild(cvs);
                    const sp = document.createElement('span'); sp.className = 'count'; sp.innerText = (MAX_DUR[s.id]) ? '' : s.count;
                    div.appendChild(sp);
                }
                div.onmouseenter = () => this.updateItemDesc(s);
                div.onmouseleave = () => this.updateItemDesc(null);

                grid.appendChild(div);
            }
        };

        renderGrid('chest-grid', false);
        if (document.getElementById('chest-hotbar')) {
            renderGrid('chest-inv', true, 9, player.inv.capacity);
            renderGrid('chest-hotbar', true, 0, 9);
        } else {
            renderGrid('chest-inv', true);
        }
    },

    updateHUD() {
        const heartsContainer = document.getElementById('hud-hearts');
        let hHtml = '';
        let currentHp = Math.max(0, player.hp);
        for (let i = 0; i < currentHp; i++) hHtml += '♥';
        for (let i = currentHp; i < player.maxHp; i++) hHtml += '<span style="color:#555">♥</span>';
        heartsContainer.innerHTML = hHtml;

        // Полоса брони — над сердцами, 10 нагрудничков.
        // 1 пункт защиты = половина нагрудничка; 2 = целый. Макс 20 пунктов = 10 целых.
        this.updateArmorHud();

        document.getElementById('hud-day').innerText = day;

        const selItem = player.inv.getSelected();
        const lbl = document.getElementById('hud-item-name');
        const currentItemId = selItem ? selItem.id : null;
        if (this._lastHudItemId !== currentItemId || this._lastHudSlot !== player.inv.selected) {
            this._lastHudItemId = currentItemId;
            this._lastHudSlot = player.inv.selected;
            if (selItem) {
                lbl.innerText = getItemName(selItem.id);
                lbl.classList.add('visible');
                clearTimeout(this.lblTimer);
                this.lblTimer = setTimeout(() => lbl.classList.remove('visible'), 2000);
            } else {
                lbl.innerText = "";
                lbl.classList.remove('visible');
            }
        }

        const tb = document.getElementById('toolbar');
        tb.innerHTML = '';
        this.toolbarCanvases = [];
        for (let i = 0; i < 9; i++) {
            const s = player.inv.slots[i];
            const div = document.createElement('div');
            div.className = 'slot' + (i === player.inv.selected ? ' selected' : '');
            div.dataset.slot = (i + 1).toString();
            div.onclick = () => {
                player.inv.selected = i;
                this.updateHUD();
                if (!document.getElementById('screen-inventory').classList.contains('hidden')) {
                    this.renderInventory();
                }
            };
            if (s) {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                const c = cvs.getContext('2d');
                drawItemIcon(c, s.id, s.dur);
                div.appendChild(cvs);
                this.toolbarCanvases[i] = cvs;
                const span = document.createElement('span');
                span.className = 'count';
                span.innerText = (MAX_DUR[s.id]) ? '' : s.count;
                div.appendChild(span);
            }
            tb.appendChild(div);
        }
        this.updateLayerHud();
    },

    // Сколько суммарно очков защиты экипировано (0..20).
    getPlayerArmorPoints() {
        if (!player || !player.armor) return 0;
        let total = 0;
        for (const slot of ['head', 'chest', 'legs']) {
            const it = player.armor[slot];
            if (it) total += getArmorProtection(it.id);
        }
        return Math.min(20, total);
    },

    // Перерисовать полосу брони (10 нагрудничков, каждый = 2 пункта).
    updateArmorHud() {
        const bar = document.getElementById('hud-armor');
        if (!bar) return;
        const pts = this.getPlayerArmorPoints();
        if (pts <= 0) {
            bar.classList.add('empty');
            bar.innerHTML = '';
            return;
        }
        bar.classList.remove('empty');
        // pts ∈ 1..20: каждые 2 пункта = 1 целая иконка, 1 пункт = половина.
        let html = '';
        for (let i = 0; i < 10; i++) {
            const have = pts - i * 2;
            let cls = 'empty';
            if (have >= 2) cls = 'full';
            else if (have === 1) cls = 'half';
            html += `<span class="armor-pip ${cls}"></span>`;
        }
        bar.innerHTML = html;
    },

    updateLayerHud() {
        const li = document.getElementById('hud-layer-indicator');
        if (!li) return;
        const shortNames = ['BG', 'MID', 'FG'];
        li.className = ['layer-bg', 'layer-mid', 'layer-fg'][activeBuildLayer];
        const txt = document.getElementById('hud-layer-text');
        if (txt) txt.textContent = shortNames[activeBuildLayer];

        // Мини-превью выбранного блока с tint по слою.
        const cvs = document.getElementById('hud-layer-preview');
        if (!cvs) return;
        const c = cvs.getContext('2d');
        c.clearRect(0, 0, cvs.width, cvs.height);
        const sel = (typeof player !== 'undefined' && player && player.inv) ? player.inv.getSelected() : null;
        if (!sel || !BLOCKS[sel.id]) return;
        // Кешированный тайл блока (24×24 ресайз из 32×32).
        try {
            const tile = (typeof getTile === 'function') ? getTile(sel.id) : null;
            if (!tile) return;
            c.imageSmoothingEnabled = false;
            c.drawImage(tile, 0, 0, cvs.width, cvs.height);
            if (activeBuildLayer === LAYER.BG) {
                c.fillStyle = 'rgba(0,0,0,0.5)';
                c.fillRect(0, 0, cvs.width, cvs.height);
            } else if (activeBuildLayer === LAYER.FG) {
                c.fillStyle = 'rgba(255,255,255,0.3)';
                c.fillRect(0, 0, cvs.width, cvs.height);
            }
        } catch (e) { }
    },

    getClockFrac() {
        // time is 0..1, where 0 means 06:00
        // Convert to displayed fraction of day (0..1) with offset so 06:00 maps correctly
        return ((time + 0.25) % 1);
    },

    getTimeMinutesFloat() {
        // minutes since 00:00 in displayed clock (06:00 at time=0)
        return ((this.getClockFrac() * 1440) % 1440);
    },

    formatTimeHHMM(minsInt) {
        const hh = Math.floor(minsInt / 60) % 24;
        const mm = minsInt % 60;
        const pad = (n) => (n < 10 ? ('0' + n) : '' + n);
        return pad(hh) + ':' + pad(mm);
    },

    updateTimeHud() {
        const cont = document.getElementById('hud-time-container');
        const span = document.getElementById('hud-time');
        if (!cont || !span) return;
        if (!player || !player.inv) return;

        const hasClock = player.inv.has(ITEMS.CLOCK, 1);
        if (!hasClock) {
            cont.classList.add('hidden');
            return;
        }

        cont.classList.remove('hidden');
        // Beta 1.0: in the Nether, time is meaningless — show "??:??" and
        // skip the per-minute caching so the label stays sticky on dimension change.
        if (this.inNether) {
            if (this._lastHudMinute !== '??') {
                this._lastHudMinute = '??';
                span.innerText = 'Time: ??:??';
            }
            return;
        }
        const mins = Math.floor(this.getTimeMinutesFloat());
        if (this._lastHudMinute !== mins) {
            this._lastHudMinute = mins;
            span.innerText = 'Time: ' + this.formatTimeHHMM(mins);
        }
    },

    animateClockHotbar() {
        if (!this.toolbarCanvases) return;
        // Beta 1.0: in the Nether the clock spins continuously. Derive a
        // wall-clock-based fraction so the hands rotate visibly even when game
        // time stops being meaningful.
        const frac = this.inNether
            ? ((Date.now() / 600) % 1)
            : this.getClockFrac();
        for (let i = 0; i < 9; i++) {
            const slot = player.inv.slots[i];
            const cvs = this.toolbarCanvases[i];
            if (!cvs) continue;
            if (slot && slot.id === ITEMS.CLOCK) {
                const ctx = cvs.getContext('2d');
                ctx.clearRect(0, 0, cvs.width, cvs.height);
                drawClockIcon(ctx, frac);
            }
        }
    }
};

function getBlockColor(id) {
    if (BLOCKS[id]) return BLOCKS[id].color;
    if (id === ITEMS.STICK) return '#8d6e63';
    if (id === ITEMS.PICKAXE) return '#90caf9';
    return '#fff';
}

function getItemName(id) {
    const names = {
        [B.DIRT]: 'Dirt', [B.GRASS]: 'Grass', [B.STONE]: 'Stone', [B.WOOD]: 'Wood',
        [ITEMS.STICK]: 'Stick', [ITEMS.SHEARS]: 'Shears',
        [B.COAL_ORE]: 'Coal Ore', [B.IRON_ORE]: 'Iron Ore', [B.GOLD_ORE]: 'Gold Ore', [B.DIAMOND_ORE]: 'Diamond Ore',
        [ITEMS.PLANK]: 'Plank', [B.BRICK]: 'Brick', [B.CHEST]: 'Chest', [B.WORKBENCH]: 'Crafting Table', [B.FURNACE]: 'Furnace',
        [ITEMS.TORCH]: 'Torch', [ITEMS.APPLE]: 'Apple', [B.TORCH_PLACED]: 'Torch', [ITEMS.PAINTING]: 'Painting',
        [ITEMS.COAL]: 'Coal', [ITEMS.DIAMOND]: 'Diamond',
        [ITEMS.IRON_INGOT]: 'Iron Ingot', [ITEMS.GOLD_INGOT]: 'Gold Ingot', [ITEMS.EMERALD]: 'Emerald',
        [ITEMS.BREAD]: 'Bread', [ITEMS.CLOCK]: 'Clock',
        [B.COAL_BLOCK]: 'Coal Block', [B.IRON_BLOCK]: 'Iron Block', [B.GOLD_BLOCK]: 'Gold Block', [B.DIAMOND_BLOCK]: 'Diamond Block',

        [ITEMS.LEATHER]: 'Leather', [ITEMS.WHITE_WOOL]: 'White Wool',
        [B.ORANGE_WOOL]: 'Orange Wool', [B.MAGENTA_WOOL]: 'Magenta Wool',
        [B.LIGHT_BLUE_WOOL]: 'Light Blue Wool', [B.YELLOW_WOOL]: 'Yellow Wool',
        [B.LIME_WOOL]: 'Lime Wool', [B.PINK_WOOL]: 'Pink Wool',
        [B.GRAY_WOOL]: 'Gray Wool', [B.LIGHT_GRAY_WOOL]: 'Light Gray Wool',
        [B.CYAN_WOOL]: 'Cyan Wool', [B.PURPLE_WOOL]: 'Purple Wool',
        [B.BLUE_WOOL]: 'Blue Wool', [B.BROWN_WOOL]: 'Brown Wool',
        [B.GREEN_WOOL]: 'Green Wool', [B.RED_WOOL]: 'Red Wool',
        [B.BLACK_WOOL]: 'Black Wool',
        [ITEMS.PORK_RAW]: 'Raw Pork', [ITEMS.PORK_COOKED]: 'Cooked Pork',
        [ITEMS.BEEF_RAW]: 'Raw Beef', [ITEMS.BEEF_COOKED]: 'Steak',
        [ITEMS.MUTTON_RAW]: 'Raw Mutton', [ITEMS.MUTTON_COOKED]: 'Cooked Mutton',

        [ITEMS.WOOD_PICK]: 'Wood Pickaxe', [ITEMS.STONE_PICK]: 'Stone Pickaxe', [ITEMS.IRON_PICK]: 'Iron Pickaxe', [ITEMS.GOLD_PICK]: 'Gold Pickaxe', [ITEMS.DIAMOND_PICK]: 'Diamond Pickaxe',
        [ITEMS.WOOD_SWORD]: 'Wood Sword', [ITEMS.STONE_SWORD]: 'Stone Sword', [ITEMS.IRON_SWORD]: 'Iron Sword', [ITEMS.GOLD_SWORD]: 'Gold Sword', [ITEMS.DIAMOND_SWORD]: 'Diamond Sword',
        [ITEMS.WOOD_AXE]: 'Wood Axe', [ITEMS.STONE_AXE]: 'Stone Axe', [ITEMS.IRON_AXE]: 'Iron Axe', [ITEMS.GOLD_AXE]: 'Gold Axe', [ITEMS.DIAMOND_AXE]: 'Diamond Axe',
        [ITEMS.WOOD_SHOVEL]: 'Wood Shovel', [ITEMS.STONE_SHOVEL]: 'Stone Shovel', [ITEMS.IRON_SHOVEL]: 'Iron Shovel', [ITEMS.GOLD_SHOVEL]: 'Gold Shovel', [ITEMS.DIAMOND_SHOVEL]: 'Diamond Shovel',
        // V5: Hoes & farming
        [ITEMS.WOOD_HOE]: 'Wood Hoe', [ITEMS.STONE_HOE]: 'Stone Hoe', [ITEMS.IRON_HOE]: 'Iron Hoe', [ITEMS.GOLD_HOE]: 'Gold Hoe', [ITEMS.DIAMOND_HOE]: 'Diamond Hoe',
        [ITEMS.WHEAT_SEEDS]: 'Wheat Seeds', [ITEMS.WHEAT]: 'Wheat',
        [B.FARMLAND]: 'Farmland',
        [B.WHEAT_0]: 'Wheat', [B.WHEAT_1]: 'Wheat', [B.WHEAT_2]: 'Wheat', [B.WHEAT_3]: 'Wheat',
        [B.BED]: 'Bed',
        // V6: Buckets
        [ITEMS.BUCKET]: 'Bucket', [ITEMS.WATER_BUCKET]: 'Water Bucket', [ITEMS.LAVA_BUCKET]: 'Lava Bucket',
        // V7: Liquids
        [B.WATER_0]: 'Water', [B.WATER_1]: 'Water', [B.WATER_2]: 'Water', [B.WATER_3]: 'Water',
        [B.WATER_4]: 'Water', [B.WATER_5]: 'Water', [B.WATER_6]: 'Water', [B.WATER_7]: 'Water',
        [B.LAVA_0]: 'Lava', [B.LAVA_1]: 'Lava', [B.LAVA_2]: 'Lava', [B.LAVA_3]: 'Lava',
        [B.LAVA_4]: 'Lava', [B.LAVA_5]: 'Lava', [B.LAVA_6]: 'Lava', [B.LAVA_7]: 'Lava',
        // V10: Cobblestone, Glass, Bookshelf, Stairs, Slabs, Fences
        [B.COBBLESTONE]: 'Cobblestone', [B.GLASS]: 'Glass', [B.BOOKSHELF]: 'Bookshelf',
        [B.WOOD_STAIRS]: 'Wood Stairs', [B.COBBLE_STAIRS]: 'Cobblestone Stairs',
        [B.STONE_STAIRS]: 'Stone Stairs', [B.BRICK_STAIRS]: 'Brick Stairs',
        [B.WOOD_SLAB]: 'Wood Slab', [B.STONE_SLAB]: 'Stone Slab',
        [B.COBBLE_SLAB]: 'Cobblestone Slab', [B.BRICK_SLAB]: 'Brick Slab',
        [B.WOOD_FENCE]: 'Wood Fence', [B.COBBLE_FENCE]: 'Cobblestone Fence', [B.BRICK_FENCE]: 'Brick Fence',

        // V11: Clay block + new materials & containers
        [B.CLAY_BLOCK]: 'Clay Block',
        [ITEMS.FEATHER]: 'Feather', [ITEMS.BOOK]: 'Book', [ITEMS.FLINT]: 'Flint',
        [ITEMS.CLAY]: 'Clay', [ITEMS.STRING]: 'String', [ITEMS.BRICK_ITEM]: 'Brick',
        [ITEMS.GOLD_NUGGET]: 'Gold Nugget', [ITEMS.IRON_NUGGET]: 'Iron Nugget',
        [ITEMS.EMPTY_BOTTLE]: 'Empty Bottle', [ITEMS.WATER_BOTTLE]: 'Water Bottle',

        // V12: Doors, trapdoor, lever, ladder + new slab variants
        [B.WOOD_DOOR]: 'Wooden Door', [B.WOOD_TRAPDOOR]: 'Wooden Trapdoor', [B.WOOD_GATE]: 'Wooden Gate',
        [B.LEVER]: 'Lever', [B.LADDER]: 'Ladder',
        [B.DIRT_SLAB]: 'Dirt Slab', [B.SAND_SLAB]: 'Sand Slab',
        [B.GLASS_SLAB]: 'Glass Slab', [B.BOOKSHELF_SLAB]: 'Bookshelf Slab',

        // V13: Jukebox + music discs
        [B.JUKEBOX]: 'Jukebox',
        [ITEMS.MUSIC_DISC_NOSTALGIC]: 'Music Disc — Nostalgic Action',
        [ITEMS.MUSIC_DISC_QUIRKY]:    'Music Disc — Quirky & Funky',

        // V14: Flowers & plants
        [B.POPPY]: 'Poppy', [B.DANDELION]: 'Dandelion',
        [B.BLUE_ORCHID]: 'Blue Orchid', [B.ALLIUM]: 'Allium',
        [B.AZURE_BLUET]: 'Azure Bluet',
        [B.RED_TULIP]: 'Red Tulip', [B.ORANGE_TULIP]: 'Orange Tulip',
        [B.WHITE_TULIP]: 'White Tulip', [B.PINK_TULIP]: 'Pink Tulip',
        [B.OXEYE_DAISY]: 'Oxeye Daisy', [B.CORNFLOWER]: 'Cornflower',
        [B.LILY_OF_THE_VALLEY]: 'Lily of the Valley',
        [B.SUNFLOWER_BOTTOM]: 'Sunflower', [B.SUNFLOWER_TOP]: 'Sunflower',
        [B.LILAC_BOTTOM]: 'Lilac', [B.LILAC_TOP]: 'Lilac',
        [B.ROSE_BUSH_BOTTOM]: 'Rose Bush', [B.ROSE_BUSH_TOP]: 'Rose Bush',
        [B.PEONY_BOTTOM]: 'Peony', [B.PEONY_TOP]: 'Peony',
        [B.SHORT_GRASS]: 'Grass', [B.TALL_GRASS_BOTTOM]: 'Tall Grass', [B.TALL_GRASS_TOP]: 'Tall Grass',
        [B.TNT]: 'TNT', [ITEMS.FLINT_AND_STEEL]: 'Flint and Steel',
        [B.SUGARCANE]: 'Sugarcane', [ITEMS.SUGAR]: 'Sugar', [ITEMS.PAPER]: 'Paper', [ITEMS.GUNPOWDER]: 'Gunpowder',
        [ITEMS.GLOWSTONE_DUST]: 'Glowstone Dust',

        // V14: Snow biome
        [B.SNOW_BLOCK]: 'Snow Block', [B.SNOW_LAYER]: 'Snow Layer',
        [B.ICE]: 'Ice', [B.PACKED_ICE]: 'Packed Ice',

        // Beta 1.1: Desert / Beach
        [B.CACTUS]: 'Cactus', [B.DEAD_BUSH]: 'Dead Bush', [B.SANDSTONE]: 'Sandstone',

        // V14: Dyes
        [ITEMS.WHITE_DYE]: 'White Dye', [ITEMS.ORANGE_DYE]: 'Orange Dye',
        [ITEMS.MAGENTA_DYE]: 'Magenta Dye', [ITEMS.LIGHT_BLUE_DYE]: 'Light Blue Dye',
        [ITEMS.YELLOW_DYE]: 'Yellow Dye', [ITEMS.LIME_DYE]: 'Lime Dye',
        [ITEMS.PINK_DYE]: 'Pink Dye', [ITEMS.GRAY_DYE]: 'Gray Dye',
        [ITEMS.LIGHT_GRAY_DYE]: 'Light Gray Dye', [ITEMS.CYAN_DYE]: 'Cyan Dye',
        [ITEMS.PURPLE_DYE]: 'Purple Dye', [ITEMS.BLUE_DYE]: 'Blue Dye',
        [ITEMS.BROWN_DYE]: 'Brown Dye', [ITEMS.GREEN_DYE]: 'Green Dye',
        [ITEMS.RED_DYE]: 'Red Dye', [ITEMS.BLACK_DYE]: 'Black Dye',

        // Armor
        [ITEMS.LEATHER_HELMET]: 'Leather Cap',        [ITEMS.LEATHER_CHESTPLATE]: 'Leather Tunic',       [ITEMS.LEATHER_BOOTS]: 'Leather Boots',
        [ITEMS.CHAIN_HELMET]:   'Chainmail Helmet',   [ITEMS.CHAIN_CHESTPLATE]:   'Chainmail Chestplate',[ITEMS.CHAIN_BOOTS]:   'Chainmail Boots',
        [ITEMS.IRON_HELMET]:    'Iron Helmet',        [ITEMS.IRON_CHESTPLATE]:    'Iron Chestplate',     [ITEMS.IRON_BOOTS]:    'Iron Boots',
        [ITEMS.GOLD_HELMET]:    'Golden Helmet',      [ITEMS.GOLD_CHESTPLATE]:    'Golden Chestplate',   [ITEMS.GOLD_BOOTS]:    'Golden Boots',
        [ITEMS.DIAMOND_HELMET]: 'Diamond Helmet',     [ITEMS.DIAMOND_CHESTPLATE]: 'Diamond Chestplate',  [ITEMS.DIAMOND_BOOTS]: 'Diamond Boots',

        // V16: Mob drops & new items
        [ITEMS.SPIDER_EYE]: 'Spider Eye',
        [ITEMS.ROTTEN_FLESH]: 'Rotten Flesh',
        [ITEMS.BONE]: 'Bone',
        [ITEMS.BONE_MEAL]: 'Bone Meal',
        [ITEMS.BOW]: 'Bow',
        [ITEMS.ARROW]: 'Arrow',
        [ITEMS.ENDER_PEARL]: 'Ender Pearl',

        // Beta 1.0: Nether
        [B.NETHERRACK]: 'Netherrack',
        [B.SOUL_SAND]: 'Soul Sand',
        [B.MAGMA_BLOCK]: 'Magma Block',
        [B.NETHER_BRICK]: 'Nether Bricks',
        [B.QUARTZ_ORE]: 'Nether Quartz Ore',
        [B.QUARTZ_BLOCK]: 'Block of Quartz',
        [B.GLOWSTONE]: 'Glowstone',
        [B.PORTAL]: 'Nether Portal',
        [ITEMS.QUARTZ]: 'Nether Quartz',
        [ITEMS.GHAST_TEAR]: 'Ghast Tear',
        [ITEMS.FIRE_CHARGE]: 'Fire Charge',
    };
    return names[id] || 'Item';
}

// --- LOOP ---
let rafId = null;
function requestLoop() {
    // Avoid accidentally creating multiple concurrent RAF loops.
    if (rafId === null) rafId = requestAnimationFrame(loop);
}


function loop() {
    rafId = null;
    if (!gameRunning) return;
    try {
        // FPS counter
        const now = performance.now();
        if (game._lastFrame) {
            game._fpsTimer += (now - game._lastFrame);
            game._fpsCount++;
            if (game._fpsTimer >= 500) {
                game.fps = Math.round(1000 * game._fpsCount / game._fpsTimer);
                game._fpsTimer = 0;
                game._fpsCount = 0;
            }
        }
        game._lastFrame = now;

        update();
        draw();
    } catch (e) {
        console.error("Game Loop Error:", e);
    }
    requestLoop();
}

// =========================================================
// V12: ORIENTATION HELPERS (torches, levers, ladders, doors, stairs, logs)
// =========================================================

// Block IDs whose placement is rotation-aware (preview at cursor + persisted on place).
const ROTATABLE_BLOCKS = new Set([
    B.WOOD, // logs: rot 0 (vertical) | 1 (horizontal)
    B.WOOD_STAIRS, B.COBBLE_STAIRS, B.STONE_STAIRS, B.BRICK_STAIRS,
    B.WOOD_DOOR, B.WOOD_TRAPDOOR, B.WOOD_GATE,
]);

// V12: rotation of the *next* block placement, controlled by R/F before clicking.
// 0..3 = 0°/90°/180°/270° clockwise. Shown as a semi-transparent preview at the cursor.
let pendingRotation = 0;

function blockMetaKey(tx, ty, layer) {
    return `${tx},${ty},${(layer === undefined ? LAYER.MID : layer)}`;
}
function getBlockMeta(tx, ty, layer) {
    if (!world || !world.blockMeta) return null;
    return world.blockMeta[blockMetaKey(tx, ty, layer)] || null;
}
function setBlockMeta(tx, ty, meta, layer) {
    if (!world.blockMeta) world.blockMeta = {};
    if (!meta) {
        delete world.blockMeta[blockMetaKey(tx, ty, layer)];
        return;
    }
    world.blockMeta[blockMetaKey(tx, ty, layer)] = meta;
}

// Returns 'up'|'right'|'down'|'left' based on where on the tile the click hit.
// Used to decide which face a torch/lever attaches to.
function pickedTileEdge(worldMx, worldMy, tx, ty) {
    const lx = worldMx - tx * TILE_SIZE; // 0..TILE_SIZE
    const ly = worldMy - ty * TILE_SIZE;
    // Distance from each edge
    const distTop = ly;
    const distBot = TILE_SIZE - ly;
    const distLeft = lx;
    const distRight = TILE_SIZE - lx;
    const min = Math.min(distTop, distBot, distLeft, distRight);
    if (min === distTop) return 'up';
    if (min === distBot) return 'down';
    if (min === distLeft) return 'left';
    return 'right';
}

// True if tx,ty has a solid (non-pass) MID block we can attach to.
function isSolidAt(tx, ty) {
    const id = world.getTile(tx, ty);
    if (id === B.AIR) return false;
    const b = BLOCKS[id];
    return !!(b && !b.pass);
}
function isSolidBgAt(tx, ty) {
    const id = world.getTile(tx, ty, LAYER.BG);
    if (id === B.AIR) return false;
    const b = BLOCKS[id];
    return !!(b && !b.pass);
}

// Beta 1.0: Nether portal helpers.
// A valid portal frame on a given layer is a 2×3 AIR interior surrounded by
// OBSIDIAN on all 4 sides (corners optional). That's exactly 10 obsidian blocks.
// Returns { cells: [[x,y],...], layer } on success, null on failure.
function detectPortalFrame(sx, sy, layer) {
    const get = (x, y) => world.getTile(x, y, layer);
    if (get(sx, sy) !== B.AIR) return null;

    // Flood-fill connected AIR cells, bounded so a giant cave can't be misread as a frame.
    const visited = new Set();
    const stack = [[sx, sy]];
    const cells = [];
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const k = `${x},${y}`;
        if (visited.has(k)) continue;
        visited.add(k);
        if (get(x, y) !== B.AIR) continue;
        cells.push([x, y]);
        if (cells.length > 8) return null;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (cells.length !== 6) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of cells) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w !== 2 || h !== 3) return null;

    // Top + bottom edges must be obsidian.
    for (let dx = 0; dx < w; dx++) {
        if (get(minX + dx, minY - 1) !== B.OBSIDIAN) return null;
        if (get(minX + dx, maxY + 1) !== B.OBSIDIAN) return null;
    }
    // Left + right edges must be obsidian.
    for (let dy = 0; dy < h; dy++) {
        if (get(minX - 1, minY + dy) !== B.OBSIDIAN) return null;
        if (get(maxX + 1, minY + dy) !== B.OBSIDIAN) return null;
    }
    return { cells, layer };
}

// Beta 1.0: When an obsidian block is broken, any portal that used it as part
// of its frame must extinguish. We flood-fill PORTAL cells (in all 3 layers)
// reachable from the 4 neighbors and convert them back to AIR. Limited to a
// small area so a faraway portal doesn't get nuked by an unrelated break.
function extinguishNearbyPortal(bx, by) {
    const visited = new Set();
    const stack = [[bx - 1, by], [bx + 1, by], [bx, by - 1], [bx, by + 1]];
    const isPortal = (x, y) => (
        world.getTile(x, y) === B.PORTAL ||
        world.getTile(x, y, LAYER.BG) === B.PORTAL ||
        world.getTile(x, y, LAYER.FG) === B.PORTAL
    );
    while (stack.length) {
        const [x, y] = stack.pop();
        const k = `${x},${y}`;
        if (visited.has(k)) continue;
        visited.add(k);
        if (visited.size > 24) break; // safety cap
        if (!isPortal(x, y)) continue;
        // Clear PORTAL on every layer at this cell.
        for (const layer of [LAYER.MID, LAYER.BG, LAYER.FG]) {
            if (world.getTile(x, y, layer) === B.PORTAL) {
                world.setTile(x, y, B.AIR, layer);
            }
        }
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
}

// Try to light a Nether portal centered near (tx,ty). Searches each layer
// where obsidian could be placed (BG, FG, MID).
function tryLightPortal(tx, ty) {
    // Candidate seed cells — the AIR cells adjacent to or at the click location.
    const seeds = [[tx, ty], [tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty]];
    for (const layer of [LAYER.BG, LAYER.FG, LAYER.MID]) {
        for (const [sx, sy] of seeds) {
            const result = detectPortalFrame(sx, sy, layer);
            if (result) {
                for (const [x, y] of result.cells) {
                    world.setTile(x, y, B.PORTAL, layer);
                }
                game.audio.playSound('place');
                for (let i = 0; i < 24; i++) {
                    const [cx, cy] = result.cells[(Math.random() * result.cells.length) | 0];
                    game.particles.push(new Particle(
                        cx * TILE_SIZE + Math.random() * TILE_SIZE,
                        cy * TILE_SIZE + Math.random() * TILE_SIZE,
                        ['#7b1fa2', '#ba68c8', '#e1bee7'][(Math.random() * 3) | 0],
                        { type: 'spark', speed: 1.2, life: 0.9, decay: 0.04, gravity: -0.04 }
                    ));
                }
                return true;
            }
        }
    }
    return false;
}

// Rotate a direction 90° clockwise/counter-clockwise.
const _DIR_CW = { up: 'right', right: 'down', down: 'left', left: 'up' };
const _DIR_CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
function rotateDir(dir, clockwise) {
    return clockwise ? (_DIR_CW[dir] || 'up') : (_DIR_CCW[dir] || 'up');
}

// Doors are 2 tiles tall. Toggling either half toggles both.
// V13: Music disc helpers
function isMusicDisc(itemId) {
    return itemId === ITEMS.MUSIC_DISC_NOSTALGIC || itemId === ITEMS.MUSIC_DISC_QUIRKY;
}

// Eject the disc currently inside the jukebox at (tx, ty), stop its music,
// return the disc to the player's inventory, and clear the block meta.
// No-op if the jukebox is empty.
function ejectJukeboxDisc(tx, ty) {
    const meta = getBlockMeta(tx, ty, LAYER.MID);
    if (!meta || !meta.disc) return;
    const discId = meta.disc;
    game.audio.stopMusicDisc(tx, ty);
    // This game has no ground-item entities — drops land directly in the
    // player's inventory, matching how chests/furnaces eject content.
    player.inv.add(discId, 1);
    setBlockMeta(tx, ty, null, LAYER.MID);
    game.audio.playSound('break');
    game.updateHUD();
}

function toggleDoor(tx, ty) {
    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed', half: 'bottom' };
    const otherDy = (m.half === 'top') ? 1 : -1; // top half: other is below; bottom half: above
    const otherTy = ty + otherDy;
    const m2 = getBlockMeta(tx, otherTy, LAYER.MID);
    const newState = (m.state === 'open') ? 'closed' : 'open';
    m.state = newState;
    setBlockMeta(tx, ty, m, LAYER.MID);
    if (m2 && world.getTile(tx, otherTy) === B.WOOD_DOOR) {
        m2.state = newState;
        setBlockMeta(tx, otherTy, m2, LAYER.MID);
    }
}

// Returns true if the tile is part of a door that is *closed*.
// Used by isSolid() to make closed doors block movement and open ones pass-through.
function isDoorBlocking(x, y) {
    if (!world || !world.blockMeta) return false;
    const t = world.getTile(x, y);
    if (t !== B.WOOD_DOOR) return false;
    const m = world.blockMeta[`${x},${y},${LAYER.MID}`];
    return !m || m.state !== 'open';
}

// Trapdoor: closed = solid floor, open = passable.
function isTrapdoorBlocking(x, y) {
    if (!world || !world.blockMeta) return false;
    const t = world.getTile(x, y);
    if (t !== B.WOOD_TRAPDOOR && t !== B.WOOD_GATE) return false;
    const m = world.blockMeta[`${x},${y},${LAYER.MID}`];
    return !m || m.state !== 'open';
}

// =========================================================

function update() {
    // V4: отслеживаем переход из ночи в день (для ачивки Night Survivor).
    const wasNight = (time >= 0.5 && time < 0.95);
    time += 1 / dayLen;
    if (time >= 1) {
        time = 0;
        day++;
        stats.nightsSurvived = (stats.nightsSurvived || 0) + 1;
        game.sysMessage(`Day ${day}`);
        if (day % 1 === 0) game.save();
    }
    stats.timePlayed++;

    // --- Audio Logic ---
    // Adaptive music: choose mode by player location & time of day.
    const _onSurface = player.y < (45 + WORLD_OFFSET_Y) * TILE_SIZE;
    const _deepCave = player.y > (60 + WORLD_OFFSET_Y) * TILE_SIZE;
    const _isNight = (time >= 0.55 && time < 0.92);
    const desiredMode = _deepCave ? 'cave' : (_isNight ? 'night' : 'day');

    // V13: Schedule next song after a long, Minecraft-style silence (2–7 min
    // on the surface, longer in caves). Discs playing in a jukebox suppress
    // the background music entirely.
    const remaining = game.audio.musicTimeRemaining();
    const discsPlaying = Object.keys(game.audio.activeDiscs || {}).length > 0;
    if (discsPlaying) {
        // Pause/stop background music while a jukebox is playing.
        if (game.audio.currentMusicElement) game.audio._stopCurrentMusic();
        game._musicGap = null;
    } else if (remaining < 0.5) {
        // Minecraft-like: 2–7 min gap between tracks on the surface, up to
        // ~10 min in caves.
        const gap =
            desiredMode === 'cave' ? 240 + Math.random() * 360 :
                desiredMode === 'night' ? 150 + Math.random() * 280 :
                    120 + Math.random() * 300;
        // 60 fps → tick = ~16.66ms.
        if (game._musicGap == null) game._musicGap = gap * 60;
        game._musicGap--;
        if (game._musicGap <= 0) {
            game.audio.playMusic(desiredMode);
            game._musicGap = null;
        }
    } else {
        game._musicGap = null;
    }

    // V13: spatial volume/pan updates for active jukebox discs.
    if (game.audio.updateDiscAudio) {
        game.audio.updateDiscAudio(player.x + player.w / 2, player.y + player.h / 2);
    }

    // Cave one-shot ambience (drips, moans) while underground.
    if (_deepCave) {
        caveSoundTimer--;
        if (caveSoundTimer <= 0) {
            game.audio.playCaveAmbience();
            caveSoundTimer = 1400 + Math.random() * 2200;
        }
    }

    // Continuous ambient layers — wind on surface, cave drone underground,
    // crickets at night. Crossfaded smoothly inside setAmbient().
    if (game._ambientUpdate == null) game._ambientUpdate = 0;
    game._ambientUpdate--;
    if (game._ambientUpdate <= 0) {
        game._ambientUpdate = 60; // refresh every ~1 second
        const amb = {
            wind: _onSurface && !_deepCave ? 0.6 + 0.4 * Math.sin(Date.now() / 14000) : 0.0,
            cave: _deepCave ? 1.0 : (player.y > (50 + WORLD_OFFSET_Y) * TILE_SIZE ? 0.3 : 0),
            crickets: (_onSurface && _isNight) ? 1.0 : 0.0,
        };
        game.audio.setAmbient(amb);
    }

    // Day birds: rare random chirps during daytime on the surface.
    if (game._birdTimer == null) game._birdTimer = 240;
    if (_onSurface && !_isNight) {
        game._birdTimer--;
        if (game._birdTimer <= 0) {
            // Pan = signed -1..1 across screen.
            const pan = (Math.random() - 0.5) * 1.4;
            game.audio.playBird(pan);
            game._birdTimer = 360 + (Math.random() * 600 | 0);
        }
    } else {
        game._birdTimer = 240; // reset when not eligible
    }

    // Distant thunder: very rare, only at night.
    if (_isNight && _onSurface && Math.random() < 0.0008) {
        game.audio.playThunder();
    }

    player.control(keys);
    player.update(1, world);

    // V7: проверка на контакт с жидкостями (каждый кадр)
    {
        // Определяем, в какой жидкости игрок — проверяем все клетки, которые он занимает
        const minTX = Math.floor(player.x / TILE_SIZE);
        const maxTX = Math.floor((player.x + player.w - 0.01) / TILE_SIZE);
        const minTY = Math.floor(player.y / TILE_SIZE);
        const maxTY = Math.floor((player.y + player.h - 0.01) / TILE_SIZE);
        let inW = false, inL = false, inF = false, touchingCactus = false;
        for (let tyC = minTY; tyC <= maxTY; tyC++) {
            for (let txC = minTX; txC <= maxTX; txC++) {
                const t = world.getTile(txC, tyC);
                if (isWater(t)) inW = true;
                if (isLava(t)) inL = true;
                if (t === B.FIRE) inF = true;
                if (t === B.CACTUS) touchingCactus = true;
            }
        }
        player.inWater = inW;
        player.inLava = inL;

        // Beta 1.1: Cactus contact damage (Minecraft-style). 0.5 HP per "second"
        // worth of contact — мы режем по полусекундам через таймер, чтобы дамаг
        // не накапливался каждый кадр.
        if (touchingCactus && !player.flying && !player.dead && !player.invincible) {
            player._cactusTimer = (player._cactusTimer || 0) - 1;
            if (player._cactusTimer <= 0) {
                game.damagePlayer(1);
                player._cactusTimer = 30; // ~0.5 sec at 60fps
            }
        } else {
            player._cactusTimer = 0;
        }

        // Замедление в воде: уменьшаем vx/vy (не в режиме полёта/noclip)
        if (inW && !player.flying && !player.dead) {
            player.vx *= 0.6;
            // вода гасит набранную "высоту падения" — никакого fall damage из-под воды.
            player.fallStartY = player.y;
            // плавучесть: медленнее падает, можно "плыть" вверх пробелом
            if (player.vy > 1.5) player.vy = 1.5;
            // Можно "грести" вверх только если голова игрока находится в "толстой"
            // воде. Раньше любой пиксель воды у ног позволял подниматься вверх
            // бесконечно — игрок выплывал из любой лужи. Теперь нужна вода
            // на уровне головы И уровень потока ≤ 4 (т.е. реально по горло).
            let canSwimUp = false;
            const headTX = Math.floor((player.x + player.w / 2) / TILE_SIZE);
            const headTY = Math.floor((player.y + 8) / TILE_SIZE);
            const headTile = world.getTile(headTX, headTY);
            if (isWater(headTile)) {
                const lvl = headTile - B.WATER_0;
                if (lvl <= 4) canSwimUp = true;
            }
            if (canSwimUp && (keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && !game.isUiOpen()) {
                player.vy = -2.5;
            }
            // гасим таймер горения если зашёл в воду
            if (player.burnTimer > 0) {
                player.burnTimer = 0;
                // пара пузырьков пара
                for (let i = 0; i < 6; i++) {
                    game.particles.push(new Particle(
                        player.x + player.w / 2 + (Math.random() - 0.5) * player.w,
                        player.y + player.h / 2 + (Math.random() - 0.5) * player.h,
                        'rgba(200,220,255,0.8)',
                        {
                            type: 'smoke', vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random() * 0.5,
                            life: 0.7, decay: 0.04, size: 2 + Math.random() * 2, gravity: -0.03, drag: 0.97
                        }
                    ));
                }
            }
        }

        if (inL && !player.flying && !player.dead && !player.invincible) {
            player.lavaDamageTimer--;
            if (player.lavaDamageTimer <= 0) {
                game.damagePlayer(2);
                player.lavaDamageTimer = 15;
            }
            player.burnTimer = Math.max(player.burnTimer, 480);
            // слегка тормозит как вязкая
            player.vx *= 0.7;
            if (player.vy > 1.2) player.vy = 1.2;
        } else if (inF && !player.flying && !player.dead && !player.invincible) {
            player.burnTimer = Math.max(player.burnTimer, 180);
        }

        // Горение — тикаем, даже если игрок уже не в лаве
        if (player.burnTimer > 0 && !player.dead) {
            player.burnTimer--;
            // Урон 1 HP каждые 30 кадров (≈2 раза в секунду)
            if (!player.invincible && (player.burnTimer % 30) === 0) {
                game.damagePlayer(1);
            }
            // VFX пламя на игроке
            if (Math.random() < 0.7) {
                game.particles.push(new Particle(
                    player.x + Math.random() * player.w,
                    player.y + Math.random() * player.h,
                    '#ff6f00',
                    {
                        type: 'flame', vx: (Math.random() - 0.5) * 0.3, vy: -1 - Math.random() * 0.5,
                        life: 0.5, decay: 0.06, size: 2 + Math.random() * 1.5, gravity: -0.05, drag: 0.96
                    }
                ));
            }
        }

        // Beta 1.0: Nether portal detection — check BG/FG/MID for a PORTAL tile
        // overlapping the player. After 60 frames (~1 s) of standing in one,
        // begin the teleport effect.
        if (player.portalCooldown > 0) player.portalCooldown--;
        let inPortal = false;
        for (let tyC = minTY; tyC <= maxTY && !inPortal; tyC++) {
            for (let txC = minTX; txC <= maxTX; txC++) {
                if (world.getTile(txC, tyC) === B.PORTAL ||
                    world.getTile(txC, tyC, LAYER.BG) === B.PORTAL ||
                    world.getTile(txC, tyC, LAYER.FG) === B.PORTAL) {
                    inPortal = true;
                    break;
                }
            }
        }
        if (inPortal && !player.dead && !game.teleporting && player.portalCooldown <= 0) {
            player.portalTimer = (player.portalTimer || 0) + 1;
            // Wobble particles + screen tint kick in immediately.
            if (player.portalTimer > 6 && Math.random() < 0.4) {
                game.particles.push(new Particle(
                    player.x + Math.random() * player.w,
                    player.y + Math.random() * player.h,
                    ['#7b1fa2', '#ba68c8', '#e1bee7'][(Math.random() * 3) | 0],
                    {
                        type: 'spark', vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
                        life: 0.7, decay: 0.05, size: 2 + Math.random() * 1.5, gravity: 0, drag: 0.95
                    }
                ));
            }
            if (player.portalTimer >= 60) {
                game.beginNetherTeleport();
                player.portalTimer = 0;
            }
        } else {
            // Decay quickly when stepping out, so a brief touch doesn't keep counting.
            if (player.portalTimer > 0) player.portalTimer = Math.max(0, player.portalTimer - 4);
        }
    }

    // Mobs logic - ночь с 0.5 до 1.0
    let isNight = time >= 0.5;

    // Difficulty: 0=Peaceful, 1=Easy, 2=Normal, 3=Hard
    // Peaceful — никаких враждебных мобов вообще; постоянно подчищаем, если что-то осталось.
    if (game.difficulty === 0) {
        if (enemies.length > 0) enemies.length = 0;
    } else if (!game.inNether) {
        // Свет-ориентированный спавн (как в Minecraft): враждебные мобы появляются
        // в местах с уровнем освещённости ≤ 7. Ночью на поверхности это работает
        // автоматически (sky light падает с 15 до ~4), а днём — только в пещерах
        // и тёмных карманах. Мобы НЕ появляются в Незере здесь — там свой пул
        // (zombie pigmen / ghasts), который тикается ниже.
        const spawnChance = [0, 0.006, 0.011, 0.020][game.difficulty];
        const maxEnemies = [0, 6, 10, 15][game.difficulty];
        if (Math.random() < spawnChance && enemies.length < maxEnemies) {
            // V16: type weights — 0 zombie, 1 spider, 2 skeleton, 3 enderman.
            const roll = Math.random();
            let type;
            if (roll < 0.40) type = 0;        // 40% zombie
            else if (roll < 0.65) type = 1;   // 25% spider
            else if (roll < 0.90) type = 2;   // 25% skeleton
            else type = 3;                    // 10% enderman
            // Перебираем несколько позиций вокруг игрока: 12..30 блоков по X
            // от игрока на случайной высоте. Берём первую, которая удовлетворяет
            // условиям: AIR + AIR с твёрдым полом и темно (свет ≤ 7).
            const playerTX = Math.floor((player.x + player.w / 2) / TILE_SIZE);
            const playerTY = Math.floor((player.y + player.h / 2) / TILE_SIZE);
            const MAX_TRIES = 8;
            for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
                const distance = 12 + ((Math.random() * 18) | 0);   // 12..30 тайлов
                const dir = Math.random() < 0.5 ? -1 : 1;
                const tryTx = playerTX + dir * distance;
                if (tryTx <= 1 || tryTx >= world.w - 2) continue;
                // По Y берём диапазон ±10 от игрока — позволяет спавн и под, и над землёй.
                const yOffset = -10 + ((Math.random() * 21) | 0);
                const tryCenterTY = Math.max(2, Math.min(world.h - 4, playerTY + yOffset));
                // Найдём ближайший «пол» в этом столбце (опускаемся вниз).
                let groundTY = -1;
                for (let y = tryCenterTY; y < world.h - 2; y++) {
                    if (world.isSolid(tryTx, y)) {
                        // Над полом нужны 2 свободные клетки.
                        if (!world.isSolid(tryTx, y - 1) && !world.isSolid(tryTx, y - 2)) {
                            groundTY = y;
                        }
                        break;
                    }
                }
                if (groundTY < 0) continue;
                const standTY = groundTY - 1;
                // Уровень света в клетке, где встанет моб.
                const light = world.getSpawnLight(tryTx, standTY);
                if (light > 7) continue;
                // Slime/паук-голова: не спавним слишком близко к игроку (даже если темно).
                const dxAbs = Math.abs(tryTx - playerTX);
                if (dxAbs < 6) continue;
                // Готово — создаём моба.
                const ex = tryTx * TILE_SIZE;
                const ey = groundTY * TILE_SIZE;
                const en = new Enemy(ex, ey, type);
                en.y = ey - en.h;
                enemies.push(en);
                break;
            }
        }
    }
    game.updateTimeHud();
    game.animateClockHotbar();
    // Дневной despawn враждебных мобов на поверхности: если игрок и моб одновременно
    // под открытым небом и день — потихоньку удаляем (как «day burn» в Minecraft).
    if (!isNight && enemies.length > 0 && Math.random() < 0.01) {
        // Удаляем именно того, кто на свету — оставляя пещерных мобов жить.
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            const etx = Math.floor((e.x + e.w / 2) / TILE_SIZE);
            const ety = Math.floor((e.y + e.h / 2) / TILE_SIZE);
            const lite = world.getSpawnLight(etx, ety);
            if (lite > 11) {
                enemies.splice(i, 1);
                break;
            }
        }
    }

    // Spawn Passive (Day only)
    if (!isNight && Math.random() < 0.002 && passives.length < 5) {
        let type = Math.floor(Math.random() * 3);
        let ex = player.x + (Math.random() > 0.5 ? 400 : -400);
        let tx = Math.floor(ex / TILE_SIZE);
        if (tx > 0 && tx < world.w) {
            let ey = 0;
            let found = false;
            for (let y = 0; y < world.h; y++) {
                // Spawn on Grass
                if (world.getTile(tx, y) === B.GRASS && !world.isSolid(tx, y - 1)) { ey = (y - 1) * TILE_SIZE; found = true; break; }
            }
            if (found) passives.push(new PassiveMob(ex, ey, type));
        }
    }

    // V16: Enderman stare-aggro. The player's cursor in world coords must hover
    // inside the enderman's head AABB for ~60 frames (~1s) without leaving it.
    // Once aggro'd, the enderman stays hostile.
    const _cz = (typeof getEffectiveZoom === 'function') ? getEffectiveZoom() : 1;
    const _wMx = (mouse.x / _cz) + camX;
    const _wMy = (mouse.y / _cz) + camY;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.type !== 3) continue;
        if (e.aggro) continue;
        // Head AABB: top 16 px of the enderman.
        const hx = e.x, hy = e.y, hw = e.w, hh = 16;
        const looking = (_wMx >= hx && _wMx < hx + hw && _wMy >= hy && _wMy < hy + hh);
        if (looking) {
            e.starredTime = (e.starredTime || 0) + 1;
            if (e.starredTime >= 60) {
                e.aggro = true;
                if (typeof VFX !== 'undefined' && VFX.mobPanic) {
                    VFX.mobPanic(e.x + e.w / 2, e.y);
                }
                if (game && game.audio) game.audio.playSound('mob_panic', e.x);
            }
        } else {
            e.starredTime = 0;
        }
    }

    // Reverse loop for safe removal
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        e.ai(1, world, player);
        e.update(1, world);
        if (e.dead) enemies.splice(i, 1);
    }

    for (let i = passives.length - 1; i >= 0; i--) {
        let e = passives[i];
        e.update(1, world);
        if (e.dead) passives.splice(i, 1);
    }

    // V16: tick projectiles
    if (typeof arrows !== 'undefined') {
        for (let i = arrows.length - 1; i >= 0; i--) {
            arrows[i].update(1, world);
            if (arrows[i].dead) arrows.splice(i, 1);
        }
    }
    if (typeof pearls !== 'undefined') {
        for (let i = pearls.length - 1; i >= 0; i--) {
            pearls[i].update(1, world);
            if (pearls[i].dead) pearls.splice(i, 1);
        }
    }

    // Beta 1.0: Nether mobs + fireballs.
    if (game.inNether) {
        for (let i = pigmen.length - 1; i >= 0; i--) {
            pigmen[i].update(1, world);
            if (pigmen[i].dead) pigmen.splice(i, 1);
        }
        for (let i = ghasts.length - 1; i >= 0; i--) {
            ghasts[i].update(1, world);
            if (ghasts[i].dead) ghasts.splice(i, 1);
        }
        // Постоянный спавн зомби-пиглинов в Незере. Свет в Незере приходит только
        // от глоустоуна, лавы и огня, поэтому большинство клеток темнее 7 — мобы
        // органично появляются в пещерах. Лимит и шанс зависят от сложности.
        if (game.difficulty > 0) {
            const pigChance = [0, 0.004, 0.008, 0.014][game.difficulty];
            const maxPigs = [0, 8, 14, 22][game.difficulty];
            if (Math.random() < pigChance && pigmen.length < maxPigs) {
                const playerTX = Math.floor((player.x + player.w / 2) / TILE_SIZE);
                for (let attempt = 0; attempt < 6; attempt++) {
                    const dist = 12 + ((Math.random() * 25) | 0);
                    const dir = Math.random() < 0.5 ? -1 : 1;
                    const tryTx = playerTX + dir * dist;
                    if (tryTx <= 1 || tryTx >= world.w - 2) continue;
                    const groundTY = findNetherSafeY(tryTx);
                    if (groundTY < 4 || groundTY >= world.h - 3) continue;
                    const standTY = groundTY - 1;
                    if (world.isSolid(tryTx, standTY) || world.isSolid(tryTx, standTY - 1)) continue;
                    const light = world.getSpawnLight(tryTx, standTY);
                    if (light > 7) continue;
                    pigmen.push(new Pigman(tryTx * TILE_SIZE + 4, (groundTY - 2) * TILE_SIZE));
                    break;
                }
            }
        }
    }
    // Fireballs travel and explode even after caster despawns.
    for (let i = fireballs.length - 1; i >= 0; i--) {
        fireballs[i].update(1, world);
        if (fireballs[i].dead) fireballs.splice(i, 1);
    }

    // Beta 1.0: Tick the teleport-into-Nether overlay. ~90 frames total;
    // at frame 45 we actually swap dimensions, then the overlay fades out.
    if (game.teleporting) {
        game.teleportFrame = (game.teleportFrame || 0) + 1;
        if (game.teleportFrame === 45) {
            game.doNetherTeleport();
        }
        if (game.teleportFrame >= 90) {
            game.teleporting = false;
            game.teleportFrame = 0;
        }
    }

    // Furnace Logic
    for (let k in world.furnaces) {
        let f = world.furnaces[k];
        let changed = false;
        if (f.burn > 0) {
            f.burn--;
            if (f.burn <= 0) changed = true;
        }

        if (f.burn > 0 && f.input && (!f.output || (f.output.id === SMELT_RECIPES[f.input.id] && f.output.count < getMaxStack(f.output.id)))) {
            f.cook++;
            if (f.cook >= 200) { // Cooked
                f.cook = 0;
                let res = SMELT_RECIPES[f.input.id];
                f.input.count--;
                if (f.input.count <= 0) f.input = null;

                if (!f.output) f.output = { id: res, count: 1 };
                else f.output.count++;
                changed = true;
            }
        } else {
            f.cook = 0;
        }

        if (f.burn <= 0 && f.input && f.fuel && SMELT_RECIPES[f.input.id]) {
            if (!f.output || (f.output.id === SMELT_RECIPES[f.input.id] && f.output.count < getMaxStack(f.output.id))) {
                f.maxBurn = FUELS[f.fuel.id] * 20;
                f.burn = f.maxBurn;
                f.fuel.count--;
                if (f.fuel.count <= 0) f.fuel = null;
                changed = true;
            }
        }
        if (openFurnacePos === k && game.isUiOpen()) {
            // Если ресурсы изменились (съелось топливо или переплавилось) - обновляем ВСЁ (false)
            // Если просто горит огонь - обновляем ТОЛЬКО анимацию (true)
            game.renderFurnace(!changed);
        }
    }

    world.clouds.forEach(c => {
        c.x += c.speed;
        if (c.x > world.w * TILE_SIZE) c.x = -c.w - 100;
    });

    // V5: рост пшеницы
    world.tickCrops();

    // V7: симуляция жидкостей
    world.tickLiquids();

    // V8.4: симуляция огня
    world.tickFire();

    // V9: гравитация песка/гравия
    world.tickFallingBlocks();

    // V14: dirt → grass spread + snow-biome freezing
    world.tickGrassSpread();
    world.tickFreezing();

    for (let i = game.particles.length - 1; i >= 0; i--) {
        let p = game.particles[i];
        p.update();
        if (p.life <= 0) game.particles.splice(i, 1);
    }

    // --- AMBIENT PARTICLES (листопад / пыль в пещере) ---
    game._ambientTimer++;
    if (game._ambientTimer >= 8 && game.particles.length < 200) {
        game._ambientTimer = 0;
        // пыль в пещере (если игрок под землёй)
        if (player.y > (55 + WORLD_OFFSET_Y) * TILE_SIZE && Math.random() < 0.4) {
            const _ez4 = getEffectiveZoom();
            const dx = (Math.random() - 0.5) * (canvas.width / _ez4) * 1.1;
            const dy = (Math.random() - 0.5) * (canvas.height / _ez4) * 1.1;
            const px = player.x + dx;
            const py = player.y + dy;
            if (world.getTile((px / TILE_SIZE) | 0, (py / TILE_SIZE) | 0) === B.AIR) {
                game.particles.push(new Particle(px, py, '#c6bfb5', {
                    type: 'dust',
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: -0.1 - Math.random() * 0.1,
                    life: 3 + Math.random() * 2,
                    decay: 0.005,
                    size: 1,
                    gravity: -0.003,
                    drag: 0.99
                }));
            }
        }
        // V9: ночные светлячки (fireflies) на поверхности — мягкие зелёные
        // самосветящиеся частицы, дрейфующие по дуге.
        const _onSurfaceForFF = player.y < (45 + WORLD_OFFSET_Y) * TILE_SIZE;
        const _isNightForFF = (time >= 0.55 && time < 0.92);
        if (_onSurfaceForFF && _isNightForFF && Math.random() < 0.6) {
            const _ezFF = getEffectiveZoom();
            const dx = (Math.random() - 0.5) * (canvas.width / _ezFF) * 1.2;
            const dy = (Math.random() - 0.3) * (canvas.height / _ezFF) * 0.9;
            const px = player.x + dx;
            const py = player.y + dy;
            // Только в воздухе (не внутри блоков).
            if (world.getTile((px / TILE_SIZE) | 0, (py / TILE_SIZE) | 0) === B.AIR) {
                const ffCol = ['#caff70', '#aaff60', '#88ee44', '#d8ff90'][Math.random() * 4 | 0];
                game.particles.push(new Particle(px, py, ffCol, {
                    type: 'ambient',
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.3,
                    life: 4 + Math.random() * 3,
                    decay: 0.003,
                    size: 1 + (Math.random() < 0.3 ? 1 : 0),
                    gravity: 0,
                    drag: 0.985,
                    glow: true,
                }));
            }
        }

        // V9: дневная пыльца / спорки в воздухе на поверхности (мягкие тёплые точки).
        if (_onSurfaceForFF && !_isNightForFF && time > 0.05 && time < 0.45 && Math.random() < 0.4) {
            const _ezPL = getEffectiveZoom();
            const dx = (Math.random() - 0.5) * (canvas.width / _ezPL);
            const dy = (Math.random() - 0.5) * (canvas.height / _ezPL) * 0.9;
            const px = player.x + dx;
            const py = player.y + dy;
            if (world.getTile((px / TILE_SIZE) | 0, (py / TILE_SIZE) | 0) === B.AIR) {
                game.particles.push(new Particle(px, py, '#fff4c2', {
                    type: 'dust',
                    vx: 0.05 + Math.random() * 0.1, // лёгкий ветер
                    vy: -0.05 - Math.random() * 0.08,
                    life: 4 + Math.random() * 2,
                    decay: 0.004,
                    size: 1,
                    gravity: -0.001,
                    drag: 0.995,
                }));
            }
        }

        // листопад у деревьев на поверхности (днём, редко)
        if (player.y < (40 + WORLD_OFFSET_Y) * TILE_SIZE && time < 0.5 && Math.random() < 0.35) {
            // ищем лист поблизости
            const _ez5 = getEffectiveZoom();
            const rangeX = (canvas.width / _ez5) / TILE_SIZE;
            const rangeY = (canvas.height / _ez5) / TILE_SIZE;
            const px = ((player.x / TILE_SIZE) + (Math.random() - 0.5) * rangeX) | 0;
            const py = ((player.y / TILE_SIZE) + (Math.random() - 0.5) * rangeY) | 0;
            if (world.getTile(px, py) === B.LEAF &&
                world.getTile(px, py + 1) !== B.LEAF) {
                const leafCol = ['#4caf50', '#66bb6a', '#388e3c', '#81c784'][Math.random() * 4 | 0];
                game.particles.push(new Particle(
                    px * TILE_SIZE + Math.random() * TILE_SIZE,
                    py * TILE_SIZE + TILE_SIZE,
                    leafCol,
                    {
                        type: 'leaf',
                        vx: (Math.random() - 0.5) * 0.3,
                        vy: 0.3 + Math.random() * 0.2,
                        life: 3.5, decay: 0.005, size: 3, gravity: 0.02, drag: 0.995
                    }
                ));
            }
        }
    }

    // Interaction
    if (game.isUiOpen()) return;

    if (mouse.down && !mouse.right) {
        if (!player.lastSwingTime || Date.now() - player.lastSwingTime > 250) {
            player.lastSwingTime = Date.now();
        }
    }

    const _ez6 = getEffectiveZoom();
    const worldMx = (mouse.x / _ez6) + camX;
    const worldMy = (mouse.y / _ez6) + camY;
    const tx = Math.floor(worldMx / TILE_SIZE);
    const ty = Math.floor(worldMy / TILE_SIZE);

    const dist = Math.sqrt((player.x + 10 - worldMx) ** 2 + (player.y + 28 - worldMy) ** 2);
    const item = player.inv.getSelected();
    let reach = 100;
    if (item && item.id >= 100) reach = 150;

    // V16: Ranged items (bow, ender pearl) work regardless of cursor distance.
    // Release detection: mouse.down goes false on mouseup (mouse.right is NOT
    // reset by the existing mouseup handler), so we use mouse.down as the
    // press-vs-release signal.
    if (mouse.down && mouse.right) {
        if (item && item.id === ITEMS.BOW && player.inv.has(ITEMS.ARROW, 1)) {
            if (!player.bowDrawTime) player.bowDrawTime = 0;
            player.bowDrawTime++;
            // Stays held — release on mouseup fires the arrow.
        } else if (item && item.id === ITEMS.ENDER_PEARL) {
            // One-shot throw on initial press: dispatch then suppress until release.
            if (!player.pearlSuppressUntilRelease) {
                const sx = player.x + player.w / 2;
                const sy = player.y + 16;
                const dx2 = worldMx - sx;
                const dy2 = worldMy - sy;
                const len = Math.max(1, Math.sqrt(dx2 * dx2 + dy2 * dy2));
                const speed = 13;
                const vx = (dx2 / len) * speed;
                const vy = (dy2 / len) * speed - 2.5;
                pearls.push(new EnderPearl(sx - 4, sy - 4, vx, vy));
                player.inv.remove(ITEMS.ENDER_PEARL, 1);
                if (game && game.audio) game.audio.playSound('place');
                game.updateHUD();
                player.pearlSuppressUntilRelease = true;
                mouse.down = false; // prevent the in-range RMB block from re-triggering this frame
            }
        }
    } else {
        // RMB not actively held → clear the per-throw suppression so the next
        // press can fire again.
        player.pearlSuppressUntilRelease = false;
    }

    if (dist < reach) {
        if (mouse.down) {
            if (mouse.right) {
                // RMB
                let rightClickedMob = false;
                if (item && DYE_COLORS[item.id] !== undefined) {
                    for (let i = 0; i < passives.length; i++) {
                        const e = passives[i];
                        if (e.mobType === 2 && !e.dead) {
                            if (worldMx > e.x && worldMx < e.x + e.w && worldMy > e.y && worldMy < e.y + e.h) {
                                e.woolColor = DYE_COLORS[item.id];
                                e.woolBlockId = WOOL_BY_DYE[item.id];
                                player.inv.remove(item.id, 1);
                                if (game && game.audio) game.audio.playSound('pop');
                                rightClickedMob = true;
                                mouse.down = false;
                                break;
                            }
                        }
                    }
                }
                if (rightClickedMob) {
                    game.updateHUD();
                    return;
                }

                const tid = world.getTile(tx, ty);
                // Build limit: блоки можно ставить только в пределах мира
                // (ty >= BUILD_LIMIT_TY = 0). Если игрок целится выше — показываем
                // красное предупреждение и пропускаем всю цепочку размещения.
                const _isPlaceable = item && (
                    BLOCKS[item.id] !== undefined ||
                    item.id === ITEMS.TORCH ||
                    item.id === ITEMS.WHEAT_SEEDS ||
                    item.id === ITEMS.WATER_BUCKET ||
                    item.id === ITEMS.LAVA_BUCKET
                );
                if (ty < BUILD_LIMIT_TY && _isPlaceable) {
                    game.showBuildLimitWarning();
                    mouse.down = false;
                } else if (item && item.id === ITEMS.BONE_MEAL && (tid === B.WHEAT_0 || tid === B.WHEAT_1 || tid === B.WHEAT_2)) {
                    // V16: Bone meal on wheat — advance one stage (66% chance).
                    if (Math.random() < 0.66) {
                        world.setTile(tx, ty, tid + 1);
                    }
                    player.inv.remove(ITEMS.BONE_MEAL, 1);
                    // Sparkle particles
                    for (let i = 0; i < 8; i++) {
                        game.particles.push(new Particle(
                            tx * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 20,
                            ty * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 20,
                            ['#fff59d', '#ffeb3b', '#9ccc65'][(Math.random() * 3) | 0],
                            { type: 'spark', speed: 1.5, life: 0.7, decay: 0.06, gravity: -0.05 }
                        ));
                    }
                    if (game && game.audio) game.audio.playSound('place');
                    game.updateHUD();
                    mouse.down = false;
                } else if (item && item.id === ITEMS.BONE_MEAL && tid === B.GRASS) {
                    // V16: Bone meal on grass — spawn random flowers/short grass on neighboring AIR
                    // tiles whose tile below is grass/dirt/farmland.
                    const flowerPool = [
                        B.POPPY, B.DANDELION, B.BLUE_ORCHID, B.ALLIUM, B.AZURE_BLUET,
                        B.RED_TULIP, B.ORANGE_TULIP, B.WHITE_TULIP, B.PINK_TULIP,
                        B.OXEYE_DAISY, B.CORNFLOWER, B.LILY_OF_THE_VALLEY,
                        B.SHORT_GRASS, B.SHORT_GRASS, B.SHORT_GRASS, B.SHORT_GRASS
                    ];
                    let placedAny = false;
                    for (let dx = -2; dx <= 2; dx++) {
                        for (let dy = -2; dy <= 2; dy++) {
                            if (Math.random() > 0.35) continue;
                            const cx = tx + dx;
                            const cy = ty + dy;
                            // Need AIR cell with grass/dirt below
                            if (world.getTile(cx, cy) !== B.AIR) continue;
                            const below = world.getTile(cx, cy + 1);
                            if (below !== B.GRASS && below !== B.DIRT) continue;
                            const flower = flowerPool[(Math.random() * flowerPool.length) | 0];
                            world.setTile(cx, cy, flower);
                            placedAny = true;
                        }
                    }
                    if (placedAny) {
                        player.inv.remove(ITEMS.BONE_MEAL, 1);
                        for (let i = 0; i < 10; i++) {
                            game.particles.push(new Particle(
                                tx * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 30,
                                ty * TILE_SIZE + (Math.random() - 0.5) * 16,
                                ['#fff59d', '#ffeb3b', '#9ccc65'][(Math.random() * 3) | 0],
                                { type: 'spark', speed: 1.6, life: 0.8, decay: 0.05, gravity: -0.07 }
                            ));
                        }
                        if (game && game.audio) game.audio.playSound('place');
                        game.updateHUD();
                    }
                    mouse.down = false;
                } else if (tid === B.BED) {
                    if (time >= 0.5 && time < 0.95) {
                        time = 0.0;
                        day++;
                        world.spawnX = tx * TILE_SIZE;
                        world.spawnY = ty * TILE_SIZE;
                        stats.slept = true; // V4: для ачивки Sweet Dreams
                        game.sysMessage("Respawn point set. Good morning!");
                    } else {
                        game.sysMessage("You can only sleep at night.");
                    }
                    mouse.down = false;
                } else if (item && [ITEMS.APPLE, ITEMS.BREAD, ITEMS.PORK_RAW, ITEMS.BEEF_RAW, ITEMS.MUTTON_RAW].includes(item.id) && player.hp < player.maxHp) {
                    let heal = 1; if (item.id === ITEMS.APPLE) heal = 2; else if (item.id === ITEMS.BREAD) heal = 3;
                    player.hp = Math.min(player.maxHp, player.hp + heal);
                    // V4: ачивки Daily Bread / An Apple a Day
                    if (item.id === ITEMS.BREAD) stats.atesBread = true;
                    if (item.id === ITEMS.APPLE) stats.atesApple = true;
                    player.inv.remove(item.id, 1);
                    game.audio.playSound('eat');
                    game.updateHUD();
                    mouse.down = false;
                } else if (item && [ITEMS.PORK_COOKED, ITEMS.MUTTON_COOKED, ITEMS.BEEF_COOKED].includes(item.id) && player.hp < player.maxHp) {
                    let heal = 4; if (item.id === ITEMS.BEEF_COOKED) heal = 5;
                    player.hp = Math.min(player.maxHp, player.hp + heal);
                    player.inv.remove(item.id, 1);
                    game.audio.playSound('eat');
                    game.updateHUD();
                    mouse.down = false;
                } else if (item && item.id === ITEMS.WATER_BOTTLE && player.hp < player.maxHp) {
                    // V11: пить воду — удерживать ПКМ ~1 секунду.
                    // drinkProgress копится пока удерживается ПКМ с бутылкой воды в руке.
                    if (!game.drinkProgress) game.drinkProgress = 0;
                    game.drinkProgress++;
                    if (game.drinkProgress >= 45) { // ~0.75 сек при 60fps
                        player.hp = Math.min(player.maxHp, player.hp + 1);
                        player.inv.remove(ITEMS.WATER_BOTTLE, 1);
                        player.inv.add(ITEMS.EMPTY_BOTTLE, 1);
                        game.audio.playSound('eat');
                        game.updateHUD();
                        game.drinkProgress = 0;
                        mouse.down = false;
                    }
                    // Не сбрасываем mouse.down — позволяем удержанию накапливать прогресс
                } else if (item && item.id === ITEMS.EMPTY_BOTTLE && isWater(tid)) {
                    // V11: наполнить пустую бутылку из источника воды.
                    const _key = `${tx},${ty}`;
                    if (world.waterSources.has(_key)) {
                        player.inv.remove(ITEMS.EMPTY_BOTTLE, 1);
                        player.inv.add(ITEMS.WATER_BOTTLE, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                        mouse.down = false;
                    } else {
                        // Текущая (не-источник) вода — тоже разрешим (упрощение)
                        player.inv.remove(ITEMS.EMPTY_BOTTLE, 1);
                        player.inv.add(ITEMS.WATER_BOTTLE, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                        mouse.down = false;
                    }
                } else if (item && item.id === ITEMS.TORCH && tid === B.AIR) {
                    // V12: torch placement — must attach to top/sides of a solid block,
                    // OR be placed on a background block (BG layer). Cannot float in air.
                    const bgSolid = isSolidBgAt(tx, ty);
                    const below = isSolidAt(tx, ty + 1);
                    const leftSolid = isSolidAt(tx - 1, ty);
                    const rightSolid = isSolidAt(tx + 1, ty);

                    // Direction priority: prefer the edge the player clicked closest to,
                    // but fall back to whichever attachment is actually available.
                    const edge = pickedTileEdge(worldMx, worldMy, tx, ty);
                    let dir = null;
                    // edge 'down' means clicked near bottom edge → torch sits on top of block below it (dir='up')
                    if (edge === 'down' && below) dir = 'up';
                    else if (edge === 'left' && leftSolid) dir = 'left';
                    else if (edge === 'right' && rightSolid) dir = 'right';
                    // Fallback: top of block below
                    if (!dir && below) dir = 'up';
                    if (!dir && leftSolid) dir = 'left';
                    if (!dir && rightSolid) dir = 'right';
                    // Last resort: attach to background block
                    if (!dir && bgSolid) dir = 'bg';

                    if (dir) {
                        world.setTile(tx, ty, B.TORCH_PLACED);
                        setBlockMeta(tx, ty, { dir }, LAYER.MID);
                        player.inv.remove(ITEMS.TORCH, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    }
                } else if (item && item.id === ITEMS.PAINTING) {
                    const bgId = world.getTile(tx, ty, LAYER.BG);
                    if (bgId !== B.AIR) {
                        const imgIndex = Math.floor(Math.random() * PAINTINGS_CACHE.length);
                        const img = PAINTINGS_CACHE[imgIndex];
                        let overlap = false;
                        if (world.paintings) {
                            for (const p of world.paintings) {
                                if (!(tx >= p.x + p.w || tx + img.blocksW <= p.x || ty >= p.y + p.h || ty + img.blocksH <= p.y)) {
                                    overlap = true;
                                    break;
                                }
                            }
                        }
                        if (!overlap) {
                            world.paintings.push({ x: tx, y: ty, w: img.blocksW, h: img.blocksH, imgIndex });
                            player.inv.remove(ITEMS.PAINTING, 1);
                            game.audio.playSound('place');
                            game.updateHUD();
                        } else {
                            game.sysMessage("Cannot place here: painting overlaps another painting.");
                        }
                    } else {
                        game.sysMessage("Paintings must be placed on background walls.");
                    }
                    mouse.down = false;
                } else if (item && item.id === B.LEVER && tid === B.LEVER) {
                    // Clicking own lever with lever in hand → toggle (like vanilla)
                    const m = getBlockMeta(tx, ty, LAYER.MID) || { dir: 'up', state: 'off' };
                    m.state = (m.state === 'on') ? 'off' : 'on';
                    setBlockMeta(tx, ty, m, LAYER.MID);
                    game.audio.playSound('place');
                    mouse.down = false;
                } else if (item && item.id === B.LEVER && tid === B.AIR) {
                    // V12: lever — like torch but can also sit on the BOTTOM of a block (ceiling lever).
                    const bgSolid = isSolidBgAt(tx, ty);
                    const above = isSolidAt(tx, ty - 1);
                    const below = isSolidAt(tx, ty + 1);
                    const leftSolid = isSolidAt(tx - 1, ty);
                    const rightSolid = isSolidAt(tx + 1, ty);
                    const edge = pickedTileEdge(worldMx, worldMy, tx, ty);
                    let dir = null;
                    if (edge === 'down' && below) dir = 'up';        // on floor (mounts on top of block below)
                    else if (edge === 'up' && above) dir = 'down';   // on ceiling
                    else if (edge === 'left' && leftSolid) dir = 'left';
                    else if (edge === 'right' && rightSolid) dir = 'right';
                    if (!dir && below) dir = 'up';
                    if (!dir && above) dir = 'down';
                    if (!dir && leftSolid) dir = 'left';
                    if (!dir && rightSolid) dir = 'right';
                    if (!dir && bgSolid) dir = 'bg';
                    if (dir) {
                        world.setTile(tx, ty, B.LEVER);
                        setBlockMeta(tx, ty, { dir, state: 'off' }, LAYER.MID);
                        player.inv.remove(B.LEVER, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    }
                    mouse.down = false;
                } else if (item && item.id === B.LADDER) {
                    // V12: ladder can ONLY be placed where there is a background block.
                    if (tid === B.AIR && isSolidBgAt(tx, ty)) {
                        world.setTile(tx, ty, B.LADDER);
                        setBlockMeta(tx, ty, { dir: 'bg' }, LAYER.MID);
                        player.inv.remove(B.LADDER, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    }
                    mouse.down = false;
                } else if (item && item.id === B.WOOD_DOOR) {
                    // V12: doors are TWO tiles tall. Need the clicked tile AND tile above to be AIR.
                    if (tid === B.AIR && world.getTile(tx, ty - 1) === B.AIR) {
                        world.setTile(tx, ty, B.WOOD_DOOR);          // bottom
                        world.setTile(tx, ty - 1, B.WOOD_DOOR);      // top
                        // 'half' tells the renderer which slice of the door to draw.
                        setBlockMeta(tx, ty, { rot: pendingRotation, state: 'closed', half: 'bottom' }, LAYER.MID);
                        setBlockMeta(tx, ty - 1, { rot: pendingRotation, state: 'closed', half: 'top' }, LAYER.MID);
                        player.inv.remove(B.WOOD_DOOR, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    } else if (tid === B.WOOD_DOOR) {
                        toggleDoor(tx, ty);
                        game.audio.playSound('place');
                    }
                    mouse.down = false;
                } else if (item && item.id === B.WOOD_TRAPDOOR) {
                    if (tid === B.AIR) {
                        world.setTile(tx, ty, B.WOOD_TRAPDOOR);
                        setBlockMeta(tx, ty, { rot: pendingRotation, state: 'closed' }, LAYER.MID);
                        player.inv.remove(B.WOOD_TRAPDOOR, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    } else if (tid === B.WOOD_TRAPDOOR) {
                        const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                        m.state = (m.state === 'open') ? 'closed' : 'open';
                        setBlockMeta(tx, ty, m, LAYER.MID);
                        game.audio.playSound('place');
                    }
                    mouse.down = false;
                } else if (item && item.id === B.WOOD_GATE) {
                    if (tid === B.AIR) {
                        world.setTile(tx, ty, B.WOOD_GATE);
                        setBlockMeta(tx, ty, { rot: 0, state: 'closed' }, LAYER.MID);
                        player.inv.remove(B.WOOD_GATE, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    } else if (tid === B.WOOD_GATE) {
                        const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                        m.state = (m.state === 'open') ? 'closed' : 'open';
                        setBlockMeta(tx, ty, m, LAYER.MID);
                        game.audio.playSound('place');
                    }
                    mouse.down = false;
                } else if (tid === B.JUKEBOX && item && isMusicDisc(item.id)) {
                    // V13: RMB jukebox with a disc in hand → swap/insert disc.
                    const meta = getBlockMeta(tx, ty, LAYER.MID) || {};
                    if (meta.disc) ejectJukeboxDisc(tx, ty);
                    setBlockMeta(tx, ty, { disc: item.id }, LAYER.MID);
                    game.audio.playMusicDisc(item.id, tx, ty);
                    player.inv.remove(item.id, 1);
                    game.audio.playSound('place');
                    game.updateHUD();
                    mouse.down = false;
                } else if (tid === B.JUKEBOX && !item) {
                    // V13: RMB jukebox with empty hand → eject any disc inside.
                    ejectJukeboxDisc(tx, ty);
                    mouse.down = false;
                } else if (tid === B.LEVER && (!item || (item.id !== B.LEVER && item.id !== ITEMS.TORCH))) {
                    // V12: toggle existing lever with RMB (no lever in hand needed)
                    const m = getBlockMeta(tx, ty, LAYER.MID) || { dir: 'up', state: 'off' };
                    m.state = (m.state === 'on') ? 'off' : 'on';
                    setBlockMeta(tx, ty, m, LAYER.MID);
                    game.audio.playSound('place');
                    mouse.down = false;
                } else if (tid === B.WOOD_DOOR && (!item || item.id !== B.WOOD_DOOR)) {
                    toggleDoor(tx, ty);
                    game.audio.playSound('place');
                    mouse.down = false;
                } else if (tid === B.WOOD_TRAPDOOR && (!item || item.id !== B.WOOD_TRAPDOOR)) {
                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                    m.state = (m.state === 'open') ? 'closed' : 'open';
                    setBlockMeta(tx, ty, m, LAYER.MID);
                    game.audio.playSound('place');
                    mouse.down = false;
                } else if (tid === B.WOOD_GATE && (!item || item.id !== B.WOOD_GATE)) {
                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                    m.state = (m.state === 'open') ? 'closed' : 'open';
                    setBlockMeta(tx, ty, m, LAYER.MID);
                    game.audio.playSound('place');
                    mouse.down = false;
                } else if (item && item.id === ITEMS.FLINT_AND_STEEL) {
                    if (tid === B.TNT) {
                        igniteTNT(tx, ty);
                        item.dur--; if (item.dur <= 0) player.inv.remove(item.id, 1);
                        game.updateHUD();
                        mouse.down = false;
                    } else if (tryLightPortal(tx, ty)) {
                        // Beta 1.0: lit a Nether portal — consume durability, skip fire.
                        item.dur--; if (item.dur <= 0) player.inv.remove(item.id, 1);
                        game.updateHUD();
                        game.sysMessage('Nether portal activated!');
                        mouse.down = false;
                    } else if (tid !== B.AIR && !BLOCKS[tid].liquid) {
                        // Minecraft-style placement: try every adjacent AIR cell, prefer
                        // the side closest to where the cursor hit. Fire is placed on the
                        // AIR cell touching the clicked solid block.
                        const candidates = [
                            { x: tx, y: ty - 1 },  // top
                            { x: tx, y: ty + 1 },  // bottom
                            { x: tx - 1, y: ty },  // left
                            { x: tx + 1, y: ty }   // right
                        ];
                        // Sort by distance to cursor for "natural" placement.
                        candidates.sort((a, b) => {
                            const da = (a.x * TILE_SIZE + 16 - worldMx) ** 2 + (a.y * TILE_SIZE + 16 - worldMy) ** 2;
                            const db = (b.x * TILE_SIZE + 16 - worldMx) ** 2 + (b.y * TILE_SIZE + 16 - worldMy) ** 2;
                            return da - db;
                        });
                        let firePlaced = false;
                        for (let ci = 0; ci < candidates.length; ci++) {
                            const cc = candidates[ci];
                            if (world.getTile(cc.x, cc.y) === B.AIR) {
                                // Don't place fire surrounded by water on all sides.
                                const wet = isWater(world.getTile(cc.x + 1, cc.y)) ||
                                            isWater(world.getTile(cc.x - 1, cc.y)) ||
                                            isWater(world.getTile(cc.x, cc.y + 1)) ||
                                            isWater(world.getTile(cc.x, cc.y - 1));
                                if (wet) continue;
                                world.setTile(cc.x, cc.y, B.FIRE);
                                world.fireAge[`${cc.x},${cc.y}`] = 0;
                                game.audio.playSound('place');
                                // Light a few flame sparks for feedback.
                                for (let k = 0; k < 4; k++) {
                                    game.particles.push(new Particle(
                                        cc.x * TILE_SIZE + 16, cc.y * TILE_SIZE + 16,
                                        ['#ffeb3b', '#ff9800', '#ff5722'][(Math.random() * 3) | 0],
                                        { type: 'spark', speed: 1.5, life: 0.6, decay: 0.08, gravity: -0.05 }
                                    ));
                                }
                                item.dur--; if (item.dur <= 0) player.inv.remove(item.id, 1);
                                game.updateHUD();
                                firePlaced = true;
                                break;
                            }
                        }
                        if (firePlaced) mouse.down = false;
                    }
                } else if (item && item.id === ITEMS.WHEAT_SEEDS && tid === B.FARMLAND) {
                    // V5: посадка семян пшеницы на FARMLAND
                    world.setTile(tx, ty, B.WHEAT_0);
                    world.registerCrop(tx, ty);
                    player.inv.remove(ITEMS.WHEAT_SEEDS, 1);
                    game.audio.playSound('place');
                    // небольшая VFX: зелёные искорки
                    for (let i = 0; i < 4; i++) {
                        game.particles.push(new Particle(
                            tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, '#8bc34a',
                            { type: 'spark', speed: 2, life: 0.4, decay: 0.07, gravity: 0.1 }
                        ));
                    }
                    game.updateHUD();
                    mouse.down = false;
                } else if (item && item.id === ITEMS.BUCKET && isLiquid(tid)) {
                    // V7 fix: набор жидкости пустым ведром теперь реально забирает блок.
                    // В MC одиночный источник тоже расходуется, а "бесконечность" получается
                    // только если рядом есть два+ соседних источника (они регенерируют блок через flow).
                    const key = `${tx},${ty}`;
                    if (isWater(tid) && world.waterSources.has(key)) {
                        player.inv.remove(ITEMS.BUCKET, 1);
                        player.inv.add(ITEMS.WATER_BUCKET, 1);
                        world.removeWaterSource(tx, ty);
                        world.setTile(tx, ty, B.AIR);
                        world.queueLiquidCross(tx, ty);
                        game.audio.playSound('place');
                        game.updateHUD();
                        mouse.down = false;
                    } else if (isLava(tid) && world.lavaSources.has(key)) {
                        player.inv.remove(ITEMS.BUCKET, 1);
                        player.inv.add(ITEMS.LAVA_BUCKET, 1);
                        world.removeLavaSource(tx, ty);
                        world.setTile(tx, ty, B.AIR);
                        world.queueLiquidCross(tx, ty);
                        game.audio.playSound('place');
                        game.updateHUD();
                        mouse.down = false;
                    }
                } else if (item && item.id === ITEMS.WATER_BUCKET && (tid === B.AIR || BLOCKS[tid].pass)) {
                    // V7: разлив воды. Ставим источник в выбранной клетке (если она пуста/проходима и не жидкость).
                    if (!isLiquid(tid)) {
                        world.placeWaterSource(tx, ty);
                        player.inv.remove(ITEMS.WATER_BUCKET, 1);
                        player.inv.add(ITEMS.BUCKET, 1);
                        game.audio.playSound('place');
                        // VFX: синие брызги
                        for (let i = 0; i < 8; i++) {
                            game.particles.push(new Particle(
                                tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, '#42a5f5',
                                { type: 'spark', speed: 3, life: 0.5, decay: 0.06, gravity: 0.2 }
                            ));
                        }
                        game.updateHUD();
                        mouse.down = false;
                    }
                } else if (item && item.id === ITEMS.LAVA_BUCKET && (tid === B.AIR || BLOCKS[tid].pass)) {
                    // V7: разлив лавы
                    if (!isLiquid(tid)) {
                        world.placeLavaSource(tx, ty);
                        player.inv.remove(ITEMS.LAVA_BUCKET, 1);
                        player.inv.add(ITEMS.BUCKET, 1);
                        game.audio.playSound('place');
                        for (let i = 0; i < 10; i++) {
                            game.particles.push(new Particle(
                                tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, '#ff9100',
                                { type: 'spark', speed: 3, life: 0.6, decay: 0.05, gravity: 0.15 }
                            ));
                        }
                        game.updateHUD();
                        mouse.down = false;
                    }
                } else if (item && (isTallPlantBottom(item.id) || item.id === B.TALL_GRASS_BOTTOM) && tid === B.AIR) {
                    // V14: 2-block plant placement — needs an AIR tile and AIR above it,
                    // and the tile below must be GRASS/DIRT (so it can take root).
                    const below = world.getTile(tx, ty + 1);
                    const aboveExisting = world.getTile(tx, ty - 1);
                    const aboveOk = aboveExisting === B.AIR;
                    const ok = aboveOk && (below === B.GRASS || below === B.DIRT || below === B.FARMLAND);
                    if (ok) {
                        world.setTile(tx, ty,     item.id);
                        world.setTile(tx, ty - 1, tallPlantOtherHalf(item.id));
                        player.inv.remove(item.id, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    }
                    mouse.down = false;
                } else if (item && BLOCKS[item.id]) {
                    // V14: flowers/grass can only be placed on top of grass/dirt/farmland.
                    let plantNeedsValidSoil = false;
                    if ((isSingleFlower(item.id) || item.id === B.SHORT_GRASS) && tid === B.AIR) {
                        const below = world.getTile(tx, ty + 1);
                        if (below !== B.GRASS && below !== B.DIRT && below !== B.FARMLAND) {
                            plantNeedsValidSoil = true;
                        }
                    }
                    if (item.id === B.SUGARCANE && tid === B.AIR) {
                        const below = world.getTile(tx, ty + 1);
                        if (below !== B.SUGARCANE) {
                            if (below === B.GRASS || below === B.DIRT || below === B.SAND) {
                                const l = world.getTile(tx - 1, ty + 1);
                                const r = world.getTile(tx + 1, ty + 1);
                                const hasWater = (BLOCKS[l] && BLOCKS[l].liquid === 'water') || 
                                                 (BLOCKS[r] && BLOCKS[r].liquid === 'water');
                                if (!hasWater) plantNeedsValidSoil = true;
                            } else {
                                plantNeedsValidSoil = true;
                            }
                        }
                    }
                    // Резолвим целевой слой: модификаторы (Shift/Ctrl/Alt) имеют приоритет над активным режимом.
                    let targetLayer = activeBuildLayer;
                    if (keys['ShiftLeft'] || keys['ShiftRight']) targetLayer = LAYER.BG;
                    else if (keys['ControlLeft'] || keys['ControlRight']) targetLayer = LAYER.FG;
                    else if (keys['AltLeft'] || keys['AltRight']) targetLayer = LAYER.MID;

                    if (plantNeedsValidSoil) {
                        // Skip placement entirely — no valid soil under the flower.
                        mouse.down = false;
                    } else if (targetLayer === LAYER.MID && (tid === B.AIR || isLiquid(tid))) {
                        // СРЕДНИЙ СЛОЙ — AABB-проверка сущностей и интероп с жидкостями.
                        // V13: проверяем не "целиком тайл", а реальные AABB того
                        // блока, который собираемся поставить — игрок может
                        // спокойно ставить полублок или забор, стоя в верхней
                        // (свободной) части той же клетки.
                        let intersects = false;
                        const placingRot = ROTATABLE_BLOCKS.has(item.id) ? pendingRotation : 0;
                        const entitiesToCheck = [player, ...enemies, ...passives];
                        for (let ei = 0; ei < entitiesToCheck.length; ei++) {
                            const e = entitiesToCheck[ei];
                            if (entityIntersectsPlacedBlock(e.x, e.y, e.w, e.h, tx, ty, item.id, placingRot)) {
                                intersects = true;
                                break;
                            }
                        }
                        if (!intersects) {
                            // V7 fix: если ставим блок поверх жидкости — стираем её источник, чтобы перекрытие работало
                            if (isLiquid(tid)) {
                                const lk = `${tx},${ty}`;
                                if (world.waterSources.has(lk)) world.removeWaterSource(tx, ty);
                                if (world.lavaSources.has(lk)) world.removeLavaSource(tx, ty);
                            }
                            world.setTile(tx, ty, item.id);
                            if (item.id === B.SUGARCANE) {
                                world.registerCrop(tx, ty);
                            }
                            // V12: rotatable blocks (stairs, logs) — bake pendingRotation into meta
                            if (ROTATABLE_BLOCKS.has(item.id)) {
                                setBlockMeta(tx, ty, { rot: pendingRotation }, LAYER.MID);
                            }
                            player.inv.remove(item.id, 1);
                            game.audio.playSound('place');
                            game.placedBlocks[`${tx},${ty}`] = Date.now();
                            stats.placed = (stats.placed || 0) + 1; // для ачивки architect
                            world.queueLiquidCross(tx, ty);
                            game.updateHUD();
                        }
                    } else if (targetLayer === LAYER.BG || targetLayer === LAYER.FG) {
                        // BG / FG — без AABB-проверки, без интеракции с жидкостями.
                        // Любой блок разрешён (декоративная установка).
                        const existing = world.getTile(tx, ty, targetLayer);
                        if (existing === B.AIR) {
                            world.setTile(tx, ty, item.id, targetLayer);
                            if (ROTATABLE_BLOCKS.has(item.id)) {
                                setBlockMeta(tx, ty, { rot: pendingRotation }, targetLayer);
                            }
                            player.inv.remove(item.id, 1);
                            game.audio.playSound('place');
                            game.placedBlocks[`${tx},${ty}_${targetLayer}`] = Date.now();
                            stats.placed = (stats.placed || 0) + 1;
                            game.updateHUD();
                        }
                    }
                }
            } else {
                // LMB - Mining with Minecraft-style speed
                let hitEntity = false;

                // Проверяем кулдаун атаки игрока
                if (player.canAttack()) {
                    enemies.forEach((e) => {
                        if (worldMx > e.x && worldMx < e.x + e.w && worldMy > e.y && worldMy < e.y + e.h) {
                            // Урон зависит от меча
                            let dmg = 1; // Базовый урон руками
                            if (item) {
                                if (item.id === ITEMS.WOOD_SWORD) dmg = 4;
                                else if (item.id === ITEMS.STONE_SWORD) dmg = 5;
                                else if (item.id === ITEMS.IRON_SWORD) dmg = 6;
                                else if (item.id === ITEMS.GOLD_SWORD) dmg = 4;
                                else if (item.id === ITEMS.DIAMOND_SWORD) dmg = 7;
                            }

                            if (item && MAX_DUR[item.id]) {
                                item.dur--;
                                if (item.dur <= 0) player.inv.remove(item.id, 1);
                                game.updateHUD();
                            }

                            e.hp -= dmg;
                            e.vx = (e.x - player.x) > 0 ? 6 : -6;
                            e.vy = -3;
                            e.hurtTimer = 5;
                            // V16: hitting an enderman aggros it.
                            if (e.type === 3) e.aggro = true;
                            game.audio.playSound('mob_hit', e.x + e.w / 2);
                            hitEntity = true;
                            player.attack(); // Запускаем кулдаун
                            // VFX
                            VFX.hit(e.x + e.w / 2, e.y + e.h / 2, '#c62828');
                            game.screenShake = Math.max(game.screenShake, 1.5 + dmg * 0.3);
                            if (e.hp <= 0) {
                                e.die();
                                if (e instanceof Enemy) {
                                    stats.kills++;
                                    // XP за убийство врага
                                    let xp = 0;
                                    if (e.type === 0) xp = XP_VALUES.KILL_ZOMBIE;
                                    else if (e.type === 1) xp = XP_VALUES.KILL_SPIDER;
                                    else if (e.type === 2) xp = XP_VALUES.KILL_SKELETON;
                                    else if (e.type === 3) xp = XP_VALUES.KILL_ENDERMAN;
                                    game.addScore(xp);
                                }
                            }
                        }
                    });

                    if (!hitEntity) {
                        passives.forEach((e) => {
                            if (worldMx > e.x && worldMx < e.x + e.w && worldMy > e.y && worldMy < e.y + e.h) {
                                let dmg = 1;
                                if (item) {
                                    if (item.id === ITEMS.WOOD_SWORD) dmg = 4;
                                    else if (item.id === ITEMS.STONE_SWORD) dmg = 5;
                                    else if (item.id === ITEMS.IRON_SWORD) dmg = 6;
                                    else if (item.id === ITEMS.GOLD_SWORD) dmg = 4;
                                    else if (item.id === ITEMS.DIAMOND_SWORD) dmg = 7;
                                }
                                e.hp -= dmg;
                                e.vx = (e.x - player.x) > 0 ? 6 : -6; e.vy = -3; e.hurtTimer = 5;
                                game.audio.playSound('mob_hit', e.x + e.w / 2);
                                hitEntity = true;
                                player.attack(); // Запускаем кулдаун
                                // VFX
                                VFX.hit(e.x + e.w / 2, e.y + e.h / 2, '#c62828');
                                game.screenShake = Math.max(game.screenShake, 1.5);
                                if (e.hp <= 0) {
                                    e.die();
                                    // XP за убийство мирных мобов
                                    let xp = e.mobType === 0 ? XP_VALUES.KILL_PIG : (e.mobType === 1 ? XP_VALUES.KILL_COW : XP_VALUES.KILL_SHEEP);
                                    game.addScore(xp);
                                }
                            }
                        });
                    }

                    // Beta 1.0: Pigmen — neutral until hit, then alert the whole group.
                    if (!hitEntity) {
                        pigmen.forEach((p) => {
                            if (worldMx > p.x && worldMx < p.x + p.w && worldMy > p.y && worldMy < p.y + p.h) {
                                let dmg = 1;
                                if (item) {
                                    if (item.id === ITEMS.WOOD_SWORD) dmg = 4;
                                    else if (item.id === ITEMS.STONE_SWORD) dmg = 5;
                                    else if (item.id === ITEMS.IRON_SWORD) dmg = 6;
                                    else if (item.id === ITEMS.GOLD_SWORD) dmg = 4;
                                    else if (item.id === ITEMS.DIAMOND_SWORD) dmg = 7;
                                }
                                if (item && MAX_DUR[item.id]) {
                                    item.dur--;
                                    if (item.dur <= 0) player.inv.remove(item.id, 1);
                                    game.updateHUD();
                                }
                                p.takeDamage(dmg);
                                p.vx = (p.x - player.x) > 0 ? 6 : -6; p.vy = -3;
                                game.audio.playSound('mob_hit', p.x + p.w / 2);
                                hitEntity = true;
                                player.attack();
                                VFX.hit(p.x + p.w / 2, p.y + p.h / 2, '#c62828');
                                game.screenShake = Math.max(game.screenShake, 1.5);
                            }
                        });
                    }

                    // Beta 1.0: Ghasts — always hostile, can be hit (best with bow).
                    if (!hitEntity) {
                        ghasts.forEach((g) => {
                            if (worldMx > g.x && worldMx < g.x + g.w && worldMy > g.y && worldMy < g.y + g.h) {
                                let dmg = 1;
                                if (item) {
                                    if (item.id === ITEMS.WOOD_SWORD) dmg = 4;
                                    else if (item.id === ITEMS.STONE_SWORD) dmg = 5;
                                    else if (item.id === ITEMS.IRON_SWORD) dmg = 6;
                                    else if (item.id === ITEMS.GOLD_SWORD) dmg = 4;
                                    else if (item.id === ITEMS.DIAMOND_SWORD) dmg = 7;
                                }
                                if (item && MAX_DUR[item.id]) {
                                    item.dur--;
                                    if (item.dur <= 0) player.inv.remove(item.id, 1);
                                    game.updateHUD();
                                }
                                g.takeDamage(dmg);
                                game.audio.playSound('mob_hit', g.x + g.w / 2);
                                hitEntity = true;
                                player.attack();
                                VFX.hit(g.x + g.w / 2, g.y + g.h / 2, '#fff');
                                game.screenShake = Math.max(game.screenShake, 1.5);
                            }
                        });
                    }
                }

                // Breaking paintings with left click
                if (!hitEntity && world.paintings) {
                    for (let i = world.paintings.length - 1; i >= 0; i--) {
                        const p = world.paintings[i];
                        if (worldMx >= p.x * TILE_SIZE && worldMx < (p.x + p.w) * TILE_SIZE &&
                            worldMy >= p.y * TILE_SIZE && worldMy < (p.y + p.h) * TILE_SIZE) {
                            world.paintings.splice(i, 1);
                            player.inv.add(ITEMS.PAINTING, 1);
                            game.audio.playSound('break');
                            VFX.hit(worldMx, worldMy, '#5d4037');
                            hitEntity = true;
                            player.attack();
                            game.updateHUD();
                            break;
                        }
                    }
                }

                if (!hitEntity) {
                    // Резолвим слой ломки по приоритету MID > FG > BG.
                    // Если в среднем слое есть блок — ломаем его. Иначе — переход на FG, затем BG.
                    let targetLayer = LAYER.MID;
                    let tid = world.getTile(tx, ty, LAYER.MID);
                    if (tid === B.AIR) {
                        const fgId = world.getTile(tx, ty, LAYER.FG);
                        if (fgId !== B.AIR) { targetLayer = LAYER.FG; tid = fgId; }
                        else {
                            const bgId = world.getTile(tx, ty, LAYER.BG);
                            if (bgId !== B.AIR) { targetLayer = LAYER.BG; tid = bgId; }
                        }
                    }
                    // V7: жидкости не ломаются вручную — они "заливаются" только ведром
                    // (для FG/BG жидкости — статичный декор, ломаются как обычно).
                    if (targetLayer === LAYER.MID && isLiquid(tid)) {
                        breakProgress = 0;
                        breakStage = 0;
                        breakTarget = { x: -1, y: -1, layer: LAYER.MID };
                        return;
                    }
                    // V5: Мотыга — не ломает, а превращает grass/dirt в farmland.
                    // Работает только на среднем слое.
                    const hoes = [ITEMS.WOOD_HOE, ITEMS.STONE_HOE, ITEMS.IRON_HOE, ITEMS.GOLD_HOE, ITEMS.DIAMOND_HOE];
                    if (targetLayer === LAYER.MID && item && hoes.includes(item.id) && (tid === B.GRASS || tid === B.DIRT)) {
                        // сверху блок должен быть воздухом/прозрачным — иначе нечего пахать
                        const above = world.getTile(tx, ty - 1);
                        if (above === B.AIR || (BLOCKS[above] && BLOCKS[above].pass && above !== B.WHEAT_0 && above !== B.WHEAT_1 && above !== B.WHEAT_2 && above !== B.WHEAT_3)) {
                            world.setTile(tx, ty, B.FARMLAND);
                            // снимаем прочность у мотыги — как в Minecraft
                            if (MAX_DUR[item.id]) {
                                item.dur--;
                                if (item.dur <= 0) player.inv.remove(item.id, 1);
                            }
                            game.audio.playSound('place'); // мягкий щелчок
                            // VFX: комочки земли
                            VFX.blockPlace(tx * TILE_SIZE, ty * TILE_SIZE, '#6d4c41');
                            // кулдаун, чтобы один клик = одно тилинг-действие
                            breakProgress = 0;
                            breakStage = 0;
                            breakTarget = { x: -1, y: -1, layer: LAYER.MID };
                            player.lastSwingTime = Date.now();
                            game.updateHUD();
                            // вручную прерываем mouse.down на этот тик, чтоб не двойной сработал
                            mouse.down = false;
                            return;
                        }
                    }
                    if (tid !== B.AIR && tid !== B.BEDROCK && tid !== B.PORTAL) {
                        if (breakTarget.x !== tx || breakTarget.y !== ty || breakTarget.layer !== targetLayer) {
                            breakTarget = { x: tx, y: ty, layer: targetLayer };
                            breakProgress = 0;
                            breakStage = 0;
                        }

                        // Calculate mining speed based on tool and block type
                        let baseHardness = BLOCKS[tid].hard || 1;
                        let speed = 1;
                        let canHarvest = true;

                        // Stone blocks require pickaxe
                        const stoneBlocks = [
                            B.STONE, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE,
                            B.BRICK, B.FURNACE, B.COAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK,
                            // V10: новые каменные блоки тоже требуют кирку
                            B.COBBLESTONE,
                            B.COBBLE_STAIRS, B.STONE_STAIRS, B.BRICK_STAIRS,
                            B.STONE_SLAB, B.COBBLE_SLAB, B.BRICK_SLAB,
                            B.COBBLE_FENCE, B.BRICK_FENCE,
                        ];
                        const pickaxes = [ITEMS.WOOD_PICK, ITEMS.STONE_PICK, ITEMS.IRON_PICK, ITEMS.GOLD_PICK, ITEMS.DIAMOND_PICK];
                        const shovels = [ITEMS.WOOD_SHOVEL, ITEMS.STONE_SHOVEL, ITEMS.IRON_SHOVEL, ITEMS.GOLD_SHOVEL, ITEMS.DIAMOND_SHOVEL];
                        const axes = [ITEMS.WOOD_AXE, ITEMS.STONE_AXE, ITEMS.IRON_AXE, ITEMS.GOLD_AXE, ITEMS.DIAMOND_AXE];

                        if (tid === B.OBSIDIAN) {
                            if (!item || item.id !== ITEMS.DIAMOND_PICK) {
                                speed = 1;
                                canHarvest = false;
                            } else {
                                speed = TOOL_SPEED[item.id] || 8;
                            }
                        } else if (stoneBlocks.includes(tid)) {
                            if (!item || !pickaxes.includes(item.id)) {
                                // Mining stone without pickaxe is VERY slow (like Minecraft)
                                speed = 1;
                                canHarvest = false;
                            } else {
                                speed = TOOL_SPEED[item.id] || 2;
                            }
                        } else if ([B.DIRT, B.GRASS, B.FARMLAND, B.SAND, B.GRAVEL, B.CLAY_BLOCK,
                            // V12: dirt/sand slabs — shovel preferred
                            B.DIRT_SLAB, B.SAND_SLAB].includes(tid)) {
                            if (item && shovels.includes(item.id)) {
                                speed = TOOL_SPEED[item.id] || 2;
                            } else {
                                speed = 1;
                            }
                        } else if ([B.WOOD, B.PLANK, B.WORKBENCH, B.CHEST,
                        // V10: деревянные ступени/полублоки/заборы и книжная полка тоже бьются топором
                        B.WOOD_STAIRS, B.WOOD_SLAB, B.WOOD_FENCE, B.BOOKSHELF,
                        // V12: дверь/люк/лестница/полка-полублок — тоже дерево, топор быстрее
                        B.WOOD_DOOR, B.WOOD_TRAPDOOR, B.WOOD_GATE, B.LADDER, B.BOOKSHELF_SLAB].includes(tid)) {
                            if (item && axes.includes(item.id)) {
                                speed = TOOL_SPEED[item.id] || 2;
                            } else {
                                speed = 1;
                            }
                        } else if (tid === B.GLASS || tid === B.GLASS_SLAB) {
                            // V10: стекло — мягкое, ломается мгновенно, но без кирки/ножниц обычно ничего не дропает
                            speed = 15;
                        } else if (tid === B.LEAF) {
                            if (item && item.id === ITEMS.SHEARS) speed = 15;
                            else speed = 4;
                        } else if (tid === B.TORCH_PLACED) {
                            speed = 100; // Instant
                        } else if (tid === B.LEVER || tid === B.LADDER) {
                            speed = 50; // V12: рычаг и лестница ломаются очень быстро
                        } else if (tid === B.WHEAT_0 || tid === B.WHEAT_1 || tid === B.WHEAT_2 || tid === B.WHEAT_3) {
                            speed = 100; // V5: пшеница ломается мгновенно
                        } else if (isFlowerOrPlant(tid)) {
                            // V14: цветы и трава ломаются мгновенно, как в Minecraft
                            speed = 1000;
                        } else if (tid === B.SNOW_LAYER) {
                            // V14: тонкий слой снега — мгновенно, лопатой без затрат
                            speed = 1000;
                        } else if (tid === B.SNOW_BLOCK) {
                            if (item && shovels.includes(item.id)) speed = TOOL_SPEED[item.id] || 2;
                            else speed = 1;
                        } else if (tid === B.ICE || tid === B.PACKED_ICE) {
                            if (item && pickaxes.includes(item.id)) speed = TOOL_SPEED[item.id] || 2;
                            else speed = 1;
                        }

                        // Calculate break time (in ticks, roughly)
                        let breakTime = (baseHardness * 30) / (speed * game.miningMultiplier);
                        breakProgress += 1;

                        // Update break stage (0-9 for Minecraft-style animation)
                        breakStage = Math.floor((breakProgress / breakTime) * 10);
                        if (breakStage > 9) breakStage = 9;

                        // VFX: искры при ударе по каменным блокам (каждые ~5 тиков)
                        if ((breakProgress % 5 === 0) && (tid === B.STONE || tid === B.COAL_ORE ||
                            tid === B.IRON_ORE || tid === B.GOLD_ORE || tid === B.DIAMOND_ORE ||
                            tid === B.BRICK || tid === B.FURNACE ||
                            // V10: булыжник и каменные ступени/полублоки/заборы тоже искрят
                            tid === B.COBBLESTONE || tid === B.OBSIDIAN ||
                            tid === B.COBBLE_STAIRS || tid === B.STONE_STAIRS || tid === B.BRICK_STAIRS ||
                            tid === B.STONE_SLAB || tid === B.COBBLE_SLAB || tid === B.BRICK_SLAB ||
                            tid === B.COBBLE_FENCE || tid === B.BRICK_FENCE)) {
                            VFX.pickaxeSpark(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2);
                        }

                        if (breakProgress >= breakTime) {
                            // Durability
                            // V5: пшеница и сорванные растения не снашивают инструмент
                            const noWearBlocks = [B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3, B.TORCH_PLACED];
                            if (item && MAX_DUR[item.id] && !noWearBlocks.includes(tid)) {
                                item.dur--;
                                if (item.dur <= 0) player.inv.remove(item.id, 1);
                            }

                            // DROPS
                            let drop = tid;
                            let xpGain = 0;
                            let extraDrops = []; // V5: список доп. дропов (id, count)
                            if (tid === B.TORCH_PLACED) drop = ITEMS.TORCH;
                            if (tid === B.STONE) {
                                // V10: камень при добыче киркой даёт булыжник, без кирки — ничего
                                if (!canHarvest) drop = null;
                                else drop = B.COBBLESTONE;
                            }
                            if (tid === B.OBSIDIAN) {
                                if (!canHarvest) drop = null;
                            }
                            // V10: стекло без ножниц — разбивается, ничего не дропает
                            if (tid === B.GLASS) {
                                if (!item || item.id !== ITEMS.SHEARS) drop = null;
                            }
                            // V12: стеклянный полублок — то же поведение
                            if (tid === B.GLASS_SLAB) {
                                if (!item || item.id !== ITEMS.SHEARS) drop = null;
                            }
                            if (tid === B.LEAF) {
                                if (item && item.id === ITEMS.SHEARS) drop = B.LEAF;
                                else { drop = null; if (Math.random() < 0.10) drop = ITEMS.APPLE; }
                            }
                            if (tid === B.COAL_ORE) { drop = canHarvest ? ITEMS.COAL : null; if (canHarvest) xpGain = XP_VALUES.COAL_ORE; }
                            if (tid === B.IRON_ORE) { if (canHarvest) xpGain = XP_VALUES.IRON_ORE; }
                            if (tid === B.GOLD_ORE) { if (canHarvest) xpGain = XP_VALUES.GOLD_ORE; }
                            if (tid === B.DIAMOND_ORE) { drop = canHarvest ? ITEMS.DIAMOND : null; if (canHarvest) xpGain = XP_VALUES.DIAMOND_ORE; }
                            if (tid === B.GLOWSTONE) { drop = null; extraDrops.push({ id: ITEMS.GLOWSTONE_DUST, count: 4 }); }

                            // Iron and Gold ore drop themselves (need smelting)
                            if (tid === B.IRON_ORE && !canHarvest) drop = null;
                            if (tid === B.GOLD_ORE && !canHarvest) drop = null;

                            // V14: GRASS дропает только DIRT — семена теперь падают
                            //       только с растений травы (SHORT_GRASS / TALL_GRASS), как в Minecraft.
                            if (tid === B.GRASS) {
                                drop = B.DIRT;
                            }
                            // V14: цветы дропают сами себя — даже без инструмента.
                            if (isSingleFlower(tid)) {
                                drop = tid;
                            }
                            // V14: 2-блочные растения — дроп с НИЖНЕЙ половины (как в MC).
                            //  - sunflower/lilac/rose/peony → дропают только bottom-итем
                            //  - tall grass: ножницы → block, иначе → 1-2 семечка с шансом 87.5%
                            if (isTallPlantBottom(tid) || isTallPlantTop(tid)) {
                                const bottomId = isTallPlantBottom(tid)
                                    ? tid
                                    : tallPlantOtherHalf(tid);
                                if (bottomId === B.TALL_GRASS_BOTTOM) {
                                    if (item && item.id === ITEMS.SHEARS) {
                                        drop = B.TALL_GRASS_BOTTOM;
                                    } else {
                                        drop = null;
                                        if (Math.random() < 0.875) {
                                            const seedCount = 1 + ((Math.random() * 2) | 0); // 1..2
                                            extraDrops.push({ id: ITEMS.WHEAT_SEEDS, count: seedCount });
                                        }
                                    }
                                } else {
                                    drop = bottomId; // sunflower/lilac/rose/peony — итем = нижняя половина
                                }
                            }
                            // V14: одиночная короткая трава — ножницы → block, иначе семечко.
                            if (tid === B.SHORT_GRASS) {
                                if (item && item.id === ITEMS.SHEARS) {
                                    drop = B.SHORT_GRASS;
                                } else {
                                    drop = null;
                                    if (Math.random() < 0.875) {
                                        extraDrops.push({ id: ITEMS.WHEAT_SEEDS, count: 1 });
                                    }
                                }
                            }
                            // V14: тонкий слой снега даёт ничего без лопаты, 2-4 снежка с лопатой.
                            if (tid === B.SNOW_LAYER) {
                                drop = null; // нет item-снежка пока
                            }
                            // Beta 1.1: Cactus drops itself; dead bush drops 0..2 sticks (vanilla).
                            if (tid === B.CACTUS) {
                                drop = B.CACTUS;
                            }
                            if (tid === B.DEAD_BUSH) {
                                drop = null;
                                if (item && item.id === ITEMS.SHEARS) {
                                    drop = B.DEAD_BUSH;
                                } else {
                                    const sticks = (Math.random() * 3) | 0; // 0..2
                                    if (sticks > 0) extraDrops.push({ id: ITEMS.STICK, count: sticks });
                                }
                            }
                            // Beta 1.1: Sandstone — нужна кирка как у камня; иначе ничего.
                            if (tid === B.SANDSTONE) {
                                if (!canHarvest) drop = null;
                            }
                            // V14: лёд без ножниц/Silk Touch — разбивается в воду (упрощённо: ничего)
                            if (tid === B.ICE) {
                                if (!item || item.id !== ITEMS.SHEARS) drop = null;
                            }
                            // V5: FARMLAND дропает DIRT
                            if (tid === B.FARMLAND) {
                                drop = B.DIRT;
                            }
                            // V9 → V11: гравий с шансом 10% дропает кремний вместо себя
                            if (tid === B.GRAVEL) {
                                if (Math.random() < 0.10) drop = ITEMS.FLINT;
                            }
                            // V11: блок глины ломается на 4 куска глины (как в Minecraft)
                            if (tid === B.CLAY_BLOCK) {
                                drop = ITEMS.CLAY;
                                extraDrops.push({ id: ITEMS.CLAY, count: 3 });
                            }
                            // V5: пшеница — дроп зависит от стадии роста
                            if (tid === B.WHEAT_0 || tid === B.WHEAT_1 || tid === B.WHEAT_2) {
                                // Незрелая — только 1 семечко, пшеницы нет
                                drop = ITEMS.WHEAT_SEEDS;
                            }
                            if (tid === B.WHEAT_3) {
                                // Зрелая — 1 пшеница + 1–3 семечка
                                drop = ITEMS.WHEAT;
                                const seedCount = 1 + ((Math.random() * 3) | 0); // 1..3
                                extraDrops.push({ id: ITEMS.WHEAT_SEEDS, count: seedCount });
                                // С малым шансом — ещё одна пшеница
                                if (Math.random() < 0.2) extraDrops.push({ id: ITEMS.WHEAT, count: 1 });
                            }
                            // V5: в любом случае убираем эту клетку из списка активно растущих культур.
                            // Crops state хранится только для MID-слоя.
                            if (targetLayer === LAYER.MID && ((tid >= B.WHEAT_0 && tid <= B.WHEAT_3) || tid === B.SUGARCANE)) {
                                delete world.crops[`${tx},${ty}`];
                            }
                            
                            if (targetLayer === LAYER.MID && tid === B.SUGARCANE) {
                                let cy = ty - 1;
                                while (cy >= 0 && world.getTile(tx, cy, targetLayer) === B.SUGARCANE) {
                                    world.setTile(tx, cy, B.AIR, targetLayer);
                                    delete world.crops[`${tx},${cy}`];
                                    extraDrops.push({ id: B.SUGARCANE, count: 1 });
                                    cy--;
                                }
                            }

                            // Содержимое сундука/печки тоже привязано только к MID.
                            if (targetLayer === LAYER.MID && tid === B.CHEST) {
                                let key = `${tx},${ty}`;
                                if (world.chests[key]) {
                                    world.chests[key].forEach(i => { if (i) player.inv.add(i.id, i.count, i.dur); });
                                    delete world.chests[key];
                                }
                            }
                            if (targetLayer === LAYER.MID && tid === B.FURNACE) {
                                let key = `${tx},${ty}`;
                                if (world.furnaces[key]) delete world.furnaces[key];
                            }
                            // V13: breaking a jukebox stops its music and ejects the disc.
                            if (targetLayer === LAYER.MID && tid === B.JUKEBOX) {
                                ejectJukeboxDisc(tx, ty);
                            }

                            if (drop) player.inv.add(drop, 1);
                            if (extraDrops.length) extraDrops.forEach(d => player.inv.add(d.id, d.count));
                            if (xpGain) game.addScore(xpGain);
                            // Spawn break particles
                            let blockColor = BLOCKS[tid].color || '#888';
                            VFX.blockBreak(tx * TILE_SIZE, ty * TILE_SIZE, blockColor);
                            // лёгкий shake для крепких блоков
                            if (BLOCKS[tid].hard >= 8) {
                                game.screenShake = Math.max(game.screenShake || 0, 2);
                            }
                            // бонус: если руда — летят искры
                            if (tid === B.DIAMOND_ORE || tid === B.GOLD_ORE || tid === B.IRON_ORE || tid === B.COAL_ORE) {
                                const oreCol = tid === B.DIAMOND_ORE ? '#4dd0e1'
                                    : tid === B.GOLD_ORE ? '#ffd54f'
                                        : tid === B.IRON_ORE ? '#ffe0b2'
                                            : '#ffffff';
                                for (let k = 0; k < 8; k++) {
                                    const a = Math.random() * Math.PI * 2;
                                    game.particles.push(new Particle(
                                        tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2,
                                        oreCol,
                                        {
                                            type: 'spark', vx: Math.cos(a) * 4, vy: Math.sin(a) * 4 - 1,
                                            life: 0.6, decay: 0.04, gravity: 0.25
                                        }
                                    ));
                                }
                            }

                            game.audio.playSound('break', tid);
                            // V12: door is 2 tiles tall — breaking one half removes the other.
                            // Only drops a single door item (handled by the regular drop = tid above).
                            if (targetLayer === LAYER.MID && tid === B.WOOD_DOOR) {
                                const m = world.blockMeta && world.blockMeta[`${tx},${ty},${LAYER.MID}`];
                                const otherDy = (m && m.half === 'top') ? 1 : -1;
                                const otherTy = ty + otherDy;
                                if (world.getTile(tx, otherTy) === B.WOOD_DOOR) {
                                    world.setTile(tx, otherTy, B.AIR);
                                    if (world.blockMeta) delete world.blockMeta[`${tx},${otherTy},${LAYER.MID}`];
                                }
                            }
                            // V12: drop only ONE door item — extraDrops would double the drop
                            if (targetLayer === LAYER.MID && tid === B.WOOD_DOOR) {
                                // drop is already tid = B.WOOD_DOOR, count=1
                                // We just need to ensure no other extras get added
                            }
                            // V14: 2-блочные растения — ломаем обе половины одним ударом.
                            if (isTallPlantBottom(tid) || isTallPlantTop(tid)) {
                                const otherTy = isTallPlantBottom(tid) ? ty - 1 : ty + 1;
                                const otherId = world.getTile(tx, otherTy, targetLayer);
                                if (otherId === tallPlantOtherHalf(tid)) {
                                    world.setTile(tx, otherTy, B.AIR, targetLayer);
                                }
                            }
                            // V5: пшеница при сборе оставляет после себя вспаханную землю (только MID).
                            if (targetLayer === LAYER.MID && tid >= B.WHEAT_0 && tid <= B.WHEAT_3) {
                                world.setTile(tx, ty, B.FARMLAND);
                            } else {
                                world.setTile(tx, ty, B.AIR, targetLayer);
                                if (targetLayer === LAYER.BG && world.paintings) {
                                    for (let i = world.paintings.length - 1; i >= 0; i--) {
                                        const p = world.paintings[i];
                                        if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) {
                                            world.paintings.splice(i, 1);
                                            // The class Drop is not defined, we should check how drops are created. Wait, let me check that...
                                            player.inv.add(ITEMS.PAINTING, 1);
                                        }
                                    }
                                }
                            }
                            // V14: если разрушен блок ПОД цветком/травой — растение тоже падает.
                            const aboveId = world.getTile(tx, ty - 1, targetLayer);
                            if (aboveId !== B.AIR && (isSingleFlower(aboveId) || isGrassPlant(aboveId) || isTallPlantBottom(aboveId))) {
                                // если ABOVE — нижняя половина 2-блочного растения, надо удалить и его top
                                if (isTallPlantBottom(aboveId)) {
                                    const tAboveTop = world.getTile(tx, ty - 2, targetLayer);
                                    if (tAboveTop === tallPlantOtherHalf(aboveId)) {
                                        world.setTile(tx, ty - 2, B.AIR, targetLayer);
                                    }
                                }
                                world.setTile(tx, ty - 1, B.AIR, targetLayer);
                            }
                            // V12: clear blockMeta when the block is destroyed (orientation/state gone with the block)
                            const _mk = `${tx},${ty},${targetLayer}`;
                            if (world.blockMeta && world.blockMeta[_mk]) delete world.blockMeta[_mk];
                            // V7: жидкости пересчитываем только для MID-слоя.
                            if (targetLayer === LAYER.MID) world.queueLiquidCross(tx, ty);
                            // Beta 1.0: Breaking obsidian collapses any portal it was framing —
                            // a portal needs an intact obsidian frame to stay lit. We do a
                            // flood-fill from the 4 neighbors and clear any PORTAL cells we reach.
                            if (tid === B.OBSIDIAN) {
                                extinguishNearbyPortal(tx, ty);
                            }

                            breakProgress = 0;
                            breakStage = 0;
                            breakTarget = { x: -1, y: -1, layer: LAYER.MID };
                            stats.mined++;
                            game.updateHUD();
                        }
                    }
                }
            }
        } else {
            breakProgress = 0;
            breakStage = 0;
        }
    }
    game.checkAchievements();
}

// --- SKY PALETTE (плавный lerp между ключевыми временами суток) ---
// time: 0.0=6:00, 0.25=12:00, 0.5=18:00, 0.75=00:00, 1.0=6:00 (cycle)
const SKY_PALETTE = [
    // { t, top, bottom }  top — зенит, bottom — горизонт
    { t: 0.00, top: [90, 120, 170], bot: [250, 170, 120] },  // рассвет (тёплый низ)
    { t: 0.12, top: [95, 175, 230], bot: [180, 220, 245] },  // утро
    { t: 0.25, top: [92, 168, 230], bot: [170, 215, 250] },  // зенит
    { t: 0.42, top: [100, 120, 180], bot: [255, 160, 80] },  // предзакат
    { t: 0.50, top: [50, 40, 90], bot: [220, 90, 50] },  // закат (огонь)
    { t: 0.58, top: [15, 20, 60], bot: [50, 30, 70] },  // сумерки
    { t: 0.75, top: [6, 8, 28], bot: [18, 22, 48] },  // глубокая ночь
    { t: 0.92, top: [40, 45, 90], bot: [180, 90, 100] },  // предрассвет
    { t: 1.00, top: [90, 120, 170], bot: [250, 170, 120] },  // wrap
];
function lerpColor(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}
function skyColors(tNow) {
    for (let i = 0; i < SKY_PALETTE.length - 1; i++) {
        const a = SKY_PALETTE[i], b = SKY_PALETTE[i + 1];
        if (tNow >= a.t && tNow <= b.t) {
            const k = (tNow - a.t) / (b.t - a.t);
            return { top: lerpColor(a.top, b.top, k), bot: lerpColor(a.bot, b.bot, k) };
        }
    }
    return { top: SKY_PALETTE[0].top, bot: SKY_PALETTE[0].bot };
}
function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

// --- STAR FIELD (детерминированный) ---
// Three layers: tiny background stars (most), medium normal, rare bright "named" stars.
// Pseudo-RNG based on a fixed seed so the constellation is the same every game.
const STARS = (() => {
    const arr = [];
    let s = 12345;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 220; i++) {
        const roll = r();
        const size = roll < 0.04 ? 3 : (roll < 0.18 ? 2 : 1);
        // Slight color variance: most pale white, some bluish, some warm.
        const colorRoll = r();
        let color;
        if (colorRoll < 0.10) color = '#aac4ff';
        else if (colorRoll < 0.20) color = '#fff1c0';
        else if (colorRoll < 0.30) color = '#ffd9c0';
        else color = '#ffffff';
        arr.push({
            x: r(),
            y: r() * 0.78,
            size,
            twinkle: r() * Math.PI * 2,
            twinkleSpeed: 0.4 + r() * 1.2,
            color,
        });
    }
    return arr;
})();

// --- SHOOTING STAR state ---
// Spawned occasionally at night. Single-instance for simplicity.
const SHOOTING_STAR = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, trail: [] };
function _maybeSpawnShootingStar(time) {
    if (SHOOTING_STAR.active) return;
    if (time < 0.55 || time > 0.92) return;
    if (Math.random() > 0.0035) return;
    SHOOTING_STAR.active = true;
    SHOOTING_STAR.x = Math.random();
    SHOOTING_STAR.y = Math.random() * 0.4;
    const ang = Math.PI * (0.18 + Math.random() * 0.18); // shallow downward
    const speed = 0.012 + Math.random() * 0.01;
    SHOOTING_STAR.vx = Math.cos(ang) * speed * (Math.random() < 0.5 ? -1 : 1);
    SHOOTING_STAR.vy = Math.sin(ang) * speed;
    SHOOTING_STAR.life = 1.0;
    SHOOTING_STAR.trail = [];
}

function draw() {
    if (!world || !player) {
        ctx.fillStyle = '#1c1a1b'; // Deep cave color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const _ezDraw = getEffectiveZoom();
    let logicalW = canvas.width / _ezDraw;
    let logicalH = canvas.height / _ezDraw;

    let targetCamX = player.x - logicalW / 2;
    let targetCamY = player.y - logicalH / 2;
    targetCamX = Math.max(0, Math.min(targetCamX, world.w * TILE_SIZE - logicalW));
    // Верхняя граница камеры убрана: при полёте над миром camY уходит в минус
    // и сверху рисуется чистое небо. Снизу всё ещё ограничиваем бедроком.
    targetCamY = Math.min(targetCamY, world.h * TILE_SIZE - logicalH);

    if (!game._cameraInitialized) {
        camX = targetCamX;
        camY = targetCamY;
        game._cameraInitialized = true;
    } else {
        camX += (targetCamX - camX) * 0.1;
        camY += (targetCamY - camY) * 0.1;
    }

    // SCREEN SHAKE
    let shakeX = 0, shakeY = 0;
    if (game.screenShake && game.screenShake > 0) {
        shakeX = (Math.random() - 0.5) * game.screenShake;
        shakeY = (Math.random() - 0.5) * game.screenShake;
        game.screenShake *= 0.85;
        if (game.screenShake < 0.1) game.screenShake = 0;
    }

    // Nausea / Portal Wobble Effect
    let nauseaRot = 0;
    let nauseaZoom = 1;
    const portalTouch = (player && player.portalTimer) ? player.portalTimer / 60 : 0;
    let portalAlpha = portalTouch;
    if (game.teleporting) {
        const f = game.teleportFrame || 0;
        portalAlpha = Math.max(portalAlpha, f < 45 ? f / 45 : (90 - f) / 45);
    }
    if (portalAlpha > 0) {
        const now = Date.now();
        // Улучшенное покачивание камеры (смягченный органичный wobble эффект)
        // Комбинируем разные частоты для плавного движения камеры
        shakeX += (Math.sin(now / 150) * 4 + Math.sin(now / 85) * 2) * portalAlpha;
        shakeY += (Math.cos(now / 130) * 4 + Math.sin(now / 105) * 2) * portalAlpha;
        
        // Вращение камеры (очень легкие наклоны из стороны в сторону)
        nauseaRot = (Math.sin(now / 220) * 0.02 + Math.cos(now / 110) * 0.01) * portalAlpha;
        
        // Эффект пульсирующего зума (портал слегка дышит)
        nauseaZoom = 1 + (Math.sin(now / 160) * 0.05 + Math.sin(now / 70) * 0.02) * portalAlpha;
    }

    ctx.save();
    ctx.scale(_ezDraw * nauseaZoom, _ezDraw * nauseaZoom);
    ctx.translate(shakeX, shakeY);
    if (nauseaRot !== 0) {
        ctx.translate(logicalW / 2, logicalH / 2);
        ctx.rotate(nauseaRot);
        ctx.translate(-logicalW / 2, -logicalH / 2);
    }

    // Deep cave background fill (visible when underground)
    ctx.fillStyle = '#1c1a1b';
    ctx.fillRect(-10, -10, logicalW + 20, logicalH + 20);

    // SKY & BACKGROUND (Locked to World Y)
    // We translate by -camY so we are drawing in World Y space.
    ctx.save();
    ctx.translate(0, -camY);

    // The sky and mountains are drawn from Y = 0 down to a horizon line just
    // below the ground level. Old constant был 42 * TILE_SIZE (под старую
    // поверхность y=40); сейчас поверхность смещена на WORLD_OFFSET_Y, поэтому
    // и горизонт сдвигаем туда же.
    const bgHeight = (42 + WORLD_OFFSET_Y) * TILE_SIZE;

    // Если игрок поднялся выше мира (camY < 0) — заливаем «надмирное» небо
    // верхним цветом текущего градиента, чтобы при полёте вверх не было
    // тёмного пещерного фона.
    if (camY < 0) {
        const { top } = skyColors(time);
        ctx.fillStyle = rgb(top);
        // в world-space: от верхнего края экрана (camY) до y=0
        ctx.fillRect(0, camY - 10, logicalW, -camY + 10);
    }

    // Only draw if it's visible on screen
    if (-camY + bgHeight > 0) {
        // Here w = logicalW, h = bgHeight
        // However, camX still uses its own parallax inside the functions.
        drawSky(ctx, logicalW, bgHeight);
        drawStars(ctx, logicalW, bgHeight);
        drawCelestialBodies(ctx, logicalW, bgHeight);
        drawClouds(ctx, logicalW, bgHeight);
        drawBackground(ctx, logicalW, bgHeight, camX);
    }
    ctx.restore();

    // WORLD
    ctx.translate(-Math.floor(camX), -Math.floor(camY));

    let startCol = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
    let endCol = startCol + Math.ceil(logicalW / TILE_SIZE) + 2;
    let startRow = Math.max(0, Math.floor(camY / TILE_SIZE) - 1);
    let endRow = startRow + Math.ceil(logicalH / TILE_SIZE) + 2;

    // --- 1) фоновой слой «стены» за блоками (тёмный тинт + cave gradient) ---
    drawWorldBackgroundLayer(ctx, startCol, endCol, startRow, endRow, logicalH);

    // --- 1.5) BG-слой блоков (декоративный задний план, затемнён 50%) ---
    // Рисуем каждый блок и сразу поверх него — чёрный 30% overlay (на саму клетку,
    // а не на весь видимый прямоугольник — иначе бы темнело небо и MID-слой тоже).
    for (let y = startRow; y <= endRow; y++) {
        for (let x = startCol; x <= endCol; x++) {
            const t = world.getTile(x, y, LAYER.BG);
            if (t === B.AIR) continue;
            drawBlock(ctx, x * TILE_SIZE, y * TILE_SIZE, t, null, x, y, LAYER.BG);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // --- 1.6) Paintings ---
    if (world.paintings) {
        for (const p of world.paintings) {
            const img = PAINTINGS_CACHE[p.imgIndex];
            if (img && img.complete) {
                // If it's visible on screen
                if (p.x + p.w >= startCol && p.x <= endCol && p.y + p.h >= startRow && p.y <= endRow) {
                    ctx.drawImage(img, p.x * TILE_SIZE, p.y * TILE_SIZE, p.w * TILE_SIZE, p.h * TILE_SIZE);
                }
            }
        }
    }

    // --- 2) тайлы (средний слой, с коллизией) ---
    for (let y = startRow; y <= endRow; y++) {
        for (let x = startCol; x <= endCol; x++) {
            let t = world.getTile(x, y);
            if (t !== B.AIR) {
                drawBlock(ctx, x * TILE_SIZE, y * TILE_SIZE, t, null, x, y);
            }
            if (x === breakTarget.x && y === breakTarget.y && breakTarget.layer === LAYER.MID && breakStage > 0) {
                drawBreakOverlay(ctx, x * TILE_SIZE, y * TILE_SIZE, breakStage);
            }
        }
    }

    // --- 3) torch flames (ambient VFX от факелов в кадре) ---
    spawnTorchFlamesInView(startCol, endCol, startRow, endRow);
    // --- 3b) furnace smoke ---
    spawnFurnaceSmokeInView(startCol, endCol, startRow, endRow);

    // ENTITIES
    let faceDir = ((mouse.x / _ezDraw) + camX > player.x) ? 1 : -1;
    drawCreeper(ctx, player, faceDir);

    let held = player.inv.getSelected();
    if (held) drawItem(ctx, player, faceDir, held.id);

    enemies.forEach(e => {
        if (e.type === 0) drawZombie(ctx, e);
        else if (e.type === 1) drawSpider(ctx, e);
        else if (e.type === 2) drawSkeleton(ctx, e);
        else if (e.type === 3) drawEnderman(ctx, e);
    });

    // V16: arrows and ender pearls
    if (typeof arrows !== 'undefined') arrows.forEach(a => drawArrow(ctx, a));
    if (typeof pearls !== 'undefined') pearls.forEach(p => drawEnderPearl(ctx, p));

    // Beta 1.0: Nether mobs + fireballs
    if (typeof pigmen !== 'undefined') pigmen.forEach(p => drawPigman(ctx, p));
    if (typeof ghasts !== 'undefined') ghasts.forEach(g => drawGhast(ctx, g));
    if (typeof fireballs !== 'undefined') fireballs.forEach(f => drawFireball(ctx, f));

    // V16: Show bow draw indicator over player if drawing
    if (player && player.bowDrawTime > 0) drawBowOverlay(ctx, player);

    passives.forEach(e => {
        if (e instanceof PrimedTNT) {
            ctx.save();
            ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
            const scale = 1 + Math.sin(Date.now() / 50) * 0.1;
            ctx.scale(scale, scale);
            drawBlock(ctx, -14, -14, B.TNT, 28);
            if (e.flash) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillRect(-14, -14, 28, 28);
            }
            ctx.restore();
        } else {
            drawPassive(ctx, e);
        }
    });

    // --- 6.5) FG-слой блоков (декоративный передний план, осветлён 30%,
    //          становится прозрачным на 80% когда в клетке/связной группе стоит сущность) ---
    {
        // Собираем тайлы, занятые AABB любой сущности.
        const occupiedTiles = new Set();
        const _addAABB = (e) => {
            const minTX = Math.floor(e.x / TILE_SIZE);
            const maxTX = Math.floor((e.x + e.w - 0.01) / TILE_SIZE);
            const minTY = Math.floor(e.y / TILE_SIZE);
            const maxTY = Math.floor((e.y + e.h - 0.01) / TILE_SIZE);
            for (let yy = minTY; yy <= maxTY; yy++)
                for (let xx = minTX; xx <= maxTX; xx++) occupiedTiles.add(xx + ',' + yy);
        };
        _addAABB(player);
        enemies.forEach(_addAABB);
        passives.forEach(_addAABB);

        // BFS: помечаем как «прозрачные» все FG-клетки, связные с любой занятой сущностью.
        // Связность — 4-соседи по FG (где tilesFg !== AIR). Ограничиваем BFS видимой
        // областью + небольшим запасом, чтобы не уйти в бесконечный мир.
        const fadingTiles = new Set();
        const bfsMinX = startCol - 4, bfsMaxX = endCol + 4;
        const bfsMinY = startRow - 4, bfsMaxY = endRow + 4;
        const queue = [];
        for (const key of occupiedTiles) {
            const comma = key.indexOf(',');
            const xx = +key.slice(0, comma);
            const yy = +key.slice(comma + 1);
            if (world.getTile(xx, yy, LAYER.FG) !== B.AIR && !fadingTiles.has(key)) {
                fadingTiles.add(key);
                queue.push(xx, yy);
            }
        }
        while (queue.length) {
            const y = queue.pop();
            const x = queue.pop();
            const neigh = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
            for (let i = 0; i < 4; i++) {
                const nx = neigh[i][0], ny = neigh[i][1];
                if (nx < bfsMinX || nx > bfsMaxX || ny < bfsMinY || ny > bfsMaxY) continue;
                const k = nx + ',' + ny;
                if (fadingTiles.has(k)) continue;
                if (world.getTile(nx, ny, LAYER.FG) === B.AIR) continue;
                fadingTiles.add(k);
                queue.push(nx, ny);
            }
        }

        game.fgAlphas = game.fgAlphas || new Map();

        for (let y = startRow; y <= endRow; y++) {
            for (let x = startCol; x <= endCol; x++) {
                const t = world.getTile(x, y, LAYER.FG);
                if (t === B.AIR) continue;
                
                const key = x + ',' + y;
                const fading = fadingTiles.has(key);
                
                let currentAlpha = game.fgAlphas.has(key) ? game.fgAlphas.get(key) : 1.0;
                const targetAlpha = fading ? 0.2 : 1.0;
                
                if (currentAlpha !== targetAlpha) {
                    currentAlpha += (targetAlpha - currentAlpha) * 0.15;
                    if (Math.abs(currentAlpha - targetAlpha) < 0.01) currentAlpha = targetAlpha;
                    
                    if (currentAlpha === 1.0) {
                        game.fgAlphas.delete(key);
                    } else {
                        game.fgAlphas.set(key, currentAlpha);
                    }
                }

                if (currentAlpha < 1.0) {
                    ctx.save();
                    ctx.globalAlpha = currentAlpha;
                    drawBlock(ctx, x * TILE_SIZE, y * TILE_SIZE, t, null, x, y, LAYER.FG);
                    ctx.restore();
                } else {
                    drawBlock(ctx, x * TILE_SIZE, y * TILE_SIZE, t, null, x, y, LAYER.FG);
                }

                if (currentAlpha > 0.2) {
                    // Плавное появление белого оверлея
                    const overlayAlpha = 0.04 * ((currentAlpha - 0.2) / 0.8);
                    ctx.fillStyle = `rgba(255,255,255,${overlayAlpha.toFixed(3)})`;
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // Break overlay для FG / BG, если ломаем в этих слоях
        if (breakStage > 0 && breakTarget.layer !== LAYER.MID) {
            drawBreakOverlay(ctx, breakTarget.x * TILE_SIZE, breakTarget.y * TILE_SIZE, breakStage);
        }
    }

    // PARTICLES
    game.particles.forEach(p => p.draw(ctx));

    // CURSOR
    if (!game.isUiOpen()) {
        let worldMx = (mouse.x / _ezDraw) + camX;
        let worldMy = (mouse.y / _ezDraw) + camY;
        let tx = Math.floor(worldMx / TILE_SIZE);
        let ty = Math.floor(worldMy / TILE_SIZE);
        let dist = Math.sqrt((player.x + 10 - worldMx) ** 2 + (player.y + 28 - worldMy) ** 2);
        let reach = 100;
        if (held && held.id >= 100) reach = 150;

        if (dist < reach) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
            // Цвет рамки зависит от активного слоя постройки:
            // BG = синий, MID = белый, FG = жёлтый
            const layerColor = activeBuildLayer === LAYER.BG ? '74,144,226'
                : activeBuildLayer === LAYER.FG ? '255,213,79'
                    : '255,255,255';
            ctx.strokeStyle = `rgba(${layerColor},${0.5 + 0.4 * pulse})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(tx * TILE_SIZE + 0.5, ty * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            // уголки
            ctx.fillStyle = `rgba(${layerColor},0.9)`;
            const cs = 3;
            ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, cs, 1);
            ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, 1, cs);
            ctx.fillRect((tx + 1) * TILE_SIZE - cs, ty * TILE_SIZE, cs, 1);
            ctx.fillRect((tx + 1) * TILE_SIZE - 1, ty * TILE_SIZE, 1, cs);
            ctx.fillRect(tx * TILE_SIZE, (ty + 1) * TILE_SIZE - 1, cs, 1);
            ctx.fillRect(tx * TILE_SIZE, (ty + 1) * TILE_SIZE - cs, 1, cs);
            ctx.fillRect((tx + 1) * TILE_SIZE - cs, (ty + 1) * TILE_SIZE - 1, cs, 1);
            ctx.fillRect((tx + 1) * TILE_SIZE - 1, (ty + 1) * TILE_SIZE - cs, 1, cs);

            // V12: полупрозрачное превью блока, который игрок собирается поставить.
            // Показывается, если в руке есть размещаемый блок и клетка пустая.
            // Для вращаемых блоков (брёвна / ступени / двери / люки) применяется текущий pendingRotation.
            if (held && BLOCKS[held.id]) {
                const targetTid = world.getTile(tx, ty);
                const canPlaceHere = (targetTid === B.AIR) || activeBuildLayer !== LAYER.MID;
                if (canPlaceHere) {
                    const px = tx * TILE_SIZE;
                    const py = ty * TILE_SIZE;
                    ctx.save();
                    ctx.globalAlpha = 0.45;
                    if (ROTATABLE_BLOCKS.has(held.id)) {
                        // Применяем pendingRotation к превью
                        if (held.id === B.WOOD_DOOR) {
                            // Door is 2 tiles tall — preview both halves if the upper tile is also free.
                            const upperFree = world.getTile(tx, ty - 1) === B.AIR;
                            // bottom half at (tx,ty)
                            ctx.save();
                            ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
                            ctx.rotate(pendingRotation * Math.PI / 2);
                            drawDoorHalf(ctx, TILE_SIZE, 'closed', 'bottom');
                            ctx.restore();
                            // top half at (tx, ty-1)
                            if (upperFree) {
                                ctx.save();
                                ctx.translate(px + TILE_SIZE / 2, (ty - 1) * TILE_SIZE + TILE_SIZE / 2);
                                ctx.rotate(pendingRotation * Math.PI / 2);
                                drawDoorHalf(ctx, TILE_SIZE, 'closed', 'top');
                                ctx.restore();
                            }
                        } else if (held.id === B.WOOD_GATE) {
                            ctx.save();
                            ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
                            ctx.fillStyle = '#5d4037';
                            ctx.fillRect(-TILE_SIZE/2, -TILE_SIZE/2 + 8, 4, TILE_SIZE - 8);
                            ctx.fillRect(TILE_SIZE/2 - 4, -TILE_SIZE/2 + 8, 4, TILE_SIZE - 8);
                            ctx.fillStyle = '#795548';
                            ctx.fillRect(-TILE_SIZE/2 + 4, -TILE_SIZE/2 + 12, TILE_SIZE - 8, 4);
                            ctx.fillRect(-TILE_SIZE/2 + 4, -TILE_SIZE/2 + 22, TILE_SIZE - 8, 4);
                            ctx.restore();
                        } else if (held.id === B.WOOD_TRAPDOOR) {
                            ctx.save();
                            ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
                            ctx.rotate(pendingRotation * Math.PI / 2);
                            drawTrapdoorShape(ctx, TILE_SIZE, 'closed');
                            ctx.restore();
                        } else {
                            // Stairs / wood log — pre-rotate the cached tile and render it.
                            const previewTile = getTile(held.id);
                            ctx.save();
                            ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
                            ctx.rotate(pendingRotation * Math.PI / 2);
                            ctx.drawImage(previewTile, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
                            ctx.restore();
                        }
                        // Малая иконка-индикатор поворота: 4 точки, активная — белая.
                        const dotR = 2;
                        for (let d = 0; d < 4; d++) {
                            const dotX = px + TILE_SIZE / 2 + Math.cos(d * Math.PI / 2 - Math.PI / 2) * (TILE_SIZE / 2 - 3) - dotR / 2;
                            const dotY = py + TILE_SIZE / 2 + Math.sin(d * Math.PI / 2 - Math.PI / 2) * (TILE_SIZE / 2 - 3) - dotR / 2;
                            ctx.fillStyle = d === pendingRotation ? '#ffeb3b' : 'rgba(0,0,0,0.6)';
                            ctx.fillRect(dotX, dotY, dotR, dotR);
                        }
                    } else {
                        // Non-rotatable — just draw the block icon translucently.
                        const previewTile = getTile(held.id);
                        if (previewTile) ctx.drawImage(previewTile, px, py, TILE_SIZE, TILE_SIZE);
                    }
                    ctx.restore();
                }
            }
        }
    }

    // --- LIGHTMAP ---
    // Рисуем затемнение как multiply-маску: везде темно ночью/под землёй,
    // но у факелов/лавы/игрока "дырки" света.
    drawLightmap(ctx, logicalW, logicalH, startCol, endCol, startRow, endRow);

    ctx.restore();

    // --- ATMOSPHERIC TINT (vignette + color grading) ---
    drawVignette(ctx, canvas.width, canvas.height);

    // Beta 1.0: Nether portal teleport overlay — purple swirl + wobble.
    // Исключаем повторное объявление переменных, используя уже вычисленное значение portalAlpha
    if (portalAlpha > 0) {
        const w = canvas.width, h = canvas.height;
        const now = Date.now();
        ctx.save();
        ctx.globalAlpha = Math.min(1, portalAlpha);
        
        // Улучшенный оверлей портала (пульсирующий кислотно-фиолетовый градиент)
        const innerRadius = 30 + Math.sin(now / 150) * 40 * portalAlpha;
        const outerRadius = Math.max(w, h) * (1 - 0.15 * portalAlpha * Math.sin(now / 250));
        
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.max(0, innerRadius), w / 2, h / 2, Math.max(0, outerRadius));
        grad.addColorStop(0, `rgba(186, 104, 200, ${0.1 + 0.25 * portalAlpha})`);
        grad.addColorStop(0.4, `rgba(123, 31, 162, ${0.3 + 0.35 * portalAlpha})`);
        grad.addColorStop(0.8, `rgba(74, 20, 140, ${0.5 + 0.45 * portalAlpha})`);
        grad.addColorStop(1, `rgba(15, 0, 30, ${0.7 + 0.3 * portalAlpha})`);
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        // Магическое завихрение-виньетка по краям
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(50, 0, 100, ${0.4 * portalAlpha})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        
        // Swirling particle band (оставляем оригинальные частицы, они выглядят хорошо)
        for (let i = 0; i < 60; i++) {
            const a = (now / 600 + i / 60 * Math.PI * 2) % (Math.PI * 2);
            const r = 60 + 200 * Math.sin(now / 900 + i);
            const px = w / 2 + Math.cos(a) * r * portalAlpha;
            const py = h / 2 + Math.sin(a) * r * portalAlpha;
            ctx.fillStyle = `rgba(${180 + ((Math.sin(now / 200 + i) * 40) | 0)}, ${60 + ((Math.sin(i) * 20) | 0)}, ${200 + ((Math.cos(i) * 30) | 0)}, ${0.5 * portalAlpha})`;
            ctx.fillRect(px, py, 3, 3);
        }
        // Stripes wobbling horizontally.
        ctx.globalAlpha = 0.25 * portalAlpha;
        for (let y = 0; y < h; y += 6) {
            const off = Math.sin(now / 250 + y * 0.04) * 12 * portalAlpha;
            ctx.fillStyle = `rgba(186, 104, 200, ${0.3 + 0.3 * Math.sin(now / 400 + y)})`;
            ctx.fillRect(off, y, w, 2);
        }
        ctx.restore();
    }

    // --- DEBUG (Minecraft-style F3 overlay) ---
    const el = document.getElementById('debug-overlay');
    if (el && !el.classList.contains('hidden')) {
        renderDebugOverlay(el);
    }
}

// Renders the Minecraft-style F3 debug overlay.
// Layout: header, then a "Player" block, "World" block, "Look at" block.
function renderDebugOverlay(el) {
    const px = Math.floor(player.x), py = Math.floor(player.y);
    const tx = Math.floor((player.x + (player.w || 16) / 2) / TILE_SIZE);
    const ty = Math.floor((player.y + (player.h || 16) / 2) / TILE_SIZE);
    const standingOn = world.getTile(tx, ty + 1);
    const insideId = world.getTile(tx, ty);
    const bgId = world.getTile(tx, ty, LAYER.BG);
    const fgId = world.getTile(tx, ty, LAYER.FG);

    // Block the cursor is looking at (mouse hit in world coords)
    let look = '—', lookId = -1, lookX = 0, lookY = 0, lookLayer = 'MID';
    try {
        const ez = (typeof getEffectiveZoom === 'function') ? getEffectiveZoom() : 1;
        const wmx = (mouse.x / ez) + camX;
        const wmy = (mouse.y / ez) + camY;
        lookX = Math.floor(wmx / TILE_SIZE);
        lookY = Math.floor(wmy / TILE_SIZE);
        const lm = world.getTile(lookX, lookY, LAYER.MID);
        if (lm !== B.AIR) { lookId = lm; lookLayer = 'MID'; }
        else {
            const lf = world.getTile(lookX, lookY, LAYER.FG);
            if (lf !== B.AIR) { lookId = lf; lookLayer = 'FG'; }
            else {
                const lb = world.getTile(lookX, lookY, LAYER.BG);
                if (lb !== B.AIR) { lookId = lb; lookLayer = 'BG'; }
            }
        }
        look = blockNameFor(lookId);
    } catch (_) {}

    // Time of day → HH:MM
    const totalMin = Math.floor(((time + 0.25) % 1) * 24 * 60); // game time 0=6:00
    const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const mm = (totalMin % 60).toString().padStart(2, '0');
    const phase = (time < 0.5) ? 'Day' : 'Night';

    // Facing direction inferred from horizontal velocity (no separate facing prop).
    let facing = 'Idle';
    if ((player.vx || 0) > 0.05) facing = 'East (+X)';
    else if ((player.vx || 0) < -0.05) facing = 'West (-X)';

    // Approximate biome from surface block under the player column
    let biomeBlock = standingOn;
    for (let probe = ty; probe < ty + 6; probe++) {
        const id = world.getTile(tx, probe);
        if (id !== B.AIR) { biomeBlock = id; break; }
    }
    const biome = biomeName(biomeBlock, ty);

    // Light level estimate: combine sky brightness + nearby torches/lava/fire
    const sky = Math.max(0, Math.min(15, Math.round((time < 0.5 ? (1 - Math.abs(time - 0.25) * 2) : 0) * 15)));
    let blockLight = 0;
    for (let oy = -3; oy <= 3; oy++) {
        for (let ox = -3; ox <= 3; ox++) {
            const id = world.getTile(tx + ox, ty + oy);
            let lv = 0;
            if (id === B.TORCH_PLACED) lv = 14;
            else if (id === B.FIRE) lv = 15;
            else if (isLava(id)) lv = 15;
            else if (id === B.FURNACE) lv = 12;
            if (lv > 0) {
                const d = Math.abs(ox) + Math.abs(oy);
                blockLight = Math.max(blockLight, lv - d * 1.5);
            }
        }
    }
    const lightLevel = Math.max(0, Math.min(15, Math.round(Math.max(sky, blockLight))));

    // Counts
    const entityCount = (typeof enemies !== 'undefined' ? enemies.length : 0) +
                        (typeof passives !== 'undefined' ? passives.length : 0) + 1;
    const partCount = (game.particles && game.particles.length) || 0;
    const fireCount = (world.fires && world.fires.size) || 0;
    const liqCount  = (world.waterSources ? world.waterSources.size : 0) +
                      (world.lavaSources ? world.lavaSources.size : 0);

    // Held item name
    let held = '—';
    try {
        const slot = player.inv && player.inv.slots && player.inv.slots[player.inv.selected];
        if (slot && slot.id !== undefined) held = blockNameFor(slot.id) + (slot.count > 1 ? ` x${slot.count}` : '');
    } catch (_) {}

    const lines = [];
    const H = (s) => `<span class="dbg-h">${s}</span>`;
    const K = (s) => `<span class="dbg-k">${s}</span>`;
    const V = (s) => `<span class="dbg-v">${s}</span>`;
    const SEP = `<span class="dbg-sep">────────────────────</span>`;

    lines.push(H('Creep Craft: Reborn (F3 Debug)'));
    lines.push(K('FPS') + ': ' + V(`${game.fps | 0}`) +
               '   ' + K('Particles') + ': ' + V(partCount) +
               '   ' + K('Entities') + ': ' + V(entityCount));
    lines.push(SEP);
    lines.push(H('Player'));
    lines.push(K('XY') + ': ' + V(`${px}, ${py}`) + '   ' + K('Block') + ': ' + V(`${tx}, ${ty}`));
    lines.push(K('Chunk') + ': ' + V(`${(tx >> 4)}, ${(ty >> 4)}`) + '   ' + K('Facing') + ': ' + V(facing));
    lines.push(K('Velocity') + ': ' + V(`${(player.vx || 0).toFixed(2)}, ${(player.vy || 0).toFixed(2)}`));
    lines.push(K('HP') + ': ' + V(`${(player.hp || 0).toFixed(1)} / ${player.maxHp || 10}`) +
               '   ' + K('Flying') + ': ' + V(player.flying ? 'on' : 'off'));
    lines.push(K('Held') + ': ' + V(held));
    lines.push(SEP);
    lines.push(H('World'));
    lines.push(K('Seed') + ': ' + V(world.seed));
    lines.push(K('Time') + ': ' + V(`${hh}:${mm}`) + '  (' + V(phase) + ')   ' + K('Day') + ': ' + V(day));
    lines.push(K('Biome') + ': ' + V(biome) + '   ' + K('Light') + ': ' + V(`${lightLevel} (sky ${sky})`));
    // Beta 1.1: climate readout (temperature & humidity, как F3 в Minecraft).
    {
        const cx = Math.max(0, Math.min(world.w - 1, tx));
        const temp = world.getTemperatureAt ? world.getTemperatureAt(cx) : 0.5;
        const hum  = world.getHumidityAt    ? world.getHumidityAt(cx)    : 0.5;
        lines.push(K('Temp') + ': ' + V(temp.toFixed(2)) + '   ' + K('Humidity') + ': ' + V(hum.toFixed(2)));
    }
    lines.push(K('Fires') + ': ' + V(fireCount) + '   ' + K('Liquids') + ': ' + V(liqCount));
    lines.push(K('Difficulty') + ': ' + V(difficultyName(game.difficulty)) +
               '   ' + K('Layer') + ': ' + V(LAYER_NAMES[activeBuildLayer]));
    lines.push(SEP);
    lines.push(H('Targeted Block'));
    lines.push(K('Pos') + ': ' + V(`${lookX}, ${lookY}`) + '   ' + K('Layer') + ': ' + V(lookLayer));
    lines.push(K('Block') + ': ' + V(look) + ' ' + (lookId >= 0 ? `(id ${lookId})` : ''));
    lines.push(K('Standing') + ': ' + V(blockNameFor(standingOn)) +
               '   ' + K('Inside') + ': ' + V(blockNameFor(insideId)));
    lines.push(K('BG/FG') + ': ' + V(`${blockNameFor(bgId)} / ${blockNameFor(fgId)}`));
    lines.push(SEP);
    lines.push(K('Score') + ': ' + V(totalScore) +
               '   ' + K('Mined') + ': ' + V(stats.mined || 0) +
               '   ' + K('Kills') + ': ' + V(stats.kills || 0));

    el.innerHTML = lines.join('\n');
}

function difficultyName(d) {
    if (d === 0) return 'Peaceful';
    if (d === 1) return 'Easy';
    if (d === 2) return 'Normal';
    if (d === 3) return 'Hard';
    return String(d);
}

function biomeName(blockId, ty) {
    // Beta 1.1: prefer the column biome from world.biomeMap if available;
    // fall back to block-driven heuristic for completeness.
    if (ty > 70 + (WORLD_OFFSET_Y || 0)) return 'Caves';
    if (typeof world !== 'undefined' && world && world.biomeMap && typeof player !== 'undefined' && player) {
        const px = Math.floor((player.x + player.w / 2) / TILE_SIZE);
        const b = world.getBiomeAt ? world.getBiomeAt(px) : null;
        if (b === 'desert') return 'Desert';
        if (b === 'ocean')  return 'Ocean';
        if (b === 'beach')  return 'Beach';
        if (b === 'snow')   return 'Snowy Plains';
        if (b === 'plains') return 'Plains';
    }
    if (blockId === B.SAND) return 'Desert';
    if (blockId === B.SNOW_BLOCK || blockId === B.SNOW_LAYER || blockId === B.ICE || blockId === B.PACKED_ICE) return 'Snowy Plains';
    if (blockId === B.GRASS) return 'Plains';
    if (blockId === B.GRAVEL) return 'Gravel Beach';
    if (blockId === B.DIRT) return 'Plains';
    if (blockId === B.STONE) return 'Mountains';
    if (isWater(blockId)) return 'Ocean';
    if (isLava(blockId)) return 'Volcano';
    return 'The Overworld';
}

function blockNameFor(id) {
    if (id === undefined || id === B.AIR) return 'air';
    // Reverse-lookup the block constant name
    for (const k in B) { if (B[k] === id) return k.toLowerCase(); }
    for (const k in ITEMS) { if (ITEMS[k] === id) return k.toLowerCase(); }
    return String(id);
}

// --- DRAW HELPERS ---

function drawSky(c, w, h) {
    // Beta 1.0: Custom Nether sky — dim red/maroon gradient with no sun/moon.
    if (game && game.inNether) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1a0606');
        g.addColorStop(0.45, '#3a0d0d');
        g.addColorStop(1, '#5a1818');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        // Subtle horizontal banding to suggest distant haze.
        for (let y = 0; y < h; y += 14) {
            const a = 0.04 + 0.03 * Math.sin(y * 0.04);
            c.fillStyle = `rgba(120, 20, 20, ${a})`;
            c.fillRect(0, y, w, 6);
        }
        // Drifting glowing ember dots (parallax based on time).
        const t = Date.now() / 50;
        for (let i = 0; i < 60; i++) {
            const ex = ((i * 137 + t * 0.5) % (w + 100)) - 50;
            const ey = ((i * 53) % h);
            const col = i % 3 === 0 ? '#ffd54f' : (i % 3 === 1 ? '#ff7043' : '#bf360c');
            c.fillStyle = col;
            c.fillRect(ex, ey, 2, 2);
        }
        return;
    }

    // Three-stop atmospheric gradient: zenith → mid sky → horizon.
    // The mid stop is interpolated from top and bot for a smooth haze band.
    const { top, bot } = skyColors(time);
    const mid = [
        Math.round(top[0] * 0.55 + bot[0] * 0.45),
        Math.round(top[1] * 0.55 + bot[1] * 0.45),
        Math.round(top[2] * 0.55 + bot[2] * 0.45),
    ];
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(top));
    g.addColorStop(0.55, rgb(mid));
    g.addColorStop(1, rgb(bot));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // Sunset / sunrise warm band over the horizon — wider and brighter.
    const sunsetStrength =
        (time > 0.38 && time < 0.58) ? Math.max(0, 1 - Math.abs(time - 0.48) / 0.1) :
            (time > 0.88 || time < 0.08) ? Math.max(0, 1 - Math.abs((time > 0.5 ? time - 1 : time)) / 0.1) : 0;
    if (sunsetStrength > 0) {
        const hy = h * 0.62;
        // Layer 1: hot orange band right at horizon.
        const gg = c.createLinearGradient(0, hy - 80, 0, hy + 60);
        gg.addColorStop(0, `rgba(255,120,40,0)`);
        gg.addColorStop(0.4, `rgba(255,130,60,${0.45 * sunsetStrength})`);
        gg.addColorStop(0.7, `rgba(255,170,90,${0.3 * sunsetStrength})`);
        gg.addColorStop(1, `rgba(255,210,140,0)`);
        c.fillStyle = gg;
        c.fillRect(0, hy - 80, w, 140);
        // Layer 2: pink/magenta high-altitude glow.
        const gg2 = c.createLinearGradient(0, hy - 220, 0, hy - 60);
        gg2.addColorStop(0, `rgba(180,90,140,0)`);
        gg2.addColorStop(1, `rgba(255,150,170,${0.18 * sunsetStrength})`);
        c.fillStyle = gg2;
        c.fillRect(0, hy - 220, w, 160);
    }

    // Atmospheric horizon haze — thin desaturated band, always present, that
    // makes distant mountains "fade into" the sky instead of cutting hard.
    {
        const hy = h * 0.78;
        const gg = c.createLinearGradient(0, hy - 30, 0, h);
        gg.addColorStop(0, `rgba(${bot[0]},${bot[1]},${bot[2]},0)`);
        gg.addColorStop(1, `rgba(${bot[0]},${bot[1]},${bot[2]},0.4)`);
        c.fillStyle = gg;
        c.fillRect(0, hy - 30, w, h - hy + 30);
    }
}

function drawStars(c, w, h) {
    if (game && game.inNether) return;
    // Stars visible at night; smooth fade in/out across dusk and dawn.
    let star = 0;
    if (time > 0.50 && time < 0.97) {
        star = Math.min(1, (time - 0.50) / 0.10) * Math.min(1, (0.97 - time) / 0.10);
    }
    if (star <= 0) return;
    const tNow = Date.now() / 600;

    // Aurora-like ribbon — only on deep night, very subtle.
    if (time > 0.62 && time < 0.88) {
        const auroraT = Math.min(1, (time - 0.62) / 0.06) * Math.min(1, (0.88 - time) / 0.06);
        if (auroraT > 0.05) {
            const ay = h * 0.18;
            for (let i = 0; i < 3; i++) {
                const ph = Date.now() / (4500 + i * 1300);
                const xOff = Math.sin(ph + i) * 60;
                const grd = c.createLinearGradient(0, ay - 60 - i * 20, 0, ay + 80 + i * 20);
                const colors = [
                    [80, 255, 180], [120, 200, 255], [180, 140, 255]
                ];
                const col = colors[i];
                grd.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
                grd.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},${0.06 * auroraT})`);
                grd.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
                c.save();
                c.fillStyle = grd;
                c.translate(xOff, 0);
                c.fillRect(-w * 0.3, ay - 80 - i * 20, w * 1.6, 160 + i * 40);
                c.restore();
            }
        }
    }

    // Stars themselves.
    for (const s of STARS) {
        const tw = 0.5 + 0.5 * Math.sin(tNow * s.twinkleSpeed + s.twinkle);
        c.globalAlpha = star * (0.35 + 0.65 * tw);
        c.fillStyle = s.color;
        const sx = (s.x * w) | 0, sy = (s.y * h) | 0;
        c.fillRect(sx, sy, s.size, s.size);
        // Bright stars get a tiny cross flare.
        if (s.size === 3 && tw > 0.6) {
            c.globalAlpha = star * (tw - 0.6) * 0.7;
            c.fillRect(sx - 1, sy + 1, 1, 1);
            c.fillRect(sx + 3, sy + 1, 1, 1);
            c.fillRect(sx + 1, sy - 1, 1, 1);
            c.fillRect(sx + 1, sy + 3, 1, 1);
        }
    }
    c.globalAlpha = 1;

    // Update + draw shooting star.
    _maybeSpawnShootingStar(time);
    if (SHOOTING_STAR.active) {
        SHOOTING_STAR.trail.push({ x: SHOOTING_STAR.x, y: SHOOTING_STAR.y });
        if (SHOOTING_STAR.trail.length > 18) SHOOTING_STAR.trail.shift();
        SHOOTING_STAR.x += SHOOTING_STAR.vx;
        SHOOTING_STAR.y += SHOOTING_STAR.vy;
        SHOOTING_STAR.life -= 0.018;
        if (SHOOTING_STAR.life <= 0 || SHOOTING_STAR.x < -0.1 || SHOOTING_STAR.x > 1.1) {
            SHOOTING_STAR.active = false;
        } else {
            // Trail fading out behind the head.
            for (let i = 0; i < SHOOTING_STAR.trail.length; i++) {
                const t = SHOOTING_STAR.trail[i];
                const a = (i / SHOOTING_STAR.trail.length) * SHOOTING_STAR.life * 0.9;
                c.globalAlpha = a;
                c.fillStyle = '#fff7d6';
                c.fillRect(t.x * w, t.y * h, 2, 2);
            }
            c.globalAlpha = SHOOTING_STAR.life;
            c.fillStyle = '#ffffff';
            c.fillRect(SHOOTING_STAR.x * w, SHOOTING_STAR.y * h, 3, 3);
            c.globalAlpha = 1;
        }
    }
}

function drawCelestialBodies(c, w, h) {
    if (game && game.inNether) return;
    const posX = w * 0.5;

    if (time <= 0.5) {
        const sunProgress = time / 0.5;
        const sunY = (h - 80) - Math.sin(sunProgress * Math.PI) * 350;
        const SUN = 96;
        const halfS = SUN / 2;
        const sx = (posX - halfS) | 0;
        const sy = (sunY - halfS) | 0;

        // --- Sun glow halo — Minecraft style (square layers)
        const lowness = 1 - Math.sin(sunProgress * Math.PI); // 1 at horizon, 0 at noon
        // Significantly reduced halo size (was relative to SUN, now relative to half size with smaller multipliers)
        const baseR = SUN / 2;
        const haloR = baseR * (1.3 + lowness * 0.8);
        const cx = posX, cy = sunY;
        const warm = lowness > 0.4;
        
        const steps = 4;
        for (let i = steps; i > 0; i--) {
            const r = haloR * (i / steps);
            const a = warm ? 0.15 : 0.1;
            c.fillStyle = warm ? `rgba(255,180,80,${a})` : `rgba(255,240,160,${a})`;
            c.fillRect(cx - r, cy - r, r * 2, r * 2);
        }

        // Soft outer aura (subtle pulse), also square
        const pulse = 1 + 0.04 * Math.sin(Date.now() / 700);
        const auraR = haloR * 1.2 * pulse;
        for (let i = 2; i > 0; i--) {
            const r = auraR * (i / 2);
            c.fillStyle = `rgba(255,210,130,${warm ? 0.06 : 0.04})`;
            c.fillRect(cx - r, cy - r, r * 2, r * 2);
        }

        // Sun face — yellow square with white core.
        c.fillStyle = warm ? '#ffb84a' : '#ffd54a';
        c.fillRect(sx, sy, SUN, SUN);
        const INNER = 56;
        c.fillStyle = '#ffffff';
        c.fillRect(sx + (SUN - INNER) / 2, sy + (SUN - INNER) / 2, INNER, INNER);
    }

    if (time > 0.5) {
        const moonProgress = (time - 0.5) / 0.5;
        const moonY = (h - 80) - Math.sin(moonProgress * Math.PI) * 350;
        const MOON = 72;
        const halfM = MOON / 2;
        const mx = (posX - halfM) | 0;
        const my = (moonY - halfM) | 0;

        // --- Moon glow halo — Minecraft style (square layers)
        const lowness = 1 - Math.sin(moonProgress * Math.PI);
        const baseRM = MOON / 2;
        const haloR = baseRM * (1.4 + lowness * 0.6);
        const cx = posX, cy = moonY;
        
        const steps = 3;
        for (let i = steps; i > 0; i--) {
            const r = haloR * (i / steps);
            c.fillStyle = `rgba(180,210,255,0.08)`;
            c.fillRect(cx - r, cy - r, r * 2, r * 2);
        }

        // Moon face — pale square with brighter core.
        c.fillStyle = '#b0bec5';
        c.fillRect(mx, my, MOON, MOON);
        const INNER_M = 40;
        c.fillStyle = '#eceff1';
        c.fillRect(mx + (MOON - INNER_M) / 2, my + (MOON - INNER_M) / 2, INNER_M, INNER_M);

        // Crater dots — tiny darker squares for texture.
        c.fillStyle = '#90a4ae';
        c.fillRect(mx + 14, my + 22, 6, 6);
        c.fillRect(mx + 44, my + 14, 5, 5);
        c.fillRect(mx + 28, my + 50, 8, 8);
        c.fillRect(mx + 52, my + 44, 4, 4);
    }
}

function drawClouds(c, w, h) {
    if (game && game.inNether) return;
    if (!world || !world.clouds) return;
    const isNight = time >= 0.55 && time < 0.95;
    const isSunset = (time > 0.38 && time < 0.55) || (time > 0.88);

    if (!world._cloudsSorted) {
        world.clouds.sort((a, b) => (a.layer || 0) - (b.layer || 0));
        world._cloudsSorted = true;
    }

    world.clouds.forEach(cloud => {
        if (!cloud.segments) return;
        const parallax = cloud.parallax != null ? cloud.parallax : 0.3;
        const screenX = cloud.x - camX * parallax;
        
        // Slightly wider bounds check due to large blocks
        if (screenX <= -600 || screenX >= w + 600) return;

        const layer = cloud.layer || 0;
        let baseCol, alpha, shadowDelta;
        
        if (isNight) {
            baseCol = layer === 0 ? '90,100,130' : '110,120,150';
            alpha = layer === 0 ? 0.35 : 0.45;
            shadowDelta = 30;
        } else if (isSunset) {
            baseCol = layer === 0 ? '255,200,180' : '255,180,150';
            alpha = layer === 0 ? 0.7 : 0.85;
            shadowDelta = 40;
        } else {
            baseCol = layer === 0 ? '240,245,255' : '255,255,255';
            alpha = layer === 0 ? 0.65 : 0.9;
            shadowDelta = 30;
        }

        const sx = screenX | 0;
        const sy = cloud.y | 0;
        const shadowCol = baseCol.split(',').map(n => Math.max(0, +n - shadowDelta)).join(',');

        cloud.segments.forEach(seg => {
            // Main cloud body
            c.fillStyle = `rgba(${baseCol},${alpha})`;
            c.fillRect(sx + seg.x, sy + seg.y, seg.w, seg.h);
            
            // Bottom shadow (Minecraft-style flat grey bottom)
            c.fillStyle = `rgba(${shadowCol},${alpha})`;
            c.fillRect(sx + seg.x, sy - 8, seg.w, 8);
        });
    });
}

function drawBackground(c, w, h, camX) {
    // Beta 1.0: Nether has no mountains/parallax — just the red sky from drawSky.
    if (game && game.inNether) return;
    if (!world || !world.mountainPoints || world.mountainPoints.length === 0) return;

    // Функция для отрисовки "кубического" фона слоями с поддержкой "верхушек" (трава/снег)
    const drawBlockyLayer = (parallax, heightMult, offset, tint, strokeCol, topTint, topHeight) => {
        let segments = [];
        for (let i = 0; i < world.mountainPoints.length; i++) {
            let point = world.mountainPoints[i];
            let screenX = point.x * TILE_SIZE - camX * parallax;

            if (screenX > w + TILE_SIZE || screenX < -TILE_SIZE * 2) continue;

            let rawY = h - (point.h * heightMult + Math.cos(point.x * 0.1) * offset) - offset;
            let drawY = Math.floor(rawY / TILE_SIZE) * TILE_SIZE;

            if (drawY >= h) continue;

            let x1 = Math.floor(screenX);
            let x2 = Math.floor(screenX + TILE_SIZE);
            segments.push({ x1, x2, drawY });
        }

        if (segments.length === 0) return;

        // 1. Основной цвет гор (заливка от рельефа до горизонта)
        c.fillStyle = tint;
        c.beginPath();
        c.moveTo(segments[0].x1, h);
        for (let i = 0; i < segments.length; i++) {
            let s = segments[i];
            c.lineTo(s.x1, s.drawY);
            c.lineTo(s.x2, s.drawY);
        }
        c.lineTo(segments[segments.length - 1].x2, h);
        c.closePath();
        c.fill();

        // 2. Верхний слой (например, трава/снег)
        if (topTint) {
            let tH = topHeight || TILE_SIZE;
            c.fillStyle = topTint;
            c.beginPath();
            c.moveTo(segments[0].x1, segments[0].drawY);
            for (let i = 0; i < segments.length; i++) {
                let s = segments[i];
                c.lineTo(s.x1, s.drawY);
                c.lineTo(s.x2, s.drawY);
            }
            for (let i = segments.length - 1; i >= 0; i--) {
                let s = segments[i];
                c.lineTo(s.x2, s.drawY + tH);
                c.lineTo(s.x1, s.drawY + tH);
            }
            c.closePath();
            c.fill();
        }

        // 3. Тонкий блик/обводка сверху
        if (strokeCol) {
            c.fillStyle = strokeCol;
            c.beginPath();
            c.moveTo(segments[0].x1, segments[0].drawY);
            for (let i = 0; i < segments.length; i++) {
                let s = segments[i];
                c.lineTo(s.x1, s.drawY);
                c.lineTo(s.x2, s.drawY);
            }
            for (let i = segments.length - 1; i >= 0; i--) {
                let s = segments[i];
                c.lineTo(s.x2, s.drawY + 4);
                c.lineTo(s.x1, s.drawY + 4);
            }
            c.closePath();
            c.fill();
        }
    };

    // V8.2: плавное смешивание цветов по времени суток.
    // Передаём 3 цвета: дневной, закатный, ночной ([r,g,b,a]). Весь переход непрерывен.
    const _colorBlend = (day, sunset, night) => {
        const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        let nW = 0;
        if (time >= 0.40 && time < 0.55) nW = ss(0.40, 0.55, time);
        else if (time >= 0.55 && time < 0.85) nW = 1;
        else if (time >= 0.85 && time <= 1.00) nW = 1 - ss(0.85, 1.00, time);
        // Закат пикует дважды: ≈0.475 (день→ночь) и ≈0.925 (ночь→день)
        const peak = (c, w) => Math.max(0, 1 - Math.abs(time - c) / w);
        let sW = Math.max(peak(0.475, 0.08), peak(0.925, 0.08));
        sW = Math.min(sW, 1 - nW);
        const dW = Math.max(0, 1 - nW - sW);
        const r = day[0] * dW + sunset[0] * sW + night[0] * nW;
        const g = day[1] * dW + sunset[1] * sW + night[1] * nW;
        const b = day[2] * dW + sunset[2] * sW + night[2] * nW;
        const a = (day[3] == null ? 1 : day[3]) * dW + (sunset[3] == null ? 1 : sunset[3]) * sW + (night[3] == null ? 1 : night[3]) * nW;
        return `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
    };

    // 0. Atmospheric haze layer — barely visible silhouette dissolving into sky.
    // Adds visible depth perception for the distant horizon.
    const hazeTint = _colorBlend([175, 190, 215, 0.3], [120, 90, 110, 0.4], [25, 35, 60, 0.6]);
    drawBlockyLayer(0.04, 0.25, 80, hazeTint, null);

    // 1. Самые дальние горы
    const skyTint = _colorBlend([150, 170, 200, 0.5], [80, 50, 70, 0.6], [20, 30, 55, 0.8]);
    drawBlockyLayer(0.08, 0.4, 60, skyTint, null);

    // 2. Средние горы (добавлена легкая текстурность верхушек)
    const midTint = _colorBlend([120, 140, 175, 0.7], [100, 60, 80, 0.7], [30, 40, 70, 0.85]);
    const midTopTint = _colorBlend([130, 150, 185, 0.7], [110, 70, 90, 0.7], [35, 45, 75, 0.85]);
    drawBlockyLayer(0.25, 0.7, 30, midTint, null, midTopTint, TILE_SIZE);

    // 3. Ближние горы (земля с зеленой травой сверху)
    const nearTint = _colorBlend([74, 58, 50, 1], [74, 46, 46, 1], [21, 17, 26, 1]);
    const nearTopTint = _colorBlend([86, 142, 60, 1], [88, 84, 42, 1], [22, 42, 26, 1]);
    const rimCol = _colorBlend([255, 240, 180, 0.3], [255, 140, 60, 0.45], [80, 100, 160, 0.25]);
    drawBlockyLayer(0.5, 1.0, 0, nearTint, rimCol, nearTopTint, Math.floor(TILE_SIZE * 0.25));

    // Деревья на фоне (Квадратные, с небольшими бликами)
    const treeLeafCol = _colorBlend([56, 142, 60, 1], [58, 74, 42, 1], [16, 32, 20, 1]);
    const treeTrunkCol = _colorBlend([78, 52, 46, 1], [78, 52, 46, 1], [24, 16, 12, 1]);
    const leafHighlight = _colorBlend([76, 162, 80, 0.8], [78, 94, 62, 0.8], [26, 52, 30, 0.8]);

    world.bgObjects.forEach(obj => {
        if (obj.type === 'bg_tree') {
            let screenX = obj.x - camX * 0.5;
            if (screenX > -100 && screenX < w + 100) {
                const scale = obj.size || 1;
                // Квадратные блоки ствола и листвы
                const trunkW = 12 * scale;
                const trunkH = 32 * scale;
                const leafW = 48 * scale;
                const leafH = 32 * scale;

                let rawY = h - (WORLD_H * TILE_SIZE - obj.y);
                let drawY = Math.floor(rawY / TILE_SIZE) * TILE_SIZE;

                c.fillStyle = treeTrunkCol;
                c.fillRect(Math.floor(screenX - trunkW / 2), drawY - trunkH, trunkW, trunkH);

                c.fillStyle = treeLeafCol;
                // Основной квадрат листвы
                c.fillRect(Math.floor(screenX - leafW / 2), drawY - trunkH - leafH, leafW, leafH);
                // "Пиксельная" шапка
                c.fillRect(Math.floor(screenX - leafW / 4), drawY - trunkH - leafH - 16 * scale, leafW / 2, 16 * scale);

                // Детализация листвы
                c.fillStyle = leafHighlight;
                c.fillRect(Math.floor(screenX - leafW / 2 + 4 * scale), drawY - trunkH - leafH + 4 * scale, 8 * scale, 8 * scale);
                c.fillRect(Math.floor(screenX + leafW / 4 - 4 * scale), drawY - trunkH - leafH + 12 * scale, 8 * scale, 8 * scale);

                // Тень листвы снизу
                c.fillStyle = 'rgba(0,0,0,0.2)';
                c.fillRect(Math.floor(screenX - leafW / 2), drawY - trunkH - 8 * scale, leafW, 8 * scale);
            }
        }
    });
}

// --- Фоновый слой «стены» за пустыми тайлами ---
// Делаем более глубокий вид: если пустота окружена камнем — рисуем тёмный фон-«грунт».
function drawWorldBackgroundLayer(c, sx, ex, sy, ey, logicalH) {
    // Отрисовка фонового слоя убрана по запросу пользователя
}

// --- Лайтмап: накладываем темноту (ночь/пещера), а у источников света — «дыры» ---
function drawLightmap(c, w, h, sx, ex, sy, ey) {
    // V8.2: плавный расчёт темноты через smoothstep — никаких скачков производной.
    // Границы цикла (time ∈ [0,1]):
    //   0.00..0.40  — ДЕНЬ           (темнота = 0)
    //   0.40..0.55  — ЗАКАТ           (плавно 0 → NIGHT_MAX)
    //   0.55..0.85  — НОЧЬ            (держим NIGHT_MAX)
    //   0.85..1.00  — РАССВЕТ         (плавно NIGHT_MAX → 0)
    // Переходы теперь длинные (~15% времени суток) и сглажены S-образной кривой,
    // поэтому глаз не замечает момента «вкл/выкл» темноты.
    const NIGHT_MAX = 0.82;
    const smoothstep = (e0, e1, x) => {
        const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    };

    // В Незере нет дня и ночи — глобальное освещение фиксировано (свечение
    // лавы/глоустоуна делает атмосферу красно-тёмной без затемнения времени).
    // Также пропускаем «глубинную» темноту: пещеры Незера сами по себе тёмные,
    // дополнительный градиент вниз создавал ложный эффект «опускания в шахту».
    const inNetherDim = (typeof game !== 'undefined' && game.inNether);

    let nightDark = 0;
    if (!inNetherDim) {
        if (time >= 0.40 && time < 0.55) {
            // закат: постепенное погружение
            nightDark = smoothstep(0.40, 0.55, time) * NIGHT_MAX;
        } else if (time >= 0.55 && time < 0.85) {
            // полная ночь
            nightDark = NIGHT_MAX;
        } else if (time >= 0.85 && time <= 1.00) {
            // рассвет: плавное просветление
            nightDark = (1 - smoothstep(0.85, 1.00, time)) * NIGHT_MAX;
        }
    }

    // Глубина: если игрок "в пещере" (над ним много блоков), усиливаем темноту.
    // Только для надмирья — в Незере не применяется (см. inNetherDim выше).
    let caveDark = 0;
    if (!inNetherDim) {
        const py = Math.floor((player.y + player.h / 2) / TILE_SIZE);

        // Плавный переход в темноту пещеры в зависимости от глубины.
        // Граница «начала пещеры» — пара блоков ниже поверхности (40 + WORLD_OFFSET_Y).
        const _caveStartY = 42 + WORLD_OFFSET_Y;
        if (py > _caveStartY) {
            caveDark = Math.min(0.85, (py - _caveStartY) * 0.04);
        }
    }

    const total = Math.max(nightDark, caveDark);
    if (total <= 0.05) return;

    // Инициализация off-screen canvas для lightmap
    if (!game.lightmapCanvas) {
        game.lightmapCanvas = document.createElement('canvas');
        game.lightmapCtx = game.lightmapCanvas.getContext('2d', { willReadFrequently: true });
    }
    const lCvs = game.lightmapCanvas;
    const lc = game.lightmapCtx;
    if (lCvs.width !== w || lCvs.height !== h) {
        lCvs.width = w; lCvs.height = h;
    }
    lc.clearRect(0, 0, w, h);

    const nightTint = nightDark > 0.3 ? `rgba(6,12,35,${nightDark})` : `rgba(0,0,0,${nightDark})`;
    const caveTint = `rgba(5,8,12,${caveDark})`; // слегка синеватый оттенок тьмы

    lc.fillStyle = caveDark >= nightDark ? caveTint : nightTint;

    // Плавный вертикальный градиент для спуска в пещеру
    if (caveDark > nightDark) {
        let grad = lc.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(5,8,12,${Math.max(0, caveDark - 0.2)})`);
        grad.addColorStop(1, caveTint);
        lc.fillStyle = grad;
    }

    lc.fillRect(0, 0, w, h);

    // Вырезаем свет от факелов (destination-out)
    lc.globalCompositeOperation = 'destination-out';
    lc.save();
    lc.translate(-camX, -camY);

    // Факелы и источники света в поле зрения.
    // FG-слой тоже может содержать факелы (передний план) — они тоже светят.
    // BG-факелы НЕ светят (они за стенкой).
    for (let y = sy; y <= ey; y++) {
        for (let x = sx; x <= ex; x++) {
            const tMid = world.getTile(x, y);
            const tFg = world.getTile(x, y, LAYER.FG);
            if (tMid === B.TORCH_PLACED || tFg === B.TORCH_PLACED) {
                const fx = x * TILE_SIZE + TILE_SIZE / 2;
                const fy = y * TILE_SIZE + 10;
                const flicker = 0.92 + 0.08 * Math.sin(Date.now() / 100 + x * 0.5 + y * 0.3);
                radialLight(lc, fx, fy, 130 * flicker, 0.95);
            } else if (tMid === B.GLOWSTONE || tFg === B.GLOWSTONE) {
                radialLight(lc, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 250, 1.0);
            } else if (tMid === B.FURNACE) {
                // печка тоже слегка светится, если активна
                const key = `${x},${y}`;
                if (world.furnaces && world.furnaces[key] && world.furnaces[key].fuelTime > 0) {
                    radialLight(lc, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE * 0.7, 90, 0.7);
                }
            } else if (tMid === B.DIAMOND_ORE) {
                // алмазы слегка фосфоресцируют в темноте
                radialLight(lc, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 45, 0.35);
            } else if (tMid === B.GOLD_ORE) {
                radialLight(lc, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 35, 0.25);
            } else if (isLava(tMid)) {
                // V7: лава даёт заметный тёплый свет с мерцанием
                const tL = Date.now() / 300;
                const flickL = 0.85 + 0.15 * Math.sin(tL + x * 0.4 + y * 0.2);
                radialLight(lc, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 110 * flickL, 0.85);
            } else if (tMid === B.MAGMA_BLOCK || tFg === B.MAGMA_BLOCK) {
                // Магма-блок мягко тлеет — слабее чем глоустоун, но ярче чем руда.
                const tM = Date.now() / 500;
                const flickM = 0.85 + 0.15 * Math.sin(tM + x * 0.5 + y * 0.3);
                radialLight(lc, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 70 * flickM, 0.6);
            }
        }
    }

    lc.restore();
    lc.globalCompositeOperation = 'source-over';

    // Теперь отрисовываем готовую лайтмапу поверх основного канваса
    // HOTFIX: лайтмап-канвас имеет размер logicalW × logicalH (в ZOOM раз меньше реального
    // canvas). Раньше drawImage рисовал его 1:1, и в результате он покрывал только
    // верхнюю-левую 1/ZOOM часть экрана + выглядел странно в пещерах. Теперь растягиваем
    // на полный canvas.width × canvas.height.
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0); // сбрасываем масштаб камеры для отрисовки overlay
    c.drawImage(lCvs, 0, 0, canvas.width, canvas.height);
    c.restore();
}

function radialLight(c, cx, cy, radius, intensity) {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(255,255,255,${intensity})`);
    g.addColorStop(0.5, `rgba(255,255,255,${intensity * 0.4})`);
    g.addColorStop(1, `rgba(255,255,255,0)`);
    c.fillStyle = g;
    c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

// Vignette поверх всего (в экранных координатах, не под ZOOM)
function drawVignette(c, w, h) {
    if (!ENABLE_VIGNETTE) return;
    // Делаем эффект более сильным и заметным
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
}

// Ambient VFX для факелов (редкие искры/огонёк)
function spawnTorchFlamesInView(sx, ex, sy, ey) {
    for (let y = sy; y <= ey; y++) {
        for (let x = sx; x <= ex; x++) {
            if (world.getTile(x, y) === B.TORCH_PLACED) {
                // лимит, чтобы не взорвать partscount
                if (game.particles.length < 250) {
                    VFX.torchFlame(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + 6);
                }
            }
        }
    }
}
function spawnFurnaceSmokeInView(sx, ex, sy, ey) {
    if (!world.furnaces) return;
    for (let y = sy; y <= ey; y++) {
        for (let x = sx; x <= ex; x++) {
            if (world.getTile(x, y) === B.FURNACE) {
                const key = `${x},${y}`;
                const f = world.furnaces[key];
                if (f && f.fuelTime > 0 && game.particles.length < 250) {
                    VFX.furnaceSmoke(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE);
                }
            }
        }
    }
}

function drawBreakOverlay(c, x, y, stage) {
    if (stage <= 0) return;
    c.save();
    
    // In Minecraft, the cracks are mostly black with some transparency
    c.globalAlpha = 0.4 + (stage / 10) * 0.4;
    c.fillStyle = '#000';
    
    // Fixed seed so the crack pattern is identical every frame and grows consistently
    let seed = 892341;
    const rnd = () => {
        seed = (seed * 1664525 + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
    };
    
    // We want cracks to start from edges and center and spread
    const maxBranches = 18;
    
    for (let i = 0; i < maxBranches; i++) {
        // Start points: mostly near center, some from edges
        let cx = 16 + (rnd() - 0.5) * 20;
        let cy = 16 + (rnd() - 0.5) * 20;
        
        let angle = rnd() * Math.PI * 2;
        let maxLength = 8 + Math.floor(rnd() * 16); // 8 to 23 steps
        
        let startStage = i * 0.45; // Branches start appearing progressively
        
        for (let j = 0; j < maxLength; j++) {
            angle += (rnd() - 0.5) * 1.5;
            cx += Math.cos(angle) * 1.8; // step size
            cy += Math.sin(angle) * 1.8;
            
            let isThick = rnd() < 0.3;
            
            let segmentRequiredStage = startStage + (j / maxLength) * (10 - startStage);
            
            if (stage >= segmentRequiredStage) {
                let px = Math.max(0, Math.min(30, cx));
                let py = Math.max(0, Math.min(30, cy));
                let px2 = Math.floor(px / 2) * 2;
                let py2 = Math.floor(py / 2) * 2;
                
                c.fillRect(x + px2, y + py2, 2, 2);
                if (isThick) {
                    if (px2 < 30) c.fillRect(x + px2 + 2, y + py2, 2, 2);
                    if (py2 < 30) c.fillRect(x + px2, y + py2 + 2, 2, 2);
                    if (px2 < 30 && py2 < 30 && rnd() < 0.5) c.fillRect(x + px2 + 2, y + py2 + 2, 2, 2);
                }
            }
        }
    }
    
    // Add border dust for very broken blocks
    if (stage >= 8) {
        c.globalAlpha = 0.3;
        c.fillRect(x, y, TILE_SIZE, 2);
        c.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
        c.fillRect(x, y, 2, TILE_SIZE);
        c.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE);
    }
    
    c.restore();
}

function drawCreeper(c, p, dir) {
    const now = Date.now();
    const walking = Math.abs(p.vx) > 0.1;
    const breathe = walking ? 0 : Math.sin(now / 800) * 1;
    const step = walking ? Math.sin(now / 150) : 0;
    const hurt = p.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);

    // Текущая экипировка (только у настоящего player; fakeP в превью не имеет .armor).
    const armor = (p && p.armor) ? p.armor : null;
    const headArmor  = armor && armor.head  ? getArmorPalette(armor.head.id)  : null;
    const chestArmor = armor && armor.chest ? getArmorPalette(armor.chest.id) : null;
    const legsArmor  = armor && armor.legs  ? getArmorPalette(armor.legs.id)  : null;

    c.save();
    c.translate(p.x + 10, p.y + 46); // Pivot at hips (p.y + 46)

    // Тень под ногами
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 12, 12, 3, 0, 0, Math.PI * 2); // Shadow at p.y + 58
    c.fill();

    const bodyCol = hurtFlash ? '#ff4444' : '#0f9d58';
    const bodyDark = hurtFlash ? '#d32f2f' : '#0b8043';
    const bodyLight = hurtFlash ? '#ff7777' : '#2ebb73';

    // Ноги
    const legRot1 = step * 0.5;
    const legRot2 = -step * 0.5;

    const drawLeg = (rot, dark) => {
        c.save();
        c.rotate(rot);
        c.fillStyle = dark ? bodyDark : bodyCol;
        c.fillRect(-4, 0, 8, 12); // Legs from hips to shadow (12px)
        // Оверлей ботинок: сапог обхватывает голень
        if (legsArmor && !hurtFlash) {
            const pal = legsArmor;
            // Голенище — верхняя половина
            c.fillStyle = pal.base;
            c.fillRect(-5, 2, 10, 8);
            c.fillStyle = pal.light;
            c.fillRect(-5, 2, 10, 2);          // верхний кант
            c.fillRect(-5, 4, 2, 6);           // левый блик
            c.fillStyle = pal.dark;
            c.fillRect(3, 4, 2, 6);            // правая тень
            // Подошва
            c.fillStyle = pal.edge;
            c.fillRect(-6, 10, 12, 2);
            c.fillStyle = pal.vdark || 'rgba(0,0,0,0.5)';
            c.fillRect(-5, 9, 10, 1);          // Тень над подошвой
        }
        c.restore();
    };

    // Задние ноги
    c.save();
    c.translate(dir > 0 ? -6 : 6, 0);
    drawLeg(legRot1, true);
    c.restore();

    // Передние ноги
    c.save();
    c.translate(dir > 0 ? 6 : -6, 0);
    drawLeg(legRot2, false);
    c.restore();

    // Корпус
    c.fillStyle = bodyCol;
    c.fillRect(-10, -22 + breathe, 20, 22);
    c.fillStyle = bodyLight;
    c.fillRect(-10, -22 + breathe, 2, 22);
    c.fillStyle = bodyDark;
    c.fillRect(8, -22 + breathe, 2, 22);

    if (!hurtFlash) {
        c.fillStyle = '#0b6e3a';
        c.fillRect(-7, -18 + breathe, 3, 3);
        c.fillRect(3, -12 + breathe, 3, 3);
        c.fillRect(-3, -6 + breathe, 3, 3);
    }

    // Оверлей нагрудника: укрывает торс целиком + плечи слегка выступают.
    if (chestArmor && !hurtFlash) {
        const pal = chestArmor;
        const yTop = -22 + breathe;
        // Плечи (существенно шире корпуса)
        c.fillStyle = pal.base;
        c.fillRect(-14, yTop, 6, 8);     // левое плечо
        c.fillRect(8, yTop, 6, 8);       // правое плечо
        c.fillStyle = pal.light;
        c.fillRect(-14, yTop, 6, 2);
        c.fillRect(-14, yTop + 2, 2, 6);
        c.fillRect(8, yTop, 6, 2);
        c.fillRect(8, yTop + 2, 2, 6);
        c.fillStyle = pal.dark;
        c.fillRect(-10, yTop + 2, 2, 6);
        c.fillRect(12, yTop + 2, 2, 6);
        c.fillRect(-14, yTop + 8, 6, 2);
        c.fillRect(8, yTop + 8, 6, 2);
        // Корпус нагрудника (облегает тело)
        c.fillStyle = pal.base;
        c.fillRect(-10, yTop + 2, 20, 18);
        // Блик / тень
        c.fillStyle = pal.light;
        c.fillRect(-10, yTop + 2, 20, 2);
        c.fillRect(-10, yTop + 4, 2, 16);
        c.fillStyle = pal.dark;
        c.fillRect(8, yTop + 4, 2, 16);
        c.fillRect(-10, yTop + 18, 20, 2);
        // Воротник-вырез у шеи
        c.fillStyle = 'rgba(0,0,0,0.45)';
        c.fillRect(-4, yTop + 2, 8, 4);
        c.fillRect(-2, yTop + 6, 4, 2);
        // Центральная рельефная полоса
        c.fillStyle = pal.dark;
        c.fillRect(-2, yTop + 8, 4, 12);
        c.fillStyle = pal.light;
        c.fillRect(-1, yTop + 8, 2, 12);
        // Детали/заклёпки
        c.fillStyle = pal.edge;
        c.fillRect(-8, yTop + 5, 2, 2); c.fillRect(6, yTop + 5, 2, 2);
        c.fillRect(-8, yTop + 15, 2, 2); c.fillRect(6, yTop + 15, 2, 2);
    }

    // Голова
    c.translate(0, -22 + breathe);
    c.fillStyle = bodyCol;
    c.fillRect(-12, -24, 24, 24);
    if (!hurtFlash) {
        c.fillStyle = '#0b8043';
        c.fillRect(-12, -24, 24, 2);
        c.fillStyle = '#1cb872';
        c.fillRect(-11, -23, 2, 2);
        c.fillRect(8, -21, 2, 2);
        c.fillStyle = '#0b6e3a';
        c.fillRect(-7, -4, 3, 2);
        c.fillRect(4, -2, 3, 2);
    }

    // Лицо
    c.fillStyle = '#000';
    const fx = -12, fy = -24;
    const xEye1 = dir === 1 ? 14 : 6;
    const xEye2 = dir === 1 ? 6 : 14;
    c.fillRect(fx + xEye1, fy + 6, 4, 4);
    c.fillRect(fx + xEye2, fy + 6, 4, 4);
    c.fillRect(fx + 10, fy + 12, 4, 6);
    c.fillRect(fx + 6, fy + 16, 4, 4);
    c.fillRect(fx + 14, fy + 16, 4, 4);

    // Оверлей шлема — обхватывает голову, оставляя лицевой проём.
    if (headArmor && !hurtFlash) {
        const pal = headArmor;
        // Купол шлема (классический открытый вид)
        c.fillStyle = pal.base;
        c.fillRect(-13, -25, 26, 7);     // верх
        c.fillRect(-13, -18, 3, 12);     // левая щёчная пластина
        c.fillRect(10, -18, 3, 12);      // правая щёчная пластина
        c.fillRect(-2, -18, 4, 2);       // переносица (между глаз)

        // Блики
        c.fillStyle = pal.light;
        c.fillRect(-13, -25, 26, 2);     // макушка
        c.fillRect(-13, -23, 2, 17);     // левый край
        c.fillRect(-2, -18, 4, 1);       // блик на переносице

        // Тени
        c.fillStyle = pal.dark;
        c.fillRect(11, -25, 2, 19);      // правый край
        c.fillRect(-13, -8, 3, 2);       // низ левой щеки
        c.fillRect(10, -8, 3, 2);        // низ правой щеки

        // Обводка для контраста
        c.fillStyle = pal.edge;
        c.fillRect(-14, -26, 28, 1);     // самый верх
        c.fillRect(-14, -25, 1, 20);     // крайний левый
        c.fillRect(13, -25, 1, 20);      // крайний правый
        c.fillRect(-13, -6, 3, 1);       // левая щека низ
        c.fillRect(10, -6, 3, 1);        // правая щека низ
        c.fillRect(-10, -18, 8, 1);      // внутренний горизонтальный край (левый)
        c.fillRect(2, -18, 8, 1);        // внутренний горизонтальный край (правый)
        c.fillRect(-10, -17, 1, 11);     // внутренний левый вертикальный
        c.fillRect(9, -17, 1, 11);       // внутренний правый вертикальный
    }

    if (p.burnTimer && p.burnTimer > 0) {
        const flick = (Math.sin(now / 60) + 1) / 2;
        c.fillStyle = "rgba(255, " + (120 + (flick * 60) | 0) + ", 20, " + (0.35 + flick * 0.25) + ")";
        c.fillRect(-13, -26, 26, 26);
    }

    if (p.inWater) {
        c.fillStyle = 'rgba(66, 165, 245, 0.25)';
        c.fillRect(-13, -26, 26, 62);
    }

    c.restore();
}

function drawZombie(c, e) {
    const now = Date.now();
    const walking = Math.abs(e.vx) > 0.05;
    const step = walking ? Math.sin(now / 150 + e.x * 0.01) : 0;
    const breathe = walking ? 0 : Math.sin(now / 800 + e.x * 0.01) * 0.8;
    const hurt = e.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);

    c.save();
    c.translate(e.x + 12, e.y + 36);

    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 22, 13, 3, 0, 0, Math.PI * 2);
    c.fill();

    const skinCol = hurtFlash ? '#ff6666' : '#799c65';
    const skinDark = hurtFlash ? '#cc4444' : '#5d7a4d';
    const shirtCol = hurtFlash ? '#ff6666' : '#5c9b9b';
    const shirtDark = hurtFlash ? '#cc4444' : '#3e7272';
    const pantCol = hurtFlash ? '#ff6666' : '#3d4d7a';
    const pantDark = hurtFlash ? '#cc4444' : '#2a3654';

    const legRot = step * 0.6;
    const drawLeg = (rot, dark) => {
        c.save();
        c.rotate(rot);
        c.fillStyle = dark ? pantDark : pantCol;
        c.fillRect(-4, 0, 8, 20);
        c.restore();
    };
    
    c.save(); c.translate(e.dir > 0 ? -3 : 3, breathe); drawLeg(-legRot, true); c.restore();
    c.save(); c.translate(e.dir > 0 ? 3 : -3, breathe); drawLeg(legRot, false); c.restore();

    const armRot = -step * 0.6;
    const baseArmRot = e.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    const drawArm = (rot, dark) => {
        c.save();
        c.translate(0, -20);
        c.rotate(baseArmRot + rot * e.dir);
        c.fillStyle = dark ? shirtDark : shirtCol;
        c.fillRect(-4, -4, 8, 14);
        c.fillStyle = dark ? skinDark : skinCol;
        c.fillRect(-4, 10, 8, 10);
        c.restore();
    };

    c.save(); c.translate(0, breathe); drawArm(-armRot, true); c.restore();

    c.save();
    c.translate(0, breathe);
    c.fillStyle = shirtCol;
    c.fillRect(-8, -22, 16, 22);
    c.fillStyle = shirtDark;
    c.fillRect(-8, -22, 16, 2);
    c.fillRect(-1, -22, 2, 22);
    c.fillRect(-6, -3, 2, 3);
    c.fillRect(2, -6, 3, 2);
    c.restore();

    c.save();
    c.translate(0, -22 + breathe);
    c.fillStyle = skinCol;
    c.fillRect(-10, -20, 20, 20); // Сделали голову 20x20
    c.fillStyle = skinDark;
    c.fillRect(-10, -20, 20, 2);
    
    // Лицо как в Minecraft
    const fx = e.dir > 0 ? 2 : -2;
    
    // Глаза
    c.fillStyle = '#111';
    c.fillRect(fx + 2, -12, 4, 4);
    c.fillRect(fx - 6, -12, 4, 4);
    
    // Нос
    c.fillStyle = skinDark;
    c.fillRect(fx - 2, -8, 4, 3);
    
    c.restore();

    c.save(); c.translate(0, breathe); drawArm(armRot, false); c.restore();
    c.restore();
}

function drawSpider(c, e) {
    const now = Date.now();
    const hurt = e.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);
    const walking = Math.abs(e.vx) > 0.05;

    c.save();
    c.translate(e.x + 15, e.y + 14);

    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(0, 6, 14, 3, 0, 0, Math.PI * 2);
    c.fill();

    const legWave1 = walking ? Math.sin(now / 80) * 0.4 : 0;
    const legWave2 = walking ? Math.sin(now / 80 + Math.PI) * 0.4 : 0;
    
    c.strokeStyle = hurtFlash ? '#ff6666' : '#1a1f24';
    c.lineWidth = 3;
    c.lineJoin = 'round';
    
    const drawSpiderLeg = (dx, dy, rot) => {
        c.save();
        c.translate(dx, dy);
        c.rotate(rot);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(8, -8);
        c.lineTo(16, 8);
        c.stroke();
        c.restore();
    };

    // Задние лапы (темные)
    c.strokeStyle = hurtFlash ? '#cc4444' : '#0d1215';
    for (let i = 0; i < 4; i++) {
        const xOff = (i - 1.5) * 4;
        const wave = (i % 2 === 0) ? legWave1 : legWave2;
        const baseRot = (i - 1.5) * 0.2 + wave;
        c.save(); c.scale(-1, 1); drawSpiderLeg(-xOff, -4, baseRot); c.restore();
    }
    
    // Передние лапы (светлые)
    c.strokeStyle = hurtFlash ? '#ff6666' : '#1a1f24';
    for (let i = 0; i < 4; i++) {
        const xOff = (i - 1.5) * 4;
        const wave = (i % 2 === 0) ? legWave2 : legWave1;
        const baseRot = (i - 1.5) * 0.2 - wave;
        drawSpiderLeg(xOff, -4, baseRot);
    }

    // Тело
    c.fillStyle = hurtFlash ? '#ff6666' : '#263238';
    c.fillRect(-13, -12, 20, 14);
    c.fillStyle = hurtFlash ? '#cc4444' : '#37474f';
    c.fillRect(-13, -12, 20, 3);
    c.fillStyle = '#0d1215';
    c.fillRect(-13, -1, 20, 3);
    
    c.fillStyle = '#4a5a63';
    c.fillRect(-10, -9, 2, 2);
    c.fillRect(-1, -9, 2, 2);
    c.fillRect(-6, -6, 4, 2);

    // Голова
    const hDir = e.dir > 0 ? 1 : -1;
    c.save();
    c.translate(11 * hDir, -6);
    
    c.fillStyle = hurtFlash ? '#ff6666' : '#1a2327';
    c.fillRect(-6, -6, 12, 10);
    c.fillStyle = '#0d1215';
    c.fillRect(-6, 2, 12, 2);

    // Клыки
    c.fillStyle = '#eceff1';
    c.fillRect(hDir > 0 ? 2 : -3, 2, 1, 4);
    c.fillRect(hDir > 0 ? -1 : -6, 2, 1, 4);

    // Глаза
    const pulse = 0.7 + 0.3 * Math.sin(now / 150);
    c.shadowColor = '#ff0000';
    c.shadowBlur = 6;
    c.fillStyle = "rgba(255," + Math.round(30 * pulse) + "," + Math.round(30 * pulse) + ",1)";
    if (hDir > 0) {
        c.fillRect(-1, -4, 2, 2);
        c.fillRect(-5, -4, 2, 2);
        c.fillRect(0, -1, 1, 1);
        c.fillRect(-4, -1, 1, 1);
    } else {
        c.fillRect(-1, -4, 2, 2);
        c.fillRect(3, -4, 2, 2);
        c.fillRect(-1, -1, 1, 1);
        c.fillRect(3, -1, 1, 1);
    }
    c.shadowBlur = 0;
    c.restore();

    c.restore();
}

// V16: Skeleton mob — white-bones humanoid that draws a bow.
function drawSkeleton(c, e) {
    const now = Date.now();
    const walking = Math.abs(e.vx) > 0.05;
    const step = walking ? Math.sin(now / 150 + e.x * 0.01) : 0;
    const breathe = walking ? 0 : Math.sin(now / 800 + e.x * 0.01) * 0.8;
    const hurt = e.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);

    c.save();
    c.translate(e.x + 12, e.y + 36);

    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 22, 13, 3, 0, 0, Math.PI * 2);
    c.fill();

    const boneCol = hurtFlash ? '#ff6666' : '#e6e6e6';
    const boneDark = hurtFlash ? '#cc4444' : '#b0b0b0';

    // Legs
    const legRot = step * 0.6;
    const drawLeg = (rot, dark) => {
        c.save();
        c.rotate(rot);
        c.fillStyle = dark ? boneDark : boneCol;
        c.fillRect(-3, 0, 6, 20);
        c.fillStyle = '#888';
        c.fillRect(-3, 0, 6, 1);
        c.restore();
    };
    c.save(); c.translate(e.dir > 0 ? -3 : 3, breathe); drawLeg(-legRot, true); c.restore();
    c.save(); c.translate(e.dir > 0 ? 3 : -3, breathe); drawLeg(legRot, false); c.restore();

    // Torso — ribcage stripes
    c.save();
    c.translate(0, breathe);
    c.fillStyle = boneCol;
    c.fillRect(-7, -22, 14, 22);
    c.fillStyle = boneDark;
    // ribs
    c.fillRect(-7, -20, 14, 1);
    c.fillRect(-7, -16, 14, 1);
    c.fillRect(-7, -12, 14, 1);
    c.fillRect(-7, -8, 14, 1);
    // spine
    c.fillRect(-1, -22, 2, 22);
    c.restore();

    // Bow drawn in front when skeleton is aiming/drawing
    const isDrawing = e.bowState === 'drawing';
    const drawPct = Math.min(1, (e.bowDraw || 0) / 50);
    const dir = e.dir > 0 ? 1 : -1;

    // Front arm holds the bow
    c.save();
    c.translate(0, -20 + breathe);
    if (isDrawing) {
        // Arm holds bow extended
        c.fillStyle = boneCol;
        c.fillRect(dir > 0 ? 4 : -10, 0, 6, 12);
        // Bow
        c.save();
        c.translate(dir > 0 ? 14 : -14, 6);
        c.strokeStyle = '#6d4c41';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(0, 0, 9, -Math.PI / 2 + 0.15, Math.PI / 2 - 0.15, dir < 0);
        c.stroke();
        // Bowstring (pulled back when drawing)
        c.strokeStyle = '#fafafa';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, -8);
        c.lineTo(-dir * (3 + drawPct * 5), 0);
        c.lineTo(0, 8);
        c.stroke();
        // Arrow nocked
        c.fillStyle = '#bdbdbd';
        c.fillRect(-dir * (3 + drawPct * 5), -1, dir * 10, 2);
        c.fillStyle = '#5d4037';
        c.fillRect(-dir * (3 + drawPct * 5) - dir * 4, -1, dir * 4, 2);
        c.restore();
    } else {
        // Arms hang
        const armRot = -step * 0.6;
        const baseArmRot = e.aggro ? (e.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
        c.save();
        c.rotate(baseArmRot - armRot * dir);
        c.fillStyle = boneCol;
        c.fillRect(-3, -3, 6, 18);
        c.fillStyle = boneDark;
        c.fillRect(-3, -3, 6, 1);
        c.restore();
    }
    c.restore();

    // Back arm
    c.save();
    c.translate(0, -20 + breathe);
    const armRot2 = step * 0.6;
    const baseArmRot2 = e.aggro ? (e.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
    c.rotate(baseArmRot2 - armRot2 * dir);
    c.fillStyle = boneDark;
    c.fillRect(-3, -3, 6, 18);
    c.restore();

    // Skull
    c.save();
    c.translate(0, -22 + breathe);
    c.fillStyle = boneCol;
    c.fillRect(-8, -16, 16, 16);
    c.fillStyle = boneDark;
    c.fillRect(-8, -16, 16, 2);
    // Eye sockets
    c.fillStyle = '#111';
    const fx = e.dir > 0 ? 2 : -2;
    c.fillRect(fx + 1, -10, 3, 3);
    c.fillRect(fx - 5, -10, 3, 3);
    // Nose hole
    c.fillStyle = '#666';
    c.fillRect(fx - 1, -6, 2, 2);
    // Mouth (teeth)
    c.fillStyle = '#999';
    c.fillRect(fx - 4, -3, 8, 2);
    c.fillStyle = boneCol;
    c.fillRect(fx - 2, -3, 1, 2);
    c.fillRect(fx, -3, 1, 2);
    c.fillRect(fx + 2, -3, 1, 2);
    c.restore();

    c.restore();
}

// V16: Enderman — tall slender black creature with glowing purple eyes.
function drawEnderman(c, e) {
    const now = Date.now();
    const walking = Math.abs(e.vx) > 0.05;
    const step = walking ? Math.sin(now / 200 + e.x * 0.01) : 0;
    const breathe = walking ? 0 : Math.sin(now / 800 + e.x * 0.01) * 0.5;
    const hurt = e.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);

    c.save();
    c.translate(e.x + e.w / 2, e.y + e.h - 8);

    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 6, 14, 3, 0, 0, Math.PI * 2);
    c.fill();

    const bodyCol = hurtFlash ? '#cc4444' : '#0a0a12';
    const bodyDark = hurtFlash ? '#992222' : '#000000';

    // Long thin legs
    const legRot = step * 0.4;
    const drawELeg = (rot, dark) => {
        c.save();
        c.rotate(rot);
        c.fillStyle = dark ? bodyDark : bodyCol;
        c.fillRect(-2, 0, 4, 34);
        c.restore();
    };
    c.save(); c.translate(-4, -30 + breathe); drawELeg(-legRot, true); c.restore();
    c.save(); c.translate(4, -30 + breathe); drawELeg(legRot, false); c.restore();

    // Torso (slim, taller)
    c.save();
    c.translate(0, breathe);
    c.fillStyle = bodyCol;
    c.fillRect(-6, -38, 12, 8);   // hips
    c.fillRect(-7, -68, 14, 30);  // chest
    c.fillStyle = bodyDark;
    c.fillRect(-7, -68, 14, 2);
    c.restore();

    // Arms — long
    const armRot = -step * 0.4;
    const baseArmRot = 0; // Calm walk, no spreading arms
    const drawEArm = (rot, dark) => {
        c.save();
        c.translate(0, -64 + breathe);
        c.rotate(baseArmRot + rot * e.dir);
        c.fillStyle = dark ? bodyDark : bodyCol;
        c.fillRect(-2, -2, 4, 40);
        c.restore();
    };
    drawEArm(armRot, true);
    drawEArm(-armRot, false);

    // Head — wider
    c.save();
    c.translate(0, -68 + breathe);
    c.fillStyle = bodyCol;
    c.fillRect(-10, -16, 20, 16);
    c.fillStyle = bodyDark;
    c.fillRect(-10, -16, 20, 2);

    // Glowing magenta eyes (extra glow when aggro)
    const aggro = e.aggro;
    const fx = e.dir > 0 ? 1 : -1;
    
    // Base layer with neon glow
    c.shadowColor = aggro ? '#ff40ff' : '#e040fb';
    c.shadowBlur = aggro ? 16 : 8;
    c.fillStyle = '#7b1fa2';
    c.fillRect(-9 + fx, -9, 6, 3);
    c.fillRect(3 + fx, -9, 6, 3);
    c.shadowBlur = 0;

    // Inner bright strip
    c.fillStyle = '#ea80fc';
    c.fillRect(-8 + fx, -8, 4, 1);
    c.fillRect(4 + fx, -8, 4, 1);

    // Brightest core
    c.fillStyle = aggro ? '#ffffff' : '#f3e5f5';
    c.fillRect(-7 + fx, -8, 2, 1);
    c.fillRect(5 + fx, -8, 2, 1);

    // Open mouth when aggro
    if (aggro) {
        c.fillStyle = '#000';
        c.fillRect(-4 + fx, -4, 8, 3);
    }
    c.restore();

    c.restore();
}

// V16: Draw a flying arrow (small slim shape that rotates to its velocity).
function drawArrow(c, a) {
    c.save();
    c.translate(a.x, a.y);
    c.rotate(a.angle);
    // Shaft
    c.fillStyle = '#8d6e63';
    c.fillRect(-8, -1, 16, 2);
    c.fillStyle = '#5d4037';
    c.fillRect(-8, 0, 16, 1);
    // Tip
    c.fillStyle = '#cfd8dc';
    c.beginPath();
    c.moveTo(10, 0);
    c.lineTo(6, -3);
    c.lineTo(6, 3);
    c.closePath();
    c.fill();
    // Fletching
    c.fillStyle = '#fafafa';
    c.fillRect(-8, -3, 3, 2);
    c.fillRect(-8, 1, 3, 2);
    c.restore();
}

// V16: Draw an ender pearl with glowing trail.
function drawEnderPearl(c, p) {
    c.save();
    c.translate(p.x + 4, p.y + 4);
    // Outer glow
    c.shadowColor = '#9c27b0';
    c.shadowBlur = 12;
    c.fillStyle = '#ce93d8';
    c.beginPath();
    c.arc(0, 0, 5, 0, Math.PI * 2);
    c.fill();
    // Highlight
    c.shadowBlur = 0;
    c.fillStyle = '#f3e5f5';
    c.fillRect(-3, -3, 2, 2);
    // Dark dots
    c.fillStyle = '#4a148c';
    c.fillRect(1, -1, 1, 1);
    c.fillRect(-2, 1, 1, 1);
    c.restore();
}

// V16: Player overlay while drawing the bow — shows charge bar.
function drawBowOverlay(c, p) {
    const t = Math.min(60, p.bowDrawTime);
    const pct = t / 60;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(p.x - 4, p.y - 10, 28, 4);
    c.fillStyle = pct >= 1 ? '#ffeb3b' : (pct > 0.5 ? '#ffa726' : '#bdbdbd');
    c.fillRect(p.x - 3, p.y - 9, 26 * pct, 2);
    c.restore();
}

// Beta 1.0: Zombie Pigman — chunky humanoid with pink-grey rotting skin.
function drawPigman(c, e) {
    const now = Date.now();
    const walking = Math.abs(e.vx) > 0.05;
    const step = walking ? Math.sin(now / 150 + e.x * 0.01) : 0;
    const breathe = walking ? 0 : Math.sin(now / 800 + e.x * 0.01) * 0.6;
    c.save();
    c.translate(e.x + 12, e.y + 36);

    // Shadow.
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 22, 13, 3, 0, 0, Math.PI * 2);
    c.fill();

    const skin = e.aggro ? '#e57373' : '#d8a299';      // pinker when calm
    const skinDark = e.aggro ? '#c62828' : '#a67368';
    const pants = '#5d4037';
    const pantsDark = '#3e2723';

    // Legs.
    const legRot = step * 0.5;
    const drawLeg = (rot, dark) => {
        c.save(); c.rotate(rot);
        c.fillStyle = dark ? pantsDark : pants;
        c.fillRect(-4, 0, 8, 20);
        c.restore();
    };
    c.save(); c.translate(e.dir > 0 ? -3 : 3, breathe); drawLeg(-legRot, true); c.restore();
    c.save(); c.translate(e.dir > 0 ? 3 : -3, breathe); drawLeg(legRot, false); c.restore();

    // Torso.
    c.save(); c.translate(0, breathe);
    c.fillStyle = skin;
    c.fillRect(-8, -22, 16, 22);
    c.fillStyle = skinDark;
    c.fillRect(-8, -22, 16, 2);
    c.fillRect(-8, -3, 16, 3);
    // Open belly (rot).
    c.fillStyle = '#5a2020';
    c.fillRect(-3, -12, 6, 6);
    c.restore();

    // Arms (held forward when aggro).
    const armForward = e.aggro ? 0.9 : 0.1;
    c.save(); c.translate(0, -16 + breathe);
    c.rotate(e.dir > 0 ? armForward : -armForward);
    c.fillStyle = skin;
    c.fillRect(e.dir > 0 ? 0 : -12, 0, 12, 6);
    c.fillStyle = skinDark;
    c.fillRect(e.dir > 0 ? 0 : -12, 0, 12, 1);
    // Gold sword in the forward hand — blade points away from the body.
    // Drawn after the arm rotation so it follows the swing.
    const swordDir = e.dir > 0 ? 1 : -1;
    const bladeX = e.dir > 0 ? 12 : -22;
    // Hilt (gold).
    c.fillStyle = '#ffd54f';
    c.fillRect(bladeX + (swordDir > 0 ? -2 : 8), 1, 4, 4);
    // Crossguard (darker gold).
    c.fillStyle = '#bf8f00';
    c.fillRect(bladeX + (swordDir > 0 ? 1 : 5), 0, 2, 6);
    // Blade (long, light gold).
    c.fillStyle = '#ffe082';
    c.fillRect(bladeX + (swordDir > 0 ? 3 : -7), 1, 10, 4);
    // Blade highlight.
    c.fillStyle = '#fff8c4';
    c.fillRect(bladeX + (swordDir > 0 ? 3 : -7), 1, 10, 1);
    c.restore();

    // Head (pig snout).
    c.save(); c.translate(0, -22 + breathe);
    c.fillStyle = skin;
    c.fillRect(-10, -20, 20, 20);
    c.fillStyle = skinDark;
    c.fillRect(-10, -20, 20, 2);
    // Snout.
    c.fillStyle = '#bd848e';
    c.fillRect(e.dir > 0 ? 3 : -11, -8, 8, 5);
    c.fillStyle = '#7a4d4d';
    c.fillRect(e.dir > 0 ? 4 : -10, -7, 2, 2);
    c.fillRect(e.dir > 0 ? 8 : -6, -7, 2, 2);
    // Eyes — red when aggro, dark when neutral.
    c.fillStyle = e.aggro ? '#ff1744' : '#1a1a1a';
    c.fillRect(-7, -13, 4, 4);
    c.fillRect(3, -13, 4, 4);
    // Tusks (small white bumps).
    c.fillStyle = '#fafafa';
    c.fillRect(e.dir > 0 ? 3 : -5, -4, 2, 2);
    c.fillRect(e.dir > 0 ? 7 : -9, -4, 2, 2);
    c.restore();

    // HP bar when hurt or aggro'd.
    if (e.hp < e.maxHp || e.aggro) {
        const pct = Math.max(0, e.hp / e.maxHp);
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(-12, -46, 24, 4);
        c.fillStyle = '#c62828';
        c.fillRect(-11, -45, 22 * pct, 2);
    }
    c.restore();
}

// Beta 1.0: Ghast — a large floating white squid-like creature with red eyes.
function drawGhast(c, e) {
    const now = Date.now();
    const bob = Math.sin(now / 300 + e.x * 0.01) * 2;
    c.save();
    c.translate(e.x, e.y + bob);

    // Body — 8-sided rounded blob.
    c.fillStyle = '#fafafa';
    c.fillRect(8, 0, 48, 48);
    c.fillRect(0, 8, 64, 32);
    c.fillStyle = '#ececec';
    c.fillRect(4, 12, 8, 24);
    c.fillRect(52, 12, 8, 24);
    c.fillStyle = '#d4d4d4';
    c.fillRect(8, 38, 48, 4);
    // Eyes — usually closed; open red when about to fire.
    const charging = e.fireCooldown < 30;
    if (charging) {
        c.fillStyle = '#ff1744';
        c.fillRect(16, 16, 10, 8);
        c.fillRect(38, 16, 10, 8);
        c.fillStyle = '#fff';
        c.fillRect(18, 18, 3, 3);
        c.fillRect(40, 18, 3, 3);
    } else {
        c.fillStyle = '#444';
        c.fillRect(16, 20, 10, 3);
        c.fillRect(38, 20, 10, 3);
    }
    // Mouth.
    c.fillStyle = '#222';
    c.fillRect(24, 28, 16, 4);
    // Dangling tentacles.
    c.fillStyle = '#e0e0e0';
    for (let i = 0; i < 6; i++) {
        const tx = 6 + i * 9;
        const tl = 14 + Math.sin(now / 200 + i) * 4;
        c.fillRect(tx, 48, 5, tl);
    }
    // Red glow when charging.
    if (charging) {
        c.fillStyle = 'rgba(255, 50, 50, 0.15)';
        c.fillRect(-8, -8, 80, 80);
    }
    c.restore();
}

// Beta 1.0: Ghast fireball — small fiery sphere with crackling trail.
function drawFireball(c, f) {
    const now = Date.now();
    c.save();
    c.translate(f.x, f.y);
    // Outer flame.
    c.fillStyle = '#ff5722';
    c.fillRect(0, 0, f.w, f.h);
    // Bright core.
    c.fillStyle = '#ffeb3b';
    c.fillRect(3, 3, f.w - 6, f.h - 6);
    c.fillStyle = '#fff';
    c.fillRect(5, 5, 2, 2);
    // Pulse halo.
    const pulse = (now % 200) / 200;
    c.fillStyle = `rgba(255, 100, 0, ${0.3 - pulse * 0.2})`;
    c.fillRect(-2, -2, f.w + 4, f.h + 4);
    c.restore();
}

function drawPassive(c, e) {
    const now = Date.now();
    let hurt = e.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);
    let walking = Math.abs(e.vx) > 0.1;
    const step = walking ? Math.sin(now / 150) : 0;
    const breathe = walking ? 0 : Math.sin(now / 700 + e.x * 0.01);

    c.save();
    c.translate(e.x + e.w / 2, e.y + e.h / 2);

    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, e.h / 2, e.w * 0.5, 2.5, 0, 0, Math.PI * 2);
    c.fill();

    const legRot = step * 0.6;
    
    const drawAnimalLeg = (rot, w, h, col, x, y) => {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.fillStyle = col;
        c.fillRect(-w/2, 0, w, h);
        c.restore();
    };

    if (e.mobType === 0) {
        // Pig
        const pigPink = hurtFlash ? '#ff5555' : '#f8bbd9';
        const pigDark = hurtFlash ? '#cc4444' : '#e8a5c3';
        const pigLight = hurtFlash ? '#ff7777' : '#ffd4e4';
        
        // Ноги
        drawAnimalLeg(-legRot, 6, 8, pigDark, e.dir > 0 ? -6 : 6, 4);
        drawAnimalLeg(legRot, 6, 8, pigDark, e.dir > 0 ? 6 : -6, 4);
        drawAnimalLeg(legRot, 6, 8, pigPink, e.dir > 0 ? -6 : 6, 4);
        drawAnimalLeg(-legRot, 6, 8, pigPink, e.dir > 0 ? 6 : -6, 4);

        // Тело
        c.fillStyle = pigPink;
        c.fillRect(-12, -8 + breathe, 24, 16);
        c.fillStyle = pigDark;
        c.fillRect(-12, 6 + breathe, 24, 2);
        c.fillStyle = pigLight;
        c.fillRect(-12, -8 + breathe, 24, 2);

        // Голова
        c.save();
        c.translate(e.dir > 0 ? 12 : -12, -4 + breathe);
        c.fillStyle = pigPink;
        c.fillRect(-8, -8, 16, 16);
        
        // Пятачок
        c.fillStyle = '#e91e63';
        c.fillRect(e.dir > 0 ? 8 : -12, -2, 4, 6);
        c.fillStyle = '#880e4f';
        c.fillRect(e.dir > 0 ? 9 : -11, 0, 1, 2);
        c.fillRect(e.dir > 0 ? 11 : -9, 0, 1, 2);

        // Глаза
        c.fillStyle = '#000';
        c.fillRect(e.dir > 0 ? 4 : -6, -4, 2, 2);
        c.fillStyle = '#fff';
        c.fillRect(e.dir > 0 ? 4 : -6, -4, 1, 1);
        c.restore();

    } else if (e.mobType === 1) {
        // Cow
        const cowCol = hurtFlash ? '#ff5555' : '#5d4037';
        
        // Ноги
        drawAnimalLeg(-legRot, 6, 10, '#3e2723', e.dir > 0 ? -8 : 8, 6);
        drawAnimalLeg(legRot, 6, 10, '#3e2723', e.dir > 0 ? 8 : -8, 6);
        drawAnimalLeg(legRot, 6, 10, '#4e342e', e.dir > 0 ? -8 : 8, 6);
        drawAnimalLeg(-legRot, 6, 10, '#4e342e', e.dir > 0 ? 8 : -8, 6);

        // Тело
        c.fillStyle = cowCol;
        c.fillRect(-14, -10 + breathe, 28, 18);
        c.fillStyle = '#3e2723';
        c.fillRect(-14, 6 + breathe, 28, 2);
        c.fillStyle = '#6d4c41';
        c.fillRect(-14, -10 + breathe, 28, 2);

        // Пятна
        c.fillStyle = '#fff';
        c.fillRect(-6, -8 + breathe, 8, 8);
        c.fillRect(6, -4 + breathe, 6, 10);
        c.fillStyle = '#e0e0e0';
        c.fillRect(-6, -2 + breathe, 8, 2);

        // Вымя
        c.fillStyle = '#f8bbd9';
        c.fillRect(-4, 8 + breathe, 8, 2);

        // Голова
        c.save();
        c.translate(e.dir > 0 ? 14 : -14, -6 + breathe);
        c.fillStyle = cowCol;
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#3e2723';
        c.fillRect(-8, 6, 16, 2);

        // Рога
        c.fillStyle = '#bcaaa4';
        c.fillRect(e.dir > 0 ? -4 : 2, -12, 2, 4);
        c.fillRect(e.dir > 0 ? 2 : -4, -12, 2, 4);

        // Глаза
        c.fillStyle = '#000';
        c.fillRect(e.dir > 0 ? 4 : -6, -2, 2, 2);
        c.fillStyle = '#fff';
        c.fillRect(e.dir > 0 ? 4 : -6, -2, 1, 1);

        // Морда
        c.fillStyle = '#d7ccc8';
        c.fillRect(e.dir > 0 ? 8 : -14, 2, 6, 6);
        c.fillStyle = '#8d6e63';
        c.fillRect(e.dir > 0 ? 9 : -13, 4, 1, 2);
        c.fillRect(e.dir > 0 ? 11 : -11, 4, 1, 2);
        c.restore();

    } else {
        // Sheep
        const sheepCol = hurtFlash ? '#ff5555' : (e.woolColor || '#fafafa');
        
        // Ноги
        drawAnimalLeg(-legRot, 4, 8, '#4e342e', e.dir > 0 ? -6 : 6, 8);
        drawAnimalLeg(legRot, 4, 8, '#4e342e', e.dir > 0 ? 6 : -6, 8);
        drawAnimalLeg(legRot, 4, 8, '#5d4037', e.dir > 0 ? -6 : 6, 8);
        drawAnimalLeg(-legRot, 4, 8, '#5d4037', e.dir > 0 ? 6 : -6, 8);

        // Тело
        c.fillStyle = sheepCol;
        c.fillRect(-12, -8 + breathe, 24, 18);
        
        c.fillStyle = '#e0e0e0';
        c.fillRect(-10, -6 + breathe, 4, 4);
        c.fillRect(-2, -2 + breathe, 4, 4);
        c.fillRect(6, -4 + breathe, 4, 4);
        c.fillRect(10, 0 + breathe, 4, 4);
        c.fillStyle = '#bdbdbd';
        c.fillRect(-8, 2 + breathe, 2, 2);
        c.fillRect(4, -2 + breathe, 2, 2);
        c.fillStyle = '#ffffff';
        c.fillRect(-12, -8 + breathe, 24, 2);

        // Голова
        c.save();
        c.translate(e.dir > 0 ? 12 : -12, -4 + breathe);
        c.fillStyle = '#8d6e63';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#5d4037';
        c.fillRect(-6, 4, 12, 2);

        // Глаза
        c.fillStyle = '#000';
        c.fillRect(e.dir > 0 ? 2 : -4, -2, 2, 2);
        c.fillStyle = '#fff';
        c.fillRect(e.dir > 0 ? 2 : -4, -2, 1, 1);

        // Уши
        c.fillStyle = '#6d4c41';
        c.fillRect(e.dir > 0 ? -8 : 6, -4, 2, 4);
        c.restore();
    }
    
    c.restore();
}

function getToolColor(id) {
    if ([ITEMS.WOOD_PICK, ITEMS.WOOD_SWORD, ITEMS.WOOD_AXE, ITEMS.WOOD_SHOVEL, ITEMS.WOOD_HOE].includes(id)) return '#8d6e63';
    if ([ITEMS.STONE_PICK, ITEMS.STONE_SWORD, ITEMS.STONE_AXE, ITEMS.STONE_SHOVEL, ITEMS.STONE_HOE].includes(id)) return '#9e9e9e';
    if ([ITEMS.IRON_PICK, ITEMS.IRON_SWORD, ITEMS.IRON_AXE, ITEMS.IRON_SHOVEL, ITEMS.IRON_HOE].includes(id)) return '#cfd8dc';
    if ([ITEMS.GOLD_PICK, ITEMS.GOLD_SWORD, ITEMS.GOLD_AXE, ITEMS.GOLD_SHOVEL, ITEMS.GOLD_HOE].includes(id)) return '#fdd835';
    if ([ITEMS.DIAMOND_PICK, ITEMS.DIAMOND_SWORD, ITEMS.DIAMOND_AXE, ITEMS.DIAMOND_SHOVEL, ITEMS.DIAMOND_HOE].includes(id)) return '#4dd0e1';
    return '#9e9e9e';
}

// Палитра оттенков для каждого материала (используется при рисовании инструментов).
// Возвращает 5 оттенков: edge — самый светлый блик, light — светлая грань,
// base — основа, dark — тень, vdark — глубокая тень.
function getToolPalette(headCol) {
    switch (headCol) {
        case '#8d6e63': // wood
            return { edge: '#bcaaa4', light: '#a1887f', base: '#8d6e63', dark: '#5d4037', vdark: '#3e2723' };
        case '#9e9e9e': // stone
            return { edge: '#eeeeee', light: '#bdbdbd', base: '#9e9e9e', dark: '#616161', vdark: '#424242' };
        case '#cfd8dc': // iron
            return { edge: '#ffffff', light: '#eceff1', base: '#cfd8dc', dark: '#90a4ae', vdark: '#546e7a' };
        case '#fdd835': // gold
            return { edge: '#ffffff', light: '#fff59d', base: '#fdd835', dark: '#f57f17', vdark: '#bf360c' };
        case '#4dd0e1': // diamond
            return { edge: '#ffffff', light: '#b2ebf2', base: '#4dd0e1', dark: '#0097a7', vdark: '#006064' };
        default:
            return { edge: '#ffffff', light: headCol, base: headCol, dark: headCol, vdark: headCol };
    }
}

function drawPixelTool(c, ox, oy, px, handleCol, headCol, type, thickness = 3) {
    const p = Math.max(1, px | 0);
    const X = (n) => (ox + n) * p;
    const Y = (n) => (oy + n) * p;
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(X(x), Y(y), w * p, h * p); };

    c.save();
    c.imageSmoothingEnabled = false;

    // ---- Палитра древесины рукоятей (тёплые тона как у Minecraft-стика)
    const hLight = '#a47148', hBase = '#7c5128', hDark = '#5d3a1a', hVDark = '#3e2510';

    if (type === 'torch') {
        // Палка факела с текстурой древесины
        R(12, 16, 3, 11, hBase);
        R(12, 16, 1, 11, hLight);            // левый блик
        R(14, 16, 1, 11, hDark);             // правая тень
        R(12, 19, 3, 1, hDark);              // волокно
        R(12, 23, 3, 1, hDark);              // волокно
        R(12, 27, 3, 1, hVDark);             // нижний торец
        // Угольное навершие под пламенем
        R(11, 13, 5, 3, '#212121');
        R(11, 13, 5, 1, '#3e2723');
        // Пламя: внешний жёлтый слой, оранжевое ядро, светлый кончик
        R(11, 10, 5, 3, headCol);            // жёлтое
        R(10, 11, 1, 1, headCol);            // язычок слева
        R(16, 11, 1, 1, headCol);            // язычок справа
        R(11, 8, 4, 2, '#ff9800');           // оранжевое ядро
        R(12, 6, 3, 2, '#fff59d');           // светлый кончик
        R(13, 5, 1, 1, '#fffde7');           // самый яркий пик
        // Внутренний блик
        R(12, 9, 1, 2, '#fff59d');
        c.restore();
        return;
    }

    if (type === 'shears') {
        // Два перекрещивающихся стальных лезвия с заклёпкой и деревянными ручками.
        // Левое лезвие
        R(7, 6, 5, 14, '#cfd8dc');
        R(7, 6, 1, 14, '#eceff1');           // блик
        R(11, 6, 1, 14, '#90a4ae');          // тень
        R(7, 6, 5, 1, '#90a4ae');             // верхняя кромка
        R(7, 19, 5, 1, '#546e7a');            // острие тени
        R(7, 6, 1, 1, '#ffffff');             // блик-вершина
        // Правое лезвие
        R(20, 6, 5, 14, '#cfd8dc');
        R(20, 6, 1, 14, '#eceff1');
        R(24, 6, 1, 14, '#90a4ae');
        R(20, 6, 5, 1, '#90a4ae');
        R(20, 19, 5, 1, '#546e7a');
        R(24, 6, 1, 1, '#ffffff');
        // Заклёпка в центре
        R(14, 11, 4, 4, '#37474f');
        R(15, 12, 2, 2, '#90a4ae');
        R(15, 12, 1, 1, '#eceff1');
        // Деревянные ручки снизу
        R(8, 20, 4, 6, hBase);
        R(8, 20, 1, 6, hLight);
        R(11, 20, 1, 6, hDark);
        R(8, 26, 4, 1, hVDark);
        R(20, 20, 4, 6, hBase);
        R(20, 20, 1, 6, hLight);
        R(23, 20, 1, 6, hDark);
        R(20, 26, 4, 1, hVDark);
        c.restore();
        return;
    }

    // Поворачиваем инструменты по диагонали (как иконки Minecraft 16x16)
    c.translate(X(16), Y(16));
    c.rotate(Math.PI / 4);
    c.translate(-X(16), -Y(16));

    // ---- Палитра головы инструмента
    const pal = getToolPalette(headCol);

    // ---- Общая деревянная рукоять (для всех инструментов кроме меча).
    // Меч рисует собственную, более короткую рукоять под крестовиной.
    if (type !== 'sword') {
        R(13, 12, 3, 16, hBase);                 // тело
        R(13, 12, 1, 16, hLight);                // левая грань — блик
        R(15, 12, 1, 16, hDark);                 // правая грань — тень
        // Тёмные узлы и волокна (характерная текстура Minecraft-стика)
        R(13, 15, 3, 1, hDark);
        R(14, 17, 1, 1, hVDark);
        R(13, 19, 3, 1, hDark);
        R(14, 22, 1, 1, hVDark);
        R(13, 24, 3, 1, hDark);
        R(13, 27, 3, 1, hVDark);                 // нижний торец рукояти
    }

    if (type === 'sword') {
        // === МЕЧ === — длинный клинок с долом, крестовина из материала клинка,
        // деревянная рукоять и навершие (pommel).
        // Клинок (5 px шириной)
        R(12, 5, 5, 15, pal.base);               // тело клинка
        R(12, 5, 1, 15, pal.light);              // левая грань — блик
        R(16, 5, 1, 15, pal.vdark);              // правая грань — тень
        R(14, 6, 1, 13, pal.edge);               // долчик (fuller) — центральный блик
        R(13, 19, 3, 1, pal.dark);               // нижний край клинка перед гардой
        // Острие (заострённый верх)
        R(13, 4, 3, 1, pal.base);
        R(14, 3, 1, 1, pal.light);
        R(14, 2, 1, 1, pal.edge);                // самый яркий пик
        R(13, 4, 1, 1, pal.light);
        R(15, 4, 1, 1, pal.vdark);
        // Гарда (крестовина) — из того же материала, что и клинок
        R(10, 20, 9, 2, pal.base);
        R(10, 20, 9, 1, pal.light);              // верхний блик гарды
        R(10, 21, 9, 1, pal.vdark);              // нижняя тень гарды
        R(10, 20, 1, 2, pal.edge);               // левый кончик — блик
        R(18, 20, 1, 2, pal.vdark);              // правый кончик — тень
        R(11, 20, 1, 1, pal.edge);               // дополнительный блик
        // Деревянная рукоять (короткая, под гардой)
        R(13, 22, 3, 5, hBase);
        R(13, 22, 1, 5, hLight);
        R(15, 22, 1, 5, hDark);
        R(13, 24, 3, 1, hDark);                  // волокно
        R(14, 26, 1, 1, hVDark);                 // узел
        // Навершие (pommel) — из того же материала, что и клинок
        R(13, 27, 3, 1, pal.base);
        R(12, 27, 1, 1, pal.dark);
        R(16, 27, 1, 1, pal.vdark);
        R(13, 27, 1, 1, pal.light);
    }
    else if (type === 'pick') {
        // === КИРКА === — широкая горизонтальная балка с двумя «рогами»,
        // выступающими перпендикулярно по краям (узнаваемый силуэт Minecraft).
        // Главная балка
        R(6, 8, 17, 3, pal.base);                // тело балки
        R(6, 8, 17, 1, pal.light);               // верхний блик
        R(7, 8, 15, 1, pal.edge);                // самая яркая полоса наверху
        R(6, 10, 17, 1, pal.vdark);              // нижняя тень
        // Боковые расширения (концы балки)
        R(5, 9, 1, 2, pal.base);
        R(5, 9, 1, 1, pal.light);
        R(5, 10, 1, 1, pal.dark);
        R(23, 9, 1, 2, pal.base);


        R(23, 9, 1, 1, pal.dark);
        R(23, 10, 1, 1, pal.vdark);
        // Заострённые крайние пики
        R(4, 10, 1, 1, pal.vdark);
        R(24, 10, 1, 1, pal.vdark);
        // Левый рог (выступает ВВЕРХ над балкой — характерная черта кирки)
        R(6, 6, 2, 2, pal.base);
        R(6, 6, 1, 2, pal.light);
        R(7, 6, 1, 1, pal.dark);
        R(6, 6, 1, 1, pal.edge);
        // Правый рог
        R(21, 6, 2, 2, pal.base);
        R(21, 6, 1, 2, pal.light);
        R(22, 6, 1, 2, pal.dark);
        R(22, 6, 1, 1, pal.edge);
        // Втулка (где голова крепится к рукояти)
        R(13, 11, 3, 1, pal.dark);
        R(14, 11, 1, 1, pal.base);
        // Деревянная обмотка под головой
        R(12, 12, 5, 1, hVDark);
    }
    else if (type === 'axe') {
        // === ТОПОР === — трапециевидное лезвие, резко расширяющееся
        // к режущей кромке. Узкое основание у рукояти.
        // Узкое основание (у рукояти)
        R(13, 6, 1, 8, pal.dark);
        R(13, 6, 1, 1, pal.base);
        // Тело лезвия (трапеция)
        R(14, 5, 7, 1, pal.dark);                // верхний скос
        R(14, 6, 7, 1, pal.light);               // верхний блик
        R(14, 7, 7, 6, pal.base);                // основное тело
        R(14, 13, 7, 1, pal.vdark);              // нижний скос
        // Выпуклое расширение режущей кромки (справа)
        R(21, 6, 1, 1, pal.dark);
        R(21, 7, 1, 6, pal.base);
        R(21, 13, 1, 1, pal.vdark);
        R(22, 7, 1, 1, pal.dark);
        R(22, 8, 1, 5, pal.light);
        R(22, 9, 1, 3, pal.edge);                // самый яркий блик кромки
        R(22, 12, 1, 1, pal.vdark);
        // Внутренние блики и долчик
        R(15, 7, 4, 1, pal.light);
        R(15, 8, 3, 1, pal.edge);
        R(16, 10, 2, 1, pal.light);
        R(15, 12, 5, 1, pal.vdark);
        R(15, 11, 1, 1, pal.dark);
        // Деревянная обмотка/крепление к рукояти
        R(12, 14, 5, 1, hVDark);
        R(12, 15, 5, 1, hDark);
    }
    else if (type === 'shovel') {
        // === ЛОПАТА === — узкая прямоугольная пластина с лёгкой вогнутостью
        // и заострённым кончиком.
        // Металлический воротник (хомут крепления)
        R(12, 4, 5, 1, pal.dark);
        R(13, 4, 3, 1, pal.base);
        R(13, 4, 1, 1, pal.light);
        // Штык (основное тело)
        R(12, 5, 5, 9, pal.base);
        R(12, 5, 5, 1, pal.light);               // верхний блик плечика
        R(13, 5, 3, 1, pal.edge);
        R(12, 5, 1, 9, pal.light);               // левый блик
        R(16, 5, 1, 9, pal.vdark);               // правая тень
        R(13, 7, 1, 6, pal.edge);                // вогнутость — центральный блик
        R(15, 8, 1, 5, pal.vdark);               // внутренняя тень
        // Заострённый кончик
        R(13, 14, 3, 1, pal.base);
        R(12, 14, 1, 1, pal.dark);
        R(16, 14, 1, 1, pal.vdark);
        R(13, 15, 3, 1, pal.dark);
        R(14, 15, 1, 1, pal.vdark);
        // Деревянная обмотка под воротником
        R(12, 12, 5, 1, hVDark);
    }
    else if (type === 'hoe') {
        // === МОТЫГА === — Г-образное лезвие с заострённой режущей кромкой
        // сверху и вертикальной пяткой соединения с рукоятью.
        // Горизонтальное лезвие
        R(7, 6, 14, 3, pal.base);                // тело лезвия
        R(7, 5, 14, 1, pal.dark);                // верхний скос
        R(8, 5, 12, 1, pal.edge);                // острая режущая кромка
        R(7, 6, 14, 1, pal.light);               // верхний блик
        R(7, 8, 14, 1, pal.vdark);               // нижняя тень
        // Левый заострённый выступ
        R(6, 6, 1, 3, pal.dark);
        R(6, 6, 1, 1, pal.base);
        R(6, 7, 1, 1, pal.light);
        // Правый закруглённый край
        R(21, 6, 1, 2, pal.dark);
        R(21, 6, 1, 1, pal.base);
        // Вертикальная пятка (соединение с рукоятью)
        R(13, 9, 4, 3, pal.base);
        R(13, 9, 1, 3, pal.light);               // левый блик
        R(16, 9, 1, 3, pal.vdark);               // правая тень
        R(13, 9, 4, 1, pal.dark);
        R(13, 11, 4, 1, pal.vdark);
        // Деревянная обмотка
        R(12, 12, 5, 1, hVDark);
    }
    else {
        // Дефолтная голова — для совместимости
        R(11, 8, 8, 6, pal.base);
        R(11, 8, 8, 1, pal.light);
        R(11, 13, 8, 1, pal.vdark);
    }

    c.restore();
}

function drawApple(c, x = 0, y = 0, size = 32) {
    c.save();
    c.translate(x, y);
    c.imageSmoothingEnabled = false;
    const s = size / 32;

    c.fillStyle = '#c62828';
    c.beginPath();
    c.arc(16 * s, 18 * s, 10 * s, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#8d6e63';
    c.fillRect(15 * s, 6 * s, 2 * s, 6 * s);

    c.fillStyle = '#2e7d32';
    c.beginPath();
    c.ellipse(20 * s, 9 * s, 5 * s, 2.5 * s, -0.5, 0, Math.PI * 2);
    c.fill();

    c.restore();
}

// V8.3: простое рендеринг держимого предмета. Никаких руко-отростков —
// икону рисуем сбоку корпуса по направлению взгляда, на атаке крутим swing.
function drawItem(c, playerObj, dir, itemId) {
    if (itemId == null) return;
    const isBlock = !!BLOCKS[itemId];

    const now = Date.now();
    const walking = Math.abs(playerObj.vx) > 0.1;
    const breathe = walking ? 0 : Math.sin(now / 800);

    // Пивот у «руки» — на боку корпуса по направлению взгляда, чуть выше центра.
    const px = (dir === 1) ? (playerObj.x + 14) : (playerObj.x + 6);
    const py = playerObj.y + 30 + breathe;

    // Простой свинг: быстрая дуга при клике/добыче.
    const swingDur = 220;
    const swingTime = now - (playerObj.lastSwingTime || 0);
    let swing = 0;
    if (swingTime >= 0 && swingTime < swingDur) {
        const prog = swingTime / swingDur;
        swing = Math.sin(prog * Math.PI) * (Math.PI / 2.2); // до ~82°
    }

    c.save();
    c.imageSmoothingEnabled = false;
    c.translate(px, py);
    if (dir === -1) c.scale(-1, 1);
    c.rotate(swing);

    if (isBlock) {
        // Блок в руке — 14×14 перед корпусом, чуть ниже пивота.
        drawBlock(c, 0, -2, itemId, 14);
    } else {
        // drawItemIcon рисует в 32×32; смещаем так, чтобы «рукоять» примерно
        // совпала с пивотом, а остриё смотрело вперёд-вверх.
        if (itemId === ITEMS.CLOCK) {
            c.translate(0, -4);
            c.scale(0.5, 0.5);
        } else {
            c.translate(-4, -20);
        }
        drawItemIcon(c, itemId, null);
    }
    c.restore();
}

function drawClockIcon(c, frac) {
    const w = 32, h = 32;
    // Removed clearRect to avoid black square when drawn in player's hand
    c.imageSmoothingEnabled = false;

    // Draw Gold Frame (Background)
    c.fillStyle = '#ffca28'; // Gold base
    c.fillRect(10, 2, 12, 28);
    c.fillRect(2, 10, 28, 12);
    c.fillRect(6, 4, 20, 24);
    c.fillRect(4, 6, 24, 20);

    // Dark shading
    c.fillStyle = '#f57f17';
    c.fillRect(10, 28, 12, 2);
    c.fillRect(6, 26, 20, 2);
    c.fillRect(26, 6, 2, 20);
    c.fillRect(28, 10, 2, 12);

    // Light highlights
    c.fillStyle = '#fff59d';
    c.fillRect(10, 2, 12, 2);
    c.fillRect(6, 4, 20, 2);
    c.fillRect(2, 10, 2, 12);
    c.fillRect(4, 6, 2, 20);

    // Inner hole background (very dark)
    c.fillStyle = '#212121';
    c.fillRect(10, 8, 12, 16);
    c.fillRect(8, 10, 16, 12);

    c.save();
    c.translate(16, 16);
    c.rotate(frac * Math.PI * 2 + Math.PI); 
    
    // Draw day
    c.fillStyle = '#64b5f6'; 
    c.fillRect(-7, -7, 14, 7);
    // Draw night
    c.fillStyle = '#1a237e'; 
    c.fillRect(-7, 0, 14, 7);
    
    // Sun
    c.fillStyle = '#fff59d';
    c.fillRect(-2, -5, 4, 3);
    
    // Moon
    c.fillStyle = '#eeeeee';
    c.fillRect(-2, 2, 4, 3);
    c.restore();

    // Mask out corners
    c.fillStyle = '#ffca28';
    c.fillRect(8, 8, 2, 2);
    c.fillRect(22, 8, 2, 2);
    c.fillRect(8, 22, 2, 2);
    c.fillRect(22, 22, 2, 2);
    
    // Inner dark border
    c.fillStyle = '#3e2723'; 
    c.fillRect(10, 8, 12, 2); 
    c.fillRect(10, 22, 12, 2); 
    c.fillRect(8, 10, 2, 12); 
    c.fillRect(22, 10, 2, 12); 

    // Glass reflection
    c.fillStyle = 'rgba(255, 255, 255, 0.2)';
    c.fillRect(10, 10, 4, 6);
    c.fillRect(14, 12, 2, 4);
}

// =========================================================
// ARMOR — иконки в инвентаре + рисование оверлея на Крипере.
// pal — палитра материала: { base, light, dark, edge }.
// Все три иконки рисуются в 32×32-канвас.
// =========================================================
function drawArmorIconHelmet(c, pal) {
    if (!pal) return;
    c.fillStyle = pal.base;
    c.fillRect(6, 6, 20, 18);
    c.fillStyle = pal.light;
    c.fillRect(6, 6, 20, 2);
    c.fillRect(6, 8, 2, 16);
    c.fillStyle = pal.dark;
    c.fillRect(24, 8, 2, 16);
    c.fillRect(6, 22, 20, 2);
    c.fillStyle = pal.edge;
    c.fillRect(5, 6, 1, 18); c.fillRect(26, 6, 1, 18);
    c.fillRect(6, 5, 20, 1); c.fillRect(6, 24, 20, 1);
    // Лицевой вырез (Т-образный)
    c.clearRect(10, 12, 12, 12);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(10, 12, 12, 12);
    c.fillStyle = pal.base;
    c.fillRect(14, 12, 4, 8); // носовая пластина
    c.fillStyle = pal.light;
    c.fillRect(14, 12, 2, 8);
    c.fillStyle = pal.dark;
    c.fillRect(16, 12, 2, 8);
    // Брови / козырёк
    c.fillStyle = pal.dark;
    c.fillRect(10, 10, 12, 2);
    // Заклёпки
    c.fillStyle = pal.edge;
    c.fillRect(8, 8, 2, 2); c.fillRect(22, 8, 2, 2);
}

function drawArmorIconChest(c, pal) {
    if (!pal) return;
    c.fillStyle = pal.base;
    c.fillRect(4, 6, 24, 6); // Плечи
    c.fillRect(6, 12, 20, 6); // Грудь
    c.fillRect(8, 18, 16, 8); // Талия
    c.fillStyle = pal.light;
    c.fillRect(4, 6, 24, 2);
    c.fillRect(4, 8, 2, 4);
    c.fillRect(6, 12, 2, 6);
    c.fillRect(8, 18, 2, 8);
    c.fillStyle = pal.dark;
    c.fillRect(26, 8, 2, 4);
    c.fillRect(24, 12, 2, 6);
    c.fillRect(22, 18, 2, 8);
    c.fillRect(8, 24, 16, 2);
    c.fillStyle = pal.edge;
    c.fillRect(3, 6, 1, 6); c.fillRect(28, 6, 1, 6);
    c.fillRect(4, 5, 24, 1);
    c.fillRect(5, 12, 1, 6); c.fillRect(26, 12, 1, 6);
    c.fillRect(7, 18, 1, 8); c.fillRect(24, 18, 1, 8);
    c.fillRect(8, 26, 16, 1);
    // Горловина
    c.clearRect(12, 6, 8, 4);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(12, 6, 8, 4);
    // Рельеф посередине
    c.fillStyle = pal.dark;
    c.fillRect(14, 10, 4, 14);
    c.fillStyle = pal.light;
    c.fillRect(14, 10, 2, 14);
}

function drawArmorIconBoots(c, pal) {
    if (!pal) return;
    const drawBoot = (ox) => {
        c.fillStyle = pal.base;
        c.fillRect(ox, 10, 8, 10); // Голенище
        c.fillRect(ox - 2, 20, 10, 6); // Носок
        c.fillStyle = pal.light;
        c.fillRect(ox, 10, 8, 2);
        c.fillRect(ox, 12, 2, 8);
        c.fillRect(ox - 2, 20, 2, 6);
        c.fillStyle = pal.dark;
        c.fillRect(ox + 6, 12, 2, 8);
        c.fillRect(ox + 6, 20, 2, 6);
        c.fillRect(ox - 2, 24, 10, 2);
        c.fillStyle = pal.edge;
        c.fillRect(ox - 3, 20, 1, 6); c.fillRect(ox + 8, 10, 1, 16);
        c.fillRect(ox - 1, 10, 1, 10);
        c.fillRect(ox, 9, 8, 1); c.fillRect(ox - 2, 26, 10, 1);
        c.fillRect(ox - 2, 19, 2, 1);
    };
    drawBoot(8);
    drawBoot(20);
}

// PERF: каждый кадр инвентаря/крафта раньше вызывался drawItemIcon, который
// процедурно рисовал десятки fillRect для каждого слота. На каждую перерисовку
// (а она происходит на любой клик/move) уходило ~500 канвасов × ~50 fillRect.
// Кешируем готовый 32×32 спрайт по id; полоску прочности оставляем динамической.
const ICON_CACHE = new Map();
function drawItemIcon(c, id, dur = null) {
    // CLOCK анимирован (стрелка), кеширование сломало бы движение — рисуем напрямую.
    if (id === ITEMS.CLOCK) {
        _drawItemIconImpl(c, id);
    } else {
        let cv = ICON_CACHE.get(id);
        if (!cv) {
            cv = document.createElement('canvas');
            cv.width = 32; cv.height = 32;
            const cc = cv.getContext('2d');
            cc.imageSmoothingEnabled = false;
            _drawItemIconImpl(cc, id);
            ICON_CACHE.set(id, cv);
        }
        c.drawImage(cv, 0, 0);
    }
    if (dur !== null && MAX_DUR[id]) {
        const pct = dur / MAX_DUR[id];
        c.fillStyle = '#000';
        c.fillRect(4, 26, 24, 4);
        c.fillStyle = pct > 0.5 ? '#00ff00' : (pct > 0.2 ? '#ff9800' : '#ff0000');
        c.fillRect(5, 27, 22 * pct, 2);
    }
}

function _drawItemIconImpl(c, id) {
    if (id === ITEMS.FLINT_AND_STEEL) {
        c.fillStyle = '#9e9e9e'; c.fillRect(6, 6, 8, 4); c.fillRect(2, 10, 4, 12); c.fillRect(6, 22, 8, 4); // Steel ring
        c.fillStyle = '#e0e0e0'; c.fillRect(6, 8, 4, 2); c.fillRect(4, 10, 2, 8); // Highlight
        c.fillStyle = '#212121'; c.fillRect(16, 14, 12, 10); // Flint base
        c.fillStyle = '#424242'; c.fillRect(18, 16, 8, 6); // Flint highlight
        c.fillStyle = '#757575'; c.fillRect(20, 18, 4, 2);
    }
    else if (id === ITEMS.SHEARS) drawPixelTool(c, 4, 4, 1, '#bdbdbd', '#bdbdbd', 'shears', 3);
    else if ([ITEMS.WOOD_PICK, ITEMS.STONE_PICK, ITEMS.IRON_PICK, ITEMS.GOLD_PICK, ITEMS.DIAMOND_PICK].includes(id)) drawPixelTool(c, 4, 4, 1, '#5d4037', getToolColor(id), 'pick', 3);
    else if ([ITEMS.WOOD_SWORD, ITEMS.STONE_SWORD, ITEMS.IRON_SWORD, ITEMS.GOLD_SWORD, ITEMS.DIAMOND_SWORD].includes(id)) drawPixelTool(c, 4, 4, 1, '#5d4037', getToolColor(id), 'sword', 3);
    else if ([ITEMS.WOOD_AXE, ITEMS.STONE_AXE, ITEMS.IRON_AXE, ITEMS.GOLD_AXE, ITEMS.DIAMOND_AXE].includes(id)) drawPixelTool(c, 4, 4, 1, '#5d4037', getToolColor(id), 'axe', 3);
    else if ([ITEMS.WOOD_SHOVEL, ITEMS.STONE_SHOVEL, ITEMS.IRON_SHOVEL, ITEMS.GOLD_SHOVEL, ITEMS.DIAMOND_SHOVEL].includes(id)) drawPixelTool(c, 4, 4, 1, '#5d4037', getToolColor(id), 'shovel', 3);
    else if ([ITEMS.WOOD_HOE, ITEMS.STONE_HOE, ITEMS.IRON_HOE, ITEMS.GOLD_HOE, ITEMS.DIAMOND_HOE].includes(id)) drawPixelTool(c, 4, 4, 1, '#5d4037', getToolColor(id), 'hoe', 3);
    else if (id === ITEMS.PAINTING) {
        c.fillStyle = '#5d4037'; c.fillRect(4, 6, 24, 20); // frame
        c.fillStyle = '#ffffff'; c.fillRect(6, 8, 20, 16); // canvas
        c.fillStyle = '#f44336'; c.fillRect(10, 10, 6, 6);  // red shape
        c.fillStyle = '#4caf50'; c.fillRect(18, 14, 6, 8); // green shape
        c.fillStyle = '#2196f3'; c.fillRect(8, 18, 8, 4); // blue shape
    }
    else if (id === ITEMS.PAPER) {
        c.fillStyle = '#e0e0e0'; c.fillRect(8, 6, 16, 20);
        c.fillStyle = '#ffffff'; c.fillRect(10, 8, 12, 16);
        c.fillStyle = '#bdbdbd';
        c.fillRect(12, 12, 8, 2); c.fillRect(12, 16, 8, 2); c.fillRect(12, 20, 6, 2);
    }
    else if (id === ITEMS.GLOWSTONE_DUST) {
        c.fillStyle = '#ffeb3b'; c.fillRect(10, 18, 12, 6);
        c.fillRect(12, 14, 8, 4);
        c.fillRect(14, 10, 4, 4);
        c.fillStyle = '#fbc02d'; c.fillRect(12, 16, 8, 2); c.fillRect(14, 12, 4, 2);
    }
    else if (id === ITEMS.SUGAR) {
        c.fillStyle = '#ffffff'; c.fillRect(10, 18, 12, 6);
        c.fillRect(12, 14, 8, 4);
        c.fillRect(14, 10, 4, 4);
        c.fillStyle = '#e0e0e0'; c.fillRect(12, 20, 8, 2);
    }
    else if (id === ITEMS.GUNPOWDER) {
        c.fillStyle = '#424242'; c.fillRect(10, 18, 12, 6);
        c.fillRect(12, 14, 8, 4);
        c.fillRect(14, 10, 4, 4);
        c.fillStyle = '#616161'; c.fillRect(12, 16, 8, 2); c.fillRect(14, 12, 4, 2);
    }
    else if (id === ITEMS.WHEAT_SEEDS) {
        // V5: зёрна — маленькие зелёные точки на светлой почве
        c.fillStyle = '#6d4c41';
        c.fillRect(10, 18, 12, 6);
        c.fillStyle = '#4e342e';
        c.fillRect(10, 22, 12, 2);
        // сами семена
        c.fillStyle = '#8bc34a';
        c.fillRect(11, 10, 2, 3);
        c.fillRect(14, 8, 2, 3);
        c.fillRect(17, 11, 2, 3);
        c.fillRect(20, 9, 2, 3);
        c.fillRect(13, 14, 2, 3);
        c.fillRect(18, 15, 2, 3);
        c.fillStyle = '#689f38';
        c.fillRect(11, 12, 1, 1); c.fillRect(15, 10, 1, 1);
        c.fillRect(18, 13, 1, 1); c.fillRect(21, 11, 1, 1);
        c.fillStyle = '#c5e1a5';
        c.fillRect(14, 9, 1, 1); c.fillRect(20, 10, 1, 1);
    }
    else if (id === ITEMS.WHEAT) {
        // V5: пшеница — пучок золотых колосков
        // стебли
        c.fillStyle = '#827717';
        c.fillRect(11, 8, 1, 18); c.fillRect(15, 5, 1, 21); c.fillRect(19, 8, 1, 18);
        // колосья — центральный
        c.fillStyle = '#f9a825';
        c.fillRect(14, 6, 3, 4); c.fillRect(13, 10, 5, 4); c.fillRect(14, 14, 3, 3);
        // колосья — боковые
        c.fillRect(10, 10, 3, 3); c.fillRect(9, 13, 3, 3); c.fillRect(10, 16, 3, 3);
        c.fillRect(18, 10, 3, 3); c.fillRect(19, 13, 3, 3); c.fillRect(18, 16, 3, 3);
        // блики
        c.fillStyle = '#fff59d';
        c.fillRect(14, 6, 1, 1); c.fillRect(10, 10, 1, 1); c.fillRect(18, 10, 1, 1);
        c.fillRect(15, 10, 1, 1);
        // тени снизу колосьев
        c.fillStyle = '#e65100';
        c.fillRect(14, 17, 3, 1); c.fillRect(10, 19, 3, 1); c.fillRect(18, 19, 3, 1);
    }
    else if (id === ITEMS.TORCH) drawPixelTool(c, 4, 4, 1, '#5d4037', '#ffeb3b', 'torch', 3);
    else if (id === ITEMS.STICK) {
        // V4: наклонная палка с текстурой древесины (как в Minecraft)
        c.fillStyle = '#6d4c41';
        c.fillRect(6, 22, 3, 3); c.fillRect(9, 19, 3, 3);
        c.fillRect(12, 16, 3, 3); c.fillRect(15, 13, 3, 3);
        c.fillRect(18, 10, 3, 3); c.fillRect(21, 7, 3, 3);
        c.fillStyle = '#8d6e63';
        c.fillRect(8, 21, 2, 2); c.fillRect(11, 18, 2, 2);
        c.fillRect(14, 15, 2, 2); c.fillRect(17, 12, 2, 2);
        c.fillRect(20, 9, 2, 2);
        c.fillStyle = '#5d4037';
        c.fillRect(6, 24, 2, 1); c.fillRect(22, 8, 2, 1);
    }
    else if (id === ITEMS.APPLE) drawApple(c, 0, 0, 32);
    else if (id === ITEMS.LEATHER) {
        // V4: кусок кожи — квадратная форма с прошитым краем
        c.fillStyle = '#6d4c41';
        c.fillRect(6, 6, 20, 20);
        c.fillStyle = '#8d6e63';
        c.fillRect(8, 8, 16, 16);
        c.fillStyle = '#a1887f';
        c.fillRect(9, 9, 6, 6); c.fillRect(18, 14, 4, 6);
        // прошивка по углам
        c.fillStyle = '#3e2723';
        c.fillRect(5, 5, 2, 2); c.fillRect(25, 5, 2, 2);
        c.fillRect(5, 25, 2, 2); c.fillRect(25, 25, 2, 2);
        c.fillRect(10, 4, 2, 2); c.fillRect(20, 4, 2, 2);
        c.fillRect(4, 15, 2, 2); c.fillRect(26, 15, 2, 2);
    }
    else if (WOOL_GROUP.includes(id)) {
        // V4: пушистый ком шерсти — много мелких сегментов
        // V16: динамический цвет, фикс для белой шерсти
        let base, hi, lo1, lo2;
        if (id === ITEMS.WHITE_WOOL) {
            base = '#f5f5f5'; hi = '#fff'; lo1 = '#e0e0e0'; lo2 = '#bdbdbd';
        } else {
            base = BLOCKS[id].color || '#f5f5f5';
            hi = 'rgba(255, 255, 255, 0.4)';
            lo1 = 'rgba(0, 0, 0, 0.15)';
            lo2 = 'rgba(0, 0, 0, 0.3)';
        }
        c.fillStyle = base;
        c.fillRect(6, 8, 20, 16); c.fillRect(8, 6, 16, 20);
        c.fillStyle = hi;
        c.fillRect(9, 9, 5, 5); c.fillRect(16, 12, 4, 4);
        c.fillRect(19, 8, 3, 3); c.fillRect(10, 18, 4, 4);
        c.fillStyle = lo1;
        c.fillRect(6, 15, 3, 3); c.fillRect(23, 15, 3, 3);
        c.fillRect(15, 22, 3, 2); c.fillRect(7, 10, 2, 2);
        c.fillStyle = lo2;
        c.fillRect(22, 22, 3, 2); c.fillRect(8, 22, 2, 2);
    }
    else if (id === ITEMS.PORK_RAW) {
        // V4: сырая свинина — розовая с прожилками жира
        c.fillStyle = '#f8bbd0';
        c.fillRect(6, 10, 20, 14);
        c.fillStyle = '#f48fb1';
        c.fillRect(5, 12, 22, 10); c.fillRect(8, 9, 16, 2);
        c.fillStyle = '#ec407a';
        c.fillRect(10, 13, 12, 6);
        c.fillStyle = '#f8bbd0';
        c.fillRect(12, 14, 3, 1); c.fillRect(18, 16, 2, 1);
        c.fillStyle = '#fff';
        c.fillRect(7, 14, 2, 2); c.fillRect(24, 17, 2, 2);
    }
    else if (id === ITEMS.PORK_COOKED) {
        // V4: приготовленная свинина — коричневая корочка
        c.fillStyle = '#a1887f';
        c.fillRect(6, 10, 20, 14);
        c.fillStyle = '#795548';
        c.fillRect(5, 12, 22, 10); c.fillRect(8, 9, 16, 2);
        c.fillStyle = '#5d4037';
        c.fillRect(10, 13, 12, 6);
        c.fillStyle = '#d7ccc8';
        c.fillRect(12, 14, 3, 1); c.fillRect(18, 16, 2, 1);
        c.fillStyle = '#ffccbc';
        c.fillRect(7, 14, 2, 2); c.fillRect(24, 17, 2, 2);
    }
    else if (id === ITEMS.BEEF_RAW) {
        // V4: сырая говядина — насыщенно-красная со светлыми вкраплениями
        c.fillStyle = '#c62828';
        c.fillRect(6, 9, 20, 15);
        c.fillStyle = '#b71c1c';
        c.fillRect(5, 11, 22, 11); c.fillRect(7, 8, 18, 2);
        c.fillStyle = '#e53935';
        c.fillRect(9, 12, 5, 4); c.fillRect(17, 16, 6, 4);
        c.fillStyle = '#ffcdd2';
        c.fillRect(11, 13, 2, 2); c.fillRect(20, 18, 2, 1); c.fillRect(8, 19, 2, 1);
        c.fillStyle = '#880e4f';
        c.fillRect(14, 16, 2, 2);
    }
    else if (id === ITEMS.BEEF_COOKED) {
        // V4: стейк — тёмно-коричневый с корочкой
        c.fillStyle = '#4e342e';
        c.fillRect(6, 9, 20, 15);
        c.fillStyle = '#3e2723';
        c.fillRect(5, 11, 22, 11); c.fillRect(7, 8, 18, 2);
        c.fillStyle = '#6d4c41';
        c.fillRect(9, 12, 5, 4); c.fillRect(17, 16, 6, 4);
        c.fillStyle = '#a1887f';
        c.fillRect(11, 13, 2, 2); c.fillRect(20, 18, 2, 1); c.fillRect(8, 19, 2, 1);
        // капли жира блестят
        c.fillStyle = '#ffe082';
        c.fillRect(13, 10, 1, 1); c.fillRect(22, 13, 1, 1);
    }
    else if (id === ITEMS.MUTTON_RAW) {
        // V4: сырая баранина — темнее свинины, с костью
        c.fillStyle = '#e57373';
        c.fillRect(6, 10, 20, 14);
        c.fillStyle = '#c62828';
        c.fillRect(5, 12, 22, 10);
        c.fillStyle = '#8e0000';
        c.fillRect(8, 14, 14, 6);
        c.fillStyle = '#ffcdd2';
        c.fillRect(10, 15, 2, 1); c.fillRect(16, 17, 3, 1);
        // косточка
        c.fillStyle = '#f5f5f5';
        c.fillRect(4, 13, 4, 6);
        c.fillStyle = '#e0e0e0';
        c.fillRect(4, 13, 4, 1); c.fillRect(4, 18, 4, 1);
    }
    else if (id === ITEMS.MUTTON_COOKED) {
        // V4: приготовленная баранина — коричневая, кость белая
        c.fillStyle = '#8d6e63';
        c.fillRect(6, 10, 20, 14);
        c.fillStyle = '#5d4037';
        c.fillRect(5, 12, 22, 10);
        c.fillStyle = '#3e2723';
        c.fillRect(8, 14, 14, 6);
        c.fillStyle = '#d7ccc8';
        c.fillRect(10, 15, 2, 1); c.fillRect(16, 17, 3, 1);
        c.fillStyle = '#fafafa';
        c.fillRect(4, 13, 4, 6);
        c.fillStyle = '#eeeeee';
        c.fillRect(4, 13, 4, 1); c.fillRect(4, 18, 4, 1);
    }
    else if (id === ITEMS.COAL) {
        // V4: куча угля — неровные чёрные камни с тёмно-серыми бликами
        c.fillStyle = '#212121';
        c.fillRect(8, 11, 6, 6); c.fillRect(14, 9, 6, 7);
        c.fillRect(18, 14, 6, 6); c.fillRect(10, 17, 8, 5);
        c.fillRect(6, 14, 4, 5);
        c.fillStyle = '#424242';
        c.fillRect(10, 12, 2, 2); c.fillRect(16, 10, 2, 2);
        c.fillRect(20, 15, 2, 2); c.fillRect(12, 18, 2, 2);
        c.fillStyle = '#616161';
        c.fillRect(11, 13, 1, 1); c.fillRect(17, 11, 1, 1);
        c.fillStyle = '#000';
        c.fillRect(13, 15, 1, 2); c.fillRect(19, 18, 1, 1); c.fillRect(9, 19, 2, 1);
    }
    else if (id === ITEMS.IRON_INGOT) {
        // V4: слиток железа — прямоугольный со скосами и бликом
        c.fillStyle = '#9e9e9e';
        c.fillRect(7, 12, 18, 10);
        c.fillStyle = '#cfd8dc';
        c.fillRect(8, 13, 16, 8);
        c.fillStyle = '#eceff1';
        c.fillRect(9, 14, 14, 2);
        c.fillStyle = '#b0bec5';
        c.fillRect(9, 19, 14, 2);
        c.fillStyle = '#757575';
        c.fillRect(7, 12, 18, 1); c.fillRect(7, 21, 18, 1);
        c.fillStyle = '#fff';
        c.fillRect(10, 15, 2, 1); c.fillRect(14, 15, 1, 1);
    }
    else if (id === ITEMS.GOLD_INGOT) {
        // V4: слиток золота — как железо, но тёплые жёлтые тона
        c.fillStyle = '#ef6c00';
        c.fillRect(7, 12, 18, 10);
        c.fillStyle = '#ffca28';
        c.fillRect(8, 13, 16, 8);
        c.fillStyle = '#fff59d';
        c.fillRect(9, 14, 14, 2);
        c.fillStyle = '#fbc02d';
        c.fillRect(9, 19, 14, 2);
        c.fillStyle = '#e65100';
        c.fillRect(7, 12, 18, 1); c.fillRect(7, 21, 18, 1);
        c.fillStyle = '#fff';
        c.fillRect(10, 15, 2, 1); c.fillRect(14, 15, 1, 1);
    }
    else if (id === ITEMS.EMERALD) {
        // V4: гранёный изумруд
        c.fillStyle = '#00c853';
        c.beginPath(); c.moveTo(16, 4); c.lineTo(26, 12); c.lineTo(22, 26); c.lineTo(10, 26); c.lineTo(6, 12); c.closePath(); c.fill();
        c.fillStyle = '#69f0ae';
        c.fillRect(13, 9, 6, 2); c.fillRect(11, 13, 3, 4);
        c.fillStyle = '#1b5e20';
        c.fillRect(19, 19, 3, 5); c.fillRect(15, 23, 3, 2);
        c.fillStyle = '#ffffff';
        c.fillRect(14, 10, 2, 1);
    }
    else if (id === ITEMS.BREAD) {
        // V4: румяная буханка хлеба с хрустящей коркой
        c.fillStyle = '#5d4037';
        c.fillRect(5, 11, 22, 13);
        c.fillStyle = '#8d6e63';
        c.fillRect(6, 12, 20, 11);
        c.fillStyle = '#a1887f';
        c.fillRect(7, 13, 18, 9);
        c.fillStyle = '#d7ccc8';
        c.fillRect(8, 14, 16, 2); c.fillRect(8, 18, 3, 3); c.fillRect(21, 19, 3, 2);
        // надрезы корки
        c.fillStyle = '#4e342e';
        c.fillRect(11, 13, 1, 7); c.fillRect(16, 13, 1, 7); c.fillRect(21, 13, 1, 7);
    }
    else if (id === ITEMS.CLOCK) { drawClockIcon(c, game.getClockFrac ? game.getClockFrac() : ((time + 0.25) % 1)); }
    else if (id === ITEMS.DIAMOND) {
        // V4: огранённый алмаз с бликами
        c.fillStyle = '#0097a7';
        c.beginPath(); c.moveTo(16, 3); c.lineTo(25, 15); c.lineTo(16, 29); c.lineTo(7, 15); c.closePath(); c.fill();
        c.fillStyle = '#4dd0e1';
        c.beginPath(); c.moveTo(16, 5); c.lineTo(23, 15); c.lineTo(16, 27); c.lineTo(9, 15); c.closePath(); c.fill();
        c.fillStyle = '#80deea';
        c.fillRect(13, 9, 3, 4); c.fillRect(14, 13, 2, 3);
        c.fillStyle = '#ffffff';
        c.fillRect(13, 9, 2, 1); c.fillRect(14, 10, 1, 1);
        c.fillStyle = '#006064';
        c.fillRect(17, 19, 3, 4); c.fillRect(18, 23, 2, 2);
    }
    else if (id === ITEMS.BUCKET || id === ITEMS.WATER_BUCKET || id === ITEMS.LAVA_BUCKET) {
        // V6: ведро — трапеция из стали с дужкой-ручкой сверху.
        // Одна и та же форма для всех трёх; разница — заполнение.
        // Стальная базовая форма (трапеция, широкая вверху).
        // Верхний край ведра (обод)
        c.fillStyle = '#9e9e9e';
        c.fillRect(7, 10, 18, 2);
        c.fillStyle = '#757575';
        c.fillRect(7, 12, 18, 1);

        // Корпус (трапеция, сужающаяся книзу)
        // Рисуем горизонтальными полосами, каждая уже предыдущей на 1 пиксель с каждой стороны
        c.fillStyle = '#bdbdbd';
        // левая грань и правая грань — блик/тень
        // Для читаемости построим контур как серию fillRect строками.
        const bodyRows = [
            { y: 13, x: 8, w: 16 }, // самая широкая под ободом
            { y: 14, x: 8, w: 16 },
            { y: 15, x: 8, w: 16 },
            { y: 16, x: 9, w: 14 },
            { y: 17, x: 9, w: 14 },
            { y: 18, x: 9, w: 14 },
            { y: 19, x: 10, w: 12 },
            { y: 20, x: 10, w: 12 },
            { y: 21, x: 10, w: 12 },
            { y: 22, x: 11, w: 10 },
            { y: 23, x: 11, w: 10 },
            { y: 24, x: 11, w: 10 },
            { y: 25, x: 11, w: 10 }, // дно
        ];
        bodyRows.forEach(r => c.fillRect(r.x, r.y, r.w, 1));
        // Блик слева и тень справа
        c.fillStyle = '#eceff1';
        bodyRows.forEach(r => c.fillRect(r.x, r.y, 1, 1));
        c.fillStyle = '#757575';
        bodyRows.forEach(r => c.fillRect(r.x + r.w - 1, r.y, 1, 1));

        // Дно
        c.fillStyle = '#616161';
        c.fillRect(11, 26, 10, 1);

        // Дужка-ручка
        c.strokeStyle = '#757575';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(8, 10);
        c.quadraticCurveTo(16, 3, 24, 10);
        c.stroke();
        c.fillStyle = '#9e9e9e';
        c.fillRect(8, 9, 1, 1); c.fillRect(23, 9, 1, 1);

        // Заполнение
        if (id === ITEMS.WATER_BUCKET) {
            // Вода — синий с волнами
            c.fillStyle = '#1565c0';
            c.fillRect(9, 13, 14, 10);
            c.fillStyle = '#1976d2';
            c.fillRect(10, 14, 12, 8);
            c.fillStyle = '#42a5f5';
            // волна на поверхности
            c.fillRect(9, 13, 14, 1);
            c.fillRect(11, 12, 3, 1); c.fillRect(17, 12, 3, 1);
            c.fillStyle = '#90caf9';
            c.fillRect(12, 13, 2, 1); c.fillRect(18, 13, 2, 1);
            // блик
            c.fillStyle = '#e3f2fd';
            c.fillRect(11, 14, 2, 1);
        } else if (id === ITEMS.LAVA_BUCKET) {
            // Лава — оранжевый с тёмными вкраплениями
            c.fillStyle = '#bf360c';
            c.fillRect(9, 13, 14, 10);
            c.fillStyle = '#e65100';
            c.fillRect(10, 14, 12, 8);
            c.fillStyle = '#ff6f00';
            c.fillRect(11, 15, 10, 6);
            c.fillStyle = '#ffb300';
            // "пузыри" лавы
            c.fillRect(13, 16, 2, 2); c.fillRect(18, 18, 2, 2);
            c.fillRect(11, 19, 2, 1);
            // поверхностные пятна
            c.fillStyle = '#fff176';
            c.fillRect(13, 16, 1, 1); c.fillRect(18, 18, 1, 1);
            // тёмная шлака
            c.fillStyle = '#3e2723';
            c.fillRect(16, 15, 1, 1); c.fillRect(12, 20, 1, 1);
        } else {
            // Пустое ведро — тень внутри (контур ободка)
            c.fillStyle = '#424242';
            c.fillRect(9, 13, 14, 2);
            c.fillStyle = '#212121';
            c.fillRect(10, 13, 12, 1);
        }
    }
    // V11: Feather — pixel feather, white-grey with veins
    else if (id === ITEMS.FEATHER) {
        // стержень
        c.fillStyle = '#bdbdbd';
        c.fillRect(15, 5, 1, 22);
        c.fillStyle = '#9e9e9e';
        c.fillRect(16, 5, 1, 22);
        // опахало (light)
        c.fillStyle = '#fafafa';
        c.fillRect(11, 7, 4, 1); c.fillRect(10, 8, 5, 1); c.fillRect(9, 9, 6, 1);
        c.fillRect(8, 10, 7, 1); c.fillRect(8, 11, 7, 1); c.fillRect(7, 12, 8, 1);
        c.fillRect(7, 13, 8, 1); c.fillRect(8, 14, 7, 1); c.fillRect(8, 15, 7, 1);
        c.fillRect(9, 16, 6, 1); c.fillRect(9, 17, 6, 1); c.fillRect(10, 18, 5, 1);
        c.fillRect(11, 19, 4, 1); c.fillRect(12, 20, 3, 1); c.fillRect(13, 21, 2, 1);
        // правая часть опахала (slightly darker — естественная асимметрия)
        c.fillStyle = '#e0e0e0';
        c.fillRect(17, 8, 4, 1); c.fillRect(17, 9, 5, 1); c.fillRect(17, 10, 6, 1);
        c.fillRect(17, 11, 6, 1); c.fillRect(17, 12, 7, 1); c.fillRect(17, 13, 7, 1);
        c.fillRect(17, 14, 6, 1); c.fillRect(17, 15, 6, 1); c.fillRect(17, 16, 5, 1);
        c.fillRect(17, 17, 5, 1); c.fillRect(17, 18, 4, 1); c.fillRect(17, 19, 3, 1);
        // тёмные жилки
        c.fillStyle = '#9e9e9e';
        c.fillRect(11, 10, 1, 1); c.fillRect(10, 14, 1, 1); c.fillRect(12, 17, 1, 1);
        c.fillRect(20, 11, 1, 1); c.fillRect(19, 15, 1, 1); c.fillRect(18, 18, 1, 1);
        // кончик стержня (заострённый)
        c.fillStyle = '#757575';
        c.fillRect(15, 27, 2, 1);
    }
    // V11: Book — leather-bound with pages
    else if (id === ITEMS.BOOK) {
        // тёмная задняя обложка
        c.fillStyle = '#3e2723';
        c.fillRect(5, 6, 22, 20);
        // основная коричневая обложка
        c.fillStyle = '#6d4c41';
        c.fillRect(6, 7, 20, 18);
        // блик на обложке
        c.fillStyle = '#8d6e63';
        c.fillRect(7, 8, 18, 2);
        c.fillStyle = '#5d4037';
        c.fillRect(7, 23, 18, 2);
        // корешок книги слева
        c.fillStyle = '#3e2723';
        c.fillRect(6, 7, 2, 18);
        // страницы (белая сторона справа)
        c.fillStyle = '#fafafa';
        c.fillRect(24, 9, 2, 14);
        c.fillStyle = '#e0e0e0';
        c.fillRect(25, 10, 1, 12);
        // линии страниц
        c.fillStyle = '#9e9e9e';
        c.fillRect(24, 11, 2, 1);
        c.fillRect(24, 14, 2, 1);
        c.fillRect(24, 17, 2, 1);
        c.fillRect(24, 20, 2, 1);
        // золотое тиснение на обложке
        c.fillStyle = '#ffd54f';
        c.fillRect(11, 13, 8, 1);
        c.fillRect(13, 15, 4, 1);
    }
    // V11: Flint — angular grey shard
    else if (id === ITEMS.FLINT) {
        // V11: кремний — острый серый осколок
        c.fillStyle = '#424242';
        c.beginPath();
        c.moveTo(8, 22); c.lineTo(15, 8); c.lineTo(22, 12); c.lineTo(24, 22); c.lineTo(14, 26);
        c.closePath(); c.fill();
        c.fillStyle = '#616161';
        c.beginPath();
        c.moveTo(10, 21); c.lineTo(15, 10); c.lineTo(21, 13); c.lineTo(22, 21); c.lineTo(14, 24);
        c.closePath(); c.fill();
        c.fillStyle = '#9e9e9e';
        c.fillRect(13, 11, 4, 1); c.fillRect(11, 16, 3, 1); c.fillRect(18, 18, 3, 1);
        c.fillStyle = '#bdbdbd';
        c.fillRect(13, 12, 2, 1); c.fillRect(11, 17, 1, 1);
        // тёмные сколы
        c.fillStyle = '#212121';
        c.fillRect(15, 22, 2, 1); c.fillRect(20, 14, 1, 2);
    }
    // V11: Clay item — beige lump
    else if (id === ITEMS.CLAY) {
        // комок глины — округлый, серовато-голубой
        c.fillStyle = '#90a4ae';
        c.fillRect(7, 11, 18, 12);
        c.fillStyle = '#a4b3c4';
        c.fillRect(8, 10, 16, 14);
        c.fillStyle = '#b0bec5';
        c.fillRect(9, 11, 14, 12);
        c.fillStyle = '#cfd8dc';
        c.fillRect(10, 12, 11, 4);
        c.fillStyle = '#eceff1';
        c.fillRect(11, 12, 5, 2);
        // тёмные складки
        c.fillStyle = '#78909c';
        c.fillRect(13, 17, 6, 1);
        c.fillRect(8, 19, 4, 1);
        c.fillRect(20, 18, 3, 1);
    }
    // V11: Brick item
    else if (id === ITEMS.BRICK_ITEM) {
        c.fillStyle = '#b74b3d';
        c.fillRect(6, 12, 20, 10);
        c.fillStyle = '#8f3529';
        c.fillRect(6, 20, 20, 2);
        c.fillRect(24, 12, 2, 10);
        c.fillStyle = '#d26658';
        c.fillRect(6, 12, 20, 2);
        c.fillRect(6, 12, 2, 10);
        c.fillStyle = '#8f3529';
        c.fillRect(16, 12, 1, 10);
        c.fillRect(6, 16, 20, 1);
    }
    // V11: String — coiled white-grey thread
    else if (id === ITEMS.STRING) {
        // мотки нити, изогнутые линии
        c.fillStyle = '#e0e0e0';
        // несколько изогнутых нитей
        c.fillRect(6, 10, 4, 1); c.fillRect(10, 9, 4, 1); c.fillRect(14, 10, 4, 1);
        c.fillRect(18, 11, 4, 1); c.fillRect(22, 10, 4, 1);
        c.fillRect(7, 14, 4, 1); c.fillRect(11, 13, 4, 1); c.fillRect(15, 14, 4, 1);
        c.fillRect(19, 15, 4, 1); c.fillRect(23, 14, 3, 1);
        c.fillRect(6, 18, 4, 1); c.fillRect(10, 17, 4, 1); c.fillRect(14, 18, 4, 1);
        c.fillRect(18, 19, 4, 1); c.fillRect(22, 18, 4, 1);
        c.fillRect(7, 22, 4, 1); c.fillRect(11, 21, 4, 1); c.fillRect(15, 22, 4, 1);
        c.fillRect(19, 23, 4, 1); c.fillRect(23, 22, 3, 1);
        // блики
        c.fillStyle = '#ffffff';
        c.fillRect(7, 9, 2, 1); c.fillRect(15, 9, 2, 1); c.fillRect(11, 13, 2, 1);
        c.fillRect(19, 14, 2, 1); c.fillRect(7, 17, 2, 1); c.fillRect(23, 21, 2, 1);
        // тени
        c.fillStyle = '#9e9e9e';
        c.fillRect(8, 11, 2, 1); c.fillRect(20, 12, 2, 1); c.fillRect(12, 19, 2, 1);
    }
    // V11: Iron Nugget
    else if (id === ITEMS.IRON_NUGGET) {
        // мелкий серебристый кусочек
        c.fillStyle = '#9e9e9e';
        c.fillRect(11, 13, 10, 6);
        c.fillStyle = '#cfd8dc';
        c.fillRect(12, 14, 8, 4);
        c.fillStyle = '#eceff1';
        c.fillRect(13, 14, 5, 2);
        c.fillStyle = '#ffffff';
        c.fillRect(13, 14, 2, 1);
        c.fillStyle = '#757575';
        c.fillRect(11, 18, 10, 1);
        c.fillRect(11, 13, 1, 1); c.fillRect(20, 13, 1, 1);
    }
    // V11: Gold Nugget
    else if (id === ITEMS.GOLD_NUGGET) {
        // мелкий золотистый кусочек
        c.fillStyle = '#f57f17';
        c.fillRect(11, 13, 10, 6);
        c.fillStyle = '#ffca28';
        c.fillRect(12, 14, 8, 4);
        c.fillStyle = '#fff59d';
        c.fillRect(13, 14, 5, 2);
        c.fillStyle = '#ffffff';
        c.fillRect(13, 14, 2, 1);
        c.fillStyle = '#bf6f00';
        c.fillRect(11, 18, 10, 1);
        c.fillRect(11, 13, 1, 1); c.fillRect(20, 13, 1, 1);
    }
    // V11: Empty Bottle / Water Bottle
    else if (id === ITEMS.EMPTY_BOTTLE || id === ITEMS.WATER_BOTTLE) {
        // V11: бутылка — стеклянная с пробкой
        // Горлышко (верх)
        c.fillStyle = '#a4b3c4';
        c.fillRect(13, 6, 6, 2);     // ободок горлышка
        c.fillStyle = '#cfd8dc';
        c.fillRect(13, 8, 6, 2);     // горлышко
        // Тело бутылки (ниже)
        c.fillStyle = '#90a4ae';
        c.fillRect(10, 10, 12, 2);   // плечо
        c.fillRect(9, 12, 14, 14);   // корпус
        // Стеклянное заполнение / вода
        if (id === ITEMS.WATER_BOTTLE) {
            // вода внутри
            c.fillStyle = '#1976d2';
            c.fillRect(11, 13, 10, 12);
            c.fillStyle = '#42a5f5';
            c.fillRect(12, 14, 8, 10);
            // волна-блик
            c.fillStyle = '#90caf9';
            c.fillRect(12, 14, 8, 1);
            c.fillStyle = '#e3f2fd';
            c.fillRect(13, 15, 2, 1);
        } else {
            // пусто — полупрозрачный «воздух»
            c.fillStyle = '#cfd8dc';
            c.fillRect(11, 13, 10, 12);
            c.fillStyle = '#eceff1';
            c.fillRect(12, 14, 8, 10);
        }
        // Стеклянный блик-полоса (sheen)
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(11, 13, 1, 12);
        c.fillStyle = 'rgba(255,255,255,0.30)';
        c.fillRect(12, 14, 1, 9);
        // Контур
        c.fillStyle = '#3e2723';
        c.fillRect(13, 5, 6, 1);     // верх горлышка (пробка)
        c.fillStyle = '#5d4037';
        c.fillRect(14, 4, 4, 1);     // пробка-кнопка
        c.fillStyle = '#37474f';
        c.fillRect(9, 26, 14, 1);    // тёмный кант снизу
    }
    // V14: Dyes — small piles of coloured powder
    else if (id >= ITEMS.WHITE_DYE && id <= ITEMS.BLACK_DYE) {
        const dyeColors = {
            [ITEMS.WHITE_DYE]:      ['#fafafa', '#fff',    '#bdbdbd'],
            [ITEMS.ORANGE_DYE]:     ['#ef6c00', '#fb8c00', '#bf360c'],
            [ITEMS.MAGENTA_DYE]:    ['#c2185b', '#e91e63', '#880e4f'],
            [ITEMS.LIGHT_BLUE_DYE]: ['#4fc3f7', '#81d4fa', '#0288d1'],
            [ITEMS.YELLOW_DYE]:     ['#fbc02d', '#fdd835', '#f57f17'],
            [ITEMS.LIME_DYE]:       ['#7cb342', '#9ccc65', '#558b2f'],
            [ITEMS.PINK_DYE]:       ['#f48fb1', '#f8bbd0', '#ad1457'],
            [ITEMS.GRAY_DYE]:       ['#616161', '#9e9e9e', '#212121'],
            [ITEMS.LIGHT_GRAY_DYE]: ['#bdbdbd', '#eceff1', '#757575'],
            [ITEMS.CYAN_DYE]:       ['#0097a7', '#26c6da', '#006064'],
            [ITEMS.PURPLE_DYE]:     ['#6a1b9a', '#8e24aa', '#4a148c'],
            [ITEMS.BLUE_DYE]:       ['#1565c0', '#1976d2', '#0d47a1'],
            [ITEMS.BROWN_DYE]:      ['#5d4037', '#795548', '#3e2723'],
            [ITEMS.GREEN_DYE]:      ['#2e7d32', '#388e3c', '#1b5e20'],
            [ITEMS.RED_DYE]:        ['#c62828', '#e53935', '#b71c1c'],
            [ITEMS.BLACK_DYE]:      ['#212121', '#424242', '#000000'],
        };
        const cols = dyeColors[id];
        // Pile of dye powder — bottom of icon, rounded heap shape.
        c.fillStyle = cols[2];
        c.fillRect(8, 22, 16, 4);
        c.fillStyle = cols[0];
        c.fillRect(7, 18, 18, 5);
        c.fillRect(9, 16, 14, 3);
        c.fillRect(11, 14, 10, 3);
        c.fillStyle = cols[1];
        c.fillRect(9, 18, 14, 3);
        c.fillRect(11, 15, 10, 3);
        c.fillRect(13, 13, 6, 3);
        // Highlight grains
        c.fillStyle = '#ffffff';
        c.fillRect(13, 14, 2, 1);
        c.fillRect(17, 17, 1, 1);
        c.fillRect(10, 21, 1, 1);
        // Specks of darker color
        c.fillStyle = cols[2];
        c.fillRect(15, 20, 1, 1);
        c.fillRect(19, 21, 1, 1);
        c.fillRect(11, 18, 1, 1);
    }
    else if (id === ITEMS.MUSIC_DISC_NOSTALGIC || id === ITEMS.MUSIC_DISC_QUIRKY) {
        // V13: Music disc — vinyl record with a coloured center label.
        // Outer black disc (square approximation of a circle for pixel-art look)
        c.fillStyle = '#1b1b1b';
        c.fillRect(8, 6, 16, 20);
        c.fillRect(6, 8, 20, 16);
        c.fillRect(10, 4, 12, 24);
        // Slight glossy highlight (top-left)
        c.fillStyle = 'rgba(255,255,255,0.10)';
        c.fillRect(10, 6, 6, 2);
        c.fillRect(8, 8, 2, 4);
        // Grooves (darker concentric rings)
        c.fillStyle = '#000';
        c.fillRect(9, 10, 14, 1);
        c.fillRect(8, 15, 16, 1);
        c.fillRect(9, 20, 14, 1);
        // Center label — colour identifies the disc
        let labelMain, labelHi;
        if (id === ITEMS.MUSIC_DISC_NOSTALGIC) {
            labelMain = '#1565c0'; labelHi = '#42a5f5';
        } else {
            labelMain = '#e91e63'; labelHi = '#f48fb1';
        }
        c.fillStyle = labelMain;
        c.fillRect(12, 12, 8, 8);
        c.fillStyle = labelHi;
        c.fillRect(13, 13, 6, 2);
        // Center hole
        c.fillStyle = '#000';
        c.fillRect(15, 15, 2, 2);
        // Dark bottom edge for depth
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.fillRect(10, 26, 12, 1);
    }
    else if (isArmorItem(id)) {
        const slot = getArmorSlot(id);
        const pal  = getArmorPalette(id);
        if (slot === 'head')      drawArmorIconHelmet(c, pal);
        else if (slot === 'chest') drawArmorIconChest(c, pal);
        else if (slot === 'legs')  drawArmorIconBoots(c, pal);
    }
    // V16: Mob drops & new items
    else if (id === ITEMS.SPIDER_EYE) {
        // Spider Eye - Minecraft style
        c.fillStyle = '#3e1c24'; 
        c.fillRect(12, 12, 8, 8);
        c.fillRect(10, 14, 12, 4);
        c.fillRect(14, 10, 4, 12);
        
        c.fillStyle = '#8a2b3b'; 
        c.fillRect(12, 13, 8, 6);
        c.fillRect(11, 14, 10, 4);
        
        c.fillStyle = '#b74052'; 
        c.fillRect(12, 14, 6, 3);
        c.fillRect(13, 13, 4, 2);
        
        c.fillStyle = '#220f12'; 
        c.fillRect(15, 15, 2, 2);
        
        c.fillStyle = '#551520'; 
        c.fillRect(13, 16, 6, 2);
    }
    else if (id === ITEMS.ROTTEN_FLESH) {
        // Rotten Flesh - Minecraft style
        c.fillStyle = '#593d29'; 
        c.fillRect(10, 12, 12, 10);
        c.fillRect(8, 14, 16, 6);
        c.fillRect(12, 10, 8, 14);
        
        c.fillStyle = '#8c4e2e'; 
        c.fillRect(10, 14, 12, 6);
        c.fillRect(12, 12, 8, 10);
        
        c.fillStyle = '#b85e33'; 
        c.fillRect(12, 14, 4, 4);
        c.fillRect(14, 12, 4, 2);
        
        c.fillStyle = '#667828'; 
        c.fillRect(18, 14, 2, 4);
        c.fillRect(16, 16, 4, 2);
        c.fillRect(12, 18, 4, 2);
        
        c.fillStyle = '#4c5c24'; 
        c.fillRect(18, 16, 2, 2);
    }
    else if (id === ITEMS.BONE) {
        // White bone shape with rounded knobs
        c.fillStyle = '#eceff1';
        c.fillRect(8, 14, 16, 4);
        // Knobs on each end
        c.fillRect(6, 11, 5, 4);
        c.fillRect(6, 17, 5, 4);
        c.fillRect(21, 11, 5, 4);
        c.fillRect(21, 17, 5, 4);
        // Shadow under bone
        c.fillStyle = '#b0bec5';
        c.fillRect(8, 17, 16, 1);
        c.fillRect(6, 14, 5, 1);
        c.fillRect(6, 20, 5, 1);
        c.fillRect(21, 14, 5, 1);
        c.fillRect(21, 20, 5, 1);
        // Highlights
        c.fillStyle = '#ffffff';
        c.fillRect(9, 15, 4, 1);
        c.fillRect(7, 12, 2, 1);
        c.fillRect(22, 12, 2, 1);
    }
    else if (id === ITEMS.BONE_MEAL) {
        // Pile of pale white powder
        c.fillStyle = '#bdbdbd';
        c.fillRect(8, 22, 16, 4);
        c.fillStyle = '#eceff1';
        c.fillRect(7, 18, 18, 5);
        c.fillRect(9, 16, 14, 3);
        c.fillRect(11, 14, 10, 3);
        c.fillStyle = '#ffffff';
        c.fillRect(9, 18, 14, 3);
        c.fillRect(11, 15, 10, 3);
        c.fillRect(13, 13, 6, 3);
        // Sparkle
        c.fillStyle = '#fff59d';
        c.fillRect(13, 14, 2, 1);
        c.fillRect(17, 17, 1, 1);
    }
    else if (id === ITEMS.BOW) {
        // Bow - Minecraft pixel style
        c.fillStyle = '#331f0f'; 
        c.fillRect(12, 4, 4, 4);
        c.fillRect(16, 6, 4, 4);
        c.fillRect(20, 10, 4, 4);
        c.fillRect(22, 14, 4, 4);
        c.fillRect(20, 18, 4, 4);
        c.fillRect(16, 22, 4, 4);
        c.fillRect(12, 24, 4, 4);
        
        c.fillStyle = '#7a5127'; 
        c.fillRect(14, 6, 2, 2);
        c.fillRect(18, 8, 2, 2);
        c.fillRect(20, 12, 2, 8);
        c.fillRect(18, 22, 2, 2);
        c.fillRect(14, 24, 2, 2);
        
        c.fillStyle = '#2b1b0d';
        c.fillRect(20, 14, 2, 4);
        
        c.fillStyle = '#e8e8e8';
        c.fillRect(12, 8, 2, 16);
    }
    else if (id === ITEMS.ARROW) {
        // Diagonal arrow
        c.save();
        c.translate(16, 16);
        c.rotate(-Math.PI / 4);
        // shaft
        c.fillStyle = '#8d6e63';
        c.fillRect(-12, -1, 24, 2);
        c.fillStyle = '#5d4037';
        c.fillRect(-12, 0, 24, 1);
        // tip
        c.fillStyle = '#cfd8dc';
        c.beginPath();
        c.moveTo(14, 0); c.lineTo(10, -4); c.lineTo(10, 4); c.closePath();
        c.fill();
        c.fillStyle = '#eceff1';
        c.fillRect(10, -1, 3, 1);
        // fletching
        c.fillStyle = '#fafafa';
        c.fillRect(-12, -4, 4, 3);
        c.fillRect(-12, 1, 4, 3);
        c.fillStyle = '#bdbdbd';
        c.fillRect(-12, -4, 1, 3);
        c.fillRect(-12, 1, 1, 3);
        c.restore();
    }
    else if (id === ITEMS.ENDER_PEARL) {
        // Ender Pearl - Minecraft style
        c.fillStyle = '#0f2621'; 
        c.beginPath(); c.arc(16, 16, 10, 0, Math.PI * 2); c.fill();
        
        c.fillStyle = '#113c32'; 
        c.beginPath(); c.arc(16, 16, 8, 0, Math.PI * 2); c.fill();
        
        c.fillStyle = '#166155'; 
        c.beginPath(); c.arc(15, 15, 6, 0, Math.PI * 2); c.fill();
        
        c.fillStyle = '#1d8f81'; 
        c.beginPath(); c.arc(14, 14, 4, 0, Math.PI * 2); c.fill();
        
        c.fillStyle = '#39c6b6'; 
        c.beginPath(); c.arc(13, 13, 2, 0, Math.PI * 2); c.fill();
        
        c.fillStyle = '#ffffff';
        c.fillRect(11, 11, 2, 2);
        
        c.fillStyle = '#0a1d1a';
        c.fillRect(18, 18, 2, 2);
        c.fillRect(12, 18, 2, 2);
    }
    else drawBlock(c, 0, 0, id);
}

// =========================================================
// V12: Procedural shape drawers for stateful blocks
// These draw into the *local* coordinate frame of c (i.e. center is 0,0),
// because drawBlock() pre-translates to the tile centre before calling them.
// =========================================================

// Wooden door — drawn into local frame ([-sz/2,-sz/2] to [sz/2, sz/2]).
// state='closed' → narrow strip (the door seen edge-on, handle visible)
// state='open'   → wide rectangle (door swung flush, handle on side)
// half='top'|'bottom' picks the upper or lower visual slice.
function drawDoorHalf(c, sz, state, half) {
    const u = sz / 32; // pixel unit relative to 32px reference
    const tx = -sz / 2, ty = -sz / 2;
    if (state === 'closed') {
        // Thin vertical strip at the centre. ~6 px wide.
        const stripW = 6 * u;
        const sxs = -stripW / 2;
        c.fillStyle = '#a67d53'; c.fillRect(sxs, ty, stripW, sz);
        c.fillStyle = '#bc9062'; c.fillRect(sxs, ty, 1 * u, sz);   // блик слева
        c.fillStyle = '#8f6841'; c.fillRect(sxs + stripW - 1 * u, ty, 1 * u, sz); // тень справа
        // Горизонтальный шов на нижней половине = граница между tile.
        if (half === 'bottom') {
            c.fillStyle = '#5c4125';
            c.fillRect(sxs, ty + 1 * u, stripW, 1 * u);
        } else {
            c.fillStyle = '#5c4125';
            c.fillRect(sxs, ty + sz - 2 * u, stripW, 1 * u);
        }
        // Ручка торчит ВНУТРЬ (наружу от центра) — рисуем небольшой выступ слева.
        // Для bottom-half ручка по центру высоты половинки.
        if (half === 'bottom') {
            // Ручка на верхушке нижней половины (там, где у обычной двери)
            c.fillStyle = '#5c4125';
            c.fillRect(sxs - 2 * u, ty + 4 * u, 2 * u, 2 * u);
            c.fillStyle = '#ffd54f';
            c.fillRect(sxs - 2 * u, ty + 4 * u, 2 * u, 1 * u);
        }
    } else {
        // Open: full-tile wide door, handle visible to the right.
        c.fillStyle = '#a67d53'; c.fillRect(tx + 2 * u, ty, sz - 4 * u, sz);
        c.fillStyle = '#bc9062';
        c.fillRect(tx + 4 * u, ty + 2 * u, sz - 8 * u, (sz / 2) - 3 * u);
        c.fillRect(tx + 4 * u, ty + (sz / 2) + 1 * u, sz - 8 * u, (sz / 2) - 3 * u);
        c.fillStyle = '#8f6841';
        c.fillRect(tx + 2 * u, ty, 1 * u, sz);
        c.fillRect(tx + sz - 3 * u, ty, 1 * u, sz);
        // На bottom-half — нижняя кромка чуть темнее; на top-half — верхняя
        c.fillStyle = '#5c4125';
        c.fillRect(tx + 2 * u, ty + sz - 1 * u, sz - 4 * u, 1 * u);
        c.fillRect(tx + 2 * u, ty, sz - 4 * u, 1 * u);
        // Ручка только в нижней половине.
        if (half === 'bottom') {
            c.fillStyle = '#5c4125';
            c.fillRect(tx + sz - 7 * u, ty + 4 * u, 2 * u, 3 * u);
            c.fillStyle = '#ffd54f';
            c.fillRect(tx + sz - 7 * u, ty + 4 * u, 2 * u, 1 * u);
        }
    }
}

// Wooden trapdoor.
// state='closed' → thin horizontal strip on the top of the tile (solid floor)
// state='open'   → full-tile grate (4 holes, no collision visually)
function drawTrapdoorShape(c, sz, state) {
    const u = sz / 32;
    const tx = -sz / 2, ty = -sz / 2;
    if (state === 'closed') {
        const stripH = 6 * u;
        c.fillStyle = '#a67d53'; c.fillRect(tx, ty, sz, stripH);
        c.fillStyle = '#bc9062'; c.fillRect(tx, ty, sz, 1 * u);
        c.fillStyle = '#8f6841'; c.fillRect(tx, ty + stripH - 1 * u, sz, 1 * u);
        // Доски (3 шва)
        c.fillStyle = '#5c4125';
        c.fillRect(tx + 11 * u, ty, 1 * u, stripH);
        c.fillRect(tx + 22 * u, ty, 1 * u, stripH);
        // Петли по краям
        c.fillStyle = '#616161';
        c.fillRect(tx + 2 * u, ty + 1 * u, 4 * u, 4 * u);
        c.fillRect(tx + sz - 6 * u, ty + 1 * u, 4 * u, 4 * u);
        c.fillStyle = '#9e9e9e';
        c.fillRect(tx + 3 * u, ty + 2 * u, 2 * u, 1 * u);
        c.fillRect(tx + sz - 5 * u, ty + 2 * u, 2 * u, 1 * u);
    } else {
        // Open = grate: thin wooden frame with 4 holes inside.
        c.fillStyle = '#a67d53'; c.fillRect(tx, ty, sz, sz);
        c.fillStyle = '#5c4125';
        // 2x2 holes
        const hx1 = tx + 6 * u, hx2 = tx + 18 * u;
        const hy1 = ty + 6 * u, hy2 = ty + 18 * u;
        const hw = 8 * u;
        c.fillRect(hx1, hy1, hw, hw);
        c.fillRect(hx2, hy1, hw, hw);
        c.fillRect(hx1, hy2, hw, hw);
        c.fillRect(hx2, hy2, hw, hw);
        // Светлая внутренняя кромка отверстий (объём)
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(hx1, hy1, hw, 1 * u);
        c.fillRect(hx2, hy1, hw, 1 * u);
        c.fillRect(hx1, hy2, hw, 1 * u);
        c.fillRect(hx2, hy2, hw, 1 * u);
        c.fillStyle = 'rgba(255,255,255,0.15)';
        c.fillRect(hx1, hy1 + hw - 1 * u, hw, 1 * u);
        c.fillRect(hx2, hy1 + hw - 1 * u, hw, 1 * u);
        c.fillRect(hx1, hy2 + hw - 1 * u, hw, 1 * u);
        c.fillRect(hx2, hy2 + hw - 1 * u, hw, 1 * u);
        // Обрамление полотна
        c.fillStyle = '#bc9062';
        c.fillRect(tx, ty, sz, 1 * u);
        c.fillRect(tx, ty, 1 * u, sz);
        c.fillStyle = '#8f6841';
        c.fillRect(tx, ty + sz - 1 * u, sz, 1 * u);
        c.fillRect(tx + sz - 1 * u, ty, 1 * u, sz);
    }
}

// Lever — canonical floor mount (stick rising up). Tilts left/right based on state.
function drawLeverShape(c, sz, state) {
    const u = sz / 32;
    const tx = -sz / 2, ty = -sz / 2;
    // Базовая плита-булыжник у основания
    c.fillStyle = '#7a7a7a';
    c.fillRect(tx + 10 * u, ty + sz - 6 * u, 12 * u, 6 * u);
    c.fillStyle = '#5a5a5a';
    c.fillRect(tx + 10 * u, ty + sz - 6 * u, 12 * u, 1 * u);
    c.fillStyle = '#3e3e3e';
    c.fillRect(tx + 10 * u, ty + sz - 1 * u, 12 * u, 1 * u);
    // Палочка-рычаг — наклоняем влево (off) или вправо (on).
    c.save();
    // Поворачиваем вокруг основания, точка ~ (0, sz/2 - 6u)
    c.translate(0, ty + sz - 6 * u);
    const tiltDeg = state === 'on' ? 35 : -35;
    c.rotate(tiltDeg * Math.PI / 180);
    // Рисуем стержень снизу вверх.
    c.fillStyle = '#a67d53';
    c.fillRect(-1 * u, -14 * u, 2 * u, 14 * u);
    c.fillStyle = '#8f6841';
    c.fillRect(-1 * u, -14 * u, 1 * u, 14 * u);
    // Шарик навершия
    c.fillStyle = '#bc9062';
    c.fillRect(-3 * u, -18 * u, 6 * u, 5 * u);
    c.fillStyle = '#a67d53';
    c.fillRect(-3 * u, -14 * u, 6 * u, 1 * u);
    c.fillStyle = state === 'on' ? '#ffeb3b' : 'rgba(255,255,255,0.4)';
    c.fillRect(-2 * u, -17 * u, 2 * u, 1 * u);
    c.restore();
}

// ---------------- TEXTURE CACHE ----------------
// Генерируем текстуры блоков один раз в off-screen canvas,
// потом переиспользуем через drawImage (значительно быстрее fillRect х100 каждый кадр).
const TILE_CACHE = {};
function psr(seed) {
    // простой детерминированный псевдо-рандом
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s & 0xffff) / 0xffff;
    };
}
function buildTile(id) {
    const sz = TILE_SIZE;
    const off = document.createElement('canvas');
    off.width = sz; off.height = sz;
    const c = off.getContext('2d');
    c.imageSmoothingEnabled = false;

    const b = BLOCKS[id];
    const rnd = psr(id * 1337 + 7);

    // --- факел: прозрачный фон, рисуем отдельно (более детальный) ---
    if (id === B.TORCH_PLACED) {
        // палочка
        c.fillStyle = '#6d4c41'; c.fillRect(14, 14, 4, 18);
        c.fillStyle = '#5d3c2e'; c.fillRect(14, 14, 1, 18);
        c.fillStyle = '#8d6e63'; c.fillRect(17, 14, 1, 18);
        // пламя — статический базис (динамический блик добавим в drawBlock)
        c.fillStyle = '#c62828'; c.fillRect(12, 6, 8, 8);
        c.fillStyle = '#ff9800'; c.fillRect(13, 6, 6, 7);
        c.fillStyle = '#ffeb3b'; c.fillRect(14, 7, 4, 5);
        c.fillStyle = '#fff9c4'; c.fillRect(15, 8, 2, 3);
        return off;
    }

    // V7: статическая иконка жидкости для тех мест, где всё-таки понадобится кэш
    // (обычно в игре жидкости идут через drawLiquidBlock напрямую)
    if (b && b.liquid) {
        if (b.liquid === 'water') {
            c.fillStyle = '#1565c0'; c.fillRect(0, 0, sz, sz);
            c.fillStyle = '#42a5f5'; c.fillRect(0, 0, sz, 3);
            c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(4, 1, 6, 1); c.fillRect(18, 1, 5, 1);
        } else {
            c.fillStyle = '#bf360c'; c.fillRect(0, 0, sz, sz);
            c.fillStyle = '#ffb300'; c.fillRect(0, 0, sz, 3);
            c.fillStyle = '#fff59d'; c.fillRect(10, 1, 3, 1);
        }
        return off;
    }

    // Базовый цвет
    c.fillStyle = b.color || '#000';
    c.fillRect(0, 0, sz, sz);

    // --- Специальные узоры ---
    if (WOOL_GROUP.includes(id)) {
        // V16: Пушистая текстура шерсти
        c.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.5) c.fillRect(x, y, 2, 2);
            }
        }
        c.fillStyle = 'rgba(0, 0, 0, 0.1)';
        for (let x = 1; x < sz; x += 2) {
            for (let y = 1; y < sz; y += 2) {
                if (rnd() > 0.5) c.fillRect(x, y, 2, 2);
            }
        }
    } else if (id === B.DIRT || id === B.GRASS) {
        // Заливаем базовым цветом земли, чтобы зелёный цвет B.GRASS не просвечивал
        c.fillStyle = '#5d4037';
        c.fillRect(0, 0, sz, sz);

        // V8.2: чистая текстура земли (одинаковая для DIRT и GRASS).
        const tones = ['#5d4037', '#4e342e', '#6d4c41', '#3e2723', '#795548'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.3) {
                    c.fillStyle = tones[(rnd() * tones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // мелкие камешки в земле
        c.fillStyle = '#3e2723';
        for (let i = 0; i < 8; i++) {
            c.fillRect((rnd() * sz) | 0, 8 + ((rnd() * (sz - 8)) | 0), 2, 2);
        }
        c.fillStyle = '#8d6e63';
        for (let i = 0; i < 4; i++) {
            c.fillRect((rnd() * sz) | 0, 10 + ((rnd() * (sz - 12)) | 0), 1, 1);
        }
        c.fillStyle = 'rgba(0,0,0,0.22)';
        for (let i = 0; i < 12; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }

        // --- V8.2: GRASS = та же грязь, но сверху тонкая полоска травы ---
        // Улучшенная текстура дёрна (в стиле Minecraft) со свисающей травой
        if (id === B.GRASS) {
            c.fillStyle = '#4caf50';      // основной зелёный
            c.fillRect(0, 0, sz, 6);      // сплошной зелёный верх
            c.fillStyle = '#66bb6a';      // светлая полоса (блик солнца)
            c.fillRect(0, 0, sz, 2);

            // Свисающая трава по бокам (jagged edges)
            for (let x = 0; x < sz; x += 2) {
                // Длина травы: 6, 8, 10 или 12 пикселей
                let length = 6 + ((rnd() * 4) | 0) * 2; 
                
                c.fillStyle = '#4caf50';
                c.fillRect(x, 6, 2, length - 6);
                
                // Тёмно-зелёная кромка на конце свисающей травинки
                c.fillStyle = '#388e3c';
                c.fillRect(x, length - 2, 2, 2);
            }
            
            // Текстурный шум (пятнышки травы) для разнообразия
            for (let i = 0; i < 20; i++) {
                c.fillStyle = rnd() > 0.5 ? '#388e3c' : '#81c784';
                let tx = ((rnd() * (sz / 2)) | 0) * 2;
                let ty = ((rnd() * 3) | 0) * 2;
                c.fillRect(tx, ty, 2, 2);
            }
        }
    } else if (id === B.WOOD) {
        // Minecraft Oak Log (Bark texture)
        c.fillStyle = '#3f2b1d'; c.fillRect(0, 0, sz, sz);
        const barkTones = ['#4e3624', '#593d29', '#372418', '#63442d'];
        for (let x = 0; x < sz; x += 4) {
            for (let y = 0; y < sz; y += 4) {
                c.fillStyle = barkTones[(rnd() * barkTones.length) | 0];
                c.fillRect(x, y, 4, 8 + (rnd() * 8) | 0);
            }
        }
        c.fillStyle = '#2b1d14';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, 0, 2, sz);
        }
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.fillRect(0, 0, 2, sz);
    } else if (id === B.PLANK) {
        // Minecraft Oak Planks
        c.fillStyle = '#a67d53'; c.fillRect(0, 0, sz, sz);
        const boardH = sz / 4;
        for (let i = 0; i < 4; i++) {
            c.fillStyle = (i % 2 === 0) ? '#9c734b' : '#a67d53';
            c.fillRect(0, i * boardH, sz, boardH);
            c.fillStyle = '#8f6841';
            for (let j = 0; j < 8; j++) {
                c.fillRect((rnd() * sz) | 0, i * boardH + (rnd() * boardH) | 0, 6 + (rnd() * 8) | 0, 2);
            }
            // Тёмный шов между досками — рисуем только для внутренних досок
            // (i>0), иначе верхний край самого тайла становится тёмной полосой
            // и образует чёткую горизонтальную сетку, когда доски стоят стопкой.
            if (i > 0) {
                c.fillStyle = '#5c4125';
                c.fillRect(0, i * boardH, sz, 2);
            }
            c.fillStyle = '#bc9062';
            c.fillRect(0, i * boardH + 2, sz, 2);
            c.fillStyle = '#3f2b1d';
            c.fillRect(2 + (rnd() * 4) | 0, i * boardH + 4, 2, 2);
            c.fillRect(sz - 6 - (rnd() * 4) | 0, i * boardH + boardH - 4, 2, 2);
        }
    } else if (id === B.STONE || id === B.COAL_ORE || id === B.IRON_ORE ||
        id === B.GOLD_ORE || id === B.DIAMOND_ORE) {
        // Minecraft Style Stone
        c.fillStyle = '#7d7d7d'; c.fillRect(0, 0, sz, sz);
        const stoneTones = ['#6a6a6a', '#757575', '#8a8a8a', '#5f5f5f'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.4) {
                    c.fillStyle = stoneTones[(rnd() * stoneTones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // Ores
        if (id !== B.STONE) {
            let oreColor, oreBright, oreShadow;
            if (id === B.COAL_ORE) { oreColor = '#1a1a1a'; oreBright = '#444444'; oreShadow = '#000000'; }
            if (id === B.IRON_ORE) { oreColor = '#dfa58f'; oreBright = '#ffebdb'; oreShadow = '#825a4d'; }
            if (id === B.GOLD_ORE) { oreColor = '#fcee4b'; oreBright = '#ffffff'; oreShadow = '#b8860b'; }
            if (id === B.DIAMOND_ORE) { oreColor = '#5decf5'; oreBright = '#cafffc'; oreShadow = '#1b979e'; }

            // Classic Minecraft ore pixel pattern (16x16 mask mapped to 32x32)
            const oreMask = [
                "0000000000000000",
                "0000000000000000",
                "0000000000322000",
                "0000000000003210",
                "0000000000000000",
                "0013000000000000",
                "0000210000130000",
                "0002100001213000",
                "0000310000121100",
                "0000000000011300",
                "0130031000000000",
                "0021121000000130",
                "0001300000032100",
                "0000000000011300",
                "0000000000003000",
                "0000000000000000"
            ];

            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const type = oreMask[y][x];
                    if (type !== '0') {
                        if (type === '1') c.fillStyle = oreColor;
                        else if (type === '2') c.fillStyle = oreBright;
                        else if (type === '3') c.fillStyle = oreShadow;
                        
                        c.fillRect(x * 2, y * 2, 2, 2);
                    }
                }
            }
        }
    } else if (id === B.TNT) {
        // Red base
        c.fillStyle = '#d32f2f'; c.fillRect(0, 0, sz, sz);
        // Vertical black bands
        c.fillStyle = '#111';
        c.fillRect(8, 0, 2, sz);
        c.fillRect(sz - 10, 0, 2, sz);
        // White center stripe
        c.fillStyle = '#f5f5f5';
        c.fillRect(0, 10, sz, 12);
        // "TNT" text
        c.fillStyle = '#000';
        c.font = '10px VT323, monospace';
        c.fillText('TNT', 8, 20);
    } else if (id === B.FIRE) {
        c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#ff9800'; c.fillRect(10, 16, 12, 16);
        c.fillStyle = '#ff5722'; c.fillRect(12, 12, 8, 16);
        c.fillStyle = '#ffeb3b'; c.fillRect(14, 18, 4, 10);
    } else if (id === B.SAND) {
        // V9: Песок — тёплые бежевые тона с мелкими точками-песчинками
        c.fillStyle = '#e8d9a0'; c.fillRect(0, 0, sz, sz);
        // Тональные пятна (светлые/тёмные участки)
        const sandTones = ['#f0e4b0', '#dccf90', '#d4c788', '#eadda0', '#c9bb78'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.35) {
                    c.fillStyle = sandTones[(rnd() * sandTones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // Мелкие тёмные песчинки
        c.fillStyle = '#b8a870';
        for (let i = 0; i < 12; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
        // Светлые блики
        c.fillStyle = '#f5ecc5';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
    } else if (id === B.GRAVEL) {
        // V9: Гравий — серая основа с разноцветными камешками
        c.fillStyle = '#7a7a7a'; c.fillRect(0, 0, sz, sz);
        // Крупные камешки разных оттенков
        const gravelTones = ['#6b6b6b', '#8a8a8a', '#5c5c5c', '#999', '#707070', '#848484'];
        for (let i = 0; i < 16; i++) {
            c.fillStyle = gravelTones[(rnd() * gravelTones.length) | 0];
            const gx = (rnd() * (sz - 4)) | 0;
            const gy = (rnd() * (sz - 4)) | 0;
            const gw = 2 + ((rnd() * 3) | 0);
            const gh = 2 + ((rnd() * 3) | 0);
            c.fillRect(gx, gy, gw, gh);
        }
        // Тёмные щели между камнями
        c.fillStyle = '#4a4a4a';
        for (let i = 0; i < 8; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1 + ((rnd() * 2) | 0), 1);
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1 + ((rnd() * 2) | 0));
        }
        // Светлые блики на камешках
        c.fillStyle = '#a0a0a0';
        for (let i = 0; i < 5; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
    } else if (id === B.BEDROCK) {
        c.fillStyle = '#212121'; 
        c.fillRect(0, 0, sz, sz);
        const p = sz / 16;
        const colors = ['#111111', '#000000', '#333333', '#424242', '#212121', '#555555'];
        const weights = [4, 4, 3, 2, 8, 1];
        const palette = [];
        colors.forEach((col, idx) => {
            for(let i=0; i<weights[idx]; i++) palette.push(col);
        });
        
        for (let bx = 0; bx < 16; bx++) {
            for (let by = 0; by < 16; by++) {
                const col = palette[(rnd() * palette.length) | 0];
                if (col !== '#212121') {
                    c.fillStyle = col;
                    c.fillRect(bx * p, by * p, p, p);
                }
            }
        }
    } else if (id === B.BED) {
        c.clearRect(0, 0, sz, sz);
        c.fillStyle = '#5d4037';
        c.fillRect(2, 20, 4, 12);
        c.fillRect(26, 20, 4, 12);
        c.fillStyle = '#8d6e63';
        c.fillRect(0, 16, sz, 6);
        c.fillStyle = '#e53935';
        c.fillRect(0, 8, sz - 10, 8);
        c.fillStyle = '#c62828';
        c.fillRect(0, 12, sz - 10, 4);
        c.fillStyle = '#ffffff';
        c.fillRect(sz - 12, 10, 12, 6);
        c.fillStyle = '#eeeeee';
        c.fillRect(sz - 12, 14, 12, 2);
    } else if (id === B.LEAF) {
        // Minecraft style leaves
        c.clearRect(0, 0, sz, sz);
        c.fillStyle = '#2e7d32'; c.fillRect(0, 0, sz, sz);
        const tones = ['#1b5e20', '#388e3c', '#206524', '#43a047', '#114a14'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                let r = rnd();
                if (r > 0.85) {
                    c.clearRect(x, y, 2, 2);
                } else {
                    c.fillStyle = tones[(r * tones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
    } else if (id === B.BRICK) {
        c.fillStyle = '#8d3e2b'; c.fillRect(0, 0, sz, sz);
        // ряды кирпичей
        c.fillStyle = '#a64e35';
        c.fillRect(1, 1, 14, 7);
        c.fillRect(17, 1, 14, 7);
        c.fillRect(1, 9, 6, 6);
        c.fillRect(9, 9, 14, 6);
        c.fillRect(25, 9, 6, 6);
        c.fillRect(1, 16, 14, 7);
        c.fillRect(17, 16, 14, 7);
        c.fillRect(1, 24, 6, 7);
        c.fillRect(9, 24, 14, 7);
        c.fillRect(25, 24, 6, 7);
        // блики/шум
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.fillRect(2, 2, 4, 1);
        c.fillRect(18, 2, 4, 1);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(2, 7, 12, 1);
        c.fillRect(18, 7, 12, 1);
    } else if (id === B.CHEST) {
        // Minecraft style chest
        c.fillStyle = '#946031'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#a8713d'; c.fillRect(2, 2, sz-4, 8); // Top lid
        c.fillStyle = '#835227'; c.fillRect(2, 12, sz-4, sz-14); // Bottom body
        c.fillStyle = '#6d421d';
        for (let i = 0; i < 8; i++) {
            c.fillRect(2 + (rnd()*(sz-8))|0, 2 + (rnd()*8)|0, 4+(rnd()*6)|0, 1);
            c.fillRect(2 + (rnd()*(sz-8))|0, 12 + (rnd()*(sz-14))|0, 4+(rnd()*6)|0, 1);
        }
        c.fillStyle = '#261705';
        c.fillRect(0, 0, sz, 2); c.fillRect(0, sz-2, sz, 2);
        c.fillRect(0, 0, 2, sz); c.fillRect(sz-2, 0, 2, sz);
        c.fillRect(0, 10, sz, 2); // Lid separation
        c.fillRect(14, 7, 4, 6); // Lock border
        c.fillStyle = '#a8a8a8'; c.fillRect(15, 8, 2, 4); // Silver lock
        c.fillStyle = '#d1d1d1'; c.fillRect(15, 8, 1, 1); // Highlight
    } else if (id === B.WORKBENCH) {
        // Minecraft Crafting Table (side view)
        c.fillStyle = '#7a5a3a'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#a67d53'; c.fillRect(0, 0, sz, 8); // Top edge
        c.fillStyle = '#8f6841'; c.fillRect(0, 8, sz, 2);
        c.fillStyle = '#5c4125';
        for (let i = 1; i <= 3; i++) {
            c.fillRect(i * 8 - 1, 0, 2, 8);
        }
        c.fillStyle = '#835227'; c.fillRect(0, 10, sz, sz-10); // Body
        c.fillStyle = '#5c391a'; 
        c.fillRect(0, 18, sz, 2); c.fillRect(sz/2 - 1, 10, 2, sz-10);
        // Saw/scissors
        c.fillStyle = '#9e9e9e'; c.fillRect(sz/2 + 4, 12, 6, 4);
        c.fillStyle = '#5c4125'; c.fillRect(sz/2 + 10, 14, 4, 2);
        c.fillStyle = '#424242'; c.fillRect(sz/2 + 4, 16, 6, 2);
        // Hammer
        c.fillStyle = '#5c4125'; c.fillRect(6, 12, 2, 8);
        c.fillStyle = '#9e9e9e'; c.fillRect(4, 10, 6, 4);
        c.fillStyle = '#424242'; c.fillRect(6, 11, 2, 2);
    } else if (id === B.FURNACE) {
        // Minecraft Furnace
        c.fillStyle = '#7d7d7d'; c.fillRect(0, 0, sz, sz);
        const furTones = ['#6a6a6a', '#757575', '#8a8a8a', '#5f5f5f'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.3) {
                    c.fillStyle = furTones[(rnd() * furTones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        c.fillStyle = '#5a5a5a'; 
        c.fillRect(0, 0, sz, 4); c.fillRect(0, sz-4, sz, 4);
        c.fillRect(0, 0, 4, sz); c.fillRect(sz-4, 0, 4, sz);
        c.fillStyle = '#222222'; c.fillRect(6, sz/2 - 2, sz-12, sz/2 - 2);
        c.fillStyle = '#111111'; c.fillRect(8, sz/2, sz-16, sz/2 - 6);
        c.fillStyle = '#333333'; c.fillRect(6, sz/2 + 6, sz-12, 2);
        c.fillStyle = '#c62828'; c.fillRect(10, sz/2 + 2, sz-20, sz/2 - 8);
        c.fillStyle = '#ff6f00'; c.fillRect(12, sz/2 + 4, sz-24, sz/2 - 10);
        c.fillStyle = '#ffb300'; c.fillRect(14, sz/2 + 6, sz-28, sz/2 - 12);
    } else if (id === B.OBSIDIAN) {
        // Улучшенная текстура обсидиана (глубокая, детализированная и темная)
        c.fillStyle = '#0a050f'; c.fillRect(0, 0, sz, sz);
        const obsTones = ['#07030b', '#11081a', '#170b24', '#1e0f2e', '#0d0614'];
        
        // Слоистая структура обсидиана (эффект застывшего вулканического стекла)
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.15) {
                    c.fillStyle = obsTones[(rnd() * obsTones.length) | 0];
                    // Рисуем прямоугольники разного размера для эффекта острых сколов
                    c.fillRect(x, y, 2 + ((rnd()*4)|0), 2 + ((rnd()*4)|0));
                }
            }
        }
        
        // Острые грани и мистические отблески (фиолетовые и синие оттенки)
        for (let i = 0; i < 35; i++) {
            c.fillStyle = 'rgba(85, 45, 125, 0.45)'; // более выраженный фиолетовый блик
            c.fillRect(((rnd() * (sz/2)) | 0) * 2, ((rnd() * (sz/2)) | 0) * 2, 2 + ((rnd()*2)|0), 1);
            
            c.fillStyle = 'rgba(20, 10, 30, 0.85)'; // глубокие темные сколы
            c.fillRect(((rnd() * (sz/2)) | 0) * 2, ((rnd() * (sz/2)) | 0) * 2, 1, 2 + ((rnd()*6)|0));
        }
        
        // Объемная рамка блока, создающая ощущение цельности камня
        c.fillStyle = 'rgba(255, 255, 255, 0.07)';
        c.fillRect(0, 0, sz, 1);
        c.fillRect(0, 0, 1, sz);
        c.fillStyle = 'rgba(0, 0, 0, 0.7)';
        c.fillRect(0, sz-2, sz, 2);
        c.fillRect(sz-2, 0, 2, sz);
        c.fillStyle = 'rgba(0, 0, 0, 0.5)';
        c.fillRect(1, sz-3, sz-2, 1);
        c.fillRect(sz-3, 1, 1, sz-2);
    } else if (id === B.COAL_BLOCK) {
        c.fillStyle = '#222'; c.fillRect(0, 0, sz, sz);
        // куски угля
        c.fillStyle = '#0a0a0a';
        c.fillRect(3, 3, 8, 8);
        c.fillRect(16, 5, 10, 7);
        c.fillRect(5, 17, 9, 8);
        c.fillRect(19, 20, 8, 8);
        // блики
        c.fillStyle = '#3a3a3a';
        c.fillRect(4, 4, 3, 1);
        c.fillRect(17, 6, 3, 1);
        c.fillRect(6, 18, 3, 1);
        c.fillRect(20, 21, 3, 1);
    } else if (id === B.IRON_BLOCK) {
        c.fillStyle = '#d7ccc8'; c.fillRect(0, 0, sz, sz);
        // структура — плитка
        c.fillStyle = '#bfb9b5';
        c.fillRect(0, 0, sz, 2);
        c.fillRect(0, sz / 2, sz, 2);
        c.fillRect(0, 0, 2, sz);
        c.fillRect(sz / 2, 0, 2, sz);
        // блики
        c.fillStyle = '#f5f5f5';
        c.fillRect(4, 4, 6, 2); c.fillRect(20, 20, 6, 2);
    } else if (id === B.GOLD_BLOCK) {
        c.fillStyle = '#fdd835'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#c9a400';
        c.fillRect(0, 0, sz, 2); c.fillRect(0, sz - 2, sz, 2);
        c.fillRect(0, 0, 2, sz); c.fillRect(sz - 2, 0, 2, sz);
        c.fillStyle = '#fff176';
        c.fillRect(4, 4, 8, 3); c.fillRect(20, 22, 6, 2);
    } else if (id === B.DIAMOND_BLOCK) {
        c.fillStyle = '#4dd0e1'; c.fillRect(0, 0, sz, sz);
        // грани кристалла
        c.fillStyle = '#26c6da';
        c.fillRect(0, 0, sz, 3); c.fillRect(0, sz - 3, sz, 3);
        c.fillStyle = '#80deea';
        c.fillRect(4, 4, 8, 4); c.fillRect(22, 22, 6, 4);
        c.fillStyle = '#ffffff';
        c.fillRect(6, 5, 2, 1); c.fillRect(23, 23, 2, 1);
    } else if (id === B.FARMLAND) {
        // V8: вспаханная земля — ПОЛОСЫ ВЕРТИКАЛЬНЫЕ (как след от мотыги, который тянут вперёд).
        // База — тёмная влажная земля.
        c.fillStyle = '#3e2723';
        c.fillRect(0, 0, sz, sz);

        // Чередующиеся вертикальные борозды и гребни (4 пары по всей ширине 32px).
        // 8 колонок по 4px: [гребень][борозда][гребень][борозда]...
        for (let col = 0; col < 8; col++) {
            const x = col * 4;
            if (col % 2 === 0) {
                // ГРЕБЕНЬ — более светлая вспученная земля
                c.fillStyle = '#6d4c41';
                c.fillRect(x, 0, 4, sz);
                // блик на гребне
                c.fillStyle = '#8d6e63';
                c.fillRect(x + 1, 0, 1, sz);
            } else {
                // БОРОЗДА — влажная, тёмная полоса
                c.fillStyle = '#3e2723';
                c.fillRect(x, 0, 4, sz);
                // очень тёмная середина борозды
                c.fillStyle = '#2d1a14';
                c.fillRect(x + 1, 0, 2, sz);
            }
        }

        // Поперечные разрывы — мелкие пиксели земли, падающие внутрь борозд.
        // Детерминированный «мусор» (комочки) поверх.
        const dirtTones = ['#5d4037', '#4e342e', '#795548', '#6d4c41'];
        for (let i = 0; i < 18; i++) {
            c.fillStyle = dirtTones[(rnd() * dirtTones.length) | 0];
            const px = (rnd() * sz) | 0;
            const py = (rnd() * sz) | 0;
            c.fillRect(px, py, 1, 1);
        }

        // Тёмные «влажные» пятна (вспаханная земля выглядит свежей)
        c.fillStyle = 'rgba(0,0,0,0.30)';
        for (let i = 0; i < 6; i++) {
            c.fillRect(((rnd() * (sz - 2)) | 0), ((rnd() * (sz - 2)) | 0), 2, 2);
        }

        // Пара крупных комочков земли (мелкие камешки), торчат над бороздами
        c.fillStyle = '#8d6e63';
        c.fillRect(6, 4, 2, 1);
        c.fillStyle = '#a1887f';
        c.fillRect(22, 18, 2, 1);
        c.fillStyle = '#6d4c41';
        c.fillRect(14, 26, 2, 2);

        // Лёгкая верхняя светлая кромка — край блока подсвечен
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(0, 0, sz, 1);
    } else if (id === B.WHEAT_0 || id === B.WHEAT_1 || id === B.WHEAT_2 || id === B.WHEAT_3) {
        // V8: пшеница — фоном идёт ТОТ ЖЕ farmland (вертикальные борозды), чтобы стиль совпадал.
        c.fillStyle = '#3e2723';
        c.fillRect(0, 0, sz, sz);
        for (let col = 0; col < 8; col++) {
            const x = col * 4;
            if (col % 2 === 0) {
                c.fillStyle = '#6d4c41';
                c.fillRect(x, 0, 4, sz);
                c.fillStyle = '#8d6e63';
                c.fillRect(x + 1, 0, 1, sz);
            } else {
                c.fillStyle = '#3e2723';
                c.fillRect(x, 0, 4, sz);
                c.fillStyle = '#2d1a14';
                c.fillRect(x + 1, 0, 2, sz);
            }
        }
        const dirtTones2 = ['#5d4037', '#4e342e', '#795548', '#6d4c41'];
        for (let i = 0; i < 14; i++) {
            c.fillStyle = dirtTones2[(rnd() * dirtTones2.length) | 0];
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
        c.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 4; i++) {
            c.fillRect(((rnd() * (sz - 2)) | 0), ((rnd() * (sz - 2)) | 0), 2, 2);
        }

        // --- само растение ---
        const stage = id - B.WHEAT_0; // 0..3
        const stalkCols = [
            { stem: '#7cb342', tip: '#9ccc65' },  // stage 0
            { stem: '#689f38', tip: '#aed581' },  // stage 1
            { stem: '#558b2f', tip: '#c5e1a5' },  // stage 2
            { stem: '#827717', tip: '#f9a825' }   // stage 3
        ];
        const col = stalkCols[stage];
        const baseY = sz;
        const heights = [6, 12, 20, 26];
        const h = heights[stage];
        const xs = [4, 12, 20, 28];
        c.fillStyle = col.stem;
        xs.forEach(sx => { c.fillRect(sx, baseY - h, 2, h); });
        if (stage >= 1) {
            c.fillStyle = col.tip;
            xs.forEach(sx => {
                c.fillRect(sx - 1, baseY - h, 4, 2);
                if (stage >= 2) c.fillRect(sx - 1, baseY - h + 3, 4, 2);
            });
        }
        if (stage === 3) {
            c.fillStyle = '#fdd835';
            xs.forEach(sx => {
                c.fillRect(sx - 1, baseY - h + 6, 4, 2);
                c.fillRect(sx - 1, baseY - h + 9, 4, 2);
            });
            c.fillStyle = '#fff59d';
            xs.forEach(sx => {
                c.fillRect(sx, baseY - h, 1, 1);
                c.fillRect(sx, baseY - h + 6, 1, 1);
            });
        }
        return off; // pass-блок — пропускаем AO
    } else if (id === B.CLAY_BLOCK) {
        // V11: блок глины — серовато-голубой с мягкими пятнами
        c.fillStyle = '#a4b3c4'; c.fillRect(0, 0, sz, sz);
        const clayTones = ['#b0bec5', '#90a4ae', '#cfd8dc', '#9aa9b5'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.4) {
                    c.fillStyle = clayTones[(rnd() * clayTones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // мягкие тёмные точки (вкрапления)
        c.fillStyle = '#78909c';
        for (let i = 0; i < 8; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
        // светлые блики
        c.fillStyle = '#eceff1';
        for (let i = 0; i < 4; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
    } else if (id === B.COBBLESTONE) {
        // Minecraft style cobblestone
        c.fillStyle = '#4a4a4a'; c.fillRect(0, 0, sz, sz); // Dark mortar lines
        const cobbleStones = [
            { x: 0, y: 0, w: 12, h: 10, col: '#7e7e7e' },
            { x: 14, y: 0, w: 18, h: 12, col: '#8a8a8a' },
            { x: 0, y: 12, w: 16, h: 14, col: '#9a9a9a' },
            { x: 18, y: 14, w: 14, h: 10, col: '#6a6a6a' },
            { x: 0, y: 28, w: 14, h: 4, col: '#828282' },
            { x: 16, y: 26, w: 16, h: 6, col: '#757575' }
        ];
        cobbleStones.forEach(s => {
            // Pebbles touching the tile edge extend flush to that edge so
            // adjacent cobble tiles butt up without a dark mortar seam.
            const iL = s.x > 0 ? 1 : 0;
            const iT = s.y > 0 ? 1 : 0;
            const iR = (s.x + s.w) < sz ? 1 : 0;
            const iB = (s.y + s.h) < sz ? 1 : 0;
            const px = s.x + iL, py = s.y + iT;
            const pw = s.w - iL - iR, ph = s.h - iT - iB;
            c.fillStyle = s.col;
            c.fillRect(px, py, pw, ph);
            // Highlights/shadows only on the pebble edges that face internal mortar.
            c.fillStyle = 'rgba(255,255,255,0.2)';
            if (iT) c.fillRect(px, py, pw, 1);
            if (iL) c.fillRect(px, py, 1, ph);
            c.fillStyle = 'rgba(0,0,0,0.3)';
            if (iB) c.fillRect(px, py + ph - 1, pw, 1);
            if (iR) c.fillRect(px + pw - 1, py, 1, ph);
        });
        const st = ['#6a6a6a', '#8a8a8a'];
        for (let i = 0; i < 15; i++) {
            c.fillStyle = st[(rnd() * st.length) | 0];
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 2, 2);
        }
    } else if (id === B.GLASS) {
        // V10: стекло — почти прозрачное, тонкая рамка и пара бликов
        c.clearRect(0, 0, sz, sz);
        // полупрозрачная заливка
        c.fillStyle = 'rgba(179,229,252,0.35)';
        c.fillRect(0, 0, sz, sz);
        // рамка
        c.fillStyle = '#e1f5fe';
        c.fillRect(0, 0, sz, 1);
        c.fillRect(0, sz - 1, sz, 1);
        c.fillRect(0, 0, 1, sz);
        c.fillRect(sz - 1, 0, 1, sz);
        // диагональный блик (стандарт стекла)
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(4, 4, 8, 1);
        c.fillRect(4, 4, 1, 8);
        c.fillStyle = 'rgba(255,255,255,0.30)';
        c.fillRect(20, 18, 6, 1);
        c.fillRect(20, 18, 1, 6);
        return off; // не применяем AO к стеклу
    } else if (id === B.BOOKSHELF) {
        // V10: книжная полка — рамка из досок, в центре ряды разноцветных книг
        // деревянная рамка (как у плашки досок)
        c.fillStyle = '#5d4037'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#8d6e63';
        c.fillRect(0, 0, sz, 4);            // верхняя рамка
        c.fillRect(0, sz - 4, sz, 4);       // нижняя рамка
        c.fillRect(0, 0, 3, sz);            // левая
        c.fillRect(sz - 3, 0, 3, sz);       // правая
        // тёмные стыки
        c.fillStyle = '#3e2723';
        c.fillRect(0, 3, sz, 1);
        c.fillRect(0, sz - 4, sz, 1);
        c.fillRect(2, 0, 1, sz);
        c.fillRect(sz - 3, 0, 1, sz);
        // ряды книг (2 полки)
        const bookCols = ['#c62828', '#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00', '#37474f', '#fdd835', '#00838f'];
        const shelfYs = [6, 18];
        shelfYs.forEach(sy => {
            // полка-планка
            c.fillStyle = '#3e2723';
            c.fillRect(3, sy + 8, sz - 6, 1);
            // книги
            let bx = 4;
            while (bx < sz - 4) {
                const w = 2 + ((rnd() * 3) | 0);
                if (bx + w > sz - 4) break;
                const col = bookCols[(rnd() * bookCols.length) | 0];
                c.fillStyle = col;
                c.fillRect(bx, sy, w, 8);
                // обложка-блик
                c.fillStyle = 'rgba(255,255,255,0.25)';
                c.fillRect(bx, sy, 1, 8);
                // тёмный кант
                c.fillStyle = 'rgba(0,0,0,0.35)';
                c.fillRect(bx + w - 1, sy, 1, 8);
                bx += w + 1;
            }
        });
        // мелкие сучки на рамке
        c.fillStyle = '#3e2723';
        c.fillRect(1, 14, 1, 1);
        c.fillRect(sz - 2, 22, 1, 1);
    } else if (id === B.WOOD_STAIRS || id === B.COBBLE_STAIRS || id === B.STONE_STAIRS || id === B.BRICK_STAIRS) {
        // V10: ступеньки — две "ступеньки" уступом справа (нижняя + верхняя)
        // Нижняя половина — полная (по всей ширине), верхняя — только левая половина.
        c.clearRect(0, 0, sz, sz);
        // выбираем материал
        let baseCol, hi, lo, accent;
        if (id === B.WOOD_STAIRS) { baseCol = '#a67d53'; hi = '#bc9062'; lo = '#8f6841'; accent = '#5c4125'; }
        else if (id === B.COBBLE_STAIRS) { baseCol = '#7a7a7a'; hi = '#9a9a9a'; lo = '#5a5a5a'; accent = '#3e3e3e'; }
        else if (id === B.STONE_STAIRS) { baseCol = '#9a9a9a'; hi = '#bdbdbd'; lo = '#6e6e6e'; accent = '#454545'; }
        else { baseCol = '#8d3e2b'; hi = '#a64e35'; lo = '#5d2818'; accent = '#3e1a10'; }

        // Нижний "стейт" — полный по ширине, нижняя половина блока
        c.fillStyle = baseCol;
        c.fillRect(0, sz / 2, sz, sz / 2);
        // Верхний "стейт" — слева, верхняя половина
        c.fillRect(0, 0, sz / 2, sz / 2);
        // Улучшенная 3D текстура
        c.fillStyle = lo;
        c.fillRect(sz / 2 - 2, 0, 2, sz / 2);
        c.fillRect(0, sz - 2, sz, 2);
        c.fillRect(sz - 2, sz / 2, 2, sz / 2);

        c.fillStyle = hi;
        c.fillRect(0, 0, sz / 2, 2);
        c.fillRect(0, sz / 2, sz, 2);
        c.fillRect(0, 0, 2, sz / 2);
        c.fillRect(0, sz / 2, 2, sz / 2);
        
        // акцент-граница ступенек
        c.fillStyle = accent;
        c.fillRect(0, sz / 2 - 1, sz / 2, 1);   // граница верхнего уступа
        c.fillRect(sz / 2 - 1, sz / 2 - 1, 1, 1); // угол

        // Текстура внутри ступенек — повторяет материал
        if (id === B.WOOD_STAIRS) {
            // тонкие тёмные волокна
            c.fillStyle = 'rgba(0,0,0,0.25)';
            c.fillRect(2, 6, sz / 2 - 4, 1);
            c.fillRect(4, 22, sz - 8, 1);
        } else if (id === B.COBBLE_STAIRS) {
            // мелкие швы
            c.fillStyle = '#5a5a5a';
            c.fillRect(4, 8, 6, 1); c.fillRect(2, 12, 8, 1);
            c.fillRect(8, 22, 10, 1); c.fillRect(20, 26, 8, 1);
        } else if (id === B.STONE_STAIRS) {
            c.fillStyle = '#7a7a7a';
            c.fillRect(2, 4, 8, 1); c.fillRect(2, 10, 6, 1);
            c.fillRect(6, 22, 14, 1); c.fillRect(18, 26, 10, 1);
        } else if (id === B.BRICK_STAIRS) {
            // имитация кирпичей
            c.fillStyle = '#a64e35';
            c.fillRect(1, 1, 6, 6); c.fillRect(8, 1, 7, 6);
            c.fillRect(1, 8, 7, 7); c.fillRect(9, 8, 6, 7);
            c.fillRect(1, 17, 6, 6); c.fillRect(8, 17, 7, 6);
            c.fillRect(16, 17, 7, 6); c.fillRect(24, 17, 7, 6);
            c.fillRect(1, 24, 7, 7); c.fillRect(9, 24, 6, 7);
            c.fillRect(16, 24, 7, 7); c.fillRect(24, 24, 7, 7);
        }
        return off; // лестницы — без AO (прозрачные углы)
    } else if (id === B.WOOD_SLAB || id === B.STONE_SLAB || id === B.COBBLE_SLAB || id === B.BRICK_SLAB
        || id === B.DIRT_SLAB || id === B.SAND_SLAB || id === B.GLASS_SLAB || id === B.BOOKSHELF_SLAB) {
        // V10/V12: полублок — заполнена только нижняя половина тайла
        c.clearRect(0, 0, sz, sz);
        let baseCol, hi, lo;
        if (id === B.WOOD_SLAB) { baseCol = '#a67d53'; hi = '#bc9062'; lo = '#8f6841'; }
        else if (id === B.STONE_SLAB) { baseCol = '#9a9a9a'; hi = '#bdbdbd'; lo = '#6e6e6e'; }
        else if (id === B.COBBLE_SLAB) { baseCol = '#7a7a7a'; hi = '#9a9a9a'; lo = '#5a5a5a'; }
        else if (id === B.BRICK_SLAB) { baseCol = '#8d3e2b'; hi = '#a64e35'; lo = '#5d2818'; }
        else if (id === B.DIRT_SLAB) { baseCol = '#5d4037'; hi = '#7d5e4b'; lo = '#3e2723'; }
        else if (id === B.SAND_SLAB) { baseCol = '#e8d9a0'; hi = '#f5e8b8'; lo = '#b8a870'; }
        else if (id === B.GLASS_SLAB) { baseCol = '#b3e5fc'; hi = '#e1f5fe'; lo = '#81d4fa'; }
        else { baseCol = '#a67d53'; hi = '#bc9062'; lo = '#8f6841'; } // BOOKSHELF_SLAB

        // тело
        c.fillStyle = baseCol;
        c.fillRect(0, sz / 2, sz, sz / 2);
        // Улучшенная текстура: блик сверху, тень снизу, объем по бокам
        c.fillStyle = hi;
        c.fillRect(0, sz / 2, sz, 2);
        c.fillRect(0, sz / 2, 2, sz / 2);
        
        c.fillStyle = lo;
        c.fillRect(0, sz - 2, sz, 2);
        c.fillRect(sz - 2, sz / 2, 2, sz / 2);

        // Текстура зависит от материала
        if (id === B.WOOD_SLAB) {
            c.fillStyle = 'rgba(0,0,0,0.25)';
            c.fillRect(2, sz / 2 + 4, sz - 4, 1);
            c.fillRect(4, sz - 6, sz - 8, 1);
            c.fillStyle = '#5c4125';
            c.fillRect(8, sz / 2 + 8, 1, 1);
            c.fillRect(22, sz - 8, 1, 1);
        } else if (id === B.STONE_SLAB) {
            c.fillStyle = '#7a7a7a';
            c.fillRect(2, sz / 2 + 4, 8, 1);
            c.fillRect(14, sz / 2 + 8, 10, 1);
            c.fillRect(4, sz - 6, 12, 1);
        } else if (id === B.COBBLE_SLAB) {
            c.fillStyle = '#5a5a5a';
            c.fillRect(4, sz / 2 + 4, 6, 1);
            c.fillRect(14, sz / 2 + 6, 10, 1);
            c.fillRect(2, sz - 6, 8, 1);
            c.fillRect(20, sz - 5, 8, 1);
        } else if (id === B.BRICK_SLAB) {
            c.fillStyle = '#a64e35';
            c.fillRect(1, sz / 2 + 1, 7, 6);
            c.fillRect(9, sz / 2 + 1, 7, 6);
            c.fillRect(17, sz / 2 + 1, 7, 6);
            c.fillRect(25, sz / 2 + 1, 6, 6);
            c.fillRect(1, sz - 7, 5, 6);
            c.fillRect(7, sz - 7, 7, 6);
            c.fillRect(15, sz - 7, 7, 6);
            c.fillRect(23, sz - 7, 8, 6);
        } else if (id === B.DIRT_SLAB) {
            // мелкие камешки
            c.fillStyle = '#3e2723';
            for (let i = 0; i < 5; i++) {
                c.fillRect((rnd() * sz) | 0, sz / 2 + 2 + ((rnd() * (sz / 2 - 4)) | 0), 2, 2);
            }
            c.fillStyle = '#8d6e63';
            for (let i = 0; i < 3; i++) {
                c.fillRect((rnd() * sz) | 0, sz / 2 + 2 + ((rnd() * (sz / 2 - 4)) | 0), 1, 1);
            }
        } else if (id === B.SAND_SLAB) {
            // песчинки
            c.fillStyle = '#b8a870';
            for (let i = 0; i < 8; i++) {
                c.fillRect((rnd() * sz) | 0, sz / 2 + 2 + ((rnd() * (sz / 2 - 4)) | 0), 1, 1);
            }
            c.fillStyle = '#f5ecc5';
            for (let i = 0; i < 4; i++) {
                c.fillRect((rnd() * sz) | 0, sz / 2 + 2 + ((rnd() * (sz / 2 - 4)) | 0), 1, 1);
            }
        } else if (id === B.GLASS_SLAB) {
            // полупрозрачность достигается тем что верх пустой; добавим блик
            c.fillStyle = 'rgba(255,255,255,0.55)';
            c.fillRect(4, sz / 2 + 4, 8, 1);
            c.fillRect(4, sz / 2 + 4, 1, 6);
            c.fillStyle = 'rgba(255,255,255,0.30)';
            c.fillRect(20, sz - 8, 6, 1);
        } else if (id === B.BOOKSHELF_SLAB) {
            // ряд книг (низкий)
            const bookCols = ['#c62828', '#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00', '#37474f', '#fdd835'];
            let bx = 3;
            const bookY = sz / 2 + 3;
            while (bx < sz - 3) {
                const w = 2 + ((rnd() * 3) | 0);
                if (bx + w > sz - 3) break;
                c.fillStyle = bookCols[(rnd() * bookCols.length) | 0];
                c.fillRect(bx, bookY, w, 8);
                c.fillStyle = 'rgba(255,255,255,0.25)';
                c.fillRect(bx, bookY, 1, 8);
                c.fillStyle = 'rgba(0,0,0,0.35)';
                c.fillRect(bx + w - 1, bookY, 1, 8);
                bx += w + 1;
            }
            // тёмная нижняя полка
            c.fillStyle = '#5c4125';
            c.fillRect(2, sz - 4, sz - 4, 1);
        }
        return off;
    } else if (id === B.WOOD_DOOR) {
        // V12: дверь — закрытая по умолчанию. Открытое состояние и поворот рисуются
        // через canvas transform в drawBlock().
        c.clearRect(0, 0, sz, sz);
        // тело двери — два деревянных листа с филёнками
        c.fillStyle = '#a67d53'; c.fillRect(2, 0, sz - 4, sz);
        // верхняя/нижняя панель
        c.fillStyle = '#bc9062';
        c.fillRect(4, 2, sz - 8, sz / 2 - 4);
        c.fillRect(4, sz / 2 + 2, sz - 8, sz / 2 - 4);
        // тёмные швы
        c.fillStyle = '#8f6841';
        c.fillRect(2, 0, 1, sz);
        c.fillRect(sz - 3, 0, 1, sz);
        c.fillRect(4, sz / 2 - 2, sz - 8, 2); // горизонтальный шов
        // ручка
        c.fillStyle = '#5c4125';
        c.fillRect(sz - 7, sz / 2 + 4, 2, 4);
        c.fillStyle = '#ffd54f';
        c.fillRect(sz - 7, sz / 2 + 4, 2, 2);
        return off;
    } else if (id === B.WOOD_GATE) {
        c.clearRect(0, 0, sz, sz);
        const u = sz / 32;
        c.fillStyle = '#5d4037';
        c.fillRect(0, 8 * u, 4 * u, sz - 8 * u);
        c.fillRect(sz - 4 * u, 8 * u, 4 * u, sz - 8 * u);
        c.fillStyle = '#795548';
        c.fillRect(4 * u, 12 * u, sz - 8 * u, 4 * u);
        c.fillRect(4 * u, 22 * u, sz - 8 * u, 4 * u);
        c.fillStyle = '#4e342e';
        c.fillRect(sz / 2 - 1 * u, 12 * u, 2 * u, 14 * u);
        return off;
    } else if (id === B.WOOD_TRAPDOOR) {
        // V12: люк (closed = горизонтальный, "лежит" на верхней половине)
        c.clearRect(0, 0, sz, sz);
        c.fillStyle = '#a67d53'; c.fillRect(0, 0, sz, 6);
        // светлая полоса
        c.fillStyle = '#bc9062'; c.fillRect(0, 0, sz, 1);
        // тёмная нижняя
        c.fillStyle = '#8f6841'; c.fillRect(0, 5, sz, 1);
        // 3 досок-планки
        c.fillStyle = '#5c4125';
        c.fillRect(11, 0, 1, 6);
        c.fillRect(22, 0, 1, 6);
        // петли (металл)
        c.fillStyle = '#616161';
        c.fillRect(2, 1, 4, 4);
        c.fillRect(sz - 6, 1, 4, 4);
        c.fillStyle = '#9e9e9e';
        c.fillRect(3, 2, 2, 1);
        c.fillRect(sz - 5, 2, 2, 1);
        return off;
    } else if (id === B.LEVER) {
        // V12: рычаг (canonical: на полу, рычаг откинут вправо)
        c.clearRect(0, 0, sz, sz);
        // плита-основание (булыжник) внизу
        c.fillStyle = '#7a7a7a'; c.fillRect(10, sz - 6, 12, 6);
        c.fillStyle = '#5a5a5a'; c.fillRect(10, sz - 6, 12, 1);
        c.fillStyle = '#3e3e3e'; c.fillRect(10, sz - 1, 12, 1);
        // палочка (рычаг)
        c.fillStyle = '#a67d53';
        c.fillRect(15, sz - 18, 2, 14);
        // тёмная сторона палки
        c.fillStyle = '#8f6841';
        c.fillRect(15, sz - 18, 1, 14);
        // навершие — деревянный/медный шарик
        c.fillStyle = '#bc9062';
        c.fillRect(13, sz - 22, 6, 5);
        c.fillStyle = '#a67d53';
        c.fillRect(13, sz - 18, 6, 1);
        c.fillStyle = 'rgba(255,255,255,0.4)';
        c.fillRect(14, sz - 21, 2, 1);
        return off;
    } else if (id === B.LADDER) {
        // V12: лестница (canonical: тонкая на верхней грани; ставится только на BG)
        c.clearRect(0, 0, sz, sz);
        // две вертикальные рейки
        c.fillStyle = '#a67d53';
        c.fillRect(3, 0, 3, sz);
        c.fillRect(sz - 6, 0, 3, sz);
        // блики на рейках
        c.fillStyle = '#bc9062';
        c.fillRect(3, 0, 1, sz);
        c.fillRect(sz - 6, 0, 1, sz);
        // тени
        c.fillStyle = '#8f6841';
        c.fillRect(5, 0, 1, sz);
        c.fillRect(sz - 4, 0, 1, sz);
        // 4 перекладины
        c.fillStyle = '#bc9062';
        for (let i = 0; i < 4; i++) {
            const ry = 4 + i * 8;
            c.fillRect(6, ry, sz - 12, 2);
            c.fillStyle = '#8f6841';
            c.fillRect(6, ry + 2, sz - 12, 1);
            c.fillStyle = '#bc9062';
        }
        return off;
    } else if (id === B.JUKEBOX) {
        // V13: jukebox — wooden cube with a vinyl record on top.
        // Wood frame
        c.fillStyle = '#5d4037'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#6d4c41'; c.fillRect(2, 2, sz - 4, sz - 4);
        // Wood plank seams
        c.fillStyle = '#3e2723';
        c.fillRect(0, 10, sz, 1);
        c.fillRect(0, 20, sz, 1);
        c.fillRect(8, 0, 1, sz);
        c.fillRect(22, 0, 1, sz);
        // Subtle wood-grain speckle
        c.fillStyle = 'rgba(0,0,0,0.20)';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 2, 1);
        }
        // Light edge top, dark edge bottom (wood relief)
        c.fillStyle = '#8d6e63'; c.fillRect(2, 2, sz - 4, 1);
        c.fillStyle = '#3e2723'; c.fillRect(2, sz - 3, sz - 4, 1);
        // Gold trim band (jukebox detail)
        c.fillStyle = '#b9854a'; c.fillRect(3, sz - 6, sz - 6, 1);
        c.fillStyle = '#ffd54f'; c.fillRect(3, sz - 7, sz - 6, 1);
        // Vinyl record visible on the top face — black disc with grooves
        c.fillStyle = '#1b1b1b';
        // round-ish disc using square pixels (8x4 ellipse approximation)
        c.fillRect(8, 4, 16, 4);
        c.fillRect(6, 5, 20, 2);
        c.fillStyle = '#000';
        c.fillRect(9, 5, 14, 2);
        // grooves (subtle lighter lines)
        c.fillStyle = '#383838';
        c.fillRect(10, 5, 12, 1);
        c.fillRect(12, 6, 8, 1);
        // center label (red dot)
        c.fillStyle = '#c62828';
        c.fillRect(15, 5, 2, 2);
        c.fillStyle = '#ffeb3b';
        c.fillRect(15, 5, 1, 1);
        return off;
    } else if (id === B.WOOD_FENCE || id === B.COBBLE_FENCE || id === B.BRICK_FENCE) {
        // V10: забор — тонкий вертикальный столб с двумя горизонтальными перекладинами
        c.clearRect(0, 0, sz, sz);
        let baseCol, hi, lo;
        if (id === B.WOOD_FENCE) { baseCol = '#a67d53'; hi = '#bc9062'; lo = '#8f6841'; }
        else if (id === B.COBBLE_FENCE) { baseCol = '#7a7a7a'; hi = '#9a9a9a'; lo = '#5a5a5a'; }
        else { baseCol = '#8d3e2b'; hi = '#a64e35'; lo = '#5d2818'; }

        const postX = sz / 2 - 3;     // вертикальный столб 6px шириной
        const postW = 6;
        // столб
        c.fillStyle = baseCol;
        c.fillRect(postX, 0, postW, sz);
        // блик столба
        c.fillStyle = hi;
        c.fillRect(postX, 0, 1, sz);
        // тень столба
        c.fillStyle = lo;
        c.fillRect(postX + postW - 1, 0, 1, sz);

        // Две горизонтальные перекладины
        const railH = 4;
        const rail1Y = 8;
        const rail2Y = 20;
        c.fillStyle = baseCol;
        c.fillRect(0, rail1Y, sz, railH);
        c.fillRect(0, rail2Y, sz, railH);
        // блики и тени на перекладинах
        c.fillStyle = hi;
        c.fillRect(0, rail1Y, sz, 1);
        c.fillRect(0, rail2Y, sz, 1);
        c.fillStyle = lo;
        c.fillRect(0, rail1Y + railH - 1, sz, 1);
        c.fillRect(0, rail2Y + railH - 1, sz, 1);
        
        // Рисуем столб поверх перекладин для объема
        c.fillStyle = baseCol; c.fillRect(postX, 0, postW, sz);
        c.fillStyle = hi; c.fillRect(postX, 0, 1, sz);
        c.fillStyle = lo; c.fillRect(postX + postW - 1, 0, 1, sz);

        // Лёгкая фактура материала
        if (id === B.WOOD_FENCE) {
            c.fillStyle = 'rgba(0,0,0,0.30)';
            c.fillRect(postX + 2, 4, 1, 4);
            c.fillRect(postX + 1, 26, 1, 4);
            c.fillRect(4, rail1Y + 1, 6, 1);
            c.fillRect(20, rail2Y + 2, 8, 1);
        } else if (id === B.COBBLE_FENCE) {
            c.fillStyle = '#5a5a5a';
            c.fillRect(postX + 1, 14, 4, 1);
            c.fillRect(2, rail1Y + 2, 4, 1);
            c.fillRect(24, rail2Y + 2, 6, 1);
        } else if (id === B.BRICK_FENCE) {
            c.fillStyle = '#5d2818';
            c.fillRect(postX, 12, postW, 1);
            c.fillRect(postX, 24, postW, 1);
            c.fillRect(8, rail1Y + 2, 1, 1);
            c.fillRect(22, rail2Y + 1, 1, 1);
        }
        return off;
    }

    // ----- V14: FLOWERS & PLANTS -----
    // Drawn as transparent sprites — clear the bg first, then plot the petals/stalk.
    if (isFlowerOrPlant(id) || id === B.SNOW_LAYER) {
        c.clearRect(0, 0, sz, sz);
    }

    // Helper drawing routines for flowers — keeps each case below short.
    // Stems run all the way to the bottom of the tile so the plant visually
    // touches the ground it sits on. Two leaves give it more silhouette.
    const drawFlowerStem = (col, darkCol) => {
        c.fillStyle = col;
        c.fillRect(sz / 2 - 1, 14, 2, sz - 14);
        c.fillStyle = darkCol || col;
        c.fillRect(sz / 2 - 1, 14, 1, sz - 14);
        // Two leaves on the stem.
        c.fillStyle = '#1b5e20';
        c.fillRect(sz / 2 + 1, 19, 3, 2);
        c.fillRect(sz / 2 - 4, 24, 3, 2);
    };

    if (id === B.POPPY) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        // 5-petal flower with darker outline.
        c.fillStyle = '#b71c1c';
        c.fillRect(sz / 2 - 4, 6,  8, 8);
        c.fillStyle = '#e53935';
        c.fillRect(sz / 2 - 3, 5,  6, 9);
        c.fillRect(sz / 2 - 4, 7,  8, 5);
        c.fillStyle = '#ef5350';
        c.fillRect(sz / 2 - 2, 6, 4, 6);
        c.fillStyle = '#212121';
        c.fillRect(sz / 2 - 1, 9, 2, 2);
        return off;
    }
    if (id === B.DANDELION) {
        drawFlowerStem('#388e3c', '#1b5e20');
        // Yellow puffy bloom with rays.
        c.fillStyle = '#f9a825';
        c.fillRect(sz / 2 - 4, 6, 8, 8);
        c.fillStyle = '#fbc02d';
        c.fillRect(sz / 2 - 3, 5, 6, 9);
        c.fillRect(sz / 2 - 4, 7, 8, 5);
        c.fillStyle = '#fdd835';
        c.fillRect(sz / 2 - 2, 7, 4, 5);
        c.fillStyle = '#fff59d';
        c.fillRect(sz / 2 - 1, 8, 2, 2);
        return off;
    }
    if (id === B.BLUE_ORCHID) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        c.fillStyle = '#0277bd';
        c.fillRect(sz / 2 - 4, 6,  8, 8);
        c.fillStyle = '#0288d1';
        c.fillRect(sz / 2 - 3, 5,  6, 9);
        c.fillStyle = '#4fc3f7';
        c.fillRect(sz / 2 - 2, 7, 4, 5);
        c.fillStyle = '#fff';
        c.fillRect(sz / 2 - 1, 9, 2, 2);
        return off;
    }
    if (id === B.ALLIUM) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        // Puffball cluster of magenta dots.
        c.fillStyle = '#6a1b9a';
        c.fillRect(sz / 2 - 4, 6, 8, 6);
        c.fillStyle = '#8e24aa';
        c.fillRect(sz / 2 - 5, 7, 10, 4);
        c.fillStyle = '#ab47bc';
        c.fillRect(sz / 2 - 3, 5, 6, 8);
        c.fillStyle = '#ce93d8';
        c.fillRect(sz / 2 - 2, 6, 2, 2);
        c.fillRect(sz / 2 + 1, 8, 2, 2);
        c.fillRect(sz / 2 - 1, 10, 2, 2);
        return off;
    }
    if (id === B.AZURE_BLUET) {
        drawFlowerStem('#388e3c', '#1b5e20');
        c.fillStyle = '#cfd8dc';
        c.fillRect(sz / 2 - 3, 8, 6, 5);
        c.fillStyle = '#fafafa';
        c.fillRect(sz / 2 - 2, 7, 4, 6);
        c.fillStyle = '#fff';
        c.fillRect(sz / 2 - 1, 8, 2, 2);
        c.fillStyle = '#fdd835';
        c.fillRect(sz / 2 - 1, 10, 2, 2);
        return off;
    }
    if (id === B.RED_TULIP) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        // Cup-shaped tulip with three petals.
        c.fillStyle = '#b71c1c';
        c.fillRect(sz / 2 - 3, 8, 6, 6);
        c.fillStyle = '#c62828';
        c.fillRect(sz / 2 - 3, 6, 6, 7);
        c.fillRect(sz / 2 - 4, 9, 8, 4);
        c.fillStyle = '#e53935';
        c.fillRect(sz / 2 - 2, 7, 4, 5);
        c.fillStyle = '#212121';
        c.fillRect(sz / 2 - 1, 13, 2, 1);
        return off;
    }
    if (id === B.ORANGE_TULIP) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        c.fillStyle = '#e65100';
        c.fillRect(sz / 2 - 3, 8, 6, 6);
        c.fillStyle = '#ef6c00';
        c.fillRect(sz / 2 - 3, 6, 6, 7);
        c.fillRect(sz / 2 - 4, 9, 8, 4);
        c.fillStyle = '#fb8c00';
        c.fillRect(sz / 2 - 2, 7, 4, 5);
        c.fillStyle = '#ffe0b2';
        c.fillRect(sz / 2 - 1, 7, 1, 2);
        return off;
    }
    if (id === B.WHITE_TULIP) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        c.fillStyle = '#cfd8dc';
        c.fillRect(sz / 2 - 3, 8, 6, 6);
        c.fillStyle = '#eceff1';
        c.fillRect(sz / 2 - 3, 6, 6, 7);
        c.fillRect(sz / 2 - 4, 9, 8, 4);
        c.fillStyle = '#fafafa';
        c.fillRect(sz / 2 - 2, 7, 4, 5);
        c.fillStyle = '#fdd835';
        c.fillRect(sz / 2 - 1, 12, 2, 1);
        return off;
    }
    if (id === B.PINK_TULIP) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        c.fillStyle = '#ad1457';
        c.fillRect(sz / 2 - 3, 8, 6, 6);
        c.fillStyle = '#d81b60';
        c.fillRect(sz / 2 - 3, 6, 6, 7);
        c.fillRect(sz / 2 - 4, 9, 8, 4);
        c.fillStyle = '#f48fb1';
        c.fillRect(sz / 2 - 2, 7, 4, 5);
        c.fillStyle = '#fff';
        c.fillRect(sz / 2 - 1, 7, 1, 2);
        return off;
    }
    if (id === B.OXEYE_DAISY) {
        drawFlowerStem('#388e3c', '#1b5e20');
        // Daisy shape — 4 white petals around a yellow centre.
        c.fillStyle = '#fafafa';
        c.fillRect(sz / 2 - 1, 4, 2, 4);    // top petal
        c.fillRect(sz / 2 - 1, 12, 2, 4);   // bottom petal
        c.fillRect(sz / 2 - 5, 8, 4, 2);    // left petal
        c.fillRect(sz / 2 + 1, 8, 4, 2);    // right petal
        c.fillRect(sz / 2 - 3, 7, 6, 4);    // centre body
        c.fillStyle = '#fff';
        c.fillRect(sz / 2 - 1, 5, 2, 2);
        c.fillStyle = '#fdd835';
        c.fillRect(sz / 2 - 1, 8, 2, 2);
        return off;
    }
    if (id === B.CORNFLOWER) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        // Star-burst cornflower: outer indigo, inner light blue.
        c.fillStyle = '#1a237e';
        c.fillRect(sz / 2 - 1, 4, 2, 2);    // top point
        c.fillRect(sz / 2 - 1, 12, 2, 2);   // bottom point
        c.fillRect(sz / 2 - 5, 8, 2, 2);    // left point
        c.fillRect(sz / 2 + 3, 8, 2, 2);    // right point
        c.fillStyle = '#283593';
        c.fillRect(sz / 2 - 3, 6, 6, 6);
        c.fillStyle = '#3949ab';
        c.fillRect(sz / 2 - 2, 6, 4, 6);
        c.fillStyle = '#5c6bc0';
        c.fillRect(sz / 2 - 1, 7, 2, 4);
        c.fillStyle = '#9fa8da';
        c.fillRect(sz / 2 - 1, 8, 2, 1);
        return off;
    }
    if (id === B.LILY_OF_THE_VALLEY) {
        drawFlowerStem('#2e7d32', '#1b5e20');
        // Several tiny white bells dangling along the stem.
        c.fillStyle = '#cfd8dc';
        c.fillRect(sz / 2 - 3, 8,  3, 3);
        c.fillRect(sz / 2 + 1, 12, 3, 3);
        c.fillRect(sz / 2 - 3, 16, 3, 3);
        c.fillRect(sz / 2 + 1, 20, 3, 3);
        c.fillStyle = '#fafafa';
        c.fillRect(sz / 2 - 3, 8,  2, 1);
        c.fillRect(sz / 2 + 1, 12, 2, 1);
        c.fillRect(sz / 2 - 3, 16, 2, 1);
        c.fillRect(sz / 2 + 1, 20, 2, 1);
        return off;
    }

    // ----- V14: Tall flowers (bottom + top halves) -----
    // Bottom halves: stem runs from y=0 (so it joins the top half) all the way
    // to y=sz (so it visually sits ON the ground tile below).
    if (id === B.SUNFLOWER_BOTTOM) {
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, 0, 2, sz);
        c.fillStyle = '#1b5e20'; c.fillRect(sz / 2,     0, 1, sz);
        c.fillStyle = '#388e3c';
        c.fillRect(sz / 2 - 5, 10, 4, 3); // big sunflower leaf left
        c.fillRect(sz / 2 + 2, 20, 5, 3); // big sunflower leaf right
        c.fillStyle = '#1b5e20';
        c.fillRect(sz / 2 - 5, 10, 4, 1);
        c.fillRect(sz / 2 + 2, 22, 5, 1);
        return off;
    }
    if (id === B.SUNFLOWER_TOP) {
        // Big yellow sunflower with brown centre — extends to BOTTOM so it
        // touches the bottom half visually.
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, sz - 8, 2, 8);
        c.fillStyle = '#f57f17'; c.fillRect(6, 6, 20, 18);
        c.fillStyle = '#fbc02d'; c.fillRect(4, 9, 24, 12);
        c.fillStyle = '#fdd835'; c.fillRect(6, 10, 20, 10);
        c.fillStyle = '#5d4037'; c.fillRect(11, 11, 10, 8);
        c.fillStyle = '#3e2723'; c.fillRect(11, 11, 10, 1);
        c.fillStyle = '#795548';
        c.fillRect(13, 13, 2, 2); c.fillRect(17, 13, 2, 2);
        c.fillRect(13, 16, 2, 2); c.fillRect(17, 16, 2, 2);
        return off;
    }
    if (id === B.LILAC_BOTTOM) {
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, 0, 2, sz);
        c.fillStyle = '#1b5e20'; c.fillRect(sz / 2,     0, 1, sz);
        c.fillStyle = '#388e3c'; c.fillRect(sz / 2 - 4, 14, 4, 3);
        c.fillRect(sz / 2 + 1, 20, 4, 3);
        c.fillStyle = '#1b5e20';
        c.fillRect(sz / 2 - 4, 16, 4, 1);
        c.fillRect(sz / 2 + 1, 22, 4, 1);
        return off;
    }
    if (id === B.LILAC_TOP) {
        // Cluster of magenta blossoms — extends DOWN to bottom of tile.
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, sz - 6, 2, 6);
        c.fillStyle = '#6a1b9a';
        c.fillRect(7,  10, 6, 5); c.fillRect(13, 6, 6, 5);
        c.fillRect(19, 10, 6, 5); c.fillRect(10, 16, 6, 5);
        c.fillRect(16, 16, 6, 5); c.fillRect(13, 22, 6, 4);
        c.fillStyle = '#ab47bc';
        c.fillRect(8, 11, 4, 3); c.fillRect(14, 7, 4, 3);
        c.fillRect(20, 11, 4, 3); c.fillRect(11, 17, 4, 3);
        c.fillRect(17, 17, 4, 3); c.fillRect(14, 23, 4, 2);
        c.fillStyle = '#e1bee7';
        c.fillRect(8, 11, 2, 1); c.fillRect(14, 7, 2, 1);
        c.fillRect(20, 11, 2, 1); c.fillRect(11, 17, 2, 1);
        return off;
    }
    if (id === B.ROSE_BUSH_BOTTOM) {
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, 0, 2, sz);
        c.fillStyle = '#1b5e20'; c.fillRect(sz / 2,     0, 1, sz);
        c.fillStyle = '#388e3c';
        c.fillRect(sz / 2 - 5, 12, 4, 3);
        c.fillRect(sz / 2 + 1, 18, 5, 3);
        c.fillRect(sz / 2 - 4, 24, 4, 3);
        c.fillStyle = '#1b5e20';
        c.fillRect(sz / 2 - 5, 14, 4, 1);
        c.fillRect(sz / 2 + 1, 20, 5, 1);
        return off;
    }
    if (id === B.ROSE_BUSH_TOP) {
        // Cluster of red roses — extends to bottom.
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, sz - 8, 2, 8);
        c.fillStyle = '#388e3c'; c.fillRect(sz / 2 - 5, sz - 6, 4, 2);
        c.fillRect(sz / 2 + 1, sz - 6, 4, 2);
        c.fillStyle = '#b71c1c';
        c.fillRect(7, 8, 6, 6); c.fillRect(19, 8, 6, 6);
        c.fillRect(13, 12, 6, 6); c.fillRect(7, 18, 6, 6);
        c.fillRect(19, 18, 6, 6);
        c.fillStyle = '#e53935';
        c.fillRect(8, 9, 4, 4); c.fillRect(20, 9, 4, 4);
        c.fillRect(14, 13, 4, 4); c.fillRect(8, 19, 4, 4);
        c.fillRect(20, 19, 4, 4);
        c.fillStyle = '#ef5350';
        c.fillRect(9, 10, 2, 2); c.fillRect(21, 10, 2, 2);
        c.fillRect(15, 14, 2, 2); c.fillRect(9, 20, 2, 2);
        return off;
    }
    if (id === B.PEONY_BOTTOM) {
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, 0, 2, sz);
        c.fillStyle = '#1b5e20'; c.fillRect(sz / 2,     0, 1, sz);
        c.fillStyle = '#388e3c';
        c.fillRect(sz / 2 - 4, 14, 4, 3);
        c.fillRect(sz / 2 + 1, 22, 4, 3);
        c.fillStyle = '#1b5e20';
        c.fillRect(sz / 2 - 4, 16, 4, 1);
        c.fillRect(sz / 2 + 1, 24, 4, 1);
        return off;
    }
    if (id === B.PEONY_TOP) {
        // Fluffy pink peony — extends to bottom.
        c.fillStyle = '#2e7d32'; c.fillRect(sz / 2 - 1, sz - 6, 2, 6);
        c.fillStyle = '#ad1457';
        c.fillRect(6, 10, 20, 14);
        c.fillStyle = '#d81b60';
        c.fillRect(8, 8, 16, 14);
        c.fillRect(4, 12, 24, 10);
        c.fillStyle = '#f06292';
        c.fillRect(10, 10, 12, 10);
        c.fillStyle = '#f48fb1';
        c.fillRect(12, 12, 8, 6);
        c.fillStyle = '#fce4ec';
        c.fillRect(14, 13, 4, 2);
        return off;
    }

    // ----- V14: Grass plants -----
    if (id === B.SHORT_GRASS) {
        // Tufts of grass touching the bottom of the tile so they sit on the
        // ground. 6 blades, lower-half only (Minecraft-like silhouette).
        const sBladesX = [4, 8, 13, 17, 22, 26];
        const sBladesH = [10, 13, 11, 14, 9, 12];
        c.fillStyle = '#2e7d32';
        for (let i = 0; i < sBladesX.length; i++) {
            const bx = sBladesX[i], bh = sBladesH[i];
            c.fillRect(bx, sz - bh, 2, bh);
        }
        c.fillStyle = '#43a047';
        for (let i = 0; i < sBladesX.length; i++) {
            const bx = sBladesX[i], bh = sBladesH[i];
            c.fillRect(bx,     sz - bh, 1, bh);
        }
        c.fillStyle = '#66bb6a';
        for (let i = 0; i < sBladesX.length; i++) {
            const bx = sBladesX[i], bh = sBladesH[i];
            c.fillRect(bx, sz - bh, 1, 2);
        }
        return off;
    }
    if (id === B.TALL_GRASS_BOTTOM) {
        // 2-block tall grass: bottom half — runs from top of tile to bottom.
        const bladesX = [3, 8, 13, 18, 23, 27];
        c.fillStyle = '#2e7d32';
        for (let i = 0; i < bladesX.length; i++) {
            c.fillRect(bladesX[i], 0, 2, sz);
        }
        c.fillStyle = '#43a047';
        for (let i = 0; i < bladesX.length; i++) {
            c.fillRect(bladesX[i], 0, 1, sz);
        }
        return off;
    }
    if (id === B.TALL_GRASS_TOP) {
        // Top half — tapered tips downwards to touch the bottom tile.
        const bladesX = [3, 8, 13, 18, 23, 27];
        const bladesTop = [10, 14, 8, 12, 10, 16]; // tapered tips
        c.fillStyle = '#2e7d32';
        for (let i = 0; i < bladesX.length; i++) {
            c.fillRect(bladesX[i], bladesTop[i], 2, sz - bladesTop[i]);
        }
        c.fillStyle = '#43a047';
        for (let i = 0; i < bladesX.length; i++) {
            c.fillRect(bladesX[i], bladesTop[i], 1, sz - bladesTop[i]);
        }
        // Light highlight near the tip.
        c.fillStyle = '#81c784';
        for (let i = 0; i < bladesX.length; i++) {
            c.fillRect(bladesX[i] - 1, bladesTop[i], 1, 3);
        }
        return off;
    }
    if (id === B.SUGARCANE) {
        c.fillStyle = '#8bc34a'; // light green main stalk
        c.fillRect(10, 0, 6, sz);
        c.fillRect(18, 0, 6, sz);
        // segments
        c.fillStyle = '#558b2f'; // darker segment lines
        c.fillRect(10, 8, 6, 2);
        c.fillRect(18, 12, 6, 2);
        c.fillRect(10, 20, 6, 2);
        c.fillRect(18, 24, 6, 2);
        return off;
    }

    // ----- V14: Snow biome blocks -----
    if (id === B.SNOW_BLOCK) {
        c.fillStyle = '#fafafa'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#fff';
        for (let i = 0; i < 14; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 2, 2);
        }
        c.fillStyle = 'rgba(180,200,230,0.5)';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
        c.fillStyle = '#eceff1'; c.fillRect(0, sz - 2, sz, 2);
        return off;
    }
    if (id === B.SNOW_LAYER) {
        // Thin slab of snow on the bottom edge.
        c.fillStyle = '#fafafa'; c.fillRect(0, sz - 6, sz, 6);
        c.fillStyle = '#fff';    c.fillRect(0, sz - 6, sz, 1);
        c.fillStyle = '#e1f5fe'; c.fillRect(0, sz - 1, sz, 1);
        for (let i = 0; i < 5; i++) {
            c.fillStyle = '#fff';
            c.fillRect((rnd() * sz) | 0, sz - 5 + ((rnd() * 4) | 0), 1, 1);
        }
        return off;
    }
    if (id === B.ICE) {
        // Translucent cyan-blue ice.
        c.fillStyle = 'rgba(129,212,250,0.85)'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#b3e5fc'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#81d4fa';
        for (let i = 0; i < 8; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 2 + (rnd() * 4) | 0, 1);
        }
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(2, 2, 6, 1); c.fillRect(2, 2, 1, 6);
        c.fillRect(sz - 8, sz - 4, 6, 1);
        c.fillStyle = '#90caf9';
        c.fillRect(0, sz - 1, sz, 1);
        return off;
    }
    if (id === B.PACKED_ICE) {
        c.fillStyle = '#90caf9'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#64b5f6';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 3, 2);
        }
        c.fillStyle = '#bbdefb';
        c.fillRect(2, 4, 6, 1); c.fillRect(20, 22, 8, 1);
        c.fillStyle = 'rgba(255,255,255,0.4)';
        c.fillRect(0, 0, sz, 1);
        return off;
    }

    // Beta 1.0: Nether blocks
    if (id === B.NETHERRACK) {
        c.fillStyle = '#5a1818'; c.fillRect(0, 0, sz, sz);
        const tones = ['#6a1e1e', '#7a2424', '#3e1010', '#8a2a2a', '#4a1414'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.2) {
                    c.fillStyle = tones[(rnd() * tones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        c.fillStyle = '#2a0808';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 2, 1);
        }
    } else if (id === B.QUARTZ_ORE) {
        c.fillStyle = '#5a1818'; c.fillRect(0, 0, sz, sz);
        const tones = ['#6a1e1e', '#7a2424', '#3e1010'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.3) {
                    c.fillStyle = tones[(rnd() * tones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // White quartz nuggets embedded in red rock.
        const veins = [{ x: 6, y: 8 }, { x: 18, y: 14 }, { x: 10, y: 22 }, { x: 22, y: 4 }];
        veins.forEach(v => {
            c.fillStyle = '#ece4d6'; c.fillRect(v.x, v.y, 4, 4);
            c.fillStyle = '#ffffff'; c.fillRect(v.x, v.y, 2, 1);
            c.fillStyle = '#b8aa90'; c.fillRect(v.x + 2, v.y + 2, 2, 2);
        });
    } else if (id === B.QUARTZ_BLOCK) {
        c.fillStyle = '#ece4d6'; c.fillRect(0, 0, sz, sz);
        // Smooth pale block with subtle banding.
        c.fillStyle = '#f5efe1';
        c.fillRect(0, 0, sz, 4);
        c.fillRect(0, sz - 4, sz, 4);
        c.fillStyle = '#d6cdb8';
        c.fillRect(0, 14, sz, 1);
        c.fillRect(0, 20, sz, 1);
        // Tiny sparkles.
        c.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 1, 1);
        }
    } else if (id === B.GLOWSTONE) {
        c.fillStyle = '#a8741a'; c.fillRect(0, 0, sz, sz);
        const tones = ['#ffd54f', '#ffeb3b', '#ffb300', '#fff59d'];
        for (let x = 0; x < sz; x += 4) {
            for (let y = 0; y < sz; y += 4) {
                if (rnd() > 0.3) {
                    c.fillStyle = tones[(rnd() * tones.length) | 0];
                    c.fillRect(x, y, 4, 4);
                }
            }
        }
        c.fillStyle = 'rgba(255,255,255,0.4)';
        c.fillRect(4, 4, 2, 2);
        c.fillRect(20, 14, 2, 2);
    } else if (id === B.SOUL_SAND) {
        // Soul Sand — тёмная зернистая поверхность с «лицами душ».
        c.fillStyle = '#3e2a20'; c.fillRect(0, 0, sz, sz);
        const tones = ['#4a342a', '#5a3e2e', '#332220', '#6a4838'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.25) {
                    c.fillStyle = tones[(rnd() * tones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // Тёмные пятна — «лица» застрявших душ.
        c.fillStyle = '#1a0e08';
        const faces = [{ x: 5, y: 6 }, { x: 18, y: 18 }, { x: 22, y: 7 }];
        faces.forEach(f => {
            c.fillRect(f.x, f.y, 4, 5);
            c.fillRect(f.x + 1, f.y + 2, 2, 1);
        });
        // Слабый зеленовато-серый блик — «душа».
        c.fillStyle = 'rgba(160, 180, 150, 0.18)';
        c.fillRect(5, 6, 2, 1);
        c.fillRect(18, 18, 2, 1);
    } else if (id === B.MAGMA_BLOCK) {
        // Magma Block — раскалённая чёрная корка с трещинами из лавы.
        c.fillStyle = '#2a0a04'; c.fillRect(0, 0, sz, sz);
        // Тёмная корка из тёмно-красных пятен.
        const crust = ['#3a120a', '#4a1810', '#2a0a04', '#5a1c10'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.3) {
                    c.fillStyle = crust[(rnd() * crust.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // Трещины с тлеющей лавой — ярко-оранжевые линии.
        const cracks = [
            { x: 4, y: 8, w: 10, h: 1 },
            { x: 14, y: 14, w: 8, h: 2 },
            { x: 6, y: 22, w: 12, h: 1 },
            { x: 20, y: 4, w: 6, h: 1 },
            { x: 0, y: 18, w: 5, h: 1 },
        ];
        cracks.forEach(cr => {
            c.fillStyle = '#ff6d00';
            c.fillRect(cr.x, cr.y, cr.w, cr.h);
            c.fillStyle = '#ffeb3b';
            c.fillRect(cr.x + 1, cr.y, Math.max(1, cr.w - 2), 1);
        });
        // Несколько мелких раскалённых точек.
        c.fillStyle = '#fff59d';
        c.fillRect(10, 8, 1, 1);
        c.fillRect(22, 22, 1, 1);
    } else if (id === B.NETHER_BRICK) {
        // Nether Bricks — тёмно-красная кладка со светлыми швами.
        c.fillStyle = '#1f0606'; c.fillRect(0, 0, sz, sz);
        // Сами кирпичи: 2 ряда по 4 элемента, со сдвигом как в Minecraft.
        const brickH = 8;
        const brickW = 8;
        for (let row = 0; row < 4; row++) {
            const offsetX = (row % 2 === 0) ? 0 : -4;
            for (let col = -1; col < 5; col++) {
                const bx = col * brickW + offsetX;
                const by = row * brickH;
                if (bx + brickW <= 0 || bx >= sz) continue;
                // Базовый тёмно-красный кирпич.
                c.fillStyle = '#3a0a0a';
                c.fillRect(Math.max(0, bx + 1), by + 1, Math.min(brickW - 2, sz - bx - 2), brickH - 2);
                // Лёгкий блик сверху каждого кирпича.
                c.fillStyle = '#5a1414';
                c.fillRect(Math.max(0, bx + 1), by + 1, Math.min(brickW - 2, sz - bx - 2), 1);
                // Тень снизу.
                c.fillStyle = '#1a0404';
                c.fillRect(Math.max(0, bx + 1), by + brickH - 2, Math.min(brickW - 2, sz - bx - 2), 1);
                // Случайная «трещина» в кирпиче.
                if (rnd() < 0.25) {
                    c.fillStyle = '#0a0202';
                    c.fillRect(bx + 2 + (rnd() * 4 | 0), by + 3 + (rnd() * 2 | 0), 1, 1);
                }
            }
        }
        // Тёмные швы кладки.
        c.fillStyle = '#0a0202';
        for (let y = 0; y < sz; y += brickH) c.fillRect(0, y, sz, 1);
    } else if (id === B.PORTAL) {
        // Base texture for inventory (in-world is animated in drawPortalBlock)
        c.fillStyle = '#2a004d'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#7b1fa2';
        for (let i = 0; i < 40; i++) {
            const px = (rnd() * sz) | 0;
            const py = (rnd() * sz) | 0;
            c.fillRect(px, py, 2 + ((rnd() * 2) | 0), 1 + ((rnd() * 2) | 0));
        }
        c.fillStyle = '#ba68c8';
        for (let i = 0; i < 15; i++) {
            c.fillRect((rnd() * sz) | 0, (rnd() * sz) | 0, 2, 2);
        }
        c.fillStyle = 'rgba(255,255,255,0.2)';
        c.fillRect(0, 0, sz, sz);
    }

    // ----- Beta 1.1: Desert / Beach blocks -----
    if (id === B.SANDSTONE) {
        // Compressed sand: warm tan with horizontal banding (Minecraft look).
        c.fillStyle = '#e6d59a'; c.fillRect(0, 0, sz, sz);
        const tones = ['#d8c780', '#f0e0a5', '#cdbb6e', '#e8d99c'];
        for (let x = 0; x < sz; x += 2) {
            for (let y = 0; y < sz; y += 2) {
                if (rnd() > 0.45) {
                    c.fillStyle = tones[(rnd() * tones.length) | 0];
                    c.fillRect(x, y, 2, 2);
                }
            }
        }
        // Sediment bands.
        c.fillStyle = '#bca96a';
        c.fillRect(0, 4, sz, 1);
        c.fillRect(0, 14, sz, 1);
        c.fillRect(0, sz - 6, sz, 1);
        // Subtle top/bottom seam.
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fillRect(0, 0, sz, 1);
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.fillRect(0, sz - 1, sz, 1);
        return off;
    }
    if (id === B.CACTUS) {
        // Transparent sides — cactus column sits in the middle of the tile.
        c.clearRect(0, 0, sz, sz);
        const x0 = 4, w = sz - 8;
        // Main green column.
        c.fillStyle = '#2e7d32'; c.fillRect(x0, 0, w, sz);
        // Lighter centre highlight.
        c.fillStyle = '#388e3c'; c.fillRect(x0 + 2, 0, w - 4, sz);
        c.fillStyle = '#43a047'; c.fillRect(x0 + 6, 0, w - 12, sz);
        // Edges (darker outline).
        c.fillStyle = '#1b5e20';
        c.fillRect(x0, 0, 1, sz);
        c.fillRect(x0 + w - 1, 0, 1, sz);
        // White spines / areoles.
        c.fillStyle = '#cfd8dc';
        for (let yy = 4; yy < sz - 4; yy += 6) {
            c.fillRect(x0 + 1, yy, 1, 1);
            c.fillRect(x0 + w - 2, yy + 3, 1, 1);
        }
        // Top cap.
        c.fillStyle = '#2e7d32'; c.fillRect(x0, 0, w, 2);
        c.fillStyle = '#1b5e20'; c.fillRect(x0, 0, w, 1);
        return off;
    }
    if (id === B.DEAD_BUSH) {
        // Tumble-weed-ish brown twigs, transparent background.
        c.clearRect(0, 0, sz, sz);
        c.fillStyle = '#6d4c41';
        // Central trunk.
        c.fillRect(sz / 2 - 1, 8, 2, sz - 10);
        // Branches.
        c.fillRect(sz / 2 - 5, 12, 4, 2);
        c.fillRect(sz / 2 + 1, 16, 6, 2);
        c.fillRect(sz / 2 - 6, 18, 5, 2);
        c.fillRect(sz / 2 + 2, 22, 4, 2);
        c.fillRect(sz / 2 - 4, 24, 4, 2);
        // Tips (lighter twigs).
        c.fillStyle = '#8d6e63';
        c.fillRect(sz / 2 - 5, 12, 1, 2);
        c.fillRect(sz / 2 + 6, 16, 1, 2);
        c.fillRect(sz / 2 - 6, 18, 1, 2);
        c.fillRect(sz / 2 + 5, 22, 1, 2);
        // Small dry leaves.
        c.fillStyle = '#a1887f';
        c.fillRect(sz / 2 - 4, 13, 1, 1);
        c.fillRect(sz / 2 + 3, 17, 1, 1);
        c.fillRect(sz / 2 - 3, 19, 1, 1);
        return off;
    }

    return off;
}

function getTile(id) {
    if (!TILE_CACHE[id]) TILE_CACHE[id] = buildTile(id);
    return TILE_CACHE[id];
}

function getDoubleChestTile(part) {
    let key = "DOUBLE_CHEST_" + part;
    if (!TILE_CACHE[key]) {
        const sz = TILE_SIZE;
        const off = document.createElement('canvas');
        off.width = sz; off.height = sz;
        const c = off.getContext('2d');
        c.imageSmoothingEnabled = false;

        c.fillStyle = '#946031'; c.fillRect(0, 0, sz, sz);
        
        c.fillStyle = '#a8713d'; 
        if (part === 'left') c.fillRect(2, 2, sz - 2, 8); 
        else c.fillRect(0, 2, sz - 2, 8);
        
        c.fillStyle = '#835227'; 
        if (part === 'left') c.fillRect(2, 12, sz - 2, sz - 14);
        else c.fillRect(0, 12, sz - 2, sz - 14);

        c.fillStyle = '#6d421d';
        const rnd = psr(B.CHEST * 1337 + 7 + (part === 'left' ? 1 : 2));
        for (let i = 0; i < 8; i++) {
            let lx = part === 'left' ? 2 + (rnd()*(sz-6))|0 : (rnd()*(sz-6))|0;
            c.fillRect(lx, 2 + (rnd()*8)|0, 4+(rnd()*6)|0, 1);
            c.fillRect(lx, 12 + (rnd()*(sz-14))|0, 4+(rnd()*6)|0, 1);
        }

        c.fillStyle = '#261705';
        c.fillRect(0, 0, sz, 2); c.fillRect(0, sz-2, sz, 2);
        if (part === 'left') c.fillRect(0, 0, 2, sz);
        else c.fillRect(sz-2, 0, 2, sz);
        c.fillRect(0, 10, sz, 2);

        if (part === 'left') {
            c.fillRect(sz - 2, 7, 2, 6);
            c.fillStyle = '#a8a8a8'; c.fillRect(sz - 1, 8, 1, 4);
            c.fillStyle = '#d1d1d1'; c.fillRect(sz - 1, 8, 1, 1);
        } else {
            c.fillRect(0, 7, 2, 6);
            c.fillStyle = '#a8a8a8'; c.fillRect(0, 8, 1, 4);
        }
        
        TILE_CACHE[key] = off;
    }
    return TILE_CACHE[key];
}

// ---------------- DRAW BLOCK ----------------
// Поддерживает 2 режима:
// 1) drawBlock(c, x, y, id, size?) — как раньше, для рендера в инвентарях и т.д.
// 2) drawBlock(c, x, y, id, null, tx, ty) — мировой рендер с AO по соседям.
// V7: отрисовка жидкости с анимацией волн/пузырей и высотой по уровню

// PERF: Кешируем базовый "столб" жидкости (градиент + полупрозрачная дымка/жилы)
// — самая дорогая часть рендера. createLinearGradient + fillRect для сотен лавовых
// клеток в кадре жрал FPS. На анимацию остаются только дешёвые fillRect-вёрхушки.
// Ключ: водатип + размер тайла + высота заливки + tile_size. Для одного TILE_SIZE
// получается ~16 уникальных канвасов (8 уровней × 2 типа жидкости).
const LIQUID_BASE_CACHE = new Map();
function _getLiquidBase(isWaterType, sz, fillH) {
    const key = (isWaterType ? 'w' : 'l') + ':' + sz + ':' + fillH;
    let cv = LIQUID_BASE_CACHE.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = sz; cv.height = fillH;
    const cc = cv.getContext('2d');
    cc.imageSmoothingEnabled = false;
    if (isWaterType) {
        const grad = cc.createLinearGradient(0, 0, 0, fillH);
        grad.addColorStop(0, '#4fc3f7');
        grad.addColorStop(0.4, '#1e88e5');
        grad.addColorStop(1, '#0d47a1');
        cc.fillStyle = grad;
        cc.fillRect(0, 0, sz, fillH);
        cc.fillStyle = 'rgba(129,212,250,0.18)';
        cc.fillRect(0, 0, sz, fillH);
    } else {
        const grad = cc.createLinearGradient(0, 0, 0, fillH);
        grad.addColorStop(0, '#ffd54f');
        grad.addColorStop(0.25, 'rgba(255, 160, 20, 1)');
        grad.addColorStop(0.7, '#bf360c');
        grad.addColorStop(1, '#5d1c00');
        cc.fillStyle = grad;
        cc.fillRect(0, 0, sz, fillH);
    }
    LIQUID_BASE_CACHE.set(key, cv);
    return cv;
}

// PERF: спрайты AO-граней и -углов. Раньше каждая каменная клетка у воздуха
// порождала до 4 LinearGradient + 4 RadialGradient в кадре.
const AO_EDGE_CACHE = new Map();
function _getAOEdgeSprite(side, sz) {
    const key = side + ':' + sz;
    let cv = AO_EDGE_CACHE.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    if (side === 'top') {
        cv.width = sz; cv.height = 4;
        const cc = cv.getContext('2d');
        const g = cc.createLinearGradient(0, 0, 0, 4);
        g.addColorStop(0, 'rgba(255,255,255,0.2)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        cc.fillStyle = g; cc.fillRect(0, 0, sz, 4);
    } else if (side === 'bottom') {
        cv.width = sz; cv.height = 6;
        const cc = cv.getContext('2d');
        const g = cc.createLinearGradient(0, 0, 0, 6);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.4)');
        cc.fillStyle = g; cc.fillRect(0, 0, sz, 6);
    } else if (side === 'left') {
        cv.width = 4; cv.height = sz;
        const cc = cv.getContext('2d');
        const g = cc.createLinearGradient(0, 0, 4, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        cc.fillStyle = g; cc.fillRect(0, 0, 4, sz);
    } else { // right
        cv.width = 6; cv.height = sz;
        const cc = cv.getContext('2d');
        const g = cc.createLinearGradient(0, 0, 6, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.3)');
        cc.fillStyle = g; cc.fillRect(0, 0, 6, sz);
    }
    AO_EDGE_CACHE.set(key, cv);
    return cv;
}

const AO_CORNER_CACHE = new Map();
function _getAOCornerSprite(corner) {
    let cv = AO_CORNER_CACHE.get(corner);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = 8; cv.height = 8;
    const cc = cv.getContext('2d');
    // Центр радиального градиента — на угле клетки (тот, что прилегает к стенам).
    let cx = 0, cy = 0;
    if (corner === 'tl') { cx = 0; cy = 0; }
    else if (corner === 'tr') { cx = 8; cy = 0; }
    else if (corner === 'bl') { cx = 0; cy = 8; }
    else { cx = 8; cy = 8; }
    const g = cc.createRadialGradient(cx, cy, 0, cx, cy, 8);
    g.addColorStop(0, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cc.fillStyle = g;
    cc.fillRect(0, 0, 8, 8);
    AO_CORNER_CACHE.set(corner, cv);
    return cv;
}

function drawLiquidBlock(c, x, y, id, sz, tx, ty) {
    const b = BLOCKS[id];
    const lvl = b.level; // 0 = full, 7 = тончайшая полоска
    const isWaterType = b.liquid === 'water';
    // Если выше нас такая же жидкость — рисуем на всю высоту (смыкаемся).
    let topFull = false;
    if (world && tx !== undefined && ty !== undefined) {
        const above = world.getTile(tx, ty - 1);
        if (BLOCKS[above] && BLOCKS[above].liquid === b.liquid) topFull = true;
    }
    // Высота заливки по уровню: 0 → sz, 7 → ~sz/8. Между — линейная.
    // Если сверху такая же жидкость — всегда полный блок.
    const fillH = topFull ? sz : Math.max(Math.floor(sz * (1 - lvl / 8)), 4);
    const top = y + (sz - fillH);
    const TX = tx || 0, TY = ty || 0;
    const now = Date.now();

    if (isWaterType) {
        // --- ВОДА: глубинный градиент + двойные волны + пенная кромка ---
        // PERF: базовый градиент (+ бирюзовая дымка) вынесен в кеш.
        c.drawImage(_getLiquidBase(true, sz, fillH), x, top);

        // Поверхностная волна: только если сверху воздух (есть видимая поверхность).
        if (!topFull) {
            const waveA = Math.sin((now / 380) + TX * 0.55 + TY * 0.2);
            const waveB = Math.sin((now / 240) + TX * 0.9 - TY * 0.13);
            const surfH = 3;
            // Светлая капиллярная плёнка
            c.fillStyle = 'rgba(178,235,242,0.85)';
            c.fillRect(x, top, sz, 1);
            // Подсвеченный пенный гребень бегущий по фронту волны
            c.fillStyle = 'rgba(255,255,255,0.55)';
            const foamW = 6;
            const foamX = x + ((TX * 3 + ((now / 90) | 0)) % (sz - foamW + 1));
            c.fillRect(foamX, top, foamW, 1);
            // Легкая тень под кромкой
            c.fillStyle = 'rgba(13,71,161,0.35)';
            c.fillRect(x, top + surfH, sz, 1);
            // Микро-блики "ряби"
            c.fillStyle = 'rgba(255,255,255,0.35)';
            c.fillRect(x + 4 + ((waveA * 2) | 0), top + 1, 3, 1);
            c.fillRect(x + 14 - ((waveB * 2) | 0), top + 2, 4, 1);
            c.fillRect(x + 24 + ((waveA * 2) | 0), top + 1, 2, 1);
        } else {
            // Под водой: бегущие "лучи" света от поверхности — более глубокий эффект.
            const rayPhase = ((now / 800) + TX * 0.13 + TY * 0.07) % 1;
            c.fillStyle = `rgba(178,235,242,${0.05 + 0.05 * Math.sin(now / 600 + TX)})`;
            const rayX = x + ((rayPhase * sz) | 0);
            c.fillRect(rayX, top, 2, fillH);
        }

        // Поднимающиеся пузырьки (только в толще воды).
        const bubbleSlot = ((TX * 17 + TY * 31) % 9);
        const bubblePhase = ((now / 1100) + (TX + TY) * 0.13) % 1;
        if (bubbleSlot < 3 && fillH > 8) {
            const bx = x + 3 + ((TX * 7 + bubbleSlot * 5) % (sz - 6));
            const by = top + 4 + ((1 - bubblePhase) * (fillH - 6)) | 0;
            c.fillStyle = 'rgba(225,245,254,0.55)';
            c.fillRect(bx, by, 2, 2);
            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.fillRect(bx, by, 1, 1);
        }
    } else {
        // --- ЛАВА: горячий градиент + анимированные жилы магмы + искры + тлеющий жар ---
        const pulse = (Math.sin(now / 700 + TX * 0.3 + TY * 0.2) + 1) / 2;

        // PERF: базовый градиент вынесен в кеш. Пульсирующий оранжевый стоп
        // имитируем дешёвым полупрозрачным оверлеем.
        c.drawImage(_getLiquidBase(false, sz, fillH), x, top);
        if (pulse > 0.05) {
            c.fillStyle = `rgba(255, 200, 50, ${(pulse * 0.18).toFixed(3)})`;
            c.fillRect(x, top, sz, Math.min(fillH, (sz * 0.35) | 0));
        }

        // Анимированные жилы магмы — синусоидальная "сетка трещин" текущая по поверхности.
        c.fillStyle = `rgba(255, ${190 + (pulse * 40) | 0}, 60, 0.35)`;
        for (let vy2 = 0; vy2 < fillH; vy2 += 4) {
            const off = Math.sin((now / 600) + (TX * 0.4) + (vy2 * 0.5)) * 3;
            const vx2 = x + ((sz / 2 + off) | 0);
            c.fillRect(vx2, top + vy2, 2, 2);
        }

        // Тёмная "корка"-шлак (медленно дрейфует).
        c.fillStyle = 'rgba(30,15,5,0.55)';
        const slagX1 = x + 2 + ((TX * 5 + ((now / 1500) | 0)) % (sz - 8));
        const slagY1 = top + 4 + ((TY * 3) % Math.max(2, fillH - 6));
        c.fillRect(slagX1, slagY1, 4, 2);
        const slagX2 = x + 14 + ((TY * 7) % 10);
        const slagY2 = top + 9 + ((TX * 2) % Math.max(2, fillH - 11));
        if (slagY2 < top + fillH - 1) c.fillRect(slagX2, slagY2, 3, 2);

        // Поверхность только если сверху воздух.
        if (!topFull) {
            // Раскалённый верхний кант
            c.fillStyle = '#fff176';
            c.fillRect(x, top, sz, 1);
            c.fillStyle = `rgba(255, ${200 + (pulse * 50) | 0}, 80, 0.9)`;
            c.fillRect(x, top + 1, sz, 1);

            // Бегущая огненная искра-всполох
            c.fillStyle = '#ffeb3b';
            const sparkX = x + ((TX * 11 + ((now / 110) | 0)) % (sz - 2));
            c.fillRect(sparkX, top, 2, 1);

            // Тлеющий "жар"-свечение над поверхностью (полупрозрачный halo).
            const haloAlpha = 0.20 + 0.10 * pulse;
            c.fillStyle = `rgba(255, 170, 60, ${haloAlpha})`;
            c.fillRect(x, top - 2, sz, 2);
            c.fillStyle = `rgba(255, 220, 120, ${haloAlpha * 0.6})`;
            c.fillRect(x, top - 1, sz, 1);
        }

        // Случайные тлеющие угольки (мерцание в массе магмы).
        if ((((TX * 13 + TY * 29) + ((now / 180) | 0)) % 7) === 0) {
            c.fillStyle = '#fff59d';
            const ex = x + 4 + ((TX * 3) % (sz - 6));
            const ey = top + 3 + ((TY * 5) % Math.max(2, fillH - 5));
            c.fillRect(ex, ey, 1, 1);
        }
    }
}


// ------------------------------------------------------------------
// Animated Portal and Obsidian (Nether) functions
// ------------------------------------------------------------------

function drawObsidianBlock(c, x, y, sz, tx, ty) {
    const tile = getTile(B.OBSIDIAN);
    c.drawImage(tile, x, y, sz, sz);
    
    // Продвинутая анимация "Плачущего Обсидиана" (светящиеся магические прожилки)
    const now = Date.now();
    // Создаем сложный паттерн пульсации, уникальный для каждого блока
    const phase1 = (tx * 7.3 + ty * 11.7) * 0.2;
    const phase2 = (tx * 13.1 + ty * 5.3) * 0.15;
    
    // Двойная синусоида для более органичного пульсирующего свечения
    const pulse = (Math.sin(now / 800 + phase1) * 0.5 + Math.sin(now / 450 + phase2) * 0.5 + 1) / 2;
    
    if (pulse > 0.05) {
        c.save();
        c.globalCompositeOperation = 'lighter'; // Делаем свечение аддитивным (ярким и магическим)
        
        // Рисуем светящиеся прожилки (магические трещины в обсидиане)
        c.fillStyle = `rgba(168, 0, 255, ${pulse * 0.55})`;
        c.fillRect(x + 4, y + 6, 2, 3);
        c.fillRect(x + 5, y + 9, 2, 4);
        c.fillRect(x + 20, y + 15, 3, 2);
        c.fillRect(x + 22, y + 17, 2, 5);
        c.fillRect(x + 12, y + 22, 4, 2);
        
        // Внутреннее яркое ядро свечения прожилок
        c.fillStyle = `rgba(224, 100, 255, ${pulse * 0.8})`;
        c.fillRect(x + 5, y + 7, 1, 2);
        c.fillRect(x + 6, y + 10, 1, 2);
        c.fillRect(x + 21, y + 16, 1, 1);
        c.fillRect(x + 23, y + 18, 1, 2);
        c.fillRect(x + 13, y + 23, 2, 1);
        
        // Случайные вспышки "слез" энергии вокруг
        if (Math.random() < 0.03 * pulse) {
            c.fillStyle = 'rgba(255, 180, 255, 0.9)';
            const sparkX = x + 2 + Math.random() * (sz - 4);
            const sparkY = y + 2 + Math.random() * (sz - 4);
            c.fillRect(sparkX, sparkY, 1, 1);
        }
        
        c.restore();
    }
}

function drawPortalBlock(c, x, y, sz, tx, ty) {
    const now = Date.now();
    const phaseX = tx * 0.8;
    const phaseY = ty * 0.8;
    
    // Deep purple background
    c.fillStyle = '#2a004d';
    c.fillRect(x, y, sz, sz);
    
    // Swirling gradients
    c.save();
    c.beginPath();
    c.rect(x, y, sz, sz);
    c.clip();
    
    for (let i = 0; i < 3; i++) {
        const offset = Math.sin(now / 500 + phaseX + phaseY + i * 2) * (sz / 2);
        const grad = c.createLinearGradient(x, y + offset, x + sz, y + sz - offset);
        grad.addColorStop(0, 'rgba(123, 31, 162, 0.4)');
        grad.addColorStop(0.5, 'rgba(186, 104, 200, 0.7)');
        grad.addColorStop(1, 'rgba(74, 20, 140, 0.4)');
        c.fillStyle = grad;
        c.fillRect(x, y, sz, sz);
    }
    
    // Moving particles inside the portal
    c.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let p = 0; p < 5; p++) {
        const px = x + ((now / (40 + p * 5) + tx * 13 + p * 17) % sz);
        let py = y + ((now / (50 + p * 7) + ty * 11 + p * 23) % sz);
        if (p % 2 === 0) {
            // Reverse direction for some particles
            py = y + (sz - ((now / (45 + p * 3) + ty * 11 + p * 23) % sz));
        }
        c.fillRect(px, py, 2, 2);
    }
    
    c.restore();
}

// Animated fire renderer — Minecraft-style flickering flames.
// Stationary palette + sinusoidal flame columns that wobble + bright core + a
// few darting sparks. Drawn fresh every frame so it visibly burns instead of
// sitting there as a static red blob like before.
function drawFireBlock(c, x, y, sz, tx, ty) {
    const TX = tx || 0, TY = ty || 0;
    const now = Date.now();
    // Per-tile phase so neighbouring fires aren't perfectly in sync.
    const phase = (TX * 37 + TY * 17) * 0.13;
    // Master flicker amplitude (0..1) — modulates flame height and brightness.
    const flick = 0.55 + 0.45 * Math.sin(now / 90 + phase);

    // Flame body — three vertical "columns" with phase-offset sine wobble.
    // Heights are biased so the centre column is tallest, like a real flame.
    const cols = [
        { dx: 6,  baseH: sz * 0.55, w: 4 },
        { dx: 13, baseH: sz * 0.85, w: 6 },
        { dx: 22, baseH: sz * 0.55, w: 4 },
    ];

    // Dark base shadow (looks like soot/ember at the foot of the flame).
    c.fillStyle = 'rgba(80, 30, 0, 0.55)';
    c.fillRect(x + 4, y + sz - 4, sz - 8, 4);

    for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const wob = Math.sin(now / 110 + phase + i * 1.3) * 1.5;
        const h = col.baseH * (0.75 + 0.25 * flick);
        const cx = x + col.dx + wob;
        const top = y + sz - h;
        // Outer orange envelope
        c.fillStyle = '#ff6f00';
        c.fillRect(cx - col.w / 2, top, col.w, h);
        // Inner yellow tongue
        c.fillStyle = '#ffb300';
        c.fillRect(cx - (col.w - 2) / 2, top + 2, col.w - 2, h - 2);
        // Hot white core near the base
        if (col.w >= 5) {
            c.fillStyle = '#fff59d';
            c.fillRect(cx - 1, y + sz - h * 0.45, 2, h * 0.4);
        }
    }

    // Wisps & sparks — small bright pixels darting upward.
    const sparkSeed = ((now / 70) | 0) + (TX * 7 + TY * 11);
    const r1 = ((sparkSeed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const r2 = ((sparkSeed * 22695477 + 1) >>> 0) / 4294967296;
    if (r1 < 0.6) {
        c.fillStyle = '#ffeb3b';
        c.fillRect(x + (r1 * sz) | 0, y + (r2 * sz * 0.7) | 0, 1, 1);
    }
    if (r2 < 0.4) {
        c.fillStyle = '#fff';
        c.fillRect(x + ((1 - r1) * sz) | 0, y + (r1 * sz * 0.6) | 0, 1, 1);
    }

    // Soft glow halo above the flame — only when there's air upward.
    if (world && world.getTile && world.getTile(TX, TY - 1) === B.AIR) {
        c.fillStyle = `rgba(255, 170, 60, ${0.10 + 0.08 * flick})`;
        c.fillRect(x, y - 3, sz, 3);
    }
}

function drawBlock(c, x, y, id, size, tx, ty, layerMode) {
    const sz = size || TILE_SIZE;
    const b = BLOCKS[id];
    if (!b) return;
    const isBgOrFg = (layerMode === LAYER.BG || layerMode === LAYER.FG);

    // V7: жидкости рисуем вручную (анимация + высота уровня).
    // В BG/FG жидкости — чисто декорация: рисуем статичный спрайт без симуляции/уровней.
    if (b.liquid) {
        if (isBgOrFg) {
            const liqTile = getTile(id);
            if (sz === TILE_SIZE) c.drawImage(liqTile, x, y);
            else c.drawImage(liqTile, x, y, sz, sz);
            return;
        }
        drawLiquidBlock(c, x, y, id, sz, tx, ty);
        return;
    }

    // Fire — animated flames. Inventory mode (tx/ty undefined) keeps the
    // cached static tile so it reads as a fire glyph in the hotbar/HUD.
    if (id === B.FIRE && tx !== undefined && ty !== undefined) {
        drawFireBlock(c, x, y, sz, tx, ty);
        return;
    }

    // Portal animation
    if (id === B.PORTAL && tx !== undefined && ty !== undefined) {
        drawPortalBlock(c, x, y, sz, tx, ty);
        return;
    }

    // Obsidian pulsing runes animation
    if (id === B.OBSIDIAN && tx !== undefined && ty !== undefined) {
        drawObsidianBlock(c, x, y, sz, tx, ty);
        return;
    }

    // Для не-стандартного размера (инвентарь) рендерим из кеша со scale.
    let tile = getTile(id);

    if (id === B.CHEST && tx !== undefined && ty !== undefined && world) {
        if (world.getTile(tx - 1, ty) === B.CHEST) {
            tile = getDoubleChestTile('right');
        } else if (world.getTile(tx + 1, ty) === B.CHEST) {
            tile = getDoubleChestTile('left');
        }
    }

    // Анимация установки блока убрана по запросу пользователя

    // факел — прозрачный фон, сохраняем прозрачность
    if (id === B.TORCH_PLACED) {
        // V12: учитываем направление установки (up / left / right / bg)
        const meta = (tx !== undefined && ty !== undefined) ? getBlockMeta(tx, ty, layerMode === undefined ? LAYER.MID : layerMode) : null;
        const dir = (meta && meta.dir) ? meta.dir : 'up';
        const scale = sz / TILE_SIZE;
        c.save();
        // переносим в центр клетки, применяем поворот для side-mount, рисуем
        c.translate(x + sz / 2, y + sz / 2);
        if (dir === 'left') {
            // факел висит на блоке слева — наклон вправо
            c.translate(-sz * 0.32, sz * 0.05);
            c.rotate(Math.PI / 6); // ~30° по часовой
        } else if (dir === 'right') {
            // факел висит на блоке справа — наклон влево
            c.translate(sz * 0.32, sz * 0.05);
            c.rotate(-Math.PI / 6);
        }
        // up / bg — стоит вертикально по центру
        c.drawImage(tile, -sz / 2, -sz / 2, sz, sz);
        c.restore();
        // Блик пламени: в FG оставляем (факел светит), в BG скрываем (за стеной).
        if (layerMode !== LAYER.BG && dir !== 'bg') {
            const t = Date.now() / 90;
            const flick = Math.sin(t + (tx || 0) * 0.3) > 0 ? 1 : 0;
            c.fillStyle = 'rgba(255,255,180,0.6)';
            // Базовое положение пламени для 'up'. Для боковых ориентаций сместим.
            let fx, fy;
            if (dir === 'left') { fx = x + 4 * scale; fy = y + (10 + flick) * scale; }
            else if (dir === 'right') { fx = x + (sz - 8 * scale); fy = y + (10 + flick) * scale; }
            else { fx = x + 14 * scale; fy = y + (7 + flick) * scale; }
            c.fillRect(fx, fy, 4 * scale, 3 * scale);
        }
        return;
    }

    // V12: ladder, lever, door, trapdoor — drawn procedurally based on meta
    if (id === B.LADDER || id === B.LEVER || id === B.WOOD_DOOR || id === B.WOOD_TRAPDOOR || id === B.WOOD_GATE) {
        // Inventory / icon mode (no world coordinates): draw a recognizable "open" door silhouette,
        // a closed trapdoor strip, an off-lever, and a ladder.
        const inventoryMode = (tx === undefined || ty === undefined);
        const meta = inventoryMode ? null : getBlockMeta(tx, ty, layerMode === undefined ? LAYER.MID : layerMode);
        c.save();
        c.translate(x + sz / 2, y + sz / 2);

        if (id === B.LADDER) {
            c.drawImage(tile, -sz / 2, -sz / 2, sz, sz);
            c.restore();
            return;
        }

        if (id === B.LEVER) {
            const dir = (meta && meta.dir) ? meta.dir : 'up';
            const state = (meta && meta.state) || 'off';
            if (dir === 'down') c.rotate(Math.PI);
            else if (dir === 'left') c.rotate(Math.PI / 2);
            else if (dir === 'right') c.rotate(-Math.PI / 2);
            drawLeverShape(c, sz, state);
            c.restore();
            return;
        }

        if (id === B.WOOD_DOOR) {
            const rot = (meta && meta.rot) || 0;
            // Inventory: full silhouette so the icon looks like a door.
            // World: respect state/half from meta.
            const state = inventoryMode ? 'open' : ((meta && meta.state) || 'closed');
            const half = (meta && meta.half) || 'bottom';
            c.rotate((rot * Math.PI) / 2);
            drawDoorHalf(c, sz, state, half);
            c.restore();
            return;
        }

        if (id === B.WOOD_TRAPDOOR) {
            const rot = (meta && meta.rot) || 0;
            const state = (meta && meta.state) || 'closed';
            c.rotate((rot * Math.PI) / 2);
            drawTrapdoorShape(c, sz, state);
            c.restore();
            return;
        }

        if (id === B.WOOD_GATE) {
            const state = (meta && meta.state) || 'closed';
            const tx = -sz / 2, ty = -sz / 2;
            const u = sz / 32;
            
            if (state === 'closed') {
                c.fillStyle = '#5d4037';
                c.fillRect(tx, ty + 8 * u, 4 * u, sz - 8 * u);
                c.fillRect(tx + sz - 4 * u, ty + 8 * u, 4 * u, sz - 8 * u);
                c.fillStyle = '#795548';
                c.fillRect(tx + 4 * u, ty + 12 * u, sz - 8 * u, 4 * u);
                c.fillRect(tx + 4 * u, ty + 22 * u, sz - 8 * u, 4 * u);
                c.fillStyle = '#4e342e';
                c.fillRect(tx + sz / 2 - 1 * u, ty + 12 * u, 2 * u, 14 * u);
            } else {
                c.fillStyle = '#5d4037';
                c.fillRect(tx, ty + 8 * u, 4 * u, sz - 8 * u);
                c.fillRect(tx + sz - 4 * u, ty + 8 * u, 4 * u, sz - 8 * u);
                c.fillStyle = '#795548';
                c.fillRect(tx + 4 * u, ty + 10 * u, 4 * u, sz - 12 * u);
                c.fillRect(tx + sz - 8 * u, ty + 10 * u, 4 * u, sz - 12 * u);
            }
            c.restore();
            return;
        }

        c.restore();
    }

    // V12: rotation for stairs/logs (wood) via meta.rot
    if ((id === B.WOOD_STAIRS || id === B.COBBLE_STAIRS || id === B.STONE_STAIRS || id === B.BRICK_STAIRS || id === B.WOOD)
        && tx !== undefined && ty !== undefined) {
        const meta = getBlockMeta(tx, ty, layerMode === undefined ? LAYER.MID : layerMode);
        const rot = (meta && meta.rot) || 0;
        if (rot !== 0) {
            c.save();
            c.translate(x + sz / 2, y + sz / 2);
            c.rotate((rot * Math.PI) / 2);
            c.drawImage(tile, -sz / 2, -sz / 2, sz, sz);
            c.restore();
            // Apply later AO/FX effects on the rotated tile is awkward; for stairs we already return.
            if (id !== B.WOOD) return;
            return;
        }
    }

    // Procedural fences with dynamic connections
    if (id === B.WOOD_FENCE || id === B.COBBLE_FENCE || id === B.BRICK_FENCE) {
        c.save();
        c.translate(x, y);
        c.scale(sz / 32, sz / 32); // Scale to 32x32 logic
        let baseCol, hi, lo;
        if (id === B.WOOD_FENCE) { baseCol = '#a67d53'; hi = '#bc9062'; lo = '#8f6841'; }
        else if (id === B.COBBLE_FENCE) { baseCol = '#7a7a7a'; hi = '#9a9a9a'; lo = '#5a5a5a'; }
        else { baseCol = '#8d3e2b'; hi = '#a64e35'; lo = '#5d2818'; }

        // Draw pole
        const postW = 6;
        const postX = 32 / 2 - 3;
        c.fillStyle = baseCol; c.fillRect(postX, 0, postW, 32);
        c.fillStyle = hi; c.fillRect(postX, 0, 1, 32);
        c.fillStyle = lo; c.fillRect(postX + postW - 1, 0, 1, 32);

        // Connections
        const inventoryMode = (tx === undefined || ty === undefined);
        let leftConn = inventoryMode, rightConn = inventoryMode;
        if (!inventoryMode && world && typeof world.getTile === 'function') {
            const tLeft = world.getTile(tx - 1, ty);
            const tRight = world.getTile(tx + 1, ty);
            const isSolid = (tid) => {
                if (!tid || tid === B.AIR) return false;
                if (tid === B.WOOD_FENCE || tid === B.COBBLE_FENCE || tid === B.BRICK_FENCE) return true;
                return BLOCKS[tid] && BLOCKS[tid].hard > 0 && !BLOCKS[tid].liquid && tid !== B.GLASS && tid !== B.LADDER;
            };
            leftConn = isSolid(tLeft);
            rightConn = isSolid(tRight);
        }

        const railH = 4;
        const rail1Y = 8;
        const rail2Y = 20;

        if (leftConn) {
            c.fillStyle = baseCol; c.fillRect(0, rail1Y, postX, railH); c.fillRect(0, rail2Y, postX, railH);
            c.fillStyle = hi; c.fillRect(0, rail1Y, postX, 1); c.fillRect(0, rail2Y, postX, 1);
            c.fillStyle = lo; c.fillRect(0, rail1Y + railH - 1, postX, 1); c.fillRect(0, rail2Y + railH - 1, postX, 1);
        }
        if (rightConn) {
            const rStart = postX + postW;
            const rW = 32 - rStart;
            c.fillStyle = baseCol; c.fillRect(rStart, rail1Y, rW, railH); c.fillRect(rStart, rail2Y, rW, railH);
            c.fillStyle = hi; c.fillRect(rStart, rail1Y, rW, 1); c.fillRect(rStart, rail2Y, rW, 1);
            c.fillStyle = lo; c.fillRect(rStart, rail1Y + railH - 1, rW, 1); c.fillRect(rStart, rail2Y + railH - 1, rW, 1);
        }

        // Redraw pole on top for depth
        c.fillStyle = baseCol; c.fillRect(postX, 0, postW, 32);
        c.fillStyle = hi; c.fillRect(postX, 0, 1, 32);
        c.fillStyle = lo; c.fillRect(postX + postW - 1, 0, 1, 32);

        c.restore();
        return;
    }

    if (sz === TILE_SIZE) {
        c.drawImage(tile, x, y);
    } else {
        c.drawImage(tile, x, y, sz, sz);
    }

    // Анимации/AO ниже читают MID-соседей через world.getTile → для BG/FG это даёт некорректную картинку.
    // Поэтому пропускаем все «глобальные» эффекты для декоративных слоёв.
    if (isBgOrFg) return;

    // --- V13: Jukebox — twirling note glyphs above when a disc is playing ---
    if (id === B.JUKEBOX && tx !== undefined && world) {
        const meta = getBlockMeta(tx, ty, layerMode === undefined ? LAYER.MID : layerMode);
        const playing = meta && meta.disc && game.audio
            && game.audio.activeDiscs && game.audio.activeDiscs[`${tx},${ty}`];
        if (playing) {
            const t = Date.now() / 220;
            // Two notes drifting upward, fading out
            for (let i = 0; i < 2; i++) {
                const phase = (t + i * 1.7) % 2; // 0..2 sec loop per note
                const alpha = Math.max(0, 1 - phase / 2);
                const dy = -phase * 8;
                const dx = Math.sin((t + i) * 3) * 4;
                c.fillStyle = `rgba(255,255,255,${alpha * 0.85})`;
                c.fillRect(x + 14 + dx, y - 8 + dy, 2, 4);
                c.fillRect(x + 13 + dx, y - 4 + dy, 4, 2);
            }
        }
    }

    // --- Анимация пламени у печки ---
    if (id === B.FURNACE && tx !== undefined && world && world.furnaces) {
        const key = `${tx},${ty}`;
        if (world.furnaces[key] && world.furnaces[key].fuelTime > 0) {
            const t = Date.now() / 120;
            const flick = (Math.sin(t + tx * 0.3 + ty * 0.1) + 1) / 2;
            c.fillStyle = `rgba(255,220,130,${0.4 + flick * 0.4})`;
            c.fillRect(x + 12, y + 22, 8, 3);
            c.fillStyle = `rgba(255,140,0,${0.3 + flick * 0.3})`;
            c.fillRect(x + 10, y + 25, 12, 2);
        }
    }

    // --- Руда: мягкая пульсация блика ночью / в пещере (только для world режима) ---
    if (tx !== undefined && (id === B.DIAMOND_ORE || id === B.GOLD_ORE)) {
        const t = Date.now() / (id === B.DIAMOND_ORE ? 400 : 600);
        const pulse = (Math.sin(t + tx * 0.2 + ty * 0.15) + 1) / 2;
        const col = id === B.DIAMOND_ORE ? `rgba(178,235,242,${pulse * 0.4})`
            : `rgba(255,238,88,${pulse * 0.3})`;
        c.fillStyle = col;
        c.fillRect(x + 11, y + 9, 1, 1);
        c.fillRect(x + 22, y + 20, 1, 1);
    }

    // --- AO по соседям: затемняем грани, где соседний блок — воздух/пустота ---
    if (tx !== undefined && ty !== undefined && sz === TILE_SIZE && !b.pass) {
        const airUp = isAirOrPass(world.getTile(tx, ty - 1));
        const airDown = isAirOrPass(world.getTile(tx, ty + 1));
        const airLeft = isAirOrPass(world.getTile(tx - 1, ty));
        const airRight = isAirOrPass(world.getTile(tx + 1, ty));

        // PERF: AO кешируется в спрайтах per-side / per-corner. Это снимает
        // тысячи createLinearGradient/RadialGradient в каждом кадре в пещерах.
        if (airUp)    c.drawImage(_getAOEdgeSprite('top', sz),    x, y);
        if (airDown)  c.drawImage(_getAOEdgeSprite('bottom', sz), x, y + sz - 6);
        if (airLeft)  c.drawImage(_getAOEdgeSprite('left', sz),   x, y);
        if (airRight) c.drawImage(_getAOEdgeSprite('right', sz),  x + sz - 6, y);

        // Угловые тени (AO corner) — внутренние углы пещер
        const solidTL = !isAirOrPass(world.getTile(tx - 1, ty - 1));
        const solidTR = !isAirOrPass(world.getTile(tx + 1, ty - 1));
        const solidBL = !isAirOrPass(world.getTile(tx - 1, ty + 1));
        const solidBR = !isAirOrPass(world.getTile(tx + 1, ty + 1));

        if (!airUp && !airLeft && airRight && airDown && solidTL) c.drawImage(_getAOCornerSprite('tl'), x, y);
        if (!airUp && !airRight && airLeft && airDown && solidTR) c.drawImage(_getAOCornerSprite('tr'), x + sz - 8, y);
        if (!airDown && !airLeft && airRight && airUp && solidBL) c.drawImage(_getAOCornerSprite('bl'), x, y + sz - 8);
        if (!airDown && !airRight && airLeft && airUp && solidBR) c.drawImage(_getAOCornerSprite('br'), x + sz - 8, y + sz - 8);
    }
    // HOTFIX: убран битый вызов `if (scaleProg !== 1) c.restore();` —
    // переменная scaleProg была удалена при демонтаже анимации, но строка осталась
    // и крашила весь рендер через ReferenceError на каждом блоке.
}

function isAirOrPass(id) {
    if (id === undefined || id === null) return true;
    if (id === B.AIR) return true;
    const bb = BLOCKS[id];
    return !!(bb && bb.pass);
}

// Start
game.init();

document.addEventListener('mousemove', (e) => {
    const dContainer = document.getElementById('inv-details');
    if (dContainer && dContainer.style.display === 'flex') {
        let x = e.clientX + 15;
        let y = e.clientY + 15;
        const w = dContainer.offsetWidth || 200;
        const h = dContainer.offsetHeight || 100;
        if (x + w > window.innerWidth) x = e.clientX - w - 15;
        if (y + h > window.innerHeight) y = e.clientY - h - 15;
        dContainer.style.left = x + 'px';
        dContainer.style.top = y + 'px';
    }
});