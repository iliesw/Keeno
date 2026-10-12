// Fixed dev-server ports for the apps the Playwright suite drives (see playwright.config.ts).
export const PORTS = { todo: 5181, fixtures: 5183 }
export const TODO = `http://localhost:${PORTS.todo}/`
export const FIXTURES = `http://localhost:${PORTS.fixtures}/`
