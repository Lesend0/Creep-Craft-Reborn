const fs = require("fs");
let c = fs.readFileSync("game.js", "utf-8");

let aabbsPatch = `    if (id === B.WOOD_GATE) {
        const m = (typeof world !== 'undefined' && world && world.blockMeta)
            ? world.blockMeta[\`\${tx},\${ty},1\`] : null;
        if (m && m.state === 'open') return EMPTY_AABBS;
        return FULL_AABBS;
    }
    if (id === B.WOOD_TRAPDOOR) {`;
c = c.replace("    if (id === B.WOOD_TRAPDOOR) {", aabbsPatch);

let previewPatch = `} else if (held.id === B.WOOD_GATE) {
                            ctx.save();
                            ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
                            ctx.fillStyle = '#5d4037';
                            ctx.fillRect(-TILE_SIZE/2, -TILE_SIZE/2 + 8, 4, TILE_SIZE - 8);
                            ctx.fillRect(TILE_SIZE/2 - 4, -TILE_SIZE/2 + 8, 4, TILE_SIZE - 8);
                            ctx.fillStyle = '#795548';
                            ctx.fillRect(-TILE_SIZE/2 + 4, -TILE_SIZE/2 + 12, TILE_SIZE - 8, 4);
                            ctx.fillRect(-TILE_SIZE/2 + 4, -TILE_SIZE/2 + 22, TILE_SIZE - 8, 4);
                            ctx.restore();
                        } else if (held.id === B.WOOD_TRAPDOOR) {`;
c = c.replace("} else if (held.id === B.WOOD_TRAPDOOR) {", previewPatch);

fs.writeFileSync("game.js", c);
console.log("Patched game.js for AABBS and preview");