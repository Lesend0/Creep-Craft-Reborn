const fs = require('fs');
const path = 'game.js';

let content = fs.readFileSync(path, 'utf8');

const creeperReplacement = `function drawCreeper(c, p, dir) {
    const now = Date.now();
    const walking = Math.abs(p.vx) > 0.1;
    const breathe = walking ? 0 : Math.sin(now / 800) * 1;
    const step = walking ? Math.sin(now / 150) : 0;
    const hurt = p.hurtTimer > 0;
    const hurtFlash = hurt && (now % 120 < 60);

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

    // Рюкзак
    if (player.inv && player.inv.capacity > 27) {
        c.fillStyle = '#5d4037';
        const bx = dir === 1 ? -16 : 8;
        c.fillRect(bx, -20 + breathe, 8, 14);
        c.fillStyle = '#6d4c41';
        c.fillRect(bx, -20 + breathe, 8, 2);
        c.fillStyle = '#3e2723';
        c.fillRect(bx, -8 + breathe, 8, 2);
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
}`;

function replaceBlock(content, funcName, replacement) {
    const startStr = "function " + funcName;
    const startIndex = content.indexOf(startStr);
    if (startIndex === -1) throw new Error("Could not find " + funcName);
    let bracketCount = 0;
    let started = false;
    let endIndex = -1;
    
    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
            bracketCount++;
            started = true;
        } else if (content[i] === '}') {
            bracketCount--;
        }
        
        if (started && bracketCount === 0) {
            endIndex = i;
            break;
        }
    }
    
    if (endIndex === -1) throw new Error("Could not find end of " + funcName);
    
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + 1);
    
    return before + replacement + after;
}

content = replaceBlock(content, 'drawCreeper', creeperReplacement);
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully reverted Creeper!');
