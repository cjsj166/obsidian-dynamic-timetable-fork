# Task Time Cascade

A daily-planning plugin for [Obsidian](https://obsidian.md/). Write your tasks
with times right in a daily note and they **auto-cascade into a scheduled
timeline** — flexible tasks flow in around your fixed appointments, reorder one
and the rest re-flow, and a time ruler is drawn beside your notes.

It is a heavily reworked fork of
[Dynamic Timetable](https://github.com/L7Cy/obsidian-dynamic-timetable) by L7Cy,
itself inspired by the [TaskChute](https://cyblog.biz/pro/taskchute2/index2.php)
method.

## What it does

- **One note, one region.** Write tasks as `- [ ]` lines and put memos
  (native markdown — images, math, code) directly under each. A body `---`
  divider splits **today** (clock-scheduled) from **below** (queued onto future
  days by capacity).
- **Inline schedule.** Each task line shows its projected time; the raw `@`/`;`
  source is hidden until your cursor is on the line.
- **Cascading layout.** Flexible tasks fill the day in order around fixed
  `@`-time appointments. When the cursor leaves a task, the today region
  re-orders by start time automatically.
- **Splitting.** A task that runs across an appointment is split: its `- [ ]`
  line holds segment 1 (`(1/N)`) and a continuation block is placed at the later
  segment's time, each with its own memo.
- **Left time ruler** beside today memos (hour labels + 30-min ticks), `Idle`
  gap chips, and a red **now** marker.
- **Reorder by priority:** `Alt+T` then `↑`/`↓` moves a task block (line + memo)
  among the flexible tasks.

## Task format

```
- [ ] Task name ; 1:30            # 1h30m of flexible work
- [ ] Meeting @ 11:00 ; 1:00      # fixed appointment 11:00–12:00
- [ ] Errand @ 2026-06-10 14:00 ; 2:00   # date-pinned (below region)
```

- `;` = estimated duration (`H:MM` or whole minutes).
- `@` = start time (`HH:MM`) or date + time for future-dated tasks.
- Only tasks carrying a time (`@`/`;`) are scheduled and rendered.

### Frontmatter (optional)

```yaml
---
working_hours: 8:00      # daily capacity for the below queue
day_start: 9:00          # when flexible today work begins
capacity_overrides:
  - 2026-06-10 +1:00     # extra/less capacity on a date
---
```

The note is auto-managed when it is a daily note (`YYYY-MM-DD.md`), has the
frontmatter above, or contains any timed task. The today/below divider is a body
`---`; use `***`/`___` for horizontal rules inside memos.

## Installation

Not yet in the community store. To try it now, use
[BRAT](https://github.com/TfTHacker/obsidian42-brat): add the beta plugin
`cjsj166/obsidian-dynamic-timetable-fork`, then enable **Task Time Cascade** in
Community plugins.

## Development

```
npm install
npm run build      # tsc + esbuild -> main.js
npx jest           # pure-core unit tests
node deploy.mjs [vaultRoot]   # copy build into a vault for testing
```

## License

MIT (inherited from the upstream project).
