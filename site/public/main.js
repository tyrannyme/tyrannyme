const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Positions live in data-style so the page needs no inline styles.
for (const el of $$("[data-style]")) {
  for (const decl of el.dataset.style.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
  }
}

/* ---------- I. The door: through it, or around it ---------- */

const arrival = $("#arrival");
const stage = $(".stage", arrival);
const drift = $("#drift");
let entered = false;

function enter(way, dir = 1) {
  if (entered) return;
  entered = true;
  drift.hidden = false;
  drift.classList.add("drift-in");
  Drift.start();

  arrival.classList.add("leaving");
  if (way === "through" && !reduceMotion) arrival.classList.add("through");
  if (way === "around" && !reduceMotion) {
    stage.style.transition = "transform 800ms var(--ease-out), opacity 800ms ease";
    stage.style.transform = `translateX(${dir * 70}%)`;
    stage.style.opacity = "0";
  }
  setTimeout(() => {
    arrival.hidden = true;
    drift.focus({ preventScroll: true });
  }, reduceMotion ? 700 : way === "through" ? 1300 : 800);
}

$(".door-hit").addEventListener("click", () => enter("through"));

addEventListener("keydown", (e) => {
  if (entered || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  enter("around", e.key === "ArrowLeft" ? 1 : -1);
});

// Dragging the painting sideways walks you around the door.
{
  let startX = null, dx = 0, t0 = 0, captured = false;
  arrival.addEventListener("pointerdown", (e) => {
    if (entered || e.button) return;
    startX = e.clientX;
    dx = 0;
    t0 = performance.now();
    captured = false;
    stage.style.transition = "none";
  });
  arrival.addEventListener("pointermove", (e) => {
    if (startX === null) return;
    dx = e.clientX - startX;
    if (!captured && Math.abs(dx) > 6) {
      captured = true;
      arrival.setPointerCapture(e.pointerId);
      arrival.classList.add("dragging");
    }
    if (captured) stage.style.transform = `translateX(${dx}px)`;
  });
  const release = () => {
    if (startX === null) return;
    const v = dx / Math.max(1, performance.now() - t0);
    startX = null;
    arrival.classList.remove("dragging");
    if (captured && (Math.abs(dx) > innerWidth * 0.18 || (Math.abs(v) > 0.45 && Math.abs(dx) > 40))) {
      enter("around", Math.sign(dx));
    } else {
      stage.style.transition = "";
      stage.style.transform = "";
    }
  };
  arrival.addEventListener("pointerup", release);
  arrival.addEventListener("pointercancel", release);
}

/* ---------- II. The drift ---------- */

const Drift = (() => {
  const layers = $$("[data-depth]", drift).map((el) => ({ el, d: Number(el.dataset.depth) }));
  const frags = $$(".frag", drift).map((el) => ({
    el,
    x: parseFloat(el.style.getPropertyValue("--x")),
    y: parseFloat(el.style.getPropertyValue("--y")),
    near: Number(el.dataset.near) || 500,
  }));
  const bounds = { x0: 1200, x1: 3800, y0: 600, y1: 2950 };
  const cam = { x: 2500, y: 1740 };
  const vel = { x: 0, y: 0 };
  let scale = 1;
  let frame = 0;
  let last = 0;
  let dragging = false;
  let glide = null;
  const keys = new Set();

  const fit = () => {
    scale = clamp(Math.min(innerWidth / 1500, innerHeight / 980), 0.5, 1);
    drift.style.setProperty("--zoom", scale);
  };

  function render() {
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    for (const { el, d } of layers) {
      el.style.transform = `translate3d(${cx - cam.x * scale * d}px, ${cy - cam.y * scale * d}px, 0) scale(${scale})`;
    }
    for (const f of frags) {
      const near = Math.hypot(f.x - cam.x, f.y - cam.y) < f.near || f.el === document.activeElement;
      if (near !== f.el.classList.contains("near")) f.el.classList.toggle("near", near);
    }
  }

  const outside = () => {
    const bx = clamp(cam.x, bounds.x0, bounds.x1);
    const by = clamp(cam.y, bounds.y0, bounds.y1);
    return { dx: bx - cam.x, dy: by - cam.y };
  };

  function tick(now) {
    const dt = Math.min(48, now - last || 16);
    last = now;
    let moving = false;

    if (glide) {
      const t = clamp((now - glide.t0) / glide.ms, 0, 1);
      const e = t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
      cam.x = glide.x0 + (glide.x1 - glide.x0) * e;
      cam.y = glide.y0 + (glide.y1 - glide.y0) * e;
      if (t < 1) moving = true;
      else glide = null;
    } else if (!dragging) {
      // Held keys push the camera; released, it coasts to a stop.
      if (keys.size) {
        const k = 0.0045 * dt;
        const ax = (keys.has("right") - keys.has("left")) * k;
        const ay = (keys.has("down") - keys.has("up")) * k;
        vel.x = clamp(vel.x + ax, -0.9, 0.9);
        vel.y = clamp(vel.y + ay, -0.9, 0.9);
      }
      const decay = Math.exp(-dt / 320);
      vel.x *= decay;
      vel.y *= decay;
      cam.x += (vel.x * dt) / scale;
      cam.y += (vel.y * dt) / scale;

      // Past the edge of the drift, the fog pulls you gently back.
      const o = outside();
      if (o.dx || o.dy) {
        cam.x += o.dx * 0.12;
        cam.y += o.dy * 0.12;
        vel.x *= 0.8;
        vel.y *= 0.8;
      }
      moving = keys.size > 0 || Math.abs(vel.x) + Math.abs(vel.y) > 0.01 || Math.abs(o.dx) + Math.abs(o.dy) > 0.5;
    }

    render();
    frame = moving ? requestAnimationFrame(tick) : 0;
  }

  const wake = () => {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  const moved = () => drift.classList.add("moved");

  function glideTo(x, y, ms = 650) {
    vel.x = vel.y = 0;
    if (reduceMotion) {
      cam.x = x;
      cam.y = y;
      render();
      return;
    }
    glide = { x0: cam.x, y0: cam.y, x1: x, y1: y, t0: performance.now(), ms };
    wake();
  }

  // Drag to drift, with momentum. Capture only once it's really a drag, so taps still click.
  {
    let startX = 0, startY = 0, px = 0, py = 0, id = null, captured = false;
    let samples = [];
    drift.addEventListener("pointerdown", (e) => {
      if (e.button || id !== null) return;
      id = e.pointerId;
      startX = px = e.clientX;
      startY = py = e.clientY;
      captured = false;
      samples = [];
      glide = null;
      vel.x = vel.y = 0;
    });
    drift.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      if (!captured) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        captured = true;
        dragging = true;
        drift.setPointerCapture(id);
        drift.classList.add("dragging");
        moved();
      }
      const ddx = e.clientX - px;
      const ddy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      const o = outside();
      cam.x -= (ddx / scale) * (o.dx ? 0.35 : 1);
      cam.y -= (ddy / scale) * (o.dy ? 0.35 : 1);
      const now = performance.now();
      samples.push({ t: now, x: e.clientX, y: e.clientY });
      while (samples.length && now - samples[0].t > 90) samples.shift();
      render();
    });
    const release = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!captured) return;
      dragging = false;
      drift.classList.remove("dragging");
      // Swallow the click that follows a drag.
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (samples.length > 1) {
        const a = samples[0], b = samples[samples.length - 1];
        const t = Math.max(1, b.t - a.t);
        vel.x = clamp(-(b.x - a.x) / t, -3, 3);
        vel.y = clamp(-(b.y - a.y) / t, -3, 3);
      }
      wake();
    };
    let suppressClick = false;
    drift.addEventListener("click", (ev) => suppressClick && ev.stopPropagation(), true);
    drift.addEventListener("pointerup", release);
    drift.addEventListener("pointercancel", release);
  }

  drift.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      glide = null;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      cam.x = clamp(cam.x + dx / scale, bounds.x0 - 200, bounds.x1 + 200);
      cam.y = clamp(cam.y + dy / scale, bounds.y0 - 200, bounds.y1 + 200);
      moved();
      render();
      wake();
    },
    { passive: false },
  );

  const keyMap = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowUp: "up", w: "up", ArrowDown: "down", s: "down" };
  addEventListener("keydown", (e) => {
    if (drift.hidden || $("dialog[open]") || e.target.matches?.("input")) return;
    const k = keyMap[e.key];
    if (!k) return;
    e.preventDefault();
    keys.add(k);
    glide = null;
    moved();
    wake();
  });
  addEventListener("keyup", (e) => keys.delete(keyMap[e.key]));
  addEventListener("blur", () => keys.clear());

  // Tabbing to something glides the camera to it; activating it opens what it holds.
  for (const f of frags) {
    f.el.addEventListener("focus", () => glideTo(f.x, f.y));
    f.el.addEventListener("blur", render);
    if (!f.el.dataset.open) continue;
    f.el.addEventListener("click", () => {
      moved();
      glideTo(f.x, f.y, 550);
      const dialog = $(`#${f.el.dataset.open}`);
      setTimeout(() => open(dialog), reduceMotion ? 0 : 380);
    });
  }

  // A focused element can make the browser scroll the drift itself; the camera does that job.
  drift.addEventListener("scroll", () => drift.scrollTo(0, 0));
  addEventListener("resize", () => {
    fit();
    render();
  });

  return {
    start() {
      fit();
      render();
    },
  };
})();

drift.tabIndex = -1;

/* ---------- Things found in the drift ---------- */

function open(dialog) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  const video = $("video", dialog);
  if (video) {
    video.preload = "auto";
    if (reduceMotion) video.controls = true;
    else video.play().catch(() => {});
  }
  if (dialog.id === "d-sign") Painter.opened();
}

for (const dialog of $$("dialog")) {
  // Click outside the card to return to the drift.
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog || dialog.classList.contains("painter")) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => $("video", dialog)?.pause());
}

/* ---------- The sign: paint it, take it home, put it up ---------- */

const Painter = (() => {
  const dialog = $("#d-sign");
  const canvas = $(".paper", dialog);
  const ctx = canvas.getContext("2d");
  const input = $(".words input", dialog);
  const W = canvas.width;
  const H = canvas.height;
  const strokes = [];
  let ink = "#2f3f8f";
  let size = 20;
  let current = null;

  const paper = new Image();
  paper.src = "/art/paper.webp";

  function pick(group, button) {
    for (const b of $$("button", group)) b.setAttribute("aria-checked", String(b === button));
  }

  for (const b of $$(".inks button", dialog)) {
    b.addEventListener("click", () => {
      ink = b.style.getPropertyValue("--ink").trim();
      pick(b.parentElement, b);
    });
  }
  for (const b of $$(".sizes button", dialog)) {
    b.addEventListener("click", () => {
      size = Number(b.dataset.size);
      pick(b.parentElement, b);
    });
  }

  input.addEventListener("input", () => canvas.classList.toggle("words", input.value.trim() !== ""));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.value.trim()) place(W / 2, H / 2);
    }
  });

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  function drawPath(s, c = ctx) {
    const p = s.points;
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (p.length === 1) {
      c.beginPath();
      c.arc(p[0][0], p[0][1], p[0][2] / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = i > 1 ? [(p[i - 2][0] + p[i - 1][0]) / 2, (p[i - 2][1] + p[i - 1][1]) / 2] : p[0];
      const [x1, y1] = [(p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2];
      c.lineWidth = p[i][2];
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(p[i - 1][0], p[i - 1][1], x1, y1);
      c.stroke();
    }
  }

  function drawText(s, c = ctx) {
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.tilt);
    c.fillStyle = s.color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    let px = s.px;
    c.font = `${px}px "Permanent Marker"`;
    while (c.measureText(s.text).width > W * 0.92 && px > 24) {
      px -= 4;
      c.font = `${px}px "Permanent Marker"`;
    }
    c.fillText(s.text, 0, 0);
    c.restore();
  }

  function redraw() {
    ctx.clearRect(0, 0, W, H);
    for (const s of strokes) (s.text ? drawText : drawPath)(s);
  }

  function place(x, y) {
    strokes.push({ text: input.value.trim(), x, y, px: 40 + size * 2.6, color: ink, tilt: (Math.random() - 0.5) * 0.08 });
    input.value = "";
    canvas.classList.remove("words");
    redraw();
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const [x, y] = toCanvas(e);
    if (input.value.trim()) {
      place(x, y);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    current = { color: ink, base: size, points: [[x, y, size]], t: performance.now() };
    strokes.push(current);
    redraw();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      const [x, y] = toCanvas(ev);
      const prev = current.points[current.points.length - 1];
      const now = performance.now();
      const dist = Math.hypot(x - prev[0], y - prev[1]);
      if (dist < 1.5) continue;
      // Faster strokes run thinner, like a loaded brush dragged quickly.
      const speed = dist / Math.max(1, now - current.t);
      current.t = now;
      const target = current.base * clamp(1.25 - speed * 0.18, 0.55, 1.25);
      const w = prev[2] + (target - prev[2]) * 0.35;
      current.points.push([x, y, w]);
    }
    redraw();
  });

  const end = () => (current = null);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  const actions = {
    undo() {
      strokes.pop();
      redraw();
    },
    clear() {
      strokes.length = 0;
      redraw();
    },
    save() {
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      const c = out.getContext("2d");
      if (paper.complete) c.drawImage(paper, 0, 0, W, H);
      else {
        c.fillStyle = "#f4ede1";
        c.fillRect(0, 0, W, H);
      }
      c.drawImage(canvas, 0, 0);
      out.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "my-sign.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    },
    raise() {
      const overlay = $("#f-sign .sign-overlay");
      const o = overlay.getContext("2d");
      o.clearRect(0, 0, overlay.width, overlay.height);
      o.drawImage(canvas, 0, 0, overlay.width, overlay.height);
      const painted = strokes.length > 0;
      overlay.classList.toggle("up", painted);
      const whisper = $("#f-sign .whisper");
      whisper.dataset.before ??= whisper.textContent;
      whisper.textContent = painted ? whisper.dataset.after : whisper.dataset.before;
      dialog.close();
    },
  };

  for (const b of $$("[data-act]", dialog)) b.addEventListener("click", () => actions[b.dataset.act]());

  return {
    opened() {
      document.fonts.load('40px "Permanent Marker"').then(redraw);
    },
  };
})();

console.log("%cSic semper tyrannis.", "font: italic 600 26px 'Cormorant Garamond', Georgia, serif; color: #2f3f8f;");
