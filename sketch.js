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
  baseSize: 20,
  driftSpeed: 0.1,
  noiseScale: 0.0008,
  drag: 0.99,
};

const FISH_SETTINGS = {
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

  // Subtle body motion (relative to tail)
  bodyBobAmount: 1.0, // pixels in local Y
  bodyRotateAmount: 0.05, // radians
  bodyScaleAmount: 0, // uniform scale delta
  bodyMotionSpeed: 0.5, // multiplier on tailSpeed for body

  // Extra tail speed when chasing (very subtle)
  tailChaseSpeedMultiplier: 1.05,
};

// Per-variant fish configuration: fixed size (scale) and count.
// One entry per body/tail pair (indices are 0-based into fishBodyImgs/fishTailImgs).
// Adjust counts/scales here to control how many of each fish and how big.
const FISH_VARIANT_PRESETS = [
  { bodyIndex: 0, tailIndex: 0, count: 3, scale: 1.0 },
  { bodyIndex: 1, tailIndex: 1, count: 2, scale: 1.0 },
  { bodyIndex: 2, tailIndex: 2, count: 1, scale: 1.0 },
  { bodyIndex: 3, tailIndex: 3, count: 1, scale: 1.0 },
];

// Resolved presets that actually have images loaded.
let FISH_VARIANTS = [];

// =========================
// p5 lifecycle
// =========================

function preload() {
  // Add more body/tail image paths here to increase variation.
  const bodyPaths = ["images/1.png", "images/3.png", "images/5.png", "images/7.png"];
  const tailPaths = ["images/2.png", "images/4.png", "images/6.png", "images/8.png"];

  const pairCount = Math.min(bodyPaths.length, tailPaths.length);
  for (let i = 0; i < pairCount; i++) {
    fishBodyImgs.push(loadImage(bodyPaths[i]));
    fishTailImgs.push(loadImage(tailPaths[i]));
  }

  // Build actual variants list from presets, clamping to available images.
  FISH_VARIANTS = FISH_VARIANT_PRESETS.filter((v) => {
    return (
      fishBodyImgs[v.bodyIndex] !== undefined &&
      fishTailImgs[v.tailIndex] !== undefined
    );
  });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Helvetica");
  textSize(LETTER_SETTINGS.baseSize);
  textAlign(CENTER, CENTER);
  noStroke();
  imageMode(CENTER);

  // Spawn a fixed number of fish per variant, with fixed size.
  for (let vi = 0; vi < FISH_VARIANTS.length; vi++) {
    const variant = FISH_VARIANTS[vi];
    for (let n = 0; n < variant.count; n++) {
      fish.push(Fish.spawnOffscreen(variant));
    }
  }
}

function draw() {
  background(2, 0, 0); // soft off-white to match page

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
  constructor(x, y, dir, speed, color, variant) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.baseSpeed = speed;
    this.speed = speed;
    this.color = color;
    this.variant = variant;
    this.scale = variant ? variant.scale : 1.0;

    this.bobPhase = random(TWO_PI);
    this.turnTarget = dir;
    this.timeOffset = random(1000);
    this.hasTarget = false;

    // Image references: use the variant's body/tail indices.
    if (this.variant) {
      this.bodyImg = fishBodyImgs[this.variant.bodyIndex] || null;
      this.tailImg = fishTailImgs[this.variant.tailIndex] || null;
    } else {
      this.bodyImg = fishBodyImgs[0] || null;
      this.tailImg = fishTailImgs[0] || null;
    }

    // Tail placement relative to body image size
    const bodyW = this.bodyImg ? this.bodyImg.width : 100;
    this.tailOffsetX = bodyW * FISH_RENDER.tailOffsetFactorX;
    this.tailOffsetY = FISH_RENDER.tailOffsetY;

    // Tail animation parameters
    this.tailAmplitude = FISH_RENDER.tailAmplitude;
    this.tailSpeed =
      FISH_RENDER.tailSpeedBase * random(0.8, 1.3);
    this.tailPhaseOffset = random(TWO_PI);
    this.currentTailSpeed = this.tailSpeed;
  }

  static spawnOffscreen(variant) {
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
    return new Fish(x, y, dir, speed, color, variant);
  }

  update() {
    const t = millis() * 0.001 + this.timeOffset;

    // Target nearby letters first
    const target = this.findNearestLetter();
    const hasTarget = !!target;
    this.hasTarget = hasTarget;
    if (hasTarget) {
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

    // Gently speed up when pursuing a letter, and ease back otherwise.
    const targetSpeedMultiplier = hasTarget ? 1.2 : 1.0;
    const speedLerp = hasTarget ? 0.03 : 0.03;
    this.speed =
      this.speed +
      (this.baseSpeed * targetSpeedMultiplier - this.speed) *
        speedLerp;

    // Linearly increase tail frequency when chasing.
    const targetTailMult = hasTarget
      ? FISH_RENDER.tailChaseSpeedMultiplier
      : 1.0;
    // Smaller lerp so tail frequency changes more gradually.
    const tailLerp = hasTarget ? 0.03 : 0.03;
    this.currentTailSpeed =
      this.currentTailSpeed +
      (this.tailSpeed * targetTailMult - this.currentTailSpeed) *
        tailLerp;

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
      const replacement = Fish.spawnOffscreen(this.variant);
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

    const baseBodyScale = this.scale * FISH_RENDER.bodyScale;

    // Use the same phase as the tail, but damped for subtle secondary motion.
    const phase =
      frameCount *
        this.currentTailSpeed *
        FISH_RENDER.bodyMotionSpeed +
      this.tailPhaseOffset;
    const s = sin(phase);

    const bodyBob =
      s * FISH_RENDER.bodyBobAmount * this.scale;
    const bodyRot =
      s * FISH_RENDER.bodyRotateAmount;
    const bodyScalePulse =
      1 + s * FISH_RENDER.bodyScaleAmount;

    push();
    translate(this.x, this.y);
    rotate(this.dir);
    // Small local bob and gentle rotation/scale to keep the body feeling alive.
    translate(0, bodyBob);
    rotate(bodyRot);
    scale(baseBodyScale * bodyScalePulse);

    // Draw body image centered at origin
    image(this.bodyImg, 0, 0);

    // Tail animation
    const tailAngle = s * this.tailAmplitude;

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


