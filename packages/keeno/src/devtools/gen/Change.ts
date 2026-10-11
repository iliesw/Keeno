// Generated from ../ui/Change.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { insert as _$insert, attr as _$attr, and as _$and, cond as _$cond, template as _$template } from "../../internal";
// One `path old → new` line of a timeline event.
import { ABSENT, preview, valueClass, type Change } from '../shared';
const _tmpl$1 = _$template("<span class=\"path keeno-68cef1ce\"></span>");
const _tmpl$2 = _$template("<span class=\"added keeno-68cef1ce\">+</span>");
const _tmpl$3 = _$template("<span class=\"keeno-68cef1ce\"></span>");
const _tmpl$4 = _$template("<span class=\"arrow keeno-68cef1ce\">→</span>");
const _tmpl$5 = _$template("<span class=\"removed keeno-68cef1ce\">removed</span>");
const _tmpl$6 = _$template("<span class=\"change keeno-68cef1ce\"><!----><!----><!----></span>");
export default function Change($$props) {
  const _el$7 = _tmpl$6();
  const _el$8 = _el$7.firstChild;
  const _el$9 = _el$8.nextSibling;
  const _el$10 = _el$9.nextSibling;
  _$insert(_el$7, _$and(() => $$props.change.path, () => {
    const _el$1 = _tmpl$1();
    _$insert(_el$1, () => $$props.change.path);
    return _el$1;
  }), _el$8);
  _$insert(_el$7, _$cond(() => $$props.change.old === ABSENT, () => _tmpl$2(), () => {
    const _el$3 = _tmpl$3();
    _$attr(_el$3, "class", () => [valueClass($$props.change.old), 'old'], "keeno-68cef1ce");
    _$attr(_el$3, "title", () => preview($$props.change.old));
    _$insert(_el$3, () => preview($$props.change.old, 1));
    return _el$3;
  }), _el$9);
  _$insert(_el$7, _$and(() => $$props.change.old !== ABSENT && $$props.change.next !== ABSENT, () => _tmpl$4()), _el$10);
  _$insert(_el$7, _$cond(() => $$props.change.next === ABSENT, () => _tmpl$5(), () => {
    const _el$6 = _tmpl$3();
    _$attr(_el$6, "class", () => valueClass($$props.change.next), "keeno-68cef1ce");
    _$attr(_el$6, "title", () => preview($$props.change.next));
    _$insert(_el$6, () => preview($$props.change.next, 1));
    return _el$6;
  }));
  return _el$7;
}
