```html Greeting.lx
<script lang="ts">
  const name = state('', { persist: 'name' })
  const loud = state(false)
  const greeting = derived(() => `Hello, ${name || 'stranger'}`)
</script>

<input bind:value={name} placeholder="Your name" />
<label><input type="checkbox" bind:checked={loud} /> Loud</label>
<p>{loud ? greeting.toUpperCase() + '!' : greeting}</p>
```
