// Generated from ../ui/IconButton.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { attr as _$attr, on as _$on, createComponent as _$createComponent, insert as _$insert, template as _$template } from "../../internal";
import Icon from "./Icon";
import type { IconName } from '../shared';
const _tmpl$1 = _$template("<button class=\"keeno-c7627325\"></button>");
export default function IconButton($$props) {
  const _el$1 = _tmpl$1();
  _$attr(_el$1, "class", () => ['ib', ($$props.small ?? false) && 'sm', ($$props.on ?? false) && 'on', ($$props.danger ?? false) && 'rec', $$props.extra ?? ''], "keeno-c7627325");
  _$attr(_el$1, "title", () => $$props.title);
  _$attr(_el$1, "aria-label", () => $$props.title);
  _$attr(_el$1, "aria-pressed", () => $$props.on ?? false ? 'true' : undefined);
  _$attr(_el$1, "disabled", () => $$props.disabled ?? false);
  _$on(_el$1, "click", e => $$props.onClick(e));
  _$insert(_el$1, _$createComponent(Icon, {
    get name() {
      return $$props.icon;
    },
    get size() {
      return $$props.small ?? false ? 12 : 14;
    }
  }, "keeno-c7627325"));
  return _el$1;
}
