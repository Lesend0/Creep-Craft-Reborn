const fs = require("fs");
let c = fs.readFileSync("game.js", "utf-8");

let trapdoorPlace = `                } else if (item && item.id === B.WOOD_TRAPDOOR) {
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
                    mouse.down = false;`;

let gatePlace = trapdoorPlace + `
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
                    mouse.down = false;`;

c = c.replace(trapdoorPlace, gatePlace);


let trapdoorToggle = `                } else if (tid === B.WOOD_TRAPDOOR && (!item || item.id !== B.WOOD_TRAPDOOR)) {
                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                    m.state = (m.state === 'open') ? 'closed' : 'open';
                    setBlockMeta(tx, ty, m, LAYER.MID);
                    game.audio.playSound('place');
                    mouse.down = false;`;

let gateToggle = trapdoorToggle + `
                } else if (tid === B.WOOD_GATE && (!item || item.id !== B.WOOD_GATE)) {
                    const m = getBlockMeta(tx, ty, LAYER.MID) || { rot: 0, state: 'closed' };
                    m.state = (m.state === 'open') ? 'closed' : 'open';
                    setBlockMeta(tx, ty, m, LAYER.MID);
                    game.audio.playSound('place');
                    mouse.down = false;`;

c = c.replace(trapdoorToggle, gateToggle);

fs.writeFileSync("game.js", c);
console.log("Patched interaction logic for WOOD_GATE");