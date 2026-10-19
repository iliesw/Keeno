---
"@inflector/keeno-language-server": patch
"inflector-keeno": patch
---

Components complete by name in the editor. A `.kn` file's default export is now named after the file (`todo-item.kn` is `TodoItem`), so typing `<TodoIt` offers `TodoItem` and adds its import, for every component and not only those re-exported from a `.ts` file. Accepting an auto-import now inserts the import into the `<script>` block; before, the edit was dropped.
