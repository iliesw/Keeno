// Generated from ../ui/Tree.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { derived, update, ref } from "../../index";
import { attr as _$attr, on as _$on, insert as _$insert, cond as _$cond, and as _$and, setRef as _$setRef, mapKeyed as _$mapKeyed, template as _$template } from "../../internal";
// The flattened component tree: select, collapse, hover to outline, arrow keys to move.
import { STORES, useActions, type TreeRow } from '../shared';
const _tmpl$1 = _$template("<div class=\"keeno-113ec896\"><span class=\"caret none keeno-113ec896\"></span><span class=\"store-mark keeno-113ec896\">◆</span><span class=\"keeno-113ec896\">Stores</span><span class=\"count keeno-113ec896\"></span></div>");
const _tmpl$2 = _$template("<mark class=\"keeno-113ec896\"></mark>");
const _tmpl$3 = _$template("<span class=\"err-badge keeno-113ec896\">!</span>");
const _tmpl$4 = _$template("<span class=\"renders keeno-113ec896\">×</span>");
const _tmpl$5 = _$template("<div class=\"keeno-113ec896\"><span class=\"keeno-113ec896\"></span><span class=\"keeno-113ec896\">&lt;<span class=\"name keeno-113ec896\"><!----><!----></span>&gt;</span><!----></div>");
const _tmpl$6 = _$template("<div class=\"empty keeno-113ec896\"></div>");
const _tmpl$7 = _$template("<div class=\"tree keeno-113ec896\" tabindex=\"0\"><!----><!----></div>");
export default function Tree($$props) {
  const actions = useActions();
  const el = ref<HTMLDivElement>();
  const showStores = derived(() => $$props.storesCount > 0 && !$$props.query.trim());

  /** The name split around the search match: [before, match, after]. */
  function parts(name: string): [string, string, string] {
    const q = $$props.query.trim().toLowerCase();
    const i = q ? name.toLowerCase().indexOf(q) : -1;
    return i < 0 ? [name, '', ''] : [name.slice(0, i), name.slice(i, i + q.length), name.slice(i + q.length)];
  }
  function move(id: number) {
    actions.select(id);
    actions.highlight(id === STORES ? null : id);
  }
  function onKey(e: KeyboardEvent) {
    const ids = [...(showStores.get() ? [STORES] : []), ...$$props.rows.map(r => r.id)];
    const i = $$props.selected === null ? -1 : ids.indexOf($$props.selected);
    const row = $$props.rows.find(r => r.id === $$props.selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next !== undefined) move(next);
    } else if (e.key === 'ArrowRight' && row) {
      e.preventDefault();
      if (row.collapsed) actions.toggle(row.id);
    } else if (e.key === 'ArrowLeft' && row) {
      e.preventDefault();
      if (row.hasKids && !row.collapsed) actions.toggle(row.id);else {
        const parent = actions.api.path(row.id).at(-2);
        if (parent !== undefined) move(parent);
      }
    } else if (e.key === 'Enter' && row) actions.scrollTo(row.id);
  }

  // Keep the selected row in view (selection also changes from the picker and the timeline).
  update(() => {
    const id = $$props.selected;
    setTimeout(() => el.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({
      block: 'nearest'
    }));
  }, [() => $$props.selected, () => el.current]);
  const _el$18 = _tmpl$7();
  const _el$19 = _el$18.firstChild;
  const _el$20 = _el$19.nextSibling;
  _$setRef(_el$18, el);
  _$on(_el$18, "keydown", onKey);
  _$on(_el$18, "mouseleave", () => actions.highlight(null));
  _$insert(_el$18, _$and(() => showStores.get(), () => {
    const _el$1 = _tmpl$1();
    const _el$2 = _el$1.firstChild;
    const _el$3 = _el$2.nextSibling;
    const _el$4 = _el$3.nextSibling;
    const _el$5 = _el$4.nextSibling;
    _$attr(_el$1, "class", () => ['row', 'stores', $$props.selected === STORES && 'sel'], "keeno-113ec896");
    _$attr(_el$1, "data-id", () => STORES);
    _$on(_el$1, "click", () => actions.select(STORES));
    _$insert(_el$5, () => $$props.storesCount);
    return _el$1;
  }), _el$19);
  _$insert(_el$18, _$mapKeyed(() => $$props.rows, r => r.id, r => {
    const _el$9 = _tmpl$5();
    const _el$10 = _el$9.firstChild;
    const _el$11 = _el$10.nextSibling;
    const _el$12 = _el$11.firstChild;
    const _el$13 = _el$12.nextSibling;
    const _el$14 = _el$13.firstChild;
    const _el$15 = _el$14.nextSibling;
    const _el$16 = _el$11.nextSibling;
    _$attr(_el$9, "class", () => ['row', $$props.selected === r.get().id && 'sel', $$props.pulses[r.get().id] && `pulse-${$$props.pulses[r.get().id] % 2}`], "keeno-113ec896");
    _$attr(_el$9, "style", () => `padding-left:${r.get().depth * 12 + 4}px`);
    _$attr(_el$9, "data-id", () => r.get().id);
    _$attr(_el$9, "title", () => r.get().file ?? undefined);
    _$on(_el$9, "click", () => actions.select(r.get().id));
    _$on(_el$9, "dblclick", () => actions.scrollTo(r.get().id));
    _$on(_el$9, "mouseenter", () => actions.highlight(r.get().id));
    _$attr(_el$10, "class", () => ['caret', !r.get().hasKids && 'none'], "keeno-113ec896");
    _$on(_el$10, "click", e => {
      e.stopPropagation();
      actions.toggle(r.get().id);
    });
    _$insert(_el$10, _$cond(() => r.get().hasKids, () => _$cond(() => r.get().collapsed, () => '▸', () => '▾'), () => ''));
    _$attr(_el$11, "class", () => ['tag', !r.get().file && 'builtin'], "keeno-113ec896");
    _$insert(_el$13, () => parts(r.get().name)[0], _el$14);
    _$insert(_el$13, _$and(() => parts(r.get().name)[1], () => {
      const _el$6 = _tmpl$2();
      _$insert(_el$6, () => parts(r.get().name)[1]);
      return _el$6;
    }), _el$15);
    _$insert(_el$13, () => parts(r.get().name)[2]);
    _$insert(_el$9, _$and(() => r.get().errors > 0, () => {
      const _el$7 = _tmpl$3();
      _$attr(_el$7, "title", () => `${r.get().errors} error(s)`);
      return _el$7;
    }), _el$16);
    _$insert(_el$9, _$and(() => r.get().updates > 0, () => {
      const _el$8 = _tmpl$4();
      _$attr(_el$8, "title", () => `Updated ${r.get().updates} time${r.get().updates === 1 ? '' : 's'}`);
      _$insert(_el$8, () => r.get().updates);
      return _el$8;
    }));
    return _el$9;
  }), _el$20);
  _$insert(_el$18, _$and(() => $$props.rows.length === 0, () => {
    const _el$17 = _tmpl$6();
    _$insert(_el$17, _$cond(() => $$props.query, () => 'No component matches.', () => 'No mounted components.'));
    return _el$17;
  }));
  return _el$18;
}
