---
"@inflector/keeno-check": patch
"@inflector/keeno-compiler": patch
---

`keeno-check` now runs the compiler on every .kn file and reports the errors `vite build` would stop on (such as an unsupported `.map()` row parameter) as `file:line:col - error keeno: …`, so a project that passes the check also builds. Compiler errors raised on a node now carry its `.kn` location (`err.loc`), which also points Vite's error overlay at the right spot.
