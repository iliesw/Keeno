---
"@inflector/lux": minor
---

Native reparenting. `reparentable(() => <Video />)` renders content once and lets you show it in different places (`{player}`) while it keeps its component state, and `keyedReparentable()` does the same per key for items that move between lists. Moves use the DOM's native `moveBefore` where available, so iframes, playing media, focus and CSS animations survive them, including moves into a branch that was just created. Keyed list reorders also use `moveBefore` for nodes already in the document. Imperatively, `player.moveTo(element | selector, before?)` and `player.remove()` move or hide the content from code (drag and drop, picture-in-picture), and `moveNode(node, parent, before?)` moves any DOM node natively when possible.
