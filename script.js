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

// ---------- Настройки формата матча (раунды) ----------
let totalRounds = 1;      // 1 = один раунд (как было раньше), 3 = матч до 2 побед из 3 раундов
let roundsToWin = 1;      // сколько раундов нужно выиграть, чтобы победить в матче
let currentRoundNum = 1;  // номер текущего раунда
let p1RoundWins = 0;      // сколько раундов выиграл игрок 1
let p2RoundWins = 0;      // сколько раундов выиграл игрок 2
let matchOver = false;    // true, когда весь матч завершён (а не просто раунд)

// Находим HTML элементы
const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const speedToggleBtn = document.getElementById('speed-toggle-btn');
const roundsToggleBtn = document.getElementById('rounds-toggle-btn');
const roundIndicatorEl = document.getElementById('round-indicator');
const continueBtn = document.getElementById('continue-btn');

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
        handleContinue();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// ---------- звук: простые синтезированные эффекты (без аудиофайлов) ----------
// Идея: вместо .mp3 файлов генерируем короткий "бип" через осциллятор Web Audio.
// Это легко и не требует загрузки аудио. Если захочешь свои звуки — замени
// содержимое playSound() на new Audio('путь/к/файлу.mp3').play().
let audioCtx = null;

function getAudioCtx() {
    // Браузеры разрешают создавать AudioContext только после действия пользователя
    // (клик/нажатие клавиши), поэтому создаём его один раз при первом вызове.
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    if (!soundEnabled) return; // настройка "Звуковые эффекты: ВЫКЛ" отключает всё это

    const ctxA = getAudioCtx();
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.connect(gain);
    gain.connect(ctxA.destination);

    const now = ctxA.currentTime;
    // Параметры звука для каждого типа события: с какой частоты на какую "падаем",
    // как долго звучит, форма волны и громкость.
    let freqStart, freqEnd, duration, waveType, volume;
    switch (type) {
        case 'punch': freqStart = 220; freqEnd = 110; duration = 0.08; waveType = 'square';   volume = 0.18; break;
        case 'kick':  freqStart = 140; freqEnd = 60;  duration = 0.14; waveType = 'square';   volume = 0.22; break;
        case 'block': freqStart = 600; freqEnd = 500; duration = 0.05; waveType = 'triangle'; volume = 0.12; break;
        case 'ko':    freqStart = 440; freqEnd = 80;  duration = 0.6;  waveType = 'sawtooth'; volume = 0.20; break;
        default:      freqStart = 300; freqEnd = 300; duration = 0.05; waveType = 'sine';     volume = 0.10;
    }

    osc.type = waveType;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
}

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

// ---------- juice: всплывающий текст комбо ("3 HITS!") ----------
let floatingTexts = [];

function spawnComboText(x, y, combo) {
    floatingTexts.push({
        x, y,
        vy: -1.2,       // текст медленно всплывает вверх
        life: 45,
        maxLife: 45,
        text: `${combo} HITS!`
    });
}

function updateAndDrawFloatingTexts() {
    ctx.save();
    ctx.font = '900 16px sans-serif';
    ctx.textAlign = 'center';
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const f = floatingTexts[i];
        f.y += f.vy;
        f.life--;
        if (f.life <= 0) { floatingTexts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(f.life / f.maxLife, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(f.text, f.x, f.y);
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

        // Комбо: сколько ударов подряд боец нанёс без промаха/блока противника
        this.comboCount = 0;
        this.lastHitFrame = -999; // на каком кадре был последний удачный удар
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

        // Пошатывание при тяжело раненном состоянии (< 20% HP)
        let criticalStagger = 0;
        if (this.hp < 20 && this.isGrounded && !this.isAttacking) {
            criticalStagger = Math.sin(frame * 0.25) * 1.2;
        }

        const bob = this.isGrounded && (this.vx !== 0) ? Math.sin(this.walkCycle) * 1.5 : 0;
        ctx.translate(criticalStagger, bob);

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

        // визуальные травмы и синяки //
        if (this.hp < 75) {
            ctx.fillStyle = '#a81b1b'; // ссадина на щеке
            ctx.fillRect(3, -16, 2, 2);
        }
        if (this.hp < 50) {
            ctx.fillStyle = '#4a2e56'; // синяк под глазом
            ctx.fillRect(-6, 12, 5, 4);
        }
        if (this.hp < 30) {
            ctx.fillStyle = '#780e0e'; // рассечение над броью
            ctx.fillRect(-4, -18, 3, 2);
            ctx.fillRect(-2, 20, 6, 3);
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
                playSound('block');
                attacker.comboCount = 0; // заблокированный удар сбрасывает комбо атакующего
            } else {
                defender.hitFlash = 6;
                addSparks(hitX, hitY, isKick ? '#ff8a3d' : '#ffcc00', isKick ? 16 : 12);
                triggerShake(isKick ? 9 : 6, isKick ? 14 : 10);
                playSound(isKick ? 'kick' : 'punch');

                // Комбо: если предыдущий удачный удар этого бойца был недавно (менее 1.5 сек / 90 кадров назад),
                // считаем его продолжением серии, иначе начинаем счёт заново.
                attacker.comboCount = (frame - attacker.lastHitFrame < 90) ? attacker.comboCount + 1 : 1;
                attacker.lastHitFrame = frame;
                if (attacker.comboCount >= 2) {
                    spawnComboText(hitX, hitY - 20, attacker.comboCount);
                }
            }

            const pushDir = attacker.isFacingRight ? 1 : -1;
            defender.x += pushDir * (isKick ? 22 : 15);

            if (defender.hp <= 0) {
                flash = 1;
                endRound(attacker === p1 ? 'p1' : 'p2', true); // true = победа нокаутом
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

// Амбиентные угольки/искры, которые медленно поднимаются вверх по всей арене —
// чисто атмосферный эффект, не связан с ударами (в отличие от addSparks()).
const embers = Array.from({ length: 25 }, () => ({
    x: Math.random() * worldW,
    y: floorY + Math.random() * 80,
    speed: 0.3 + Math.random() * 0.6,   // скорость подъёма
    drift: (Math.random() - 0.5) * 0.3, // лёгкое смещение по горизонтали
    size: 1 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2  // для мерцания
}));

function updateAndDrawEmbers(t) {
    ctx.save();
    embers.forEach(e => {
        e.y -= e.speed;
        e.x += e.drift;
        // когда уголёк улетает слишком высоко — "рождаем" его заново снизу арены
        if (e.y < floorY - 260) {
            e.y = floorY + 60;
            e.x = Math.random() * worldW;
        }
        const flicker = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + e.phase));
        ctx.fillStyle = `rgba(255,140,60,${flicker})`;
        ctx.fillRect(e.x, e.y, e.size, e.size);
    });
    ctx.restore();
}

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

    // Летающие угольки поверх всей сцены — добавляют "живости" фону
    updateAndDrawEmbers(t);

    // Виньетка: затемнение по краям экрана, чтобы взгляд тянуло к центру арены,
    // где происходит бой. Классический приём для "кинематографичной" картинки.
    const vignette = ctx.createRadialGradient(
        worldW / 2, worldH / 2, worldH * 0.25,
        worldW / 2, worldH / 2, worldW * 0.65
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, worldW, worldH);
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
        updateAndDrawFloatingTexts();
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
            if (p1.hp > p2.hp) endRound('p1', false);
            else if (p2.hp > p1.hp) endRound('p2', false);
            else endRound('draw', false);
        }
    }, 1000);
}

// Обновляет текст "РАУНД 2/3 • СЧЁТ 1:0" под таймером.
// В режиме "1 раунд" ничего не показываем — как в исходной версии игры.
function updateRoundIndicator() {
    roundIndicatorEl.textContent = totalRounds === 1
        ? ''
        : `РАУНД ${currentRoundNum}/${totalRounds} • СЧЁТ ${p1RoundWins}:${p2RoundWins}`;
}

// Вызывается при нокауте ИЛИ по истечении времени раунда.
// winnerKey: 'p1' | 'p2' | 'draw'.  isKO: true, если раунд закончился нокаутом.
function endRound(winnerKey, isKO) {
    isGameOver = true; // это ставит игру на паузу и показывает оверлей (см. Fighter.update)
    clearInterval(timerInterval);
    playSound('ko');

    if (winnerKey === 'p1') p1RoundWins++;
    else if (winnerKey === 'p2') p2RoundWins++;
    // при 'draw' очки никому не начисляются

    updateRoundIndicator();

    const p1WonMatch = p1RoundWins >= roundsToWin;
    const p2WonMatch = p2RoundWins >= roundsToWin;
    const noRoundsLeft = currentRoundNum >= totalRounds; // раунды закончились, а до победы никто не дошёл

    matchOver = p1WonMatch || p2WonMatch || noRoundsLeft;

    let text;
    if (!matchOver) {
        // Раунд окончен, но матч продолжается — показываем результат раунда и кнопку "Следующий раунд"
        const roundWinnerLabel = winnerKey === 'p1' ? 'ИГРОК 1' : winnerKey === 'p2' ? 'ИГРОК 2' : null;
        text = roundWinnerLabel
            ? `${roundWinnerLabel}<br>ВЫИГРАЛ РАУНД ${currentRoundNum}`
            : `РАУНД ${currentRoundNum}<br>НИЧЬЯ`;
        continueBtn.textContent = 'Следующий раунд';
    } else {
        // Матч полностью завершён — итог определяем по числу выигранных раундов
        if (p1RoundWins > p2RoundWins) {
            text = isKO && totalRounds === 1 ? 'ИГРОК 1<br>ПОБЕДИЛ (K.O.)!' : 'ИГРОК 1<br>ПОБЕДИЛ В МАТЧЕ!';
        } else if (p2RoundWins > p1RoundWins) {
            text = isKO && totalRounds === 1 ? 'ИГРОК 2<br>ПОБЕДИЛ (K.O.)!' : 'ИГРОК 2<br>ПОБЕДИЛ В МАТЧЕ!';
        } else {
            text = 'НИЧЬЯ!';
        }
        continueBtn.textContent = 'Заново';
    }

    winnerText.innerHTML = text;
    gameOverScreen.classList.remove('hidden');
}

// Кнопка на финальном экране и клавиша "Пробел" ведут сюда.
// В зависимости от того, закончился матч целиком или только раунд, выбираем нужное действие.
function handleContinue() {
    if (matchOver) {
        resetGame(); // весь матч, счёт раундов обнуляется
    } else {
        currentRoundNum++;
        updateRoundIndicator();
        startNextRound(); // тот же матч, следующий раунд, счёт сохраняется
    }
}

// Сбрасывает позиции/HP/таймер для нового раунда, НЕ трогая счёт раундов
function startNextRound() {
    isGameOver = false;
    timeLeft = 99;
    timerEl.textContent = timeLeft;
    p1.hp = 100; p2.hp = 100;
    p1HpEl.style.width = '100%'; p2HpEl.style.width = '100%';
    p1HpEl.classList.remove('mid', 'low');
    p2HpEl.classList.remove('mid', 'low');
    p1.x = 200; p1.y = 200;
    p2.x = 560; p2.y = 200;
    p1.comboCount = 0; p2.comboCount = 0;
    sparks = [];
    floatingTexts = [];
    shake = { time: 0, magnitude: 0 };
    flash = 0;
    gameOverScreen.classList.add('hidden');
    clearInterval(timerInterval);
    startTimer();
}

// Полный рестарт матча: обнуляет и счёт раундов, и текущий бой
function resetGame() {
    p1RoundWins = 0;
    p2RoundWins = 0;
    currentRoundNum = 1;
    matchOver = false;
    updateRoundIndicator();

    isPaused = false;
    settingsScreen.classList.add('hidden');
    startNextRound();
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

// Кнопка "Заново" / "Следующий раунд" на финальном экране
continueBtn.addEventListener('click', handleContinue);

// Переключение формата матча: 1 раунд <-> до 2 побед из 3 раундов
roundsToggleBtn.addEventListener('click', () => {
    totalRounds = totalRounds === 1 ? 3 : 1;
    roundsToWin = totalRounds === 1 ? 1 : 2;
    roundsToggleBtn.textContent = totalRounds === 1 ? '1 раунд' : 'До 2 побед (Bo3)';
    resetGame(); // смена формата начинает матч заново, чтобы счёт не путался
});

updateRoundIndicator(); // выставляем начальный (пустой) текст индикатора раундов
startTimer();
gameLoop();