const fs = require("fs");
let c = fs.readFileSync("game.js", "utf-8");

// 1. World and Inventory generic rendering in drawBlocky
let trapdoorDrawBlocky = `        if (id === B.WOOD_TRAPDOOR) {
            const rot = (meta && meta.rot) || 0;
            const state = (meta && meta.state) || 'closed';
            c.rotate((rot * Math.PI) / 2);
            drawTrapdoorShape(c, sz, state);
            c.restore();
            return;
        }`;

let gateDrawBlocky = trapdoorDrawBlocky + `

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
        }`;

c = c.replace(trapdoorDrawBlocky, gateDrawBlocky);

// 2. Inventory icon specific (getTileSprite)
let trapdoorInvDraw = `    } else if (id === B.WOOD_TRAPDOOR) {`;
let gateInvDraw = `    } else if (id === B.WOOD_GATE) {
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
    } else if (id === B.WOOD_TRAPDOOR) {`;

c = c.replace(trapdoorInvDraw, gateInvDraw);

fs.writeFileSync("game.js", c);
console.log("Patched rendering logic for WOOD_GATE");