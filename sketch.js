/* global createCanvas, windowWidth, windowHeight, background, textFont, textSize, textAlign, CENTER, fill, noStroke, text, key, keyCode, BACKSPACE, random, randomGaussian, noise, millis, TWO_PI, sin, cos, width, height, image, imageMode, CENTER, frameCount, mouseX, mouseY */

// =========================
// Global state
// =========================

const letters = [];
const fish = [];
const ripples = [];

// Collections of possible body/tail image variants.
// Each fish will pick one pair when it is created.
const fishBodyImgs = [];
const fishTailImgs = [];

const LETTER_SETTINGS = {
  baseSize: 34,
  driftSpeed: 0.1,
  noiseScale: 0.0008,
  drag: 0.99,
};

const FISH_SETTINGS = {
  count: 6,
  minSpeed: 0.6,
  maxSpeed: 1.4,
  wanderStrength: 0.02,
  bobAmplitude: 6,
  bobSpeed: 1.1,
  turnLerp: 0.05,
  eatRadius: 26,
  seekRadius: 260,
};

const FISH_COLORS = [
  [190, 220, 255],
  [210, 200, 255],
  [200, 230, 220],
  [255, 215, 210],
  [230, 230, 230],
];

// Image-based fish rendering configuration
const FISH_RENDER = {
  bodyScale: 0.05,
  // Tail anchor is behind the body center (to the left in local fish space)
  tailOffsetFactorX: -0.45, // relative to body image width
  tailOffsetY: 0,
  // Tail animation
  tailAmplitude: 0.35, // radians
  tailSpeedBase: 0.16,
};

// =========================
// p5 lifecycle
// =========================

function preload() {
  // Add more body/tail image paths here to increase variation.
  const bodyPaths = ["images/1.png", "images/3.png"];
  const tailPaths = ["images/2.png", "images/4.png"];

  const pairCount = Math.min(bodyPaths.length, tailPaths.length);
  for (let i = 0; i < pairCount; i++) {
    fishBodyImgs.push(loadImage(bodyPaths[i]));
    fishTailImgs.push(loadImage(tailPaths[i]));
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Helvetica");
  textSize(LETTER_SETTINGS.baseSize);
  textAlign(CENTER, CENTER);
  noStroke();
  imageMode(CENTER);

  for (let i = 0; i < FISH_SETTINGS.count; i++) {
    fish.push(Fish.spawnOffscreen());
  }
}

function draw() {
  background(0);

  // Update ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].update();
    if (!ripples[i].alive) ripples.splice(i, 1);
  }

  // Update and draw letters
  for (let i = letters.length - 1; i >= 0; i--) {
    const l = letters[i];
    l.update(ripples);
    l.wrap();
    l.draw();
  }

  // Update and draw fish
  for (let i = 0; i < fish.length; i++) {
    fish[i].update();
    fish[i].eatLetters(letters);
    fish[i].draw();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function mousePressed() {
  ripples.push(new Ripple(mouseX, mouseY));
}

function keyPressed() {
  if (keyCode === BACKSPACE) {
    letters.pop();
    return false;
  }
}

function keyTyped() {
  if (key.length !== 1) return;
  const code = key.charCodeAt(0);
  if (code < 32) return;

  const x = width * 0.5 + randomGaussian(0, 12);
  const y = height * 0.5 + randomGaussian(0, 12);
  letters.push(new Letter(key, x, y));
}

// =========================
// Letter class
// =========================

class Letter {
  constructor(ch, x, y) {
    this.ch = ch;
    this.x = x;
    this.y = y;

    const angle = random(TWO_PI);
    const speed = LETTER_SETTINGS.driftSpeed * random(0.4, 1.6);
    this.vx = cos(angle) * speed;
    this.vy = sin(angle) * speed;

    this.seed = random(1000);
    this.size = LETTER_SETTINGS.baseSize * random(0.9, 1.1);
  }

  update(ripplesRef) {
    const t = millis() * 0.00025;
    const s = LETTER_SETTINGS.noiseScale;

    const nx = noise(this.seed, this.x * s, t);
    const ny = noise(this.seed + 57.3, this.y * s, t);

    const ax = (nx - 0.5) * LETTER_SETTINGS.driftSpeed * 0.4;
    const ay = (ny - 0.5) * LETTER_SETTINGS.driftSpeed * 0.4;

    this.vx += ax;
    this.vy += ay;

    // Ripple influence: letters near the expanding wavefront
    // are pushed outward and then keep drifting naturally.
    if (ripplesRef && ripplesRef.length) {
      for (let i = 0; i < ripplesRef.length; i++) {
        const r = ripplesRef[i];
        const dx = this.x - r.x;
        const dy = this.y - r.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-3) continue;

        const band = r.band;
        const diff = d - r.radius;
        const ad = Math.abs(diff);
        if (ad > band) continue;

        const tNorm = 1 - ad / band;
        const peak = tNorm * tNorm * (3 - 2 * tNorm);

        const nx = dx / d;
        const ny = dy / d;

        const strength = r.strength * peak;
        this.vx += nx * strength;
        this.vy += ny * strength;
      }
    }

    this.vx *= LETTER_SETTINGS.drag;
    this.vy *= LETTER_SETTINGS.drag;

    this.x += this.vx;
    this.y += this.vy;
  }

  wrap() {
    const m = 40;
    if (this.x < -m) this.x = width + m;
    else if (this.x > width + m) this.x = -m;
    if (this.y < -m) this.y = height + m;
    else if (this.y > height + m) this.y = -m;
  }

  draw() {
    if (this.ch === " ") return;
    fill(255);
    textSize(this.size);
    text(this.ch, this.x, this.y);
  }
}

// =========================
// Ripple class
// =========================

class Ripple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.strength = 0.22;
    this.band = 30; // thickness of the wavefront ring
    this.growth = 6; // pixels per frame
    this.decay = 0.985;
    this.alive = true;
  }

  update() {
    this.radius += this.growth;
    this.strength *= this.decay;
    if (this.strength < 0.02) this.alive = false;
  }
}

// =========================
// Fish class
// =========================

class Fish {
  constructor(x, y, dir, speed, color, scale) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = speed;
    this.color = color;
    this.scale = scale;

    this.bobPhase = random(TWO_PI);
    this.turnTarget = dir;
    this.timeOffset = random(1000);

    // Image references: choose a random body/tail pair from the loaded variants.
    const imgIndex =
      fishBodyImgs.length > 0
        ? Math.floor(random(fishBodyImgs.length))
        : -1;
    this.bodyImg =
      imgIndex >= 0 ? fishBodyImgs[imgIndex] : null;
    this.tailImg =
      imgIndex >= 0 ? fishTailImgs[imgIndex] : null;

    // Tail placement relative to body image size
    const bodyW = this.bodyImg ? this.bodyImg.width : 100;
    this.tailOffsetX = bodyW * FISH_RENDER.tailOffsetFactorX;
    this.tailOffsetY = FISH_RENDER.tailOffsetY;

    // Tail animation parameters
    this.tailAmplitude = FISH_RENDER.tailAmplitude;
    this.tailSpeed =
      FISH_RENDER.tailSpeedBase * random(0.8, 1.3);
    this.tailPhaseOffset = random(TWO_PI);
  }

  static spawnOffscreen() {
    const side = Math.floor(random(4));
    let x;
    let y;
    let dir;

    const margin = 80;
    if (side === 0) {
      x = -margin;
      y = random(height);
      dir = random(-0.3, 0.3);
    } else if (side === 1) {
      x = width + margin;
      y = random(height);
      dir = Math.PI + random(-0.3, 0.3);
    } else if (side === 2) {
      x = random(width);
      y = -margin;
      dir = random(0.8, 2.3);
    } else {
      x = random(width);
      y = height + margin;
      dir = -random(0.8, 2.3);
    }

    const speed =
      random(FISH_SETTINGS.minSpeed, FISH_SETTINGS.maxSpeed) *
      random(0.85, 1.15);
    const color =
      FISH_COLORS[Math.floor(random(FISH_COLORS.length))];
    const scale = random(0.8, 1.4);
    return new Fish(x, y, dir, speed, color, scale);
  }

  update() {
    const t = millis() * 0.001 + this.timeOffset;

    // Target nearby letters first
    const target = this.findNearestLetter();
    if (target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const desired = Math.atan2(dy, dx);
      const diff = this.angleDiff(desired, this.dir);
      this.turnTarget = this.dir + diff * 0.9;
    } else {
      // Gentle wandering when no letters are close
      const wander =
        (noise(this.timeOffset, t * 0.4) - 0.5) *
        FISH_SETTINGS.wanderStrength;
      this.turnTarget += wander;
    }

    this.dir =
      this.dir +
      this.angleDiff(this.turnTarget, this.dir) *
        FISH_SETTINGS.turnLerp;

    this.bobPhase +=
      FISH_SETTINGS.bobSpeed * 0.02 * (0.6 + 0.4 * this.scale);
    const bob =
      sin(this.bobPhase) *
      FISH_SETTINGS.bobAmplitude *
      this.scale;

    const vx = cos(this.dir) * this.speed;
    const vy = sin(this.dir) * this.speed;

    this.x += vx;
    this.y += vy + bob * 0.02;

    const m = 120;
    if (
      this.x < -m ||
      this.x > width + m ||
      this.y < -m ||
      this.y > height + m
    ) {
      const replacement = Fish.spawnOffscreen();
      this.x = replacement.x;
      this.y = replacement.y;
      this.dir = replacement.dir;
      this.speed = replacement.speed;
      this.color = replacement.color;
      this.scale = replacement.scale;
      this.bobPhase = replacement.bobPhase;
      this.turnTarget = replacement.turnTarget;
      this.timeOffset = replacement.timeOffset;
      this.bodyImg = replacement.bodyImg;
      this.tailImg = replacement.tailImg;
      this.tailOffsetX = replacement.tailOffsetX;
      this.tailOffsetY = replacement.tailOffsetY;
      this.tailAmplitude = replacement.tailAmplitude;
      this.tailSpeed = replacement.tailSpeed;
      this.tailPhaseOffset = replacement.tailPhaseOffset;
    }
  }

  angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= TWO_PI;
    while (d < -Math.PI) d += TWO_PI;
    return d;
  }

  findNearestLetter() {
    let best = null;
    let bestD2 = FISH_SETTINGS.seekRadius ** 2;
    for (let i = 0; i < letters.length; i++) {
      const l = letters[i];
      const dx = l.x - this.x;
      const dy = l.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = l;
      }
    }
    return best;
  }

  eatLetters(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      const dx = l.x - this.x;
      const dy = l.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < FISH_SETTINGS.eatRadius ** 2) {
        list.splice(i, 1);
      }
    }
  }

  draw() {
    if (!this.bodyImg || !this.tailImg) return;

    const bodyScale = this.scale * FISH_RENDER.bodyScale;

    push();
    translate(this.x, this.y);
    rotate(this.dir);
    scale(bodyScale);

    // Draw body image centered at origin
    image(this.bodyImg, 0, 0);

    // Tail animation
    const tailAngle =
      sin(
        frameCount * this.tailSpeed +
          this.tailPhaseOffset
      ) * this.tailAmplitude;

    // Tail is positioned at the back of the body and pivots from its base
    push();
    translate(this.tailOffsetX, this.tailOffsetY);
    rotate(tailAngle);
    // Shift tail so its base (attachment edge) meets the body
    const tailShiftX =
      this.tailImg.width * 0.5;
    image(this.tailImg, -tailShiftX, 0);
    pop();

    pop();
  }
}


