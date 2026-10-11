import { hydrate } from '@inflector/lux'
import App from './App.lx'
import { loadDoc, slugFromPath } from './docs'

// Load the page the server rendered first, so hydration renders the same markup in one pass.
const slug = slugFromPath(location.pathname)
;(slug ? loadDoc(slug).catch(() => undefined) : Promise.resolve()).then(() => {
  hydrate(App, document.getElementById('app')!)
})
