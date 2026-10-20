/* ==========================================================================
   NEON RUSH - GAME ENGINE & SITE LOGIC (index.js)
   ========================================================================== */

// --- Аудиосистема (Web Audio API) ---
class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playTone(freq, type, duration, startVol = 0.1, endVol = 0) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(startVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(endVol, 0.0001), this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  jump() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }

  crystal() {
    this.playTone(880, 'sine', 0.1, 0.15);
    setTimeout(() => this.playTone(1760, 'sine', 0.15, 0.15), 60);
  }

  hit() {
    this.playTone(100, 'sawtooth', 0.3, 0.25);
  }

  gameOver() {
    if (!this.enabled || !this.ctx) return;
    [300, 240, 180, 120].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sawtooth', 0.2, 0.2), idx * 120);
    });
  }
}

// --- Класс игрока ---
class Player {
  constructor(canvasHeight) {
    this.width = 40;
    this.height = 60;
    this.x = 100;
    this.groundY = canvasHeight - 80 - this.height;
    this.y = this.groundY;
    this.velocityY = 0;
    this.gravity = 0.65;
    this.jumpForce = -13.5;
    this.isGrounded = true;
    this.jumpCount = 0;
    this.maxJumps = 2;
    this.isSliding = false;
    this.slideTimer = 0;
    this.normalHeight = 60;
    this.slideHeight = 30;
    this.trail = [];
  }

  reset() {
    this.y = this.groundY;
    this.velocityY = 0;
    this.isGrounded = true;
    this.jumpCount = 0;
    this.isSliding = false;
    this.height = this.normalHeight;
    this.trail = [];
  }

  jump(sounds) {
    if (this.jumpCount < this.maxJumps) {
      if (this.isSliding) this.stopSlide();
      this.velocityY = this.jumpForce;
      this.isGrounded = false;
      this.jumpCount++;
      sounds.jump();
    }
  }

  startSlide() {
    if (this.isGrounded && !this.isSliding) {
      this.isSliding = true;
      this.height = this.slideHeight;
      this.y = this.groundY + (this.normalHeight - this.slideHeight);
      this.slideTimer = 35;
    }
  }

  stopSlide() {
    this.isSliding = false;
    this.height = this.normalHeight;
    this.y = this.groundY;
  }

  update() {
    // Физика прыжка
    this.velocityY += this.gravity;
    this.y += this.velocityY;

    if (this.y >= this.groundY && !this.isSliding) {
      this.y = this.groundY;
      this.velocityY = 0;
      this.isGrounded = true;
      this.jumpCount = 0;
    }

    // Логика таймера скольжения
    if (this.isSliding) {
      this.slideTimer--;
      if (this.slideTimer <= 0) {
        this.stopSlide();
      }
    }

    // Добавление следа (trail)
    this.trail.push({ x: this.x, y: this.y, h: this.height, alpha: 0.6 });
    if (this.trail.length > 8) this.trail.shift();
    this.trail.forEach(t => t.alpha -= 0.06);
  }

  draw(ctx) {
    // Отрисовка светового следа (trail)
    this.trail.forEach(t => {
      if (t.alpha > 0) {
        ctx.fillStyle = `rgba(0, 245, 255, ${t.alpha * 0.4})`;
        ctx.fillRect(t.x - 10, t.y, this.width, t.h);
      }
    });

    // Модель персонажа
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00F5FF';
    ctx.fillStyle = '#00F5FF';
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Визор персонажа
    ctx.fillStyle = '#FF2BD6';
    ctx.shadowColor = '#FF2BD6';
    const visorY = this.isSliding ? this.y + 6 : this.y + 12;
    ctx.fillRect(this.x + 20, visorY, 16, 8);

    ctx.shadowBlur = 0; // Сброс свечения
  }
}

// --- Класс Препятствий ---
class Obstacle {
  constructor(canvasWidth, canvasHeight, type) {
    this.type = type; // 'ground', 'flying', 'pit'
    this.x = canvasWidth + 50;
    this.markedForDeletion = false;

    if (type === 'ground') {
      this.width = 35 + Math.random() * 20;
      this.height = 45 + Math.random() * 25;
      this.y = canvasHeight - 80 - this.height;
      this.color = '#FF2BD6';
    } else if (type === 'flying') {
      this.width = 45;
      this.height = 30;
      this.y = canvasHeight - 80 - 85; // На высоте головы для уклонения
      this.color = '#A100FF';
    }
  }

  update(speed) {
    this.x -= speed;
    if (this.x + this.width < -50) this.markedForDeletion = true;
  }

  draw(ctx) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;

    if (this.type === 'ground') {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + this.height);
      ctx.lineTo(this.x + this.width / 2, this.y);
      ctx.lineTo(this.x + this.width, this.y + this.height);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'flying') {
      ctx.fillRect(this.x, this.y, this.width, this.height);
      // Ядро дрона
      ctx.fillStyle = '#00F5FF';
      ctx.fillRect(this.x + 10, this.y + 8, 25, 14);
    }

    ctx.shadowBlur = 0;
  }
}

// --- Класс Энерго-Кристаллов ---
class Crystal {
  constructor(canvasWidth, canvasHeight) {
    this.x = canvasWidth + 50;
    this.size = 18;
    this.y = canvasHeight - 80 - (40 + Math.random() * 90);
    this.markedForDeletion = false;
    this.angle = 0;
  }

  update(speed) {
    this.x -= speed;
    this.angle += 0.05;
    if (this.x < -30) this.markedForDeletion = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00F5FF';
    ctx.fillStyle = '#00F5FF';

    ctx.beginPath();
    ctx.moveTo(0, -this.size / 2);
    ctx.lineTo(this.size / 2, 0);
    ctx.lineTo(0, this.size / 2);
    ctx.lineTo(-this.size / 2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// --- Класс Частиц (Эффекты) ---
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = Math.random() * 4 + 2;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.alpha = 1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 0.03;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.restore();
  }
}

// --- ГЛАВНЫЙ МЕНЕДЖЕР ИГРЫ ---
class GameEngine {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.sounds = new SoundSystem();
    this.player = new Player(this.canvas.height);

    this.state = 'MENU'; // 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('neon_rush_highscore') || '0', 10);
    this.totalCrystals = parseInt(localStorage.getItem('neon_rush_crystals') || '0', 10);
    this.sessionCrystals = 0;
    this.health = 3;
    this.baseSpeed = 6;
    this.currentSpeed = this.baseSpeed;

    this.obstacles = [];
    this.crystals = [];
    this.particles = [];

    this.obstacleTimer = 0;
    this.crystalTimer = 0;
    this.bgOffset = 0;

    this.lastTime = 0;

    this.initDOM();
    this.initEvents();
    this.updateHUD();
    
    // Первый старт отрисовки
    requestAnimationFrame((t) => this.loop(t));
  }

  initDOM() {
    this.uiOverlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlaySubtitle = document.getElementById('overlay-subtitle');
    this.overlayStats = document.getElementById('overlay-stats');
    this.primaryBtn = document.getElementById('overlay-primary-btn');

    this.hudScore = document.getElementById('hud-score');
    this.hudHighScore = document.getElementById('hud-highscore');
    this.hudCrystals = document.getElementById('hud-crystals');
    this.hudHealth = document.getElementById('hud-health');
    this.hudSpeed = document.getElementById('hud-speed');

    this.recHighScore = document.getElementById('rec-high-score');
    this.recTotalCrystals = document.getElementById('rec-total-crystals');
    this.heroBestVal = document.getElementById('hero-best-val');

    this.btnSound = document.getElementById('btn-sound');
    this.btnPause = document.getElementById('btn-pause');
  }

  initEvents() {
    // Клавиатура
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.sounds.init();
        if (this.state === 'PLAYING') this.player.jump(this.sounds);
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (this.state === 'PLAYING') this.player.startSlide();
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'PLAYING' || this.state === 'PAUSED') this.togglePause();
      }
    });

    // Сенсоры
    document.getElementById('touch-jump').addEventListener('click', () => {
      this.sounds.init();
      if (this.state === 'PLAYING') this.player.jump(this.sounds);
    });
    document.getElementById('touch-slide').addEventListener('click', () => {
      if (this.state === 'PLAYING') this.player.startSlide();
    });

    // UI Кнопки
    this.primaryBtn.addEventListener('click', () => {
      this.sounds.init();
      this.startNewGame();
    });

    document.getElementById('hero-start-btn').addEventListener('click', () => {
      this.sounds.init();
      this.startNewGame();
    });

    this.btnPause.addEventListener('click', () => this.togglePause());

    this.btnSound.addEventListener('click', () => {
      this.sounds.enabled = !this.sounds.enabled;
      this.btnSound.textContent = this.sounds.enabled ? '🔊' : '🔇';
      this.showToast(this.sounds.enabled ? 'Звук включен' : 'Звук выключен');
    });

    document.getElementById('btn-reset-records').addEventListener('click', () => {
      if (confirm('Сбросить все личные рекорды?')) {
        localStorage.removeItem('neon_rush_highscore');
        localStorage.removeItem('neon_rush_crystals');
        this.highScore = 0;
        this.totalCrystals = 0;
        this.updateHUD();
        this.showToast('Статистика сброшена');
      }
    });
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  startNewGame() {
    this.state = 'PLAYING';
    this.score = 0;
    this.sessionCrystals = 0;
    this.health = 3;
    this.currentSpeed = this.baseSpeed;
    this.obstacles = [];
    this.crystals = [];
    this.particles = [];
    this.player.reset();

    this.uiOverlay.classList.add('hidden');
    this.updateHUD();
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.overlayTitle.textContent = 'ПАУЗА';
      this.overlaySubtitle.textContent = 'Игра приостановлена';
      this.overlayStats.classList.add('hidden');
      this.primaryBtn.textContent = 'ПРОДОЛЖИТЬ';
      this.uiOverlay.classList.remove('hidden');
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.uiOverlay.classList.add('hidden');
    }
  }

  gameOver() {
    this.state = 'GAMEOVER';
    this.sounds.gameOver();

    // Обновление рекордов
    if (this.score > this.highScore) {
      this.highScore = Math.floor(this.score);
      localStorage.setItem('neon_rush_highscore', this.highScore);
    }
    this.totalCrystals += this.sessionCrystals;
    localStorage.setItem('neon_rush_crystals', this.totalCrystals);

    // Оформление оверлея
    this.overlayTitle.textContent = 'GAME OVER';
    this.overlaySubtitle.textContent = 'Твой забег окончен!';
    
    document.getElementById('final-score').textContent = Math.floor(this.score);
    document.getElementById('final-crystals').textContent = this.sessionCrystals;
    document.getElementById('final-best').textContent = this.highScore;

    this.overlayStats.classList.remove('hidden');
    this.primaryBtn.textContent = 'ИГРАТЬ СНОВА';
    this.uiOverlay.classList.remove('hidden');

    this.updateHUD();
  }

  spawnEntities() {
    // Спавн препятствий
    this.obstacleTimer++;
    if (this.obstacleTimer > Math.max(50, 110 - this.currentSpeed * 4)) {
      if (Math.random() < 0.75) {
        const type = Math.random() < 0.65 ? 'ground' : 'flying';
        this.obstacles.push(new Obstacle(this.canvas.width, this.canvas.height, type));
      }
      this.obstacleTimer = 0;
    }

    // Спавн кристаллов
    this.crystalTimer++;
    if (this.crystalTimer > 80) {
      if (Math.random() < 0.6) {
        this.crystals.push(new Crystal(this.canvas.width, this.canvas.height));
      }
      this.crystalTimer = 0;
    }
  }

  createExplosion(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color));
    }
  }

  checkCollisions() {
    // Коллизии с препятствиями
    this.obstacles.forEach((obs) => {
      if (
        this.player.x < obs.x + obs.width &&
        this.player.x + this.player.width > obs.x &&
        this.player.y < obs.y + obs.height &&
        this.player.y + this.player.height > obs.y
      ) {
        obs.markedForDeletion = true;
        this.health--;
        this.sounds.hit();
        this.createExplosion(obs.x, obs.y, obs.color, 15);
        this.updateHUD();

        if (this.health <= 0) {
          this.gameOver();
        }
      }
    });

    // Коллизии с кристаллами
    this.crystals.forEach((c) => {
      if (
        this.player.x < c.x + c.size &&
        this.player.x + this.player.width > c.x - c.size &&
        this.player.y < c.y + c.size &&
        this.player.y + this.player.height > c.y - c.size
      ) {
        c.markedForDeletion = true;
        this.sessionCrystals++;
        this.score += 150;
        this.sounds.crystal();
        this.createExplosion(c.x, c.y, '#00F5FF', 8);
        this.updateHUD();
      }
    });
  }

  update() {
    if (this.state !== 'PLAYING') return;

    // Увеличение сложности
    this.currentSpeed = this.baseSpeed + Math.floor(this.score / 1000) * 0.5;
    this.score += 0.2 * (this.currentSpeed / 4);

    this.player.update();
    this.spawnEntities();

    // Обновление объектов
    this.obstacles.forEach(o => o.update(this.currentSpeed));
    this.crystals.forEach(c => c.update(this.currentSpeed));
    this.particles.forEach(p => p.update());

    // Фильтрация удаленных объектов
    this.obstacles = this.obstacles.filter(o => !o.markedForDeletion);
    this.crystals = this.crystals.filter(c => !c.markedForDeletion);
    this.particles = this.particles.filter(p => p.alpha > 0);

    this.checkCollisions();
    this.bgOffset += this.currentSpeed * 0.5;

    this.updateHUD();
  }

  drawBackground() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Градиент неба
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#04040A');
    bgGrad.addColorStop(1, '#120824');
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, w, h);

    // Параллакс Силуэты Города
    this.ctx.fillStyle = '#1A0B36';
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 120 - this.bgOffset * 0.2) % (w + 120)) - 60;
      this.ctx.fillRect(bx, h - 80 - 120 - (i % 3) * 30, 80, 150);
    }

    // Линия Земли / Дороги
    this.ctx.strokeStyle = '#00F5FF';
    this.ctx.lineWidth = 3;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#00F5FF';
    this.ctx.beginPath();
    this.ctx.moveTo(0, h - 80);
    this.ctx.lineTo(w, h - 80);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Сетка под дорогой
    this.ctx.fillStyle = 'rgba(161, 0, 255, 0.15)';
    this.ctx.fillRect(0, h - 80, w, 80);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();

    // Отрисовка игровых элементов
    this.obstacles.forEach(o => o.draw(this.ctx));
    this.crystals.forEach(c => c.draw(this.ctx));
    this.particles.forEach(p => p.draw(this.ctx));
    this.player.draw(this.ctx);
  }

  loop(timestamp) {
    this.update();
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  updateHUD() {
    this.hudScore.textContent = Math.floor(this.score).toString().padStart(5, '0');
    this.hudHighScore.textContent = this.highScore.toString().padStart(5, '0');
    this.hudCrystals.textContent = `💎 ${this.sessionCrystals}`;
    this.hudSpeed.textContent = `${(this.currentSpeed / this.baseSpeed).toFixed(1)}x`;

    // Здоровье
    let hearts = '';
    for (let i = 0; i < 3; i++) {
      hearts += i < this.health ? '❤️ ' : '🖤 ';
    }
    this.hudHealth.innerHTML = hearts;

    // Секция рекордов
    this.recHighScore.textContent = this.highScore;
    this.recTotalCrystals.textContent = this.totalCrystals;
    this.heroBestVal.textContent = this.highScore;
  }
}

// Старт приложения при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameEngine();
});
