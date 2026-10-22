// What the hub shows about a project: its config, its items grouped by state,
// and whether a cloud run is working on it right now.

import { itemDate, MOVABLE_STATUSES, type BacklogItem } from './backlog';

/** `.claude/hub.json` on the project's default branch marks a repo as a hub project. */
export interface HubConfig {
  name: string | null;
  icon: string | null;
  /** The branch the cloud runs work on. */
  branch: string;
  backlog: string;
  questions: string;
}

export const DEFAULT_BRANCH = 'claude/cloud-backlog';
export const CONFIG_PATH = '.claude/hub.json';
/** Exists on the work branch while the owner has paused the cloud runs. */
export const PAUSE_PATH = '.claude/hub-paused';
/** A claim older than this belongs to a run that stopped (same as the cloud prompt). */
export const CLAIM_FRESH_MS = 75 * 60 * 1000;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parseHubConfig(text: string): HubConfig {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    // A broken file still marks a hub project; defaults apply.
  }
  return {
    name: str(raw.name),
    icon: str(raw.icon),
    branch: str(raw.branch) ?? DEFAULT_BRANCH,
    backlog: str(raw.backlog) ?? 'docs/BACKLOG.md',
    questions: str(raw.questions) ?? 'docs/QUESTIONS.md',
  };
}

export interface Groups {
  inProgress: BacklogItem[];
  /** TODO and NEW in work order. */
  queue: BacklogItem[];
  owner: BacklogItem[];
  decision: BacklogItem[];
  blocked: BacklogItem[];
  /** Newest first. */
  done: BacklogItem[];
  cancelled: BacklogItem[];
  /** Blocks with no or an unknown status line. */
  other: BacklogItem[];
}

/**
 * When each item was finished, from `feat(B-048): …` style commits
 * (newest first in, so the newest commit naming an item wins).
 */
export function completionDates(commits: readonly Commit[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const c of commits) {
    const kind = commitKind(c.message);
    if (kind !== 'feat' && kind !== 'fix' && kind !== 'chore') continue;
    const head = c.message.split('\n')[0];
    const scope = /^\w+\(([^)]*)\)/.exec(head);
    if (!scope) continue;
    for (const m of scope[1].matchAll(/\b[A-Z]+-\d+\b/g)) if (!dates.has(m[0])) dates.set(m[0], c.date);
  }
  return dates;
}

/** `doneDates` (from completionDates) orders finished items before the dates written in them. */
export function groupItems(items: readonly BacklogItem[], doneDates: ReadonlyMap<string, string> = new Map()): Groups {
  const g: Groups = { inProgress: [], queue: [], owner: [], decision: [], blocked: [], done: [], cancelled: [], other: [] };
  for (const item of items) {
    if (item.status && MOVABLE_STATUSES.includes(item.status)) g.queue.push(item);
    else if (item.status === 'IN-PROGRESS') g.inProgress.push(item);
    else if (item.status === 'OWNER') g.owner.push(item);
    else if (item.status === 'NEEDS-DECISION') g.decision.push(item);
    else if (item.status === 'BLOCKED') g.blocked.push(item);
    else if (item.status === 'DONE') g.done.push(item);
    else if (item.status === 'CANCELLED') g.cancelled.push(item);
    else g.other.push(item);
  }
  // Newest date first; undated items keep reverse file order after the dated ones.
  const order = new Map(g.done.map((item, i) => [item, i]));
  const when = (item: BacklogItem) => doneDates.get(item.id) ?? itemDate(item) ?? '';
  g.done.sort((a, b) => {
    const da = when(a);
    const db = when(b);
    if (da !== db) return da < db ? 1 : -1;
    return order.get(b)! - order.get(a)!;
  });
  return g;
}

export interface Commit {
  sha: string;
  message: string;
  /** ISO time. */
  date: string;
  url: string;
}

export type CommitKind = 'claim' | 'plan' | 'feat' | 'fix' | 'hub' | 'merge' | 'chore' | 'other';

export function commitKind(message: string): CommitKind {
  const head = message.split('\n')[0];
  if (/^claim:/i.test(head)) return 'claim';
  if (/^plan:/i.test(head)) return 'plan';
  if (/^hub:/i.test(head)) return 'hub';
  if (/^merge\b/i.test(head)) return 'merge';
  if (/^feat\b/i.test(head)) return 'feat';
  if (/^fix\b/i.test(head)) return 'fix';
  if (/^(chore|docs|test|refactor|build|ci|style|perf)\b/i.test(head)) return 'chore';
  return 'other';
}

export type RunState =
  | { kind: 'idle' }
  /** A run claimed the item recently and is (most likely) still working. */
  | { kind: 'working'; item: BacklogItem; since: string }
  /** The item is IN-PROGRESS but its claim is old or unknown: the next run resets it. */
  | { kind: 'stale'; item: BacklogItem; since: string | null };

/** `commits` newest first, as the GitHub API lists them. */
export function runState(items: readonly BacklogItem[], commits: readonly Commit[], now: number): RunState {
  const item = items.find((i) => i.status === 'IN-PROGRESS');
  if (!item) return { kind: 'idle' };
  const claim = commits.find((c) => new RegExp(`^claim:\\s*${item.id}\\b`, 'i').test(c.message));
  if (!claim) return { kind: 'stale', item, since: null };
  const age = now - Date.parse(claim.date);
  return age < CLAIM_FRESH_MS ? { kind: 'working', item, since: claim.date } : { kind: 'stale', item, since: claim.date };
}

/** "5 dk önce", "3 sa önce", "2 gün önce". */
export function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'az önce';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  return `${d} gün önce`;
}

/** Minutes since `iso`, for "32 dk'dır çalışıyor". */
export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
}
