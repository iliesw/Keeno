---
"@inflector/keeno": minor
"@inflector/keeno-compiler": patch
"@inflector/keeno-router": minor
---

Add `<Head>`, a built-in that puts `<title>`, `<meta>` and `<link>` tags in the document head from any component: the deepest one wins, tags come back on unmount, and server renders collect them into `context.head`. Server renders also report the router's error-page status in `context.status`. The compiler now handles `{expressions}` inside `<title>` and `<textarea>`, whose content the HTML parser reads as text.
