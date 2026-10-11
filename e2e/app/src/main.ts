// Fixtures for the Playwright suite. `/` holds SVG and table templates (e2e/svg-table.e2e.ts);
// `/features/…` holds the router and built-in components (e2e/features.e2e.ts); `/bench` the
// benchmark table (scripts/bench.ts).
import { mount } from '@inflector/lux'
import App from './App.lx'
import Features from './features/Features.lx'
import Bench from './bench/Bench.lx'

const page = location.pathname.startsWith('/features') ? Features : location.pathname.startsWith('/bench') ? Bench : App
mount(page, document.getElementById('app')!)
