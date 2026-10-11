import { GlobalRegistrator } from '@happy-dom/global-registrator'
// A real origin, so location/history (used by `state(v, { url })`) behave like a browser.
GlobalRegistrator.register({ url: 'http://localhost/' })
