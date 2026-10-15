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
// and out of sight. Background stars are lensed by the point-mass lens equation.
//
// Scrolling. The hole rises with the page, pins itself under the nav, and the
// words and pictures that scroll up into it are pulled in, swirled, stretched
// and swallowed. It is all a function of scroll position, so scrolling back up
// returns everything.
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
    const E = hole.rad * 1.5, E2 = 4 * E * E;
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
  function holeAt(scroll) {
    const rTop = clamp(Math.min(W, H) * 0.1, 44, 92);
    const yTop = rTop + (mobile ? 58 : 70);
    const travel = Math.max(1, heroHole.cy - yTop);
    const moved = Math.min(scroll, travel);
    const u = clamp(scroll / travel);
    const e = u * u * (3 - 2 * u);
    const cx = lerp(heroHole.cx, W / 2, e), cy = heroHole.cy - moved;
    const pts = heroHole.pts.map(([x, y], i) => {
      const a = (i / heroHole.pts.length) * Math.PI * 2;
      return [cx + lerp(x, Math.cos(a) * rTop, e), cy + lerp(y, Math.sin(a) * rTop, e)];
    });
    return { pts, cx, cy, rad: lerp(heroHole.rad, rTop, e), u, ox: cx - heroHole.cx, oy: -moved };
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

  /* ---------------- The page falling in ---------------- */
  const UNIT_SEL = '.hero-links a, .keywords li, .pub-actions a, .horizon-links a, .sec-label > span, .sec-label > i, .pub-figure, .portrait, hr.rule, .scroll-cue';
  const TEXT_SEL = '.eyebrow, .name, .hero-role, .sec-label, .about-text p, .pub-venue, .pub-title, .pub-authors, .post time, .post-title, .post-dek, .horizon-note, .copy';
  const units = [];

  function prepareFall() {
    document.querySelectorAll(UNIT_SEL).forEach((el) => { el.classList.add('fall'); units.push({ el, p: -1 }); });
    document.querySelectorAll(TEXT_SEL).forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.parentElement.closest('.fall')) continue;
        const parts = node.nodeValue.split(/([ \t\n\r]+)/);
        if (!parts.some((s) => s.trim())) continue;
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (!part.trim()) { frag.appendChild(document.createTextNode(part)); continue; }
          const w = document.createElement('span');
          w.className = 'w fall';
          w.textContent = part;
          frag.appendChild(w);
          units.push({ el: w, p: -1 });
        }
        node.parentNode.replaceChild(frag, node);
      }
      root.classList.add('split');
    });
  }

  function measure() {
    for (const u of units) { u.el.style.transform = ''; u.el.style.opacity = ''; u.el.classList.remove('hot'); u.p = -1; }
    const sy = window.scrollY;
    for (const u of units) {
      const r = u.el.getBoundingClientRect();
      u.x = r.left + r.width / 2; u.y = r.top + r.height / 2 + sy;
    }
  }

  function absorb(hole, strength) {
    const sy = window.scrollY;
    const lip = hole.cy + hole.rad * 0.85;
    const L = clamp(H * 0.32, 200, 340);
    for (const u of units) {
      const wy = u.y - sy;
      let p = strength * clamp(1 - (wy - lip) / L);
      p = Math.round(p * 500) / 500;
      if (p === u.p) continue;
      u.p = p;
      const s = u.el.style;
      if (p <= 0) { s.transform = ''; s.opacity = ''; u.el.classList.remove('hot'); continue; }
      if (p >= 1) { s.opacity = '0'; continue; }
      const e = Math.pow(p, 2.3);
      const dx = u.x - hole.cx, dy = wy - hole.cy;
      const th = 1.7 * Math.pow(e, 1.25);              // swirl with the hole
      const c = Math.cos(th), sn = Math.sin(th);
      const k = 1 - e;
      const nx = hole.cx + (dx * c - dy * sn) * k, ny = hole.cy + (dx * sn + dy * c) * k;
      let ax = hole.cx - nx, ay = hole.cy - ny;
      const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      const sc = Math.pow(1 - e, 0.75);
      const st = 1 + 3 * e * e, sq = 1 / Math.sqrt(st); // stretched toward the hole, squeezed across
      const m11 = st * ax * ax + sq * ay * ay, m12 = (st - sq) * ax * ay, m22 = st * ay * ay + sq * ax * ax;
      const a = (m11 * c + m12 * sn) * sc, b = (m12 * c + m22 * sn) * sc;
      const cc = (-m11 * sn + m12 * c) * sc, d = (-m12 * sn + m22 * c) * sc;
      s.transform = `translate(${(nx - u.x).toFixed(1)}px,${(ny - wy).toFixed(1)}px) matrix(${a.toFixed(4)},${b.toFixed(4)},${cc.toFixed(4)},${d.toFixed(4)},0,0)`;
      s.opacity = (1 - smooth(0.82, 1, e)).toFixed(3);
      u.el.classList.toggle('hot', e > 0.22);
    }
  }

  /* ---------------- Frame ---------------- */
  let last = 0;
  function render(now) {
    if (W < 2 || H < 2) return;
    const t = now / 1000;
    const dt = Math.min(0.05, last ? t - last : 0);
    last = t;
    if (!reduceMotion) flow += dt * 0.5;

    const scroll = Math.max(0, window.scrollY);
    const hole = holeAt(scroll);
    const sheetA = 1 - smooth(0, Math.max(1, hero.clientHeight * 0.75), scroll);

    // back: sky + sheet
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, back.width, back.height);
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
    }

    // front: the horizon
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, front.width, front.height);
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawHorizon(fctx, hole, t);

    if (!reduceMotion) absorb(hole, smooth(0.3, 1, hole.u));
    nav.classList.toggle('past', scroll > hero.clientHeight * 0.7);
  }

  /* ---------------- Main loop ---------------- */
  let running = false, raf = 0;
  const frame = (now) => { render(now); raf = document.hidden ? 0 : requestAnimationFrame(frame); };
  const kick = () => { if (running && !raf && !document.hidden) raf = requestAnimationFrame(frame); };

  let lastW = 0, lastH = 0;
  function start() {
    if (running) return;
    buildFlow();
    prepareFall();
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
  // late layout shifts (web fonts swapping in, etc.)
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
