/**
 * Musicbox: a cylinder music box. The drum is pinned once and never re-pinned;
 * turning it only plucks the comb, one tine at a time, wherever a pin comes
 * round. The pointer's x turns the drum, on a spring; the tine being plucked
 * lifts and takes the bright edge, its neighbours in the tune lift a little
 * less. At rest one tine is mid-pluck. The slider is how far a full sweep of
 * the pointer turns the drum, in degrees.
 *
 * The pattern: scrub. One spring for the turn; the pick read from its target.
 *
 * Source: hairline/musicbox.js (the standalone page); this copy takes the kernel as an argument
 * and returns the figure instead of handing it to the bench.
 */
// @ts-nocheck
export function musicbox(HL) {
  const {
    Cam, clamp, fillet, fit, facing, hull, lerp, open, poly, prism, proj, rad, rings, rrect,
    spring, stepS, disposer, flatDot, mk, place, pointer, put, register, solid,
  } = HL;

  const W = 70, D = 46, BH = 10, CR = 4;                  // the case
  const X0 = 12, X1 = 56, YC = 15, R = 9.5, ZC = BH + R + 1.5; // the drum, lying along x
  const ORDER = [3, 5, 1, 4, 6, 2, 0, 3, 6, 4, 1, 5, 2, 0];     // the tine each pin plucks, in the order they come round: a tune
  const N = 7, TW = 4.2, STEP = 360 / ORDER.length, A_C = -42, SPAN = 18; // tines; the pins' spacing; where they meet the comb
  const TIP = [YC + (R + 1.3) * Math.cos(rad(A_C)), ZC + (R + 1.3) * Math.sin(rad(A_C))];
  const TY1 = 35, TT = 1.1, LIFT = 15;                          // the tines run from TIP to the bar at TY1
  const TX = (k) => X0 + 3 + k * ((X1 - X0 - 6 - TW) / (N - 1));
  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

  function mount({ stage, svg, read }, value) {
    const bag = disposer();
    let span = value;

    const C = Cam(45, 0.5, 3.35);
    fit(C, [[0, 0, 0], [W, D, 0], [W, 0, 0], [0, D, 0], [X0, YC, ZC + R], [X1, YC, ZC + R], [W - 8, 7, BH + 15], [W - 2, 1, BH + 15]], 200, 166);
    const P = proj(C), front = facing(C);
    const g = mk("g", {}, svg);
    const block = (x0, y0, x1, y1, r, b, z0, z1) => { const [ring, cr] = rings(x0, y0, x1, y1, r, b); return prism(P, front, ring, cr, z0, z1); };

    // the case, and the far bracket the drum turns in
    put(solid(g), block(0, 0, W, D, CR, 1.6, 0, BH));
    put(solid(g), block(X0 - 3, YC - 4, X0, YC + 4, 1.2, 0.5, BH, ZC + 3.5));

    // the drum: the hull of its two end circles, the near end as its crease, the axle's end in it
    const cap = (x, r) => Array.from({ length: 32 }, (_, i) => P(x, YC + r * Math.cos((i * Math.PI) / 16), ZC + r * Math.sin((i * Math.PI) / 16)));
    const drum = mk("g", {}, g);
    mk("path", { d: poly(hull(cap(X0 + 0.5, R).concat(cap(X1 - 0.5, R)))), class: "sil" }, drum);
    mk("path", { d: poly(cap(X1 - 0.5, R - 1)), class: "nf lo" }, drum);
    mk("path", { d: poly(cap(X1 - 0.5, 1.6)), class: "nf lo" }, drum);

    // the pins, set round the drum once, in the tune's order
    const pins = ORDER.map((k, slot) => ({ k, slot, el: mk("circle", { r: 0, class: "dot m" }, drum) }));

    // the near bracket and the winding key, behind the comb
    put(solid(g), block(X1, YC - 4, X1 + 3, YC + 4, 1.2, 0.5, BH, ZC + 3.5));
    put(solid(g), block(W - 9.3, 5.7, W - 6.7, 8.3, 1.3, 0.5, BH, BH + 5));
    // the key's bow turns with the drum, as the spring unwinds: a plate seen from whichever side faces us
    const bow = fillet([[-1.2, 0], [1.2, 0], [1.2, 2.4], [5.5, 4.5], [5.5, 9.5], [0, 7.5], [-5.5, 9.5], [-5.5, 4.5], [-1.2, 2.4]], [0.3, 0.3, 0.8, 1.6, 1.6, 1.2, 1.6, 1.6, 0.8], 3);
    const bowBack = mk("path", { class: "lo" }, g), bowFace = mk("path", { class: "sil" }, g);
    function drawKey(th) {
      const f = rad(-th * 0.5 + 20), c = Math.cos(f), s = Math.sin(f), side = c + s >= 0 ? 1 : -1;
      const at = (n) => poly(bow.map(([u, v]) => P(W - 8 + u * c - n * s, 7 + u * s + n * c, BH + 5 + v)));
      bowBack.setAttribute("d", at(-0.6 * side));
      bowFace.setAttribute("d", at(0.6 * side));
    }

    // the comb: tines left to right, then the bar they are cut from, with its two screws
    const tines = [];
    for (let k = 0; k < N; k++) tines.push({ k, el: solid(mk("g", {}, g)), drawn: NaN });
    const bar = mk("g", {}, g);
    put(solid(bar), block(X0 + 1, TY1 - 1, X1 - 1, TY1 + 5, 1.6, 0.8, BH, TIP[1] + 1.8));
    for (const x of [X0 + 4, X1 - 4]) place(flatDot(bar, C, 0.9, "dot off"), P(x, TY1 + 2, TIP[1] + 1.8));

    /** Tine k, tilted up at its tip by t degrees about the bar: a thin plate. */
    function drawTine(tn, t) {
      if (t === tn.drawn) return;
      tn.drawn = t;
      const x0 = TX(tn.k), s = Math.sin(rad(t)), z = TIP[1] - TT / 2;
      const outline = fillet([[x0, TIP[0]], [x0 + TW, TIP[0]], [x0 + TW, TY1 + 1], [x0, TY1 + 1]], [1.2, 1.2, 0.2, 0.2], 3);
      const at = (dz) => outline.map(([x, y]) => P(x, y, z + dz + (TY1 - y) * s));
      // the crease is the top face's near long edge, where the plate's thickness shows
      put(tn.el, { sil: poly(hull(at(0).concat(at(TT)))), crease: open(at(TT).slice(5, 11)) });
    }

    const turn = spring(0);
    /** How far pin k is from the comb at turn th, in degrees: 0 is plucking. */
    const off = (p, th) => wrap(p.slot * STEP - th);
    let on = null;

    function frame() {
      const th = turn.x;
      pins.forEach((p) => {
        const a = rad(A_C + p.slot * STEP - th), n = 0.612 * Math.cos(a) + 0.5 * Math.sin(a);
        p.el.setAttribute("r", n > 0.08 ? 0.95 : 0);
        place(p.el, P(TX(p.k) + TW / 2, YC + R * Math.cos(a), ZC + R * Math.sin(a)));
      });
      tines.forEach((tn) => drawTine(tn, LIFT * Math.max(0, ...pins.filter((p) => p.k === tn.k).map((p) => clamp(1 - Math.abs(off(p, th)) / SPAN, 0, 1)))));
      drawKey(th);
    }
    /** The bright edge: the pin nearest the comb where the drum is going, and the tine it plucks. */
    function light() {
      let best = pins[0];
      for (const p of pins) if (Math.abs(off(p, turn.t)) < Math.abs(off(best, turn.t))) best = p;
      if (best === on) return;
      on = best;
      tines.forEach((tn) => tn.el.sil.classList.toggle("hi", tn.k === best.k));
      pins.forEach((p) => p.el.setAttribute("class", p === best ? "dot" : "dot m"));
    }

    const B = register(stage, (dt) => { const m = stepS(turn, dt); frame(); return m; });
    bag.add(B.unregister);
    frame();
    light();

    // The pointer turns the drum across the case's width on screen.
    const xs = [P(0, D, 0)[0], P(W, 0, 0)[0]], xL = Math.min(...xs), xR = Math.max(...xs);
    function move([x]) {
      turn.t = lerp(0, span, clamp((x - xL) / (xR - xL), 0, 1));
      light();
      read.textContent = "write " + (on.slot + 1);
      B.wake();
    }
    function leave() {
      turn.t = 0;
      light();
      read.textContent = "rest";
      B.wake();
    }
    read.textContent = "rest";

    bag.add(pointer(stage, { move, leave }));
    bag.add(() => svg.replaceChildren());

    return {
      set: (v) => { span = v; },
      destroy: bag.dispose,
    };
  }

  return {
    name: "musicbox",
    means: "A music box: the drum is pinned once, and turning it only plucks the comb, one tine at a time.",
    rules: [1, 3, 5, 8],
    range: [180, 270, 360],
    tour: [[141, 206], [224, 171], [318, 135], null],
    mount,
  };
}
