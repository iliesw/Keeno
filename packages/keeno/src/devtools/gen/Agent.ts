// Generated from ../ui/Agent.kn by scripts/build-devtools.ts. Edit the .kn file, then run `bun run devtools`.
// @ts-nocheck
import { state, derived } from "../../index";
import { attr as _$attr, on as _$on, cond as _$cond, insert as _$insert, and as _$and, createComponent as _$createComponent, mapKeyed as _$mapKeyed, template as _$template } from "../../internal";
// The Agent tab: connects Claude Code to the dev server's MCP endpoint in one click, and lists
// what coding agents do through it (every tool call, live, in every tab).
import IconButton from "./IconButton";
import { ago, mcpCommand, useActions, type McpActivity, type McpStatus } from '../shared';
const _tmpl$1 = _$template("<div class=\"empty keeno-da1ea03b\">The MCP endpoint is off. Remove <code class=\"keeno-da1ea03b\">mcp: false</code> from the Keeno plugin options in <code class=\"keeno-da1ea03b\">vite.config.ts</code> to let coding agents see the app.</div>");
const _tmpl$2 = _$template("<button class=\"btn primary keeno-da1ea03b\"></button>");
const _tmpl$3 = _$template("<div class=\"keeno-da1ea03b\"></div>");
const _tmpl$4 = _$template("<div class=\"note muted keeno-da1ea03b\">Ask Claude Code about the app (“why doesn't the total update?”) and its tool calls show up here.</div>");
const _tmpl$5 = _$template("<div class=\"setup keeno-da1ea03b\"><div class=\"setup-row keeno-da1ea03b\"><span class=\"keeno-da1ea03b\"></span><span class=\"setup-title keeno-da1ea03b\">Claude Code</span><span class=\"muted small keeno-da1ea03b\"></span><div class=\"spacer keeno-da1ea03b\"></div></div><div class=\"cmd keeno-da1ea03b\"><code class=\"keeno-da1ea03b\"></code></div><!----></div>");
const _tmpl$6 = _$template("<div class=\"empty keeno-da1ea03b\">No agent activity yet. What a coding agent reads and changes through MCP appears here as it happens.</div>");
const _tmpl$7 = _$template("<span class=\"badge keeno-da1ea03b\">other tab</span>");
const _tmpl$8 = _$template("<span class=\"ms keeno-da1ea03b\"><!---->ms</span>");
const _tmpl$9 = _$template("<button class=\"link small keeno-da1ea03b\">Select component </button>");
const _tmpl$10 = _$template("<pre class=\"code keeno-da1ea03b\"></pre>");
const _tmpl$11 = _$template("<div class=\"muted small keeno-da1ea03b\">by </div>");
const _tmpl$12 = _$template("<div class=\"detail keeno-da1ea03b\"><!----><!----><pre class=\"keeno-da1ea03b\"></pre></div>");
const _tmpl$13 = _$template("<div class=\"keeno-da1ea03b\"><button class=\"call-row keeno-da1ea03b\"><span class=\"time keeno-da1ea03b\"></span><span class=\"keeno-da1ea03b\"></span><span class=\"tool keeno-da1ea03b\"></span><span class=\"args keeno-da1ea03b\"></span><!----></button></div>");
const _tmpl$14 = _$template("<div class=\"view keeno-da1ea03b\"><div class=\"agent keeno-da1ea03b\"><!----><div class=\"toolbar feed-head keeno-da1ea03b\"><span class=\"feed-title keeno-da1ea03b\">Activity</span><span class=\"count keeno-da1ea03b\"></span><div class=\"spacer keeno-da1ea03b\"></div></div><!----><div class=\"feed keeno-da1ea03b\"></div></div></div>");
export default function Agent($$props) {
  const actions = useActions();
  const open = state<number | null>(null);
  const copied = state(false);

  /** An agent asked something in the last 5 minutes. */
  const connected = derived(() => !!$$props.status?.client && $$props.now - $$props.status.client.lastSeen < 5 * 60_000);
  const installed = derived(() => !!$$props.status?.installed && $$props.status.installed.url === $$props.status.url);
  const stale = derived(() => !!$$props.status?.installed && $$props.status.installed.url !== $$props.status.url);
  const command = derived(() => mcpCommand($$props.status?.url ?? `${location.origin}/__keeno/mcp`));

  /** The tools whose `id` is a component. */
  const COMPONENT_TOOLS = new Set(['keeno_inspect', 'keeno_dom']);

  /** Wall-clock time (calls are stamped by the server, not with performance.now). */
  const clock = (t: number) => new Date(t).toLocaleTimeString([], {
    hour12: false
  });
  function label(a: McpActivity): string {
    return a.tool.replace(/^keeno_/, '').replace(/_/g, ' ');
  }
  function argsText(a: McpActivity): string {
    const {
      page: _,
      ...args
    } = a.args as Record<string, unknown>;
    if (a.tool === 'keeno_eval') return String(args.code ?? '').replace(/\s+/g, ' ');
    return Object.entries(args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(command.get());
      copied.set(true);
      setTimeout(() => copied.set(false), 1500);
    } catch {
      console.info(command.get());
    }
  }
  const _el$31 = _tmpl$14();
  const _el$32 = _el$31.firstChild;
  const _el$33 = _el$32.firstChild;
  const _el$34 = _el$33.nextSibling;
  const _el$35 = _el$34.firstChild;
  const _el$36 = _el$35.nextSibling;
  const _el$37 = _el$34.nextSibling;
  const _el$38 = _el$37.nextSibling;
  _$insert(_el$32, _$cond(() => !$$props.available, () => _tmpl$1(), () => {
    const _el$5 = _tmpl$5();
    const _el$6 = _el$5.firstChild;
    const _el$7 = _el$6.firstChild;
    const _el$8 = _el$7.nextSibling;
    const _el$9 = _el$8.nextSibling;
    const _el$10 = _el$6.nextSibling;
    const _el$11 = _el$10.firstChild;
    const _el$12 = _el$10.nextSibling;
    _$attr(_el$7, "class", () => ['dot', connected.get() ? 'live' : installed.get() ? 'ready' : 'off'], "keeno-da1ea03b");
    _$insert(_el$9, _$cond(() => connected.get(), () => `connected · ${$$props.status!.client!.name} · active ${ago($$props.status!.client!.lastSeen, $$props.now)}`, () => _$cond(() => installed.get(), () => `added (${$$props.status!.installed!.scope}) · waiting for a session`, () => _$cond(() => stale.get(), () => `configured for ${$$props.status!.installed!.url}`, () => _$cond(() => $$props.status, () => 'not set up', () => 'checking…')))));
    _$insert(_el$6, _$and(() => !installed.get(), () => {
      const _el$2 = _tmpl$2();
      _$attr(_el$2, "disabled", () => $$props.installing || !$$props.status);
      _$on(_el$2, "click", () => $$props.onInstall());
      _$insert(_el$2, _$cond(() => $$props.installing, () => 'Adding…', () => _$cond(() => stale.get(), () => 'Update', () => 'Add to Claude Code')));
      return _el$2;
    }));
    _$insert(_el$11, () => command.get());
    _$insert(_el$10, _$createComponent(IconButton, {
      icon: "copy",
      small: true,
      get title() {
        return copied.get() ? 'Copied' : 'Copy the command';
      },
      get on() {
        return copied.get();
      },
      onClick: copy
    }, "keeno-da1ea03b"));
    _$insert(_el$5, _$and(() => $$props.message, () => {
      const _el$3 = _tmpl$3();
      _$attr(_el$3, "class", () => ['note', $$props.message.ok ? 'ok' : 'bad'], "keeno-da1ea03b");
      _$insert(_el$3, () => $$props.message.text);
      return _el$3;
    }), _el$12);
    _$insert(_el$5, _$and(() => installed.get() && !connected.get() && !$$props.message, () => _tmpl$4()));
    return _el$5;
  }), _el$33);
  _$insert(_el$36, () => $$props.activity.length);
  _$insert(_el$34, _$createComponent(IconButton, {
    icon: "trash",
    title: "Clear",
    get disabled() {
      return !$$props.activity.length;
    },
    onClick: () => $$props.onClear()
  }, "keeno-da1ea03b"));
  _$insert(_el$32, _$and(() => $$props.activity.length === 0, () => _tmpl$6()), _el$37);
  _$insert(_el$38, _$mapKeyed(() => $$props.activity, a => a.id, a => {
    const _el$24 = _tmpl$13();
    const _el$25 = _el$24.firstChild;
    const _el$26 = _el$25.firstChild;
    const _el$27 = _el$26.nextSibling;
    const _el$28 = _el$27.nextSibling;
    const _el$29 = _el$28.nextSibling;
    const _el$30 = _el$29.nextSibling;
    _$attr(_el$24, "class", () => ['call', a.get().ok === false && 'failed', a.get().ok === undefined && 'running', open.get() === a.get().id && 'open'], "keeno-da1ea03b");
    _$on(_el$25, "click", () => open.set(open.get() === a.get().id ? null : a.get().id));
    _$insert(_el$26, () => clock(a.get().start));
    _$attr(_el$27, "class", () => ['state', a.get().ok === undefined ? 'spin' : a.get().ok ? 'ok' : 'bad'], "keeno-da1ea03b");
    _$insert(_el$27, _$cond(() => a.get().ok === undefined, () => '', () => _$cond(() => a.get().ok, () => '✓', () => '✗')));
    _$insert(_el$28, () => label(a.get()));
    _$insert(_el$29, () => argsText(a.get()));
    _$insert(_el$25, _$and(() => a.get().page && a.get().page !== $$props.page, () => _tmpl$7()), _el$30);
    _$insert(_el$25, _$and(() => a.get().ms !== undefined, () => {
      const _el$15 = _tmpl$8();
      const _el$16 = _el$15.firstChild;
      _$insert(_el$15, () => a.get().ms, _el$16);
      return _el$15;
    }));
    _$insert(_el$24, _$and(() => open.get() === a.get().id, () => {
      const _el$20 = _tmpl$12();
      const _el$21 = _el$20.firstChild;
      const _el$22 = _el$21.nextSibling;
      const _el$23 = _el$22.nextSibling;
      _$insert(_el$20, _$and(() => COMPONENT_TOOLS.has(a.get().tool) && typeof a.get().args.id === 'number' && (!a.get().page || a.get().page === $$props.page), () => {
        const _el$17 = _tmpl$9();
        _$on(_el$17, "click", () => actions.select(a.get().args.id as number, true));
        _$insert(_el$17, () => String(a.get().args.id));
        return _el$17;
      }), _el$21);
      _$insert(_el$20, _$and(() => a.get().tool === 'keeno_eval', () => {
        const _el$18 = _tmpl$10();
        _$insert(_el$18, () => String(a.get().args.code ?? ''));
        return _el$18;
      }), _el$22);
      _$attr(_el$23, "class", () => ['result', a.get().ok === false && 'v-err'], "keeno-da1ea03b");
      _$insert(_el$23, () => a.get().summary ?? 'Running…');
      _$insert(_el$20, _$and(() => a.get().client, () => {
        const _el$19 = _tmpl$11();
        _$insert(_el$19, () => a.get().client);
        return _el$19;
      }));
      return _el$20;
    }));
    return _el$24;
  }));
  return _el$31;
}
