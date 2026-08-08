const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
// The canvas buffer is half of the world size (see index.html width/height attrs);
// CSS stretches it back up with pixelated rendering, giving that chunky NES look.
// So every draw call below uses "world" coordinates (0-800 / 0-400) and we just
// scale the context once.
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

let timeLeft = 99;
let timerInterval = null;
let isGameOver = false;

const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
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
let flash = 0; // white KO flash overlay opacity

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
        this.accent = skinAccent; // headband/belt accent color
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
        this.isBlocking = false;
        this.attackCooldown = false;
        this.attackBox = { width: 45, height: 25 };

        this.hitFlash = 0; // brief white flash when this fighter takes a hit
        this.walkCycle = 0;
    }

    draw() {
        const cx = this.x + this.width / 2; // local origin: center of shoulders
        const topY = this.y; // top of torso

        ctx.save();
        ctx.translate(cx, topY);
        if (!this.isFacingRight) ctx.scale(-1, 1);

        // ground shadow (drawn in world space, so undo the flip offset for x)
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

        // back leg
        ctx.fillStyle = shade('#1c1c22', 0);
        ctx.fillRect(-11, 46, 9, 22);
        ctx.fillStyle = '#0d0d10';
        ctx.fillRect(-12, 66, 11, 4);

        // back arm (behind torso)
        ctx.fillStyle = darkBody;
        ctx.fillRect(-17, 10, 8, 20);
        ctx.fillStyle = skinDark;
        ctx.fillRect(-18, 28, 9, 9);

        // legs (front)
        ctx.fillStyle = '#26262e';
        ctx.fillRect(2, 46, 10, 22);
        ctx.fillStyle = '#0d0d10';
        ctx.fillRect(1, 66, 11, 4);

        // torso / gi
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-14, 0, 28, 38);
        // side shading
        ctx.fillStyle = darkBody;
        ctx.fillRect(6, 0, 8, 38);
        // V-neck collar
        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 14);
        ctx.closePath();
        ctx.fill();

        // belt
        ctx.fillStyle = this.accent;
        ctx.fillRect(-14, 34, 28, 8);
        ctx.fillStyle = shade(this.accent, -40);
        ctx.fillRect(-4, 34, 8, 8);

        // shorts trim under belt
        ctx.fillStyle = '#111';
        ctx.fillRect(-13, 40, 26, 8);

        // head
        ctx.fillStyle = skin;
        ctx.fillRect(-10, -20, 20, 20);
        ctx.fillStyle = skinDark;
        ctx.fillRect(2, -20, 8, 20);

        // headband
        ctx.fillStyle = this.accent;
        ctx.fillRect(-11, -21, 22, 6);
        // headband tail flowing to the back
        ctx.fillRect(-20, -18, 9, 4);
        ctx.fillRect(-24, -15, 7, 3);

        // hair spikes
        ctx.fillStyle = '#1a1310';
        ctx.fillRect(-9, -24, 5, 5);
        ctx.fillRect(-1, -25, 5, 6);
        ctx.fillRect(6, -23, 5, 5);

        // eye
        ctx.fillStyle = '#101010';
        ctx.fillRect(4, -12, 3, 3);

        // front arm
        ctx.fillStyle = bodyColor;
        ctx.fillRect(9, 10, 9, 18);
        ctx.fillStyle = '#d92b2b';
        ctx.fillRect(9, 26, 10, 10);

        // punch
        if (this.isAttacking) {
            ctx.fillStyle = skin;
            ctx.fillRect(this.width / 2 - 2, 14, this.attackBox.width - 18, 10);
            ctx.fillStyle = '#e63946';
            ctx.fillRect(this.width / 2 - 2 + this.attackBox.width - 26, 11, 14, 16);
        }

        // hit flash overlay
        if (this.hitFlash > 0) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(255,255,255,${Math.min(this.hitFlash / 6, 0.85)})`;
            ctx.fillRect(-20, -26, 40, 96);
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

        if (keys[this.controls.attack] && !this.attackCooldown && !this.isBlocking) {
            this.attack();
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

    attack() {
        this.isAttacking = true;
        this.attackCooldown = true;

        setTimeout(() => { this.isAttacking = false; }, 150);
        setTimeout(() => { this.attackCooldown = false; }, 400);
    }

    getAttackBox() {
        return {
            x: this.isFacingRight ? this.x + this.width : this.x - this.attackBox.width,
            y: this.y + 15,
            width: this.attackBox.width,
            height: this.attackBox.height
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
    controls: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', attack: 'KeyJ', block: 'KeyK' },
    name: 'DUKE'
});

let p2 = new Fighter({
    x: 560, y: 200, color: '#ff3333', skinAccent: '#33ffee', isFacingRight: false,
    controls: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', attack: 'KeyU', block: 'KeyI' },
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
            let damage = defender.isBlocking ? 2 : 12;

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
                addSparks(hitX, hitY, '#ffcc00', 12);
                triggerShake(6, 10);
            }

            const pushDir = attacker.isFacingRight ? 1 : -1;
            defender.x += pushDir * 15;

            if (defender.hp <= 0) {
                flash = 1;
                endGame(attacker === p1 ? 'ИГРОК 1<br>ПОБЕДИЛ (K.O.)!' : 'ИГРОК 2<br>ПОБЕДИЛ (K.O.)!');
            }
        }
    }
}

// ---------- background: NES dojo arena ----------
function drawArena() {
    // dusk sky
    const sky = ctx.createLinearGradient(0, 0, 0, floorY - 100);
    sky.addColorStop(0, '#2b1039');
    sky.addColorStop(0.6, '#4a1c3d');
    sky.addColorStop(1, '#7a2e2e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, floorY - 100);

    // moon
    ctx.fillStyle = '#fff3cc';
    ctx.beginPath();
    ctx.arc(680, 55, 22, 0, Math.PI * 2);
    ctx.fill();

    // distant mountains
    ctx.fillStyle = '#1c0e2e';
    ctx.beginPath();
    ctx.moveTo(0, floorY - 100);
    ctx.lineTo(90, floorY - 160);
    ctx.lineTo(180, floorY - 105);
    ctx.lineTo(300, floorY - 170);
    ctx.lineTo(430, floorY - 110);
    ctx.lineTo(560, floorY - 165);
    ctx.lineTo(680, floorY - 108);
    ctx.lineTo(800, floorY - 150);
    ctx.lineTo(800, floorY - 100);
    ctx.closePath();
    ctx.fill();

    // pagoda roof silhouette (back wall of the dojo)
    const roofY = floorY - 100;
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

    // paper lanterns hanging from the roof edge
    const lanternXs = [140, 260, 540, 660];
    lanternXs.forEach((lx) => {
        ctx.strokeStyle = '#5a2a2a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, roofY);
        ctx.lineTo(lx, roofY + 14);
        ctx.stroke();
        ctx.fillStyle = '#ff5533';
        ctx.beginPath();
        ctx.ellipse(lx, roofY + 22, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcc55';
        ctx.fillRect(lx - 1, roofY + 15, 2, 14);
    });

    // wall panels
    ctx.fillStyle = '#3d1f2e';
    for (let x = arenaLeft; x < arenaRight; x += 60) {
        ctx.fillRect(x + 4, roofY, 52, 100);
        ctx.strokeStyle = '#5a3348';
        ctx.strokeRect(x + 4, roofY, 52, 100);
    }

    // support pillars
    ctx.fillStyle = '#5a1f1f';
    ctx.fillRect(arenaLeft, roofY - 4, 18, 104);
    ctx.fillRect(arenaRight - 18, roofY - 4, 18, 104);

    // floor (tatami)
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

    // floor edge highlight
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arenaLeft, floorY);
    ctx.lineTo(arenaRight, floorY);
    ctx.stroke();

    // corner posts (player color markers)
    ctx.fillStyle = '#3366ff';
    ctx.fillRect(arenaLeft, floorY, 6, 80);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(arenaRight - 6, floorY, 6, 80);
}

function gameLoop() {
    ctx.clearRect(0, 0, worldW, worldH);

    ctx.save();
    if (shake.time > 0) {
        const dx = (Math.random() - 0.5) * shake.magnitude;
        const dy = (Math.random() - 0.5) * shake.magnitude;
        ctx.translate(dx, dy);
        shake.time--;
    }

    drawArena();
    p1.update(p2);
    p2.update(p1);
    checkHit(p1, p2, p2HpEl);
    checkHit(p2, p1, p1HpEl);
    updateAndDrawSparks();

    ctx.restore();

    if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        ctx.fillRect(0, 0, worldW, worldH);
        flash -= 0.08;
        if (flash < 0) flash = 0;
    }

    requestAnimationFrame(gameLoop);
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            timerEl.textContent = timeLeft;
        } else {
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
    clearInterval(timerInterval);
    startTimer();
}

startTimer();
gameLoop();
