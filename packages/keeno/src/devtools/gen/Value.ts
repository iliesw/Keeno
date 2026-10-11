// Generated from ../ui/Value.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, derived } from "../../index";
import { insert as _$insert, createComponent as _$createComponent, cond as _$cond, mapKeyed as _$mapKeyed, and as _$and, on as _$on, attr as _$attr, template as _$template } from "../../internal";
// Any value: primitives in color, objects and arrays expandable (recursively), DOM nodes
// outlined on the page on hover.
import Self from "./Value";
import { OBJECT_ENTRY_LIMIT, entriesOf, expandable, isNodeLike, nodeLabel, preview, typeName, useActions, valueClass } from '../shared';
const _tmpl$1 = _$template("<div class=\"kv nested keeno-b37606ab\"><span class=\"key keeno-b37606ab\"></span><span class=\"colon keeno-b37606ab\">:</span><span class=\"val keeno-b37606ab\"></span></div>");
const _tmpl$2 = _$template("<div class=\"muted small keeno-b37606ab\">… <!----> more</div>");
const _tmpl$3 = _$template("<div class=\"muted small keeno-b37606ab\"></div>");
const _tmpl$4 = _$template("<div class=\"children keeno-b37606ab\"><!----><!----></div>");
const _tmpl$5 = _$template("<span class=\"obj keeno-b37606ab\"><span class=\"v-obj toggle keeno-b37606ab\"><span class=\"caret keeno-b37606ab\"></span></span></span>");
const _tmpl$6 = _$template("<span class=\"v-obj node-ref keeno-b37606ab\" title=\"Click to log as $keenoNode\"></span>");
const _tmpl$7 = _$template("<span class=\"keeno-b37606ab\"></span>");
export default function Value($$props) {
  const actions = useActions();
  const open = state(false);
  const kind = derived(() => expandable($$props.value) && ($$props.depth ?? 0) <= 10 ? 'object' : isNodeLike($$props.value) ? 'node' : 'plain');
  const entries = derived(() => open.get() && kind.get() === 'object' ? entriesOf($$props.value as object) : []);
  const summary = derived(() => open.get() ? typeName($$props.value as object) || (Array.isArray($$props.value) ? 'Array' : 'Object') : preview($$props.value));
  function logNode() {
    ;
    (globalThis as any).$keenoNode = $$props.value;
    console.log('%c$keenoNode', 'color:#f5b942', $$props.value);
  }
  return [_$and(() => kind.get() === 'object', () => {
    const _el$12 = _tmpl$5();
    const _el$13 = _el$12.firstChild;
    const _el$14 = _el$13.firstChild;
    _$on(_el$13, "click", () => open.set(!open.get()));
    _$insert(_el$14, _$cond(() => open.get(), () => '▾', () => '▸'));
    _$insert(_el$13, () => summary.get());
    _$insert(_el$12, _$and(() => open.get(), () => {
      const _el$9 = _tmpl$4();
      const _el$10 = _el$9.firstChild;
      const _el$11 = _el$10.nextSibling;
      _$insert(_el$9, _$mapKeyed(() => entries.get().slice(0, OBJECT_ENTRY_LIMIT), e => e[0], e => {
        const _el$1 = _tmpl$1();
        const _el$2 = _el$1.firstChild;
        const _el$3 = _el$2.nextSibling;
        const _el$4 = _el$3.nextSibling;
        _$insert(_el$2, () => e.get()[0]);
        _$insert(_el$4, _$createComponent(Self, {
          get value() {
            return e.get()[1];
          },
          get depth() {
            return ($$props.depth ?? 0) + 1;
          }
        }, "keeno-b37606ab"));
        return _el$1;
      }), _el$10);
      _$insert(_el$9, _$and(() => entries.get().length > OBJECT_ENTRY_LIMIT, () => {
        const _el$5 = _tmpl$2();
        const _el$6 = _el$5.firstChild;
        const _el$7 = _el$6.nextSibling;
        _$insert(_el$5, () => entries.get().length - OBJECT_ENTRY_LIMIT, _el$7);
        return _el$5;
      }), _el$11);
      _$insert(_el$9, _$and(() => entries.get().length === 0, () => {
        const _el$8 = _tmpl$3();
        _$insert(_el$8, _$cond(() => Array.isArray($$props.value), () => '(empty array)', () => '(no keys)'));
        return _el$8;
      }));
      return _el$9;
    }));
    return _el$12;
  }), _$and(() => kind.get() === 'node', () => {
    const _el$15 = _tmpl$6();
    _$on(_el$15, "mouseenter", () => actions.highlightNodes([$$props.value as Node], nodeLabel($$props.value as Node)));
    _$on(_el$15, "mouseleave", () => actions.highlight(null));
    _$on(_el$15, "click", logNode);
    _$insert(_el$15, () => nodeLabel($$props.value as Node));
    return _el$15;
  }), _$and(() => kind.get() === 'plain', () => {
    const _el$16 = _tmpl$7();
    _$attr(_el$16, "class", () => valueClass($$props.value), "keeno-b37606ab");
    _$attr(_el$16, "title", () => typeof $$props.value === 'string' && $$props.value.length > 60 ? $$props.value : undefined);
    _$insert(_el$16, () => preview($$props.value));
    return _el$16;
  })];
}
