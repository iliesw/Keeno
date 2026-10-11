// Generated from ../ui/Perf.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { derived } from "../../index";
import { attr as _$attr, insert as _$insert, on as _$on, mapKeyed as _$mapKeyed, cond as _$cond, and as _$and, template as _$template } from "../../internal";
// The Perf tab: counters, recent flush times and the components that update most.
import { formatMs, useActions, type DevStats } from '../shared';
const _tmpl$1 = _$template("<div class=\"keeno-9124c767\"><div class=\"card-value keeno-9124c767\"></div><div class=\"card-label keeno-9124c767\"></div></div>");
const _tmpl$2 = _$template("<rect class=\"keeno-9124c767\"><title class=\"keeno-9124c767\"></title></rect>", true);
const _tmpl$3 = _$template("<line x1=\"0\" class=\"budget keeno-9124c767\"></line>", true);
const _tmpl$4 = _$template("<div class=\"bar-row keeno-9124c767\"><span class=\"tag keeno-9124c767\">&lt;<span class=\"name keeno-9124c767\"></span>&gt;</span><span class=\"bar keeno-9124c767\"><span class=\"bar-fill keeno-9124c767\"></span></span><span class=\"bar-n keeno-9124c767\"></span></div>");
const _tmpl$5 = _$template("<div class=\"empty keeno-9124c767\">No updates yet.</div>");
const _tmpl$6 = _$template("<div class=\"view keeno-9124c767\"><div class=\"perf keeno-9124c767\"><div class=\"cards keeno-9124c767\"></div><div class=\"perf-title keeno-9124c767\">Recent flushes<span class=\"muted small keeno-9124c767\"> (peak <!----><!---->)</span></div><svg class=\"spark keeno-9124c767\" preserveAspectRatio=\"none\"><!----></svg><div class=\"perf-title keeno-9124c767\">Most updated<div class=\"spacer keeno-9124c767\"></div><button class=\"btn keeno-9124c767\">Reset</button></div><!----></div></div>");
export default function Perf($$props) {
  const actions = useActions();
  const W = 360;
  const H = 64;
  const BUDGET = 16.7;
  const recent = derived(() => $$props.stats?.recent ?? []);
  const peak = derived(() => Math.max(0.5, ...recent.get()));
  // Scaled to the data, so sub-millisecond flushes are visible; the budget line shows once it fits.
  const scale = derived(() => peak.get() * 1.25);
  const bars = derived(() => recent.get().map((v, i) => {
    const h = Math.max(1, v / scale.get() * (H - 4));
    return {
      i,
      x: i * (W / 80) + 0.5,
      y: H - h,
      w: Math.max(1, W / 80 - 1),
      h,
      slow: v > BUDGET,
      label: `${v.toFixed(2)}ms`
    };
  }));
  const budgetY = derived(() => BUDGET <= scale.get() ? H - BUDGET / scale.get() * (H - 4) : null);
  const cards = derived(() => $$props.stats ? [{
    label: 'components',
    value: String($$props.stats.components),
    warn: false
  }, {
    label: 'signals created',
    value: String($$props.stats.signals),
    warn: false
  }, {
    label: 'flushes',
    value: String($$props.stats.flushes),
    warn: false
  }, {
    label: 'component updates',
    value: String($$props.stats.updates),
    warn: false
  }, {
    label: 'last flush',
    value: formatMs($$props.stats.lastFlush),
    warn: $$props.stats.lastFlush > BUDGET
  }, {
    label: 'avg flush',
    value: formatMs($$props.stats.avgFlush),
    warn: $$props.stats.avgFlush > BUDGET
  }, {
    label: 'slowest flush',
    value: formatMs($$props.stats.maxFlush),
    warn: $$props.stats.maxFlush > BUDGET
  }] : []);
  const top = derived(() => $$props.stats?.top ?? []);
  const most = derived(() => top.get()[0]?.updates ?? 1);
  function reset() {
    actions.api.resetStats();
    actions.refresh();
  }
  const _el$15 = _tmpl$6();
  const _el$16 = _el$15.firstChild;
  const _el$17 = _el$16.firstChild;
  const _el$18 = _el$17.nextSibling;
  const _el$19 = _el$18.firstChild;
  const _el$20 = _el$19.nextSibling;
  const _el$21 = _el$20.firstChild;
  const _el$22 = _el$21.nextSibling;
  const _el$23 = _el$22.nextSibling;
  const _el$24 = _el$18.nextSibling;
  const _el$25 = _el$24.firstChild;
  const _el$26 = _el$24.nextSibling;
  const _el$27 = _el$26.firstChild;
  const _el$28 = _el$27.nextSibling;
  const _el$29 = _el$28.nextSibling;
  const _el$30 = _el$26.nextSibling;
  _$insert(_el$17, _$mapKeyed(() => cards.get(), c => c.label, c => {
    const _el$1 = _tmpl$1();
    const _el$2 = _el$1.firstChild;
    const _el$3 = _el$2.nextSibling;
    _$attr(_el$1, "class", () => ['card', c.get().warn && 'warn'], "keeno-9124c767");
    _$insert(_el$2, () => c.get().value);
    _$insert(_el$3, () => c.get().label);
    return _el$1;
  }));
  _$insert(_el$20, () => formatMs(recent.get().length ? peak.get() : 0), _el$22);
  _$insert(_el$20, _$cond(() => budgetY.get() !== null, () => ', dashed line: 16.7ms frame budget', () => ''), _el$23);
  _$attr(_el$24, "viewBox", () => `0 0 ${W} ${H}`);
  _$insert(_el$24, _$mapKeyed(() => bars.get(), b => b.i, b => {
    const _el$4 = _tmpl$2();
    const _el$5 = _el$4.firstChild;
    _$attr(_el$4, "x", () => b.get().x);
    _$attr(_el$4, "y", () => b.get().y);
    _$attr(_el$4, "width", () => b.get().w);
    _$attr(_el$4, "height", () => b.get().h);
    _$attr(_el$4, "class", () => b.get().slow ? 'slow' : 'ok', "keeno-9124c767");
    _$insert(_el$5, () => b.get().label);
    return _el$4;
  }), _el$25);
  _$insert(_el$24, _$and(() => budgetY.get() !== null, () => {
    const _el$6 = _tmpl$3();
    _$attr(_el$6, "x2", () => W);
    _$attr(_el$6, "y1", () => budgetY.get());
    _$attr(_el$6, "y2", () => budgetY.get());
    return _el$6;
  }));
  _$on(_el$29, "click", reset);
  _$insert(_el$16, _$mapKeyed(() => top.get(), t => t.id, t => {
    const _el$7 = _tmpl$4();
    const _el$8 = _el$7.firstChild;
    const _el$9 = _el$8.firstChild;
    const _el$10 = _el$9.nextSibling;
    const _el$11 = _el$8.nextSibling;
    const _el$12 = _el$11.firstChild;
    const _el$13 = _el$11.nextSibling;
    _$on(_el$7, "click", () => actions.select(t.get().id, true));
    _$on(_el$7, "mouseenter", () => actions.highlight(t.get().id));
    _$on(_el$7, "mouseleave", () => actions.highlight(null));
    _$insert(_el$10, () => t.get().name);
    _$attr(_el$12, "style", () => `width:${Math.max(2, t.get().updates / most.get() * 100)}%`);
    _$insert(_el$13, () => t.get().updates);
    return _el$7;
  }), _el$30);
  _$insert(_el$16, _$and(() => top.get().length === 0, () => _tmpl$5()));
  return _el$15;
}
