// Generated from ../ui/Inspector.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { derived } from "../../index";
import { on as _$on, createComponent as _$createComponent, mapKeyed as _$mapKeyed, insert as _$insert, and as _$and, cond as _$cond, template as _$template } from "../../internal";
// The selected component (props, states, errors), the stores, or a hint.
import IconButton from "./IconButton";
import Section from "./Section";
import SignalRow from "./SignalRow";
import Value from "./Value";
import { STORES, useActions, type DevDetails, type DevSignal } from '../shared';
const _tmpl$1 = _$template("<div class=\"hint keeno-dfe3c3ff\"><div class=\"hint-title keeno-dfe3c3ff\">Select a component</div><div class=\"keeno-dfe3c3ff\">Click one in the tree, or <button class=\"link keeno-dfe3c3ff\">pick it on the page</button>.</div><div class=\"keys keeno-dfe3c3ff\"><kbd class=\"keeno-dfe3c3ff\">Alt</kbd>+<kbd class=\"keeno-dfe3c3ff\">Shift</kbd>+<kbd class=\"keeno-dfe3c3ff\">D</kbd> panel · <kbd class=\"keeno-dfe3c3ff\">Alt</kbd>+<kbd class=\"keeno-dfe3c3ff\">Shift</kbd>+<kbd class=\"keeno-dfe3c3ff\">C</kbd> pick</div></div>");
const _tmpl$2 = _$template("<div class=\"keeno-dfe3c3ff\"><div class=\"insp-head keeno-dfe3c3ff\"><span class=\"store-mark keeno-dfe3c3ff\">◆</span><span class=\"insp-name keeno-dfe3c3ff\">Stores</span></div><div class=\"meta muted keeno-dfe3c3ff\">States and deriveds created outside components.</div></div>");
const _tmpl$3 = _$template("<button class=\"link file keeno-dfe3c3ff\" title=\"Open in editor\"></button>");
const _tmpl$4 = _$template("<span class=\"muted keeno-dfe3c3ff\">built-in</span>");
const _tmpl$5 = _$template("<div class=\"kv keeno-dfe3c3ff\"><span class=\"key keeno-dfe3c3ff\"></span><span class=\"colon keeno-dfe3c3ff\">:</span><span class=\"val keeno-dfe3c3ff\"></span></div>");
const _tmpl$6 = _$template("<div class=\"muted small pad keeno-dfe3c3ff\">None</div>");
const _tmpl$7 = _$template("<div class=\"kv err-row keeno-dfe3c3ff\"><span class=\"val keeno-dfe3c3ff\"></span></div>");
const _tmpl$8 = _$template("<div class=\"keeno-dfe3c3ff\"><div class=\"insp-head keeno-dfe3c3ff\"><span class=\"tag big keeno-dfe3c3ff\">&lt;<span class=\"name keeno-dfe3c3ff\"></span>&gt;</span><div class=\"spacer keeno-dfe3c3ff\"></div><!----><!----></div><div class=\"meta keeno-dfe3c3ff\"><!----><span class=\"muted keeno-dfe3c3ff\"> · <!----> update</span></div><!----><!----></div>");
const _tmpl$9 = _$template("<div class=\"inspector keeno-dfe3c3ff\"><!----><!----></div>");
export default function Inspector($$props) {
  const actions = useActions();
  const view = derived(() => $$props.selected === STORES ? 'stores' : $$props.details ? 'component' : 'empty');
  const propKeys = derived(() => $$props.details ? Object.keys($$props.details.props).filter(k => k !== 'children' || $$props.details!.props[k] !== undefined) : []);
  const errors = derived(() => ($$props.details?.errors ?? []).map((error, i) => ({
    i,
    error
  })));
  const _el$32 = _tmpl$9();
  const _el$33 = _el$32.firstChild;
  const _el$34 = _el$33.nextSibling;
  _$insert(_el$32, _$and(() => view.get() === 'empty', () => {
    const _el$1 = _tmpl$1();
    const _el$2 = _el$1.firstChild;
    const _el$3 = _el$2.nextSibling;
    const _el$4 = _el$3.firstChild;
    const _el$5 = _el$4.nextSibling;
    _$on(_el$5, "click", () => actions.startPicker());
    return _el$1;
  }), _el$33);
  _$insert(_el$32, _$and(() => view.get() === 'stores', () => {
    const _el$6 = _tmpl$2();
    _$insert(_el$6, _$createComponent(Section, {
      title: "State",
      get count() {
        return $$props.stores.length;
      },
      children: () => _$mapKeyed(() => $$props.stores, s => s.id, s => _$createComponent(SignalRow, {
        get signal() {
          return s.get();
        }
      }, "keeno-dfe3c3ff"))
    }, "keeno-dfe3c3ff"));
    return _el$6;
  }), _el$34);
  _$insert(_el$32, _$and(() => view.get() === 'component', () => {
    const _el$17 = _tmpl$8();
    const _el$18 = _el$17.firstChild;
    const _el$19 = _el$18.firstChild;
    const _el$20 = _el$19.firstChild;
    const _el$21 = _el$20.nextSibling;
    const _el$22 = _el$19.nextSibling;
    const _el$23 = _el$22.nextSibling;
    const _el$24 = _el$23.nextSibling;
    const _el$25 = _el$18.nextSibling;
    const _el$26 = _el$25.firstChild;
    const _el$27 = _el$26.nextSibling;
    const _el$28 = _el$27.firstChild;
    const _el$29 = _el$28.nextSibling;
    const _el$30 = _el$25.nextSibling;
    const _el$31 = _el$30.nextSibling;
    _$insert(_el$21, () => $$props.details!.name);
    _$insert(_el$18, _$createComponent(IconButton, {
      icon: "eye",
      title: "Scroll into view",
      onClick: () => actions.scrollTo($$props.details!.id)
    }, "keeno-dfe3c3ff"), _el$23);
    _$insert(_el$18, _$createComponent(IconButton, {
      icon: "log",
      title: "Log to console as $keeno",
      onClick: () => actions.api.expose($$props.details!.id)
    }, "keeno-dfe3c3ff"), _el$24);
    _$insert(_el$18, _$and(() => $$props.details!.file, () => _$createComponent(IconButton, {
      icon: "open",
      get title() {
        return `Open ${$$props.details!.file} in your editor`;
      },
      onClick: () => actions.openFile($$props.details!.file!)
    }, "keeno-dfe3c3ff")));
    _$insert(_el$25, _$cond(() => $$props.details!.file, () => {
      const _el$7 = _tmpl$3();
      _$on(_el$7, "click", () => actions.openFile($$props.details!.file!));
      _$insert(_el$7, () => $$props.details!.file);
      return _el$7;
    }, () => _tmpl$4()), _el$26);
    _$insert(_el$27, () => $$props.details!.updates, _el$29);
    _$insert(_el$27, _$cond(() => $$props.details!.updates === 1, () => '', () => 's'));
    _$insert(_el$17, _$createComponent(Section, {
      title: "Props",
      get count() {
        return propKeys.get().length;
      },
      children: () => [_$mapKeyed(() => propKeys.get(), k => k, k => {
        const _el$9 = _tmpl$5();
        const _el$10 = _el$9.firstChild;
        const _el$11 = _el$10.nextSibling;
        const _el$12 = _el$11.nextSibling;
        _$insert(_el$10, () => k.get());
        _$insert(_el$12, _$createComponent(Value, {
          get value() {
            return $$props.details!.props[k.get()];
          }
        }, "keeno-dfe3c3ff"));
        return _el$9;
      }), _$and(() => propKeys.get().length === 0, () => _tmpl$6())]
    }, "keeno-dfe3c3ff"), _el$30);
    _$insert(_el$17, _$createComponent(Section, {
      title: "State",
      get count() {
        return $$props.details!.states.length;
      },
      children: () => [_$mapKeyed(() => $$props.details!.states, s => s.id, s => _$createComponent(SignalRow, {
        get signal() {
          return s.get();
        }
      }, "keeno-dfe3c3ff")), _$and(() => $$props.details!.states.length === 0, () => _tmpl$6())]
    }, "keeno-dfe3c3ff"), _el$31);
    _$insert(_el$17, _$and(() => errors.get().length > 0, () => _$createComponent(Section, {
      title: "Errors",
      get count() {
        return errors.get().length;
      },
      children: () => _$mapKeyed(() => errors.get(), e => e.i, e => {
        const _el$15 = _tmpl$7();
        const _el$16 = _el$15.firstChild;
        _$insert(_el$16, _$createComponent(Value, {
          get value() {
            return e.get().error;
          }
        }, "keeno-dfe3c3ff"));
        return _el$15;
      })
    }, "keeno-dfe3c3ff")));
    return _el$17;
  }));
  return _el$32;
}
