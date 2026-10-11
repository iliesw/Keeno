export interface Framework {
  name: string
  tagline: string
  year: number
}

export const frameworks: Framework[] = [
  { name: 'Lux', tagline: 'Compiled signals, HTML-first components', year: 2025 },
  { name: 'React', tagline: 'Components with a virtual DOM', year: 2013 },
  { name: 'Vue', tagline: 'The progressive framework', year: 2014 },
  { name: 'Svelte', tagline: 'Compiled, with runes for reactivity', year: 2016 },
  { name: 'Solid', tagline: 'Fine-grained reactivity with JSX', year: 2018 },
  { name: 'Angular', tagline: 'A platform with signals and DI', year: 2016 },
  { name: 'Preact', tagline: 'A tiny React alternative', year: 2015 },
  { name: 'Qwik', tagline: 'Resumable apps, lazy by default', year: 2021 },
  { name: 'Lit', tagline: 'Web components with reactive properties', year: 2017 },
  { name: 'Alpine', tagline: 'Behaviour sprinkled on markup', year: 2019 },
  { name: 'Ember', tagline: 'Conventions for ambitious apps', year: 2011 },
  { name: 'Mithril', tagline: 'Small, with routing and XHR built in', year: 2014 },
  { name: 'Inferno', tagline: 'A very fast virtual DOM', year: 2016 },
  { name: 'Marko', tagline: 'Streaming HTML-based UI', year: 2014 },
  { name: 'Stencil', tagline: 'A compiler for web components', year: 2017 },
]
