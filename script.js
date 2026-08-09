const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const p1HpEl = document.getElementById('p1-hp');
const p2HpEl = document.getElementById('p2-hp');
const timerEl = document.getElementById('timer');
const gameOverScreen = document.getElementById('game-over-screen');
const winnerText = document.getElementById('winner-text');

const gravity = 0.6;
const floorY = 320;
// Порог HP, ниже которого включается "режим ярости" (см. Fighter.isRaging())
const RAGE_HP_THRESHOLD = 25;
// Множитель урона, наносимого бойцом в режиме ярости
const RAGE_DAMAGE_MULT = 1.2;
const arenaLeft = 50;
const arenaRight = 750;
const worldW = 800;
const worldH = 400;

let soundEnabled = true;
let gameSpeed = 1;

let totalRounds = 1;      
let roundsToWin = 1;      
let currentRoundNum = 1;  
let p1RoundWins = 0;      
let p2RoundWins = 0;      
let matchOver = false;    

const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const speedToggleBtn = document.getElementById('speed-toggle-btn');
const roundsToggleBtn = document.getElementById('rounds-toggle-btn');
const roundIndicatorEl = document.getElementById('round-indicator');
const continueBtn = document.getElementById('continue-btn');

const p1UltEl = document.getElementById('p1-ult');
const p2UltEl = document.getElementById('p2-ult');
const p1StaminaEl = document.getElementById('p1-stamina');
const p2StaminaEl = document.getElementById('p2-stamina');
const cpuToggleBtn = document.getElementById('cpu-toggle-btn');
const p2NameEl = document.getElementById('p2-name');

// --- Новые элементы интерфейса (серия побед, статистика матча, доп. настройки) ---
const difficultyToggleBtn = document.getElementById('difficulty-toggle-btn');
const p1ColorBtn = document.getElementById('p1-color-btn');
const p2ColorBtn = document.getElementById('p2-color-btn');
const streakIndicatorEl = document.getElementById('streak-indicator');
const matchStatsEl = document.getElementById('match-stats');
const p1PortraitEl = document.querySelector('.portrait.p1-portrait');
const p2PortraitEl = document.querySelector('.portrait.p2-portrait');

let timeLeft = 99;
let timerInterval = null;
let isGameOver = false;
let frame = 0;
let isPaused = false; 
let cpuEnabled = true;

let hitStopFrames = 0;

// ==================================================================
//  НОВЫЕ СИСТЕМЫ: сложность CPU, серия побед, статистика, цвета бойцов
// ==================================================================

// Сложность бота: 'easy' | 'normal' | 'hard' — используется в aiControlP2()
let cpuDifficulty = 'normal';
const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABELS = { easy: 'Лёгкая', normal: 'Обычная', hard: 'Сложная' };
// Параметры поведения бота для каждого уровня сложности
const DIFFICULTY_SETTINGS = {
    easy:   { attackRange: 85,  blockChance: 0.25, attackChance: 0.55, ultChance: 0.20, throwChance: 0.05, jumpChance: 0.002, mistakeChance: 0.35 },
    normal: { attackRange: 95,  blockChance: 0.55, attackChance: 0.80, ultChance: 0.35, throwChance: 0.12, jumpChance: 0.004, mistakeChance: 0.15 },
    hard:   { attackRange: 105, blockChance: 0.85, attackChance: 0.95, ultChance: 0.55, throwChance: 0.22, jumpChance: 0.006, mistakeChance: 0.04 }
};

// Серия побед подряд (сохраняется в localStorage, переживает перезагрузку страницы)
let winStreak = { winnerKey: null, count: 0 };
try {
    const savedStreak = JSON.parse(localStorage.getItem('fightGameWinStreak') || 'null');
    if (savedStreak && savedStreak.winnerKey && savedStreak.count) winStreak = savedStreak;
} catch (e) {
    // localStorage может быть недоступен (приватный режим и т.п.) — просто игнорируем
}

// Статистика текущего матча (обнуляется в resetGame, копится по всем раундам матча)
function makeEmptyStats() {
    return { punches: 0, kicks: 0, uppercuts: 0, throws: 0, ultimates: 0, maxCombo: 0 };
}
let matchStats = { p1: makeEmptyStats(), p2: makeEmptyStats() };

// Пресеты расцветки бойцов: [основной цвет, цвет акцента/пояса, подпись]
const colorPresets = [
    { color: '#3366ff', accent: '#ffcc00', label: 'Синий/Жёлтый' },
    { color: '#33cc66', accent: '#ffffff', label: 'Зелёный/Белый' },
    { color: '#9933ff', accent: '#33ffee', label: 'Фиолет/Циан' },
    { color: '#ff8a3d', accent: '#111111', label: 'Оранж/Чёрный' },
    { color: '#ff3333', accent: '#33ffee', label: 'Красный/Циан' }
];
let p1ColorIndex = 0; // по умолчанию совпадает с исходным цветом DUKE
let p2ColorIndex = 4; // по умолчанию совпадает с исходным цветом RITA

// Состояние вступительной заставки раунда ("РАУНД N" -> "БОЙ!")
// Пока intro.active === true, обновление логики боя приостановлено.
let intro = { active: false, frames: 0, stage: 0 };

// "Накал трибун" — растёт при эффектных комбо, ускоряет анимацию толпы
let hypeLevel = 0;

const keys = {};

// Связь экранных кнопок с клавишами
const touchButtons = document.querySelectorAll('.t-btn');
const touchBtnMap = {};

touchButtons.forEach(btn => {
    const code = btn.getAttribute('data-key');
    if (code) touchBtnMap[code] = btn;

    const handlePress = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        if (!keys[code]) {
            tryDash(p1, code);
            tryDash(p2, code);
        }
        keys[code] = true;
    };

    const handleRelease = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        keys[code] = false;
    };

    btn.addEventListener('touchstart', handlePress, { passive: false });
    btn.addEventListener('touchend', handleRelease, { passive: false });
    btn.addEventListener('touchcancel', handleRelease, { passive: false });
    
    btn.addEventListener('mousedown', handlePress);
    btn.addEventListener('mouseup', handleRelease);
    btn.addEventListener('mouseleave', handleRelease);
});

// Обработка клавиатуры + синхронизация подсветки экрнаных кнопок
window.addEventListener('keydown', (e) => {
    const isFreshPress = !keys[e.code];
    keys[e.code] = true;

    // Подсвечиваем виртуальную кнопку на экране
    if (touchBtnMap[e.code]) {
        touchBtnMap[e.code].classList.add('active');
    }

    if (isFreshPress) {
        tryDash(p1, e.code);
        tryDash(p2, e.code);
    }

    if ((e.code === 'KeyP' || e.code === 'Escape' || e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') && !isGameOver) {
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
    
    // Снимаем подсветку с виртуальной кнопки
    if (touchBtnMap[e.code]) {
        touchBtnMap[e.code].classList.remove('active');
    }
});

let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    if (!soundEnabled) return;

    const ctxA = getAudioCtx();
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.connect(gain);
    gain.connect(ctxA.destination);

    const now = ctxA.currentTime;
    let freqStart, freqEnd, duration, waveType, volume;
    switch (type) {
        case 'punch': freqStart = 220; freqEnd = 110; duration = 0.08; waveType = 'square';   volume = 0.18; break;
        case 'kick':  freqStart = 140; freqEnd = 60;  duration = 0.14; waveType = 'square';   volume = 0.22; break;
        case 'uppercut': freqStart = 180; freqEnd = 320; duration = 0.16; waveType = 'square'; volume = 0.22; break;
        case 'throw': freqStart = 90;  freqEnd = 40;  duration = 0.22; waveType = 'sawtooth'; volume = 0.24; break;
        case 'block': freqStart = 600; freqEnd = 500; duration = 0.05; waveType = 'triangle'; volume = 0.12; break;
        case 'ko':    freqStart = 440; freqEnd = 80;  duration = 0.6;  waveType = 'sawtooth'; volume = 0.20; break;
        case 'bell':  freqStart = 900; freqEnd = 900; duration = 0.35; waveType = 'sine';     volume = 0.16; break;
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

let floatingTexts = [];

function spawnFloatingText(x, y, text, color, size, life) {
    floatingTexts.push({
        x, y,
        vy: -1.2,
        life: life || 45,
        maxLife: life || 45,
        text,
        color: color || '#ffcc00',
        size: size || 16
    });
}

function spawnComboText(x, y, combo) {
    spawnFloatingText(x, y, `${combo} HITS!`, '#ffcc00', 16, 45);
}

function spawnDamageNumber(x, y, amount, isCritical, muted) {
    const jitterX = (Math.random() - 0.5) * 14;
    if (muted) {
        spawnFloatingText(x + jitterX, y - 6, `-${amount}`, '#9aa0ad', 13, 30);
        return;
    }
    spawnFloatingText(x + jitterX, y - 6, `-${amount}`, isCritical ? '#ff2255' : '#ffffff', isCritical ? 20 : 15, 40);
    if (isCritical) {
        spawnFloatingText(x + jitterX, y - 28, 'CRITICAL!', '#ffcc00', 15, 50);
    }
}

function updateAndDrawFloatingTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const f = floatingTexts[i];
        f.y += f.vy;
        f.life--;
        if (f.life <= 0) { floatingTexts.splice(i, 1); continue; }
        ctx.font = `900 ${f.size}px sans-serif`;
        ctx.globalAlpha = Math.max(f.life / f.maxLife, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
}

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

        this.comboCount = 0;
        this.lastHitFrame = -999;

        this.ultCharge = 0;
        this.ultReady = false;

        this.stamina = 100;
        this.maxStamina = 100;
        this.isDashing = false;
        this.dashCooldown = false;
        this.dashDir = 1;
        this.invulnerable = false;
        this.lastTapTime = { left: 0, right: 0 };
    }

    // Возвращает true, когда боец в "режиме ярости" (мало HP, но ещё жив).
    // Используется и для визуального свечения, и для бонуса к урону в checkHit().
    isRaging() {
        return this.hp > 0 && this.hp <= RAGE_HP_THRESHOLD;
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

        const idleBreath = (this.isGrounded && this.vx === 0 && !this.isAttacking)
            ? Math.sin(frame * 0.06) * 0.6 : 0;
        ctx.translate(0, -idleBreath);

        if (this.isDashing) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = this.accent;
            for (let i = 1; i <= 3; i++) {
                ctx.fillRect(-this.dashDir * i * 10 - 12, 0, 24, 38);
            }
            ctx.restore();
        }

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

        ctx.fillStyle = this.ultReady ? this.accent : '#101010';
        if (this.ultReady) { ctx.shadowColor = this.accent; ctx.shadowBlur = 6; }
        ctx.fillRect(4, -12, 3, 3);
        ctx.shadowBlur = 0;

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

        if (this.hp < 75) {
            ctx.fillStyle = '#a81b1b';
            ctx.fillRect(3, -16, 2, 2);
        }

        if (this.hp < 50) {
            ctx.fillStyle = '#4a2e56';
            ctx.fillRect(3, -11, 4, 3);
            ctx.fillRect(-6, 12, 5, 4);
        }

        if (this.hp < 30) {
            ctx.fillStyle = '#780e0e';
            ctx.fillRect(4, -18, 3, 2);
            ctx.fillRect(-2, 20, 6, 3);
        }

        if (this.ultReady) {
            ctx.save();
            ctx.globalAlpha = 0.45 + Math.sin(frame * 0.25) * 0.25;
            ctx.strokeStyle = this.accent;
            ctx.lineWidth = 3;
            ctx.shadowColor = this.accent;
            ctx.shadowBlur = 10;
            ctx.strokeRect(-22, -32, 62, 100);
            ctx.restore();
        }

        // РЕЖИМ ЯРОСТИ: при HP <= 25% боец светится красным и наносит +20% урона
        // (см. this.isRaging() и применение бонуса урона в checkHit())
        if (this.hp > 0 && this.isRaging()) {
            ctx.save();
            ctx.globalAlpha = 0.4 + Math.sin(frame * 0.35) * 0.2;
            ctx.strokeStyle = '#ff2244';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ff2244';
            ctx.shadowBlur = 14;
            ctx.strokeRect(-25, -35, 68, 106);
            ctx.restore();
        }

        if (this.isAttacking && this.attackType === 'ultimate') {
            const dir = this.isFacingRight ? 1 : -1;
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = this.accent;
            ctx.beginPath();
            ctx.moveTo(this.width / 2, 6);
            ctx.lineTo(this.width / 2 + dir * 70, 20);
            ctx.lineTo(this.width / 2 + dir * 70, 32);
            ctx.lineTo(this.width / 2, 40);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();

        if (this.hitFlash > 0) this.hitFlash--;
    }

    update(enemy) {
        if (isGameOver) return;

        this.isFacingRight = this.x < enemy.x;
        this.isBlocking = keys[this.controls.block] || false;

        if (this.isDashing) {
            this.vx = this.dashDir * this.speed * 3.4;
        } else if (!this.isBlocking && !this.isAttacking) {
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

        if (!this.isDashing && !this.isBlocking && !this.attackCooldown) {
            const punchHeld = keys[this.controls.punch];
            const kickHeld = keys[this.controls.kick];

            if (this.ultReady && keys[this.controls.ult]) {
                this.attack('ultimate');
            } else if (punchHeld && kickHeld) {
                // Удар + пинок вместе = бросок. Бросок пробивает блок соперника,
                // поэтому это единственный способ достать заблокировавшегося врага.
                this.attack('throw');
            } else if (punchHeld && !this.isGrounded) {
                // Удар в прыжке превращается в апперкот: больше урона, подбрасывает врага.
                this.attack('uppercut');
            } else if (kickHeld) {
                this.attack('kick');
            } else if (punchHeld) {
                this.attack('punch');
            }
        }

        if (!this.isDashing) this.stamina = Math.min(this.maxStamina, this.stamina + 0.22);

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

        let activeTime, cooldownTime;
        if (type === 'ultimate') { activeTime = 260; cooldownTime = 900; }
        else if (type === 'throw') { activeTime = 120; cooldownTime = 700; }   // тяжёлый, но медленный бросок
        else if (type === 'uppercut') { activeTime = 200; cooldownTime = 520; }
        else if (type === 'kick') { activeTime = 180; cooldownTime = 550; }
        else { activeTime = 150; cooldownTime = 400; }

        setTimeout(() => { this.isAttacking = false; }, activeTime);
        setTimeout(() => { this.attackCooldown = false; }, cooldownTime);

        if (type === 'ultimate') {
            this.ultCharge = 0;
            this.ultReady = false;
        }
    }

    getAttackBox() {
        const isKick = this.attackType === 'kick';
        const isUlt = this.attackType === 'ultimate';
        const isUppercut = this.attackType === 'uppercut';
        const isThrow = this.attackType === 'throw';

        let width, height, yOffset;
        if (isUlt) { width = 90; height = 34; yOffset = 6; }
        else if (isThrow) { width = 34; height = 45; yOffset = 10; }     // короткая, но высокая зона захвата
        else if (isUppercut) { width = 38; height = 45; yOffset = -10; } // бьёт снизу вверх
        else if (isKick) { width = 62; height = 20; yOffset = 27; }
        else { width = 45; height = 25; yOffset = 15; }

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
    controls: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', punch: 'KeyJ', kick: 'KeyL', block: 'KeyK', ult: 'KeyS' },
    name: 'DUKE'
});

let p2 = new Fighter({
    x: 560, y: 200, color: '#ff3333', skinAccent: '#33ffee', isFacingRight: false,
    controls: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', punch: 'KeyU', kick: 'KeyO', block: 'KeyI', ult: 'ArrowDown' },
    name: 'RITA'
});

function aiControlP2(cpu, player) {
    for (const key of Object.values(cpu.controls)) {
        keys[key] = false;
        if (touchBtnMap[key]) touchBtnMap[key].classList.remove('active');
    }

    // Настройки поведения бота зависят от выбранной в настройках сложности
    const diff = DIFFICULTY_SETTINGS[cpuDifficulty];

    // Небольшой шанс, что бот "зевнёт" и вообще ничего не сделает в этот кадр —
    // на лёгкой сложности это происходит намного чаще, имитируя медленную реакцию.
    if (Math.random() < diff.mistakeChance) return;

    const dx = player.x - cpu.x;
    const distance = Math.abs(dx);

    const pressKey = (code) => {
        keys[code] = true;
        if (touchBtnMap[code]) touchBtnMap[code].classList.add('active');
    };

    // Против броска блок бесполезен, поэтому реагируем блоком только на обычные удары/пинки
    const playerThreatIsThrow = player.isAttacking && player.attackType === 'throw';
    if (player.isAttacking && !playerThreatIsThrow && distance < 110 && Math.random() < diff.blockChance) {
        pressKey(cpu.controls.block);
        return;
    }

    if (distance > diff.attackRange) {
        pressKey(dx > 0 ? cpu.controls.right : cpu.controls.left);
        if (Math.random() < diff.jumpChance) pressKey(cpu.controls.jump);
    } else if (!cpu.attackCooldown) {
        if (Math.random() > diff.attackChance) return; // на лёгкой сложности бот иногда бездействует вплотную

        if (cpu.ultReady && Math.random() < diff.ultChance) {
            pressKey(cpu.controls.ult);
        } else if (player.isBlocking && Math.random() < diff.throwChance) {
            // Бот замечает, что игрок блокирует, и пробивает бросок (только на средней/высокой сложности)
            pressKey(cpu.controls.punch);
            pressKey(cpu.controls.kick);
        } else if (Math.random() < 0.35) {
            pressKey(cpu.controls.kick);
        } else {
            pressKey(cpu.controls.punch);
        }
    }
}

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
            const hitX = box.x + box.width / 2;
            const hitY = box.y + box.height / 2;

            if (defender.invulnerable) {
                attacker.isAttacking = false;
                addSparks(hitX, hitY, '#8fffe0', 8);
                spawnFloatingText(hitX, hitY - 10, 'MISS!', '#8fffe0', 14);
                return;
            }

            attacker.isAttacking = false;
            const isKick = attacker.attackType === 'kick';
            const isUlt = attacker.attackType === 'ultimate';
            const isUppercut = attacker.attackType === 'uppercut';
            const isThrow = attacker.attackType === 'throw';

            // Бросок обходит блок полностью — именно поэтому это "контрприём" против
            // тех, кто прячется за блоком. Уклониться от него можно только рывком (dash).
            const effectiveBlocking = defender.isBlocking && !isThrow;

            let damage;
            if (isUlt) damage = effectiveBlocking ? 8 : 35;
            else if (isThrow) damage = 14;
            else if (isUppercut) damage = effectiveBlocking ? 5 : 20;
            else damage = effectiveBlocking ? (isKick ? 3 : 2) : (isKick ? 16 : 12);

            // Режим ярости: боец с критически низким HP наносит усиленный урон —
            // небольшой шанс на камбэк в безнадёжной ситуации.
            if (attacker.isRaging()) {
                damage = Math.round(damage * RAGE_DAMAGE_MULT);
            }

            if (!isUlt) {
                const chargeGain = isThrow ? 12 : (isUppercut || isKick ? 26 : 18);
                const chargeGainDefender = isThrow ? 6 : (isUppercut || isKick ? 15 : 10);
                if (!effectiveBlocking) {
                    attacker.ultCharge = Math.min(100, attacker.ultCharge + chargeGain);
                    defender.ultCharge = Math.min(100, defender.ultCharge + chargeGainDefender);
                } else {
                    attacker.ultCharge = Math.min(100, attacker.ultCharge + 6);
                }
                attacker.ultReady = attacker.ultCharge >= 100;
                defender.ultReady = defender.ultCharge >= 100;
            }

            if (!effectiveBlocking) {
                hitStopFrames = isUlt ? 16 : (isThrow ? 10 : (isKick || isUppercut ? 6 : 3));
            }

            defender.hp -= damage;
            if (defender.hp < 0) defender.hp = 0;
            defenderHpEl.style.width = defender.hp + '%';
            defenderHpEl.classList.remove('mid', 'low');
            if (defender.hp <= 25) defenderHpEl.classList.add('low');
            else if (defender.hp <= 55) defenderHpEl.classList.add('mid');

            if (effectiveBlocking) {
                addSparks(hitX, hitY, '#cfd8e3', 6);
                triggerShake(2, 6);
                playSound('block');
                attacker.comboCount = 0;
                spawnDamageNumber(hitX, hitY, damage, false, true);
            } else {
                defender.hitFlash = isUlt ? 12 : 6;
                const sparkColor = isUlt ? '#7c4dff' : isThrow ? '#ff5577' : isUppercut ? '#ffe14d' : (isKick ? '#ff8a3d' : '#ffcc00');
                addSparks(hitX, hitY, sparkColor, isUlt ? 28 : (isThrow || isKick || isUppercut ? 16 : 12));
                triggerShake(isUlt ? 16 : (isThrow ? 12 : (isKick || isUppercut ? 9 : 6)), isUlt ? 22 : (isKick || isUppercut || isThrow ? 14 : 10));
                playSound(isUlt ? 'ko' : isThrow ? 'throw' : isUppercut ? 'uppercut' : (isKick ? 'kick' : 'punch'));

                attacker.comboCount = (frame - attacker.lastHitFrame < 90) ? attacker.comboCount + 1 : 1;
                attacker.lastHitFrame = frame;

                spawnDamageNumber(hitX, hitY, damage, isUlt || isKick || isUppercut || isThrow, false);

                if (attacker.comboCount >= 2) {
                    spawnComboText(hitX, hitY - 20, attacker.comboCount);
                }

                // Апперкот подбрасывает соперника в воздух — короткий момент уязвимости
                if (isUppercut) {
                    defender.vy = -9;
                    defender.isGrounded = false;
                }

                // При зрелищном комбо трибуны "заводятся" сильнее (см. drawArena/crowd)
                if (attacker.comboCount >= 3) hypeLevel = 45;

                // Учёт статистики матча для итогового экрана
                const statsKey = attacker === p1 ? 'p1' : 'p2';
                const s = matchStats[statsKey];
                if (isUlt) s.ultimates++;
                else if (isThrow) s.throws++;
                else if (isUppercut) s.uppercuts++;
                else if (isKick) s.kicks++;
                else s.punches++;
                s.maxCombo = Math.max(s.maxCombo, attacker.comboCount);
            }

            const pushDir = attacker.isFacingRight ? 1 : -1;
            defender.x += pushDir * (isThrow ? 34 : (isUppercut ? 10 : (isKick ? 22 : 15)));

            if (defender.hp <= 0) {
                flash = 1;
                endRound(attacker === p1 ? 'p1' : 'p2', true);
            }
        }
    }
}

function updateUltBar(fighter, el) {
    if (!el) return;
    el.style.width = fighter.ultCharge + '%';
    el.classList.toggle('ready', fighter.ultReady);
}

const DASH_COST = 30;
const DASH_DURATION_MS = 160;
const DASH_COOLDOWN_MS = 550;
const DOUBLE_TAP_WINDOW_MS = 260;

function updateStaminaBar(fighter, el) {
    if (!el) return;
    el.style.width = fighter.stamina + '%';
    el.classList.toggle('ready', fighter.stamina >= DASH_COST && !fighter.dashCooldown);
}

function tryDash(fighter, code) {
    let dir = null;
    if (code === fighter.controls.left) dir = 'left';
    else if (code === fighter.controls.right) dir = 'right';
    else return;

    const now = performance.now();
    const lastTap = fighter.lastTapTime[dir] || 0;

    if (now - lastTap < DOUBLE_TAP_WINDOW_MS) {
        startDash(fighter, dir === 'left' ? -1 : 1);
    }
    fighter.lastTapTime[dir] = now;
}

function startDash(fighter, dirSign) {
    if (isGameOver || isPaused) return;
    if (fighter.isDashing || fighter.dashCooldown) return;
    if (fighter.stamina < DASH_COST) return;
    if (fighter.isBlocking || fighter.isAttacking) return;

    fighter.stamina -= DASH_COST;
    fighter.isDashing = true;
    fighter.invulnerable = true;
    fighter.dashCooldown = true;
    fighter.dashDir = dirSign;

    playSound('block');

    setTimeout(() => {
        fighter.isDashing = false;
        fighter.invulnerable = false;
    }, DASH_DURATION_MS);

    setTimeout(() => { fighter.dashCooldown = false; }, DASH_COOLDOWN_MS);
}

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

const crowdColors = ['rgba(255,80,80,0.75)', 'rgba(80,140,255,0.75)', 'rgba(255,204,0,0.7)', 'rgba(150,90,220,0.75)', 'rgba(90,220,180,0.7)'];
const crowd = Array.from({ length: 30 }, (_, i) => ({
    x: arenaLeft + 6 + (i % 15) * ((arenaRight - arenaLeft - 12) / 14) + (Math.random() * 8 - 4),
    row: i < 15 ? 0 : 1,
    bob: Math.random() * Math.PI * 2,
    h: 10 + Math.random() * 6,
    color: crowdColors[Math.floor(Math.random() * crowdColors.length)],
    armPhase: Math.random() * Math.PI * 2
}));

// Третий, самый дальний ряд трибун — мельче и тусклее, добавляет глубины сцене
const crowdBack = Array.from({ length: 20 }, (_, i) => ({
    x: arenaLeft + 10 + (i % 20) * ((arenaRight - arenaLeft - 20) / 19) + (Math.random() * 6 - 3),
    bob: Math.random() * Math.PI * 2,
    h: 7 + Math.random() * 4,
    color: crowdColors[Math.floor(Math.random() * crowdColors.length)]
}));

// Силуэт далёкого города на заднем плане — просто прямоугольники разной высоты
// со случайно "горящими" окнами, которые мерцают со временем.
const skyline = Array.from({ length: 15 }, (_, i) => ({
    x: i * 60 - 20,
    w: 34 + Math.random() * 22,
    h: 35 + Math.random() * 95,
    windows: Array.from({ length: 5 }, () => ({
        dx: Math.random(),
        dy: Math.random(),
        on: Math.random() < 0.5,
        phase: Math.random() * Math.PI * 2
    }))
}));

// Прожекторы, "гуляющие" по небу — типичная деталь антуража спортивной арены.
// Рисуются с composite-режимом 'lighter', чтобы лучи выглядели светящимися.
const spotlights = [
    { baseX: 130, speed: 0.55, phase: 0.0, color: 'rgba(255,255,255,0.09)' },
    { baseX: 400, speed: -0.45, phase: 2.1, color: 'rgba(120,200,255,0.10)' },
    { baseX: 660, speed: 0.4, phase: 4.2, color: 'rgba(255,120,200,0.08)' }
];

// Фейерверки на заднем плане — случайные вспышки частиц в верхней части неба
let fireworks = [];

// Редкие вспышки "молнии", подсвечивающие небо (чисто декоративный эффект)
let lightningFlash = 0;

// Смещение бегущей строки на табло арены (см. drawMarquee)
let marqueeOffset = 0;
const marqueeText = '★ ULTRA FIGHT NIGHT ★  ГОТОВЬСЯ К БОЮ  ★ УДАР + ПИНОК = БРОСОК  ';

const embers = Array.from({ length: 25 }, () => ({
    x: Math.random() * worldW,
    y: floorY + Math.random() * 80,
    speed: 0.3 + Math.random() * 0.6,
    drift: (Math.random() - 0.5) * 0.3,
    size: 1 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2
}));

function updateAndDrawEmbers(t) {
    ctx.save();
    embers.forEach(e => {
        e.y -= e.speed;
        e.x += e.drift;
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

// Рисует силуэт далёкого города с мерцающими окнами (самый дальний слой фона)
function drawSkyline(t, parallax) {
    ctx.save();
    ctx.translate(-parallax * 0.2, 0); // самый слабый параллакс — город "дальше" всех
    skyline.forEach(b => {
        const baseY = floorY - 100;
        ctx.fillStyle = '#170b26';
        ctx.fillRect(b.x, baseY - b.h, b.w, b.h);
        b.windows.forEach(w => {
            const flicker = Math.sin(t * 1.2 + w.phase) > 0.3;
            if (w.on && flicker) {
                ctx.fillStyle = 'rgba(255, 214, 120, 0.85)';
                ctx.fillRect(b.x + w.dx * (b.w - 4) + 2, baseY - b.h + w.dy * (b.h - 6) + 3, 2, 3);
            }
        });
    });
    ctx.restore();
}

// Лучи прожекторов, "гуляющие" по небу — рисуются в аддитивном режиме (lighter),
// чтобы выглядеть как настоящий свет, а не плоские полупрозрачные треугольники.
function drawSpotlights(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    spotlights.forEach(sp => {
        const angle = Math.sin(t * sp.speed + sp.phase) * 0.85;
        const originX = sp.baseX;
        const originY = floorY - 96;
        const length = 250;
        const spread = 0.2;
        const dx1 = Math.sin(angle - spread) * length;
        const dy1 = -Math.cos(angle - spread) * length;
        const dx2 = Math.sin(angle + spread) * length;
        const dy2 = -Math.cos(angle + spread) * length;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + dx1, originY + dy1);
        ctx.lineTo(originX + dx2, originY + dy2);
        ctx.closePath();
        ctx.fillStyle = sp.color;
        ctx.fill();
    });
    ctx.restore();
}

// Изредка запускает фейерверк в верхней части неба
function maybeSpawnFirework() {
    if (Math.random() < 0.006) {
        const x = 60 + Math.random() * (worldW - 120);
        const y = 35 + Math.random() * 65;
        const color = ['#ff5577', '#ffcc00', '#33ffee', '#7c4dff', '#4dff88'][Math.floor(Math.random() * 5)];
        const particles = Array.from({ length: 16 }, () => {
            const a = Math.random() * Math.PI * 2;
            const sp = 1 + Math.random() * 2.2;
            return { dx: Math.cos(a) * sp, dy: Math.sin(a) * sp };
        });
        fireworks.push({ x, y, particles, life: 40, maxLife: 40, color });
    }
}

function updateAndDrawFireworks() {
    ctx.save();
    for (let i = fireworks.length - 1; i >= 0; i--) {
        const f = fireworks[i];
        f.life--;
        if (f.life <= 0) { fireworks.splice(i, 1); continue; }
        const progress = 1 - f.life / f.maxLife;
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.fillStyle = f.color;
        f.particles.forEach(p => {
            ctx.fillRect(f.x + p.dx * progress * 32, f.y + p.dy * progress * 32, 2, 2);
        });
    }
    ctx.restore();
}

// Редкая декоративная вспышка "молнии" — подсвечивает небо на пару кадров
function maybeTriggerLightning() {
    if (Math.random() < 0.0012) lightningFlash = 10;
}

function drawLightningOverlay() {
    if (lightningFlash > 0) {
        ctx.save();
        ctx.globalAlpha = (lightningFlash / 10) * 0.3;
        ctx.fillStyle = '#cfd9ff';
        ctx.fillRect(0, 0, worldW, floorY - 100);
        ctx.restore();
        lightningFlash--;
    }
}

// Бегущая светодиодная строка на табло над ареной — чисто атмосферная деталь
function drawMarquee(roofY) {
    const stripH = 10;
    const y = roofY - stripH - 3;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(arenaLeft, y, arenaRight - arenaLeft, stripH);
    ctx.beginPath();
    ctx.rect(arenaLeft, y, arenaRight - arenaLeft, stripH);
    ctx.clip();
    ctx.fillStyle = '#ffcc00';
    ctx.font = '900 9px monospace';
    ctx.textBaseline = 'middle';
    marqueeOffset -= 0.6;
    const textWidth = ctx.measureText(marqueeText).width;
    if (marqueeOffset < -textWidth) marqueeOffset = 0;
    ctx.fillText(marqueeText, arenaLeft + marqueeOffset, y + stripH / 2 + 1);
    ctx.fillText(marqueeText, arenaLeft + marqueeOffset + textWidth, y + stripH / 2 + 1);
    ctx.restore();
}

// Пульсирующие неоновые линии энергетического барьера вдоль края арены
function drawBarrierGlow() {
    ctx.save();
    for (let i = 0; i < 3; i++) {
        const yy = floorY + 14 + i * 22;
        const pulse = 0.25 + 0.25 * Math.abs(Math.sin(frame * 0.05 + i));
        ctx.strokeStyle = `rgba(255, 0, 85, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(arenaLeft, yy);
        ctx.lineTo(arenaRight, yy);
        ctx.stroke();
    }
    ctx.restore();
}

// Лёгкое затемнение по краям экрана — фокусирует взгляд на центре арены
function drawVignette() {
    const grad = ctx.createRadialGradient(worldW / 2, worldH / 2, 140, worldW / 2, worldH / 2, 470);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, worldW, worldH);
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

    // Мерцающий город на самом дальнем плане — рисуется под звёздами
    drawSkyline(t, parallax);

    stars.forEach(s => {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.phase));
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
        ctx.fillRect(s.x, s.y, s.r, s.r);
    });

    ctx.fillStyle = '#fff3cc';
    ctx.beginPath();
    ctx.arc(680, 55, 22, 0, Math.PI * 2);
    ctx.fill();

    // Редкая молния и фейерверки в небе — добавляют жизни фону
    maybeTriggerLightning();
    drawLightningOverlay();
    maybeSpawnFirework();
    updateAndDrawFireworks();

    clouds.forEach(c => {
        c.x += c.speed;
        if (c.x - c.w > worldW) c.x = -c.w;
        ctx.fillStyle = 'rgba(20, 8, 28, 0.55)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w / 2, 10, 0, 0, Math.PI * 2);
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

    // Прожекторы поверх гор — создают ощущение вечернего шоу
    drawSpotlights(t);

    ctx.save();
    ctx.translate(-parallax, 0);
    const roofY = floorY - 100;

    ctx.fillStyle = '#3a1414';
    ctx.fillRect(arenaLeft - 10, roofY - 10, arenaRight - arenaLeft + 20, 14);

    // "Накал трибун" постепенно спадает — пока он высок, толпа прыгает активнее
    if (hypeLevel > 0) hypeLevel--;
    const hypeMult = 1 + (hypeLevel / 45) * 1.6;

    // Дальний (третий) ряд трибун — мельче и тише, для глубины сцены
    crowdBack.forEach(p => {
        const bob = Math.sin(t * 1.6 + p.bob) * 1.2 * hypeMult;
        const px = p.x - parallax * 0.35;
        const py = roofY + 78 + bob;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(px - 3, py + 2, 6, p.h);
        ctx.globalAlpha = 1;
    });

    crowd.forEach(p => {
        const bob = Math.sin(t * 2 + p.bob) * 2 * hypeMult;
        const px = p.x - parallax * 0.5;
        const py = roofY + 92 + bob;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(px - 4, py + 3, 8, p.h);
    });

    // Бегущая строка табло над трибунами
    drawMarquee(roofY);

    ctx.restore();

    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(arenaLeft, floorY, arenaRight - arenaLeft, 80);

    // Неоновые линии энергетического барьера — атмосферная деталь в духе аркад
    drawBarrierGlow();

    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arenaLeft, floorY);
    ctx.lineTo(arenaRight, floorY);
    ctx.stroke();

    // Угловые стойки теперь окрашены в цвет текущей расцветки каждого бойца
    ctx.fillStyle = p1.color;
    ctx.fillRect(arenaLeft, floorY, 6, 80);
    ctx.fillStyle = p2.color;
    ctx.fillRect(arenaRight - 6, floorY, 6, 80);

    updateAndDrawEmbers(t);

    // Виньетка поверх всей сцены — держит фокус на центре арены
    drawVignette();
}

// ==================================================================
//  ВСТУПИТЕЛЬНАЯ ЗАСТАВКА РАУНДА: "РАУНД N" -> "БОЙ!"
//  Пока она активна, обновление боя (aiControlP2/update/checkHit) не
//  выполняется — бойцы просто стоят на месте, а таймер раунда не тикает.
// ==================================================================
const INTRO_STAGE0_FRAMES = 65; // сколько кадров держится надпись "РАУНД N"
const INTRO_STAGE1_FRAMES = 45; // сколько кадров держится надпись "БОЙ!"

function triggerRoundIntro() {
    clearInterval(timerInterval); // таймер раунда не должен идти во время заставки
    intro = { active: true, frames: 0, stage: 0 };
}

function advanceIntro() {
    intro.frames++;
    if (intro.stage === 0 && intro.frames >= INTRO_STAGE0_FRAMES) {
        intro.stage = 1;
        intro.frames = 0;
        playSound('bell');
    } else if (intro.stage === 1 && intro.frames >= INTRO_STAGE1_FRAMES) {
        intro.active = false;
        startTimer(); // бой официально начинается — запускаем обратный отсчёт
    }
}

function drawIntroText() {
    const text = intro.stage === 0 ? `РАУНД ${currentRoundNum}` : 'БОЙ!';
    const color = intro.stage === 0 ? '#ffcc00' : '#ff0055';
    const stageFrames = intro.stage === 0 ? INTRO_STAGE0_FRAMES : INTRO_STAGE1_FRAMES;

    // Небольшая анимация "выскакивания" текста в начале появления
    const growth = Math.min(1, intro.frames / 10);
    const scale = 0.6 + growth * 0.4;
    const fadeOut = intro.frames > stageFrames - 12 ? (stageFrames - intro.frames) / 12 : 1;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.25 * fadeOut})`;
    ctx.fillRect(0, 0, worldW, worldH);

    ctx.translate(worldW / 2, worldH / 2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = '900 46px sans-serif';
    ctx.globalAlpha = Math.max(0, fadeOut);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
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

    if (!isPaused && intro.active) {
        // Заставка "РАУНД N / БОЙ!" — бойцы видны, но не двигаются и не дерутся
        advanceIntro();
        p1.draw();
        p2.draw();
        drawIntroText();
    } else if (!isPaused) {
        if (hitStopFrames > 0) {
            hitStopFrames--;
            p1.draw();
            p2.draw();
        } else {
            if (cpuEnabled) aiControlP2(p2, p1);

            p1.update(p2);
            p2.update(p1);
            checkHit(p1, p2, p2HpEl);
            checkHit(p2, p1, p1HpEl);
        }
        updateAndDrawSparks();
        updateAndDrawFloatingTexts();

        updateUltBar(p1, p1UltEl);
        updateUltBar(p2, p2UltEl);
        updateStaminaBar(p1, p1StaminaEl);
        updateStaminaBar(p2, p2StaminaEl);
    } else {
        p1.draw();
        p2.draw();
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
        if (timeLeft > 0 && !isPaused && !isGameOver && !intro.active) {
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

function updateRoundIndicator() {
    if (!roundIndicatorEl) return;
    roundIndicatorEl.textContent = totalRounds === 1
        ? ''
        : `РАУНД ${currentRoundNum}/${totalRounds} • СЧЁТ ${p1RoundWins}:${p2RoundWins}`;
}

function endRound(winnerKey, isKO) {
    isGameOver = true;
    clearInterval(timerInterval);
    playSound('ko');

    if (winnerKey === 'p1') p1RoundWins++;
    else if (winnerKey === 'p2') p2RoundWins++;

    updateRoundIndicator();

    const p1WonMatch = p1RoundWins >= roundsToWin;
    const p2WonMatch = p2RoundWins >= roundsToWin;
    const noRoundsLeft = currentRoundNum >= totalRounds;

    matchOver = p1WonMatch || p2WonMatch || noRoundsLeft;

    let text;
    if (!matchOver) {
        const roundWinnerLabel = winnerKey === 'p1' ? 'ИГРОК 1' : winnerKey === 'p2' ? 'ИГРОК 2' : null;
        text = roundWinnerLabel
            ? `${roundWinnerLabel}<br>ВЫИГРАЛ РАУНД ${currentRoundNum}`
            : `РАУНД ${currentRoundNum}<br>НИЧЬЯ`;
        continueBtn.textContent = 'Следующий раунд';
    } else {
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

    if (matchOver) {
        // Обновляем серию побед подряд и сохраняем её в localStorage
        const matchWinnerKey = p1RoundWins > p2RoundWins ? 'p1' : (p2RoundWins > p1RoundWins ? 'p2' : null);
        if (matchWinnerKey) {
            if (winStreak.winnerKey === matchWinnerKey) winStreak.count++;
            else winStreak = { winnerKey: matchWinnerKey, count: 1 };
        } else {
            winStreak = { winnerKey: null, count: 0 };
        }
        try { localStorage.setItem('fightGameWinStreak', JSON.stringify(winStreak)); } catch (e) { /* localStorage недоступен — не критично */ }
        updateStreakIndicator();

        // Показываем итоговую статистику матча
        matchStatsEl.innerHTML = buildMatchStatsHtml();
        matchStatsEl.classList.remove('hidden');
    } else {
        matchStatsEl.classList.add('hidden');
    }

    gameOverScreen.classList.remove('hidden');
}

// Формирует HTML со статистикой ударов/бросков/апперкотов/ультимейтов за матч
function buildMatchStatsHtml() {
    const row = (fighter, stats) => `
        <div><strong>${fighter.name}:</strong>
        Удары: ${stats.punches} · Пинки: ${stats.kicks} · Апперкоты: ${stats.uppercuts} ·
        Броски: ${stats.throws} · Ультимейты: ${stats.ultimates} · Макс. комбо: ${stats.maxCombo}</div>`;
    return row(p1, matchStats.p1) + row(p2, matchStats.p2);
}

// Обновляет текст индикатора серии побед в шапке (показывается только если серия >= 2)
function updateStreakIndicator() {
    if (!streakIndicatorEl) return;
    if (winStreak.count >= 2 && winStreak.winnerKey) {
        const fighterName = winStreak.winnerKey === 'p1' ? p1.name : p2.name;
        streakIndicatorEl.textContent = `🔥 ${fighterName}: серия ${winStreak.count}`;
    } else {
        streakIndicatorEl.textContent = '';
    }
}

function handleContinue() {
    if (matchOver) {
        resetGame();
    } else {
        currentRoundNum++;
        updateRoundIndicator();
        startNextRound();
    }
}

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

    p1.ultCharge = 0; p1.ultReady = false;
    p2.ultCharge = 0; p2.ultReady = false;
    updateUltBar(p1, p1UltEl);
    updateUltBar(p2, p2UltEl);

    p1.stamina = 100; p1.isDashing = false; p1.dashCooldown = false; p1.invulnerable = false;
    p2.stamina = 100; p2.isDashing = false; p2.dashCooldown = false; p2.invulnerable = false;
    updateStaminaBar(p1, p1StaminaEl);
    updateStaminaBar(p2, p2StaminaEl);

    hitStopFrames = 0;
    sparks = [];
    floatingTexts = [];
    fireworks = [];
    hypeLevel = 0;
    shake = { time: 0, magnitude: 0 };
    flash = 0;
    gameOverScreen.classList.add('hidden');
    triggerRoundIntro(); // вместо немедленного старта таймера — заставка "РАУНД N / БОЙ!"
}

function resetGame() {
    p1RoundWins = 0;
    p2RoundWins = 0;
    currentRoundNum = 1;
    matchOver = false;
    matchStats = { p1: makeEmptyStats(), p2: makeEmptyStats() }; // статистика считается заново для нового матча
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

if (settingsBtn && settingsScreen) {
    settingsBtn.addEventListener('click', () => {
        isPaused = true;
        settingsScreen.classList.remove('hidden');
    });
}

if (closeSettingsBtn && settingsScreen) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsScreen.classList.add('hidden');
        isPaused = false;
    });
}

if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundToggleBtn.textContent = soundEnabled ? 'ВКЛ' : 'ВЫКЛ';
        soundToggleBtn.style.borderColor = soundEnabled ? '#ff0055' : '#777';
    });
}

if (speedToggleBtn) {
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
}

if (continueBtn) {
    continueBtn.addEventListener('click', handleContinue);
}

if (cpuToggleBtn) {
    cpuToggleBtn.addEventListener('click', () => {
        cpuEnabled = !cpuEnabled;
        cpuToggleBtn.textContent = cpuEnabled ? 'CPU (бот)' : 'Человек';
        if (p2NameEl) {
            p2NameEl.textContent = cpuEnabled ? 'RITA (P2) — [CPU]' : 'RITA (P2)';
        }
        for (const key of Object.values(p2.controls)) {
            keys[key] = false;
            if (touchBtnMap[key]) touchBtnMap[key].classList.remove('active');
        }
    });
}

if (roundsToggleBtn) {
    roundsToggleBtn.addEventListener('click', () => {
        totalRounds = totalRounds === 1 ? 3 : 1;
        roundsToWin = totalRounds === 1 ? 1 : 2;
        roundsToggleBtn.textContent = totalRounds === 1 ? '1 раунд' : 'До 2 побед (Bo3)';
        resetGame();
    });
}

const hintsToggleBtn = document.getElementById('hints-toggle-btn');
const hintsBlock = document.getElementById('controls-hints');
let hintsEnabled = true;

if (hintsToggleBtn && hintsBlock) {
    hintsToggleBtn.addEventListener('click', () => {
        hintsEnabled = !hintsEnabled;
        hintsToggleBtn.textContent = hintsEnabled ? 'ВКЛ' : 'ВЫКЛ';
        hintsToggleBtn.style.borderColor = hintsEnabled ? '#ff0055' : '#777';
        hintsBlock.style.display = hintsEnabled ? 'block' : 'none';
    });
}

// Переключатель сложности CPU: листает Лёгкая -> Обычная -> Сложная -> по кругу
if (difficultyToggleBtn) {
    difficultyToggleBtn.addEventListener('click', () => {
        const idx = DIFFICULTY_ORDER.indexOf(cpuDifficulty);
        cpuDifficulty = DIFFICULTY_ORDER[(idx + 1) % DIFFICULTY_ORDER.length];
        difficultyToggleBtn.textContent = DIFFICULTY_LABELS[cpuDifficulty];
    });
}

// Применяет выбранный цветовой пресет к бойцу: обновляет и канвас-спрайт, и портрет в шапке
function applyColorPreset(fighter, preset, portraitEl, button) {
    fighter.color = preset.color;
    fighter.accent = preset.accent;
    if (portraitEl) portraitEl.style.background = preset.color;
    if (button) button.textContent = preset.label;
}

if (p1ColorBtn) {
    p1ColorBtn.addEventListener('click', () => {
        p1ColorIndex = (p1ColorIndex + 1) % colorPresets.length;
        applyColorPreset(p1, colorPresets[p1ColorIndex], p1PortraitEl, p1ColorBtn);
    });
}

if (p2ColorBtn) {
    p2ColorBtn.addEventListener('click', () => {
        p2ColorIndex = (p2ColorIndex + 1) % colorPresets.length;
        applyColorPreset(p2, colorPresets[p2ColorIndex], p2PortraitEl, p2ColorBtn);
    });
}

updateRoundIndicator();
updateStreakIndicator(); // показываем сохранённую серию побед сразу при загрузке страницы
triggerRoundIntro();     // первый раунд тоже начинается с заставки "РАУНД 1 / БОЙ!"
gameLoop();