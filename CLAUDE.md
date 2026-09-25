# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

**To run the game:**
```bash
npx serve .
# Then open http://localhost:3000
```

Or open `index.html` directly in a browser (double-click).

## Project Overview

Asteroids arcade game clone. Vanilla HTML5 Canvas + ES6 JavaScript. No frameworks, no build tools, no dependencies.

**Files:**
- `index.html` — Single page with canvas + embedded CSS
- `game.js` — All game logic (423 lines)
- `favicon.svg` — Icon
- `README.md` — Game description and controls (Spanish)

## Architecture

**Single-file architecture** in `game.js`:

```
Input System (keydown/keyup event handlers, justPressed tracking)
    ↓
Game Classes (Bullet, Asteroid, Ship, Particle)
    ↓
Game State (ship, bullets, asteroids, particles, score, lives, level, state)
    ↓
Update Loop (physics, collisions, state transitions)
    ↓
Draw Loop (render all entities + HUD)
    ↓
requestAnimationFrame (60 FPS loop)
```

**Key responsibilities:**

| Class | Role |
|-------|------|
| **Bullet** | Projectile spawned from ship; dies after TTL expires or leaves screen |
| **Asteroid** | Destructible obstacle; splits into 2 smaller asteroids on hit (size 3→2→1); irregular polygon shape |
| **Ship** | Player-controlled; rotation, thrust, shoot; invincible 3s after spawn (blinking); dies on asteroid contact |
| **Particle** | Explosion debris; dies after TTL |

**Game state machine:**
```
'playing' → player controls ship, destroy asteroids
'dead' → 2s wait before respawn, particles/asteroids still animate
'gameover' → all asteroids cleared, space to restart
```

**Collision detection:**
- Bullet vs Asteroid: `dist(bullet, asteroid) < asteroid.radius` → asteroid dies, splits, score += points
- Ship vs Asteroid: `dist(ship, asteroid) < ship.radius + asteroid.radius * 0.82` → ship dies
- Bullets/asteroids wrap at canvas edges (toroidal space)

## Adding Features

**To add a new game entity:**
1. Create class with `update(dt)`, `draw()`, and `.dead` flag
2. Store in global array (`bullets`, `asteroids`, etc.)
3. Update in `update()` loop, filter dead entities
4. Draw in `draw()` loop

**To add input:**
- Use `keys['KeyName']` for held keys
- Use `pressed('KeyName')` for single-press events
- Register key codes in keydown handler (line 15)

**To adjust physics:**
- `Bullet.SPEED` (line 37)
- `Ship.ROT`, `THRUST`, `DRAG` (lines 143–145)
- `Asteroid.SPEEDS`, `RADII` (lines 62, 61)

**To change scoring:**
- Edit `POINTS` array (line 63, indexed by asteroid size 1–3)

**To tune difficulty:**
- `spawnAsteroids()` — number of initial asteroids
- `nextLevel()` (line 273) — asteroids per level formula
- `Ship.invincible` (line 133) — respawn protection duration
- `Asteroid.SPEEDS` — movement speed per size

## Canvas Constants

- Canvas: 800×600 px (`W`, `H`)
- Origin: top-left (standard canvas coordinate system)
- Y-axis: positive down
- Wrapping: `wrap(v, max)` implements toroidal edges

## Common Tasks

**Debug collision:** Add `console.log()` in collision loop (lines 325–335).

**Change colors:** Edit `ctx.strokeStyle` / `ctx.fillStyle` in `draw()` methods.

**Adjust difficulty curve:** Edit asteroid counts in `spawnAsteroids()` and `nextLevel()` formulas.

**Disable invincibility:** Set `Ship.invincible = 0` in `reset()` (line 133).

**Change canvas size:** Edit `W`, `H` (lines 5–6) and HTML `<canvas>` attributes (index.html:23).
