document.addEventListener("DOMContentLoaded", () => {
  const appShell = document.getElementById("app-shell");
  const stageContainer = document.getElementById("stage-container");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayDesc = document.getElementById("overlay-desc");
  const startBtn = document.getElementById("start-btn");

  const hpEl = document.getElementById("hp-val");
  const scoreEl = document.getElementById("score-val");
  const waveEl = document.getElementById("wave-val");
  const bestEl = document.getElementById("best-val");

  const joystickZone = document.getElementById("joystick-zone");
  const joystickBase = document.getElementById("joystick-base");
  const joystickKnob = document.getElementById("joystick-knob");
  const btnSlash = document.getElementById("btn-slash");
  const btnTongue = document.getElementById("btn-tongue");

  const soundBtn = document.getElementById("sound-btn");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const infoBtn = document.getElementById("info-btn");
  const infoModal = document.getElementById("info-modal");
  const closeInfoBtn = document.getElementById("close-info-btn");

  let viewW = 960;
  let viewH = 540;
  let dpr = 1;

  // Web Audio Synthesizer (Unlocks on first tap)
  let audioCtx = null;
  let soundEnabled = true;

  function unlockAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playTone(freqStart, freqEnd, duration, type = "triangle", volume = 0.14) {
    if (!soundEnabled) return;
    unlockAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      soundBtn.innerHTML = soundEnabled ? "&#x1F50A;" : "&#x1F507;";
    });
  }

  // Persistent High Score
  const BEST_KEY = "frog_hero_best_score_v1";
  let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = bestScore;

  // World Arena Dimensions
  const WORLD_W = 1500;
  const WORLD_H = 1100;

  let running = false;
  let score = 0;
  let wave = 1;
  let frame = 0;
  let waveEnemiesRemaining = 0;

  const keys = { up: false, down: false, left: false, right: false };

  // Dedicated pointerId tracking for true simultaneous Multi-Touch
  const joyState = {
    pointerId: null,
    dx: 0,
    dy: 0
  };

  const hero = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    vx: 0,
    vy: 0,
    radius: 22,
    hp: 100,
    maxHp: 100,
    facing: 0,
    invuln: 0,
    slashTimer: 0,
    slashCooldown: 0,
    tongueState: "idle", // idle, out, back
    tongueLen: 0,
    tongueMax: 230,
    tongueAngle: 0,
    tongueTarget: null
  };

  let lilyPads = [];
  let koiFish = [];
  let enemies = [];
  let fireflies = [];
  let particles = [];
  let callouts = [];

  function resizeCanvas() {
    const rect = stageContainer.getBoundingClientRect();
    viewW = Math.max(300, Math.floor(rect.width));
    viewH = Math.max(280, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Fullscreen Toggle
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) {
          await appShell.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (e) {
        window.scrollTo(0, 1);
      }
      setTimeout(resizeCanvas, 120);
    });
  }

  // Info Modal
  if (infoBtn && infoModal && closeInfoBtn) {
    infoBtn.addEventListener("click", () => infoModal.classList.remove("hidden"));
    closeInfoBtn.addEventListener("click", () => infoModal.classList.add("hidden"));
    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) infoModal.classList.add("hidden");
    });
  }

  function buildPondScenery() {
    lilyPads = [];
    for (let i = 0; i < 26; i++) {
      lilyPads.push({
        x: 90 + Math.random() * (WORLD_W - 180),
        y: 90 + Math.random() * (WORLD_H - 180),
        r: 34 + Math.random() * 34,
        rot: Math.random() * Math.PI * 2,
        hasLotus: Math.random() < 0.35
      });
    }

    koiFish = [];
    for (let i = 0; i < 7; i++) {
      koiFish.push({
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
        angle: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 0.6,
        color: i % 2 === 0 ? "rgba(255, 138, 92, 0.35)" : "rgba(246, 244, 234, 0.28)"
      });
    }
  }

  function addCallout(text, x, y, color = "#FFD147") {
    callouts.push({ text, x, y, color, life: 45 });
  }

  function addBurst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 4.2;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 3 + Math.random() * 4,
        color,
        life: 24
      });
    }
  }

  function updateHud() {
    hpEl.textContent = Math.max(0, Math.ceil(hero.hp));
    scoreEl.textContent = Math.floor(score);
    waveEl.textContent = wave;
    if (score > bestScore) {
      bestScore = Math.floor(score);
      localStorage.setItem(BEST_KEY, String(bestScore));
    }
    bestEl.textContent = bestScore;
  }

  function spawnFirefly() {
    fireflies.push({
      x: 100 + Math.random() * (WORLD_W - 200),
      y: 100 + Math.random() * (WORLD_H - 200),
      bob: Math.random() * Math.PI * 2,
      radius: 14
    });
  }

  function spawnEnemy(type = null) {
    const edge = Math.floor(Math.random() * 4);
    let x = 60;
    let y = 60;
    if (edge === 0) { x = Math.random() * WORLD_W; y = 40; }
    else if (edge === 1) { x = WORLD_W - 40; y = Math.random() * WORLD_H; }
    else if (edge === 2) { x = Math.random() * WORLD_W; y = WORLD_H - 40; }
    else { x = 40; y = Math.random() * WORLD_H; }

    const chosen = type || (Math.random() < 0.65 ? "slime" : "beetle");
    if (chosen === "slime") {
      enemies.push({
        type: "slime",
        x,
        y,
        vx: 0,
        vy: 0,
        radius: 20,
        hp: 2,
        speed: 1.7 + Math.min(1.4, wave * 0.14),
        points: 100
      });
    } else {
      enemies.push({
        type: "beetle",
        x,
        y,
        vx: 0,
        vy: 0,
        radius: 24,
        hp: 3,
        speed: 2.1 + Math.min(1.6, wave * 0.16),
        points: 180
      });
    }
  }

  function startWave(waveNum) {
    wave = waveNum;
    waveEnemiesRemaining = 4 + wave * 2;
    for (let i = 0; i < Math.min(5, waveEnemiesRemaining); i++) {
      spawnEnemy();
      waveEnemiesRemaining -= 1;
    }
    while (fireflies.length < 5) spawnFirefly();
    addCallout(`WAVE ${wave}!`, hero.x, hero.y - 45, "#8BE070");
    updateHud();
  }

  function resetGame() {
    score = 0;
    wave = 1;
    frame = 0;
    hero.x = WORLD_W / 2;
    hero.y = WORLD_H / 2;
    hero.vx = 0;
    hero.vy = 0;
    hero.hp = 100;
    hero.facing = 0;
    hero.invuln = 0;
    hero.slashTimer = 0;
    hero.slashCooldown = 0;
    hero.tongueState = "idle";
    hero.tongueLen = 0;
    hero.tongueTarget = null;

    enemies = [];
    fireflies = [];
    particles = [];
    callouts = [];

    buildPondScenery();
    startWave(1);
    updateHud();
  }

  // Hero Sword Slash Action
  function triggerSlash() {
    if (!running || hero.slashCooldown > 0) return;
    unlockAudio();
    hero.slashTimer = 14;
    hero.slashCooldown = 20;
    playTone(540, 180, 0.12, "sawtooth", 0.12);

    const slashRange = 92;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = e.x - hero.x;
      const dy = e.y - hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= slashRange + e.radius) {
        const angleToEnemy = Math.atan2(dy, dx);
        let diff = Math.abs(angleToEnemy - hero.facing);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;

        // Wide 145-degree front arc or very close contact
        if (diff <= 1.28 || dist < 44) {
          e.hp -= 2;
          const pushAngle = Math.atan2(dy, dx);
          e.vx += Math.cos(pushAngle) * 9;
          e.vy += Math.sin(pushAngle) * 9;
          addBurst(e.x, e.y, "#FFD147", 8);

          if (e.hp <= 0) {
            score += e.points;
            addCallout(`+${e.points}`, e.x, e.y - 16, "#FFD147");
            addBurst(e.x, e.y, e.type === "slime" ? "#B86BFF" : "#FF6B57", 14);
            enemies.splice(i, 1);
            playTone(320, 680, 0.14, "triangle", 0.14);
            updateHud();
          } else {
            playTone(220, 120, 0.09, "square", 0.1);
          }
        }
      }
    }
  }

  // Hero Sticky Tongue Grapple Action
  function triggerTongue() {
    if (!running || hero.tongueState !== "idle") return;
    unlockAudio();
    hero.tongueState = "out";
    hero.tongueLen = 16;
    hero.tongueAngle = hero.facing;
    hero.tongueTarget = null;
    playTone(380, 740, 0.11, "sine", 0.14);
  }

  // True Multi-Touch Virtual Joystick (Tracks dedicated pointerId)
  function updateJoystickFromPointer(clientX, clientY) {
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.42;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    joyState.dx = dx / maxRadius;
    joyState.dy = dy / maxRadius;
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function resetJoystick() {
    joyState.pointerId = null;
    joyState.dx = 0;
    joyState.dy = 0;
    joystickKnob.style.transform = "translate(0px, 0px)";
  }

  joystickZone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    if (joyState.pointerId === null) {
      joyState.pointerId = e.pointerId;
      joystickZone.setPointerCapture(e.pointerId);
      updateJoystickFromPointer(e.clientX, e.clientY);
    }
  });

  joystickZone.addEventListener("pointermove", (e) => {
    if (e.pointerId === joyState.pointerId) {
      e.preventDefault();
      updateJoystickFromPointer(e.clientX, e.clientY);
    }
  });

  const endJoyPointer = (e) => {
    if (e.pointerId === joyState.pointerId) {
      resetJoystick();
    }
  };
  joystickZone.addEventListener("pointerup", endJoyPointer);
  joystickZone.addEventListener("pointercancel", endJoyPointer);

  // Action Buttons (Simultaneous Multi-Touch Compatible)
  btnSlash.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerSlash();
  });

  btnTongue.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerTongue();
  });

  // Canvas Tap/Click on Desktop
  canvas.addEventListener("pointerdown", (e) => {
    if (!running) return;
    if (e.pointerType === "mouse") {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      hero.facing = Math.atan2(my - viewH / 2, mx - viewW / 2);
      if (e.button === 2) triggerTongue();
      else triggerSlash();
    }
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard Controls
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w" || e.key === "ArrowUp") keys.up = true;
    if (k === "s" || e.key === "ArrowDown") keys.down = true;
    if (k === "a" || e.key === "ArrowLeft") keys.left = true;
    if (k === "d" || e.key === "ArrowRight") keys.right = true;
    if (e.code === "Space") {
      e.preventDefault();
      triggerSlash();
    }
    if (k === "e" || e.key === "Shift") {
      e.preventDefault();
      triggerTongue();
    }
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w" || e.key === "ArrowUp") keys.up = false;
    if (k === "s" || e.key === "ArrowDown") keys.down = false;
    if (k === "a" || e.key === "ArrowLeft") keys.left = false;
    if (k === "d" || e.key === "ArrowRight") keys.right = false;
  });

  function endGame() {
    running = false;
    playTone(220, 75, 0.35, "sawtooth", 0.16);
    overlayTitle.textContent = "POND OVERRUN!";
    overlayDesc.textContent = `Final Score: ${Math.floor(score)} | Wave Reached: ${wave} | Best: ${bestScore}. Ready to leap back into battle?`;
    startBtn.textContent = "PLAY AGAIN ▶";
    overlay.classList.remove("hidden");
  }

  function update() {
    frame += 1;
    if (hero.invuln > 0) hero.invuln -= 1;
    if (hero.slashTimer > 0) hero.slashTimer -= 1;
    if (hero.slashCooldown > 0) hero.slashCooldown -= 1;

    // Combine Keyboard + Virtual Joystick Input
    let moveX = joyState.dx;
    let moveY = joyState.dy;
    if (keys.left) moveX -= 1;
    if (keys.right) moveX += 1;
    if (keys.up) moveY -= 1;
    if (keys.down) moveY += 1;

    const mag = Math.hypot(moveX, moveY);
    if (mag > 0.08) {
      const normX = moveX / Math.max(1, mag);
      const normY = moveY / Math.max(1, mag);
      hero.vx += normX * 1.15;
      hero.vy += normY * 1.15;
      if (hero.tongueState === "idle") {
        hero.facing = Math.atan2(normY, normX);
      }
    }

    hero.vx *= 0.80;
    hero.vy *= 0.80;
    hero.x = Math.max(40, Math.min(WORLD_W - 40, hero.x + hero.vx));
    hero.y = Math.max(40, Math.min(WORLD_H - 40, hero.y + hero.vy));

    // Update Sticky Tongue Grapple
    if (hero.tongueState === "out") {
      hero.tongueLen += 18;
      const tipX = hero.x + Math.cos(hero.tongueAngle) * hero.tongueLen;
      const tipY = hero.y + Math.sin(hero.tongueAngle) * hero.tongueLen;

      // Check Firefly Grab
      for (let i = fireflies.length - 1; i >= 0; i--) {
        const f = fireflies[i];
        if (Math.hypot(tipX - f.x, tipY - f.y) < f.radius + 16) {
          hero.tongueTarget = { kind: "firefly", ref: f };
          hero.tongueState = "back";
          break;
        }
      }

      // Check Enemy Grapple
      if (hero.tongueState === "out") {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (Math.hypot(tipX - e.x, tipY - e.y) < e.radius + 14) {
            hero.tongueTarget = { kind: "enemy", ref: e };
            hero.tongueState = "back";
            playTone(460, 260, 0.1, "triangle", 0.14);
            break;
          }
        }
      }

      if (hero.tongueLen >= hero.tongueMax) {
        hero.tongueState = "back";
      }
    } else if (hero.tongueState === "back") {
      hero.tongueLen -= 20;
      const tipX = hero.x + Math.cos(hero.tongueAngle) * Math.max(0, hero.tongueLen);
      const tipY = hero.y + Math.sin(hero.tongueAngle) * Math.max(0, hero.tongueLen);

      if (hero.tongueTarget) {
        hero.tongueTarget.ref.x = tipX;
        hero.tongueTarget.ref.y = tipY;
      }

      if (hero.tongueLen <= 14) {
        if (hero.tongueTarget) {
          if (hero.tongueTarget.kind === "firefly") {
            const idx = fireflies.indexOf(hero.tongueTarget.ref);
            if (idx !== -1) fireflies.splice(idx, 1);
            score += 50;
            hero.hp = Math.min(hero.maxHp, hero.hp + 10);
            addCallout("+50 & +10 HP", hero.x, hero.y - 35, "#8BE070");
            playTone(620, 960, 0.14, "sine", 0.15);
            spawnFirefly();
            updateHud();
          } else if (hero.tongueTarget.kind === "enemy") {
            // Stun and deal 1 damage on tongue pull
            const e = hero.tongueTarget.ref;
            e.hp -= 1;
            addBurst(e.x, e.y, "#FF7B9C", 8);
            if (e.hp <= 0) {
              const idx = enemies.indexOf(e);
              if (idx !== -1) enemies.splice(idx, 1);
              score += e.points;
              addCallout(`+${e.points}`, hero.x, hero.y - 35, "#FFD147");
              updateHud();
            }
          }
        }
        hero.tongueTarget = null;
        hero.tongueLen = 0;
        hero.tongueState = "idle";
      }
    }

    // Direct Walk-Over Firefly Collection
    for (let i = fireflies.length - 1; i >= 0; i--) {
      const f = fireflies[i];
      if (Math.hypot(hero.x - f.x, hero.y - f.y) < hero.radius + f.radius) {
        fireflies.splice(i, 1);
        score += 50;
        hero.hp = Math.min(hero.maxHp, hero.hp + 10);
        addCallout("+50 & +10 HP", hero.x, hero.y - 32, "#8BE070");
        playTone(620, 960, 0.14, "sine", 0.15);
        spawnFirefly();
        updateHud();
      }
    }

    // Spawn remaining enemies for current wave
    if (waveEnemiesRemaining > 0 && frame % 70 === 0 && enemies.length < 8) {
      spawnEnemy();
      waveEnemiesRemaining -= 1;
    }

    // Next Wave Check
    if (waveEnemiesRemaining === 0 && enemies.length === 0) {
      startWave(wave + 1);
    }

    // Update Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const isPulled = hero.tongueTarget && hero.tongueTarget.ref === e;
      if (!isPulled) {
        const dx = hero.x - e.x;
        const dy = hero.y - e.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        e.vx += (dx / dist) * 0.25;
        e.vy += (dy / dist) * 0.25;

        const curSpeed = Math.hypot(e.vx, e.vy);
        if (curSpeed > e.speed) {
          e.vx = (e.vx / curSpeed) * e.speed;
          e.vy = (e.vy / curSpeed) * e.speed;
        }
        e.x += e.vx;
        e.y += e.vy;
      }

      // Enemy Attack Collision
      if (Math.hypot(hero.x - e.x, hero.y - e.y) < hero.radius + e.radius - 4) {
        if (hero.invuln <= 0) {
          hero.hp -= e.type === "beetle" ? 16 : 12;
          hero.invuln = 36;
          const push = Math.atan2(hero.y - e.y, hero.x - e.x);
          hero.vx += Math.cos(push) * 10;
          hero.vy += Math.sin(push) * 10;
          addBurst(hero.x, hero.y, "#E85342", 10);
          playTone(160, 70, 0.16, "sawtooth", 0.16);
          updateHud();

          if (hero.hp <= 0) {
            endGame();
            return;
          }
        }
      }
    }

    // Ambient Koi Fish
    koiFish.forEach((k) => {
      k.x += Math.cos(k.angle) * k.speed;
      k.y += Math.sin(k.angle) * k.speed;
      if (k.x < 40 || k.x > WORLD_W - 40) k.angle = Math.PI - k.angle;
      if (k.y < 40 || k.y > WORLD_H - 40) k.angle = -k.angle;
    });
  }

  function render() {
    ctx.clearRect(0, 0, viewW, viewH);

    // Camera centered on Frog Hero
    const camX = Math.max(0, Math.min(WORLD_W - viewW, hero.x - viewW / 2));
    const camY = Math.max(0, Math.min(WORLD_H - viewH, hero.y - viewH / 2));

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. Pond Water Surface
    const pondGrad = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 120, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.65);
    pondGrad.addColorStop(0, "#1F7A68");
    pondGrad.addColorStop(1, "#0E3D35");
    ctx.fillStyle = pondGrad;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Subtle Water Ripple Grid
    ctx.strokeStyle = "rgba(139, 224, 112, 0.08)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= WORLD_W; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD_H; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }

    // 2. Underwater Koi Fish Silhouettes
    koiFish.forEach((k) => {
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.angle);
      ctx.fillStyle = k.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2);
      ctx.lineTo(-34, -8);
      ctx.lineTo(-34, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // 3. Giant Lily Pads
    lilyPads.forEach((pad) => {
      ctx.save();
      ctx.translate(pad.x, pad.y);
      ctx.rotate(pad.rot);
      ctx.fillStyle = "#2E7D54";
      ctx.strokeStyle = "#10201C";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, pad.r, 0.22, Math.PI * 2 - 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (pad.hasLotus) {
        ctx.fillStyle = "#FF9EB5";
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });

    // 4. Golden Fireflies
    fireflies.forEach((f) => {
      const pulse = 1 + Math.sin(frame * 0.1 + f.bob) * 0.2;
      ctx.save();
      ctx.translate(f.x, f.y + Math.sin(frame * 0.08 + f.bob) * 4);
      ctx.fillStyle = "rgba(255, 209, 71, 0.28)";
      ctx.beginPath();
      ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFD147";
      ctx.strokeStyle = "#10201C";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // 5. Sticky Tongue Line
    if (hero.tongueState !== "idle" && hero.tongueLen > 0) {
      const tipX = hero.x + Math.cos(hero.tongueAngle) * hero.tongueLen;
      const tipY = hero.y + Math.sin(hero.tongueAngle) * hero.tongueLen;
      ctx.save();
      ctx.strokeStyle = "#10201C";
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = "#FF7B9C";
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = "#FF7B9C";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#10201C";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // 6. Enemies (Slimes & Beetles)
    enemies.forEach((e) => {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = "#10201C";
      ctx.lineWidth = 3.5;

      if (e.type === "slime") {
        const wobble = Math.sin(frame * 0.15) * 2.5;
        ctx.fillStyle = "#A259FF";
        ctx.beginPath();
        ctx.ellipse(0, 0, e.radius + wobble, e.radius - wobble, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.rotate(Math.atan2(hero.y - e.y, hero.x - e.x));
        ctx.fillStyle = "#3B282C";
        ctx.beginPath();
        ctx.ellipse(0, 0, e.radius + 3, e.radius - 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Glowing Monster Eyes
      ctx.fillStyle = "#FFD147";
      ctx.beginPath();
      ctx.arc(-6, -4, 3.5, 0, Math.PI * 2);
      ctx.arc(6, -4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 7. Frog Hero Character & Leaf Blade Slash
    ctx.save();
    ctx.translate(hero.x, hero.y);
    ctx.rotate(hero.facing);

    if (hero.invuln > 0 && Math.floor(frame / 3) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // Flowing Red Hero Scarf
    ctx.fillStyle = "#E85342";
    ctx.strokeStyle = "#10201C";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-34, -10 + Math.sin(frame * 0.25) * 4);
    ctx.lineTo(-30, 10 + Math.cos(frame * 0.25) * 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Leaf Blade Sword
    const swordSwing = hero.slashTimer > 0 ? (1 - hero.slashTimer / 14) * 2.4 - 1.2 : 0.45;
    ctx.save();
    ctx.rotate(swordSwing);
    ctx.fillStyle = "#8BE070";
    ctx.beginPath();
    ctx.moveTo(14, -4);
    ctx.quadraticCurveTo(44, -10, 56, 0);
    ctx.quadraticCurveTo(44, 10, 14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Sword Slash Crescent Effect
    if (hero.slashTimer > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, 68, -1.15, 1.15);
      ctx.stroke();
    }

    // Frog Body
    ctx.fillStyle = "#52C466";
    ctx.beginPath();
    ctx.arc(0, 0, hero.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Frog Top Eyes
    [ -10, 10 ].forEach((ey) => {
      ctx.fillStyle = "#F6F4EA";
      ctx.beginPath();
      ctx.arc(10, ey, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#10201C";
      ctx.beginPath();
      ctx.arc(12, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // 8. Particles & Floating Score Callouts
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = callouts.length - 1; i >= 0; i--) {
      const c = callouts[i];
      c.y -= 0.9;
      c.life -= 1;
      if (c.life <= 0) {
        callouts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.font = "800 18px 'Fredoka', sans-serif";
      ctx.fillStyle = c.color;
      ctx.strokeStyle = "#10201C";
      ctx.lineWidth = 4;
      ctx.strokeText(c.text, c.x - 36, c.y);
      ctx.fillText(c.text, c.x - 36, c.y);
      ctx.restore();
    }

    ctx.restore();
  }

  function loop() {
    if (!running) return;
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Preview on initial load
  buildPondScenery();
  render();
  window.addEventListener("resize", () => {
    if (!running) render();
  });

  startBtn.addEventListener("click", () => {
    unlockAudio();
    resizeCanvas();
    resetGame();
    overlay.classList.add("hidden");
    running = true;
    requestAnimationFrame(loop);
  });
});
