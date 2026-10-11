// Fixtures for the Playwright suite. `/` holds SVG and table templates (e2e/svg-table.e2e.ts);
// `/features/…` holds the router and built-in components (e2e/features.e2e.ts); `/bench` the
// benchmark table (scripts/bench.ts); `/reparent` reparentable() content (e2e/reparent.e2e.ts).
import { mount } from '@inflector/lux'
import App from './App.lx'
import Features from './features/Features.lx'
import Bench from './bench/Bench.lx'
import Reparent from './reparent/Reparent.lx'

const path = location.pathname
const page = path.startsWith('/features')
  ? Features
  : path.startsWith('/bench')
    ? Bench
    : path.startsWith('/reparent')
      ? Reparent
      : App
mount(page, document.getElementById('app')!)
