/**
 * Split: an editor slab in two panes. On the left, six lines of code with a
 * gutter and a caret; on the right, a window holding the small app they build:
 * a display and two keys. The line under the pointer rises with the caret at
 * its end, and the part of the app it builds rises after it, a compile later.
 * Over the app, the part rises and the lines that build it follow. At rest the
 * caret sits on the last line and its key is up. The slider is the lag, in ms.
 *
 * The pattern: one of many, across two panes. Tweens, a delay for the compile,
 * and hit tests on each part's resting top, which never moves.
 *
 * Source: the standalone page built by the Hairline skill; this copy takes the kernel as an
 * argument and returns the figure instead of handing it to the bench.
 */
// @ts-nocheck
export function split(HL) {
  const {
    Cam, clamp, facing, fit, poly, prism, proj, rings, rrect, seg, unproj,
    tween, tset, tval, tdone, disposer, mk, place, pointer, put, register, solid,
  } = HL;

  const W = 112, D = 64, H = 5, SEAM = 62;
  // each line: [indent, length]; MAP says which part of the app it builds
  const LINES = [[0, 24], [1, 40], [1, 36], [0, 26], [0, 30], [0, 38]];
  const MAP = [0, 0, 2, 0, 1, 2], PART = ["display", "−1", "+1"];
  const LX = 9, LW = 4, LH = 1.6, LUP = 5, STEP = 8.6, LY = (i) => 8 + i * STEP;
  // the app: [x0, y0, x1, y1, height], painted far to near
  const PARTS = [[71, 9, 103, 31, 8], [72, 39, 86, 53, 3.5], [89, 39, 103, 53, 3.5]];
  const PUP = 8, REST = 5, FALL = [1, 0.4, 0];

  function mount({ stage, svg, read }, value) {
    const bag = disposer();
    let lag = value;

    // fitted with the display and a line raised, so no pose leaves the frame
    const C = Cam(45, 0.5, 2.4);
    fit(C, [[0, 0, 0], [W, D, 0], [W, 0, 0], [0, D, 0], [0, 0, H + LH + LUP + 4], [W, 0, H + 8 + PUP]], 200, 166);
    const P = proj(C), front = facing(C);
    const g = mk("g", {}, svg);

    // the slab, the seam between the panes, and the preview's window set into the top
    const [body, bodyCr] = rings(0, 0, W, D, 6, 1.8);
    put(solid(g), prism(P, front, body, bodyCr, 0, H));
    mk("path", { d: seg(P(SEAM, 5, H), P(SEAM, D - 5, H)), class: "nf lo" }, g);
    mk("path", { d: poly(rrect(SEAM + 4, 4, W - 4, D - 4, 3.4, 4).map((q) => P(q.u, q.v, H))), class: "nf lo" }, g);

    // the gutter: a dot for each line
    for (let i = 0; i < LINES.length; i++) place(mk("circle", { r: 0.95, class: "dot off" }, g), P(4.6, LY(i) + LW / 2, H));

    // the lines, back to front, each with its caret painted just after it
    const lines = LINES.map(([ind, len], i) => {
      const x0 = LX + ind * 5, x1 = x0 + len, y0 = LY(i);
      const [ring, cr] = rings(x0, y0, x1, y0 + LW, 2, 0.7);
      const [cRing, cCr] = rings(x1 + 1.4, y0 - 0.3, x1 + 2.6, y0 + LW + 0.3, 0.6, 0.25);
      return { i, ring, cr, cRing, cCr, el: solid(g), caret: solid(g), Z: tween(LUP * FALL[Math.min(Math.abs(i - REST), 2)]), drawn: "" };
    });

    // the app, far to near: a display, then two keys
    const parts = PARTS.map(([x0, y0, x1, y1, h], p) => {
      const [ring, cr] = rings(x0, y0, x1, y1, p ? 2.8 : 3.6, p ? 1 : 1.5);
      const el = solid(g);
      // the display's screen, set into its top
      const screen = p ? null : { ring: rrect(x0 + 3, y0 + 3, x1 - 3, y1 - 3, 2, 4), el: mk("path", { class: "nf lo" }, el.g) };
      return { p, ring, cr, h, el, screen, Z: tween(p === MAP[REST] ? PUP : 0), drawn: NaN };
    });

    let cur = REST;
    function drawLine(l, z) {
      const key = z + "|" + (l.i === cur);
      if (key === l.drawn) return;
      l.drawn = key;
      put(l.el, prism(P, front, l.ring, l.cr, H, H + LH + z));
      put(l.caret, l.i === cur ? prism(P, front, l.cRing, l.cCr, H, H + LH + z + 4) : { sil: "", crease: "" });
    }
    function drawPart(pt, z) {
      if (z === pt.drawn) return;
      pt.drawn = z;
      put(pt.el, prism(P, front, pt.ring, pt.cr, H, H + pt.h + z));
      if (pt.screen) pt.screen.el.setAttribute("d", poly(pt.screen.ring.map((q) => P(q.u, q.v, H + pt.h + z))));
    }

    const B = register(stage, (_dt, now) => {
      let moving = false;
      lines.forEach((l) => { drawLine(l, tval(l.Z, now)); if (!tdone(l.Z, now)) moving = true; });
      parts.forEach((pt) => { drawPart(pt, tval(pt.Z, now)); if (!tdone(pt.Z, now)) moving = true; });
      return moving;
    });
    bag.add(B.unregister);

    // a: a line 0..5, a part 10..12, or -1 for rest (the caret's line)
    let act = null;
    function setActive(a) {
      if (a === act) return;
      const now = performance.now(), onPart = a >= 10;
      act = a;
      const line = a < 0 ? REST : onPart ? -1 : a, part = onPart ? a - 10 : MAP[line];
      // what the pointer is on answers at once; the other pane follows after the lag
      lines.forEach((l) => {
        // the chosen line rises, its neighbours partway, staggered out from it
        const dist = Math.abs(l.i - line), z = onPart ? (MAP[l.i] === part ? LUP : 0) : LUP * FALL[Math.min(dist, 2)];
        tset(l.Z, z, now, onPart ? lag : dist * 40);
        l.el.sil.classList.toggle("hi", !onPart && l.i === line);
      });
      parts.forEach((pt) => {
        tset(pt.Z, pt.p === part ? PUP : 0, now, onPart ? 0 : lag);
        pt.el.sil.classList.toggle("hi", onPart && pt.p === part);
      });
      if (line >= 0) cur = line;
      lines.forEach((l) => { l.drawn = ""; });
      const from = lines.filter((l) => MAP[l.i] === part).map((l) => l.i + 1).join(",");
      read.textContent = a < 0 ? "rest" : onPart ? `${PART[part]} ← line ${from}` : `line ${line + 1} → ${PART[part]}`;
      B.wake();
    }

    /** What is under the pointer: the app's parts on their resting tops, nearest first, then the lines. */
    function hit([sx, sy]) {
      for (let p = PARTS.length - 1; p >= 0; p--) {
        const [x0, y0, x1, y1, h] = PARTS[p], [x, y] = unproj(C, sx, sy, H + h);
        if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) return 10 + p;
      }
      const [x, y] = unproj(C, sx, sy, H + LH);
      if (x < 2 || x > SEAM - 2 || y < LY(0) - 3 || y > LY(LINES.length - 1) + LW + 3) return -1;
      return clamp(Math.round((y - LY(0) - LW / 2) / STEP), 0, LINES.length - 1);
    }

    setActive(-1);
    bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
    bag.add(() => svg.replaceChildren());

    return {
      set: (v) => { lag = v; },
      destroy: bag.dispose,
    };
  }

  return {
    name: "split",
    means: "An editor beside its live preview: the line under the pointer rises, and the part of the app it builds rises after it.",
    rules: [1, 4, 5, 8],
    range: [0, 140, 320],
    tour: [[185, 138], [124, 152], [244, 210], null],
    mount,
  };
}
