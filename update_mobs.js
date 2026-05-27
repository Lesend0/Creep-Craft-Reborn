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
    c.translate(p.x + 10, p.y + 46); // Pivot around feet base

    // тень под ногами
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 12, 12, 3, 0, 0, Math.PI * 2);
    c.fill();

    const bodyCol = hurtFlash ? '#ff4444' : '#0f9d58';
    const bodyDark = hurtFlash ? '#d32f2f' : '#0b8043';
    const bodyLight = hurtFlash ? '#ff7777' : '#2ebb73';

    // Ноги
    const legRot1 = step * 0.5;
    const legRot2 = -step * 0.5;
    
    const drawLeg = (rot, dark) => {
        c.save();
        c.translate(0, -6);
        c.rotate(rot);
        c.fillStyle = dark ? bodyDark : bodyCol;
        c.fillRect(-4, 0, 8, 16);
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
    c.translate(0, -6);
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

const zombieReplacement = `function drawZombie(c, e) {
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
    c.fillRect(-10, -16, 20, 16);
    c.fillStyle = skinDark;
    c.fillRect(-10, -16, 20, 2);
    c.fillRect(-10, -2, 20, 1);
    c.fillStyle = '#3e2723';
    c.fillRect(4, -14, 3, 2);

    const isDark = (typeof time !== 'undefined') && (time >= 0.55 && time < 0.95);
    c.fillStyle = '#000';
    if (e.dir > 0) {
        c.fillRect(2, -12, 4, 5);
        c.fillRect(-5, -12, 4, 5);
    } else {
        c.fillRect(-7, -12, 4, 5);
        c.fillRect(1, -12, 4, 5);
    }
    const eyeGlow = isDark ? '#ff3b3b' : '#d7ccc8';
    c.fillStyle = eyeGlow;
    if (isDark) { c.shadowColor = '#ff0000'; c.shadowBlur = 5; }
    if (e.dir > 0) {
        c.fillRect(3, -11, 2, 3);
        c.fillRect(-4, -11, 2, 3);
    } else {
        c.fillRect(-6, -11, 2, 3);
        c.fillRect(2, -11, 2, 3);
    }
    c.shadowBlur = 0;

    c.fillStyle = '#1a1a1a';
    c.fillRect(-5, -5, 10, 2);
    c.fillStyle = '#eceff1';
    c.fillRect(-3, -5, 1, 2);
    c.fillRect(1, -5, 1, 2);
    c.restore();

    c.save(); c.translate(0, breathe); drawArm(armRot, false); c.restore();
    c.restore();
}`;

const spiderReplacement = `function drawSpider(c, e) {
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
}`;

const passiveReplacement = `function drawPassive(c, e) {
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
        const sheepCol = hurtFlash ? '#ff5555' : '#fafafa';
        
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
content = replaceBlock(content, 'drawZombie', zombieReplacement);
content = replaceBlock(content, 'drawSpider', spiderReplacement);
content = replaceBlock(content, 'drawPassive', passiveReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated mob drawing functions!');
