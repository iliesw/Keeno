// Generated from ../ui/Timeline.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { derived } from "../../index";
import { on as _$on, attr as _$attr, cond as _$cond, insert as _$insert, and as _$and, createComponent as _$createComponent, mapKeyed as _$mapKeyed, template as _$template } from "../../internal";
// The Timeline tab: state writes and errors, newest first, and time travel over the writes.
import IconButton from "./IconButton";
import TimelineEvent from "./TimelineEvent";
import { preview, type DevEvent } from '../shared';
const _tmpl$1 = _$template("<button class=\"btn live keeno-fc58f06b\">Back to live</button>");
const _tmpl$2 = _$template("<div class=\"keeno-fc58f06b\"><button class=\"btn step keeno-fc58f06b\" title=\"Step back\">‹</button><input class=\"scrub keeno-fc58f06b\" type=\"range\" min=\"0\" aria-label=\"Time travel\"><button class=\"btn step keeno-fc58f06b\" title=\"Step forward\">›</button><span class=\"small muted where keeno-fc58f06b\"></span></div>");
const _tmpl$3 = _$template("<div class=\"empty keeno-fc58f06b\"></div>");
const _tmpl$4 = _$template("<div class=\"view keeno-fc58f06b\"><div class=\"toolbar keeno-fc58f06b\"><!----><input class=\"search keeno-fc58f06b\" type=\"search\" placeholder=\"Filter by component, state or value…\" spellcheck=\"false\"><span class=\"muted small keeno-fc58f06b\"><!----> event</span></div><!----><div class=\"timeline keeno-fc58f06b\"><!----></div></div>");
export default function Timeline($$props) {
  /** The writes, oldest first: the steps of the time travel slider. */
  const steps = derived(() => $$props.events.filter(e => e.type === 'write').map(e => e.seq).reverse());
  /** How many writes are applied: steps.length when live. */
  const position = derived(() => $$props.travel === null ? steps.get().length : steps.get().indexOf($$props.travel) + 1);
  const goTo = (i: number) => {
    const n = Math.max(0, Math.min(steps.get().length, i));
    $$props.onTravel(n === steps.get().length ? null : n === 0 ? 0 : steps.get()[n - 1]);
  };
  const shown = derived(() => {
    const q = $$props.query.trim().toLowerCase();
    if (!q) return $$props.events;
    return $$props.events.filter(e => (e.type === 'write' ? `${e.componentName ?? 'store'} ${e.name} ${preview(e.old)} ${preview(e.next)} ${e.source}` : `${e.componentName ?? ''} ${preview(e.error)}`).toLowerCase().includes(q));
  });
  const _el$8 = _tmpl$4();
  const _el$9 = _el$8.firstChild;
  const _el$10 = _el$9.firstChild;
  const _el$11 = _el$10.nextSibling;
  const _el$12 = _el$11.nextSibling;
  const _el$13 = _el$12.firstChild;
  const _el$14 = _el$9.nextSibling;
  const _el$15 = _el$14.nextSibling;
  const _el$16 = _el$15.firstChild;
  _$insert(_el$9, _$createComponent(IconButton, {
    get icon() {
      return $$props.paused ? 'rec' : 'pause';
    },
    get title() {
      return $$props.paused ? 'Resume recording' : 'Pause recording';
    },
    get danger() {
      return $$props.paused;
    },
    onClick: () => $$props.onPause()
  }, "keeno-fc58f06b"), _el$10);
  _$attr(_el$11, "value", () => $$props.query);
  _$on(_el$11, "input", e => $$props.onQuery((e.currentTarget as HTMLInputElement).value));
  _$insert(_el$12, () => shown.get().length, _el$13);
  _$insert(_el$12, _$cond(() => shown.get().length === 1, () => '', () => 's'));
  _$insert(_el$9, _$createComponent(IconButton, {
    icon: "trash",
    title: "Clear",
    onClick: () => $$props.onClear()
  }, "keeno-fc58f06b"));
  _$insert(_el$8, _$and(() => steps.get().length > 0, () => {
    const _el$2 = _tmpl$2();
    const _el$3 = _el$2.firstChild;
    const _el$4 = _el$3.nextSibling;
    const _el$5 = _el$4.nextSibling;
    const _el$6 = _el$5.nextSibling;
    _$attr(_el$2, "class", () => ['travel', $$props.travel !== null && 'detached'], "keeno-fc58f06b");
    _$attr(_el$3, "disabled", () => position.get() === 0);
    _$on(_el$3, "click", () => goTo(position.get() - 1));
    _$attr(_el$4, "max", () => steps.get().length);
    _$attr(_el$4, "value", () => position.get());
    _$on(_el$4, "input", e => goTo(Number((e.currentTarget as HTMLInputElement).value)));
    _$attr(_el$5, "disabled", () => $$props.travel === null);
    _$on(_el$5, "click", () => goTo(position.get() + 1));
    _$insert(_el$6, _$cond(() => $$props.travel === null, () => 'live', () => `${position.get()} / ${steps.get().length}`));
    _$insert(_el$2, _$and(() => $$props.travel !== null, () => {
      const _el$1 = _tmpl$1();
      _$on(_el$1, "click", () => $$props.onTravel(null));
      return _el$1;
    }));
    return _el$2;
  }), _el$14);
  _$insert(_el$15, _$mapKeyed(() => shown.get().slice(0, 300), e => e.seq, e => _$createComponent(TimelineEvent, {
    get event() {
      return e.get();
    }
  }, "keeno-fc58f06b")), _el$16);
  _$insert(_el$15, _$and(() => shown.get().length === 0, () => {
    const _el$7 = _tmpl$3();
    _$insert(_el$7, _$cond(() => $$props.query, () => 'No event matches.', () => 'State changes show up here as they happen.'));
    return _el$7;
  }));
  return _el$8;
}
