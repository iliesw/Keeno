// Generated from ../ui/SignalRow.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, derived, update, ref } from "../../index";
import { attr as _$attr, insert as _$insert, setRef as _$setRef, bind as _$bind, on as _$on, and as _$and, createComponent as _$createComponent, cond as _$cond, template as _$template } from "../../internal";
// One state or derived: its badges, its value, and editing (inline for primitives, JSON for
// anything). The row is keyed by the signal, so an edit in progress survives refreshes.
import IconButton from "./IconButton";
import Value from "./Value";
import { expandable, parseInput, preview, useActions, valueClass, type DevSignal } from '../shared';
const _tmpl$1 = _$template("<span class=\"badge derived keeno-81c7abb8\" title=\"Read-only, computed\">derived</span>");
const _tmpl$2 = _$template("<span class=\"badge keeno-81c7abb8\">persist</span>");
const _tmpl$3 = _$template("<span class=\"badge keeno-81c7abb8\">?</span>");
const _tmpl$4 = _$template("<span class=\"badge pending keeno-81c7abb8\" title=\"A debounced or throttled write is waiting\">pending</span>");
const _tmpl$5 = _$template("<span class=\"v-err keeno-81c7abb8\"></span>");
const _tmpl$6 = _$template("<span class=\"edit-err keeno-81c7abb8\"></span>");
const _tmpl$7 = _$template("<span class=\"inline-wrap keeno-81c7abb8\"><input class=\"inline keeno-81c7abb8\" spellcheck=\"false\"></span>");
const _tmpl$8 = _$template("<label class=\"bool-edit keeno-81c7abb8\"><input type=\"checkbox\" class=\"keeno-81c7abb8\"><span class=\"v-bool keeno-81c7abb8\"></span></label>");
const _tmpl$9 = _$template("<span class=\"keeno-81c7abb8\" title=\"Click to edit\"></span>");
const _tmpl$10 = _$template("<span class=\"hist-wrap keeno-81c7abb8\"><!----><span class=\"hist keeno-81c7abb8\"><!---->·</span></span>");
const _tmpl$11 = _$template("<span class=\"muted small keeno-81c7abb8\">Ctrl+Enter to apply · Esc to cancel</span>");
const _tmpl$12 = _$template("<div class=\"json-edit keeno-81c7abb8\"><textarea class=\"json keeno-81c7abb8\" spellcheck=\"false\"></textarea><div class=\"json-actions keeno-81c7abb8\"><!----><div class=\"spacer keeno-81c7abb8\"></div><button class=\"btn keeno-81c7abb8\">Cancel</button><button class=\"btn primary keeno-81c7abb8\">Apply</button></div></div>");
const _tmpl$13 = _$template("<div class=\"srow keeno-81c7abb8\"><div class=\"kv state keeno-81c7abb8\"><span class=\"key keeno-81c7abb8\"></span><!----><!----><!----><!----><span class=\"colon keeno-81c7abb8\">:</span><span class=\"val keeno-81c7abb8\"><!----><!----><!----><!----></span><span class=\"row-actions keeno-81c7abb8\"><!----></span></div></div>");
export default function SignalRow($$props) {
  const {
    api
  } = useActions();
  const mode = state<'view' | 'inline' | 'json'>('view');
  const draft = state('');
  const error = state('');
  const input = ref<HTMLInputElement>();
  const area = ref<HTMLTextAreaElement>();
  const editable = derived(() => $$props.signal.kind === 'state' && !$$props.signal.error);
  const show = derived(() => {
    if ($$props.signal.error) return 'error';
    if (mode.get() === 'inline') return 'inline';
    if (editable.get() && typeof $$props.signal.value === 'boolean') return 'bool';
    if (editable.get() && !expandable($$props.signal.value) && typeof $$props.signal.value !== 'function') return 'click';
    return 'value';
  });
  function startInline() {
    draft.set(typeof $$props.signal.value === 'string' ? $$props.signal.value : preview($$props.signal.value));
    error.set('');
    mode.set('inline');
  }
  function startJson() {
    let text: string;
    try {
      text = JSON.stringify($$props.signal.value, null, 2) ?? 'undefined';
    } catch {
      text = preview($$props.signal.value);
    }
    draft.set(text);
    error.set('');
    mode.set('json');
  }
  function commit() {
    // In the JSON editor a string state takes JSON too (`"text"`), so parse as for a non-string.
    const current = mode.get() === 'json' && typeof $$props.signal.value === 'string' ? 0 : $$props.signal.value;
    const parsed = parseInput(draft.get(), current);
    if (!parsed.ok) return error.set(parsed.error);
    mode.set('view');
    api.set($$props.signal.id, parsed.value);
  }
  function cancel() {
    mode.set('view');
    error.set('');
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (mode.get() !== 'json' || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') cancel();
  }
  update(() => {
    if (mode.get() === 'inline' && input.current) {
      input.current.focus();
      input.current.select();
    }
    if (mode.get() === 'json') area.current?.focus();
  }, [mode, () => input.current, () => area.current]);
  const _el$26 = _tmpl$13();
  const _el$27 = _el$26.firstChild;
  const _el$28 = _el$27.firstChild;
  const _el$29 = _el$28.nextSibling;
  const _el$30 = _el$29.nextSibling;
  const _el$31 = _el$30.nextSibling;
  const _el$32 = _el$31.nextSibling;
  const _el$33 = _el$32.nextSibling;
  const _el$34 = _el$33.nextSibling;
  const _el$35 = _el$34.firstChild;
  const _el$36 = _el$35.nextSibling;
  const _el$37 = _el$36.nextSibling;
  const _el$38 = _el$37.nextSibling;
  const _el$39 = _el$34.nextSibling;
  const _el$40 = _el$39.firstChild;
  _$insert(_el$28, () => $$props.signal.name);
  _$insert(_el$27, _$and(() => $$props.signal.kind === 'derived', () => _tmpl$1()), _el$29);
  _$insert(_el$27, _$and(() => $$props.signal.persist, () => {
    const _el$2 = _tmpl$2();
    _$attr(_el$2, "title", () => `localStorage "${$$props.signal.persist}"`);
    return _el$2;
  }), _el$30);
  _$insert(_el$27, _$and(() => $$props.signal.url, () => {
    const _el$3 = _tmpl$3();
    _$attr(_el$3, "title", () => `Query parameter ?${$$props.signal.url}`);
    _$insert(_el$3, () => $$props.signal.url);
    return _el$3;
  }), _el$31);
  _$insert(_el$27, _$and(() => $$props.signal.pending, () => _tmpl$4()), _el$32);
  _$insert(_el$34, _$and(() => show.get() === 'error', () => {
    const _el$5 = _tmpl$5();
    _$insert(_el$5, () => preview($$props.signal.error));
    return _el$5;
  }), _el$35);
  _$insert(_el$34, _$and(() => show.get() === 'inline', () => {
    const _el$7 = _tmpl$7();
    const _el$8 = _el$7.firstChild;
    _$setRef(_el$8, input);
    _$bind(_el$8, "value", draft);
    _$on(_el$8, "keydown", onKey);
    _$on(_el$8, "blur", () => mode.get() === 'inline' && cancel());
    _$insert(_el$7, _$and(() => error.get(), () => {
      const _el$6 = _tmpl$6();
      _$insert(_el$6, () => error.get());
      return _el$6;
    }));
    return _el$7;
  }), _el$36);
  _$insert(_el$34, _$and(() => show.get() === 'bool', () => {
    const _el$9 = _tmpl$8();
    const _el$10 = _el$9.firstChild;
    const _el$11 = _el$10.nextSibling;
    _$attr(_el$10, "checked", () => $$props.signal.value === true);
    _$on(_el$10, "change", e => api.set($$props.signal.id, (e.currentTarget as HTMLInputElement).checked));
    _$insert(_el$11, () => String($$props.signal.value));
    return _el$9;
  }), _el$37);
  _$insert(_el$34, _$and(() => show.get() === 'click', () => {
    const _el$12 = _tmpl$9();
    _$attr(_el$12, "class", () => [valueClass($$props.signal.value), 'editable'], "keeno-81c7abb8");
    _$on(_el$12, "click", startInline);
    _$insert(_el$12, () => preview($$props.signal.value));
    return _el$12;
  }), _el$38);
  _$insert(_el$34, _$and(() => show.get() === 'value', () => _$createComponent(Value, {
    get value() {
      return $$props.signal.value;
    }
  }, "keeno-81c7abb8")));
  _$insert(_el$39, _$and(() => $$props.signal.history, () => {
    const _el$13 = _tmpl$10();
    const _el$14 = _el$13.firstChild;
    const _el$15 = _el$14.nextSibling;
    const _el$16 = _el$15.firstChild;
    _$insert(_el$13, _$createComponent(IconButton, {
      icon: "undo",
      small: true,
      get title() {
        return `Undo (${$$props.signal.history.past})`;
      },
      get disabled() {
        return !$$props.signal.history.past;
      },
      onClick: () => api.undo($$props.signal.id)
    }, "keeno-81c7abb8"), _el$14);
    _$insert(_el$15, () => $$props.signal.history.past, _el$16);
    _$insert(_el$15, () => $$props.signal.history.future);
    _$insert(_el$13, _$createComponent(IconButton, {
      icon: "redo",
      small: true,
      get title() {
        return `Redo (${$$props.signal.history.future})`;
      },
      get disabled() {
        return !$$props.signal.history.future;
      },
      onClick: () => api.redo($$props.signal.id)
    }, "keeno-81c7abb8"));
    return _el$13;
  }), _el$40);
  _$insert(_el$39, _$and(() => editable.get(), () => _$createComponent(IconButton, {
    icon: "edit",
    small: true,
    title: "Edit as JSON",
    onClick: startJson
  }, "keeno-81c7abb8")));
  _$insert(_el$26, _$and(() => mode.get() === 'json', () => {
    const _el$19 = _tmpl$12();
    const _el$20 = _el$19.firstChild;
    const _el$21 = _el$20.nextSibling;
    const _el$22 = _el$21.firstChild;
    const _el$23 = _el$22.nextSibling;
    const _el$24 = _el$23.nextSibling;
    const _el$25 = _el$24.nextSibling;
    _$setRef(_el$20, area);
    _$attr(_el$20, "rows", () => Math.min(14, draft.get().split('\n').length + 1));
    _$bind(_el$20, "value", draft);
    _$on(_el$20, "keydown", onKey);
    _$insert(_el$21, _$cond(() => error.get(), () => {
      const _el$17 = _tmpl$6();
      _$insert(_el$17, () => error.get());
      return _el$17;
    }, () => _tmpl$11()), _el$22);
    _$on(_el$24, "click", cancel);
    _$on(_el$25, "click", commit);
    return _el$19;
  }));
  return _el$26;
}
