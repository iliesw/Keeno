// Base styles of the dev tools panel: theme tokens, resets and the small utility classes that
// several components share (value colors, key/value rows, badges...). Each component's own styles
// are in the <style> block of its ui/*.kn file. All of it goes into the panel's shadow root, so
// the app's CSS doesn't reach it.
export const BASE_CSS = /* css */ `
:host {
  all: initial;
  --bg: #000000; --surface: #141821; --raised: #1b2030; --border: #252b3a; --hover: #1d2333;
  --text: #d8dde8; --muted: #7f889c; --accent: #f5b942; --accent-dim: rgba(245,185,66,.14);
  --tag: #6cb6ff; --str: #a5d6a7; --num: #f9a66c; --bool: #d6a5ff; --null: #7f889c; --err: #ff6b6b; --key: #9fb3ff;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
input, textarea { font: inherit; color: inherit; }
/* The top-level elements (the host itself is reset with \`all: initial\`). */
.panel, .fab, .overlay {
  font: 12px/1.45 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  color: var(--text);
}
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: var(--raised); border-radius: 9px; border: 2px solid var(--bg); }
kbd { background: var(--raised); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; font-size: 11px; }

/* Layout */
.spacer { flex: 1; }
.view { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border); flex: none; }
.search { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; outline: none; }
.search:focus { border-color: var(--accent); }
.empty { color: var(--muted); padding: 16px; text-align: center; }

/* Text */
.muted { color: var(--muted); }
.small { font-size: 11px; }
.pad { padding: 2px 0; }
.link { color: var(--tag); text-decoration: none; }
.link:hover { text-decoration: underline; }
.btn { padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--raised); }
.btn:hover { border-color: var(--muted); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #111; font-weight: 700; }
.logo-mark {
  width: 10px; height: 10px; transform: rotate(45deg); border-radius: 2px; display: inline-block; flex: none;
  background: linear-gradient(135deg, #ffd27a, #f5a524); box-shadow: 0 0 10px rgba(245,185,66,.6);
}
.store-mark { color: var(--accent); font-size: 10px; }
.caret { display: inline-block; width: 12px; text-align: center; color: var(--muted); flex: none; font-size: 10px; }
.count { margin-left: 6px; color: var(--muted); font-size: 10px; background: var(--raised); border-radius: 999px; padding: 0 6px; }
.tag { color: var(--muted); }
.tag .name { color: var(--tag); }
.tag.builtin .name { color: #8fa3bf; font-style: italic; }
.tag.big { font-size: 13px; }
.badge { font-size: 10px; padding: 0 5px; border-radius: 4px; background: var(--raised); color: var(--muted); border: 1px solid var(--border); line-height: 15px; }
.badge.derived { color: var(--tag); }
.badge.pending { color: var(--accent); border-color: var(--accent); }
.badge.src-url { color: var(--bool); }
.badge.src-remote { color: var(--str); }
.badge.src-history { color: var(--num); }

/* Key/value rows and values */
.kv { display: flex; align-items: baseline; gap: 0 4px; padding: 2px 0; min-height: 20px; }
.kv > .key, .kv > .badge, .kv > .colon { flex: none; }
.key { color: var(--key); }
.colon { color: var(--muted); margin-right: 2px; }
.val { flex: 1 1 auto; min-width: 0; }
.val > .v-str, .val > .v-obj { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-str { color: var(--str); word-break: break-word; }
.v-num { color: var(--num); }
.v-bool { color: var(--bool); }
.v-null { color: var(--null); }
.v-fn { color: #c3cbe0; font-style: italic; }
.v-err { color: var(--err); }
.v-obj { color: var(--text); }
`
