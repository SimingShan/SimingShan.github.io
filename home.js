// Homepage hero: a sheet of equations drifting past a black hole.
//
// Each token of each equation lives at a point (a, b) on a flat sheet. Every
// frame the sheet is pushed through three maps before it is projected:
//   1. point-mass lens equation   θ = (β + √(β² + 4θ_E²)) / 2
//      — nothing lands inside the Einstein radius; text near it smears into a ring
//   2. a frame-dragging twist that grows toward the ring
//   3. a gravity well that pulls the sheet back along its normal into a funnel
// Tokens are drawn with the local Jacobian of that map, so they bend and stretch
// with the sheet. Background stars are lensed by the same equation in screen space.
// Click the hole to feed it.
(() => {
  'use strict';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('.spacetime');
  const eatenEl = document.querySelector('.eaten');
  if (!hero || !canvas) return;
  const ctx = canvas.getContext('2d');

  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  /* ---------------- The equations ----------------
     Mini markup: _x / _{..} subscript, ^x / ^{..} superscript.
     Tokens are split on single spaces. */
  const EQUATIONS = [
    '∂^2u/∂t^2 = v(x)^2 ∇^2u + s(x,t)',
    'min_v ½‖F(v) − d_{obs}‖^2 + λ R(v)',
    'R(x) = ½ x^⊤(x − D_σ(x))',
    '∇R(x) = x − D_σ(x)',
    'x_{t−1} = (x_t − β_t ε_θ(x_t, t) / √(1 − ᾱ_t)) / √α_t + σ_t z',
    'dx = [f(x,t) − g(t)^2 ∇_x log p_t(x)] dt + g(t) dw̄',
    's_θ(x, t) ≈ ∇_x log p_t(x)',
    'p(x | y) ∝ p(y | x) p(x)',
    '∂u/∂t + (u·∇)u = −∇p/ρ + ν∇^2u',
    '∇·u = 0',
    'G_{μν} + Λg_{μν} = 8πG T_{μν} / c^4',
    'iħ ∂ψ/∂t = Ĥψ',
    'E = mc^2',
    'r_s = 2GM / c^2',
    'ds^2 = −(1 − r_s/r) c^2dt^2 + dr^2 / (1 − r_s/r) + r^2dΩ^2',
    'L(θ) = E‖ε − ε_θ(x_t, t)‖^2',
    'S = k_B ln Ω',
    '∮ E·dA = Q / ε_0',
    '∇×B = μ_0J + μ_0ε_0 ∂E/∂t',
    'G(u)(y) ≈ Σ_k b_k(u) t_k(y)',
    'f(x) = ∫ f̂(ξ) e^{2πixξ} dξ',
    'D_{KL}(q‖p) = ∫ q log(q/p)',
    'T_H = ħc^3 / 8πGMk_B',
    'θ_E = √(4GM D_{ls} / c^2D_lD_s)',
    '−∇·(a∇u) = f in Ω',
    'u|_{∂Ω} = g',
    '∇^2φ = 4πGρ',
    'x_t = √ᾱ_t x_0 + √(1 − ᾱ_t) ε',
    'q(x_t | x_{t−1}) = N(√(1 − β_t) x_{t−1}, β_t I)',
    '∂_tρ + ∇·(ρu) = 0',
    'L = ‖N[u_θ]‖^2 + ‖u_θ − g‖^2_{∂Ω}',
    'F(v) = Pu, u = A(v)^{−1}s',
    'e^{iπ} + 1 = 0',
    'Δx Δp ≥ ħ/2',
    '∂_tp = −∇·(fp) + ½g^2∇^2p',
    'x^{k+1} = x^k − η(∇J(x^k) + λ(x^k − D(x^k)))',
  ];

  /* ---------------- Token sprites ---------------- */
  const FS = 40;                               // sprite font size in px; 1 sheet unit = 1 em
  const SPRITE_H = Math.ceil(FS * 1.75), BASE = Math.round(FS * 1.18);
  const measure = document.createElement('canvas').getContext('2d');
  const RUN = /(log|ln|min|obs|KL|in)|([A-Za-zα-ωħ])|([^A-Za-zα-ωħ]+)/gu;

  function parse(str) {
    const segs = [];
    for (let i = 0; i < str.length;) {
      const ch = str[i];
      if (ch === '_' || ch === '^') {
        const l = ch === '_' ? -1 : 1; i++;
        let t;
        if (str[i] === '{') { const j = str.indexOf('}', i); t = str.slice(i + 1, j); i = j + 1; }
        else { t = String.fromCodePoint(str.codePointAt(i)); i += t.length; }
        segs.push({ t, l });
      } else {
        let j = i; while (j < str.length && str[j] !== '_' && str[j] !== '^') j++;
        segs.push({ t: str.slice(i, j), l: 0 }); i = j;
      }
    }
    return segs;
  }

  function layout(str) {
    const runs = []; let x = 0;
    for (const s of parse(str)) {
      const size = s.l ? FS * 0.66 : FS;
      const dy = s.l === 1 ? -FS * 0.42 : s.l === -1 ? FS * 0.22 : 0;
      RUN.lastIndex = 0; let m;
      while ((m = RUN.exec(s.t))) {
        const italic = !!m[2];
        const font = `${italic ? 'italic ' : ''}${size}px "STIX Two Text", "Times New Roman", serif`;
        measure.font = font;
        runs.push({ t: m[0], font, x, dy });
        x += measure.measureText(m[0]).width + (italic ? size * 0.03 : 0);
      }
    }
    return { runs, w: x };
  }

  const TINTS = ['#b7cdf6', '#ffffff'];
  const spriteCache = new Map();
  function sprite(str) {
    let s = spriteCache.get(str);
    if (s) return s;
    const { runs, w } = layout(str);
    const cw = Math.ceil(w + 6);
    s = { w: cw, unitW: cw / FS, tints: [] };
    for (const color of TINTS) {
      const c = document.createElement('canvas');
      c.width = cw; c.height = SPRITE_H;
      const g = c.getContext('2d');
      g.fillStyle = color; g.textBaseline = 'alphabetic';
      for (const r of runs) { g.font = r.font; g.fillText(r.t, 3 + r.x, BASE + r.dy); }
      s.tints.push(c);
    }
    spriteCache.set(str, s);
    return s;
  }

  /* ---------------- The sheet ---------------- */
  const ROWH = 1.62, BMAX = 38, AMIN = -86, AMAX = 48, TOKEN_GAP = 0.32, EQ_GAP = 1.9;
  let tokens = [];           // { row, base, spr }
  let rows = [];             // { b, period, phase }
  let tokA, tokPrev, tokFed;

  function buildSheet() {
    const r = rng(20260514);
    const order = EQUATIONS.map((e) => e.split(' '));
    tokens = []; rows = [];
    const need = AMAX - AMIN + 14;
    let ri = 0;
    for (let b = -BMAX; b <= BMAX + 1e-6; b += ROWH, ri++) {
      let x = 0;
      while (x < need) {
        const eq = order[Math.floor(r() * order.length)];
        for (const t of eq) {
          const spr = sprite(t);
          tokens.push({ row: ri, base: x, spr });
          x += spr.unitW + TOKEN_GAP;
        }
        x += EQ_GAP;
      }
      rows.push({ b: b + (r() - 0.5) * 0.18, period: x, phase: r() * x });
    }
    tokA = new Float32Array(tokens.length);
    tokPrev = new Float32Array(tokens.length).fill(1e9);
    tokFed = new Uint8Array(tokens.length);
  }

  /* ---------------- Camera + spacetime map ---------------- */
  let W = 0, H = 0, DPR = 1, mobile = false;
  const cam = { f: 1, hx: 0, hy: 0, psi: 1, Z0: 52, O: [0, 0, 0], U: [0, 0, 0], N: [0, 0, 0] };
  const TE0 = 7.2;           // Einstein radius in sheet units (ems)
  let TE = TE0;
  const TWIST = 1.05, DEPTH = 30;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let zoom = 1;

  function setupCamera() {
    cam.f = Math.max(H * 1.05, W * 0.62) * zoom;
    cam.hx = W * (mobile ? 0.4 : 0.66) + mouse.x * 18;
    cam.hy = H * (mobile ? 0.27 : 0.45) + mouse.y * 12;
    cam.psi = (mobile ? 0.9 : 0.86) + mouse.x * 0.06;
    const c = Math.cos(cam.psi), s = Math.sin(cam.psi);
    const Z0 = cam.Z0;
    cam.O = [(cam.hx - W / 2) * Z0 / cam.f, (cam.hy - H / 2) * Z0 / cam.f, Z0];
    cam.U = [c, 0, -s];      // along the rows: rightward and toward the viewer
    cam.N = [s * 0.55, 0, c]; // the well pulls the sheet back, slightly right
  }

  // post-lens sheet coords (x, y) at lensed radius th → screen
  function place(x, y, th, out) {
    const q = TE / th, q2 = q * q;
    const phi = TWIST * q2;
    const c = Math.cos(phi), s = Math.sin(phi);
    const x2 = x * c - y * s, y2 = x * s + y * c;
    const z = DEPTH * q2 * q;
    const X = cam.O[0] + x2 * cam.U[0] + z * cam.N[0];
    const Y = cam.O[1] + y2;
    const Z = cam.O[2] + x2 * cam.U[2] + z * cam.N[2];
    if (Z < 3) return false;
    const k = cam.f / Z;
    out.x = W / 2 + X * k; out.y = H / 2 + Y * k; out.z = Z;
    return true;
  }
  // source sheet coords → screen, via the lens equation; returns lensed radius
  function map(a, b, out) {
    const beta = Math.hypot(a, b) + 1e-6;
    const th = 0.5 * (beta + Math.sqrt(beta * beta + 4 * TE * TE));
    const k = th / beta;
    out.th = th;
    return place(a * k, b * k, th, out);
  }

  /* ---------------- Stars + galaxy ---------------- */
  let stars = [];
  let galaxy = null;
  function buildStars() {
    const r = rng(7);
    const n = Math.round((W * H) / 2300);
    stars = Array.from({ length: n }, () => {
      const big = r() < 0.06;
      return {
        x: r(), y: r(),
        s: big ? 0.9 + r() * 0.9 : 0.35 + r() * 0.55,
        a: big ? 0.75 + r() * 0.25 : 0.25 + r() * 0.5,
        ph: r() * 6.28, sp: 0.4 + r() * 1.6,
        warm: r() < 0.12,
      };
    });
    // a small, far-away spiral galaxy
    const g = document.createElement('canvas');
    g.width = 180; g.height = 90;
    const gc = g.getContext('2d');
    gc.translate(90, 45); gc.rotate(-0.42); gc.scale(1, 0.42);
    const halo = gc.createRadialGradient(0, 0, 0, 0, 0, 70);
    halo.addColorStop(0, 'rgba(255,236,205,.9)');
    halo.addColorStop(0.08, 'rgba(240,215,180,.55)');
    halo.addColorStop(0.35, 'rgba(150,170,230,.14)');
    halo.addColorStop(1, 'rgba(120,150,230,0)');
    gc.fillStyle = halo; gc.beginPath(); gc.arc(0, 0, 70, 0, 6.29); gc.fill();
    const gr = rng(99);
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 160; i++) {
        const t = i / 160, ang = arm * Math.PI + t * 4.4, rad = 6 + t * 58;
        gc.fillStyle = `rgba(${200 + gr() * 55},${210 + gr() * 45},255,${0.5 * (1 - t) * gr()})`;
        gc.beginPath();
        gc.arc(Math.cos(ang) * rad + (gr() - 0.5) * 7, Math.sin(ang) * rad + (gr() - 0.5) * 7, 0.6 + gr() * 1.2, 0, 6.29);
        gc.fill();
      }
    }
    galaxy = g;
  }

  /* ---------------- Canvases ---------------- */
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const bloomA = document.createElement('canvas'), bactx = bloomA.getContext('2d');
  const bloomB = document.createElement('canvas'), bbctx = bloomB.getContext('2d');

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = hero.clientWidth; H = hero.clientHeight;
    mobile = W < 820;
    for (const c of [canvas, layer]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    bloomA.width = Math.max(1, Math.round(W / 4)); bloomA.height = Math.max(1, Math.round(H / 4));
    bloomB.width = Math.max(1, Math.round(W / 12)); bloomB.height = Math.max(1, Math.round(H / 12));
    buildStars();
  }

  /* ---------------- Drawing ---------------- */
  const P0 = {}, PA = {}, PB = {};
  let flow = 0, eaten = 0;
  const H_FD = 0.2;

  function drawTokens(g, hole) {
    const inner2 = (hole.rad * 0.98) ** 2;
    const W1 = W + 120, H1 = H + 120;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i], row = rows[tk.row];
      let a = AMIN + ((((tk.base - flow + row.phase) % row.period) + row.period) % row.period);
      // wrapped round to the far side: it can be eaten again
      if (a > tokPrev[i] + 1) tokFed[i] = 0;
      tokPrev[i] = a;
      const w = tk.spr.unitW;
      if (a + w > AMAX) continue;
      const b = row.b;
      const ac = a + w * 0.5;

      if (!map(ac, b, P0)) continue;
      if (P0.x < -120 || P0.x > W1 || P0.y < -120 || P0.y > H1) continue;
      if (cam.f / P0.z < 1.4) continue;      // too far away to read
      const th = P0.th;
      // keep the shadow black: nothing drawn inside the horizon
      if (th < TE * 1.6 && (P0.x - hole.cx) ** 2 + (P0.y - hole.cy) ** 2 < inner2) continue;
      if (!tokFed[i] && Math.hypot(ac, b) < TE * 0.55) { tokFed[i] = 1; eaten++; }

      if (!map(ac + H_FD, b, PA) || !map(ac, b + H_FD, PB)) continue;
      const jax = (PA.x - P0.x) / H_FD, jay = (PA.y - P0.y) / H_FD;
      const jbx = (PB.x - P0.x) / H_FD, jby = (PB.y - P0.y) / H_FD;
      const la = Math.hypot(jax, jay), lb = Math.hypot(jbx, jby);
      const stretch = la > lb ? la / lb : lb / la;
      if (stretch > 10 || lb < 1.6) continue;

      const ring = Math.exp(-(th / TE - 1) * 1.15);
      let alpha =
        (0.26 + 0.74 * ring) *
        smooth(AMIN, AMIN + 14, a) * smooth(AMAX, AMAX - 10, a + w) *
        smooth(BMAX, BMAX - 8, Math.abs(b)) *
        (stretch > 4 ? 1 - (stretch - 4) / 6 : 1) *
        smooth(1.6, 5, lb) *
        clamp(1.35 - P0.z / (cam.Z0 * 1.9), 0.25, 1);
      if (alpha < 0.02) continue;

      const k = DPR / FS;
      g.globalAlpha = alpha;
      g.setTransform(jax * k, jay * k, jbx * k, jby * k, P0.x * DPR, P0.y * DPR);
      g.drawImage(tk.spr.tints[ring > 0.33 ? 1 : 0], -tk.spr.w / 2, -BASE);
    }
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalAlpha = 1;
  }

  // light streaming along the sheet into the throat
  const STREAK_B = [-8, -6.2, -4.8, -3.6, -2.7, -2, -1.4, -0.9, -0.45, -0.1, 0.3, 0.75, 1.25, 1.8, 2.5, 3.3, 4.3, 5.6, 7.2, 9];
  const BUCKETS = 8;
  function drawStreaks(g, t) {
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    const prev = {}, cur = {};
    for (const b of STREAK_B) {
      let have = false;
      for (let a = AMIN + 12; a < AMAX - 6; a += 0.45) {
        if (!map(a, b, cur)) { have = false; continue; }
        // a row passing straight under the hole jumps across the ring: don't bridge it
        if (have && Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) < 30) {
          const ring = Math.exp(-(cur.th / TE - 1) * 1.5);
          const pulse = 0.5 + 0.5 * Math.sin((a + flow) * 0.42 + b * 2.1);
          const v = ring * (0.35 + 0.65 * pulse) * smooth(AMIN + 12, AMIN + 30, a);
          const q = Math.min(BUCKETS - 1, Math.floor(v * BUCKETS));
          if (q > 0) { paths[q].moveTo(prev.x, prev.y); paths[q].lineTo(cur.x, cur.y); }
        }
        prev.x = cur.x; prev.y = cur.y; have = true;
      }
    }
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let q = 1; q < BUCKETS; q++) {
      g.strokeStyle = `rgba(206,228,255,${(q / BUCKETS) * 0.7})`;
      g.lineWidth = 0.6 + q * 0.32;
      g.stroke(paths[q]);
    }
    g.globalCompositeOperation = 'source-over';
  }

  function ringPolygon() {
    const pts = [], p = {};
    let cx = 0, cy = 0;
    for (let i = 0; i < 96; i++) {
      const ang = (i / 96) * Math.PI * 2;
      if (place(TE * Math.cos(ang), TE * Math.sin(ang), TE, p)) { pts.push([p.x, p.y]); cx += p.x; cy += p.y; }
    }
    cx /= pts.length || 1; cy /= pts.length || 1;
    let rad = 0;
    for (const q of pts) rad += Math.hypot(q[0] - cx, q[1] - cy);
    rad /= pts.length || 1;
    return { pts, cx, cy, rad };
  }
  // photon ring, brighter on the side moving toward us (Doppler beaming)
  function drawRing(g, ring) {
    const n = ring.pts.length, segs = 4, paths = Array.from({ length: segs }, () => new Path2D());
    for (let i = 0; i < n; i++) {
      const [x0, y0] = ring.pts[i], [x1, y1] = ring.pts[(i + 1) % n];
      const ang = Math.atan2((y0 + y1) / 2 - ring.cy, (x0 + x1) / 2 - ring.cx);
      const beam = 0.5 + 0.5 * Math.cos(ang - 2.6);           // peaks upper-left
      const q = Math.min(segs - 1, Math.floor(beam * segs));
      paths[q].moveTo(x0, y0); paths[q].lineTo(x1, y1);
    }
    g.lineCap = 'round';
    for (let q = 0; q < segs; q++) {
      const k = 0.3 + 0.7 * ((q + 0.5) / segs);
      for (const [w, a] of [[22, 0.05], [9, 0.14], [3.4, 0.42], [1.4, 1]]) {
        g.lineWidth = w * (0.7 + 0.5 * k); g.strokeStyle = `rgba(214,234,255,${(a * k).toFixed(3)})`; g.stroke(paths[q]);
      }
    }
  }

  function polyPath(pts, scale, cx, cy) {
    const p = new Path2D();
    pts.forEach(([x, y], i) => {
      const X = cx + (x - cx) * scale, Y = cy + (y - cy) * scale;
      i ? p.lineTo(X, Y) : p.moveTo(X, Y);
    });
    p.closePath();
    return p;
  }

  function drawStars(g, t, ring) {
    const E = ring.rad * 1.55, E2 = 4 * E * E;
    const drift = t * 0.004;
    const buckets = [[], []];
    for (const st of stars) {
      const x = ((st.x + drift * (0.4 + st.s * 0.3)) % 1) * (W + 40) - 20;
      const y = st.y * H;
      const dx = x - ring.cx, dy = y - ring.cy;
      const beta = Math.hypot(dx, dy) + 1e-3;
      const tw = st.a * (0.72 + 0.28 * Math.sin(st.ph + t * st.sp));
      const root = Math.sqrt(beta * beta + E2);
      const thp = 0.5 * (beta + root), thm = 0.5 * (beta - root);
      const ux = dx / beta, uy = dy / beta;
      const magP = Math.min(7, thp / beta);
      buckets[st.warm ? 1 : 0].push([ring.cx + ux * thp, ring.cy + uy * thp, st.s, Math.min(1, tw * Math.sqrt(magP)), magP, ux, uy]);
      // counter-image on the far side, only when it lands outside the shadow
      if (-thm > ring.rad * 1.05 && beta < E * 2.5) {
        const magM = Math.min(7, -thm / beta);
        buckets[st.warm ? 1 : 0].push([ring.cx + ux * thm, ring.cy + uy * thm, st.s, tw * 0.6 * Math.min(1, magM), magM, ux, uy]);
      }
    }
    const cols = ['226,236,255', '255,214,160'];
    for (let c = 0; c < 2; c++) {
      for (const [x, y, s, a, mag, ux, uy] of buckets[c]) {
        g.fillStyle = `rgba(${cols[c]},${a.toFixed(3)})`;
        g.beginPath();
        // lensed images are stretched tangentially
        g.ellipse(x, y, s * Math.max(1, Math.min(mag, 6)), s, Math.atan2(uy, ux) + Math.PI / 2, 0, 6.2832);
        g.fill();
        if (s > 1.2) {
          g.fillStyle = `rgba(${cols[c]},${(a * 0.28).toFixed(3)})`;
          g.fillRect(x - s * 4, y - 0.35, s * 8, 0.7);
          g.fillRect(x - 0.35, y - s * 4, 0.7, s * 8);
        }
      }
    }
    if (galaxy) {
      g.globalAlpha = 0.85;
      g.drawImage(galaxy, W * (mobile ? 0.06 : 0.3), H * (mobile ? 0.07 : 0.11), 120, 60);
      g.globalAlpha = 1;
    }
  }

  let last = 0, pulse = 0;
  function render(now) {
    if (W < 2 || H < 2) return;
    const t = now / 1000;
    const dt = Math.min(0.05, last ? t - last : 0);
    last = t;

    flow += dt * 0.55;
    pulse *= Math.exp(-dt * 1.6);
    TE = TE0 * (1 + 0.32 * pulse);
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2.5);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2.5);
    const sc = clamp(window.scrollY / Math.max(1, H));
    zoom = 1 + 0.45 * sc * sc;
    setupCamera();
    const ring = ringPolygon();

    // sheet layer
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawStreaks(lctx, t);
    drawTokens(lctx, ring);
    // photon ring, drawn into the layer so it blooms
    lctx.globalCompositeOperation = 'lighter';
    const ringPath = polyPath(ring.pts, 1, ring.cx, ring.cy);
    drawRing(lctx, ring);
    lctx.globalCompositeOperation = 'source-over';

    // compose
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const neb = ctx.createRadialGradient(ring.cx, ring.cy, ring.rad * 0.8, ring.cx, ring.cy, Math.max(W, H) * 0.55);
    neb.addColorStop(0, 'rgba(70,110,190,.20)');
    neb.addColorStop(0.25, 'rgba(40,70,140,.08)');
    neb.addColorStop(1, 'rgba(10,20,50,0)');
    ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);

    drawStars(ctx, t, ring);

    // the shadow
    ctx.fillStyle = '#000';
    ctx.fill(polyPath(ring.pts, 0.995, ring.cx, ring.cy));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);

    // cheap bloom: downsample the sheet twice and add it back
    bactx.clearRect(0, 0, bloomA.width, bloomA.height);
    bactx.drawImage(layer, 0, 0, bloomA.width, bloomA.height);
    bbctx.clearRect(0, 0, bloomB.width, bloomB.height);
    bbctx.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.5; ctx.drawImage(bloomA, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.75; ctx.drawImage(bloomB, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (eatenEl) eatenEl.textContent = eaten;
  }

  /* ---------------- Interaction ---------------- */
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  hero.addEventListener('pointerleave', () => { mouse.tx = 0; mouse.ty = 0; });
  canvas.addEventListener('click', () => { pulse = 1; });

  /* ---------------- Main loop ---------------- */
  let running = false, visible = true, raf = 0;
  const frame = (now) => {
    render(now);
    raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (running && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };

  function start() {
    if (running) return;
    buildSheet();
    resize();
    running = true;
    flow = 18;                 // start mid-stream, not with an empty throat
    render(performance.now());
    eaten = 0;                 // only count what falls in while you watch
    if (reduceMotion) return;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(hero);
    document.addEventListener('visibilitychange', kick);
    kick();
  }
  addEventListener('resize', () => {
    if (!running) return;
    resize();
    if (reduceMotion) render(performance.now());
  });

  const fontsReady = document.fonts
    ? Promise.all([
        document.fonts.load(`${FS}px "STIX Two Text"`),
        document.fonts.load(`italic ${FS}px "STIX Two Text"`),
      ])
    : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(start, start);
})();

/* ---------------- Page chrome ---------------- */
(() => {
  // nav gets a backdrop once we leave the hero
  const nav = document.querySelector('.topnav');
  const hero = document.querySelector('.hero');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > hero.clientHeight * 0.75);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // sections drift in as they come into view
  const items = document.querySelectorAll('.sec-label, .about-grid, .pub, .post, .horizon-note, .horizon-links');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => { el.classList.add('reveal'); io.observe(el); });
  }
})();

/* ---------------- Publication cover art ---------------- */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const path = (svg, d, attrs) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    for (const k in attrs) p.setAttribute(k, attrs[k]);
    svg.appendChild(p);
  };

  // FunDiff: samples from a smooth prior over functions
  const fd = document.querySelector('.art-fundiff');
  if (fd) {
    const r = rng(3);
    for (let n = 0; n < 22; n++) {
      const coef = Array.from({ length: 7 }, (_, k) => ({ a: (r() - 0.5) * 2 / Math.pow(k + 1, 1.4), p: r() * 6.28 }));
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const x = i / 120;
        let y = 0;
        coef.forEach((c, k) => { y += c.a * Math.sin((k + 1) * Math.PI * x + c.p); });
        d += (i ? 'L' : 'M') + (20 + x * 280).toFixed(1) + ' ' + (90 - y * 34).toFixed(1);
      }
      const hi = n === 0;
      path(fd, d, { fill: 'none', stroke: hi ? '#ffffff' : '#9cc8ff', 'stroke-width': hi ? 1.4 : 0.7, opacity: hi ? 0.95 : 0.18 + r() * 0.25 });
    }
  }

  // PiRD: streamlines of flow past a cylinder, with a wake
  const pr = document.querySelector('.art-pird');
  if (pr) {
    const R = 16, cx = 110, cy = 90;
    const vel = (x, y) => {
      const X = x - cx, Y = y - cy, r2 = X * X + Y * Y;
      let u = 1 - (R * R * (X * X - Y * Y)) / (r2 * r2);
      let v = -(2 * R * R * X * Y) / (r2 * r2);
      // a pair of shed vortices downstream
      for (const [vx, vy, g] of [[cx + 52, cy - 12, 1], [cx + 104, cy + 13, -1], [cx + 156, cy - 13, 1]]) {
        const dx = x - vx, dy = y - vy, d2 = dx * dx + dy * dy + 40;
        u += (g * 180 * dy) / d2 / 6.28; v -= (g * 180 * dx) / d2 / 6.28;
      }
      return [u, v];
    };
    for (let y0 = 14; y0 <= 166; y0 += 7) {
      let x = 6, y = y0, d = `M${x} ${y}`;
      for (let i = 0; i < 700 && x < 314; i++) {
        const [u, v] = vel(x, y);
        const s = Math.hypot(u, v) || 1;
        x += (u / s) * 0.8; y += (v / s) * 0.8;
        if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) break;
        if (i % 3 === 0) d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const near = Math.abs(y0 - cy) < 26;
      path(pr, d, { fill: 'none', stroke: near ? '#d8ebff' : '#9cc8ff', 'stroke-width': near ? 0.9 : 0.6, opacity: near ? 0.8 : 0.35 });
    }
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', R - 1);
    c.setAttribute('fill', '#000'); c.setAttribute('stroke', '#d8ebff'); c.setAttribute('stroke-width', '1');
    pr.appendChild(c);
  }
})();
