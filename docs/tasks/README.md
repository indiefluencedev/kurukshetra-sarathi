# Daily task logs

One file per working day, `YYYY-MM-DD.md`. `docs/TASKS.md` says what is true
now; these say how it got there and what it cost.

## The format, which is the point

**A to-do list, not a diary.** Every item is one line, two at most. If it needs
a third, the explanation belongs in a comment next to the code it explains, and
this line links to it.

```markdown
## 1 · Main task `[x]`

- [x] **Subtask** — what changed, in a clause
- [ ] **Subtask** — the one that is not done
      → a second line only when the *why* changes what someone does next

  ↳ **The issue that was hit** and what it turned out to be.
  ↳ How it was caught, if that is the transferable part.
```

| Mark | Means |
|---|---|
| `[x]` | done |
| `[ ]` | open |
| `[~]` | deliberately held — a decision, not a backlog item |
| `↳` | an issue hit and fixed, under the task it happened in |

Top of the file is **Open at end of day** — everything still `[ ]` or `[~]`,
so the state is legible without reading the rest.

## Why issues are logged at all

The fix is in the code; the *diagnosis* is not. "Wrangler does not read Worker
vars off the shell" cost an hour and leaves no trace in a diff — the only place
it can live is here. Log the thing that was surprising, not the thing that was
done.

Two lines. If it will not fit, it is a doc, not a log entry.
