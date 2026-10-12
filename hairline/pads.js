/**
 * Pads: a sampler with sixteen pads, one pad an example to play. The pad under
 * the pointer goes down and its neighbours dip after it, less and later the
 * farther they are, a ripple out from the finger. Three knobs stand beside the
 * grid. At rest one pad is held down. The slider is the ripple's stagger, in ms.
 *
 * The pattern: one of many. Tweens, a stagger by distance, a falloff that
 * reaches zero, and a hit test on the pads' resting tops, which never move.
 */
const {
  Cam, fit, facing, poly, prism, proj, rings, rrect, unproj, seg,
  tween, tset, tval, tdone, disposer, mk, pointer, put, register, solid,
} = HL;

const W = 88, D = 72, H = 8, PAD = 13, GAP = 3.2, M = 6, UP = 4.5, PRESS = 3.4, N = 4;
const NAMES = ["counter", "todos", "pixel art", "kanban", "clock", "stopwatch", "toasts", "temperature",
  "search", "form", "context", "tabs", "async", "errors", "modal", "tailwind"];
const REST = 5, KNOBS = [14, 30, 46];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  const C = Cam(45, 0.5, 2.8);
  fit(C, [[0, 0, 0], [W, D, 0], [W, 0, 0], [0, D, 0], [0, 0, H + UP], [W, 0, H + UP]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // the chassis
  const [body, bodyCr] = rings(0, 0, W, D, 5, 1.6);
  put(solid(g), prism(P, front, body, bodyCr, 0, H));

  // pads and knobs, painted from the far corner to the near one
  const parts = [];
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N, x0 = M + c * (PAD + GAP), y0 = M + r * (PAD + GAP);
    parts.push({ kind: "pad", i, r, c, x0, y0, key: x0 + y0 });
  }
  const KX = M + N * (PAD + GAP) + 6;
  KNOBS.forEach((y, k) => parts.push({ kind: "knob", k, x: KX, y, key: KX + y - 6 }));
  parts.sort((a, b) => a.key - b.key);

  const pads = [];
  for (const p of parts) {
    if (p.kind === "knob") {
      const ring = rrect(p.x - 3.6, p.y - 3.6, p.x + 3.6, p.y + 3.6, 3.6, 5), cr = rrect(p.x - 2.6, p.y - 2.6, p.x + 2.6, p.y + 2.6, 2.6, 5);
      put(solid(g), prism(P, front, ring, cr, H, H + 4));
      // its pointer, each knob set somewhere different
      const a = [-0.7, 0.9, 2.3][p.k];
      mk("path", { d: seg(P(p.x, p.y, H + 4), P(p.x + 2.4 * Math.cos(a), p.y + 2.4 * Math.sin(a), H + 4)), class: "nf lo" }, g);
      continue;
    }
    const [ring, cr] = rings(p.x0, p.y0, p.x0 + PAD, p.y0 + PAD, 2.8, 1.1);
    // the well the pad sits in, then the pad
    mk("path", { d: poly(rrect(p.x0 - 0.8, p.y0 - 0.8, p.x0 + PAD + 0.8, p.y0 + PAD + 0.8, 3.4, 4).map((q) => P(q.u, q.v, H))), class: "nf lo" }, g);
    pads[p.i] = { ...p, ring, cr, el: solid(g), Z: tween(p.i === REST ? PRESS : 0), drawn: NaN };
  }

  function draw(pd, z) {
    if (z === pd.drawn) return;
    pd.drawn = z;
    put(pd.el, prism(P, front, pd.ring, pd.cr, H, H + UP - z));
  }
  const B = register(stage, (_dt, now) => {
    let moving = false;
    pads.forEach((pd) => { draw(pd, tval(pd.Z, now)); if (!tdone(pd.Z, now)) moving = true; });
    return moving;
  });
  bag.add(B.unregister);

  let act = null;
  /** Presses pad a, the ripple spreading from it; -1 lets go, back to the one pad held at rest. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act != null && act >= 0 ? act : REST, on = a < 0 ? REST : a;
    act = a;
    pads.forEach((pd) => {
      const dist = Math.hypot(pd.r - pads[from].r, pd.c - pads[from].c);
      const near = Math.hypot(pd.r - pads[on].r, pd.c - pads[on].c);
      const depth = a < 0 ? (pd.i === REST ? PRESS : 0) : PRESS * Math.max(0, 1 - near / 2.3);
      tset(pd.Z, depth, now, dist * stag);
      pd.el.sil.classList.toggle("hi", pd.i === on);
    });
    read.textContent = a < 0 ? "rest" : NAMES[a];
    B.wake();
  }

  /** The pad under the pointer, on the plane of the pads' resting tops. */
  function hit([sx, sy]) {
    const [x, y] = unproj(C, sx, sy, H + UP);
    const c = Math.floor((x - M + GAP / 2) / (PAD + GAP)), r = Math.floor((y - M + GAP / 2) / (PAD + GAP));
    return c < 0 || c >= N || r < 0 || r >= N ? -1 : r * N + c;
  }

  setActive(-1);
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { stag = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "pads",
  means: "A sampler of sixteen pads, one an example: the pad under the pointer goes down, and the ripple spreads from it.",
  rules: [1, 2, 3, 5],
  range: [0, 45, 90],
  tour: [[140, 147], [212, 195], [260, 135], null],
  mount,
});
