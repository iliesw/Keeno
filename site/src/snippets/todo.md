```html Todos.kn
<script lang="ts">
  const todos = state([{ id: 1, text: 'Write docs', done: false }])
  const draft = state('')

  function add() {
    todos.set([...todos, { id: Date.now(), text: draft, done: false }])
    draft.set('')
  }
</script>

<input bind:value={draft} onKeyDown={(e) => e.key === 'Enter' && add()} />
<ul>
  {todos.map((t) => (
    <li key={t.id} class={{ done: t.done }}>{t.text}</li>
  ))}
</ul>
```
