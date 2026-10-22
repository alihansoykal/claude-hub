# Claude Hub protocol

The contract between Claude Hub (this web app) and every project repository it
manages. The hub never talks to Claude directly: it reads and edits a few
Markdown files on the project's work branch, and the project's hourly cloud
run reads the same files. Anything that follows this document shows up in the
hub and can be driven from it.

Agents: when the owner asks you to "connect this project to Claude Hub", follow
[Connecting a project](#connecting-a-project) at the end.

## Files

| File | Branch | Who writes it |
|---|---|---|
| `.claude/hub.json` | default branch (`main`) | set up once; marks the repo as a hub project |
| `docs/BACKLOG.md` | work branch | manager runs, worker runs, the owner through the hub |
| `docs/QUESTIONS.md` | work branch | manager runs append questions; the owner answers through the hub |
| `.claude/hub-paused` | work branch | the hub creates it to pause cloud runs, deletes it to resume |

The **work branch** is `claude/cloud-backlog` unless `hub.json` says otherwise.
Cloud runs commit and push only there; every run merges the default branch
into it first. The owner reviews it and merges it into `main`. Before the work
branch exists the hub reads the default branch, and its first write creates
the work branch from it.

### `.claude/hub.json`

```json
{ "name": "Surf Master", "icon": "🏄" }
```

All fields are optional: `name` (shown in the hub; default: the repo name),
`icon` (one emoji), `branch` (default `claude/cloud-backlog`), `backlog`
(default `docs/BACKLOG.md`), `questions` (default `docs/QUESTIONS.md`).
The hub finds projects by looking for this file on each repo's default branch.

### `docs/BACKLOG.md`

One block per item, in work order (top first):

```
## Optional section heading (an epic, a theme)

### B-012 Short title
Durum: TODO
Boyut: M
Kaynak: IDEAS 4
Kabul kriterleri:
- ...
```

- The heading is `### <ID> <title>`. IDs are a prefix and a number (`B-012`,
  `H-003`); one prefix per project. Never reuse or renumber an ID.
- The first line starting with `Durum:` is the status and contains nothing
  else: `Durum: TODO`. Lines inside ``` fences are ignored.
- Optional fields the hub shows: `Boyut:` (S / M), `Kaynak:` (where it came
  from), `Soru:` (question ids, e.g. `S-005`), and `Not (YYYY-MM-DD): …` notes.
  A finished item gets a one-line `Not` saying what was done.
- Items that are DONE or CANCELLED may move to a final
  `## Tamamlananlar / İptaller` section.

Statuses:

| Status | Meaning | Hub label |
|---|---|---|
| `NEW` | The owner added it in the hub; a manager run must plan it first | Planlanacak |
| `TODO` | Ready; a worker run may take it | Sırada |
| `IN-PROGRESS` | A worker claimed it (see `claim:` commits) | Çalışılıyor |
| `DONE` | Finished and green | Bitti |
| `BLOCKED` | Tried and failed; the reason is in a `Not` | Takıldı |
| `NEEDS-DECISION` | Waits for an answer in QUESTIONS.md (`Soru:` line) | Karar bekliyor |
| `OWNER` | Only the owner can do it (accounts, store, art files, devices) | Senin işin |
| `CANCELLED` | Dropped | İptal |

### `docs/QUESTIONS.md`

```
### S-005 Short question
Neden soruyorum: ...
Seçenekler: (a) ... (b) ...
Önerim: (a)
Cevap:
```

An empty `Cevap:` line is an open question. The hub writes the owner's answer
on that line. After applying an answer, a manager adds `→ İşlendi: B-xxx`
under it. Agents never edit the owner's answer.

## What the hub does

All hub writes are commits on the work branch whose message starts with `hub:`:

| Owner action | Change | Commit |
|---|---|---|
| Add a task | new block, `Durum: NEW` (or `TODO` when the owner ticks "small and clear"), `Kaynak: hub (date)`, the owner's text under `Sahibinin notu:`; at the end of the queue or on top of it | `hub: add B-051 <title>` |
| Reorder | moves a TODO / NEW block before or after another one | `hub: move B-049 up` |
| Done / cancel / retry | rewrites the `Durum:` line, adds a `Not (date): …` line under it | `hub: B-028 DONE` |
| Answer a question | fills the `Cevap:` line | `hub: answer S-005` |
| Pause / resume | creates / deletes `.claude/hub-paused` | `hub: pause cloud runs` |

The hub retries on top of the newest version when a cloud run pushed in
between, so the owner's change never overwrites a run's work.

The hub reads the newest 40 commits of the work branch to show what is going
on, so cloud runs must use these message prefixes:

- `claim: B-012` when a worker takes an item (the hub shows "working" for 75
  minutes after it).
- `feat(B-012): …` / `fix(B-012): …` when an item is done (the hub dates
  finished items by it).
- `plan: …` for a manager run, `chore: …` for anything else.

## Rules for cloud runs

Every project's cloud prompt must include these rules (the templates in
`protocol/templates/` already do):

1. **Pause.** After switching to the work branch and merging the default
   branch: if `.claude/hub-paused` exists, stop at once. No commit, no push.
2. **Hub commits are the owner's.** Commits starting with `hub:` are the
   owner's edits. When a merge conflicts, keep every owner change (new items,
   order, statuses, answers) and re-apply your own on top.
3. **NEW items mean planning.** If any item is `Durum: NEW`, this run is a
   manager run. Plan each NEW item **in place**: rewrite it as a proper
   `TODO` (keep its ID, title may be sharpened, add `Boyut`, acceptance
   criteria, keep `Kaynak: hub (…)` and the owner's note), or split it into
   several items placed right where it was (first keeps the ID, the rest get
   new IDs), or turn it into `NEEDS-DECISION` with a question, or `OWNER`
   when only the owner can do it.
4. **The order is the owner's.** Do not reorder existing TODO / NEW items;
   the owner arranges them in the hub. New items from other sources (ideas,
   feedback, answers) go where the manager's ranking rules place them.
5. **Answered questions mean planning.** A `Cevap:` that changed since the
   last `plan:` commit makes the run a manager run, like a NEW item.
6. **Owner-ticked statuses stand.** An item the owner set to DONE or
   CANCELLED in the hub is not reopened. A BLOCKED item the owner set back to
   TODO is tried again.

## Connecting a project

For an agent asked to connect a project. Ask the owner only what you cannot
find out.

1. The project must be a GitHub repository the owner's hub token can see (a
   fine-grained token on "All repositories" sees new repos automatically).
2. Add `.claude/hub.json` with a `name` and an `icon` emoji.
3. Add `docs/BACKLOG.md` and `docs/QUESTIONS.md` in the formats above if the
   project has none. Pick an ID prefix (first letter of the project). Seed the
   backlog with what the owner has asked for so far, as `NEW` items if
   unsure.
4. Add the cloud prompts from `protocol/templates/` to the project's
   `scripts/` (or merge their rules into existing ones): replace every
   `<...>` placeholder with the project's real install, check and test
   commands. The check command is the definition of done; if the project has
   none (e.g. a Unity project), write down in the worker prompt what "done"
   means and how to verify it in a headless cloud VM.
5. Mention the hub in the project's CLAUDE.md (one paragraph: owner adds work
   in Claude Hub; statuses as above; never edit `hub:` commits away).
6. Commit on the default branch. The owner pushes it (or tells you to).
7. Create the hourly cloud routine (RemoteTrigger `create`): Sonnet, cron at a
   minute that does not clash with the owner's other projects, the repository
   as the source, allowed tools `Bash, Read, Write, Edit, Glob, Grep,
   WebSearch, WebFetch, PushNotification`, and a prompt like: "You are the
   unattended cloud agent for <project> in this repository. Read CLAUDE.md,
   then follow scripts/cloud-prompt.md exactly, from step 1 to the end."
   Tell the owner the routine's link and when it first runs.
8. Tell the owner: open the hub, Ayarlar → Projeleri yeniden tara.
