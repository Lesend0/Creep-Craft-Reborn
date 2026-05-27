const fs = require("fs");
let c = fs.readFileSync("game.js", "utf-8");

// 1. Block ID
c = c.replace(
    "WOOD_FENCE: 80, COBBLE_FENCE: 81, BRICK_FENCE: 82,",
    "WOOD_FENCE: 80, COBBLE_FENCE: 81, BRICK_FENCE: 82, WOOD_GATE: 83,"
);

// 2. Fire Flammability
c = c.replace(
    "set(B.WOOD_TRAPDOOR,   20, 5);",
    "set(B.WOOD_TRAPDOOR,   20, 5);\n    set(B.WOOD_GATE,       20, 5);"
);

// 3. Sounds
c = c.replace(
    "[B.WOOD_DOOR]: 'wood', [B.WOOD_TRAPDOOR]: 'wood', [B.LEVER]: 'wood', [B.LADDER]: 'wood',",
    "[B.WOOD_DOOR]: 'wood', [B.WOOD_TRAPDOOR]: 'wood', [B.LEVER]: 'wood', [B.LADDER]: 'wood', [B.WOOD_GATE]: 'wood',"
);

// 4. Description
c = c.replace(
    /(\[B\.WOOD_TRAPDOOR\]: \{ desc: ".*?", funny: ".*?" \},)/,
    "$1\n    [B.WOOD_GATE]: { desc: \"Wooden fence gate. RMB to open/close.\", funny: \"A polite way to say 'keep out'.\" },"
);

// 5. Attributes (color, hard, pass)
c = c.replace(
    "[B.WOOD_TRAPDOOR]: { color: '#8d6e63', hard: 3, pass: true },",
    "[B.WOOD_TRAPDOOR]: { color: '#8d6e63', hard: 3, pass: true },\n    [B.WOOD_GATE]: { color: '#8d6e63', hard: 3, pass: true },"
);

// 6. Mining time
c = c.replace(
    "[B.WOOD_DOOR]: 10, [B.WOOD_TRAPDOOR]: 7, [B.LADDER]: 5, [B.LEVER]: 3, [B.BOOKSHELF_SLAB]: 7,",
    "[B.WOOD_DOOR]: 10, [B.WOOD_TRAPDOOR]: 7, [B.LADDER]: 5, [B.LEVER]: 3, [B.BOOKSHELF_SLAB]: 7, [B.WOOD_GATE]: 10,"
);

// 7. Crafting Recipe (assume 4 sticks, 2 planks for a gate = 1 gate)
c = c.replace(
    "{ out: { id: B.WOOD_TRAPDOOR, n: 2 }, shape: [['M','M','M'],['M','M','M']], key: { M: ITEMS.PLANK }, reqBench: true },",
    "{ out: { id: B.WOOD_TRAPDOOR, n: 2 }, shape: [['M','M','M'],['M','M','M']], key: { M: ITEMS.PLANK }, reqBench: true },\n    { out: { id: B.WOOD_GATE, n: 1 }, shape: [['S','M','S'],['S','M','S']], key: { S: ITEMS.STICK, M: ITEMS.PLANK }, reqBench: true },"
);

// 8. Render layering hint (r array)
c = c.replace(
    "r[B.WOOD_TRAPDOOR] = 15;",
    "r[B.WOOD_TRAPDOOR] = 15;\n    r[B.WOOD_GATE] = 15;"
);

// 9. Collision (solid if closed)
c = c.replace(
    "if (t === B.WOOD_TRAPDOOR) {\n            const m = this.blockMeta && this.blockMeta[`${x},${y},${LAYER.MID}`];\n            return !(m && m.state === 'open');\n        }",
    "if (t === B.WOOD_TRAPDOOR || t === B.WOOD_GATE) {\n            const m = this.blockMeta && this.blockMeta[`${x},${y},${LAYER.MID}`];\n            return !(m && m.state === 'open');\n        }"
);

// 10. Translation/Name
c = c.replace(
    "[B.WOOD_DOOR]: 'Wooden Door', [B.WOOD_TRAPDOOR]: 'Wooden Trapdoor',",
    "[B.WOOD_DOOR]: 'Wooden Door', [B.WOOD_TRAPDOOR]: 'Wooden Trapdoor', [B.WOOD_GATE]: 'Wooden Gate',"
);

// 11. ROTATION_SUPPORT
c = c.replace(
    "B.WOOD_DOOR, B.WOOD_TRAPDOOR,",
    "B.WOOD_DOOR, B.WOOD_TRAPDOOR, B.WOOD_GATE,"
);

// 12. Pathfinding pass support (maybe not needed as pass=true) - wait, there is this:
// if (t !== B.WOOD_TRAPDOOR) return false;
c = c.replace(
    "if (t !== B.WOOD_TRAPDOOR) return false;",
    "if (t !== B.WOOD_TRAPDOOR && t !== B.WOOD_GATE) return false;"
);

// 13. Block Place Logic
let placeLogic = `} else if (item && item.id === B.WOOD_TRAPDOOR) {
                    if (tid === B.AIR) {
                        world.setTile(tx, ty, B.WOOD_TRAPDOOR);
                        setBlockMeta(tx, ty, { rot: pendingRotation, state: 'closed' }, LAYER.MID);
                        player.inv.remove(B.WOOD_TRAPDOOR, 1);
                        game.audio.playSound('place');
                        game.updateHUD();
                    } else if (tid === B.WOOD_TRAPDOOR) {
                        const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                        m.state = (m.state === 'open') ? 'closed' : 'open';
                        game.audio.playSound('place');
                    }
                    mouse.down = false;`;

let gatePlaceLogic = placeLogic + `
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
                        game.audio.playSound('place');
                    }
                    mouse.down = false;`;

c = c.replace(placeLogic, gatePlaceLogic);

// 14. RMB toggle
c = c.replace(
    "} else if (tid === B.WOOD_TRAPDOOR && (!item || item.id !== B.WOOD_TRAPDOOR)) {\n                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };\n                    m.state = (m.state === 'open') ? 'closed' : 'open';\n                    game.audio.playSound('place');\n                    mouse.down = false;",
    "} else if (tid === B.WOOD_TRAPDOOR && (!item || item.id !== B.WOOD_TRAPDOOR)) {\n                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };\n                    m.state = (m.state === 'open') ? 'closed' : 'open';\n                    game.audio.playSound('place');\n                    mouse.down = false;\n                } else if (tid === B.WOOD_GATE && (!item || item.id !== B.WOOD_GATE)) {\n                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };\n                    m.state = (m.state === 'open') ? 'closed' : 'open';\n                    game.audio.playSound('place');\n                    mouse.down = false;"
);

// 15. Tool speed (Axe)
c = c.replace(
    "B.WOOD_DOOR, B.WOOD_TRAPDOOR, B.LADDER, B.BOOKSHELF_SLAB].includes(tid))",
    "B.WOOD_DOOR, B.WOOD_TRAPDOOR, B.WOOD_GATE, B.LADDER, B.BOOKSHELF_SLAB].includes(tid))"
);

// 16. Inventory Drawing
let invDraw = `} else if (id === B.WOOD_TRAPDOOR) {
        // V12: Люк (closed = горизонтально, "лежит" в нижней части)
        c.clearRect(0, 0, sz, sz);
        c.fillStyle = '#6d4c41'; c.fillRect(0, sz - 6, sz, 6);
        c.fillStyle = '#4e342e'; c.fillRect(0, sz - 6, sz, 1); c.fillRect(0, sz - 1, sz, 1);
        c.fillStyle = '#3e2723'; c.fillRect(4, sz - 4, 6, 2); c.fillRect(sz - 10, sz - 4, 6, 2);
        return off;`;

let gateInvDraw = invDraw + `
    } else if (id === B.WOOD_GATE) {
        c.clearRect(0, 0, sz, sz);
        // Base posts
        c.fillStyle = '#5d4037';
        c.fillRect(4, 8, 4, sz - 8);
        c.fillRect(sz - 8, 8, 4, sz - 8);
        // Crossbars
        c.fillStyle = '#795548';
        c.fillRect(8, 12, sz - 16, 4);
        c.fillRect(8, 22, sz - 16, 4);
        return off;`;

c = c.replace(invDraw, gateInvDraw);

// 17. World Drawing (dynamic with meta)
// Look for `if (id === B.LADDER || id === B.LEVER || id === B.WOOD_DOOR || id === B.WOOD_TRAPDOOR) {`
c = c.replace(
    "if (id === B.LADDER || id === B.LEVER || id === B.WOOD_DOOR || id === B.WOOD_TRAPDOOR) {",
    "if (id === B.LADDER || id === B.LEVER || id === B.WOOD_DOOR || id === B.WOOD_TRAPDOOR || id === B.WOOD_GATE) {"
);

// Insert gate logic after trapdoor logic
let worldDraw = `if (id === B.WOOD_TRAPDOOR) {
            const rot = (meta && meta.rot) || 0;
            const state = (meta && meta.state) || 'closed';
            
            c.fillStyle = '#6d4c41';
            if (state === 'closed') {
                if (rot === 0 || rot === 2) {
                    c.fillRect(0, sz - 6, sz, 6);
                    c.fillStyle = '#4e342e'; c.fillRect(0, sz - 6, sz, 1);
                    c.fillStyle = '#3e2723'; c.fillRect(4, sz - 4, 6, 2); c.fillRect(sz - 10, sz - 4, 6, 2);
                } else {
                    c.fillRect(0, 0, sz, 6);
                    c.fillStyle = '#4e342e'; c.fillRect(0, 0, sz, 1);
                    c.fillStyle = '#3e2723'; c.fillRect(4, 2, 6, 2); c.fillRect(sz - 10, 2, 6, 2);
                }
            } else {
                if (rot === 0) {
                    c.fillRect(0, 0, 6, sz);
                    c.fillStyle = '#4e342e'; c.fillRect(0, 0, 1, sz);
                    c.fillStyle = '#3e2723'; c.fillRect(2, 4, 2, 6); c.fillRect(2, sz - 10, 2, 6);
                } else if (rot === 1) {
                    c.fillRect(sz - 6, 0, 6, sz);
                    c.fillStyle = '#4e342e'; c.fillRect(sz - 6, 0, 1, sz);
                    c.fillStyle = '#3e2723'; c.fillRect(sz - 4, 4, 2, 6); c.fillRect(sz - 4, sz - 10, 2, 6);
                } else if (rot === 2) {
                    c.fillRect(sz - 6, 0, 6, sz);
                    c.fillStyle = '#4e342e'; c.fillRect(sz - 1, 0, 1, sz);
                    c.fillStyle = '#3e2723'; c.fillRect(sz - 4, 4, 2, 6); c.fillRect(sz - 4, sz - 10, 2, 6);
                } else {
                    c.fillRect(0, 0, 6, sz);
                    c.fillStyle = '#4e342e'; c.fillRect(0, 0, 1, sz);
                    c.fillStyle = '#3e2723'; c.fillRect(2, 4, 2, 6); c.fillRect(2, sz - 10, 2, 6);
                }
            }
        }`;

let gateWorldDraw = worldDraw + `
        
        if (id === B.WOOD_GATE) {
            const state = (meta && meta.state) || 'closed';
            
            if (state === 'closed') {
                // Side posts
                c.fillStyle = '#5d4037';
                c.fillRect(0, 8, 4, sz - 8);
                c.fillRect(sz - 4, 8, 4, sz - 8);
                // Crossbars
                c.fillStyle = '#795548';
                c.fillRect(4, 12, sz - 8, 4);
                c.fillRect(4, 22, sz - 8, 4);
                // Details
                c.fillStyle = '#4e342e';
                c.fillRect(sz / 2 - 1, 12, 2, 14);
            } else {
                // Open state
                // Side posts
                c.fillStyle = '#5d4037';
                c.fillRect(0, 8, 4, sz - 8);
                c.fillRect(sz - 4, 8, 4, sz - 8);
                // Open flaps (vertical bars near the posts)
                c.fillStyle = '#795548';
                c.fillRect(4, 10, 4, sz - 12);
                c.fillRect(sz - 8, 10, 4, sz - 12);
            }
        }`;

c = c.replace(worldDraw, gateWorldDraw);

// Save
fs.writeFileSync("game.js", c);
console.log("Patched game.js");