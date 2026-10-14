// Generated from ../ui/Router.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, derived } from "../../index";
import { attr as _$attr, or as _$or, insert as _$insert, on as _$on, mapKeyed as _$mapKeyed, and as _$and, createComponent as _$createComponent, cond as _$cond, template as _$template } from "../../internal";
// The Router tab: where each browser <Router> is, its routes, and the navigations so far.
import IconButton from "./IconButton";
import Section from "./Section";
import Value from "./Value";
import { formatTime, useActions, type DevRouter } from '../shared';
const _tmpl$1 = _$template("<option class=\"keeno-52011381\"></option>");
const _tmpl$2 = _$template("<select class=\"pick keeno-52011381\"></select>");
const _tmpl$3 = _$template("<div class=\"toolbar keeno-52011381\"><!----><input class=\"search keeno-52011381\" type=\"text\" placeholder=\"Go to /path?query#hash\" spellcheck=\"false\"></div>");
const _tmpl$4 = _$template("<span class=\"muted keeno-52011381\"></span>");
const _tmpl$5 = _$template("<span class=\"v-str keeno-52011381\"></span>");
const _tmpl$6 = _$template("<span class=\"v-num keeno-52011381\"></span>");
const _tmpl$7 = _$template("<span class=\"keeno-52011381\">matched <span class=\"pattern keeno-52011381\"></span></span>");
const _tmpl$8 = _$template("<span class=\"v-err keeno-52011381\">no route matches</span>");
const _tmpl$9 = _$template("<div class=\"kv keeno-52011381\"><span class=\"key keeno-52011381\"></span><span class=\"colon keeno-52011381\">:</span><span class=\"val keeno-52011381\"></span></div>");
const _tmpl$10 = _$template("<div class=\"muted small pad keeno-52011381\">None</div>");
const _tmpl$11 = _$template("<span class=\"muted keeno-52011381\"><!----> › </span>");
const _tmpl$12 = _$template("<span class=\"badge keeno-52011381\"></span>");
const _tmpl$13 = _$template("<div class=\"keeno-52011381\"><span class=\"pattern keeno-52011381\"></span><span class=\"route-comp keeno-52011381\"><!----><span class=\"tag keeno-52011381\">&lt;<span class=\"name keeno-52011381\"></span>&gt;</span></span></div>");
const _tmpl$14 = _$template("<div class=\"nav keeno-52011381\"><span class=\"muted time keeno-52011381\"></span><span class=\"nav-path keeno-52011381\"></span><span class=\"pattern muted keeno-52011381\"></span></div>");
const _tmpl$15 = _$template("<div class=\"router keeno-52011381\"><div class=\"here keeno-52011381\"><div class=\"here-path keeno-52011381\"><!----><!----><!----></div><div class=\"meta keeno-52011381\"></div></div><!----><!----><!----></div>");
const _tmpl$16 = _$template("<div class=\"empty keeno-52011381\">No router on the page. Render a <code class=\"keeno-52011381\">&lt;Router&gt;</code> from <code class=\"keeno-52011381\">@inflector/keeno-router</code> to see its routes here.</div>");
const _tmpl$17 = _$template("<div class=\"view keeno-52011381\"><!----></div>");
export default function Router($$props) {
  const actions = useActions();

  /** Which router is shown, when the page has several. */
  const index = state(0);
  /** What is typed in the "go to" field. */
  const target = state('');
  const router = derived(() => $$props.routers[Math.min(index.get(), $$props.routers.length - 1)] ?? null);
  const loc = derived(() => router.get()?.location ?? null);
  const params = derived(() => loc.get() ? Object.entries(loc.get().params).map(e => ({
    key: e[0],
    value: e[1]
  })) : []);
  const query = derived(() => loc.get() ? [...new URLSearchParams(loc.get().search)].map((e, i) => ({
    key: `${i}:${e[0]}`,
    name: e[0],
    value: e[1]
  })) : []);
  const history = derived(() => router.get() ? router.get().history.slice().reverse() : []);
  const routes = derived(() => (router.get()?.routes ?? []).map((r, i) => ({
    ...r,
    key: `${i}:${r.path}`,
    active: r.path === loc.get()?.matched,
    dynamic: /[:*]/.test(r.path)
  })));
  function go(to: string) {
    const path = to.trim();
    if (!path || !router.get()) return;
    actions.api.navigate(router.get().id, path);
    actions.refresh();
  }

  /** A route without params is navigated to; one with params is put in the field to fill in. */
  function pickRoute(path: string, dynamic: boolean) {
    if (dynamic) target.set(path);else go(path);
  }
  const full = (l: {
    path: string;
    search: string;
    hash: string;
  }) => l.path + l.search + l.hash;
  const _el$48 = _tmpl$17();
  const _el$49 = _el$48.firstChild;
  _$insert(_el$48, _$and(() => router.get(), () => {
    const _el$3 = _tmpl$3();
    const _el$4 = _el$3.firstChild;
    const _el$5 = _el$4.nextSibling;
    _$insert(_el$3, _$and(() => $$props.routers.length > 1, () => {
      const _el$2 = _tmpl$2();
      _$attr(_el$2, "value", () => String(index.get()));
      _$on(_el$2, "change", e => index.set(Number((e.currentTarget as HTMLSelectElement).value)));
      _$insert(_el$2, _$mapKeyed(() => $$props.routers, (r, i) => r.id, (r, i) => {
        const _el$1 = _tmpl$1();
        _$attr(_el$1, "value", () => String(i.get()));
        _$insert(_el$1, _$or(() => r.get().base, () => '/'));
        return _el$1;
      }));
      return _el$2;
    }), _el$4);
    _$attr(_el$5, "value", () => target.get());
    _$on(_el$5, "input", e => target.set((e.currentTarget as HTMLInputElement).value));
    _$on(_el$5, "keydown", e => e.key === 'Enter' && go(target.get()));
    _$insert(_el$3, _$createComponent(IconButton, {
      icon: "go",
      title: "Navigate",
      get disabled() {
        return !target.get().trim();
      },
      onClick: () => go(target.get())
    }, "keeno-52011381"));
    return _el$3;
  }), _el$49);
  _$insert(_el$48, _$cond(() => router.get(), () => {
    const _el$37 = _tmpl$15();
    const _el$38 = _el$37.firstChild;
    const _el$39 = _el$38.firstChild;
    const _el$40 = _el$39.firstChild;
    const _el$41 = _el$40.nextSibling;
    const _el$42 = _el$41.nextSibling;
    const _el$43 = _el$39.nextSibling;
    const _el$44 = _el$38.nextSibling;
    const _el$45 = _el$44.nextSibling;
    const _el$46 = _el$45.nextSibling;
    _$attr(_el$39, "title", () => full(loc.get()!));
    _$insert(_el$39, _$and(() => router.get().base, () => {
      const _el$6 = _tmpl$4();
      _$insert(_el$6, () => router.get().base);
      return _el$6;
    }), _el$40);
    _$insert(_el$39, () => loc.get()!.path, _el$41);
    _$insert(_el$39, _$and(() => loc.get()!.search, () => {
      const _el$7 = _tmpl$5();
      _$insert(_el$7, () => loc.get()!.search);
      return _el$7;
    }), _el$42);
    _$insert(_el$39, _$and(() => loc.get()!.hash, () => {
      const _el$8 = _tmpl$6();
      _$insert(_el$8, () => loc.get()!.hash);
      return _el$8;
    }));
    _$insert(_el$43, _$cond(() => loc.get()!.matched, () => {
      const _el$9 = _tmpl$7();
      const _el$10 = _el$9.firstChild;
      const _el$11 = _el$10.nextSibling;
      _$insert(_el$11, () => loc.get()!.matched);
      return _el$9;
    }, () => _tmpl$8()));
    _$insert(_el$37, _$createComponent(Section, {
      title: "Params",
      get count() {
        return params.get().length;
      },
      children: () => [_$mapKeyed(() => params.get(), p => p.key, p => {
        const _el$13 = _tmpl$9();
        const _el$14 = _el$13.firstChild;
        const _el$15 = _el$14.nextSibling;
        const _el$16 = _el$15.nextSibling;
        _$insert(_el$14, () => p.get().key);
        _$insert(_el$16, _$createComponent(Value, {
          get value() {
            return p.get().value;
          }
        }, "keeno-52011381"));
        return _el$13;
      }), _$and(() => params.get().length === 0, () => _tmpl$10())]
    }, "keeno-52011381"), _el$44);
    _$insert(_el$37, _$createComponent(Section, {
      title: "Query",
      get count() {
        return query.get().length;
      },
      children: () => [_$mapKeyed(() => query.get(), q => q.key, q => {
        const _el$18 = _tmpl$9();
        const _el$19 = _el$18.firstChild;
        const _el$20 = _el$19.nextSibling;
        const _el$21 = _el$20.nextSibling;
        _$insert(_el$19, () => q.get().name);
        _$insert(_el$21, _$createComponent(Value, {
          get value() {
            return q.get().value;
          }
        }, "keeno-52011381"));
        return _el$18;
      }), _$and(() => query.get().length === 0, () => _tmpl$10())]
    }, "keeno-52011381"), _el$45);
    _$insert(_el$37, _$createComponent(Section, {
      title: "Routes",
      get count() {
        return routes.get().length;
      },
      children: () => _$mapKeyed(() => routes.get(), r => r.key, r => {
        const _el$26 = _tmpl$13();
        const _el$27 = _el$26.firstChild;
        const _el$28 = _el$27.nextSibling;
        const _el$29 = _el$28.firstChild;
        const _el$30 = _el$29.nextSibling;
        const _el$31 = _el$30.firstChild;
        const _el$32 = _el$31.nextSibling;
        _$attr(_el$26, "class", () => ['route', r.get().active && 'active'], "keeno-52011381");
        _$attr(_el$26, "title", () => r.get().dynamic ? 'Fill in the params to navigate' : `Go to ${r.get().path}`);
        _$on(_el$26, "click", () => pickRoute(r.get().path, r.get().dynamic));
        _$insert(_el$27, () => r.get().path);
        _$insert(_el$28, _$mapKeyed(() => r.get().layouts, l => l, l => {
          const _el$23 = _tmpl$11();
          const _el$24 = _el$23.firstChild;
          _$insert(_el$23, () => l.get(), _el$24);
          return _el$23;
        }), _el$29);
        _$insert(_el$32, () => r.get().component);
        _$insert(_el$26, _$mapKeyed(() => r.get().errors, s => s, s => {
          const _el$25 = _tmpl$12();
          _$attr(_el$25, "title", () => `Has a ${s.get()} page`);
          _$insert(_el$25, () => s.get());
          return _el$25;
        }));
        return _el$26;
      })
    }, "keeno-52011381"), _el$46);
    _$insert(_el$37, _$createComponent(Section, {
      title: "History",
      get count() {
        return history.get().length;
      },
      children: () => _$mapKeyed(() => history.get(), n => n.seq, n => {
        const _el$33 = _tmpl$14();
        const _el$34 = _el$33.firstChild;
        const _el$35 = _el$34.nextSibling;
        const _el$36 = _el$35.nextSibling;
        _$attr(_el$33, "title", () => `Go to ${full(n.get())}`);
        _$on(_el$33, "click", () => go(full(n.get())));
        _$insert(_el$34, () => formatTime(n.get().time));
        _$insert(_el$35, () => full(n.get()));
        _$insert(_el$36, () => n.get().matched ?? '—');
        return _el$33;
      })
    }, "keeno-52011381"));
    return _el$37;
  }, () => _tmpl$16()));
  return _el$48;
}
