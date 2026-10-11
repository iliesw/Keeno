// `changeset version`, then refresh bun.lock for the new versions. Used by the release workflow.
import { $ } from 'bun'

await $`bunx changeset version`
await $`bun install`
