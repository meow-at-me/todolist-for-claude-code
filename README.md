# Todo List for Claude Code

A todo list in your VS Code **sidebar**, backed by a plain `todo.md` file —
and **Claude Code adds tasks for you** when you mention them in chat.

**[GitHub](https://github.com/meow-at-me/todolist-for-claude-code)** · [Marketplace](https://marketplace.visualstudio.com/items?itemName=meow-at-me.todolist-for-claude-code)

<table>
  <tr>
    <td valign="middle"><img src="assets/usecase.png" alt="Claude Code adding tasks to todo.md" width="460" /></td>
    <td valign="middle"><img src="assets/before.png" alt="Sidebar todo list" width="250" /></td>
  </tr>
</table>

## Claude Code integration

Mention a task in chat — *"I need to send an email later"* — and it's appended to
`todo.md`. The sidebar updates instantly.

| Before | After |
|:---:|:---:|
| <img src="assets/before.png" alt="Before" width="300" /> | <img src="assets/after.png" alt="After" width="300" /> |

**No API key, no token.** On first run it just adds a few lines to your Claude Code
memory (`~/.claude/CLAUDE.md`) — everything runs locally, nothing leaves your
machine. Re-run anytime via **"Todo: Set up Claude Code integration"**.

## Features

- Add / check off / edit / delete, drag to reorder
- Priority (high / med / low) and `@category` tags
- Sort by priority or category; completed items drop below a divider
- Customizable colors, English/Korean UI
- Edits to `todo.md` (by you or Claude Code) refresh the sidebar live

## `todo.md` format

```markdown
- [ ] Read the paper !high @research
- [x] Code review @dev
```

`- [ ]`/`- [x]` open/done · `!high !med !low` priority · `@word` category

## License

[MIT](LICENSE)
