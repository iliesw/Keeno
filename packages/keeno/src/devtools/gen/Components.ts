// Generated from ../ui/Components.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, ref } from "../../index";
import { setRef as _$setRef, attr as _$attr, on as _$on, createComponent as _$createComponent, insert as _$insert, template as _$template } from "../../internal";
// The Components tab: search + tree on top, inspector below, with a draggable split.
import Inspector from "./Inspector";
import Tree from "./Tree";
import { useActions, type DevDetails, type DevSignal, type TreeRow } from '../shared';
const _tmpl$1 = _$template("<div class=\"view components keeno-9f06b90e\"><div class=\"tree-wrap keeno-9f06b90e\"><div class=\"toolbar keeno-9f06b90e\"><input class=\"search keeno-9f06b90e\" type=\"search\" placeholder=\"Find component…\" spellcheck=\"false\"></div></div><div class=\"splitter keeno-9f06b90e\"></div></div>");
export default function Components($$props) {
  const actions = useActions();
  const view = ref<HTMLDivElement>();
  /** The split while the splitter is dragged (saved on release). */
  const live = state<number | null>(null);
  function startSplit(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    const onMove = (ev: PointerEvent) => {
      const r = view.current!.getBoundingClientRect();
      live.set(Math.max(0.15, Math.min(0.85, (ev.clientY - r.top) / r.height)));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.classList.remove('dragging');
      if (live.peek() !== null) actions.setSplit(live.peek()!);
      live.set(null);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }
  const _el$1 = _tmpl$1();
  const _el$2 = _el$1.firstChild;
  const _el$3 = _el$2.firstChild;
  const _el$4 = _el$3.firstChild;
  const _el$5 = _el$2.nextSibling;
  _$setRef(_el$1, view);
  _$attr(_el$1, "style", () => `--split:${Math.round((live.get() ?? $$props.split) * 100)}%`);
  _$attr(_el$4, "value", () => $$props.query);
  _$on(_el$4, "input", e => $$props.onQuery((e.currentTarget as HTMLInputElement).value));
  _$insert(_el$2, _$createComponent(Tree, {
    get rows() {
      return $$props.rows;
    },
    get selected() {
      return $$props.selected;
    },
    get storesCount() {
      return $$props.stores.length;
    },
    get query() {
      return $$props.query;
    },
    get pulses() {
      return $$props.pulses;
    }
  }, "keeno-9f06b90e"));
  _$on(_el$5, "pointerdown", startSplit);
  _$insert(_el$1, _$createComponent(Inspector, {
    get selected() {
      return $$props.selected;
    },
    get details() {
      return $$props.details;
    },
    get stores() {
      return $$props.stores;
    }
  }, "keeno-9f06b90e"));
  return _el$1;
}
