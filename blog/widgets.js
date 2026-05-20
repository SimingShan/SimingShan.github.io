/* ----------------------------------------------------
   widgets.js — schematic canvases for the RED-DiffEq post
   All visuals are illustrative; numbers in the metrics
   widget are representative not paper-exact.
   ---------------------------------------------------- */

(() => {

  // --------- shared utilities ---------

  // Seeded RNG (mulberry32)
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Colormap: seismic/velocity-style (deep blue -> cyan -> yellow -> red)
  // input v in [0,1]
  function vmap(v) {
    v = Math.max(0, Math.min(1, v));
    const stops = [
      [0.00, [12, 22, 80]],
      [0.20, [20, 90, 160]],
      [0.40, [60, 170, 180]],
      [0.55, [180, 200, 120]],
      [0.75, [220, 150, 60]],
      [1.00, [170, 30, 30]],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      if (v <= b) {
        const t = (v - a) / (b - a);
        return [
          ca[0] + (cb[0] - ca[0]) * t,
          ca[1] + (cb[1] - ca[1]) * t,
          ca[2] + (cb[2] - ca[2]) * t,
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  // Render a Float array of length w*h (values [0,1]) into a canvas via vmap.
  function paint(canvas, w, h, arr) {
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = vmap(arr[i]);
      img.data[4 * i + 0] = r;
      img.data[4 * i + 1] = g;
      img.data[4 * i + 2] = b;
      img.data[4 * i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Synthetic "velocity model": layered, optionally folded, with a fault.
  function makeVelocityModel(w, h, seed, { folded = true, fault = true } = {}) {
    const R = rng(seed * 9973 + 17);
    const arr = new Float32Array(w * h);

    // pick 4-7 layers with random thicknesses and random base velocities
    const nLayers = 4 + Math.floor(R() * 4);
    const thicknesses = [];
    let total = 0;
    for (let i = 0; i < nLayers; i++) {
      const t = 0.4 + R() * 1.2;
      thicknesses.push(t);
      total += t;
    }
    const layerY = [0];
    let acc = 0;
    for (let i = 0; i < nLayers; i++) {
      acc += (thicknesses[i] / total) * h;
      layerY.push(acc);
    }
    // base velocities — increasing with depth (geology)
    const vBase = [];
    let v = 0.15 + R() * 0.1;
    for (let i = 0; i < nLayers; i++) {
      vBase.push(v);
      v += 0.08 + R() * 0.18;
    }
    // optional folds (sin perturbations on layer boundaries)
    const foldAmp = folded ? (3 + R() * 5) : 0;
    const foldFreq = 0.8 + R() * 1.6;
    const foldPhase = R() * Math.PI * 2;

    // optional fault
    const hasFault = fault && R() > 0.35;
    const faultX = Math.floor(w * (0.3 + R() * 0.4));
    const faultShift = hasFault ? (R() > 0.5 ? 1 : -1) * (3 + Math.floor(R() * 6)) : 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fold = Math.sin((x / w) * foldFreq * Math.PI * 2 + foldPhase) * foldAmp;
        const shift = (hasFault && x > faultX) ? faultShift : 0;
        const yy = y + fold + shift;
        // find which layer this falls in
        let li = 0;
        for (let i = 0; i < nLayers; i++) {
          if (yy >= layerY[i] && yy < layerY[i + 1]) { li = i; break; }
          if (yy >= layerY[nLayers]) li = nLayers - 1;
          if (yy < 0) li = 0;
        }
        let val = vBase[li];
        // small intra-layer gradient + tiny texture
        val += (yy / h) * 0.02;
        val += (R() - 0.5) * 0.006;
        arr[y * w + x] = Math.max(0, Math.min(1, val));
      }
    }
    return arr;
  }

  function addNoise(arr, sigma, seed) {
    const R = rng(seed);
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      // Box-Muller
      const u1 = Math.max(1e-6, R());
      const u2 = R();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out[i] = Math.max(0, Math.min(1, arr[i] + sigma * z));
    }
    return out;
  }

  // Box blur (approximates Gaussian for our schematic).
  function blur(arr, w, h, radius) {
    if (radius <= 0) return arr.slice();
    const tmp = new Float32Array(arr.length);
    const out = new Float32Array(arr.length);
    // horizontal
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.max(0, Math.min(w - 1, x + k));
          s += arr[y * w + xx]; n++;
        }
        tmp[y * w + x] = s / n;
      }
    }
    // vertical
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.max(0, Math.min(h - 1, y + k));
          s += tmp[yy * w + x]; n++;
        }
        out[y * w + x] = s / n;
      }
    }
    return out;
  }

  // Posterize (TV stand-in)
  function posterize(arr, levels) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = Math.round(arr[i] * levels) / levels;
    }
    return out;
  }

  // Blend two arrays
  function blend(a, b, t) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] * (1 - t) + b[i] * t;
    return out;
  }

  // ============================================================
  // Widget 1: denoising prior
  // ============================================================
  (() => {
    const W = 96, H = 96;
    const cClean    = document.getElementById('dw-clean');
    const cNoisy    = document.getElementById('dw-noisy');
    const cDenoised = document.getElementById('dw-denoised');
    const sigmaIn   = document.getElementById('dw-sigma');
    const seedIn    = document.getElementById('dw-seed');
    const sigmaVal  = document.getElementById('dw-sigma-val');
    const seedVal   = document.getElementById('dw-seed-val');
    if (!cClean) return;

    let clean = null;
    let currentSeed = -1;

    function update() {
      const seed = parseInt(seedIn.value, 10);
      const sigma = parseFloat(sigmaIn.value);
      if (seed !== currentSeed) {
        clean = makeVelocityModel(W, H, seed);
        currentSeed = seed;
        paint(cClean, W, H, clean);
      }
      const noisy = addNoise(clean, sigma * 0.45, seed * 31 + 7);
      // denoiser strength roughly tracks sigma
      const r = Math.max(1, Math.round(sigma * 5));
      const denoised = blur(noisy, W, H, r);
      paint(cNoisy, W, H, noisy);
      paint(cDenoised, W, H, denoised);
      sigmaVal.textContent = sigma.toFixed(2);
      seedVal.textContent = '#' + seed;
    }
    sigmaIn.addEventListener('input', update);
    seedIn.addEventListener('input', update);
    update();
  })();

  // ============================================================
  // Comparison strip: GT / FWI / TV / RED
  // ============================================================
  (() => {
    const W = 96, H = 96;
    const cGT  = document.getElementById('cs-gt');
    const cFWI = document.getElementById('cs-fwi');
    const cTV  = document.getElementById('cs-tv');
    const cRED = document.getElementById('cs-red');
    if (!cGT) return;

    const gt = makeVelocityModel(W, H, 11, { folded: true, fault: true });
    // FWI alone: heavily smeared, missing high-freq
    const fwi = blur(addNoise(gt, 0.04, 101), W, H, 4);
    // FWI + TV: posterized (blocky)
    const tv  = posterize(blur(gt, W, H, 2), 4);
    // RED-DiffEq: lightly smoothed + slight residual noise but preserves structure
    const red = blend(gt, blur(gt, W, H, 1), 0.4);
    const redOut = addNoise(red, 0.02, 33);

    paint(cGT,  W, H, gt);
    paint(cFWI, W, H, fwi);
    paint(cTV,  W, H, tv);
    paint(cRED, W, H, redOut);
  })();

  // ============================================================
  // Metrics widget
  // ============================================================
  (() => {
    const wrap = document.getElementById('metrics-widget');
    if (!wrap) return;

    // Illustrative metrics — direction is correct per paper trend; values are not paper-exact.
    const DATA = {
      openfwi: {
        SSIM: { FWI: 0.62, Tikhonov: 0.71, TV: 0.76, "RED-DiffEq": 0.89 },
        MAE:  { FWI: 0.072, Tikhonov: 0.058, TV: 0.051, "RED-DiffEq": 0.028 },
        RMSE: { FWI: 0.110, Tikhonov: 0.094, TV: 0.082, "RED-DiffEq": 0.045 },
      },
      marmousi: {
        SSIM: { FWI: 0.48, Tikhonov: 0.55, TV: 0.61, "RED-DiffEq": 0.78 },
        MAE:  { FWI: 0.094, Tikhonov: 0.079, TV: 0.068, "RED-DiffEq": 0.041 },
        RMSE: { FWI: 0.143, Tikhonov: 0.121, TV: 0.108, "RED-DiffEq": 0.062 },
      },
      overthrust: {
        SSIM: { FWI: 0.44, Tikhonov: 0.52, TV: 0.58, "RED-DiffEq": 0.74 },
        MAE:  { FWI: 0.103, Tikhonov: 0.088, TV: 0.074, "RED-DiffEq": 0.047 },
        RMSE: { FWI: 0.156, Tikhonov: 0.134, TV: 0.118, "RED-DiffEq": 0.071 },
      }
    };

    const METHODS = ["FWI", "Tikhonov", "TV", "RED-DiffEq"];
    const SHADES  = ["#cfcac1", "#9b958b", "#5d574d", "var(--accent)"];

    const metricsEl = document.getElementById('mw-metrics');
    const dsToggle  = document.getElementById('mw-dataset');

    function render(ds) {
      const d = DATA[ds];
      const cards = [
        { label: "SSIM ↑", values: METHODS.map(m => d.SSIM[m]), better: "high", fmt: v => v.toFixed(2) },
        { label: "MAE ↓",  values: METHODS.map(m => d.MAE[m]),  better: "low",  fmt: v => v.toFixed(3) },
        { label: "RMSE ↓", values: METHODS.map(m => d.RMSE[m]), better: "low",  fmt: v => v.toFixed(3) },
      ];

      metricsEl.innerHTML = cards.map(card => {
        const vmin = Math.min(...card.values);
        const vmax = Math.max(...card.values);
        const bestIdx = card.better === "high"
          ? card.values.indexOf(vmax)
          : card.values.indexOf(vmin);
        // bar normalization: best = full, others scaled
        const bars = card.values.map((v, i) => {
          let frac;
          if (card.better === "high") frac = v / vmax;
          else frac = vmin / Math.max(1e-9, v);
          return { v, frac, name: METHODS[i], best: i === bestIdx, color: SHADES[i] };
        });

        return `
          <div class="metric ${card.better === 'high' ? '' : ''}">
            <span class="m-label">${card.label}</span>
            <div style="display:flex;flex-direction:column;gap:5px;font-family:var(--sans);font-size:11px;color:var(--ink-soft);text-align:left;margin-top:6px;">
              ${bars.map(b => `
                <div style="display:grid;grid-template-columns:64px 1fr 40px;gap:6px;align-items:center;">
                  <span style="${b.best ? 'color:var(--accent);font-weight:600;' : ''}">${b.name}</span>
                  <span style="height:6px;background:var(--rule-faint);position:relative;">
                    <span style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(4, b.frac * 100).toFixed(1)}%;background:${b.color};"></span>
                  </span>
                  <span style="font-family:var(--mono);font-size:11px;text-align:right;color:${b.best ? 'var(--accent)' : 'var(--ink)'};">${card.fmt(b.v)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

    dsToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-ds]');
      if (!btn) return;
      dsToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render(btn.getAttribute('data-ds'));
    });

    render('openfwi');
  })();

})();
