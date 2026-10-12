/**
 * Catalog: a card-catalogue cabinet, the page as nine drawers, one drawer a
 * node. The pointer opens the drawer it is over, and only that one: it slides
 * out and its cards rise, staggered from the front. Nothing else in the
 * cabinet moves. At rest one drawer stands a little open. The slider is how
 * far the drawer comes out, in world units.
 *
 * The pattern: one of many. Tweens for which drawer, a stagger by distance for
 * its cards, and a hit test on the cabinet's face, which never moves.
 *
 * Source: hairline/catalog.js (the standalone page); this copy takes the kernel as an argument
 * and returns the figure instead of handing it to the bench.
 */
// @ts-nocheck
export function catalog(HL) {
  const {
    Cam, clamp, fillet, fit, facing, open, poly, prism, proj, rings, rrect,
    tween, tset, tval, tdone, disposer, mk, pointer, put, register, solid,
  } = HL;

  const W = 66, D = 34, H = 58, COLS = 3, ROWS = 3, GAP = 3, MX = 5, Z0 = 9, Z1 = 50;
  const DW = (W - 2 * MX - (COLS - 1) * GAP) / COLS, DH = (Z1 - Z0 - (ROWS - 1) * GAP) / ROWS;
  const NAMES = ["h1", "nav", "a", "img", "p", "span", "ul", "li", "button"]; // row by row, from the top
  const REST = 4, REST_OUT = 7, CARDS = 5, PITCH = 2.6, RISE = 8, STAG = 45;

  /** Drawer i's front on the cabinet face: [x0, x1, z0, z1]. */
  function box(i) {
    const r = Math.floor(i / COLS), c = i % COLS, x0 = MX + c * (DW + GAP), z0 = Z1 - (r + 1) * DH - r * GAP;
    return [x0, x0 + DW, z0, z0 + DH];
  }

  function mount({ stage, svg, read }, value) {
    const bag = disposer();
    let reach = value;

    // Fitted with a drawer at the slider's far end, so nothing leaves the frame.
    const C = Cam(45, 0.5, 2.75);
    fit(C, [[0, 0, 0], [W, 0, 0], [0, D, 0], [W, D, 0], [0, 0, H], [W, 0, H], [0, D, H], [MX, D + 36, Z0], [W - MX, D + 36, Z0], [MX, D + 36, Z1]], 200, 166);
    const P = proj(C), front = facing(C);
    /** A ring in the u = x, v = z plane, laid on the face at depth y. */
    const onFace = (ring, y) => ring.map((q) => P(q.u, y, q.v));
    /** The cup pull of the drawer [x0, x1, z0, z1], on a face at depth y. */
    const fittings = ([x0, x1, z0, z1], y) => {
      const m = (x0 + x1) / 2, h = (z0 + z1) / 2;
      return poly(onFace(rrect(m - 3.6, h - 1, m + 3.6, h + 1, 1, 4), y));
    };

    // The cabinet: a plinth, the body, a top that overhangs it.
    const g = mk("g", {}, svg);
    for (const [x0, y0, x1, y1, r, b, z0, z1] of [[2, 2, W - 2, D - 2, 2, 0.8, 0, 5], [0, 0, W, D, 2.4, 1.2, 5, H - 4], [-1.5, -1.5, W + 1.5, D + 1.5, 3, 1.4, H - 4, H]]) {
      const [ring, cr] = rings(x0, y0, x1, y1, r, b);
      put(solid(g), prism(P, front, ring, cr, z0, z1));
    }
    // the drawer fronts on the face, each with its pull and label holder
    const fronts = [];
    for (let i = 0; i < ROWS * COLS; i++) {
      const b = box(i);
      mk("path", { d: poly(onFace(rrect(b[0], b[2], b[1], b[3], 1.6, 4), D)), class: "nf" }, g);
      fronts.push(b);
    }
    mk("path", { d: fronts.map((b) => fittings(b, D)).join(""), class: "nf lo" }, g);

    // The drawers, bottom row first and left to right, so a higher drawer covers a lower one.
    const drawers = [];
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c, grp = mk("g", {}, g), el = solid(grp);
      const marks = mk("path", { class: "nf lo" }, grp), rim = mk("path", { class: "nf lo" }, grp);
      const cards = [];
      for (let j = CARDS - 1; j >= 0; j--) cards[j] = { face: mk("path", { class: "fo" }, grp), edge: mk("path", { class: "nf" }, grp), L: tween(0) };
      drawers[i] = { i, b: box(i), el, marks, rim, cards, O: tween(i === REST ? REST_OUT : 0), drawn: "" };
    }

    function draw(d, o, lifts) {
      const key = o.toFixed(2) + lifts.map((l) => l.toFixed(2)).join();
      if (key === d.drawn) return;
      d.drawn = key;
      const [x0, x1, z0, z1] = d.b, top = z1 - 1.6;
      if (o < 0.4) {
        put(d.el, { sil: "", crease: "" });
        for (const el of [d.marks, d.rim, ...d.cards.flatMap((k) => [k.face, k.edge])]) el.setAttribute("d", "");
        return;
      }
      const [ring, cr] = rings(x0 + 0.4, D, x1 - 0.4, D + o, 1.4, Math.min(1, o / 3));
      put(d.el, prism(P, front, ring, cr, z0 + 0.4, top));
      d.marks.setAttribute("d", fittings(d.b, D + o));
      d.rim.setAttribute("d", o > 4 ? poly(rrect(x0 + 1.8, D + 0.6, x1 - 1.8, D + o - 1.4, 0.8, 3).map((q) => P(q.u, q.v, top))) : "");
      // the cards stand in the part that is out, front card first; only what rises over the rim is drawn
      d.cards.forEach((k, j) => {
        const y = D + o - 2.6 - j * PITCH;
        if (y < D + 1) { k.face.setAttribute("d", ""); k.edge.setAttribute("d", ""); return; }
        const h = 2 + (j % 2) * 0.9 + lifts[j];
        const pts = fillet([[x0 + 2.4, 0], [x1 - 2.4, 0], [x1 - 2.4, h], [x0 + 2.4, h]], [0.2, 0.2, 1.2, 1.2], 3).map(([u, v]) => P(u, y, top + v));
        k.face.setAttribute("d", poly(pts));
        k.edge.setAttribute("d", open(pts.slice(1, -1)));
      });
    }

    const B = register(stage, (_dt, now) => {
      let moving = false;
      drawers.forEach((d) => {
        draw(d, tval(d.O, now), d.cards.map((k) => tval(k.L, now)));
        if (!tdone(d.O, now) || d.cards.some((k) => !tdone(k.L, now))) moving = true;
      });
      return moving;
    });
    bag.add(B.unregister);

    let act = null;
    /** Opens drawer a, and closes the rest; -1 is the rest pose, the one drawer ajar. */
    function setActive(a) {
      if (a === act) return;
      act = a;
      const now = performance.now(), on = a < 0 ? REST : a;
      drawers.forEach((d) => {
        tset(d.O, d.i !== on ? 0 : a < 0 ? REST_OUT : reach, now, 0);
        d.cards.forEach((k, j) => tset(k.L, d.i === a ? RISE : 0, now, d.i === a ? j * STAG : 0));
        d.el.sil.classList.toggle("hi", d.i === on);
      });
      read.textContent = a < 0 ? "rest" : NAMES[a];
      B.wake();
    }

    // Hit test on the face plane y = D, which never moves: the screen point back to (x, z) on it.
    const o0 = P(0, D, 0), ex = P(1, D, 0), ez = P(0, D, 1);
    const ax = [ex[0] - o0[0], ex[1] - o0[1]], az = [ez[0] - o0[0], ez[1] - o0[1]], det = ax[0] * az[1] - ax[1] * az[0];
    function hit([sx, sy]) {
      const qx = sx - o0[0], qy = sy - o0[1];
      const u = (qx * az[1] - qy * az[0]) / det, v = (ax[0] * qy - ax[1] * qx) / det;
      const c = Math.floor((u - MX + GAP / 2) / (DW + GAP)), r = Math.floor((Z1 + GAP / 2 - v) / (DH + GAP));
      return c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : clamp(r * COLS + c, 0, ROWS * COLS - 1);
    }

    setActive(-1);
    bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
    bag.add(() => svg.replaceChildren());

    return {
      set: (v) => { reach = v; },
      destroy: bag.dispose,
    };
  }

  return {
    name: "catalog",
    means: "The page as a cabinet of drawers: the pointer opens the one drawer it is over, and nothing else in the cabinet moves.",
    rules: [1, 2, 4, 5],
    range: [20, 28, 36],
    tour: [[140, 111], [200, 207], [260, 159], null],
    mount,
  };
}
