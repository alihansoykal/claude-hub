You are running unattended in a Claude Code cloud session, started by a
scheduled task, on <PROJECT NAME>. The owner's PC may be off and nobody will
answer questions, so make reasonable decisions and record them.

The owner manages this project from Claude Hub: they add tasks, reorder the
queue, answer questions and pause the runs there. The hub's edits arrive as
commits starting with `hub:` on the work branch. The contract is
https://github.com/<OWNER>/claude-hub/blob/main/protocol/PROTOCOL.md.

Every run starts on a fresh cloud VM with a fresh clone of the repository.
Work carries over from run to run only through the `claude/cloud-backlog`
branch on GitHub, so every run that works ends by pushing that branch (step 6).

Shell commands: one simple command per Bash call, run as is from the project
root. No `cd`, no `&&`, `||`, `;` or `|`. Read, Grep and Glob for files.

## 1. Get onto the work branch

1. `git fetch origin`
2. `git ls-remote --heads origin claude/cloud-backlog`. If it prints a line,
   run `git switch claude/cloud-backlog`; otherwise
   `git switch -c claude/cloud-backlog origin/main`.
3. `git merge origin/main --no-edit`. On a conflict, resolve it by hand and
   keep every line the owner wrote plus the agents' additions. If you cannot
   resolve it cleanly, run `git merge --abort`, carry on without the merge,
   and mention it in your PROGRESS entry.
4. If the file `.claude/hub-paused` exists, the owner paused the cloud runs
   from the hub: make no commit, skip every step below, and end with a
   one-line note saying the project is paused.

## 2. Is another run busy?

1. Grep docs/BACKLOG.md for lines that are exactly `Durum: IN-PROGRESS`.
2. `git log --grep="^claim:" -1 --format="%ct %s"` gives the newest claim.
3. `date +%s` gives the time now.

- An `IN-PROGRESS` item whose claim is under 75 minutes (4500 s) old: another
  run is working on it. Make no commit, skip every step below, and end with a
  one-line note saying so.
- An `IN-PROGRESS` item with an older claim, or none: the run that took it
  stopped. Set its status line back to `Durum: TODO` and carry on; your
  role's commit will carry that change.

## 3. Pick this run's role

1. `git log --grep="^plan:" -1 --format=%H` gives the last planning commit.
2. `git diff --stat <that hash> HEAD -- docs/QUESTIONS.md <OWNER FILES, e.g. docs/IDEAS.md docs/FEEDBACK.md>`
   shows what the owner changed since then. No planning commit yet: treat
   everything as changed.
3. Grep docs/BACKLOG.md for lines that are exactly `Durum: NEW`, then for
   lines that are exactly `Durum: TODO`.

- Any `Durum: NEW` item, or the owner changed any of those files: you are the
  **manager**.
- Otherwise, TODO items are left: you are a **worker**.
- Otherwise: nothing to do. Make no commit and end with a one-line note.

## 4. Install

<INSTALL STEPS, e.g. `npm ci`, then `npx playwright install --with-deps chromium`>

If something cannot be installed, no item can be finished. Do not touch the
backlog: append an entry to docs/PROGRESS.md saying what could not be
installed and why, commit it as `chore: cloud run blocked by environment`,
then go to step 6.

## 5. Do the role

- **Manager**: follow scripts/manager-prompt.md. The worker budget until the
  owner's next review is 8 runs.
- **Worker**: follow scripts/worker-prompt.md, but claim the item first: as
  soon as you have picked it, set its status line to `Durum: IN-PROGRESS`,
  commit only docs/BACKLOG.md as `claim: <ID>`, and push it (step 6). If that
  push is rejected, another run or the owner moved first: `git fetch origin`,
  then `git merge origin/claude/cloud-backlog --no-edit`, and go back to step 2.

One role per run, then stop. Those prompts say "Never push"; step 6 below is
the only exception.

## 6. Push

1. `git status` must be clean. Leftover changes that are not part of a green
   commit get discarded with `git stash push -u`.
2. `git push -u origin claude/cloud-backlog`
3. If the push is rejected because the remote branch moved (a hub edit or
   another run), run `git fetch origin`, then
   `git merge origin/claude/cloud-backlog --no-edit`, then push again. On a
   conflict in docs/BACKLOG.md or docs/QUESTIONS.md, keep every change from
   `hub:` commits (new items, order, statuses, answers) and re-apply yours.

Push only `claude/cloud-backlog`. Never push `main` or any other branch, never
force-push, and never open, merge or close pull requests; the owner reviews
and merges.

End with one or two sentences in <OWNER LANGUAGE> for the owner: which role
this run had, which backlog item it worked on, and the result.
