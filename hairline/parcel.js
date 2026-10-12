/**
 * Parcel: an open carton holding the runtime, packed as four slabs. The
 * pointer's x scrubs how far the stack lifts out and comes apart; its height
 * picks the slab level with it, which takes the bright edge. At rest the top
 * slab peeks over the rim. Each slab carries its number in dots on its lid.
 * The slider is the widest gap between slabs, in world units.
 *
 * The pattern: scrub and pick. One spring for the gap, and a pick made against
 * the target pose, so a slab rising out from under the pointer cannot flip it.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, lerp, open, poly, prism, proj, rad, ringAt, rings, rrect, run,
  spring, stepS, flatDot, mk, pointer, place, put, register, disposer, solid,
} = HL;

const W = 64, D = 48, H = 34, R = 3, WT = 2.2, FL = 17, TH = 7, INSET = 6;
const NAMES = ["signals", "components", "lists", "built-ins"]; // top to bottom
const N = NAMES.length, REST_G = 1.6, REST_LIFT = 3;

/** Base height of slab k (0 at the bottom) for a gap g: the stack lifts as it opens. */
const base = (k, g) => 2 + k * (TH + g) + REST_LIFT + (g - REST_G) * 1.1;
const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());

/** A flap hinged on the rim: o the hinge start, a along the hinge, n outward; tilt in degrees (up is positive). */
function flap(P, o, a, n, len, tilt) {
  const c = Math.cos(rad(tilt)) * FL, s = Math.sin(rad(tilt)) * FL;
  const w = (u, d) => P(o[0] + a[0] * u + n[0] * c * d, o[1] + a[1] * u + n[1] * c * d, H + s * d);
  const outline = fillet([[0, 0], [len, 0], [len, 1], [0, 1]].map(([u, d]) => [u, d]), [0.3, 0.3, 0.15, 0.15], 4);
  return {
    plate: poly(outline.map(([u, d]) => w(u, d))),
    // its thickness at the free edge, and the scored fold a little out from the hinge
    edge: open([w(1.5, 1), w(len - 1.5, 1)].map(([x, y]) => [x, y + 1.3])),
    score: open([w(1.2, 0.14), w(len - 1.2, 0.14)]),
  };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let gMax = value;

  // Fitted to the most open pose, the slider at its far end, so nothing leaves the frame.
  const C = Cam(45, 0.5, 2.5);
  fit(C, [[-FL, -FL, H + 7], [W + FL, D + FL, H - 8], [W + FL, -FL, H], [-FL, D + FL, H], [0, 0, 0], [W, D, 0], [W, 0, base(N - 1, 12) + TH]], 200, 166);
  const P = proj(C), front = facing(C);
  const outer = rrect(0, 0, W, D, R, 6), inner = rrect(WT, WT, W - WT, D - WT, R - 1, 6);

  const g = mk("g", {}, svg);
  // far flaps (on the y = 0 and x = 0 rims) splay up and back; painted before the carton
  const far = [flap(P, [R, 0], [1, 0], [0, -1], W - 2 * R, 28), flap(P, [0, R], [0, 1], [-1, 0], D - 2 * R, 22)];
  for (const f of far) { mk("path", { d: f.plate, class: "sil" }, g); mk("path", { d: f.edge, class: "nf lo" }, g); mk("path", { d: f.score, class: "nf lo" }, g); }

  // the carton's far half: body, the rim's inner edge, the floor seam
  mk("path", { d: poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, H)))), class: "sil" }, g);
  mk("path", { d: poly(ringAt(P, inner, H)), class: "nf" }, g);
  mk("path", { d: open(ringAt(P, run(inner, (q) => !front(q)), 2)), class: "nf lo" }, g);

  // the slabs, bottom to top, each with its number in dots on its lid
  const slabs = [];
  for (let k = 0; k < N; k++) {
    const grp = mk("g", {}, g), el = solid(grp), n = N - k;
    const [ring, crease] = rings(INSET, INSET, W - INSET, D - INSET, 3.4, 1.4);
    const dots = [];
    for (let m = 0; m < n; m++) dots.push(flatDot(grp, C, 0.9, "dot off"));
    slabs.push({ k, n, ring, crease, el, dots, drawn: NaN });
  }

  // the carton's near half, over the slabs: one opaque piece from the inner rim down to the floor
  const iF = LR(ringAt(P, run(inner, front), H)), oT = LR(ringAt(P, run(outer, front), H)), oB = LR(ringAt(P, run(outer, front), 0));
  mk("path", { d: poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), class: "fo" }, g);
  mk("path", { d: open(oT), class: "nf lo" }, g);
  mk("path", { d: open(iF), class: "nf" }, g);
  mk("path", { d: open([oT[0], ...oB, oT[oT.length - 1]]), class: "nf sil" }, g);
  // a shipping label on the near-left face
  const onFace = (ring) => ring.map((q) => P(q.u, D, q.v));
  mk("path", { d: poly(onFace(rrect(9, 4, 31, 16, 2, 4))), class: "nf" }, g);
  mk("path", { d: open([P(12, D, 13), P(24, D, 13)]) + open([P(12, D, 10), P(28, D, 10)]) + open([P(12, D, 7), P(20, D, 7)]), class: "nf lo" }, g);
  // near flaps (on the y = D and x = W rims) hang down and out, in front of everything
  const near = [flap(P, [W - R, D], [-1, 0], [0, 1], W - 2 * R, -34), flap(P, [W, R], [0, 1], [1, 0], D - 2 * R, -30)];
  for (const f of near) { mk("path", { d: f.plate, class: "sil" }, g); mk("path", { d: f.edge, class: "nf lo" }, g); mk("path", { d: f.score, class: "nf lo" }, g); }

  const gap = spring(REST_G);
  let act = -1;

  function drawSlab(s) {
    const z0 = base(s.k, gap.x);
    if (z0 === s.drawn) return;
    s.drawn = z0;
    put(s.el, prism(P, front, s.ring, s.crease, z0, z0 + TH));
    s.dots.forEach((el, m) => place(el, P(INSET + 5 + m * 3.4, D - INSET - 4.5, z0 + TH)));
  }
  /** The bright edge: the slab picked, or the top one at rest. */
  function light() {
    const on = act < 0 ? N - 1 : act;
    slabs.forEach((s) => {
      s.el.sil.classList.toggle("hi", s.k === on);
      s.dots.forEach((el) => el.setAttribute("class", s.k === on ? "dot" : "dot off"));
    });
  }

  const B = register(stage, (dt) => {
    const m = stepS(gap, dt);
    slabs.forEach(drawSlab);
    return m;
  });
  bag.add(B.unregister);
  light();

  // Where the stack can be scrubbed: the carton's width on screen.
  const xs = [P(0, D, 0)[0], P(W, 0, 0)[0]], xL = Math.min(...xs), xR = Math.max(...xs);
  const mid = (k, gg) => P(W / 2, D / 2, base(k, gg) + TH / 2)[1];

  function move([x, y]) {
    gap.t = lerp(REST_G + 2, gMax, clamp((x - xL) / (xR - xL), 0, 1));
    // pick against the target pose: the slab whose middle, where it is going, is nearest the pointer's height
    let best = -1, bd = Infinity;
    for (let k = 0; k < N; k++) { const d = Math.abs(mid(k, gap.t) - y); if (d < bd) { bd = d; best = k; } }
    act = bd < (TH + gap.t) * 1.6 && x > xL - 12 && x < xR + 12 ? best : -1;
    read.textContent = act < 0 ? "rest" : NAMES[N - 1 - act];
    light();
    B.wake();
  }
  function leave() {
    gap.t = REST_G;
    act = -1;
    read.textContent = "rest";
    light();
    B.wake();
  }

  bag.add(pointer(stage, { move, leave }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { gMax = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "parcel",
  means: "The runtime as a packed carton: the pointer lifts its four parts out in layers, and the one at its height lights up.",
  rules: [1, 3, 5, 6],
  range: [5, 8.5, 12],
  tour: [[117, 173], [214, 131], [308, 62], null],
  mount,
});
