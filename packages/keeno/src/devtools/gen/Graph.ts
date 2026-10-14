// Generated from ../ui/Graph.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, derived } from "../../index";
import { attr as _$attr, insert as _$insert, on as _$on, cond as _$cond, and as _$and, mapKeyed as _$mapKeyed, template as _$template } from "../../internal";
// The Graph tab: the selected component's states and deriveds, what they read (left) and what
// reads them (right), as columns: a node sits one column after everything it reads.
import { useActions, type DevGraphNode } from '../shared';
const _tmpl$1 = _$template("<div class=\"empty keeno-74363710\">Select a component (or Stores) in the Components tab to see its dependency graph.</div>");
const _tmpl$2 = _$template("<div class=\"empty keeno-74363710\">This component has no states or deriveds.</div>");
const _tmpl$3 = _$template("<path class=\"keeno-74363710\"></path>", true);
const _tmpl$4 = _$template("<text class=\"pulse keeno-74363710\" y=\"16\" text-anchor=\"end\"></text>", true);
const _tmpl$5 = _$template("<g class=\"keeno-74363710\"><title class=\"keeno-74363710\"><!----></title><rect rx=\"6\" class=\"keeno-74363710\"></rect><text x=\"8\" y=\"16\" class=\"keeno-74363710\"></text></g>", true);
const _tmpl$6 = _$template("<div class=\"canvas keeno-74363710\"><svg class=\"keeno-74363710\"><!----></svg></div>");
const _tmpl$7 = _$template("<div class=\"graph-wrap keeno-74363710\"><div class=\"toolbar keeno-74363710\"><span class=\"keeno-74363710\"></span><span class=\"small muted keeno-74363710\"><!----> nodes · <!----> edges · reads flow left to right</span></div></div>");
const _tmpl$8 = _$template("<div class=\"view keeno-74363710\"><!----></div>");
export default function Graph($$props) {
  const {
    select
  } = useActions();
  const COL = 150;
  const ROW = 34;
  const W = 120;
  const H = 24;
  const PAD = 12;
  const hovered = state<string | null>(null);
  const layout = derived(() => {
    if (!$$props.graph) return null;
    const incoming = new Map<string, string[]>();
    for (const [from, to] of $$props.graph.edges) {
      const list = incoming.get(to);
      if (list) list.push(from);else incoming.set(to, [from]);
    }
    // Longest path from a node with no inputs (cycles can't happen: the graph is acyclic).
    const depth = new Map<string, number>();
    const depthOf = (id: string, seen: Set<string>): number => {
      const known = depth.get(id);
      if (known !== undefined) return known;
      if (seen.has(id)) return 0;
      seen.add(id);
      let d = 0;
      for (const src of incoming.get(id) ?? []) d = Math.max(d, depthOf(src, seen) + 1);
      depth.set(id, d);
      return d;
    };
    const columns: DevGraphNode[][] = [];
    for (const n of $$props.graph.nodes) (columns[depthOf(n.id, new Set())] ??= []).push(n);
    const pos = new Map<string, {
      x: number;
      y: number;
      node: DevGraphNode;
    }>();
    columns.forEach((col, c) => col.forEach((node, r) => pos.set(node.id, {
      x: PAD + c * COL,
      y: PAD + r * ROW,
      node
    })));
    const edges = $$props.graph.edges.filter(([a, b]) => pos.has(a) && pos.has(b)).map(([a, b]) => {
      const p = pos.get(a)!;
      const q = pos.get(b)!;
      const x1 = p.x + W;
      const y1 = p.y + H / 2;
      const x2 = q.x;
      const y2 = q.y + H / 2;
      const mid = (x1 + x2) / 2;
      return {
        key: `${a}>${b}`,
        a,
        b,
        d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`
      };
    });
    const rows = Math.max(1, ...columns.map(c => c?.length ?? 0));
    return {
      nodes: [...pos.values()],
      edges,
      width: PAD * 2 + (columns.length - 1) * COL + W,
      height: PAD * 2 + (rows - 1) * ROW + H
    };
  });
  const short = (s: string) => s.length > 16 ? s.slice(0, 15) + '…' : s;
  const lit = (a: string, b: string) => hovered.get() !== null && (a === hovered.get() || b === hovered.get());
  const _el$20 = _tmpl$8();
  const _el$21 = _el$20.firstChild;
  _$insert(_el$20, _$and(() => !$$props.graph, () => _tmpl$1()), _el$21);
  _$insert(_el$20, _$and(() => layout.get(), () => {
    const _el$13 = _tmpl$7();
    const _el$14 = _el$13.firstChild;
    const _el$15 = _el$14.firstChild;
    const _el$16 = _el$15.nextSibling;
    const _el$17 = _el$16.firstChild;
    const _el$18 = _el$17.nextSibling;
    const _el$19 = _el$18.nextSibling;
    _$insert(_el$15, () => $$props.title);
    _$insert(_el$16, () => layout.get().nodes.length, _el$17);
    _$insert(_el$16, () => layout.get().edges.length, _el$19);
    _$insert(_el$13, _$cond(() => layout.get().nodes.length === 0, () => _tmpl$2(), () => {
      const _el$10 = _tmpl$6();
      const _el$11 = _el$10.firstChild;
      const _el$12 = _el$11.firstChild;
      _$attr(_el$11, "width", () => layout.get().width);
      _$attr(_el$11, "height", () => layout.get().height);
      _$attr(_el$11, "viewBox", () => `0 0 ${layout.get().width} ${layout.get().height}`);
      _$insert(_el$11, _$mapKeyed(() => layout.get().edges, e => e.key, e => {
        const _el$3 = _tmpl$3();
        _$attr(_el$3, "class", () => ['edge', lit(e.get().a, e.get().b) && 'lit'], "keeno-74363710");
        _$attr(_el$3, "d", () => e.get().d);
        return _el$3;
      }), _el$12);
      _$insert(_el$11, _$mapKeyed(() => layout.get().nodes, p => p.node.id, p => {
        const _el$5 = _tmpl$5();
        const _el$6 = _el$5.firstChild;
        const _el$7 = _el$6.firstChild;
        const _el$8 = _el$6.nextSibling;
        const _el$9 = _el$8.nextSibling;
        _$attr(_el$5, "class", () => ['node', p.get().node.kind, p.get().node.own && 'own', p.get().node.component !== null && !p.get().node.own && 'link'], "keeno-74363710");
        _$attr(_el$5, "transform", () => `translate(${p.get().x},${p.get().y})`);
        _$on(_el$5, "mouseenter", () => hovered.set(p.get().node.id));
        _$on(_el$5, "mouseleave", () => hovered.set(null));
        _$on(_el$5, "click", () => !p.get().node.own && p.get().node.component !== null && select(p.get().node.component, true));
        _$insert(_el$6, _$cond(() => p.get().node.kind === 'component', () => `${p.get().node.label}: renders and effects`, () => p.get().node.label), _el$7);
        _$insert(_el$6, _$cond(() => p.get().node.componentName && p.get().node.kind !== 'component', () => ` (${p.get().node.componentName})`, () => ''));
        _$attr(_el$8, "width", () => W);
        _$attr(_el$8, "height", () => H);
        _$insert(_el$9, () => short(p.get().node.kind === 'component' ? `<${p.get().node.label}>` : p.get().node.label));
        _$insert(_el$5, _$and(() => p.get().node.kind === 'component' && p.get().node.component !== null && ($$props.pulses[p.get().node.component] ?? 0) > 0, () => {
          const _el$4 = _tmpl$4();
          _$attr(_el$4, "x", () => W - 8);
          _$insert(_el$4, () => $$props.pulses[p.get().node.component]);
          return _el$4;
        }));
        return _el$5;
      }));
      return _el$10;
    }));
    return _el$13;
  }));
  return _el$20;
}
