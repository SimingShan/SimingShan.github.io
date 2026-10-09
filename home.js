// Homepage animation: starfield, treeline, orbiting planets, a sun on a
// 22-minute loop, campfire embers, and the cat.
// Tip: add ?loop=40 to the URL to watch the whole loop in 40 seconds.
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero');
  const SVGNS = 'http://www.w3.org/2000/svg';

  // seeded RNG so the forest looks the same on every visit
  function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  }

  /* ---------------- Treeline ---------------- */
  function pine(x, base, h, w) {
    let d = '';
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const top = base - h + i * h * 0.24;
      const bot = top + h * (0.42 + i * 0.06);
      const half = w * (0.28 + i * 0.12);
      d += `M${x} ${top}L${x + half} ${bot}L${x + half * 0.35} ${bot}L${x + half * 0.35} ${bot + 2}L${x - half * 0.35} ${bot + 2}L${x - half * 0.35} ${bot}L${x - half} ${bot}Z`;
    }
    d += `M${x - w * 0.06} ${base - h * 0.3}h${w * 0.12}V${base + 2}h${-w * 0.12}Z`;
    return d;
  }
  function forest(selector, seed, minH, maxH, minW, maxW, ground) {
    const path = document.querySelector(selector + ' path');
    if (!path) return;
    const r = rng(seed);
    const base = 220 - ground;
    let d = `M0 ${base}H1440V220H0Z`;
    for (let x = -20; x < 1470; x += 14 + r() * 26) {
      d += pine(x, base + r() * 6, minH + r() * (maxH - minH), minW + r() * (maxW - minW));
    }
    path.setAttribute('d', d);
  }
  forest('.trees-far', 7, 60, 150, 30, 50, 0);
  forest('.trees-near', 42, 40, 105, 34, 56, 18);

  /* ---------------- Embers ---------------- */
  const embers = document.querySelector('.embers');
  if (embers && !reduceMotion) {
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.className = 'ember';
      s.style.setProperty('--d', (2.4 + Math.random() * 2.4).toFixed(2) + 's');
      s.style.setProperty('--delay', (Math.random() * 4).toFixed(2) + 's');
      s.style.setProperty('--dx', (Math.random() * 60 - 25).toFixed(0) + 'px');
      s.style.left = (Math.random() * 24 - 12).toFixed(0) + 'px';
      embers.appendChild(s);
    }
  }

  /* ---------------- Solar system ---------------- */
  const svg = document.querySelector('.orbits');
  const CX = 300, CY = 210, TILT = 0.34;
  const planets = [
    { label: 'About',   href: '#about',            rx: 118, r: 13, period: 34,  a0: 0.6, color: '#6fae92' },
    { label: 'Papers',  href: '#publications',     rx: 178, r: 17, period: 56,  a0: 2.5, color: '#c9773f', ring: '#e6c491' },
    { label: 'Writing', href: '#blog',             rx: 236, r: 14, period: 82,  a0: 4.3, color: '#4f7fc8' },
    { label: '水墨',     href: 'blog/shuimo.html', rx: 282, r: 10,  period: 120, a0: 1.3, color: '#efe2c6', cap: '#5a3a28' },
  ];

  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  const defs = svg.querySelector('defs');
  const paths = svg.querySelector('.orbit-paths');
  const back = svg.querySelector('.layer-back');
  const front = svg.querySelector('.layer-front');

  planets.forEach((p, i) => {
    el('ellipse', { class: 'orbit-path', cx: CX, cy: CY, rx: p.rx, ry: p.rx * TILT }, paths);

    const grad = el('radialGradient', { id: 'shade' + i, r: '75%' }, defs);
    el('stop', { offset: '35%', 'stop-color': '#000', 'stop-opacity': 0 }, grad);
    el('stop', { offset: '100%', 'stop-color': '#0b1124', 'stop-opacity': .85 }, grad);
    p.grad = grad;

    const a = el('a', { href: p.href, class: 'planet', 'aria-label': p.label });
    const g = el('g', {}, a);
    if (p.ring) el('path', { d: `M${-p.r * 2} 0A${p.r * 2} ${p.r * .5} 0 0 1 ${p.r * 2} 0`, fill: 'none', stroke: p.ring, 'stroke-width': 2.5, opacity: .5 }, g);
    el('circle', { class: 'body', r: p.r, fill: p.color }, g);
    if (p.cap) {
      const cid = 'cap' + i;
      const cp = el('clipPath', { id: cid }, defs);
      el('circle', { r: p.r }, cp);
      el('ellipse', { cx: 0, cy: -p.r * .85, rx: p.r * 1.1, ry: p.r * .55, fill: p.cap, 'clip-path': `url(#${cid})` }, g);
      el('ellipse', { cx: 0, cy: p.r * .95, rx: p.r * 1.1, ry: p.r * .4, fill: p.cap, 'clip-path': `url(#${cid})` }, g);
    }
    el('circle', { r: p.r, fill: `url(#shade${i})` }, g);
    if (p.ring) el('path', { d: `M${-p.r * 2} 0A${p.r * 2} ${p.r * .5} 0 0 0 ${p.r * 2} 0`, fill: 'none', stroke: p.ring, 'stroke-width': 2.5 }, g);
    const t = el('text', { class: 'label', x: p.r + 7, y: 4 }, g);
    t.textContent = p.label;
    p.node = a; p.g = g; p.layer = null;
  });

  function placePlanets(seconds) {
    for (const p of planets) {
      const ang = p.a0 + (seconds / p.period) * Math.PI * 2;
      const s = Math.sin(ang), c = Math.cos(ang);
      const x = CX + p.rx * c, y = CY + p.rx * TILT * s;
      const scale = 1 + 0.2 * s;
      const layer = s >= 0 ? front : back;
      if (p.layer !== layer) { layer.appendChild(p.node); p.layer = layer; }
      p.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`);
      // light comes from the sun: put the bright side of the shade toward it
      const dx = CX - x, dy = CY - y, len = Math.hypot(dx, dy) || 1;
      p.grad.setAttribute('cx', (50 + 32 * dx / len).toFixed(1) + '%');
      p.grad.setAttribute('cy', (50 + 32 * dy / len).toFixed(1) + '%');
      p.grad.setAttribute('fx', (50 + 38 * dx / len).toFixed(1) + '%');
      p.grad.setAttribute('fy', (50 + 38 * dy / len).toFixed(1) + '%');
    }
  }

  /* ---- the sun's loop ---- */
  const sun = svg.querySelector('.sun');
  const glow = svg.querySelector('.sun-glow');
  const nova = svg.querySelector('.nova');
  const sunEdge = svg.querySelector('#sunGrad stop:last-child');
  const loopParam = parseFloat(new URLSearchParams(location.search).get('loop'));
  const LOOP = (loopParam > 5 ? loopParam : 22 * 60) * 1000;
  const SWELL = Math.min(20000, LOOP * 0.3);   // final reddening swell
  const END = 4000;                              // collapse + flash
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const hex = (rgb) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');

  function updateSun(ms) {
    const t = ms % (LOOP + END);
    let r = 34, gr = 110, edge = [242, 145, 61], novaR = 0, novaO = 0;
    if (t < LOOP - SWELL) {
      r = 34 + 6 * (t / (LOOP - SWELL));
      gr = 110 + 20 * (t / (LOOP - SWELL));
    } else if (t < LOOP) {
      const q = (t - (LOOP - SWELL)) / SWELL;
      r = 40 + 30 * q * q;
      gr = 130 + 60 * q;
      edge = mix([242, 145, 61], [200, 50, 28], q);
    } else {
      const q = (t - LOOP) / END;
      if (q < 0.25) { r = 70 * (1 - q / 0.25) + 3; gr = 190 * (1 - q / 0.25); edge = [200, 50, 28]; }
      else {
        const k = (q - 0.25) / 0.75;
        r = 0; gr = 0;
        novaR = 20 + 800 * (1 - Math.pow(1 - k, 3));
        novaO = 1 - k;
      }
    }
    sun.setAttribute('r', r.toFixed(2));
    glow.setAttribute('r', gr.toFixed(2));
    sunEdge.setAttribute('stop-color', hex(edge));
    nova.setAttribute('r', novaR.toFixed(1));
    nova.setAttribute('opacity', novaO.toFixed(3));
    hero.style.setProperty('--flash', (novaO * 0.55).toFixed(3));
  }

  /* ---------------- Starfield ---------------- */
  const canvas = document.querySelector('.sky');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, stars = [], shooting = null, nextShoot = 6000;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = rng(1234);
    const n = Math.round((W * H) / 4200);
    stars = Array.from({ length: n }, () => ({
      x: r() * W, y: r() * H * 0.85,
      s: r() < 0.08 ? 1.6 + r() : 0.5 + r() * 0.9,
      ph: r() * Math.PI * 2, sp: 0.6 + r() * 1.8,
      warm: r() < 0.15,
    }));
  }
  function drawSky(ms) {
    ctx.clearRect(0, 0, W, H);
    for (const st of stars) {
      const tw = 0.55 + 0.45 * Math.sin(st.ph + ms / 1000 * st.sp);
      ctx.globalAlpha = tw * (1 - st.y / H * 0.6);
      ctx.fillStyle = st.warm ? '#ffe0b0' : '#e8eeff';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2); ctx.fill();
      if (st.s > 1.6) {
        ctx.globalAlpha *= 0.35;
        ctx.fillRect(st.x - st.s * 3, st.y - 0.4, st.s * 6, 0.8);
        ctx.fillRect(st.x - 0.4, st.y - st.s * 3, 0.8, st.s * 6);
      }
    }
    // occasional shooting star
    if (!shooting && ms > nextShoot) {
      shooting = { x: Math.random() * W * 0.7 + W * 0.2, y: Math.random() * H * 0.3, t0: ms };
      nextShoot = ms + 9000 + Math.random() * 9000;
    }
    if (shooting) {
      const k = (ms - shooting.t0) / 900;
      if (k > 1) shooting = null;
      else {
        const x = shooting.x - k * 260, y = shooting.y + k * 110;
        const g = ctx.createLinearGradient(x, y, x + 90, y - 38);
        g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y - 38); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- Main loop ---------------- */
  resize();
  addEventListener('resize', resize);
  const t0 = performance.now();

  if (reduceMotion) {
    placePlanets(0); updateSun(0); drawSky(0);
  } else {
    let visible = true, raf = 0;
    const frame = (now) => {
      const ms = now - t0;
      placePlanets(ms / 1000);
      updateSun(ms);
      drawSky(ms);
      raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(hero);
    document.addEventListener('visibilitychange', kick);
    kick();
  }

  /* ---------------- The cat ---------------- */
  const pet = document.querySelector('.pet-frame');
  const stage = document.querySelector('.sidebar-pet');
  if (pet && stage) {
    const blink = (dur = 180) => { pet.classList.add('blink'); setTimeout(() => pet.classList.remove('blink'), dur); };
    (function schedule() {
      setTimeout(() => {
        blink(170);
        if (Math.random() < 0.25) setTimeout(() => blink(150), 260);
        schedule();
      }, 3500 + Math.random() * 3500);
    })();
    const phrases = ['meow', 'purr', '*tail flick*', '*slow blink*', 'mrrrp', '*head bonk*', 'prrrt', 'hi', '*warms paws by the fire*'];
    pet.addEventListener('click', (ev) => {
      pet.classList.remove('happy'); void pet.offsetWidth; pet.classList.add('happy');
      setTimeout(() => pet.classList.remove('happy'), 420);
      blink(180);
      const b = document.createElement('div');
      b.className = 'pet-bubble';
      b.textContent = phrases[Math.floor(Math.random() * phrases.length)];
      const rect = stage.getBoundingClientRect();
      const x = ev.clientX ? ev.clientX - rect.left : rect.width / 2;
      const y = ev.clientY ? ev.clientY - rect.top : 10;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      stage.appendChild(b);
      setTimeout(() => b.remove(), 1400);
    });
  }
})();
