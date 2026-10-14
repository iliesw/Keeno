---
"@inflector/keeno": patch
---

`<Virtual>`: a list that gets shorter while scrolled far down now shows its last rows instead of a blank box (the scroll position is clamped like the browser does), and `scrollTo(index, 'smooth')` follows the smooth scroll instead of jumping the rows ahead of it.
