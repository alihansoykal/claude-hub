# Claude Hub — agent guide

A static web app (GitHub Pages) where the owner manages the backlogs of all
their projects: add tasks, reorder, answer questions, pause cloud runs, and
see what is done, running and waiting. Each project's hourly Claude cloud run
works through the same backlog. The contract between the two is
`protocol/PROTOCOL.md`.

The owner reads Turkish: the UI and README are Turkish; code, comments and
PROTOCOL.md are English.

## Stack

TypeScript · Vite · Vitest · no framework, no runtime dependencies.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5180; `/?demo` runs on in-memory sample projects |
| `npm test` | Unit tests (`tests/unit`) |
| `npm run check` | typecheck + tests + build. **The definition of done.** |

## Architecture

- `src/core/` — pure logic, no DOM, unit-tested: `backlog.ts` (parse
  BACKLOG.md; add, move, set status — every edit keeps untouched lines byte
  for byte so git merges with cloud runs stay clean), `questions.ts`
  (QUESTIONS.md, answers), `project.ts` (hub.json, grouping, "is a run working
  right now" from `claim:` commits), `markdown.ts` (safe Markdown subset),
  `lines.ts`, `base64.ts`.
- `src/github.ts` — the GitHub REST calls (`GitHub` interface, `RestGitHub`
  with the owner's token from localStorage).
- `src/memoryGitHub.ts`, `src/demo.ts` — in-memory GitHub for `?demo` and tests.
- `src/hub.ts` — discover projects (repos with `.claude/hub.json`), load a
  project, `editFile` (read → change → commit on the work branch, re-applied
  on a conflict), pause / resume.
- `src/app.ts` — state and owner actions; `src/ui/views.ts` renders everything
  from state; `src/main.ts` routing (`#/`, `#/p/<owner>/<repo>/<tab>`,
  `#/settings`) and auto-refresh.
- `protocol/` — the contract and prompt templates for project repos.
- `.github/workflows/pages.yml` — check and deploy to Pages on every push to `main`.

## Rules

1. Rules about file formats live in `src/core` with unit tests. A change to a
   format or to what the hub writes is a protocol change: update
   `protocol/PROTOCOL.md` and the templates in the same commit.
2. Run `npm run check` before every commit. Never commit red.
3. After a visual change, look at it in the browser (`/?demo`, phone width
   and dark mode too).
4. Every user-visible text is Turkish. No new dependencies without the owner's OK.
5. The token never leaves the browser except to api.github.com; never log it,
   never put it in a URL.
