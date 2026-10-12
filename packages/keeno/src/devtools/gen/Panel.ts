// Generated from ../ui/Panel.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, derived, init, update } from "../../index";
import { insert as _$insert, attr as _$attr, on as _$on, and as _$and, createComponent as _$createComponent, mapKeyed as _$mapKeyed, template as _$template } from "../../internal";
// The dev tools panel: owns the UI state and talks to the runtime through `__KEENO_DEVTOOLS__`.
// It is mounted with `mountDevtools`, so the dev tools never inspect or react to it.
import { provide } from "../../index";
import Components from "./Components";
import IconButton from "./IconButton";
import Overlay from "./Overlay";
import Perf from "./Perf";
import Timeline from "./Timeline";
import { ActionsContext, DEFAULT_PREFS, STORES, getApi, rectOf, type Actions, type Box, type DevComponent, type DevEvent, type Prefs, type Tab, type TreeRow } from '../shared';
const _tmpl$1 = _$template("<span class=\"fab-err keeno-a46bb142\"></span>");
const _tmpl$2 = _$template("<button class=\"keeno-a46bb142\" title=\"Keeno dev tools (Alt+Shift+D)\"><span class=\"logo-mark keeno-a46bb142\"></span><span class=\"fab-name keeno-a46bb142\">Keeno</span></button>");
const _tmpl$3 = _$template("<button class=\"keeno-a46bb142\" role=\"tab\"></button>");
const _tmpl$4 = _$template("<div class=\"keeno-a46bb142\" role=\"dialog\" aria-label=\"Keeno dev tools\"><div class=\"resize keeno-a46bb142\"></div><header class=\"keeno-a46bb142\"><div class=\"logo keeno-a46bb142\"><span class=\"logo-mark keeno-a46bb142\"></span><span class=\"keeno-a46bb142\">Keeno</span></div><div class=\"tabs keeno-a46bb142\" role=\"tablist\"></div><div class=\"spacer keeno-a46bb142\"></div><!----><!----><!----></header><div class=\"body keeno-a46bb142\"><!----><!----></div></div>");
export default function Panel($$props) {
  const api = getApi();
  const TABS: {
    id: Tab;
    label: string;
  }[] = [{
    id: 'components',
    label: 'Components'
  }, {
    id: 'timeline',
    label: 'Timeline'
  }, {
    id: 'perf',
    label: 'Perf'
  }];
  const prefs = state<Prefs>(DEFAULT_PREFS, {
    persist: 'keeno-devtools',
    validate: next => ({
      ...DEFAULT_PREFS,
      ...(next && typeof next === 'object' ? next : {})
    })
  });
  /** Bumped (coalesced) whenever the app changes: everything read from the API follows it. */
  const tick = state(0);
  const selected = state<number | null>(null);
  const query = state('');
  const collapsed = state<number[]>([]);
  const picking = state(false);
  const highlight = state<{
    box: Box;
    label: string;
  } | null>(null);
  const flashes = state<{
    key: number;
    box: Box;
  }[]>([]);
  /** Updates per component since the panel opened: tree rows pulse when theirs changes. */
  const pulses = state<Record<number, number>>({});
  const errorCount = state(0);
  /** The timeline as it was when recording was paused. */
  const frozen = state<DevEvent[] | null>(null);
  const timelineQuery = state('');
  /** The panel width while it is being resized (saved on release). */
  const liveWidth = state<number | null>(null);
  /** True while the panel plays its close animation; it is removed afterwards. */
  const closing = state(false);
  /** True while the panel animates out before moving to the other side. */
  const moving = state(false);
  const tree = derived(() => {
    tick.get();
    return api.components();
  });
  const names = derived(() => {
    const m = new Map<number, string>();
    const go = (list: DevComponent[]) => {
      for (const c of list) {
        m.set(c.id, c.name);
        go(c.children);
      }
    };
    go(tree.get());
    return m;
  });
  const count = derived(() => names.get().size);
  const rows = derived(() => {
    const q = query.get().trim().toLowerCase();
    const closed = new Set(collapsed.get());
    const keep = new Map<number, boolean>();
    const mark = (n: DevComponent): boolean => {
      let any = !q || n.name.toLowerCase().includes(q) || !!n.file?.toLowerCase().includes(q);
      for (const c of n.children) if (mark(c)) any = true;
      keep.set(n.id, any);
      return any;
    };
    for (const r of tree.get()) mark(r);
    const out: TreeRow[] = [];
    const add = (n: DevComponent, depth: number) => {
      if (!keep.get(n.id)) return;
      const isClosed = !q && closed.has(n.id);
      out.push({
        id: n.id,
        name: n.name,
        file: n.file,
        depth,
        hasKids: n.children.some(c => keep.get(c.id)),
        collapsed: isClosed,
        updates: n.updates,
        errors: n.errors
      });
      if (!isClosed) for (const c of n.children) add(c, depth + 1);
    };
    for (const r of tree.get()) add(r, 0);
    return out;
  });
  const stores = derived(() => {
    tick.get();
    return api.stores();
  });
  const details = derived(() => {
    tick.get();
    return selected.get() === null || selected.get() === STORES ? null : api.details(selected.get());
  });
  const events = derived(() => {
    tick.get();
    return (frozen.get() ?? api.log()).slice().reverse();
  });
  const stats = derived(() => {
    tick.get();
    return prefs.get().open && prefs.get().tab === 'perf' ? api.stats() : null;
  });
  const width = derived(() => liveWidth.get() ?? prefs.get().width);

  // A selected component that unmounted.
  update(() => {
    if (selected.get() !== null && selected.get() !== STORES && !names.get().has(selected.get())) selected.set(null);
  }, [selected, () => STORES, names]);

  // A timer rather than requestAnimationFrame, which doesn't fire while the page isn't painted.
  let queued = false;
  function refresh() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      tick.set(tick.peek() + 1);
    }, 60);
  }
  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    prefs.set({
      ...prefs.get(),
      [key]: value
    });
  }

  /** Matches the `panel-out` animation. */
  const CLOSE_MS = 200;
  /** Space between the panel and the edge of the window (`--gap` in the styles). */
  const GAP = 4;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  function setOpen(open: boolean) {
    clearTimeout(closeTimer);
    if (open) {
      closing.set(false);
      if (!prefs.peek().open) setPref('open', true);
      pulses.set({});
      return;
    }
    if (!prefs.peek().open || closing.peek()) return;
    // Keep the panel mounted while it animates out.
    closing.set(true);
    highlight.set(null);
    closeTimer = setTimeout(() => {
      closing.set(false);
      setPref('open', false);
      pulses.set({});
    }, reducedMotion() ? 0 : CLOSE_MS);
  }

  /** Move the panel to the other side: it slides out toward its edge, then in from the other one. */
  function dock() {
    if (moving.peek() || closing.peek()) return;
    const flip = () => setPref('side', prefs.peek().side === 'right' ? 'left' : 'right');
    if (reducedMotion()) return flip();
    moving.set(true);
    setTimeout(() => {
      flip();
      moving.set(false);
    }, CLOSE_MS);
  }
  function setTab(tab: Tab) {
    setPref('tab', tab);
    pulses.set({});
  }
  function select(id: number | null, reveal = false) {
    if (id !== null && id !== STORES) {
      if (reveal) {
        const above = api.path(id).slice(0, -1);
        collapsed.set(collapsed.get().filter(c => !above.includes(c)));
      }
      api.expose(id, false);
    }
    selected.set(id);
    if (!prefs.get().open) setOpen(true);
    if (prefs.get().tab !== 'components') setTab('components');
  }
  function toggle(id: number) {
    collapsed.set(collapsed.get().includes(id) ? collapsed.get().filter(c => c !== id) : [...collapsed.get(), id]);
  }
  function highlightNodes(nodes: Node[], label: string) {
    const box = nodes.length ? rectOf(nodes) : null;
    highlight.set(box ? {
      box,
      label
    } : null);
  }
  function showHighlight(id: number | null) {
    if (id === null || id === STORES) return highlight.set(null);
    highlightNodes(api.nodes(id), `<${names.peek().get(id) ?? api.details(id)?.name ?? '?'}>`);
  }
  function scrollTo(id: number) {
    const nodes = api.nodes(id);
    const el = nodes.find((n): n is Element => n.nodeType === 1) ?? nodes[0]?.parentElement;
    el?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    setTimeout(() => showHighlight(id), 350);
    setTimeout(() => highlight.set(null), 1600);
  }
  let flashKey = 0;
  function flash(ids: number[]) {
    const added: {
      key: number;
      box: Box;
    }[] = [];
    for (const id of ids.slice(0, 60)) {
      const box = rectOf(api.nodes(id));
      if (box) added.push({
        key: ++flashKey,
        box
      });
    }
    if (!added.length) return;
    flashes.set([...flashes.peek(), ...added]);
    const done = new Set(added.map(f => f.key));
    setTimeout(() => flashes.set(flashes.peek().filter(f => !done.has(f.key))), 700);
  }
  function openFile(file: string) {
    fetch(`/__open-in-editor?file=${encodeURIComponent(file)}`).catch(() => {
      console.warn(`[keeno] could not open ${file}: the dev server has no /__open-in-editor endpoint`);
    });
  }

  // Picker: hover to outline, click to select. Events on the page are swallowed meanwhile.
  const ours = (e: Event) => e.composedPath().includes($$props.host);
  const swallow = (e: Event) => {
    if (ours(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const pickerEvents: [string, EventListener][] = [['pointermove', e => ours(e) || showHighlight(api.at(e.target as Node))], ['pointerdown', swallow], ['mousedown', swallow], ['pointerup', swallow], ['mouseup', swallow], ['click', e => {
    if (ours(e)) return;
    swallow(e);
    const id = api.at(e.target as Node);
    stopPicker();
    if (id !== null) select(id, true);
  }], ['keydown', e => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    swallow(e);
    stopPicker();
  }]];
  let cursorBefore = '';
  function startPicker() {
    if (picking.peek()) return;
    picking.set(true);
    cursorBefore = document.documentElement.style.cursor;
    document.documentElement.style.cursor = 'crosshair';
    for (const [type, fn] of pickerEvents) window.addEventListener(type, fn, true);
  }
  function stopPicker() {
    if (!picking.peek()) return;
    picking.set(false);
    document.documentElement.style.cursor = cursorBefore;
    for (const [type, fn] of pickerEvents) window.removeEventListener(type, fn, true);
    highlight.set(null);
  }
  function startResize(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    const onMove = (ev: PointerEvent) => {
      const w = prefs.peek().side === 'right' ? innerWidth - GAP - ev.clientX : ev.clientX - GAP;
      liveWidth.set(Math.max(300, Math.min(innerWidth - 2 * GAP, Math.round(w))));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.classList.remove('dragging');
      const w = liveWidth.peek();
      if (w !== null) setPref('width', w);
      liveWidth.set(null);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }
  function pause() {
    frozen.set(frozen.get() ? null : api.log());
  }
  function clear() {
    api.clearLog();
    frozen.set(frozen.get() ? [] : null);
    errorCount.set(0);
    refresh();
  }
  const actions: Actions = {
    api,
    select,
    toggle,
    highlight: showHighlight,
    highlightNodes,
    scrollTo,
    openFile,
    startPicker,
    setSplit: fraction => setPref('split', fraction),
    refresh
  };
  provide(ActionsContext, actions);
  init(() => {
    const off = api.subscribe(m => {
      if (m.type === 'flush' && m.rendered.length) {
        if (prefs.peek().open) {
          const next = {
            ...pulses.peek()
          };
          for (const id of m.rendered) next[id] = (next[id] ?? 0) + 1;
          pulses.set(next);
        }
        if (prefs.peek().flash) flash(m.rendered);
      } else if (m.type === 'error') errorCount.set(errorCount.peek() + 1);
      if (m.type === 'write' && frozen.peek()) return;
      refresh();
    });
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyD') {
        e.preventDefault();
        setOpen(!prefs.peek().open || closing.peek());
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        if (picking.peek()) stopPicker();else startPicker();
      }
    };
    const unhighlight = () => picking.peek() || highlight.set(null);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', unhighlight);
    window.addEventListener('scroll', unhighlight, true);
    console.info('%cKeeno%c dev tools ready: Alt+Shift+D to open, Alt+Shift+C to pick a component.', 'font-weight:bold', 'color:inherit');
    return () => {
      off();
      stopPicker();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', unhighlight);
      window.removeEventListener('scroll', unhighlight, true);
    };
  });
  return [_$createComponent(Overlay, {
    get highlight() {
      return highlight.get();
    },
    get flashes() {
      return flashes.get();
    }
  }, "keeno-a46bb142"), _$and(() => !prefs.get().open, () => {
    const _el$2 = _tmpl$2();
    _$attr(_el$2, "class", () => ['fab', prefs.get().side], "keeno-a46bb142");
    _$on(_el$2, "click", () => setOpen(true));
    _$insert(_el$2, _$and(() => errorCount.get() > 0, () => {
      const _el$1 = _tmpl$1();
      _$insert(_el$1, () => errorCount.get());
      return _el$1;
    }));
    return _el$2;
  }), _$and(() => prefs.get().open, () => {
    const _el$4 = _tmpl$4();
    const _el$5 = _el$4.firstChild;
    const _el$6 = _el$5.nextSibling;
    const _el$7 = _el$6.firstChild;
    const _el$8 = _el$7.nextSibling;
    const _el$9 = _el$8.nextSibling;
    const _el$10 = _el$9.nextSibling;
    const _el$11 = _el$10.nextSibling;
    const _el$12 = _el$11.nextSibling;
    const _el$13 = _el$6.nextSibling;
    const _el$14 = _el$13.firstChild;
    const _el$15 = _el$14.nextSibling;
    _$attr(_el$4, "class", () => ['panel', prefs.get().side === 'left' && 'left', (closing.get() || moving.get()) && 'closing'], "keeno-a46bb142");
    _$attr(_el$4, "style", () => `width:min(${width.get()}px, calc(100vw - ${2 * GAP}px))`);
    _$on(_el$5, "pointerdown", startResize);
    _$insert(_el$8, _$mapKeyed(() => TABS, t => t.id, t => {
      const _el$3 = _tmpl$3();
      _$attr(_el$3, "class", () => ['tab', prefs.get().tab === t.get().id && 'active'], "keeno-a46bb142");
      _$attr(_el$3, "aria-selected", () => prefs.get().tab === t.get().id ? 'true' : 'false');
      _$on(_el$3, "click", () => setTab(t.get().id));
      _$insert(_el$3, () => t.get().label);
      return _el$3;
    }));
    _$insert(_el$6, _$createComponent(IconButton, {
      icon: "pick",
      title: "Pick a component on the page (Alt+Shift+C)",
      get on() {
        return picking.get();
      },
      onClick: () => picking.get() ? stopPicker() : startPicker()
    }, "keeno-a46bb142"), _el$10);
    _$insert(_el$6, _$createComponent(IconButton, {
      icon: "flash",
      title: "Highlight updates",
      get on() {
        return prefs.get().flash;
      },
      onClick: () => setPref('flash', !prefs.get().flash)
    }, "keeno-a46bb142"), _el$11);
    _$insert(_el$6, _$createComponent(IconButton, {
      icon: "dock",
      title: "Dock to the other side",
      onClick: dock
    }, "keeno-a46bb142"), _el$12);
    _$insert(_el$6, _$createComponent(IconButton, {
      icon: "close",
      title: "Close (Alt+Shift+D)",
      onClick: () => setOpen(false)
    }, "keeno-a46bb142"));
    _$insert(_el$13, _$and(() => prefs.get().tab === 'components', () => _$createComponent(Components, {
      get rows() {
        return rows.get();
      },
      get selected() {
        return selected.get();
      },
      get query() {
        return query.get();
      },
      onQuery: q => query.set(q),
      get pulses() {
        return pulses.get();
      },
      get details() {
        return details.get();
      },
      get stores() {
        return stores.get();
      },
      get split() {
        return prefs.get().split;
      }
    }, "keeno-a46bb142")), _el$14);
    _$insert(_el$13, _$and(() => prefs.get().tab === 'timeline', () => _$createComponent(Timeline, {
      get events() {
        return events.get();
      },
      get paused() {
        return frozen.get() !== null;
      },
      get query() {
        return timelineQuery.get();
      },
      onQuery: q => timelineQuery.set(q),
      onPause: pause,
      onClear: clear
    }, "keeno-a46bb142")), _el$15);
    _$insert(_el$13, _$and(() => prefs.get().tab === 'perf', () => _$createComponent(Perf, {
      get stats() {
        return stats.get();
      }
    }, "keeno-a46bb142")));
    return _el$4;
  })];
}
