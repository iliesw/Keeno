// Babel and PostCSS read a few `process` fields; give the worker a minimal one.
const g = globalThis as any
g.process ??= { env: {}, cwd: () => '/', platform: 'browser', version: '', versions: {} }
export {}
