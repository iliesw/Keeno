# Security

## What is escaped

- `{expr}` in markup always renders as text (a DOM text node), never as HTML. `<p>{userInput}</p>` is safe whatever `userInput` contains.
- Attribute values are set with `setAttribute` or the matching DOM property. They can't break out of the attribute.
- Static text and attributes written in a template are escaped by the compiler.
- `renderToString` escapes text and attributes in the HTML it produces.

## What is not

**`innerHTML`.** `<div innerHTML={html} />` inserts raw HTML, exactly like the DOM property. Never pass it content that a user can influence unless you sanitize it first, for example with [DOMPurify](https://github.com/cure53/DOMPurify):

```html Article.kn
<script lang="ts">
  import DOMPurify from 'dompurify'
  const { body } = props<{ body: string }>()
</script>

<article innerHTML={DOMPurify.sanitize(body)} />
```

**`javascript:` URLs.** A dynamic URL attribute (`href`, `src`, `action`, `formaction`, `xlink:href`, `poster`, `cite`, `background`, `ping`) whose value is a `javascript:` URL is **blocked**: the attribute is removed and an error is logged. Browsers also accept variants with leading spaces, tabs inside the scheme and mixed case, and those are blocked too. A static `href="javascript:…"` written in the template is left alone, since the author wrote it. Other schemes, such as `data:` URLs in `src`, pass through. Validate them yourself if users can supply them.

**`srcdoc`.** `<iframe srcdoc={html} />` renders `html` as a whole document, like `innerHTML`. Sanitize user content, or keep the iframe's `sandbox` without `allow-same-origin`.

**Event handlers and spread.** `{...attrs}` applies every key as an attribute, except keys like `onClick` or `onclick`: a function there becomes an event listener, and anything else is ignored. A dynamic inline handler attribute (`onclick={…}` as a string, from a spread or a binding) is never set. Still, don't spread objects that come from users.

**Styles.** A `style={…}` string that comes from user input can still do things like overlay the page. Prefer fixed classes.

## Content Security Policy

The runtime and compiled components don't use `eval`, `new Function` or inline event handler attributes. They work under a strict CSP such as `script-src 'self'`. In development, Vite injects styles with `<style>` tags, so `style-src` needs `'unsafe-inline'` or a nonce there. Production builds emit CSS files.

Templates are parsed once per component by assigning the compiler's static HTML to a `<template>` element's `innerHTML`. A page that enforces [Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) (`require-trusted-types-for 'script'`) needs a default policy that allows those assignments.

## Reporting a vulnerability

Please report security issues privately through [GitHub security advisories](https://github.com/iliesw/Keeno/security/advisories/new), not in public issues.
