You are working unattended on <PROJECT NAME> in this repository. Nobody will
answer questions, so make reasonable decisions and record them.

Shell commands: one simple command per Bash call, run as is from the project
root. No `cd`, no `&&`, `||`, `;` or `|`. Read, Grep and Glob for files.

1. Read CLAUDE.md, docs/BACKLOG.md and the last three entries of
   docs/PROGRESS.md.
2. Pick the FIRST backlog item whose status line is exactly "Durum: TODO".
   Skip every other status. If the item points to notes in docs/research/,
   read them. An item with `Kaynak: hub (…)` came from the owner directly:
   their `Sahibinin notu:` is the spec.
3. Implement the item fully, following CLAUDE.md. Add or update tests for
   every rule you touch.
4. Run `<CHECK COMMAND>`. <HOW TO LOOK AT VISUAL RESULTS, e.g. open the PNGs
   in screenshots/ and check that the result really looks right.>
5. If everything is green: change the status line to "Durum: DONE" and add a
   one-line `Not:` in <OWNER LANGUAGE> under it saying what was done. Append
   an entry to docs/PROGRESS.md: what changed, how to try it, and anything the
   owner should look at or decide. Commit everything as
   `feat(<ID>): short summary` (or `fix(<ID>): …`).
6. If you cannot get it green after three serious attempts: put your code
   changes aside with `git stash push -u -m "<ID> failed attempt"`, set the
   status line to "Durum: BLOCKED" with a `Not:` giving the reason, append a
   PROGRESS entry explaining what you tried, and commit only the docs as
   `chore(<ID>): blocked`.
7. Do exactly one backlog item, then stop. Never push. Never edit the owner's
   files. Do not reorder or rewrite other backlog items; planning is the
   manager's job.
