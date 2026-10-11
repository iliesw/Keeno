// Compile every example with the Lux compiler (the playground does the same in the browser).
import { compile } from '@inflector/lux-compiler'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dir, '../src/examples')
let failed = 0
for (const ex of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const f of readdirSync(path.join(dir, ex.name)).filter((f) => f.endsWith('.lx'))) {
    try {
      compile(readFileSync(path.join(dir, ex.name, f), 'utf8'), { filename: f })
    } catch (e: any) {
      failed++
      console.error(`✗ ${ex.name}/${f}: ${e.message}`)
    }
  }
}
console.log(failed ? `${failed} failed` : 'all examples compile')
process.exit(failed ? 1 : 0)
