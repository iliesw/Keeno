// Generated from ../ui/TimelineEvent.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { derived } from "../../index";
import { on as _$on, insert as _$insert, createComponent as _$createComponent, mapKeyed as _$mapKeyed, and as _$and, attr as _$attr, cond as _$cond, template as _$template } from "../../internal";
// A state write (with what changed) or an error, in the timeline.
import Change from "./Change";
import IconButton from "./IconButton";
import { diff, formatTime, preview, useActions, type DevEvent } from '../shared';
const _tmpl$1 = _$template("<button class=\"link tag keeno-dfaffca3\">&lt;<span class=\"name keeno-dfaffca3\"></span>&gt;</button>");
const _tmpl$2 = _$template("<span class=\"store-mark keeno-dfaffca3\" title=\"Store\">◆</span>");
const _tmpl$3 = _$template("<span class=\"v-err grow keeno-dfaffca3\"></span>");
const _tmpl$4 = _$template("<span class=\"ev-name keeno-dfaffca3\"></span>");
const _tmpl$5 = _$template("<span class=\"muted small keeno-dfaffca3\">+<!----> more</span>");
const _tmpl$6 = _$template("<span class=\"changes keeno-dfaffca3\"><!----></span>");
const _tmpl$7 = _$template("<span class=\"keeno-dfaffca3\"></span>");
const _tmpl$8 = _$template("<div class=\"keeno-dfaffca3\"><span class=\"time keeno-dfaffca3\"></span><!----><!----><!----><!----><!----></div>");
export default function TimelineEvent($$props) {
  const actions = useActions();
  const write = derived(() => $$props.event.type === 'write' ? $$props.event : null);
  const failure = derived(() => $$props.event.type === 'error' ? $$props.event : null);
  const changes = derived(() => write.get() ? diff(write.get().old, write.get().next, '', 0) : []);
  const _el$13 = _tmpl$8();
  const _el$14 = _el$13.firstChild;
  const _el$15 = _el$14.nextSibling;
  const _el$16 = _el$15.nextSibling;
  const _el$17 = _el$16.nextSibling;
  const _el$18 = _el$17.nextSibling;
  const _el$19 = _el$18.nextSibling;
  _$attr(_el$13, "class", () => ['event', failure.get() && 'error'], "keeno-dfaffca3");
  _$insert(_el$14, () => formatTime($$props.event.time));
  _$insert(_el$13, _$cond(() => $$props.event.component !== null, () => {
    const _el$1 = _tmpl$1();
    const _el$2 = _el$1.firstChild;
    const _el$3 = _el$2.nextSibling;
    _$on(_el$1, "click", () => actions.select($$props.event.component, true));
    _$insert(_el$3, () => $$props.event.componentName ?? '?');
    return _el$1;
  }, () => _tmpl$2()), _el$15);
  _$insert(_el$13, _$and(() => failure.get(), () => {
    const _el$5 = _tmpl$3();
    _$insert(_el$5, () => preview(failure.get().error));
    return _el$5;
  }), _el$16);
  _$insert(_el$13, _$and(() => write.get(), () => {
    const _el$6 = _tmpl$4();
    _$insert(_el$6, () => write.get().name);
    return _el$6;
  }), _el$17);
  _$insert(_el$13, _$and(() => write.get(), () => {
    const _el$10 = _tmpl$6();
    const _el$11 = _el$10.firstChild;
    _$insert(_el$10, _$mapKeyed(() => changes.get().slice(0, 3), c => c.path, c => _$createComponent(Change, {
      get change() {
        return c.get();
      }
    }, "keeno-dfaffca3")), _el$11);
    _$insert(_el$10, _$and(() => changes.get().length > 3, () => {
      const _el$7 = _tmpl$5();
      const _el$8 = _el$7.firstChild;
      const _el$9 = _el$8.nextSibling;
      _$insert(_el$7, () => changes.get().length - 3, _el$9);
      return _el$7;
    }));
    return _el$10;
  }), _el$18);
  _$insert(_el$13, _$and(() => write.get() && write.get().source !== 'local', () => {
    const _el$12 = _tmpl$7();
    _$attr(_el$12, "class", () => ['badge', `src-${write.get().source}`], "keeno-dfaffca3");
    _$insert(_el$12, () => write.get().source);
    return _el$12;
  }), _el$19);
  _$insert(_el$13, _$and(() => write.get(), () => _$createComponent(IconButton, {
    icon: "revert",
    small: true,
    extra: "revert",
    get title() {
      return `Set ${write.get().name} back to ${preview(write.get().old)}`;
    },
    onClick: () => actions.api.set(write.get()!.signal, write.get()!.old)
  }, "keeno-dfaffca3")));
  return _el$13;
}
