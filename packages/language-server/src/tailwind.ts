// Tailwind CSS v4 directives for <style> blocks: known at-rules (no "Unknown at rule" warnings),
// with completions and hover docs. Utility class IntelliSense comes from the Tailwind CSS extension.
import type { CSSDataV1 } from 'vscode-css-languageservice'

const docs = (path: string) => [{ name: 'Tailwind CSS', url: `https://tailwindcss.com/docs/${path}` }]

export const tailwindCssData: CSSDataV1 = {
  version: 1.1,
  atDirectives: [
    {
      name: '@apply',
      description: 'Inline existing utility classes into a rule: `@apply px-4 py-2 rounded-lg;`',
      references: docs('functions-and-directives#apply-directive'),
    },
    {
      name: '@reference',
      description:
        'Import a stylesheet for its theme and utilities without emitting its CSS. In `.kn` files the Vite plugin adds it for you.',
      references: docs('functions-and-directives#reference-directive'),
    },
    {
      name: '@variant',
      description: 'Apply a Tailwind variant to styles: `@variant dark { … }`, `@variant hover { … }`.',
      references: docs('functions-and-directives#variant-directive'),
    },
    {
      name: '@custom-variant',
      description: 'Add a custom variant: `@custom-variant theme-midnight (&:where([data-theme=midnight] *));`',
      references: docs('functions-and-directives#custom-variant-directive'),
    },
    {
      name: '@utility',
      description: 'Add a custom utility that works with variants: `@utility tab-4 { tab-size: 4; }`',
      references: docs('functions-and-directives#utility-directive'),
    },
    {
      name: '@theme',
      description: 'Define design tokens (theme variables): `@theme { --color-brand: oklch(0.6 0.2 250); }`',
      references: docs('functions-and-directives#theme-directive'),
    },
    {
      name: '@source',
      description: 'Add a path for Tailwind to scan for class names: `@source "../node_modules/@my/lib";`',
      references: docs('functions-and-directives#source-directive'),
    },
    {
      name: '@plugin',
      description: 'Load a legacy JavaScript plugin: `@plugin "@tailwindcss/typography";`',
      references: docs('functions-and-directives#plugin-directive'),
    },
    {
      name: '@config',
      description: 'Load a legacy JavaScript config file: `@config "../tailwind.config.js";`',
      references: docs('functions-and-directives#config-directive'),
    },
    {
      name: '@tailwind',
      description: 'Tailwind v3 directive: `@tailwind base | components | utilities;`',
      references: docs('functions-and-directives'),
    },
    {
      name: '@screen',
      description: 'Tailwind v3 directive: a media query for a named breakpoint, `@screen md { … }`.',
      references: docs('functions-and-directives'),
    },
  ],
}
