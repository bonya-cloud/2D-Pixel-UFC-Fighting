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

let timeLeft = 99;
let timerInterval = null;
let isGameOver = false;
let frame = 0;
let isPaused = false; 
let cpuEnabled = true;

let hitStopFrames = 0;

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
            if (this.ultReady && keys[this.controls.ult]) this.attack('ultimate');
            else if (keys[this.controls.kick]) this.attack('kick');
            else if (keys[this.controls.punch]) this.attack('punch');
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
        const width = isUlt ? 90 : (isKick ? 62 : 45);
        const height = isUlt ? 34 : (isKick ? 20 : 25);
        const yOffset = isUlt ? 6 : (isKick ? 27 : 15);
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

    const dx = player.x - cpu.x;
    const distance = Math.abs(dx);
    const attackRange = 95;

    const pressKey = (code) => {
        keys[code] = true;
        if (touchBtnMap[code]) touchBtnMap[code].classList.add('active');
    };

    if (player.isAttacking && distance < 110 && Math.random() < 0.6) {
        pressKey(cpu.controls.block);
        return;
    }

    if (distance > attackRange) {
        pressKey(dx > 0 ? cpu.controls.right : cpu.controls.left);
        if (Math.random() < 0.004) pressKey(cpu.controls.jump);
    } else if (!cpu.attackCooldown) {
        if (cpu.ultReady && Math.random() < 0.35) {
            pressKey(cpu.controls.ult);
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

            let damage;
            if (isUlt) damage = defender.isBlocking ? 8 : 35;
            else damage = defender.isBlocking ? (isKick ? 3 : 2) : (isKick ? 16 : 12);

            if (!isUlt) {
                if (!defender.isBlocking) {
                    attacker.ultCharge = Math.min(100, attacker.ultCharge + (isKick ? 26 : 18));
                    defender.ultCharge = Math.min(100, defender.ultCharge + (isKick ? 15 : 10));
                } else {
                    attacker.ultCharge = Math.min(100, attacker.ultCharge + 6);
                }
                attacker.ultReady = attacker.ultCharge >= 100;
                defender.ultReady = defender.ultCharge >= 100;
            }

            if (!defender.isBlocking) {
                hitStopFrames = isUlt ? 16 : (isKick ? 6 : 3);
            }

            defender.hp -= damage;
            if (defender.hp < 0) defender.hp = 0;
            defenderHpEl.style.width = defender.hp + '%';
            defenderHpEl.classList.remove('mid', 'low');
            if (defender.hp <= 25) defenderHpEl.classList.add('low');
            else if (defender.hp <= 55) defenderHpEl.classList.add('mid');

            if (defender.isBlocking) {
                addSparks(hitX, hitY, '#cfd8e3', 6);
                triggerShake(2, 6);
                playSound('block');
                attacker.comboCount = 0;
                spawnDamageNumber(hitX, hitY, damage, false, true);
            } else {
                defender.hitFlash = isUlt ? 12 : 6;
                addSparks(hitX, hitY, isUlt ? '#7c4dff' : (isKick ? '#ff8a3d' : '#ffcc00'), isUlt ? 28 : (isKick ? 16 : 12));
                triggerShake(isUlt ? 16 : (isKick ? 9 : 6), isUlt ? 22 : (isKick ? 14 : 10));
                playSound(isUlt ? 'ko' : (isKick ? 'kick' : 'punch'));

                attacker.comboCount = (frame - attacker.lastHitFrame < 90) ? attacker.comboCount + 1 : 1;
                attacker.lastHitFrame = frame;

                spawnDamageNumber(hitX, hitY, damage, isUlt || isKick, false);

                if (attacker.comboCount >= 2) {
                    spawnComboText(hitX, hitY - 20, attacker.comboCount);
                }
            }

            const pushDir = attacker.isFacingRight ? 1 : -1;
            defender.x += pushDir * (isKick ? 22 : 15);

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

    ctx.save();
    ctx.translate(-parallax, 0);
    const roofY = floorY - 100;

    ctx.fillStyle = '#3a1414';
    ctx.fillRect(arenaLeft - 10, roofY - 10, arenaRight - arenaLeft + 20, 14);

    crowd.forEach(p => {
        const bob = Math.sin(t * 2 + p.bob) * 2;
        const px = p.x - parallax * 0.5;
        const py = roofY + 92 + bob;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(px - 4, py + 3, 8, p.h);
    });

    ctx.restore();

    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(arenaLeft, floorY, arenaRight - arenaLeft, 80);

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

    updateAndDrawEmbers(t);
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
    gameOverScreen.classList.remove('hidden');
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
    shake = { time: 0, magnitude: 0 };
    flash = 0;
    gameOverScreen.classList.add('hidden');
    clearInterval(timerInterval);
    startTimer();
}

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

updateRoundIndicator();
startTimer();
gameLoop();