// The playground's code editor: CodeMirror 6 with one state per file (so each keeps its own
// undo history), Keeno-flavoured HTML highlighting for `.kn` files, and the site's colours.
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

const ts = javascript({ typescript: true, jsx: true })

function language(name: string): Extension {
  if (name.endsWith('.kn') || name.endsWith('.html')) {
    return html({
      nestedLanguages: [{ tag: 'script', attrs: () => true, parser: ts.language.parser }],
      selfClosingTags: true,
    })
  }
  if (name.endsWith('.css')) return css()
  return ts
}

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier], color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.attributeValue], color: 'var(--hl-string)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.className], color: 'var(--hl-title)' },
  { tag: [t.attributeName, t.propertyName, t.definition(t.propertyName)], color: 'var(--hl-attr)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.typeName, t.standard(t.variableName), t.unit], color: 'var(--hl-number)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--hl-tag)' },
  { tag: [t.self, t.special(t.variableName)], color: 'var(--hl-keyword)' },
  { tag: t.invalid, color: 'var(--hl-deletion)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13.5px', backgroundColor: 'transparent', color: 'var(--code-fg)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
  '.cm-content': { padding: '14px 0', caretColor: 'var(--brand)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--gutter)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '.cm-cursor': { borderLeftColor: 'var(--brand)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-matchingBracket': { backgroundColor: 'var(--selection)', outline: 'none' },
  '.cm-selectionMatch': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-foldGutter .cm-gutterElement': { color: 'var(--gutter)', cursor: 'pointer' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--brand)', color: 'var(--bg)' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--fg)' },
})

function extensions(name: string, onChange: (code: string) => void, readOnly: boolean): Extension[] {
  return [
    lineNumbers(),
    foldGutter({ openText: '▾', closedText: '▸' }),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
    language(name),
    theme,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString())
    }),
  ]
}

export interface Editor {
  /** Show a file, creating its editor state on first use. */
  open(name: string, code: string): void
  /** Forget a file's state (after it was deleted or renamed). */
  forget(name: string): void
  /** Replace the content of the open file. */
  setValue(code: string): void
  focus(): void
  destroy(): void
}

export function createEditor(parent: HTMLElement, onChange: (name: string, code: string) => void, readOnly = false): Editor {
  const states = new Map<string, EditorState>()
  let current = ''
  const view = new EditorView({ parent })
  return {
    open(name, code) {
      if (current) states.set(current, view.state)
      current = name
      let s = states.get(name)
      if (!s || s.doc.toString() !== code) {
        s = EditorState.create({ doc: code, extensions: extensions(name, (c) => onChange(name, c), readOnly) })
        states.set(name, s)
      }
      view.setState(s)
    },
    forget(name) {
      states.delete(name)
    },
    setValue(code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
    },
    focus() {
      view.focus()
    },
    destroy() {
      view.destroy()
    },
  }
}
