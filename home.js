// Homepage: a sheet of equations falls into a black hole, and then the page
// falls in after it.
//
// The sheet. Text is laid out along the streamlines of a uniform flow draining
// into a point sink with a little swirl,
//     u = −x̂ − (m r̂ − Γ θ̂) / 2πr,
// so rows run straight far away and wrap into the hole near it. Tokens ride the
// flow; because the flow is incompressible each one is stretched along the
// stream and squeezed across it as it speeds up (spaghettification, for free).
// The sheet is then pulled into a funnel of depth ∝ 1 − √(1 − r_s/r), the
// Schwarzschild redshift factor, which turns vertical at the throat. Faces of
// the funnel that point away from us are culled, so text drops over the lip
// and out of sight.
//
// The hole itself is ray-traced on the GPU (see "The hole, ray-traced"):
// photons bend around a Schwarzschild black hole, so the sheet and the stars
// are lensed into rings, a photon ring hugs the shadow, and a thin accretion
// disk of equations is lifted over the top of it, brighter on the side that
// swings toward us.
//
// Scrolling. The hole rises with the page and settles under the nav; from then
// on the page is matter streaming into it. Each point of the page follows an
// exact Schwarzschild geodesic, its light is redshifted on the way out and bent
// by the ray tracer (see "The page, falling in"). Scroll position is the
// distant observer's clock, so scrolling back up runs it all backwards.
(() => {
  'use strict';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const back = document.querySelector('.spacetime');
  const front = document.querySelector('.horizon-layer');
  const hero = document.querySelector('.hero');
  const nav = document.querySelector('.topnav');
  if (!back || !front || !hero) return;
  const bctx = back.getContext('2d');
  const fctx = front.getContext('2d');

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
    for (const c of [back, front, layer]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
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

  /* ---------------- The hole: in the sheet, then pinned to the top ---------------- */
  const HERO_INCL = 1.36, HERO_ROLL = -0.28;   // disk tipped to follow the sheet
  function holeAt(scroll) {
    const rTop = clamp(Math.min(W, H) * 0.085, 34, 80);
    const yTop = rTop * 1.7 + (mobile ? 54 : 64);  // room for the lensed arc above
    const travel = Math.max(1, heroHole.cy - yTop);
    const moved = Math.min(scroll, travel);
    const u = clamp(scroll / travel);
    const e = u * u * (3 - 2 * u);
    const cx = lerp(heroHole.cx, W / 2, e), cy = heroHole.cy - moved;
    const pts = heroHole.pts.map(([x, y], i) => {
      const a = (i / heroHole.pts.length) * Math.PI * 2;
      return [cx + lerp(x, Math.cos(a) * rTop, e), cy + lerp(y, Math.sin(a) * rTop, e)];
    });
    const rad = lerp(heroHole.rad * (gl ? 0.85 : 1), rTop, e);
    return {
      pts, cx, cy, rad, u, travel, pinned: scroll >= travel, ox: cx - heroHole.cx, oy: -moved,
      incl: lerp(HERO_INCL, 1.45, e), roll: lerp(HERO_ROLL, -0.06, e), gain: lerp(2.6, 2.2, e),
      rout: lerp(10, 8, e), R: (rad / B_CRIT) * lerp(13, 10.5, e),
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
       · the page: a face-on sheet through the hole, carrying whatever has
         scrolled into it (see "The page, falling in")
       · the horizon: b < 3√3/2 r_s and it never comes back — the shadow
     and if it escapes, it lands on the sky (the sheet of equations and the
     stars) wherever its bent path ends: lensing, Einstein rings, photon ring. */
  const lensCanvas = document.querySelector('.lens');
  let gl = null, GDPR = 1;
  let lensProg = null, warpProg = null, debrisProg = null, instancing = null;
  const LU = {}, WU = {}, DU = {};
  let cellBuf = null, lagBuf = null, dotBuf = null, geoTex = null, cellCount = 0, cellKey = '';
  let quadBuf = null, meshBuf = null, idxBuf = null, meshCount = 0;
  let bgTex = null, diskTex = null, contentTex = null, pageTex = null, pageFB = null, pageW = 0, pageH = 0;
  const bgPatch = document.createElement('canvas'), bgpctx = bgPatch.getContext('2d');
  const B_CRIT = 2.598;     // 3√3/2: the shadow's radius, in r_s

  const LENS_VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  const LENS_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uBg, uDisk, uPage;
uniform vec2 uView, uC, uBgO, uBgS, uPageS;
uniform float uDpr, uRs, uR, uT, uIncl, uRoll, uROut, uL, uGain, uPageOn, uBand, uBandB, uS;
const float RIN = 3.0;               // innermost stable circular orbit
const float PI = 3.14159265;

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

vec3 sky(vec2 css) {
  vec2 uv = (css - uBgO) / uBgS;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return texture2D(uBg, uv).rgb;
}

vec4 page(vec2 css) {
  vec2 uv = vec2(css.x / uPageS.x, 1.0 - css.y / uPageS.y);
  if (uPageOn < 0.5 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uPage, uv);
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
  float alpha;
  if (uBand > 0.5) {
    alpha = 1.0 - smoothstep(uBandB - 18.0, uBandB, css.y);
  } else {
    if (dist > uR) discard;
    alpha = 1.0 - smoothstep(0.9 * uR, uR, dist);
  }
  if (dist > uR) {                      // beyond the tracer's reach: flat space
    vec4 pg = page(css);
    gl_FragColor = vec4((pg.rgb + (1.0 - pg.a) * sky(css)) * alpha, alpha);
    return;
  }
  // bending is let through in full near the hole and faded out at the seams with flat space
  float wSky = 1.0 - smoothstep(0.5, 0.95, dist / uR);
  float wPage = uS * (1.0 - smoothstep(0.7, 1.0, dist / uR)) * (1.0 - uBand * smoothstep(uBandB - 220.0, uBandB - 10.0, css.y));

  vec2 b = rot(d, -uRoll) / uRs;
  vec3 p = vec3(b, -30.0), v = vec3(0.0, 0.0, 1.0);
  float h2 = dot(b, b);
  vec3 n = vec3(0.0, -sin(uIncl), -cos(uIncl));
  vec3 colD = vec3(0.0), colP = vec3(0.0);
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
    if (acc < 0.98) {
      float s0 = dot(p, n), s1 = dot(pn, n);
      if (s0 * s1 < 0.0) {
        vec3 q = mix(p, pn, s0 / (s0 - s1));
        float rq = length(q);
        if (rq > RIN && rq < uROut) {
          vec4 e = disk(q, normalize(v), rq, n);
          colD += e.rgb * (1.0 - acc);
          acc += e.a * (1.0 - acc);
        }
      }
      if (uPageOn > 0.5 && p.z * pn.z < 0.0) {
        vec3 q = mix(p, pn, p.z / (p.z - pn.z));
        if (dot(q, q) > 1.0) {
          // Weak-field bending alone (x'' = −2Mb/(b² + z²)^{3/2}, from the camera
          // at z = −30 with no slope) lands the ray on the page plane
          // Δ(b) = [b − √(b²+900) + 900/√(b²+900)]/b r_s closer to the hole: a
          // near-constant offset that never dies away. Positions are measured
          // in that lensed frame, so what shows is the strong-field bending.
          float bl = max(length(b), 1e-3), sb = sqrt(bl * bl + 900.0);
          vec2 hit = q.xy + b / bl * (bl - sb + 900.0 / sb) / bl;
          vec4 pg = page(css + (uC + rot(hit, uRoll) * uRs - css) * wPage);
          colP += pg.rgb * (1.0 - acc);
          acc += pg.a * (1.0 - acc);
        }
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
    bg = sky(uC + rot(b + (src - b) * wSky, uRoll) * uRs) * (vd.z > 0.2 ? 1.0 : 0.6) * (1.0 - 0.55 * smoothstep(edge, 2.5 * edge, ls));
    bg += vec3(0.78, 0.88, 1.0) * exp(-(rmin - 1.5) * 10.0) * 0.9;   // grazed the photon sphere
  }
  vec3 c = colP + (1.0 - exp(-colD * 1.3)) + bg * (1.0 - acc);
  gl_FragColor = vec4(c * alpha, alpha);
}`;

  // light climbing out of the well is stretched toward the red and dimmed as g⁴
  const REDSHIFT = `
vec3 redshift(vec3 c, float g) {
  g = clamp(g, 0.0, 1.0);
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  vec3 red = lum * mix(vec3(1.0, 0.16, 0.04), vec3(1.0, 0.58, 0.26), smoothstep(0.4, 0.8, g));
  return mix(red, c, smoothstep(0.8, 0.98, g)) * pow(g, 4.0);
}`;

  // The intact page: the browser's layout drawn onto a mesh whose vertices
  // have been carried along their geodesics. It lets go of the parts that
  // have been inside the tidal radius; the debris pass draws those.
  const WARP_VERT = `
attribute vec2 aPos;
attribute vec2 aUV;
attribute float aG;
attribute float aR;
uniform vec2 uFB;
uniform float uRt, uQ;
varying vec2 vUV;
varying float vG, vI;
void main() {
  vUV = aUV; vG = aG;
  vI = 1.0 - (1.0 - smoothstep(uRt * 0.8, uRt * 1.1, aR)) * uQ;
  gl_Position = vec4(aPos.x / uFB.x * 2.0 - 1.0, 1.0 - aPos.y / uFB.y * 2.0, 0.0, 1.0);
}`;
  const WARP_FRAG = `
precision mediump float;
uniform sampler2D uContent;
varying vec2 vUV;
varying float vG, vI;
${REDSHIFT}
void main() {
  vec4 c = texture2D(uContent, vUV);
  gl_FragColor = vec4(redshift(c.rgb, vG), c.a) * vI;
}`;

  // The debris: one particle per few pixels of the page, coloured by the
  // pixel it came from, at its place on its own geodesic (looked up on the
  // GPU). Drawn as a dot, and as a trail back along the orbit it just flew.
  const debrisVert = () => `
attribute vec2 aCell;      // where on the undisturbed page this particle came from, 0…1
attribute float aLag;      // how far back along its orbit this vertex sits, r_s/c
uniform sampler2D uGeo, uContent;
uniform vec2 uFB, uSrcO, uSrcS, uC;
uniform float uRs, uS, uQ, uRt, uPt, uLagMax;
uniform mediump float uDot;          // shared with the fragment shader: same precision
varying vec4 vCol;
const float NT = ${NT}.0, NB = ${NB}.0, DB = ${DB}, DTT = ${DTT}, U = ${U_IN}, YIN = ${Y_IN}.0;
${REDSHIFT}
vec4 geo(float b, float T) {
  float ab = abs(b);
  if (T <= 0.0 || ab >= (NB - 1.0) * DB) return vec4(b, YIN - U * T, 1.0, 99.0);
  float fi = ab / DB, fj = min(T / DTT, NT - 1.001);
  float i0 = floor(fi), j0 = floor(fj);
  vec2 px = vec2(1.0 / NT, 1.0 / NB);
  vec2 uv = (vec2(j0, i0) + 0.5) * px;
  vec4 a = texture2D(uGeo, uv), b1 = texture2D(uGeo, uv + vec2(px.x, 0.0));
  vec4 c = texture2D(uGeo, uv + vec2(0.0, px.y)), d = texture2D(uGeo, uv + px);
  vec4 r = mix(mix(a, b1, fj - j0), mix(c, d, fj - j0), fi - i0);
  r.x *= b < 0.0 ? -1.0 : 1.0;
  return r;
}
void main() {
  vec2 rel = (uSrcO + aCell * uSrcS - uC) / uRs;
  float T = (YIN - rel.y) / U;
  float torn = (1.0 - smoothstep(uRt * 0.8, uRt * 1.1, geo(rel.x, T).w)) * uQ;
  vec4 at = geo(rel.x, T - aLag);
  vec4 c = texture2D(uContent, aCell);
  float r = length(at.xy);
  float alive = step(1.03, r);                       // frozen onto the horizon: gone from view
  float glow = 1.0 - smoothstep(2.0 * uRt, 3.5 * uRt, r);   // heated at pericentre, cools as it leaves
  vCol = vec4(redshift(c.rgb, at.z), c.a) * torn * alive * glow * (1.0 - aLag / uLagMax);
  vec2 pos = uC + mix(rel, at.xy, uS) * uRs;
  gl_Position = vec4(pos.x / uFB.x * 2.0 - 1.0, 1.0 - pos.y / uFB.y * 2.0, 0.0, 1.0);
  // invisible dots are moved off screen (trails just fade: moving one end would drag a line across)
  if (uDot > 0.5 && vCol.a < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = uPt;
}`;
  const DEBRIS_FRAG = `
precision mediump float;
uniform float uDot;
varying vec4 vCol;
void main() {
  float k = uDot > 0.5 ? 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5)) : 0.55;
  gl_FragColor = vCol * k;
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
    warpProg = program(WARP_VERT, WARP_FRAG, ['aPos', 'aUV', 'aG', 'aR']);
    if (!lensProg || !warpProg) { gl = null; return; }
    // debris needs float textures read from the vertex shader, and instancing
    instancing = gl.getExtension('ANGLE_instanced_arrays');
    if (instancing && gl.getExtension('OES_texture_float') && gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) >= 2) {
      debrisProg = program(debrisVert(), DEBRIS_FRAG, ['aCell', 'aLag']);
    }
    if (debrisProg) {
      for (const k of ['uGeo', 'uContent', 'uFB', 'uSrcO', 'uSrcS', 'uC', 'uRs', 'uS', 'uQ', 'uRt', 'uPt', 'uLagMax', 'uDot']) {
        DU[k] = gl.getUniformLocation(debrisProg, k);
      }
      cellBuf = gl.createBuffer(); lagBuf = gl.createBuffer(); dotBuf = gl.createBuffer();
    }
    for (const k of ['uBg', 'uDisk', 'uPage', 'uView', 'uC', 'uBgO', 'uBgS', 'uPageS', 'uDpr', 'uRs', 'uR', 'uT',
      'uIncl', 'uRoll', 'uROut', 'uL', 'uGain', 'uPageOn', 'uBand', 'uBandB', 'uS']) {
      LU[k] = gl.getUniformLocation(lensProg, k);
    }
    WU.uFB = gl.getUniformLocation(warpProg, 'uFB');
    WU.uContent = gl.getUniformLocation(warpProg, 'uContent');
    WU.uRt = gl.getUniformLocation(warpProg, 'uRt');
    WU.uQ = gl.getUniformLocation(warpProg, 'uQ');
    quadBuf = gl.createBuffer(); meshBuf = gl.createBuffer(); idxBuf = gl.createBuffer();
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
    contentTex = tex(gl.CLAMP_TO_EDGE);
    pageTex = tex(gl.CLAMP_TO_EDGE);
    diskTex = tex(gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildDiskTexture());
    pageFB = gl.createFramebuffer();
    if (debrisProg) {
      geoTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, geoTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
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

  function drawLens(hole, t, band) {
    let x0, y0, w, h;
    if (band) { x0 = 0; y0 = 0; w = W; h = band.bottom; }
    else { x0 = Math.floor(hole.cx - hole.R); y0 = Math.floor(hole.cy - hole.R); w = h = Math.ceil(2 * hole.R); }
    uploadSky(x0, y0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, lensCanvas.width, lensCanvas.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(lensProg);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, diskTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, pageTex);
    gl.uniform1i(LU.uBg, 0); gl.uniform1i(LU.uDisk, 1); gl.uniform1i(LU.uPage, 2);
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
    gl.uniform2f(LU.uBgS, w, h);
    gl.uniform1f(LU.uPageOn, band ? 1 : 0);
    gl.uniform2f(LU.uPageS, W, band ? band.bottom : 1);
    gl.uniform1f(LU.uBand, band ? 1 : 0);
    gl.uniform1f(LU.uBandB, band ? band.bottom : 0);
    gl.uniform1f(LU.uS, band ? band.s : 0);
    const l = (x0 / W) * 2 - 1, r = ((x0 + w) / W) * 2 - 1, tp = 1 - (y0 / H) * 2, bt = 1 - ((y0 + h) / H) * 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([l, bt, r, bt, l, tp, r, tp]), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------------- The page, falling in ----------------
     Once the hole has settled at the top, the page is treated as a sheet of
     matter streaming up toward it at U_IN (in units of c), lying in the plane
     through the hole that faces us. Every point of it is a massive test
     particle on an exact Schwarzschild geodesic,
         d²r/dτ² = −1/2r² + L²/r³ − 3L²/2r⁴,   dφ/dτ = L/r²,   dt/dτ = E/(1 − 1/r),
     with E and L fixed by where it enters and how fast it is moving there, and
     it is drawn where it is at the coordinate time t of a distant observer
     (us); scrolling is that clock.

     Tidal disruption. While its path stays outside the tidal radius R_T the
     page holds together and is drawn as a continuous sheet (neighbouring
     points on neighbouring orbits: it stretches, it doesn't tear). Once a
     point has been inside R_T, the hole's tidal pull has beaten whatever held
     it to its neighbours: it is debris, drawn as a particle of exactly its own
     colour, trailing the last stretch of its own orbit. Debris on nearly
     critical orbits (L ≈ 2 r_s c) whirls round the hole a few times before
     plunging, so the stream wraps the horizon in strands: spaghetti.

     From out here nothing ever crosses: as r → r_s the debris slows, its
     light is shifted by g = (1 − 1/r)/E (gravitational × transverse Doppler,
     relative to where it entered), reddens and fades as g⁴, and freezes onto
     the horizon. Its light then still has to climb past the hole to reach us:
     the ray tracer above bends it, and whatever is behind the hole is hidden. */
  const U_IN = 0.24;                    // the page's speed, v/c
  const Y_IN = 8;                       // gravity takes hold this many r_s below the hole
  const R_T = 4.2;                      // tidal radius, r_s
  const DB = 0.06, NB = 500;            // impact parameters 0 … 30 r_s
  const DTT = 0.25, NT = 960;           // coordinate time 0 … 240 r_s/c
  let GEO_T = null;                     // per sample: x, y, g, closest approach so far

  function buildGeodesics() {
    GEO_T = new Float32Array(NB * NT * 4);
    for (let i = 0; i < NB; i++) {
      const o = i * NT * 4;
      let x = i * DB, y = Y_IN;
      let r = Math.hypot(x, y), phi = Math.atan2(y, x), t = 0;
      // the page moves at (0, −U) in our coordinates; a static observer there
      // measures dr/(f dt) radially and r dφ/(√f dt) across, f = 1 − 1/r
      const f0 = 1 - 1 / r;
      const vr = (-U_IN * (y / r)) / f0, vp = (-U_IN * (x / r)) / Math.sqrt(f0);
      const gam = 1 / Math.sqrt(1 - vr * vr - vp * vp);
      const E = gam * Math.sqrt(f0), L = gam * vp * r;
      let pr = gam * vr * Math.sqrt(f0);
      const g0 = f0 / E;
      let g = 1, rmin = r, j = 0;
      const put = (jj, xx, yy, gg, rr) => { const k = o + jj * 4; GEO_T[k] = xx; GEO_T[k + 1] = yy; GEO_T[k + 2] = gg; GEO_T[k + 3] = rr; };
      put(0, x, y, 1, r);
      const acc = (rr) => -0.5 / (rr * rr) + (L * L) / (rr * rr * rr) - (1.5 * L * L) / (rr * rr * rr * rr);
      while (j < NT - 1 && r > 1.002) {
        const h = Math.min(0.05 * r, 0.6) * (1 - 1 / r);
        // RK4 in proper time on (r, dr/dτ); φ and t ride along by Simpson's rule
        const k1r = pr, k1p = acc(r);
        const r2 = r + 0.5 * h * k1r, p2 = pr + 0.5 * h * k1p;
        const k2r = p2, k2p = acc(r2);
        const r3 = r + 0.5 * h * k2r, p3 = pr + 0.5 * h * k2p;
        const k3r = p3, k3p = acc(r3);
        const r4 = r + h * k3r, p4 = pr + h * k3p;
        const k4r = p4, k4p = acc(r4);
        let nr = r + (h / 6) * (k1r + 2 * k2r + 2 * k3r + k4r);
        const npr = pr + (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
        nr = Math.max(nr, 1.0015);
        const dphi = (h / 6) * L * (1 / (r * r) + 8 / (r2 * r2 + r3 * r3) + 1 / (nr * nr));   // Simpson: midpoint 4/r_mid²
        const dt = (h / 6) * E * (1 / (1 - 1 / r) + 4 / (1 - 2 / (r2 + r3)) + 1 / (1 - 1 / nr));
        const nphi = phi + dphi, nt = t + dt;
        const nx = nr * Math.cos(nphi), ny = nr * Math.sin(nphi), ng = (1 - 1 / nr) / E / g0;
        const nmin = Math.min(rmin, nr);
        while (j < NT - 1 && (j + 1) * DTT <= nt) {
          j++;
          const a = (j * DTT - t) / (nt - t);
          put(j, x + (nx - x) * a, y + (ny - y) * a, g + (ng - g) * a, rmin + (nmin - rmin) * a);
        }
        r = nr; pr = npr; phi = nphi; t = nt; x = nx; y = ny; g = ng; rmin = nmin;
      }
      // frozen onto the horizon (as far as we can ever tell): hold the last state
      for (j++; j < NT; j++) put(j, x, y, g, rmin);
    }
  }

  // where the particle that entered at impact parameter b is, T after it entered
  function geoAt(b, T, out) {
    const ab = Math.abs(b);
    if (T <= 0 || ab >= (NB - 1) * DB) { out.x = b; out.y = Y_IN - U_IN * T; out.g = 1; out.rmin = 99; return; }
    const fi = ab / DB, i0 = fi | 0, fb = fi - i0;
    const fj = Math.min(T / DTT, NT - 1.001), j0 = fj | 0, ft = fj - j0;
    const k00 = (i0 * NT + j0) * 4, k10 = k00 + NT * 4;
    const bil = (c) => (GEO_T[k00 + c] * (1 - ft) + GEO_T[k00 + 4 + c] * ft) * (1 - fb) + (GEO_T[k10 + c] * (1 - ft) + GEO_T[k10 + 4 + c] * ft) * fb;
    out.x = (b < 0 ? -1 : 1) * bil(0);
    out.y = bil(1);
    out.g = bil(2);
    out.rmin = bil(3);
  }

  /* The page itself, redrawn: every word, chip, rule and picture is painted
     once into its own little canvas from its computed style, and those are
     laid out exactly where the browser put them. */
  const UNIT_SEL = '.hero-links a, .keywords li, .pub-actions a, .horizon-links a, .sec-label > span, .sec-label > i, .pub-figure, .portrait, hr.rule, .scroll-cue';
  const TEXT_SEL = '.eyebrow, .name, .hero-role, .sec-label, .about-text p, .pub-venue, .pub-title, .pub-authors, .post time, .post-title, .post-dek, .horizon-note, .copy';
  const units = [];
  const svgImages = new Map();
  const contentCanvas = document.createElement('canvas'), cctx = contentCanvas.getContext('2d');
  const CLEAR = /^(transparent|rgba\(0, 0, 0, 0\))$/;
  let SDPR = 1, measureGen = 0;

  function prepareReplica() {
    document.querySelectorAll(UNIT_SEL).forEach((el) => { el.classList.add('unit'); units.push({ el }); });
    document.querySelectorAll(TEXT_SEL).forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.parentElement.closest('.unit')) continue;
        const parts = node.nodeValue.split(/([ \t\n\r]+)/);
        if (!parts.some((s) => s.trim())) continue;
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (!part.trim()) { frag.appendChild(document.createTextNode(part)); continue; }
          const w = document.createElement('span');
          w.className = 'w';
          w.textContent = part;
          frag.appendChild(w);
          units.push({ el: w });
        }
        node.parentNode.replaceChild(frag, node);
      }
      root.classList.add('split');
    });
    // inline SVG artwork, rasterised once
    document.querySelectorAll('.pub-art svg').forEach((svg) => {
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', 640); clone.setAttribute('height', 360);
      const img = new Image();
      img.onload = () => { svgImages.set(svg, img); measure(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    });
    document.querySelectorAll('.portrait img, .pub-figure img').forEach((img) => {
      if (!img.complete) img.addEventListener('load', () => measure(), { once: true });
    });
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect && r > 0) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  }

  function paintText(node, cs, g, ox, oy) {
    const raw = node.nodeValue, start = raw.search(/\S/);
    if (start < 0) return;
    const end = raw.trimEnd().length;
    const range = document.createRange();
    range.setStart(node, start); range.setEnd(node, end);
    const rects = range.getClientRects();
    if (!rects.length) return;
    const rr = rects[0];
    let text = raw.slice(start, end).replace(/\s+/g, ' ');
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    g.save();
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const m = g.measureText(text), fs = parseFloat(cs.fontSize);
    const A = m.fontBoundingBoxAscent ?? fs * 0.8, D = m.fontBoundingBoxDescent ?? fs * 0.2;
    const base = rr.top + (rr.height - (A + D)) / 2 + A - oy;
    if (/gradient/.test(cs.backgroundImage) && CLEAR.test(cs.color)) {
      // background-clip: text — the gradient on the name
      const gr = g.createLinearGradient(rr.left - ox, 0, rr.right - ox, 0);
      gr.addColorStop(0.1, '#ffffff'); gr.addColorStop(0.7, '#9cc8ff'); gr.addColorStop(1, '#6f9fe6');
      g.fillStyle = gr;
    } else {
      g.fillStyle = cs.color;
    }
    const sh = cs.textShadow !== 'none' && cs.textShadow.match(/(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
    if (sh) { g.shadowColor = sh[1]; g.shadowBlur = parseFloat(sh[4]) * SDPR; }
    g.fillText(text, rr.left - ox, base);
    g.restore();
  }

  function paintEl(el, g, ox, oy) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    const x = r.left - ox, y = r.top - oy, w = r.width, h = r.height;
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (!CLEAR.test(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; roundRect(g, x, y, w, h, rad); g.fill(); }
    const clip = cs.overflow === 'hidden';
    if (clip) { g.save(); roundRect(g, x, y, w, h, rad); g.clip(); }
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      if (el.complete && el.naturalWidth) {
        g.save();
        if (cs.filter !== 'none' && 'filter' in g) g.filter = cs.filter;
        const s = Math.max(w / el.naturalWidth, h / el.naturalHeight), sw = w / s, shh = h / s;
        g.drawImage(el, (el.naturalWidth - sw) / 2, (el.naturalHeight - shh) / 2, sw, shh, x, y, w, h);
        g.restore();
      }
    } else if (tag === 'svg') {
      const im = svgImages.get(el);
      if (im) g.drawImage(im, x, y, w, h);
    } else {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) paintText(n, cs, g, ox, oy);
        else if (n.nodeType === 1) paintEl(n, g, ox, oy);
      }
    }
    if (clip) g.restore();
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    if (bt > 0 && cs.borderTopStyle !== 'none') {
      g.strokeStyle = cs.borderTopColor; g.lineWidth = bt;
      roundRect(g, x + bt / 2, y + bt / 2, w - bt, h - bt, Math.max(0, rad - bt / 2));
      g.stroke();
    } else if (bb > 0 && cs.borderBottomStyle !== 'none') {
      g.fillStyle = cs.borderBottomColor;
      g.fillRect(x, y + h - bb, w, bb);
    }
  }

  function measure() {
    if (!gl) return;
    SDPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const sy = window.scrollY;
    for (const u of units) {
      const r = u.el.getBoundingClientRect();
      const pad = getComputedStyle(u.el).textShadow !== 'none' ? 48 : 4;
      u.x = r.left - pad; u.y = r.top + sy - pad;
      u.w = r.width + 2 * pad; u.h = r.height + 2 * pad;
      if (r.width < 1 || r.height < 1) { u.spr = null; continue; }
      const c = u.spr || document.createElement('canvas');
      c.width = Math.ceil(u.w * SDPR); c.height = Math.ceil(u.h * SDPR);
      const g = c.getContext('2d');
      g.setTransform(SDPR, 0, 0, SDPR, 0, 0);
      paintEl(u.el, g, r.left - pad, r.top - pad);
      u.spr = c;
    }
    measureGen++;
  }

  // the stretch of the page (in its undisturbed layout) that can be on screen in the band
  function paintContent(top, bottom) {
    const w = Math.round(W * SDPR), h = Math.round((bottom - top) * SDPR);
    if (contentCanvas.width !== w || contentCanvas.height !== h) { contentCanvas.width = w; contentCanvas.height = h; }
    else cctx.clearRect(0, 0, w, h);
    const y0 = window.scrollY + top, y1 = window.scrollY + bottom;
    for (const u of units) {
      if (!u.spr || u.y + u.h < y0 || u.y > y1) continue;
      cctx.drawImage(u.spr, Math.round(u.x * SDPR), Math.round((u.y - y0) * SDPR));
    }
  }

  let meshV = null, meshI = null;
  const GEO = {};
  const LAGS = [0, 1.1, 1.1, 2.2, 2.2, 3.3, 3.3, 4.4], LAG_MAX = 4.45;   // trail: 4 segments of orbit, r_s/c

  function uploadGeodesics() {
    if (!debrisProg || !GEO_T) return;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, geoTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NT, NB, 0, gl.RGBA, gl.FLOAT, GEO_T);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.bindBuffer(gl.ARRAY_BUFFER, lagBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(LAGS), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0]), gl.STATIC_DRAW);
  }

  function drawPage(hole, band) {
    const rs = hole.rad / B_CRIT;
    const top = band.srcTop, bottom = band.bottom, sh = bottom - top;
    const q = smooth(0.6, 1, band.s);     // tidal disruption comes in with gravity
    paintContent(top, bottom);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, contentTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, contentCanvas);

    // the intact sheet: a mesh over the undisturbed page, each vertex moved along its geodesic
    const step = Math.max(8, Math.ceil(Math.sqrt((W * sh) / 50000)));
    const nx = Math.ceil(W / step) + 1, ny = Math.ceil(sh / step) + 1;
    if (!meshV || meshV.length < nx * ny * 6) meshV = new Float32Array(nx * ny * 6);
    for (let j = 0; j < ny; j++) {
      const y = Math.min(bottom, top + j * step);
      const by = (y - hole.cy) / rs, T = (Y_IN - by) / U_IN;
      for (let i = 0; i < nx; i++) {
        const x = Math.min(W, i * step);
        const bx = (x - hole.cx) / rs;
        geoAt(bx, T, GEO);
        const k = (j * nx + i) * 6;
        meshV[k] = hole.cx + lerp(bx, GEO.x, band.s) * rs;
        meshV[k + 1] = hole.cy + lerp(by, GEO.y, band.s) * rs;
        meshV[k + 2] = x / W;
        meshV[k + 3] = (y - top) / sh;
        meshV[k + 4] = lerp(1, GEO.g, band.s);
        meshV[k + 5] = GEO.rmin;
      }
    }
    // where neighbours part company — one captured, the next flung past — the sheet tears
    const max2 = (step * 5) ** 2;
    const far = (a, b) => (meshV[a * 6] - meshV[b * 6]) ** 2 + (meshV[a * 6 + 1] - meshV[b * 6 + 1]) ** 2 > max2;
    const gone = (a) => meshV[a * 6 + 4] < 0.03 || (q > 0.99 && meshV[a * 6 + 5] < R_T * 0.8);
    if (!meshI || meshI.length < (nx - 1) * (ny - 1) * 6) meshI = new Uint16Array((nx - 1) * (ny - 1) * 6);
    let m = 0;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        if (!(far(a, b) || far(b, c) || far(a, c) || (gone(a) && gone(b) && gone(c)))) { meshI[m++] = a; meshI[m++] = b; meshI[m++] = c; }
        if (!(far(b, d) || far(d, c) || far(b, c) || (gone(b) && gone(d) && gone(c)))) { meshI[m++] = b; meshI[m++] = d; meshI[m++] = c; }
      }
    }
    meshCount = m;

    const fw = Math.max(2, Math.round(W * GDPR)), fh = Math.max(2, Math.round(bottom * GDPR));
    if (fw !== pageW || fh !== pageH) {
      pageW = fw; pageH = fh;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, pageTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pageFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pageTex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, pageFB);
    gl.viewport(0, 0, pageW, pageH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(warpProg);
    gl.uniform2f(WU.uFB, W, bottom);
    gl.uniform1i(WU.uContent, 3);
    gl.uniform1f(WU.uRt, R_T);
    gl.uniform1f(WU.uQ, q);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, meshV.subarray(0, nx * ny * 6), gl.DYNAMIC_DRAW);
    for (let k = 0; k < 4; k++) gl.enableVertexAttribArray(k);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 16);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshI.subarray(0, m), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, m, gl.UNSIGNED_SHORT, 0);
    for (let k = 1; k < 4; k++) gl.disableVertexAttribArray(k);

    // the debris
    if (debrisProg && q > 0.001) {
      const sp = mobile ? 2.5 : 3;              // one particle per sp × sp px of page
      const cx = Math.ceil(W / sp), cy = Math.ceil(sh / sp), key = `${cx}x${cy}`;
      if (key !== cellKey) {
        cellKey = key; cellCount = cx * cy;
        const cells = new Float32Array(cellCount * 2);
        for (let j = 0, k = 0; j < cy; j++) {
          for (let i = 0; i < cx; i++) { cells[k++] = Math.min(1, ((i + 0.5) * sp) / W); cells[k++] = Math.min(1, ((j + 0.5) * sp) / sh); }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
        gl.bufferData(gl.ARRAY_BUFFER, cells, gl.STATIC_DRAW);
      }
      gl.useProgram(debrisProg);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, geoTex);
      gl.uniform1i(DU.uGeo, 4); gl.uniform1i(DU.uContent, 3);
      gl.uniform2f(DU.uFB, W, bottom);
      gl.uniform2f(DU.uSrcO, 0, top);
      gl.uniform2f(DU.uSrcS, W, sh);
      gl.uniform2f(DU.uC, hole.cx, hole.cy);
      gl.uniform1f(DU.uRs, rs);
      gl.uniform1f(DU.uS, band.s);
      gl.uniform1f(DU.uQ, q);
      gl.uniform1f(DU.uRt, R_T);
      gl.uniform1f(DU.uPt, sp * GDPR * 1.15);
      gl.uniform1f(DU.uLagMax, LAG_MAX);
      gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      instancing.vertexAttribDivisorANGLE(0, 1);
      gl.enableVertexAttribArray(1);
      // trails: emitted light, so they add
      gl.bindBuffer(gl.ARRAY_BUFFER, lagBuf);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(DU.uDot, 0);
      instancing.drawArraysInstancedANGLE(gl.LINES, 0, LAGS.length, cellCount);
      // the particles themselves
      gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(DU.uDot, 1);
      instancing.drawArraysInstancedANGLE(gl.POINTS, 0, 1, cellCount);
      instancing.vertexAttribDivisorANGLE(0, 0);
      gl.disableVertexAttribArray(1);
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // the strip at the top of the screen where the page is in the hole's grip
  function bandAt(hole, scroll) {
    return {
      bottom: hole.cy + Y_IN * (hole.rad / B_CRIT),
      srcTop: -Math.round(H * 0.35),
      // gravity is switched on over the first few hundred pixels after the hole settles
      s: smooth(hole.travel, hole.travel + 280, scroll),
    };
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
  let last = 0, pageKey = '';
  function render(now) {
    if (W < 2 || H < 2) return;
    const t = now / 1000;
    const dt = Math.min(0.05, last ? t - last : 0);
    last = t;
    if (!reduceMotion) flow += dt * 0.5;

    const scroll = Math.max(0, window.scrollY);
    const hole = holeAt(scroll);
    const heroH = hero.clientHeight;
    const sheetA = 1 - smooth(0, Math.max(1, heroH * 0.75), scroll);

    // back: sky + sheet
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, back.width, back.height);
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.fillStyle = '#020308';
    bctx.fillRect(0, 0, W, H);
    const neb = bctx.createRadialGradient(hole.cx, hole.cy, hole.rad, hole.cx, hole.cy, Math.max(W, H) * 0.6);
    neb.addColorStop(0, `rgba(60,100,180,${(0.16 + 0.06 * sheetA).toFixed(3)})`);
    neb.addColorStop(0.3, 'rgba(30,60,130,.06)');
    neb.addColorStop(1, 'rgba(10,20,50,0)');
    bctx.fillStyle = neb; bctx.fillRect(0, 0, W, H);
    drawStars(bctx, t, hole);

    if (sheetA > 0.01) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawStreaks(lctx, hole.ox, hole.oy);
      drawTokens(lctx, hole.ox, hole.oy);

      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalAlpha = sheetA;
      bctx.drawImage(layer, 0, 0);
      // cheap bloom: downsample twice and add back
      bactx.clearRect(0, 0, bloomA.width, bloomA.height);
      bactx.drawImage(layer, 0, 0, bloomA.width, bloomA.height);
      bbctx.clearRect(0, 0, bloomB.width, bloomB.height);
      bbctx.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      bctx.globalCompositeOperation = 'lighter';
      bctx.globalAlpha = 0.55 * sheetA; bctx.drawImage(bloomA, 0, 0, back.width, back.height);
      bctx.globalAlpha = 0.8 * sheetA; bctx.drawImage(bloomB, 0, 0, back.width, back.height);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    drawVignette(bctx, heroH - scroll);

    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, front.width, front.height);
    if (gl) {
      // once the hole has settled, it and the page in its grip are drawn in front
      const band = hole.pinned && !reduceMotion ? bandAt(hole, scroll) : null;
      lensCanvas.classList.toggle('front', !!band);
      if (band) {
        const key = `${scroll}|${W}|${H}|${measureGen}`;
        if (key !== pageKey) { drawPage(hole, band); pageKey = key; }
      } else {
        pageKey = '';
      }
      drawLens(hole, t, band);
    } else {
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawHorizon(fctx, hole, t);
    }
    nav.classList.toggle('past', scroll > heroH * 0.7);
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
    if (gl && !reduceMotion) { buildGeodesics(); uploadGeodesics(); prepareReplica(); }
    resize();
    lastW = W; lastH = H;
    measure();
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
    measure();
    render(performance.now());
  });
  // late layout shifts: a web font swapping in re-wraps text without
  // necessarily changing any size, so listen for fonts as well
  if (document.fonts) {
    document.fonts.addEventListener('loadingdone', () => { if (running) measure(); });
    document.fonts.ready.then(() => { if (running) measure(); });
  }
  if ('ResizeObserver' in window) {
    let pending = false;
    new ResizeObserver(() => {
      if (!running || pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; measure(); });
    }).observe(document.querySelector('main'));
  }

  const fontsReady = document.fonts
    ? Promise.all([
        document.fonts.load(`${FS}px "STIX Two Text"`),
        document.fonts.load(`italic ${FS}px "STIX Two Text"`),
        document.fonts.ready,
      ])
    : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(start, start);
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
      const coef = Array.from({ length: 7 }, (_, k) => ({ a: ((r() - 0.5) * 2) / Math.pow(k + 1, 1.4), p: r() * 6.28 }));
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
