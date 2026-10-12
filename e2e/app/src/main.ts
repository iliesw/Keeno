// Fixtures for the Playwright suite. `/` holds SVG and table templates (e2e/svg-table.e2e.ts);
// `/features/…` holds the router and built-in components (e2e/features.e2e.ts); `/bench` the
// benchmark table (scripts/bench.ts); `/reparent` reparentable() content (e2e/reparent.e2e.ts);
// `/next` async deriveds, store() and router view transitions (e2e/next.e2e.ts).
import { mount } from '@inflector/keeno'
import App from './App.kn'
import Features from './features/Features.kn'
import Bench from './bench/Bench.kn'
import Reparent from './reparent/Reparent.kn'
import Next from './next/Next.kn'

const path = location.pathname
const page = path.startsWith('/features')
  ? Features
  : path.startsWith('/bench')
    ? Bench
    : path.startsWith('/reparent')
      ? Reparent
      : path.startsWith('/next')
        ? Next
        : App
mount(page, document.getElementById('app')!)
