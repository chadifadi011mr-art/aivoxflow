# Publishing schedule — how content keeps shipping without a human in the loop

Three pieces: a **backlog** of topics, a **calendar** of peak slots, and a **scheduler** that
writes each article before its slot and lets the build publish it on the day.

```
site/data/topics.json  →  agents/plan.mjs  →  content/calendar.json
                                                    │
                                     agents/scheduler.mjs (cron)
                                                    │
                                    article dated for its slot
                                                    │
                              site/build.mjs hides it until that date
```

## 1. Peak windows

`agents/lib/calendar.mjs` ships with a starting heuristic, in **UTC**:

| Window | Days | Hour | Why |
| --- | --- | --- | --- |
| Tue–Thu morning | Tue, Wed, Thu | 08:00 | Highest weight — inbox and commute reading |
| Tue–Thu afternoon | Tue, Wed, Thu | 17:00 | Second daily peak |
| Mon/Fri morning | Mon, Fri | 09:00 | Lower weight, keeps cadence |

**This is a heuristic, not your data.** After 30 days of Search Console and analytics, replace
`PEAKS` with the hours your readers actually arrive. It is six lines; nothing else changes.

Editing it:

```js
// agents/lib/calendar.mjs
export const PEAKS = [
  { days: [2, 3, 4], hour: 8,  weight: 3, label: 'Tue–Thu morning' },
  { days: [2, 3, 4], hour: 17, weight: 2, label: 'Tue–Thu afternoon' },
  { days: [1, 5],    hour: 9,  weight: 1, label: 'Mon/Fri morning' },
];
```

The planner also **rotates categories**, so you never publish three AI-tools pieces in a row.

## 2. Plan the queue

```bash
npm run plan -- --slots 10      # fill the next 10 slots
npm run plan -- --show          # what is queued, and when
```

It skips anything already published or already attempted (job history is checked too), so a
failed topic is not silently retried forever.

## 3. Run the scheduler

```bash
npm run schedule:due            # what is ready to be written right now
npm run schedule                # generate what is due, then rebuild dist/
npm run schedule:daemon         # keep running, checking every 30 minutes
```

An item becomes "due" when its slot is within the lead window (default **24 h**). The article is
written early, dated for the slot, and **hidden by the build until that date**:

```bash
node site/build.mjs
# → Scheduled: 2 future-dated article(s) held back until their slot.
```

So a rebuild at 06:00 cannot leak tomorrow's article, and a rebuild at 08:01 publishes it.

Preview the queue locally without publishing:

```bash
AIVOXFLOW_INCLUDE_FUTURE=1 node site/build.mjs
```

## 4. Keep it running

### GitHub Actions (recommended, free, survives your machine being off)

Two workflows ship in `.github/workflows/`:

| Workflow | When | Does |
| --- | --- | --- |
| `content.yml` | daily 04:00 UTC | plans slots, generates what is due, runs the gates, commits passing articles |
| `publish.yml` | 08:00/17:00 Tue–Thu, 09:00 Mon/Fri + on push | rebuilds, verifies, uploads `dist/` (add your deploy step) |

Set the secrets once: `AIVOXFLOW_AI_API_KEY`, optionally `AIVOXFLOW_SEARCH_API_KEY`. If the key
is absent, `content.yml` skips itself instead of failing.

### Windows Task Scheduler

```powershell
$action  = New-ScheduledTaskAction -Execute "node" `
  -Argument "agents\scheduler.mjs --once --build" -WorkingDirectory "D:\Utilitaires\AIVOXFLOW2"
$trigger = New-ScheduledTaskTrigger -Daily -At 4:00am
Register-ScheduledTask -TaskName "AIVOXFLOW content" -Action $action -Trigger $trigger
```

### cron (Linux/macOS)

```cron
0 4 * * * cd /srv/aivoxflow && /usr/bin/node agents/scheduler.mjs --once --build >> content/scheduler.log 2>&1
```

### Long-running daemon

```bash
npm run schedule:daemon
```

Use it on a machine that is always on. It logs to `content/scheduler.log` and never publishes
anything that failed a gate.

## 5. What happens when a gate fails

The item becomes `needs_review` in the calendar and the run exits 3. Nothing is committed. You
then have three options:

```bash
# 1. fix the inputs and retry
node agents/run.mjs --resume <job_id>

# 2. drop the topic
#    edit content/calendar.json → status: "rejected"

# 3. give the agent better sources, then retry
node agents/run.mjs --topic "…" --category … --sources sources.txt --slot <iso> --publish
```

This is the part most content pipelines get wrong: they treat a failed quality check as an error
to suppress. Here it is the expected outcome for a topic the evidence cannot support — and the
queue keeps moving.

## 6. Cadence that will not burn the site

Three to five articles a week is a sustainable pace for one publication with real review. The
default calendar produces at most two per day; that is a ceiling, not a target.

Do not raise it to hit a number. Thin articles are the one thing the gates, the audit and
`AGENTS.md` all agree on: publish fewer, better.
