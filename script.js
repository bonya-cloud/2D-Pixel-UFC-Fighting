const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const p1HpEl = document.getElementById('p1-hp');
const p2HpEl = document.getElementById('p2-hp');
const timerEl = document.getElementById('timer');
const gameOverScreen = document.getElementById('game-over-screen');
const winnerText = document.getElementById('winner-text');

const gravity = 0.6;
const floorY = 320;
const arenaLeft = 50;
const arenaRight = 750;

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

class Fighter {
    constructor({ x, y, color, isFacingRight, controls }) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 70;
        this.color = color;
        this.vx = 0;
        this.vy = 0;
        this.speed = 4;
        this.jumpForce = -12;
        this.isGrounded = false;
        this.hp = 100;
        this.isFacingRight = isFacingRight;
        this.controls = controls;

        this.isAttacking = false;
        this.isBlocking = false;
        this.attackCooldown = false;
        this.attackBox = { width: 45, height: 25 };
    }

    draw() {
        ctx.save();

        // Тень под бойцом
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, floorY, this.width / 1.5, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Тело бойца
        ctx.fillStyle = this.isBlocking ? '#555555' : this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Голова
        ctx.fillStyle = '#ffcc99';
        ctx.fillRect(this.x + 8, this.y - 20, 24, 20);

        // Глаза
        ctx.fillStyle = '#000';
        const eyeX = this.isFacingRight ? this.x + 22 : this.x + 10;
        ctx.fillRect(eyeX, this.y - 14, 4, 4);

        // Шорты UFC
        ctx.fillStyle = '#111';
        ctx.fillRect(this.x, this.y + 40, this.width, 18);

        // Руки / Перчатки
        ctx.fillStyle = this.color;
        const gloveX = this.isFacingRight ? this.x + 28 : this.x - 8;
        ctx.fillRect(gloveX, this.y + 18, 12, 12);

        // Удар рукой
        if (this.isAttacking) {
            ctx.fillStyle = '#ffcc99';
            const punchX = this.isFacingRight ? this.x + this.width : this.x - this.attackBox.width;
            ctx.fillRect(punchX, this.y + 15, this.attackBox.width, 12);

            ctx.fillStyle = '#ff0000';
            const punchGloveX = this.isFacingRight ? punchX + this.attackBox.width - 10 : punchX;
            ctx.fillRect(punchGloveX, this.y + 13, 12, 16);
        }

        ctx.restore();
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

let p1 = new Fighter({
    x: 200, y: 200, color: '#3366ff', isFacingRight: true,
    controls: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', attack: 'KeyJ', block: 'KeyK' }
});

let p2 = new Fighter({
    x: 560, y: 200, color: '#ff3333', isFacingRight: false,
    controls: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', attack: 'KeyU', block: 'KeyI' }
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

            const pushDir = attacker.isFacingRight ? 1 : -1;
            defender.x += pushDir * 15;

            if (defender.hp <= 0) {
                endGame(attacker === p1 ? 'ИГРОК 1 ПОБЕДИЛ (KO)!' : 'ИГРОК 2 ПОБЕДИЛ (KO)!');
            }
        }
    }
}

function drawArena() {
    ctx.fillStyle = '#222533';
    ctx.fillRect(arenaLeft, floorY, arenaRight - arenaLeft, 80);

    ctx.strokeStyle = '#33384d';
    ctx.lineWidth = 2;
    for (let x = arenaLeft; x <= arenaRight; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, floorY - 120);
        ctx.lineTo(x, floorY);
        ctx.stroke();
    }

    ctx.fillStyle = '#3366ff';
    ctx.fillRect(arenaLeft, floorY, 20, 80);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(arenaRight - 20, floorY, 20, 80);

    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arenaLeft, floorY - 100);
    ctx.lineTo(arenaRight, floorY - 100);
    ctx.stroke();
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawArena();
    p1.update(p2);
    p2.update(p1);
    checkHit(p1, p2, p2HpEl);
    checkHit(p2, p1, p1HpEl);
    requestAnimationFrame(gameLoop);
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            timerEl.textContent = timeLeft;
        } else {
            clearInterval(timerInterval);
            if (p1.hp > p2.hp) endGame('ИГРОК 1 ПОБЕДИЛ ПО ОЧКАМ!');
            else if (p2.hp > p1.hp) endGame('ИГРОК 2 ПОБЕДИЛ ПО ОЧКАМ!');
            else endGame('НИЧЬЯ!');
        }
    }, 1000);
}

function endGame(text) {
    isGameOver = true;
    clearInterval(timerInterval);
    winnerText.textContent = text;
    gameOverScreen.classList.remove('hidden');
}

function resetGame() {
    isGameOver = false;
    timeLeft = 99;
    timerEl.textContent = timeLeft;
    p1.hp = 100; p2.hp = 100;
    p1HpEl.style.width = '100%'; p2HpEl.style.width = '100%';
    p1.x = 200; p1.y = 200;
    p2.x = 560; p2.y = 200;
    gameOverScreen.classList.add('hidden');
    clearInterval(timerInterval);
    startTimer();
}

startTimer();
gameLoop();
