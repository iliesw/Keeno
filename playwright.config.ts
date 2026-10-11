// Real-browser tests: `bunx playwright test` (first run: `bunx playwright install chromium`).
// Each app is served by Vite on a fixed port; specs live in e2e/*.e2e.ts so `bun test` skips them.
import { defineConfig, devices } from '@playwright/test'
import { PORTS } from './e2e/apps'

const server = (cwd: string, port: number) => ({
  command: `bunx --bun vite --port ${port} --strictPort`,
  cwd,
  url: `http://localhost:${port}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
})

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
  webServer: [
    server('examples/todo', PORTS.todo),
    server('examples/counter', PORTS.counter),
    server('e2e/app', PORTS.fixtures),
  ],
})
