// Generated from ../ui/Icon.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { attr as _$attr, template as _$template } from "../../internal";
import { ICONS, type IconName } from '../shared';
const _tmpl$1 = _$template("<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"></svg>");
export default function Icon($$props) {
  const _el$1 = _tmpl$1();
  _$attr(_el$1, "width", () => $$props.size ?? 14);
  _$attr(_el$1, "height", () => $$props.size ?? 14);
  _$attr(_el$1, "innerHTML", () => ICONS[$$props.name]);
  return _el$1;
}
