---
"@inflector/keeno-compiler": patch
---

Fix keyed `.map()` with a destructured row parameter used in a nested key (`({ p }) => <li key={p.ref}>`): the key function no longer references an undefined `_item`.
