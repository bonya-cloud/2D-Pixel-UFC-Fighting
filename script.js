const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

ctx.scale(0.5, 0.5);

const p1HpEl = document.getElementById('p1-hp');
const p2HpEl = document.getElementById('p2-hp');
const timerEl = document.getElementById('timer');
const gameOverScreen = document.getElementById('game-over-screen');
const winnerText = document.getElementById('winner-text');

const gravity = 0.6;
const floorY = 320;
const arenaLeft = 50;
const arenaRight = 750;
const worldW = 800;
const worldH = 400;

// Переменные настроек
let soundEnabled = true;
let gameSpeed = 1; // 1 = нормальная, 1.3 = быстрая

// Находим HTML элементы
const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const speedToggleBtn = document.getElementById('speed-toggle-btn');

let timeLeft = 99;
let timerInterval = null;
let isGameOver = false;
let frame = 0;
let isPaused = false; // Состояние паузы

const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;

    // Переключение паузы по нажатию на ESC или P (только если настройки закрыты и игра не окончена)
    if ((e.code === 'KeyP' || e.code === 'Escape' || e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') && !isGameOver) {
        // Если открыты настройки — просто закрываем их
        if (!settingsScreen.classList.contains('hidden')) {
            settingsScreen.classList.add('hidden');
            isPaused = false;
        } else {
            isPaused = !isPaused;
        }
    }

    if (isGameOver && e.code === 'Space') {
        resetGame();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// ---------- juice: screen shake + hit sparks ----------
let shake = { time: 0, magnitude: 0 };
let sparks = [];
let flash = 0;

function triggerShake(magnitude, duration) {
    shake.time = duration;
    shake.magnitude = magnitude;
}

function addSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        sparks.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 14 + Math.random() * 8,
            maxLife: 20,
            color
        });
    }
}

function updateAndDrawSparks() {
    ctx.save();
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.25;
        s.life--;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.max(s.life / s.maxLife, 0);
        ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.restore();
}

// ---------- Fighter ----------
class Fighter {
    constructor({ x, y, color, skinAccent, isFacingRight, controls, name }) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 70;
        this.color = color;
        this.accent = skinAccent;
        this.vx = 0;
        this.vy = 0;
        this.speed = 4;
        this.jumpForce = -12;
        this.isGrounded = false;
        this.hp = 100;
        this.isFacingRight = isFacingRight;
        this.controls = controls;
        this.name = name;

        this.isAttacking = false;
        this.attackType = 'punch';
        this.isBlocking = false;
        this.attackCooldown = false;

        this.hitFlash = 0;
        this.walkCycle = 0;
    }

    draw() {
        const cx = this.x + this.width / 2;
        const topY = this.y;

        ctx.save();
        ctx.translate(cx, topY);
        if (!this.isFacingRight) ctx.scale(-1, 1);

        ctx.save();
        ctx.scale(this.isFacingRight ? 1 : -1, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, floorY - topY, this.width / 1.4, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const bob = this.isGrounded && (this.vx !== 0) ? Math.sin(this.walkCycle) * 1.5 : 0;
        ctx.translate(0, bob);

        const bodyColor = this.isBlocking ? '#555a66' : this.color;
        const darkBody = this.isBlocking ? '#33363d' : shade(this.color, -35);
        const skin = '#e8b48a';
        const skinDark = '#c68f66';
        const isKicking = this.isAttacking && this.attackType === 'kick';
        const kickReach = 40;

        ctx.fillStyle = '#1c1c22';
        ctx.fillRect(-11, 46, 9, 22);
        ctx.fillStyle = '#0d0d10';
        ctx.fillRect(-12, 66, 11, 4);

        ctx.fillStyle = darkBody;
        ctx.fillRect(-17, 10, 8, 20);
        ctx.fillStyle = skinDark;
        ctx.fillRect(-18, 28, 9, 9);

        if (isKicking) {
            ctx.fillStyle = '#26262e';
            ctx.fillRect(2, 32, 11, 9);
            ctx.fillRect(11, 28, kickReach - 12, 8);
            ctx.fillStyle = '#0d0d10';
            ctx.fillRect(11 + kickReach - 16, 25, 14, 12);
        } else {
            ctx.fillStyle = '#26262e';
            ctx.fillRect(2, 46, 10, 22);
            ctx.fillStyle = '#0d0d10';
            ctx.fillRect(1, 66, 11, 4);
        }

        ctx.fillStyle = bodyColor;
        ctx.fillRect(-14, 0, 28, 38);
        ctx.fillStyle = darkBody;
        ctx.fillRect(6, 0, 8, 38);

        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = this.accent;
        ctx.fillRect(-14, 34, 28, 8);
        ctx.fillStyle = shade(this.accent, -40);
        ctx.fillRect(-4, 34, 8, 8);

        ctx.fillStyle = '#111';
        ctx.fillRect(-13, 40, 26, 8);

        ctx.fillStyle = skin;
        ctx.fillRect(-10, -20, 20, 20);
        ctx.fillStyle = skinDark;
        ctx.fillRect(2, -20, 8, 20);

        ctx.fillStyle = this.accent;
        ctx.fillRect(-11, -21, 22, 6);
        ctx.fillRect(-20, -18, 9, 4);
        ctx.fillRect(-24, -15, 7, 3);

        ctx.fillStyle = '#1a1310';
        ctx.fillRect(-9, -24, 5, 5);
        ctx.fillRect(-1, -25, 5, 6);
        ctx.fillRect(6, -23, 5, 5);

        ctx.fillStyle = '#101010';
        ctx.fillRect(4, -12, 3, 3);

        ctx.fillStyle = bodyColor;
        ctx.fillRect(isKicking ? 6 : 9, isKicking ? 8 : 10, 9, 18);
        ctx.fillStyle = '#d92b2b';
        ctx.fillRect(isKicking ? 6 : 9, isKicking ? 24 : 26, 10, 10);

        if (this.isAttacking && this.attackType === 'punch') {
            ctx.fillStyle = skin;
            ctx.fillRect(this.width / 2 - 2, 14, 27, 10);
            ctx.fillStyle = '#e63946';
            ctx.fillRect(this.width / 2 - 2 + 19, 11, 14, 16);
        }

        if (this.hitFlash > 0) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(255,255,255,${Math.min(this.hitFlash / 6, 0.85)})`;
            ctx.fillRect(-30, -26, 70, 96);
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.restore();

        if (this.hitFlash > 0) this.hitFlash--;
    }

    update(enemy) {
        if (isGameOver) return;

        this.isFacingRight = this.x < enemy.x;
        this.isBlocking = keys[this.controls.block] || false;

        if (!this.isBlocking && !this.isAttacking) {
            if (keys[this.controls.left]) this.vx = -this.speed;
            else if (keys[this.controls.right]) this.vx = this.speed;
            else this.vx = 0;

            if (keys[this.controls.jump] && this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
            }
        } else {
            this.vx = 0;
        }

        if (this.vx !== 0) this.walkCycle += 0.35;

        if (!this.isBlocking && !this.attackCooldown) {
            if (keys[this.controls.kick]) this.attack('kick');
            else if (keys[this.controls.punch]) this.attack('punch');
        }

        this.vy += gravity;
        this.x += this.vx;
        this.y += this.vy;

        if (this.y + this.height >= floorY) {
            this.y = floorY - this.height;
            this.vy = 0;
            this.isGrounded = true;
        }

        if (this.x < arenaLeft) this.x = arenaLeft;
        if (this.x + this.width > arenaRight) this.x = arenaRight - this.width;

        this.draw();
    }

    attack(type) {
        this.isAttacking = true;
        this.attackType = type;
        this.attackCooldown = true;

        const activeTime = type === 'kick' ? 180 : 150;
        const cooldownTime = type === 'kick' ? 550 : 400;

        setTimeout(() => { this.isAttacking = false; }, activeTime);
        setTimeout(() => { this.attackCooldown = false; }, cooldownTime);
    }

    getAttackBox() {
        const isKick = this.attackType === 'kick';
        const width = isKick ? 62 : 45;
        const height = isKick ? 20 : 25;
        const yOffset = isKick ? 27 : 15;
        return {
            x: this.isFacingRight ? this.x + this.width : this.x - width,
            y: this.y + yOffset,
            width,
            height
        };
    }
}

function shade(hex, amt) {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
}

let p1 = new Fighter({
    x: 200, y: 200, color: '#3366ff', skinAccent: '#ffcc00', isFacingRight: true,
    controls: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', punch: 'KeyJ', kick: 'KeyL', block: 'KeyK' },
    name: 'DUKE'
});

let p2 = new Fighter({
    x: 560, y: 200, color: '#ff3333', skinAccent: '#33ffee', isFacingRight: false,
    controls: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', punch: 'KeyU', kick: 'KeyO', block: 'KeyI' },
    name: 'RITA'
});

function checkHit(attacker, defender, defenderHpEl) {
    if (attacker.isAttacking) {
        const box = attacker.getAttackBox();
        const isColliding = (
            box.x < defender.x + defender.width &&
            box.x + box.width > defender.x &&
            box.y < defender.y + defender.height &&
            box.y + box.height > defender.y
        );

        if (isColliding) {
            attacker.isAttacking = false;
            const isKick = attacker.attackType === 'kick';
            let damage = defender.isBlocking ? (isKick ? 3 : 2) : (isKick ? 16 : 12);

            defender.hp -= damage;
            if (defender.hp < 0) defender.hp = 0;
            defenderHpEl.style.width = defender.hp + '%';
            defenderHpEl.classList.remove('mid', 'low');
            if (defender.hp <= 25) defenderHpEl.classList.add('low');
            else if (defender.hp <= 55) defenderHpEl.classList.add('mid');

            const hitX = box.x + box.width / 2;
            const hitY = box.y + box.height / 2;

            if (defender.isBlocking) {
                addSparks(hitX, hitY, '#cfd8e3', 6);
                triggerShake(2, 6);
            } else {
                defender.hitFlash = 6;
                addSparks(hitX, hitY, isKick ? '#ff8a3d' : '#ffcc00', isKick ? 16 : 12);
                triggerShake(isKick ? 9 : 6, isKick ? 14 : 10);
            }

            const pushDir = attacker.isFacingRight ? 1 : -1;
            defender.x += pushDir * (isKick ? 22 : 15);

            if (defender.hp <= 0) {
                flash = 1;
                endGame(attacker === p1 ? 'ИГРОК 1<br>ПОБЕДИЛ (K.O.)!' : 'ИГРОК 2<br>ПОБЕДИЛ (K.O.)!');
            }
        }
    }
}

// ---------- background: NES dojo arena ----------
const stars = Array.from({ length: 40 }, () => ({
    x: Math.random() * worldW,
    y: Math.random() * (floorY - 140),
    r: Math.random() < 0.8 ? 1 : 2,
    phase: Math.random() * Math.PI * 2
}));

const clouds = [
    { x: 80, y: 40, w: 90, speed: 0.06 },
    { x: 340, y: 25, w: 130, speed: 0.04 },
    { x: 560, y: 60, w: 100, speed: 0.05 },
    { x: 720, y: 20, w: 70, speed: 0.07 }
];

const crowd = Array.from({ length: 18 }, (_, i) => ({
    x: arenaLeft + 10 + i * ((arenaRight - arenaLeft - 20) / 17) + (Math.random() * 8 - 4),
    bob: Math.random() * Math.PI * 2,
    h: 10 + Math.random() * 6
}));

function drawArena() {
    const t = frame / 60;
    const avgX = (p1.x + p2.x) / 2;
    const parallax = (avgX - (arenaLeft + arenaRight) / 2) * 0.04;

    const sky = ctx.createLinearGradient(0, 0, 0, floorY - 100);
    sky.addColorStop(0, '#2b1039');
    sky.addColorStop(0.6, '#4a1c3d');
    sky.addColorStop(1, '#7a2e2e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, floorY - 100);

    stars.forEach(s => {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.phase));
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
        ctx.fillRect(s.x, s.y, s.r, s.r);
    });

    ctx.fillStyle = '#fff3cc';
    ctx.beginPath();
    ctx.arc(680, 55, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(122,46,46,0.25)';
    ctx.beginPath();
    ctx.arc(672, 48, 5, 0, Math.PI * 2);
    ctx.arc(688, 62, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(20, 8, 28, 0.55)';
    clouds.forEach(c => {
        c.x += c.speed;
        if (c.x - c.w > worldW) c.x = -c.w;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w / 2, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + c.w * 0.3, c.y + 4, c.w / 3, 8, 0, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.save();
    ctx.translate(-parallax * 0.5, 0);
    ctx.fillStyle = '#1c0e2e';
    ctx.beginPath();
    ctx.moveTo(-40, floorY - 100);
    ctx.lineTo(90, floorY - 160);
    ctx.lineTo(180, floorY - 105);
    ctx.lineTo(300, floorY - 170);
    ctx.lineTo(430, floorY - 110);
    ctx.lineTo(560, floorY - 165);
    ctx.lineTo(680, floorY - 108);
    ctx.lineTo(840, floorY - 150);
    ctx.lineTo(840, floorY - 100);
    ctx.lineTo(-40, floorY - 100);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(-parallax, 0);
    const roofY = floorY - 100;

    ctx.strokeStyle = '#4a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(arenaLeft - 20, roofY - 55);
    ctx.lineTo(arenaRight + 20, roofY - 55);
    ctx.stroke();
    const flagColors = ['#ff0055', '#ffcc00', '#33ffee', '#3366ff', '#ff8a3d'];
    for (let fx = arenaLeft - 10, i = 0; fx < arenaRight + 10; fx += 26, i++) {
        ctx.fillStyle = flagColors[i % flagColors.length];
        ctx.beginPath();
        ctx.moveTo(fx, roofY - 55);
        ctx.lineTo(fx + 12, roofY - 55);
        ctx.lineTo(fx + 6, roofY - 44);
        ctx.closePath();
        ctx.fill();
    }

    ctx.fillStyle = '#3a1414';
    ctx.fillRect(arenaLeft - 10, roofY - 10, arenaRight - arenaLeft + 20, 14);
    ctx.beginPath();
    ctx.moveTo(arenaLeft - 30, roofY - 10);
    ctx.lineTo(worldW / 2, roofY - 45);
    ctx.lineTo(arenaRight + 30, roofY - 10);
    ctx.closePath();
    ctx.fillStyle = '#4a1a1a';
    ctx.fill();
    ctx.fillStyle = '#2a0d0d';
    ctx.fillRect(worldW / 2 - 6, roofY - 60, 12, 18);

    const lanternXs = [140, 260, 540, 660];
    lanternXs.forEach((lx, i) => {
        const sway = Math.sin(t * 1.3 + i) * 3;
        ctx.strokeStyle = '#5a2a2a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, roofY);
        ctx.lineTo(lx + sway, roofY + 14);
        ctx.stroke();
        ctx.fillStyle = '#ff5533';
        ctx.beginPath();
        ctx.ellipse(lx + sway, roofY + 22, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,204,85,0.5)';
        ctx.beginPath();
        ctx.ellipse(lx + sway, roofY + 22, 12, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcc55';
        ctx.fillRect(lx + sway - 1, roofY + 15, 2, 14);
    });

    ctx.fillStyle = '#3d1f2e';
    for (let x = arenaLeft; x < arenaRight; x += 60) {
        ctx.fillRect(x + 4, roofY, 52, 100);
        ctx.strokeStyle = '#5a3348';
        ctx.strokeRect(x + 4, roofY, 52, 100);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        for (let gy = roofY + 12; gy < roofY + 100; gy += 14) {
            ctx.beginPath();
            ctx.moveTo(x + 6, gy);
            ctx.lineTo(x + 54, gy);
            ctx.stroke();
        }
    }

    ctx.fillStyle = 'rgba(10,6,14,0.85)';
    crowd.forEach((p, i) => {
        const bob = Math.sin(t * 2 + p.bob) * 2;
        ctx.beginPath();
        ctx.arc(p.x - parallax * 0.5, roofY + 92 + bob, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(p.x - parallax * 0.5 - 4, roofY + 95 + bob, 8, p.h);
    });

    ctx.fillStyle = '#241018';
    ctx.fillRect(arenaLeft, roofY + 96, arenaRight - arenaLeft, 6);

    ctx.fillStyle = '#5a1f1f';
    ctx.fillRect(arenaLeft, roofY - 4, 18, 104);
    ctx.fillRect(arenaRight - 18, roofY - 4, 18, 104);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(arenaLeft + 12, roofY - 4, 6, 104);
    ctx.fillRect(arenaRight - 18, roofY - 4, 6, 104);
    ctx.restore();

    const mist = ctx.createLinearGradient(0, floorY - 20, 0, floorY);
    mist.addColorStop(0, 'rgba(180,170,220,0)');
    mist.addColorStop(1, 'rgba(180,170,220,0.12)');
    ctx.fillStyle = mist;
    ctx.fillRect(arenaLeft, floorY - 20, arenaRight - arenaLeft, 20);

    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(arenaLeft, floorY, arenaRight - arenaLeft, 80);
    ctx.strokeStyle = '#2a1d14';
    ctx.lineWidth = 2;
    for (let x = arenaLeft; x <= arenaRight; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, floorY);
        ctx.lineTo(x, floorY + 80);
        ctx.stroke();
    }
    for (let y = floorY + 20; y < floorY + 80; y += 20) {
        ctx.beginPath();
        ctx.moveTo(arenaLeft, y);
        ctx.lineTo(arenaRight, y);
        ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = arenaLeft, i = 0; x < arenaRight; x += 40, i++) {
        if (i % 2 === 0) ctx.fillRect(x, floorY, 40, 80);
    }

    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arenaLeft, floorY);
    ctx.lineTo(arenaRight, floorY);
    ctx.stroke();

    ctx.fillStyle = '#3366ff';
    ctx.fillRect(arenaLeft, floorY, 6, 80);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(arenaRight - 6, floorY, 6, 80);

    ctx.fillStyle = '#2e2418';
    ctx.beginPath();
    ctx.ellipse(arenaLeft + 20, floorY + 74, 10, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(arenaRight - 20, floorY + 74, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
}

function gameLoop() {
    frame++;
    ctx.clearRect(0, 0, worldW, worldH);

    ctx.save();
    if (shake.time > 0) {
        const dx = (Math.random() - 0.5) * shake.magnitude;
        const dy = (Math.random() - 0.5) * shake.magnitude;
        ctx.translate(dx, dy);
        shake.time--;
    }

    drawArena();

    if (!isPaused) {
        p1.update(p2);
        p2.update(p1);
        checkHit(p1, p2, p2HpEl);
        checkHit(p2, p1, p1HpEl);
        updateAndDrawSparks();
    } else {
        p1.draw();
        p2.draw();
        
        // Показываем надпись "ПАУЗА" только если меню настроек закрыто
        if (settingsScreen.classList.contains('hidden')) {
            drawPauseScreen();
        }
    }

    ctx.restore();

    if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
        ctx.fillRect(0, 0, worldW, worldH);
        flash -= 0.08;
        if (flash < 0) flash = 0;
    }

    requestAnimationFrame(gameLoop);
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (timeLeft > 0 && !isPaused && !isGameOver) {
            timeLeft--;
            timerEl.textContent = timeLeft;
        } else if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (p1.hp > p2.hp) endGame('ИГРОК 1<br>ПОБЕДИЛ ПО ОЧКАМ!');
            else if (p2.hp > p1.hp) endGame('ИГРОК 2<br>ПОБЕДИЛ ПО ОЧКАМ!');
            else endGame('НИЧЬЯ!');
        }
    }, 1000);
}

function endGame(text) {
    isGameOver = true;
    clearInterval(timerInterval);
    winnerText.innerHTML = text;
    gameOverScreen.classList.remove('hidden');
}

function resetGame() {
    isGameOver = false;
    isPaused = false;
    timeLeft = 99;
    timerEl.textContent = timeLeft;
    p1.hp = 100; p2.hp = 100;
    p1HpEl.style.width = '100%'; p2HpEl.style.width = '100%';
    p1HpEl.classList.remove('mid', 'low');
    p2HpEl.classList.remove('mid', 'low');
    p1.x = 200; p1.y = 200;
    p2.x = 560; p2.y = 200;
    sparks = [];
    shake = { time: 0, magnitude: 0 };
    flash = 0;
    gameOverScreen.classList.add('hidden');
    settingsScreen.classList.add('hidden');
    clearInterval(timerInterval);
    startTimer();
}

function drawPauseScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, worldW, worldH);

    ctx.fillStyle = '#ffcc00';
    ctx.font = '900 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ПАУЗА', worldW / 2, worldH / 2 - 15);

    ctx.fillStyle = '#ffffff'; 
    ctx.font = 'bold 18px sans-serif';  
    ctx.fillText('Нажми ESC или P, чтобы продолжить', worldW / 2, worldH / 2 + 25);
}

// Открытие и закрытие настроек
settingsBtn.addEventListener('click', () => {
    isPaused = true;
    settingsScreen.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsScreen.classList.add('hidden');
    isPaused = false;
});

// Переключение звука
soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? 'ВКЛ' : 'ВЫКЛ';
    soundToggleBtn.style.borderColor = soundEnabled ? '#ff0055' : '#777';
});

// Переключение скорости боя
speedToggleBtn.addEventListener('click', () => {
    if (gameSpeed === 1) {
        gameSpeed = 1.3;
        speedToggleBtn.textContent = '1.3x (Турбо)';
    } else {
        gameSpeed = 1;
        speedToggleBtn.textContent = '1x (Норм)';
    }
    
    p1.speed = 4 * gameSpeed;
    p2.speed = 4 * gameSpeed;
});

startTimer();
gameLoop();