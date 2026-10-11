// Generated from ../ui/Section.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state } from "../../index";
import { insert as _$insert, attr as _$attr, on as _$on, cond as _$cond, and as _$and, template as _$template } from "../../internal";
import type { Children } from "../../index";
const _tmpl$1 = _$template("<div class=\"section-body keeno-174c3529\"></div>");
const _tmpl$2 = _$template("<div class=\"keeno-174c3529\"><button class=\"section-head keeno-174c3529\"><span class=\"caret keeno-174c3529\"></span><!----><span class=\"count keeno-174c3529\"></span></button></div>");
export default function Section($$props) {
  const open = state(true);
  const _el$2 = _tmpl$2();
  const _el$3 = _el$2.firstChild;
  const _el$4 = _el$3.firstChild;
  const _el$5 = _el$4.nextSibling;
  const _el$6 = _el$5.nextSibling;
  _$attr(_el$2, "class", () => ['section', !open.get() && 'closed'], "keeno-174c3529");
  _$attr(_el$3, "aria-expanded", () => open.get() ? 'true' : 'false');
  _$on(_el$3, "click", () => open.set(!open.get()));
  _$insert(_el$4, _$cond(() => open.get(), () => '▾', () => '▸'));
  _$insert(_el$3, () => $$props.title, _el$5);
  _$insert(_el$6, () => $$props.count);
  _$insert(_el$2, _$and(() => open.get(), () => {
    const _el$1 = _tmpl$1();
    _$insert(_el$1, () => $$props.children);
    return _el$1;
  }));
  return _el$2;
}
