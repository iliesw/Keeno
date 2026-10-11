// Generated from ../ui/Overlay.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { attr as _$attr, insert as _$insert, and as _$and, mapKeyed as _$mapKeyed, template as _$template } from "../../internal";
// Boxes drawn over the page: the hovered or picked component, and update flashes.
import type { Box } from '../shared';
const _tmpl$1 = _$template("<div class=\"hl keeno-b64c8408\"></div>");
const _tmpl$2 = _$template("<div class=\"hl-label keeno-b64c8408\"><span class=\"name keeno-b64c8408\"></span><span class=\"dim keeno-b64c8408\"> <!---->×</span></div>");
const _tmpl$3 = _$template("<div class=\"flash keeno-b64c8408\"></div>");
const _tmpl$4 = _$template("<div class=\"overlay keeno-b64c8408\"><!----><!----></div>");
export default function Overlay($$props) {
  const at = (b: Box) => `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
  const labelAt = (b: Box) => `left:${Math.max(0, Math.min(b.left, innerWidth - 220))}px;top:${b.top > 24 ? b.top - 22 : Math.min(innerHeight - 22, b.top + b.height + 2)}px`;
  const _el$8 = _tmpl$4();
  const _el$9 = _el$8.firstChild;
  const _el$10 = _el$9.nextSibling;
  _$insert(_el$8, _$and(() => $$props.highlight, () => {
    const _el$1 = _tmpl$1();
    _$attr(_el$1, "style", () => at($$props.highlight.box));
    return _el$1;
  }), _el$9);
  _$insert(_el$8, _$and(() => $$props.highlight, () => {
    const _el$2 = _tmpl$2();
    const _el$3 = _el$2.firstChild;
    const _el$4 = _el$3.nextSibling;
    const _el$5 = _el$4.firstChild;
    const _el$6 = _el$5.nextSibling;
    _$attr(_el$2, "style", () => labelAt($$props.highlight.box));
    _$insert(_el$3, () => $$props.highlight.label);
    _$insert(_el$4, () => Math.round($$props.highlight.box.width), _el$6);
    _$insert(_el$4, () => Math.round($$props.highlight.box.height));
    return _el$2;
  }), _el$10);
  _$insert(_el$8, _$mapKeyed(() => $$props.flashes, f => f.key, f => {
    const _el$7 = _tmpl$3();
    _$attr(_el$7, "style", () => at(f.get().box));
    return _el$7;
  }));
  return _el$8;
}
