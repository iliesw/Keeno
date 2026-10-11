// Generated from ../ui/Timeline.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { derived } from "../../index";
import { createComponent as _$createComponent, cond as _$cond, insert as _$insert, attr as _$attr, on as _$on, mapKeyed as _$mapKeyed, and as _$and, template as _$template } from "../../internal";
// The Timeline tab: state writes and errors, newest first.
import IconButton from "./IconButton";
import TimelineEvent from "./TimelineEvent";
import { preview, type DevEvent } from '../shared';
const _tmpl$1 = _$template("<div class=\"empty keeno-fc58f06b\"></div>");
const _tmpl$2 = _$template("<div class=\"view keeno-fc58f06b\"><div class=\"toolbar keeno-fc58f06b\"><!----><input class=\"search keeno-fc58f06b\" type=\"search\" placeholder=\"Filter by component, state or value…\" spellcheck=\"false\"><span class=\"muted small keeno-fc58f06b\"><!----> event</span></div><div class=\"timeline keeno-fc58f06b\"><!----></div></div>");
export default function Timeline($$props) {
  const shown = derived(() => {
    const q = $$props.query.trim().toLowerCase();
    if (!q) return $$props.events;
    return $$props.events.filter(e => (e.type === 'write' ? `${e.componentName ?? 'store'} ${e.name} ${preview(e.old)} ${preview(e.next)} ${e.source}` : `${e.componentName ?? ''} ${preview(e.error)}`).toLowerCase().includes(q));
  });
  const _el$2 = _tmpl$2();
  const _el$3 = _el$2.firstChild;
  const _el$4 = _el$3.firstChild;
  const _el$5 = _el$4.nextSibling;
  const _el$6 = _el$5.nextSibling;
  const _el$7 = _el$6.firstChild;
  const _el$8 = _el$3.nextSibling;
  const _el$9 = _el$8.firstChild;
  _$insert(_el$3, _$createComponent(IconButton, {
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
  }, "keeno-fc58f06b"), _el$4);
  _$attr(_el$5, "value", () => $$props.query);
  _$on(_el$5, "input", e => $$props.onQuery((e.currentTarget as HTMLInputElement).value));
  _$insert(_el$6, () => shown.get().length, _el$7);
  _$insert(_el$6, _$cond(() => shown.get().length === 1, () => '', () => 's'));
  _$insert(_el$3, _$createComponent(IconButton, {
    icon: "trash",
    title: "Clear",
    onClick: () => $$props.onClear()
  }, "keeno-fc58f06b"));
  _$insert(_el$8, _$mapKeyed(() => shown.get().slice(0, 300), e => e.seq, e => _$createComponent(TimelineEvent, {
    get event() {
      return e.get();
    }
  }, "keeno-fc58f06b")), _el$9);
  _$insert(_el$8, _$and(() => shown.get().length === 0, () => {
    const _el$1 = _tmpl$1();
    _$insert(_el$1, _$cond(() => $$props.query, () => 'No event matches.', () => 'State changes show up here as they happen.'));
    return _el$1;
  }));
  return _el$2;
}
