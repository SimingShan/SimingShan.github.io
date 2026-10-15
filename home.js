// Homepage hero: a sheet of equations falls into a black hole.
//
// The sheet. Text is laid out along the streamlines of a uniform flow draining
// into a point sink with a little swirl,
//     u = −x̂ − (m r̂ − Γ θ̂) / 2πr,
// so rows run straight far away and wrap into the hole near it. Tokens ride the
// flow; because the flow is incompressible each one is stretched along the
// stream and squeezed across it as it speeds up. The sheet is pulled into a
// funnel of depth ∝ 1 − √(1 − r_s/r), the Schwarzschild redshift factor, which
// turns vertical at the throat; faces of the funnel that point away from us
// are culled, so text drops over the lip and out of sight.
//
// The hole itself is ray-traced on the GPU: photons bend around a
// Schwarzschild black hole, so the sheet and the stars are lensed into rings,
// a photon ring hugs the shadow, and a thin accretion disk of equations is
// lifted over the top of it, brighter on the side that swings toward us.
//
// The hole belongs to the hero and scrolls away with it; the stars stay.
(() => {
  'use strict';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const back = document.querySelector('.spacetime');
  const hero = document.querySelector('.hero');
  if (!back || !hero) return;
  const bctx = back.getContext('2d');

  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

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
  const FS = 40;                               // sprite font size in px
  const SPRITE_H = Math.ceil(FS * 1.75), BASE = Math.round(FS * 1.18);
  const measureCtx = document.createElement('canvas').getContext('2d');
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

  function layoutRuns(str) {
    const runs = []; let x = 0;
    for (const s of parse(str)) {
      const size = s.l ? FS * 0.66 : FS;
      const dy = s.l === 1 ? -FS * 0.42 : s.l === -1 ? FS * 0.22 : 0;
      RUN.lastIndex = 0; let m;
      while ((m = RUN.exec(s.t))) {
        const italic = !!m[2];
        const font = `${italic ? 'italic ' : ''}${size}px "STIX Two Text", "Times New Roman", serif`;
        measureCtx.font = font;
        runs.push({ t: m[0], font, x, dy });
        x += measureCtx.measureText(m[0]).width + (italic ? size * 0.03 : 0);
      }
    }
    return { runs, w: x };
  }

  const TINTS = ['#a9bfe9', '#ffffff'];
  const spriteCache = new Map();
  function sprite(str) {
    let s = spriteCache.get(str);
    if (s) return s;
    const { runs, w } = layoutRuns(str);
    const cw = Math.ceil(w + 6);
    s = { w: cw, tints: [] };
    for (const color of TINTS) {
      const c = document.createElement('canvas');
      c.width = cw; c.height = SPRITE_H;
      const g = c.getContext('2d');
      g.fillStyle = color;
      for (const r of runs) { g.font = r.font; g.fillText(r.t, 3 + r.x, BASE + r.dy); }
      s.tints.push(c);
    }
    spriteCache.set(str, s);
    return s;
  }

  /* ---------------- The flow ---------------- */
  const SINK = 92;          // sink strength: it swallows a band 92 units wide
  const SWIRL = 20;         // circulation: rows spiral in a little
  const RS = 5;             // throat radius
  const X_IN = 44;          // where rows enter, on the near side of the sheet
  const Y_TOP = -38, Y_BOT = 30;  // rows enter between these; all of them fall in
  const ROWH = 1.12;
  const TEXT = 0.72;        // glyph height, in sheet units
  const DT = 0.05, SUB = 2, DTAU = DT * SUB;
  const DEPTH = 13;         // how far the throat sits below the sheet

  function vel(x, y, o) {
    const k = 1 / (2 * Math.PI * (x * x + y * y));
    o.u = -1 - (SINK * x + SWIRL * y) * k;
    o.v = -(SINK * y - SWIRL * x) * k;
  }

  // RK4 along a streamline until it crosses the throat
  function trace(x, y) {
    const xs = [], ys = [];
    const k1 = {}, k2 = {}, k3 = {}, k4 = {};
    for (let i = 0; i < 12000; i++) {
      if (i % SUB === 0) { xs.push(x); ys.push(y); }
      if (x * x + y * y < RS * RS) {
        if (i % SUB) { xs.push(x); ys.push(y); }
        return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), n: xs.length, len: (xs.length - 1) * DTAU };
      }
      vel(x, y, k1);
      vel(x + (k1.u * DT) / 2, y + (k1.v * DT) / 2, k2);
      vel(x + (k2.u * DT) / 2, y + (k2.v * DT) / 2, k3);
      vel(x + k3.u * DT, y + k3.v * DT, k4);
      x += (DT / 6) * (k1.u + 2 * k2.u + 2 * k3.u + k4.u);
      y += (DT / 6) * (k1.v + 2 * k2.v + 2 * k3.v + k4.v);
      if (x < -80) break;
    }
    return null;           // escaped: not part of the sheet
  }

  const rows = [], streaks = [];
  let tokens = [];
  function buildFlow() {
    for (let y = Y_TOP; y <= Y_BOT + 1e-6; y += ROWH) {
      const p = trace(X_IN, y);
      if (p) { p.yIn = y; rows.push(p); }
    }
    for (let y = Y_TOP + ROWH / 2; y < Y_BOT; y += ROWH) {
      const p = trace(X_IN, y);
      if (p) { p.yIn = y; streaks.push(p); }
    }
    const r = rng(20260514);
    const eqs = EQUATIONS.map((e) => e.split(' '));
    tokens = [];
    rows.forEach((row, ri) => {
      let x = 0;
      const need = row.len + 12;
      while (x < need) {
        for (const t of eqs[Math.floor(r() * eqs.length)]) {
          const spr = sprite(t);
          const w = (spr.w * TEXT) / FS;
          tokens.push({ row: ri, base: x, w, spr });
          x += w + 0.3;
        }
        x += 1.6;
      }
      row.period = x;
      row.phase = r() * x;
    });
  }

  /* ---------------- Camera ---------------- */
  let W = 0, H = 0, DPR = 1, mobile = false;
  const cam = { f: 1, O: [0, 0, 0], U: [0, 0, 0], V: [0, 0, 0], N: [0, 0, 0] };

  function setupCamera() {
    mobile = W < 820;
    cam.f = 1.05 * Math.max(H, W * 0.62);
    const psi = mobile ? 0.6 : 0.74;        // the sheet recedes to the left
    const roll = mobile ? -0.2 : -0.2;
    const cp = Math.cos(psi), sp = Math.sin(psi), cr = Math.cos(roll), sr = Math.sin(roll);
    cam.U = [cp * cr, sr, -sp * cr];
    cam.V = [-cp * sr, cr, sp * sr];
    cam.N = [sp, 0, cp];                     // the well drops away from us
    const hx = W * (mobile ? 0.34 : 0.43), hy = H * (mobile ? 0.27 : 0.35);
    const Zo = mobile ? 60 : 50;
    const Tz = Zo + DEPTH * cam.N[2];
    const T = [((hx - W / 2) * Tz) / cam.f, ((hy - H / 2) * Tz) / cam.f, Tz];
    cam.O = [T[0] - DEPTH * cam.N[0], T[1] - DEPTH * cam.N[1], T[2] - DEPTH * cam.N[2]];
  }

  // sheet point → screen
  function M3(x, y, o) {
    const r = Math.sqrt(x * x + y * y);
    const d = DEPTH * (1 - Math.sqrt(Math.max(0, 1 - RS / Math.max(r, RS))));
    const X = cam.O[0] + x * cam.U[0] + y * cam.V[0] + d * cam.N[0];
    const Y = cam.O[1] + x * cam.U[1] + y * cam.V[1] + d * cam.N[1];
    const Z = cam.O[2] + x * cam.U[2] + y * cam.V[2] + d * cam.N[2];
    if (Z < 2) return false;
    const k = cam.f / Z;
    o.x = W / 2 + X * k; o.y = H / 2 + Y * k; o.z = Z; o.r = r;
    return true;
  }

  /* ---------------- Baking: everything that only depends on the camera ---------------- */
  const heroHole = { pts: [], cx: 0, cy: 0, rad: 0 };
  const P0 = {}, PA = {}, PB = {}, VV = {};
  const FD = 0.12;

  function bakeRow(row) {
    const n = row.n;
    const sx = new Float32Array(n), sy = new Float32Array(n);
    const ja = new Float32Array(n * 2), jb = new Float32Array(n * 2);
    const al = new Float32Array(n), hot = new Uint8Array(n);
    const edge = smooth(Y_TOP, Y_TOP + 7, row.yIn) * smooth(Y_BOT, Y_BOT - 5, row.yIn);
    for (let i = 0; i < n; i++) {
      const x = row.xs[i], y = row.ys[i];
      if (!M3(x, y, P0)) continue;
      vel(x, y, VV);
      const s = Math.hypot(VV.u, VV.v) || 1;
      const ax = -VV.u / s, ay = -VV.v / s;          // reading direction: upstream
      if (!M3(x + ax * s * FD, y + ay * s * FD, PA) || !M3(x - (ay / s) * FD, y + (ax / s) * FD, PB)) continue;
      const jax = (PA.x - P0.x) / FD, jay = (PA.y - P0.y) / FD;
      const jbx = (PB.x - P0.x) / FD, jby = (PB.y - P0.y) / FD;
      // back faces of the funnel: we'd be reading the sheet from behind
      if (jax * jby - jay * jbx <= 0) continue;
      sx[i] = P0.x; sy[i] = P0.y;
      ja[2 * i] = jax; ja[2 * i + 1] = jay; jb[2 * i] = jbx; jb[2 * i + 1] = jby;
      const heat = Math.min(1, (RS / P0.r) ** 1.6);
      const far = clamp(1.5 - P0.z / 70, 0.35, 1);
      al[i] = edge * far * (0.42 + 0.58 * heat) * smooth(RS * 1.02, RS * 1.25, P0.r);
      hot[i] = heat > 0.3 ? 1 : 0;
    }
    Object.assign(row, { sx, sy, ja, jb, al, hot });
  }

  function bakeStreak(st) {
    const pts = [];
    for (let i = 0; i < st.n; i += 2) {
      const x = st.xs[i], y = st.ys[i];
      const r = Math.hypot(x, y);
      if (r > RS * 6) continue;
      if (!M3(x, y, P0)) continue;
      // facing test via the same Jacobian sign as the text
      vel(x, y, VV);
      const s = Math.hypot(VV.u, VV.v) || 1;
      const ax = -VV.u / s, ay = -VV.v / s;
      if (!M3(x + ax * FD, y + ay * FD, PA) || !M3(x - ay * FD, y + ax * FD, PB)) continue;
      const det = (PA.x - P0.x) * (PB.y - P0.y) - (PA.y - P0.y) * (PB.x - P0.x);
      pts.push({ x: P0.x, y: P0.y, tau: (st.n - 1 - i) * DTAU, heat: Math.min(1, (RS / r) ** 1.5), vis: det > 0, i });
    }
    st.pts = pts;
  }

  function bake() {
    setupCamera();
    rows.forEach(bakeRow);
    streaks.forEach(bakeStreak);
    // the throat
    const pts = []; let cx = 0, cy = 0;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      M3(RS * Math.cos(a), RS * Math.sin(a), P0);
      pts.push([P0.x, P0.y]); cx += P0.x; cy += P0.y;
    }
    cx /= pts.length; cy /= pts.length;
    let rad = 0;
    for (const p of pts) rad += Math.hypot(p[0] - cx, p[1] - cy);
    heroHole.pts = pts.map(([x, y]) => [x - cx, y - cy]);
    heroHole.cx = cx; heroHole.cy = cy; heroHole.rad = rad / pts.length;
  }

  /* ---------------- Stars ---------------- */
  let stars = [], galaxy = null;
  function buildStars() {
    const r = rng(7);
    const n = Math.round((W * H) / 2100);
    stars = Array.from({ length: n }, () => {
      const big = r() < 0.05;
      return {
        x: r(), y: r(),
        s: big ? 0.9 + r() * 0.9 : 0.35 + r() * 0.55,
        a: big ? 0.8 + r() * 0.2 : 0.22 + r() * 0.5,
        ph: r() * 6.28, sp: 0.4 + r() * 1.6,
        warm: r() < 0.14,
      };
    });
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

  function drawStars(g, t, hole) {
    const E = gl ? 0 : hole.rad * 1.5, E2 = 4 * E * E;   // with WebGL the ray tracer lenses them
    const drift = t * 0.0035;
    for (const st of stars) {
      const x = ((st.x + drift * (0.4 + st.s * 0.3)) % 1) * (W + 40) - 20;
      const y = st.y * H;
      const dx = x - hole.cx, dy = y - hole.cy;
      const beta = Math.hypot(dx, dy) + 1e-3;
      const tw = st.a * (0.72 + 0.28 * Math.sin(st.ph + t * st.sp));
      const root = Math.sqrt(beta * beta + E2);
      const thp = 0.5 * (beta + root);
      const ux = dx / beta, uy = dy / beta;
      const mag = Math.min(7, thp / beta);
      g.fillStyle = st.warm ? '#ffd6a0' : '#e2ecff';
      drawStar(g, hole.cx + ux * thp, hole.cy + uy * thp, st.s, Math.min(1, tw * Math.sqrt(mag)), mag, ux, uy);
      // the counter-image, on the far side of the hole
      const thm = 0.5 * (beta - root);
      if (-thm > hole.rad * 1.04 && beta < E * 2.5) {
        drawStar(g, hole.cx + ux * thm, hole.cy + uy * thm, st.s, tw * 0.6 * Math.min(1, -thm / beta), Math.min(7, -thm / beta), ux, uy);
      }
    }
    g.globalAlpha = 1;
    if (galaxy) {
      g.globalAlpha = 0.85;
      g.drawImage(galaxy, W * (mobile ? 0.05 : 0.16), H * (mobile ? 0.08 : 0.12), 120, 60);
      g.globalAlpha = 1;
    }
  }
  function drawStar(g, x, y, s, a, mag, ux, uy) {
    if (a < 0.02) return;
    g.globalAlpha = a;
    if (mag < 1.15) {
      g.fillRect(x - s, y - s, s * 2, s * 2);
    } else {
      // lensed images are stretched along the ring
      g.beginPath();
      g.ellipse(x, y, s * Math.min(mag, 6), s, Math.atan2(uy, ux) + Math.PI / 2, 0, 6.2832);
      g.fill();
    }
    if (s > 1.3) {
      g.globalAlpha = a * 0.28;
      g.fillRect(x - s * 4, y - 0.35, s * 8, 0.7);
      g.fillRect(x - 0.35, y - s * 4, 0.7, s * 8);
    }
  }


  /* ---------------- Canvases ---------------- */
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const bloomA = document.createElement('canvas'), bactx = bloomA.getContext('2d');
  const bloomB = document.createElement('canvas'), bbctx = bloomB.getContext('2d');

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = back.clientWidth; H = back.clientHeight;
    for (const c of [back, layer]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    GDPR = Math.min(window.devicePixelRatio || 1, 1.5);
    if (lensCanvas) { lensCanvas.width = Math.round(W * GDPR); lensCanvas.height = Math.round(H * GDPR); }
    bloomA.width = Math.max(1, Math.round(W / 4)); bloomA.height = Math.max(1, Math.round(H / 4));
    bloomB.width = Math.max(1, Math.round(W / 12)); bloomB.height = Math.max(1, Math.round(H / 12));
    buildStars();
    bake();
  }

  /* ---------------- The sheet ---------------- */
  let flow = 0;

  function drawTokens(g, ox, oy) {
    const k = (DPR * TEXT) / FS;
    const W1 = W + 100, H1 = H + 100;
    for (const tk of tokens) {
      const row = rows[tk.row];
      const t0 = (((tk.base - flow + row.phase) % row.period) + row.period) % row.period;
      if (t0 + tk.w > row.len) continue;
      const tc = t0 + tk.w * 0.5;
      const fi = row.n - 1 - tc / DTAU;
      const i0 = fi | 0, i1 = Math.min(i0 + 1, row.n - 1), f = fi - i0;
      const a0 = row.al[i0], a1 = row.al[i1];
      if (a0 === 0 || a1 === 0) continue;
      const x = lerp(row.sx[i0], row.sx[i1], f), y = lerp(row.sy[i0], row.sy[i1], f);
      if (x < -100 || x > W1 || y < -100 || y > H1) continue;
      const jax = lerp(row.ja[2 * i0], row.ja[2 * i1], f), jay = lerp(row.ja[2 * i0 + 1], row.ja[2 * i1 + 1], f);
      const jbx = lerp(row.jb[2 * i0], row.jb[2 * i1], f), jby = lerp(row.jb[2 * i0 + 1], row.jb[2 * i1 + 1], f);
      const lb = Math.hypot(jbx, jby) * TEXT;
      if (lb < 1.8) continue;
      const alpha = lerp(a0, a1, f) * smooth(1.8, 4.5, lb) * smooth(row.len, row.len - 6, t0 + tk.w);
      if (alpha < 0.02) continue;
      g.globalAlpha = alpha;
      g.setTransform(jax * k, jay * k, jbx * k, jby * k, (x + ox) * DPR, (y + oy) * DPR);
      g.drawImage(tk.spr.tints[row.hot[i0]], -tk.spr.w / 2, -BASE);
    }
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalAlpha = 1;
  }

  // filaments of light running down the flow into the throat
  const BUCKETS = 8;
  function drawStreaks(g, ox, oy) {
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    for (const st of streaks) {
      const pts = st.pts;
      for (let j = 1; j < pts.length; j++) {
        const p = pts[j - 1], q = pts[j];
        if (!p.vis || !q.vis || q.i - p.i > 2) continue;
        const pulse = 0.5 + 0.5 * Math.sin((q.tau + flow) * 0.55 + st.yIn * 1.7);
        const v = q.heat * (0.3 + 0.7 * pulse);
        const b = Math.min(BUCKETS - 1, Math.floor(v * BUCKETS));
        if (b < 1) continue;
        paths[b].moveTo(p.x + ox, p.y + oy); paths[b].lineTo(q.x + ox, q.y + oy);
      }
    }
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let b = 1; b < BUCKETS; b++) {
      g.strokeStyle = `rgba(210,230,255,${((b / BUCKETS) * 0.75).toFixed(3)})`;
      g.lineWidth = 0.5 + b * 0.22;
      g.stroke(paths[b]);
    }
    g.globalCompositeOperation = 'source-over';
  }


  /* ---------------- The hole ---------------- */
  const HERO_INCL = 1.36, HERO_ROLL = -0.28;   // disk tipped to follow the sheet
  const B_CRIT = 2.598;     // 3√3/2: the shadow's radius, in r_s
  function holeAt(scroll) {
    const cx = heroHole.cx, cy = heroHole.cy - scroll;
    const rad = heroHole.rad * (gl ? 0.85 : 1);
    return {
      cx, cy, rad, u: 0, ox: 0, oy: -scroll,
      pts: heroHole.pts.map(([x, y]) => [cx + x, cy + y]),
      incl: HERO_INCL, roll: HERO_ROLL, gain: 2.6, rout: 10, R: (rad / B_CRIT) * 13,
    };
  }

  function polyPath(pts) {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }

  function drawHorizon(g, hole, t) {
    const { cx, cy, rad } = hole;
    const glow = g.createRadialGradient(cx, cy, rad * 0.9, cx, cy, rad * 3);
    glow.addColorStop(0, 'rgba(160,205,255,.2)');
    glow.addColorStop(0.35, 'rgba(90,130,220,.06)');
    glow.addColorStop(1, 'rgba(60,90,180,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = glow;
    g.fillRect(cx - rad * 3, cy - rad * 3, rad * 6, rad * 6);
    g.globalCompositeOperation = 'source-over';

    const shape = polyPath(hole.pts);
    g.fillStyle = '#000';
    g.fill(shape);

    // photon ring, brighter on the side swinging toward us
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const n = hole.pts.length, segs = 5;
    const paths = Array.from({ length: segs }, () => new Path2D());
    for (let i = 0; i < n; i++) {
      const [x0, y0] = hole.pts[i], [x1, y1] = hole.pts[(i + 1) % n];
      const ang = Math.atan2((y0 + y1) / 2 - cy, (x0 + x1) / 2 - cx);
      const beam = 0.5 + 0.5 * Math.cos(ang - 2.5);
      const b = Math.min(segs - 1, Math.floor(beam * segs));
      paths[b].moveTo(x0, y0); paths[b].lineTo(x1, y1);
    }
    for (let b = 0; b < segs; b++) {
      const k = 0.3 + 0.7 * ((b + 0.5) / segs);
      for (const [w, a] of [[20, 0.05], [8, 0.13], [3.2, 0.4], [1.3, 1]]) {
        g.lineWidth = w * (0.75 + 0.45 * k);
        g.strokeStyle = `rgba(216,235,255,${(a * k).toFixed(3)})`;
        g.stroke(paths[b]);
      }
    }

    // gas orbiting just outside the ring, once the hole has risen
    if (hole.u > 0.02) {
      for (let i = 0; i < 7; i++) {
        const ri = rad * (1.07 + i * 0.075);
        const w = 1.1 * (rad / ri) ** 1.5;            // Keplerian: inner orbits run faster
        const a0 = t * w * 0.6 + i * 2.1;
        const span = 0.7 + ((i * 0.37) % 0.8);
        for (let s = 0; s < 6; s++) {
          const a = a0 + (span * s) / 6;
          const beam = 0.5 + 0.5 * Math.cos(a - 2.5);
          g.strokeStyle = `rgba(200,225,255,${(hole.u * (0.08 + 0.32 * beam) * (1 - i / 8) * Math.sin((Math.PI * (s + 0.5)) / 6)).toFixed(3)})`;
          g.lineWidth = 1.1;
          g.beginPath(); g.arc(cx, cy, ri, a, a + span / 6 + 0.01); g.stroke();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }


  /* ---------------- The hole, ray-traced ----------------
     Every pixel near the hole fires a photon back into a Schwarzschild
     spacetime (r_s = 1) and integrates its path with the exact orbit equation
     in Cartesian form, a = −(3/2) h² r̂ / r⁴. Along the way it can meet
       · the accretion disk: Keplerian gas (and rings of equations), its light
         Doppler-beamed ∝ g⁴ and gravitationally redshifted
       · the horizon: b < 3√3/2 r_s and it never comes back — the shadow
     and if it escapes, it lands on the sky (the sheet of equations and the
     stars) wherever its bent path ends: lensing, Einstein rings, photon ring. */
  const lensCanvas = document.querySelector('.lens');
  let gl = null, GDPR = 1, lensProg = null, quadBuf = null, bgTex = null, diskTex = null;
  const LU = {};
  const bgPatch = document.createElement('canvas'), bgpctx = bgPatch.getContext('2d');

  const LENS_VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  const LENS_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uBg, uDisk;
uniform vec2 uView, uC, uBgO, uBgS;
uniform float uDpr, uRs, uR, uT, uIncl, uRoll, uROut, uL, uGain;
const float RIN = 3.0;               // innermost stable circular orbit
const float PI = 3.14159265;

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

vec3 sky(vec2 css) {
  vec2 uv = (css - uBgO) / uBgS;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return texture2D(uBg, uv).rgb;
}

vec4 disk(vec3 q, vec3 dir, float r, vec3 n) {
  vec3 e1 = vec3(1.0, 0.0, 0.0), e2 = cross(n, e1);
  float phi = atan(dot(q, e2), dot(q, e1));
  float s = (r - RIN) / (uROut - RIN);
  float rc = RIN + (floor(s * 9.0) + 0.5) / 9.0 * (uROut - RIN);   // each ring of text orbits rigidly
  float omega = sqrt(0.5 / (rc * rc * rc));                         // Kepler, M = r_s / 2
  vec4 m = texture2D(uDisk, vec2(fract((phi - omega * uT) / (2.0 * PI)), s));
  float beta = sqrt(0.5 / (r - 1.0));                               // orbital speed
  float gam = 1.0 / sqrt(1.0 - beta * beta);
  float dop = 1.0 / (gam * (1.0 + beta * dot(normalize(cross(n, q)), dir)));
  float g = dop * sqrt(1.0 - 1.0 / r);                              // Doppler × gravitational shift
  float x = RIN / r;
  float I = x * x * x * (1.0 - sqrt(x)) * 16.0 * pow(g, 4.0);       // thin-disk flux, beamed
  vec3 tint = mix(vec3(0.26, 0.4, 1.0), vec3(0.93, 0.97, 1.0), smoothstep(0.55, 1.3, g));
  vec3 col = tint * I * (0.15 + 0.85 * m.r + 1.5 * m.g) * uGain;
  float a = clamp(0.2 + 0.55 * m.r + 0.65 * m.g, 0.0, 0.92);
  a *= smoothstep(RIN, RIN + 0.35, r) * (1.0 - smoothstep(uROut - 2.5, uROut, r));
  return vec4(col * a, a);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 d = css - uC;
  float dist = length(d);
  if (dist > uR) discard;
  float alpha = 1.0 - smoothstep(0.9 * uR, uR, dist);
  float w = 1.0 - smoothstep(0.5, 0.95, dist / uR);     // lens fades out toward the edge of the patch

  vec2 b = rot(d, -uRoll) / uRs;
  vec3 p = vec3(b, -30.0), v = vec3(0.0, 0.0, 1.0);
  float h2 = dot(b, b);
  vec3 n = vec3(0.0, -sin(uIncl), -cos(uIncl));
  vec3 col = vec3(0.0);
  float acc = 0.0, rmin = 1e3;
  bool captured = false;
  for (int i = 0; i < 240; i++) {
    float r2 = dot(p, p), r = sqrt(r2);
    rmin = min(rmin, r);
    if (r < 1.0) { captured = true; break; }
    if (r > 34.0 && dot(p, v) > 0.0) break;
    float dt = clamp(0.07 * r, 0.012, 2.0);
    vec3 vh = v - 0.75 * dt * h2 * p / (r2 * r2 * r);
    vec3 pn = p + dt * vh;
    float rn2 = dot(pn, pn);
    v = vh - 0.75 * dt * h2 * pn / (rn2 * rn2 * sqrt(rn2));
    float s0 = dot(p, n), s1 = dot(pn, n);
    if (s0 * s1 < 0.0 && acc < 0.98) {
      vec3 q = mix(p, pn, s0 / (s0 - s1));
      float rq = length(q);
      if (rq > RIN && rq < uROut) {
        vec4 e = disk(q, normalize(v), rq, n);
        col += e.rgb * (1.0 - acc);
        acc += e.a * (1.0 - acc);
      }
    }
    p = pn;
  }
  vec3 bg = vec3(0.0);
  if (!captured) {
    vec3 vd = normalize(v);
    // where the bent ray meets the sky plane, uL behind the hole
    vec2 src = (p + vd * (uL - p.z) / max(vd.z, 0.2)).xy;
    // rays bent past the patch wrap back onto its edge: light circling the rim
    float edge = 0.92 * uR / uRs, ls = length(src);
    if (ls > edge) src *= edge / ls;
    bg = sky(uC + rot(b + (src - b) * w, uRoll) * uRs) * (vd.z > 0.2 ? 1.0 : 0.6) * (1.0 - 0.55 * smoothstep(edge, 2.5 * edge, ls));
    bg += vec3(0.78, 0.88, 1.0) * exp(-(rmin - 1.5) * 10.0) * 0.9;   // grazed the photon sphere
  }
  vec3 c = bg * (1.0 - acc) + (1.0 - exp(-col * 1.3));
  gl_FragColor = vec4(c * alpha, alpha);
}`;

  // gas filaments along the orbits (red) and rings of equations (green)
  function buildDiskTexture() {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 256);
    g.globalCompositeOperation = 'lighter';
    const r = rng(42);
    const streak = (x, y, len, w, a) => {
      const grad = g.createLinearGradient(x, 0, x + len, 0);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(0.5, `rgba(255,0,0,${a})`);
      grad.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = grad; g.fillRect(x, y, len, w);
    };
    for (let i = 0; i < 320; i++) {
      const x = r() * 2048, y = r() * 256, len = 60 + r() * 1000, w = 0.5 + r() * 2.4, a = 0.12 + r() * 0.6;
      streak(x, y, len, w, a);
      if (x + len > 2048) streak(x - 2048, y, len, w, a);
    }
    const k = 18 / FS;
    for (let row = 0; row < 9; row++) {
      const base = ((row + 0.5) / 9) * 256 + 6;
      let x = r() * 200;
      while (x < 2048) {
        const { runs, w } = layoutRuns(EQUATIONS[Math.floor(r() * EQUATIONS.length)]);
        g.save(); g.translate(x, base); g.scale(k, k);
        g.fillStyle = `rgba(0,255,0,${0.65 + r() * 0.35})`;
        for (const run of runs) { g.font = run.font; g.fillText(run.t, run.x, run.dy); }
        g.restore();
        x += w * k + 30 + r() * 60;
      }
    }
    return c;
  }

  function program(vsSrc, fsSrc, attribs) {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, vsSrc), fs = shader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p);
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
    console.warn(gl.getProgramInfoLog(p));
    return null;
  }

  function initGL() {
    if (!lensCanvas) return;
    try { gl = lensCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false }); }
    catch (e) { gl = null; }
    if (!gl) return;
    lensProg = program(LENS_VERT, LENS_FRAG, ['aPos']);
    if (!lensProg) { gl = null; return; }
    for (const k of ['uBg', 'uDisk', 'uView', 'uC', 'uBgO', 'uBgS', 'uDpr', 'uRs', 'uR', 'uT', 'uIncl', 'uRoll', 'uROut', 'uL', 'uGain']) {
      LU[k] = gl.getUniformLocation(lensProg, k);
    }
    quadBuf = gl.createBuffer();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const tex = (wrap) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    bgTex = tex(gl.CLAMP_TO_EDGE);
    diskTex = tex(gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildDiskTexture());
    lensCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; });
  }

  // the patch of sky the photons can land on
  function uploadSky(x0, y0, w, h) {
    const pw = Math.max(2, Math.ceil(w * GDPR)), ph = Math.max(2, Math.ceil(h * GDPR));
    if (bgPatch.width !== pw || bgPatch.height !== ph) { bgPatch.width = pw; bgPatch.height = ph; }
    bgpctx.fillStyle = '#020308';
    bgpctx.fillRect(0, 0, pw, ph);
    const kx = pw / w, ky = ph / h;
    const sx = Math.max(0, x0), sy = Math.max(0, y0), ex = Math.min(W, x0 + w), ey = Math.min(H, y0 + h);
    if (ex > sx && ey > sy) {
      bgpctx.drawImage(back, sx * DPR, sy * DPR, (ex - sx) * DPR, (ey - sy) * DPR, (sx - x0) * kx, (sy - y0) * ky, (ex - sx) * kx, (ey - sy) * ky);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgPatch);
  }

  function clearLens() {
    gl.viewport(0, 0, lensCanvas.width, lensCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function drawLens(hole, t) {
    const x0 = Math.floor(hole.cx - hole.R), y0 = Math.floor(hole.cy - hole.R), size = Math.ceil(2 * hole.R);
    uploadSky(x0, y0, size, size);
    clearLens();
    gl.useProgram(lensProg);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, diskTex);
    gl.uniform1i(LU.uBg, 0); gl.uniform1i(LU.uDisk, 1);
    gl.uniform2f(LU.uView, W, H);
    gl.uniform1f(LU.uDpr, GDPR);
    gl.uniform2f(LU.uC, hole.cx, hole.cy);
    gl.uniform1f(LU.uRs, hole.rad / B_CRIT);
    gl.uniform1f(LU.uR, hole.R);
    gl.uniform1f(LU.uT, t * 2.6);
    gl.uniform1f(LU.uIncl, hole.incl);
    gl.uniform1f(LU.uRoll, hole.roll);
    gl.uniform1f(LU.uROut, hole.rout);
    gl.uniform1f(LU.uL, 10);
    gl.uniform1f(LU.uGain, hole.gain);
    gl.uniform2f(LU.uBgO, x0, y0);
    gl.uniform2f(LU.uBgS, size, size);
    const l = (x0 / W) * 2 - 1, r = ((x0 + size) / W) * 2 - 1, tp = 1 - (y0 / H) * 2, bt = 1 - ((y0 + size) / H) * 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([l, bt, r, bt, l, tp, r, tp]), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }


  // the dark wash behind the hero copy, drawn into the sky so the lens sees it too
  function drawVignette(g, heroBottom) {
    if (heroBottom < -0.2 * H) return;
    g.save();
    if (!mobile) {
      g.translate(0, heroBottom);
      g.scale(W * 0.62, Math.max(1, hero.clientHeight) * 0.68);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, 'rgba(2,3,8,.92)'); gr.addColorStop(0.45, 'rgba(2,3,8,.72)'); gr.addColorStop(0.8, 'rgba(2,3,8,0)');
      g.fillStyle = gr;
      g.fillRect(0, -1, 1, 2);
    } else {
      const top = heroBottom - H * 0.62, end = heroBottom + H * 0.15;
      const gr = g.createLinearGradient(0, top, 0, end);
      gr.addColorStop(0, 'rgba(2,3,8,0)'); gr.addColorStop(0.42, 'rgba(2,3,8,.8)');
      gr.addColorStop(0.8, 'rgba(2,3,8,.85)'); gr.addColorStop(1, 'rgba(2,3,8,0)');
      g.fillStyle = gr;
      g.fillRect(0, top, W, end - top);
    }
    g.restore();
  }


  /* ---------------- Frame ---------------- */
  let last = 0, lensClear = false;
  function render(now) {
    if (W < 2 || H < 2) return;
    const t = now / 1000;
    const dt = Math.min(0.05, last ? t - last : 0);
    last = t;
    if (!reduceMotion) flow += dt * 0.5;

    const scroll = Math.max(0, window.scrollY);
    const heroBottom = hero.clientHeight - scroll;
    const hole = holeAt(scroll);

    // the sky: stars and the galaxy stay put; the sheet and its glow go with the hero
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, back.width, back.height);
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.fillStyle = '#020308';
    bctx.fillRect(0, 0, W, H);
    if (heroBottom > 0) {
      const neb = bctx.createRadialGradient(hole.cx, hole.cy, hole.rad, hole.cx, hole.cy, Math.max(W, H) * 0.6);
      neb.addColorStop(0, 'rgba(60,100,180,.22)');
      neb.addColorStop(0.3, 'rgba(30,60,130,.06)');
      neb.addColorStop(1, 'rgba(10,20,50,0)');
      bctx.fillStyle = neb; bctx.fillRect(0, 0, W, heroBottom);
    }
    drawStars(bctx, t, hole);

    if (heroBottom > 0) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawStreaks(lctx, hole.ox, hole.oy);
      drawTokens(lctx, hole.ox, hole.oy);
      // the sheet ends with the hero: fade it out over its last stretch
      const fade = lctx.createLinearGradient(0, heroBottom - 160, 0, heroBottom);
      fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      lctx.globalCompositeOperation = 'destination-out';
      lctx.fillStyle = fade; lctx.fillRect(0, heroBottom - 160, W, 160);
      lctx.fillStyle = '#000'; lctx.fillRect(0, heroBottom, W, Math.max(0, H - heroBottom));
      lctx.globalCompositeOperation = 'source-over';

      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.drawImage(layer, 0, 0);
      // cheap bloom: downsample twice and add back
      bactx.clearRect(0, 0, bloomA.width, bloomA.height);
      bactx.drawImage(layer, 0, 0, bloomA.width, bloomA.height);
      bbctx.clearRect(0, 0, bloomB.width, bloomB.height);
      bbctx.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      bctx.globalCompositeOperation = 'lighter';
      bctx.globalAlpha = 0.55; bctx.drawImage(bloomA, 0, 0, back.width, back.height);
      bctx.globalAlpha = 0.8; bctx.drawImage(bloomB, 0, 0, back.width, back.height);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawVignette(bctx, heroBottom);
    }

    if (gl) {
      if (hole.cy + hole.R > 0) { drawLens(hole, t); lensClear = false; }
      else if (!lensClear) { clearLens(); lensClear = true; }
    } else if (hole.cy + hole.R > 0) {
      drawHorizon(bctx, hole, t);
    }
  }

  /* ---------------- Main loop ---------------- */
  let running = false, raf = 0;
  const frame = (now) => { render(now); raf = document.hidden ? 0 : requestAnimationFrame(frame); };
  const kick = () => { if (running && !raf && !document.hidden) raf = requestAnimationFrame(frame); };

  let lastW = 0, lastH = 0;
  function start() {
    if (running) return;
    buildFlow();
    initGL();
    resize();
    lastW = W; lastH = H;
    running = true;
    flow = 30;                                   // start mid-stream
    render(performance.now());
    if (reduceMotion) {
      addEventListener('scroll', () => render(performance.now()), { passive: true });
      return;
    }
    document.addEventListener('visibilitychange', kick);
    kick();
  }

  addEventListener('resize', () => {
    if (!running) return;
    const w = back.clientWidth, h = back.clientHeight;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    resize();
    render(performance.now());
  });

  const fontsReady = document.fonts
    ? Promise.all([
        document.fonts.load(`${FS}px "STIX Two Text"`),
        document.fonts.load(`italic ${FS}px "STIX Two Text"`),
      ])
    : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(start, start);
})();
