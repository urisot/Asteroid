'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};
const repeated = {};
const typedKeys = []; // teclas escritas mientras se captura la firma (state 'entername')

window.addEventListener('keydown', e => {
  if (e.repeat) repeated[e.code] = true;
  if (state === 'entername') typedKeys.push(e.key);
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// Como pressed(), pero también dispara con la repetición de tecla mantenida (menús).
function pressedRep(code) {
  const val = pressed(code) || repeated[code];
  repeated[code] = false;
  return !!val;
}

// Controles táctiles (botones on-screen): alimentan el mismo estado keys/justPressed.
document.querySelectorAll('.tbtn').forEach(btn => {
  const code = btn.dataset.key;
  const press = e => {
    e.preventDefault();
    justPressed[code] = !keys[code];
    keys[code] = true;
  };
  const release = e => {
    e.preventDefault();
    keys[code] = false;
  };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
});

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Tema (claro/oscuro) ──────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = 'asteroids-theme';
const THEMES = {
  dark: {
    bg: '#000',
    fg: '#fff',
    dim: 'rgba(255,255,255,0.65)',
    particleRgb: '255,255,255',
    cyan: '#0ff',
    magenta: '#f0f',
    green: '#0f0',
    red: '#f55',
    orange: 'rgba(255,130,0,0.85)',
    shieldRing: 'rgba(0,255,0,0.8)',
    novaRing: 'rgba(255,0,255,0.5)',
  },
  light: {
    bg: '#eef0f2',
    fg: '#111',
    dim: 'rgba(0,0,0,0.6)',
    particleRgb: '0,0,0',
    cyan: '#0088aa',
    magenta: '#aa0099',
    green: '#0a8a2a',
    red: '#cc2222',
    orange: 'rgba(200,90,0,0.85)',
    shieldRing: 'rgba(10,138,42,0.8)',
    novaRing: 'rgba(170,0,153,0.5)',
  },
};

let theme = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
const C = () => THEMES[theme];

const themeToggle = document.getElementById('theme-toggle');

function applyTheme() {
  document.body.classList.toggle('light-mode', theme === 'light');
  if (themeToggle) themeToggle.checked = theme === 'light';
}

function setTheme(next) {
  theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme();
}

if (themeToggle) {
  themeToggle.addEventListener('change', () => setTheme(themeToggle.checked ? 'light' : 'dark'));
}
applyTheme();

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = C().fg;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Constantes de dificultad: `let` porque el menú de configuración las sobrescribe (ver CONFIG_DEFS).
let TRIPLE_SHOT_DURATION = 10;  // segundos que dura el power-up de disparo en abanico
let TRIPLE_SHOT_DROP_CHANCE = 0.15; // probabilidad de drop por asteroide destruido (hasta que aparezca en el nivel)
let NOVA_BOMB_DROP_CHANCE = 0.15;   // ítem escaso: baja probabilidad, aparece a lo sumo 1 vez por partida
let NOVA_BLAST_SPEED  = 480;        // px/s, proyectil de la bomba nova
let NOVA_BLAST_RADIUS = 9;          // radio visual/colisión del proyectil (bala ancha)
let NOVA_BLAST_TTL    = 2.2;        // se autodestruye si no impacta nada
const NOVA_EXPLOSION_RADIUS = Math.sqrt(0.20 * W * H / Math.PI); // área = 20% del área jugable ≈ 174.9px
let SHIELD_DURATION   = 10;    // segundos que dura el escudo (o hasta absorber un golpe)
let SHIELD_DROP_CHANCE = 0.15; // probabilidad de drop por asteroide destruido, solo desde nivel 3
let SHIELD_MIN_LEVEL  = 3;    // el escudo no puede aparecer antes de este nivel

let UFO_MIN_LEVEL       = 3;   // el platillo volador empieza a aparecer desde este nivel
let UFO_SHOOT_MIN_LEVEL = 3;   // desde este nivel el platillo también dispara
let UFO_SPAWN_CHANCE    = 0.08; // probabilidad de spawn por asteroide destruido, solo si no hay otro activo
let UFO_POINTS          = 200; // puntos base; se otorgan x3 (600) solo al destruirlo por completo
let UFO_SPEED           = 70;  // px/s, movimiento similar a un asteroide
const UFO_RADIUS          = 20;
let UFO_FIRE_INTERVAL   = 1.8; // segundos entre disparos del platillo (nivel >= UFO_SHOOT_MIN_LEVEL)
let UFO_BULLET_SPEED    = 60; // mitad de la velocidad de bala del jugador (520 / 2)

// ── Configuración y puntuaciones persistentes (localStorage) ──────────────────
const CONFIG_STORAGE_KEY = 'asteroids-config';
const SCORES_STORAGE_KEY = 'asteroids-scores';
const MAX_SCORES = 10;

// def se captura aquí, cuando cada variable aún tiene su valor por defecto.
const CONFIG_DEFS = [
  { key: 'TRIPLE_SHOT_DURATION',    label: 'Triple shot: duración (s)',   def: TRIPLE_SHOT_DURATION,    min: 1,   max: 60,   step: 1,    get: () => TRIPLE_SHOT_DURATION,    set: v => { TRIPLE_SHOT_DURATION = v; } },
  { key: 'TRIPLE_SHOT_DROP_CHANCE', label: 'Triple shot: prob. de drop',  def: TRIPLE_SHOT_DROP_CHANCE, min: 0,   max: 1,    step: 0.01, get: () => TRIPLE_SHOT_DROP_CHANCE, set: v => { TRIPLE_SHOT_DROP_CHANCE = v; } },
  { key: 'NOVA_BOMB_DROP_CHANCE',   label: 'Bomba nova: prob. de drop',   def: NOVA_BOMB_DROP_CHANCE,   min: 0,   max: 1,    step: 0.01, get: () => NOVA_BOMB_DROP_CHANCE,   set: v => { NOVA_BOMB_DROP_CHANCE = v; } },
  { key: 'NOVA_BLAST_SPEED',        label: 'Bomba nova: velocidad',       def: NOVA_BLAST_SPEED,        min: 100, max: 1200, step: 20,   get: () => NOVA_BLAST_SPEED,        set: v => { NOVA_BLAST_SPEED = v; } },
  { key: 'NOVA_BLAST_RADIUS',       label: 'Bomba nova: radio proyectil', def: NOVA_BLAST_RADIUS,       min: 2,   max: 30,   step: 1,    get: () => NOVA_BLAST_RADIUS,       set: v => { NOVA_BLAST_RADIUS = v; } },
  { key: 'NOVA_BLAST_TTL',          label: 'Bomba nova: vida (s)',        def: NOVA_BLAST_TTL,          min: 0.5, max: 6,    step: 0.1,  get: () => NOVA_BLAST_TTL,          set: v => { NOVA_BLAST_TTL = v; } },
  { key: 'SHIELD_DURATION',         label: 'Escudo: duración (s)',        def: SHIELD_DURATION,         min: 1,   max: 60,   step: 1,    get: () => SHIELD_DURATION,         set: v => { SHIELD_DURATION = v; } },
  { key: 'SHIELD_DROP_CHANCE',      label: 'Escudo: prob. de drop',       def: SHIELD_DROP_CHANCE,      min: 0,   max: 1,    step: 0.01, get: () => SHIELD_DROP_CHANCE,      set: v => { SHIELD_DROP_CHANCE = v; } },
  { key: 'SHIELD_MIN_LEVEL',        label: 'Escudo: nivel mínimo',        def: SHIELD_MIN_LEVEL,        min: 1,   max: 20,   step: 1,    get: () => SHIELD_MIN_LEVEL,        set: v => { SHIELD_MIN_LEVEL = v; } },
  { key: 'UFO_MIN_LEVEL',           label: 'Platillo: nivel mínimo',      def: UFO_MIN_LEVEL,           min: 1,   max: 20,   step: 1,    get: () => UFO_MIN_LEVEL,           set: v => { UFO_MIN_LEVEL = v; } },
  { key: 'UFO_SHOOT_MIN_LEVEL',     label: 'Platillo: nivel disparo',     def: UFO_SHOOT_MIN_LEVEL,     min: 1,   max: 20,   step: 1,    get: () => UFO_SHOOT_MIN_LEVEL,     set: v => { UFO_SHOOT_MIN_LEVEL = v; } },
  { key: 'UFO_SPAWN_CHANCE',        label: 'Platillo: prob. de spawn',    def: UFO_SPAWN_CHANCE,        min: 0,   max: 1,    step: 0.01, get: () => UFO_SPAWN_CHANCE,        set: v => { UFO_SPAWN_CHANCE = v; } },
  { key: 'UFO_POINTS',              label: 'Platillo: puntos base',       def: UFO_POINTS,              min: 0,   max: 2000, step: 50,   get: () => UFO_POINTS,              set: v => { UFO_POINTS = v; } },
  { key: 'UFO_SPEED',               label: 'Platillo: velocidad',         def: UFO_SPEED,               min: 10,  max: 300,  step: 5,    get: () => UFO_SPEED,               set: v => { UFO_SPEED = v; } },
  { key: 'UFO_FIRE_INTERVAL',       label: 'Platillo: intervalo disparo', def: UFO_FIRE_INTERVAL,       min: 0.3, max: 6,    step: 0.1,  get: () => UFO_FIRE_INTERVAL,       set: v => { UFO_FIRE_INTERVAL = v; } },
  { key: 'UFO_BULLET_SPEED',        label: 'Platillo: vel. de bala',      def: UFO_BULLET_SPEED,        min: 20,  max: 520,  step: 10,   get: () => UFO_BULLET_SPEED,        set: v => { UFO_BULLET_SPEED = v; } },
];

function stepDecimals(step) {
  return step < 1 ? (String(step).split('.')[1] || '').length : 0;
}

// Ajusta al paso y limita al rango; devuelve def si v no es un número válido.
function normalizeConfigValue(d, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d.def;
  const clamped = Math.min(d.max, Math.max(d.min, v));
  return Number((Math.round(clamped / d.step) * d.step).toFixed(stepDecimals(d.step)));
}

function saveConfig() {
  const obj = {};
  for (const d of CONFIG_DEFS) obj[d.key] = d.get();
  try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(obj)); } catch (e) { /* almacenamiento no disponible */ }
}

function loadConfig() {
  let obj = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY));
    if (parsed && typeof parsed === 'object') obj = parsed;
  } catch (e) { /* JSON corrupto o sin acceso: se usan los valores por defecto */ }
  for (const d of CONFIG_DEFS) d.set(normalizeConfigValue(d, obj[d.key]));
}

const NAME_LENGTH = 3;
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Firma: solo A-Z y 0-9, mayúsculas, máximo NAME_LENGTH caracteres.
function sanitizeName(name) {
  return String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NAME_LENGTH);
}

function loadScores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCORES_STORAGE_KEY));
    if (Array.isArray(parsed)) {
      return parsed
        .filter(s => s && Number.isFinite(s.score))
        .map(s => ({ score: s.score, date: s.date, name: sanitizeName(s.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SCORES);
    }
  } catch (e) { /* se ignora */ }
  return [];
}

function qualifiesForTop(value) {
  if (value <= 0) return false;
  const scores = loadScores();
  return scores.length < MAX_SCORES || value > scores[scores.length - 1].score;
}

// Guarda el puntaje si entra al top 10. Devuelve la posición (1-10) o 0 si no calificó.
function saveScore(value, name) {
  if (!qualifiesForTop(value)) return 0;
  const scores = loadScores();
  const entry = { score: value, date: new Date().toISOString(), name: sanitizeName(name) };
  // Empates: el puntaje más antiguo conserva la mejor posición.
  let idx = scores.findIndex(s => s.score < value);
  if (idx === -1) idx = scores.length;
  scores.splice(idx, 0, entry);
  scores.length = Math.min(scores.length, MAX_SCORES);
  try { localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scores)); } catch (e) { /* se ignora */ }
  return idx + 1;
}

loadConfig();

// ── Proyectil de la bomba nova ─────────────────────────────────────────────────
class NovaBlast {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * NOVA_BLAST_SPEED;
    this.vy = Math.sin(angle) * NOVA_BLAST_SPEED;
    this.ttl = NOVA_BLAST_TTL;
    this.radius = NOVA_BLAST_RADIUS;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = C().magenta;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C().novaRing;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = C().fg;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.tripleShot    = 0;
    this.novaBombs     = 0;
    this.shield        = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot    > 0) this.tripleShot    -= dt;
    if (this.shield        > 0) this.shield        -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleShot > 0) {
      const SPREAD = Math.PI / 12; // 15°
      return [
        new Bullet(ox, oy, this.angle - SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + SPREAD),
      ];
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = this.tripleShot > 0 ? C().cyan : C().fg;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = C().orange;
      ctx.stroke();
    }

    // Anillo de energía del escudo
    if (this.shield > 0) {
      ctx.strokeStyle = C().shieldRing;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(${C().particleRgb},${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Power-up (triple shot en abanico) ─────────────────────────────────────────
class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 10;
    this.ttl = 8;
    this.rot = 0;
    this.dead = false;
  }

  update(dt) {
    this.rot += dt * 2;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = C().cyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-0.35) * this.radius * 0.7, Math.sin(-0.35) * this.radius * 0.7);
    ctx.moveTo(0, 0);
    ctx.lineTo(this.radius * 0.7, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(0.35) * this.radius * 0.7, Math.sin(0.35) * this.radius * 0.7);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Bomba Nova (destruye todos los asteroides en pantalla, un solo uso) ───────
class NovaBombPickup {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 11;
    this.ttl = 8;
    this.rot = 0;
    this.dead = false;
  }

  update(dt) {
    this.rot += dt * 1.4;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = C().magenta;
    ctx.lineWidth = 1.5;
    const spikes = 8;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? this.radius : this.radius * 0.45;
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Escudo temporal (absorbe 1 golpe de asteroide) ─────────────────────────────
class ShieldPickup {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 10;
    this.ttl = 8;
    this.rot = 0;
    this.dead = false;
  }

  update(dt) {
    this.rot += dt * 1.8;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = C().green;
    ctx.lineWidth = 1.5;
    // Hexágono exterior
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * this.radius;
      const py = Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // Círculo interior
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Disparo del platillo volador ────────────────────────────────────────────────
class UfoBullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * UFO_BULLET_SPEED;
    this.vy = Math.sin(angle) * UFO_BULLET_SPEED;
    this.ttl = 3;
    this.radius = 3;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = C().red;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Platillo volador (enemigo, nivel 5+) ────────────────────────────────────────
class UFO {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = UFO_RADIUS;
    const angle = rand(0, Math.PI * 2);
    const speed = UFO_SPEED + rand(-10, 10);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.hits = 0; // 3 impactos lo destruyen
    this.fireCooldown = rand(1, UFO_FIRE_INTERVAL);
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
  }

  // 1er y 2do impacto: no se destruye, reaparece en una esquina al azar.
  teleportToCorner() {
    const margin = 50;
    const corners = [
      { x: margin,     y: margin },
      { x: W - margin, y: margin },
      { x: margin,     y: H - margin },
      { x: W - margin, y: H - margin },
    ];
    const c = corners[randInt(0, 3)];
    this.x = c.x;
    this.y = c.y;
    const angle = rand(0, Math.PI * 2);
    const speed = UFO_SPEED + rand(-10, 10);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.fireCooldown = rand(1, UFO_FIRE_INTERVAL);
  }

  tryShoot(targetX, targetY) {
    if (this.dead || this.fireCooldown > 0) return null;
    this.fireCooldown = UFO_FIRE_INTERVAL;
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    return new UfoBullet(this.x, this.y, angle);
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    const r = this.radius;
    ctx.strokeStyle = C().green;
    ctx.lineWidth = 1.5;

    // Cuerpo (elipse achatada)
    ctx.beginPath();
    ctx.ellipse(0, 3, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Cúpula
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.1, r * 0.5, r * 0.35, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Antenas
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.35);
    ctx.lineTo(-r * 0.45, -r * 0.9);
    ctx.moveTo(r * 0.3, -r * 0.35);
    ctx.lineTo(r * 0.45, -r * 0.9);
    ctx.stroke();

    // Inicial "D"
    ctx.fillStyle = C().green;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', 0, 3);

    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerUps, novaPickups, novaBlasts, shieldPickups, ufos, ufoBullets;
let score, lives, level;
let state = 'menu';      // 'menu' | 'scores' | 'settings' | 'playing' | 'dead' | 'gameover'
let deadTimer;
let menuIndex = 0;       // opción resaltada en el menú / pantalla de configuración
let lastRank = 0;        // posición registrada en el top 10 (se resalta en la tabla; 0 = ninguna)
let canRegister = false; // la partida terminada califica al top 10 y falta registrar la firma
let nameChars = [];      // firma en captura
let nameSlot = 0;        // posición de la firma que se edita
const MENU_ITEMS = ['1. INICIAR JUEGO', '2. MEJORES PUNTUACIONES', '3. CONFIGURACIONES'];
let powerUpSpawnedThisLevel;  // triple shot: garantizado al menos 1 vez por nivel
let novaBombSpawned;          // bomba nova: ítem escaso, a lo sumo 1 vez por partida
let shieldSpawnedThisLevel;   // escudo: garantizado al menos 1 vez por nivel, desde nivel 3
let lastKillX = W / 2, lastKillY = H / 2; // posición del último asteroide destruido (para el spawn forzado)

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets     = [];
  asteroids   = [];
  particles   = [];
  powerUps    = [];
  novaPickups = [];
  novaBlasts  = [];
  shieldPickups = [];
  ufos        = [];
  ufoBullets  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  powerUpSpawnedThisLevel = false;
  novaBombSpawned = false;
  shieldSpawnedThisLevel = false;
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets    = [];
  particles  = [];
  novaBlasts = [];
  ufos       = [];
  ufoBullets = [];
  powerUpSpawnedThisLevel = false;
  shieldSpawnedThisLevel = false;
  const savedNovaBombs = ship.novaBombs;
  ship.reset();
  ship.novaBombs = savedNovaBombs; // inventario no se pierde al pasar de nivel
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function resolveNovaExplosion(x, y) {
  explode(x, y, 30);
  for (const a of asteroids) {
    if (dist({ x, y }, a) < NOVA_EXPLOSION_RADIUS) {
      score += POINTS[a.size];
      explode(a.x, a.y, a.size * 5);
      a.dead = true;
    }
  }
  asteroids = asteroids.filter(a => !a.dead);
  for (const u of ufos) {
    if (!u.dead && dist({ x, y }, u) < NOVA_EXPLOSION_RADIUS) {
      u.dead = true;
      score += UFO_POINTS * 3;
      explode(u.x, u.y, 30);
    }
  }
  ufos = ufos.filter(u => !u.dead);
}

// 1er y 2do impacto: sin puntos, teletransporta a una esquina. 3er impacto: lo destruye y suma UFO_POINTS*3.
function applyUfoHit(u) {
  u.hits++;
  if (u.hits >= 3) {
    u.dead = true;
    score += UFO_POINTS * 3;
    explode(u.x, u.y, 30);
  } else {
    explode(u.x, u.y, 8);
    u.teleportToCorner();
  }
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  ship.tripleShot = 0;
  ship.novaBombs = 0;
  ship.shield = 0;
  powerUps.forEach(p => p.dead = true);
  novaPickups.forEach(p => p.dead = true);
  novaBlasts.forEach(p => p.dead = true);
  shieldPickups.forEach(p => p.dead = true);
  ufoBullets.forEach(p => p.dead = true);
  lives--;
  if (lives <= 0) {
    canRegister = qualifiesForTop(score);
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Menús ─────────────────────────────────────────────────────────────────────
// Las teclas pulsadas durante la partida quedan marcadas en justPressed; se limpian al entrar al menú.
function clearPressed() {
  for (const k in justPressed) justPressed[k] = false;
  for (const k in repeated) repeated[k] = false;
}

function goMenu() {
  clearPressed();
  state = 'menu';
  menuIndex = 0;
}

function startGame() {
  lastRank = 0;
  canRegister = false;
  initGame();
}

function startNameEntry() {
  clearPressed();
  typedKeys.length = 0;
  nameChars = Array(NAME_LENGTH).fill('A');
  nameSlot = 0;
  state = 'entername';
}

// Captura de firma estilo arcade: ↑/↓ cambia la letra, ←/→ cambia de casilla, o se escribe directo.
function updateNameEntry() {
  const cycle = (pressedRep('ArrowUp') ? 1 : 0) - (pressedRep('ArrowDown') ? 1 : 0);
  if (cycle) {
    const i = NAME_CHARS.indexOf(nameChars[nameSlot]);
    nameChars[nameSlot] = NAME_CHARS[(i + cycle + NAME_CHARS.length) % NAME_CHARS.length];
  }
  if (pressedRep('ArrowLeft'))  nameSlot = Math.max(0, nameSlot - 1);
  if (pressedRep('ArrowRight')) nameSlot = Math.min(NAME_LENGTH - 1, nameSlot + 1);

  for (const key of typedKeys.splice(0)) {
    if (key === 'Backspace') {
      nameSlot = Math.max(0, nameSlot - 1);
    } else if (/^[a-zA-Z0-9]$/.test(key)) {
      nameChars[nameSlot] = key.toUpperCase();
      nameSlot = Math.min(NAME_LENGTH - 1, nameSlot + 1);
    }
  }

  if (pressed('Enter') || pressed('Space')) {
    lastRank = saveScore(score, nameChars.join(''));
    canRegister = false;
    clearPressed();
    state = 'scores';
  }
}

function updateMenu() {
  if (pressedRep('ArrowUp'))   menuIndex = (menuIndex + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
  if (pressedRep('ArrowDown')) menuIndex = (menuIndex + 1) % MENU_ITEMS.length;
  ['Digit1', 'Digit2', 'Digit3'].forEach((code, i) => {
    if (pressed(code)) { menuIndex = i; selectMenu(); }
  });
  if (pressed('Enter') || pressed('Space')) selectMenu();
}

function selectMenu() {
  if (menuIndex === 0) startGame();
  else if (menuIndex === 1) state = 'scores';
  else { state = 'settings'; menuIndex = 0; }
}

function updateScores() {
  if (pressed('Escape') || pressed('Enter') || pressed('Space')) {
    lastRank = 0;
    goMenu();
  }
}

// Filas de configuración: una por constante + "restablecer" + "volver".
function updateSettings() {
  const rows = CONFIG_DEFS.length + 2;
  if (pressedRep('ArrowUp'))   menuIndex = (menuIndex + rows - 1) % rows;
  if (pressedRep('ArrowDown')) menuIndex = (menuIndex + 1) % rows;
  if (pressed('Escape')) { goMenu(); return; }

  const d = CONFIG_DEFS[menuIndex];
  if (d) {
    const dir = (pressedRep('ArrowRight') ? 1 : 0) - (pressedRep('ArrowLeft') ? 1 : 0);
    if (dir) {
      d.set(normalizeConfigValue(d, d.get() + dir * d.step));
      saveConfig();
    }
  } else if (pressed('Enter') || pressed('Space')) {
    if (menuIndex === CONFIG_DEFS.length) {
      CONFIG_DEFS.forEach(c => c.set(c.def));
      saveConfig();
    } else {
      goMenu();
    }
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'menu')     { updateMenu();     return; }
  if (state === 'scores')   { updateScores();   return; }
  if (state === 'settings') { updateSettings(); return; }
  if (state === 'entername') {
    if (pressed('Escape')) goMenu(); // omite el registro
    else updateNameEntry();
    return;
  }

  if (pressed('Escape')) { goMenu(); return; } // abandona la partida (no guarda puntaje)

  if (state === 'gameover') {
    if (pressed('Space')) {
      if (canRegister) startNameEntry();
      else goMenu();
    }
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    ufos.forEach(u => u.update(dt));
    ufoBullets.forEach(b => b.update(dt));
    ufoBullets = ufoBullets.filter(b => !b.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Bomba nova: lanza un proyectil, no limpia la pantalla al instante
  if (pressed('KeyB') && ship.novaBombs > 0 && !ship.dead) {
    ship.novaBombs--;
    const NOSE = 21;
    const ox = ship.x + Math.cos(ship.angle) * NOSE;
    const oy = ship.y + Math.sin(ship.angle) * NOSE;
    novaBlasts.push(new NovaBlast(ox, oy, ship.angle));
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  powerUps.forEach(p => p.update(dt));
  novaPickups.forEach(p => p.update(dt));
  novaBlasts.forEach(p => p.update(dt));
  shieldPickups.forEach(p => p.update(dt));
  ufos.forEach(u => u.update(dt));
  ufoBullets.forEach(b => b.update(dt));

  bullets       = bullets.filter(b => !b.dead);
  particles     = particles.filter(p => !p.dead);
  powerUps      = powerUps.filter(p => !p.dead);
  novaPickups   = novaPickups.filter(p => !p.dead);
  novaBlasts    = novaBlasts.filter(p => !p.dead);
  shieldPickups = shieldPickups.filter(p => !p.dead);
  ufoBullets    = ufoBullets.filter(b => !b.dead);

  // Disparo del platillo volador (nivel >= UFO_SHOOT_MIN_LEVEL), apuntando a la nave
  if (level >= UFO_SHOOT_MIN_LEVEL) {
    for (const u of ufos) {
      const shot = u.tryShoot(ship.x, ship.y);
      if (shot) ufoBullets.push(shot);
    }
  }

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        lastKillX = a.x;
        lastKillY = a.y;
        if (!powerUpSpawnedThisLevel && Math.random() < TRIPLE_SHOT_DROP_CHANCE) {
          powerUps.push(new PowerUp(a.x, a.y));
          powerUpSpawnedThisLevel = true;
        }
        if (!novaBombSpawned && Math.random() < NOVA_BOMB_DROP_CHANCE) {
          novaPickups.push(new NovaBombPickup(a.x, a.y));
          novaBombSpawned = true;
        }
        if (level >= SHIELD_MIN_LEVEL && !shieldSpawnedThisLevel && Math.random() < SHIELD_DROP_CHANCE) {
          shieldPickups.push(new ShieldPickup(a.x, a.y));
          shieldSpawnedThisLevel = true;
        }
        if (level >= UFO_MIN_LEVEL && ufos.length === 0 && Math.random() < UFO_SPAWN_CHANCE) {
          ufos.push(new UFO(a.x, a.y));
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Bala del jugador vs platillo volador
  for (const b of bullets) {
    if (b.dead) continue;
    for (const u of ufos) {
      if (!u.dead && dist(b, u) < u.radius) {
        b.dead = true;
        applyUfoHit(u);
        break;
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
  ufos    = ufos.filter(u => !u.dead);

  // Bomba nova vs asteroide: al impactar, explota y destruye todo en su radio
  for (const nb of novaBlasts) {
    if (nb.dead) continue;
    for (const a of asteroids) {
      if (!a.dead && dist(nb, a) < a.radius + nb.radius) {
        nb.dead = true;
        resolveNovaExplosion(nb.x, nb.y);
        break;
      }
    }
  }
  novaBlasts = novaBlasts.filter(p => !p.dead);

  // Garantía: triple shot aparece al menos 1 vez por nivel — spawn forzado
  // si el nivel se está por completar y todavía no salió.
  if (asteroids.length === 0 && !powerUpSpawnedThisLevel) {
    powerUps.push(new PowerUp(lastKillX, lastKillY));
    powerUpSpawnedThisLevel = true;
  }
  // Garantía equivalente para el escudo, desde el nivel 3.
  if (level >= SHIELD_MIN_LEVEL && asteroids.length === 0 && !shieldSpawnedThisLevel) {
    shieldPickups.push(new ShieldPickup(lastKillX, lastKillY));
    shieldSpawnedThisLevel = true;
  }

  // Nave vs asteroide
  if (!ship.dead && ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.shield > 0) {
          // Absorbido por el escudo: el asteroide se destruye, sin puntos (no fue un disparo).
          ship.shield = 0;
          a.dead = true;
          explode(a.x, a.y, a.size * 5);
          asteroids = asteroids.filter(x => !x.dead).concat(a.split());
        } else {
          killShip();
        }
        break;
      }
    }
  }

  // Nave vs platillo volador: mismo trato que un asteroide (respeta invencibilidad y escudo),
  // y además el platillo recibe daño (cuenta como impacto para su secuencia de 3 golpes).
  if (!ship.dead && ship.invincible <= 0) {
    for (const u of ufos) {
      if (!u.dead && dist(ship, u) < ship.radius + u.radius * 0.8) {
        applyUfoHit(u);
        if (ship.shield > 0) {
          ship.shield = 0;
        } else {
          killShip();
        }
        break;
      }
    }
  }
  ufos = ufos.filter(u => !u.dead);

  // Nave vs disparo del platillo volador
  if (!ship.dead && ship.invincible <= 0) {
    for (const b of ufoBullets) {
      if (!b.dead && dist(ship, b) < ship.radius + b.radius) {
        b.dead = true;
        if (ship.shield > 0) {
          ship.shield = 0;
        } else {
          killShip();
        }
        break;
      }
    }
  }
  ufoBullets = ufoBullets.filter(b => !b.dead);

  // Nave vs power-up
  for (const p of powerUps) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      ship.tripleShot = TRIPLE_SHOT_DURATION;
    }
  }
  powerUps = powerUps.filter(p => !p.dead);

  // Nave vs bomba nova
  for (const p of novaPickups) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      ship.novaBombs++;
    }
  }
  novaPickups = novaPickups.filter(p => !p.dead);

  // Nave vs escudo
  for (const p of shieldPickups) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      ship.shield = SHIELD_DURATION;
    }
  }
  shieldPickups = shieldPickups.filter(p => !p.dead);

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = C().fg;
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = C().fg;
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  ctx.textAlign = 'center';
  let buffY = 48;
  if (ship.tripleShot > 0) {
    ctx.fillStyle = C().cyan;
    ctx.fillText(`TRIPLE SHOT ${ship.tripleShot.toFixed(1)}s`, W / 2, buffY);
    buffY += 20;
  }
  if (ship.novaBombs > 0) {
    ctx.fillStyle = C().magenta;
    ctx.fillText(`BOMBA NOVA x${ship.novaBombs}  [B]`, W / 2, buffY);
    buffY += 20;
  }
  if (ship.shield > 0) {
    ctx.fillStyle = C().green;
    ctx.fillText(`ESCUDO ${ship.shield.toFixed(1)}s`, W / 2, buffY);
    buffY += 20;
  }
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = C().fg;
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = C().dim;
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function drawMenuScreens() {
  ctx.textAlign = 'center';
  ctx.fillStyle = C().fg;

  if (state === 'menu') {
    ctx.font = 'bold 56px monospace';
    ctx.fillText('ASTEROIDS', W / 2, 150);
    ctx.font = '22px monospace';
    MENU_ITEMS.forEach((item, i) => {
      ctx.fillStyle = i === menuIndex ? C().cyan : C().fg;
      ctx.fillText(i === menuIndex ? `> ${item} <` : item, W / 2, 260 + i * 50);
    });
    ctx.font = '14px monospace';
    ctx.fillStyle = C().dim;
    ctx.fillText('↑ ↓ / 1 2 3 PARA ELEGIR   —   ENTER O ESPACIO PARA ACEPTAR', W / 2, H - 40);
  } else if (state === 'scores') {
    const scores = loadScores();
    ctx.font = 'bold 34px monospace';
    ctx.fillText('MEJORES PUNTUACIONES', W / 2, 70);
    ctx.font = '20px monospace';
    if (scores.length === 0) {
      ctx.fillStyle = C().dim;
      ctx.fillText('Aún no hay puntuaciones', W / 2, H / 2);
    }
    if (scores.length > 0) {
      ctx.font = '14px monospace';
      ctx.fillStyle = C().dim;
      ctx.textAlign = 'left';
      ctx.fillText('POS', 130, 110);
      ctx.textAlign = 'right';
      ctx.fillText('PUNTOS', 340, 110);
      ctx.textAlign = 'left';
      ctx.fillText('FECHA', 400, 110);
      ctx.fillText('FIRMA', 600, 110);
      ctx.font = '20px monospace';
    }
    scores.forEach((s, i) => {
      const y = 145 + i * 37;
      ctx.fillStyle = i + 1 === lastRank ? C().cyan : C().fg;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 130, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(s.score), 340, y);
      ctx.textAlign = 'left';
      const date = new Date(s.date);
      ctx.fillText(isNaN(date) ? '--' : date.toLocaleDateString(), 400, y);
      ctx.fillText(s.name || '---', 600, y);
    });
    ctx.textAlign = 'center';
    ctx.font = '14px monospace';
    ctx.fillStyle = C().dim;
    ctx.fillText('ESC / ENTER / ESPACIO PARA VOLVER', W / 2, H - 30);
  } else if (state === 'settings') {
    ctx.font = 'bold 30px monospace';
    ctx.fillText('CONFIGURACIONES', W / 2, 44);
    ctx.font = '15px monospace';
    const rowH = 25;
    const top = 82;
    CONFIG_DEFS.forEach((d, i) => {
      const y = top + i * rowH;
      const sel = i === menuIndex;
      const changed = d.get() !== d.def;
      ctx.fillStyle = sel ? C().cyan : C().fg;
      ctx.textAlign = 'left';
      ctx.fillText(`${sel ? '> ' : '  '}${d.label}`, 110, y);
      ctx.textAlign = 'right';
      const v = d.get().toFixed(stepDecimals(d.step));
      ctx.fillText(sel ? `◀ ${v} ▶` : `${v}${changed ? ' *' : ''}`, 690, y);
    });
    ctx.textAlign = 'left';
    [['RESTABLECER VALORES', CONFIG_DEFS.length], ['VOLVER', CONFIG_DEFS.length + 1]].forEach(([label, idx], j) => {
      const sel = idx === menuIndex;
      ctx.fillStyle = sel ? C().cyan : C().fg;
      ctx.fillText(`${sel ? '> ' : '  '}${label}`, 110, top + (CONFIG_DEFS.length + j) * rowH + 6);
    });
    ctx.textAlign = 'center';
    ctx.font = '13px monospace';
    ctx.fillStyle = C().dim;
    ctx.fillText('↑ ↓ ELEGIR   ◀ ▶ CAMBIAR   ENTER ACEPTAR   ESC VOLVER   (* = modificado)', W / 2, H - 14);
  }
}

function drawNameEntry() {
  ctx.textAlign = 'center';
  ctx.fillStyle = C().fg;
  ctx.font = 'bold 40px monospace';
  ctx.fillText('¡NUEVO TOP 10!', W / 2, 150);
  ctx.font = '22px monospace';
  ctx.fillText(`PUNTAJE: ${score}`, W / 2, 200);
  ctx.fillStyle = C().dim;
  ctx.font = '18px monospace';
  ctx.fillText('ESCRIBE TU FIRMA (3 CARACTERES: A-Z, 0-9)', W / 2, 260);

  ctx.font = 'bold 64px monospace';
  nameChars.forEach((ch, i) => {
    const x = W / 2 + (i - 1) * 70;
    ctx.fillStyle = i === nameSlot ? C().cyan : C().fg;
    ctx.fillText(ch, x, 350);
    ctx.fillRect(x - 24, 366, 48, i === nameSlot ? 4 : 2);
  });

  ctx.font = '14px monospace';
  ctx.fillStyle = C().dim;
  ctx.fillText('↑ ↓ CAMBIAR LETRA   ◀ ▶ CASILLA   ENTER / ESPACIO GUARDAR   ESC OMITIR', W / 2, H - 40);
}

function draw() {
  ctx.fillStyle = C().bg;
  ctx.fillRect(0, 0, W, H);

  if (state === 'menu' || state === 'scores' || state === 'settings') {
    drawMenuScreens();
    return;
  }
  if (state === 'entername') {
    drawNameEntry();
    return;
  }

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  ufos.forEach(u => u.draw());
  powerUps.forEach(p => p.draw());
  novaPickups.forEach(p => p.draw());
  shieldPickups.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ufoBullets.forEach(b => b.draw());
  novaBlasts.forEach(p => p.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover') {
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA ${canRegister ? 'CONTINUAR' : 'IR AL MENÚ'}`);
    if (canRegister) {
      ctx.fillStyle = C().cyan;
      ctx.fillText('¡ENTRAS AL TOP 10! REGISTRA TU FIRMA', W / 2, H / 2 + 56);
    }
  }
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
