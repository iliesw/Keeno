import { hydrate } from '@inflector/keeno'
import App from './App.kn'
import { loadDoc, slugFromPath } from './docs'
import { findExample, loadExampleFiles } from './examples'

// Load what the server rendered first (a doc, an example's sources), so hydration renders the
// same markup in one pass.
const slug = slugFromPath(location.pathname)
const example = location.pathname.match(/^\/examples\/([\w-]+)\/?$/)?.[1]
const ready = slug ? loadDoc(slug) : example && findExample(example) ? loadExampleFiles(example) : undefined
Promise.resolve(ready)
  .catch(() => undefined)
  .then(() => hydrate(App, document.getElementById('app')!))
