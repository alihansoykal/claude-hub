// docs/BACKLOG.md: one `### <ID> <title>` block per item, its state on a
// `Durum: <STATUS>` line. Workers take the first `Durum: TODO` from the top,
// so the order of the blocks in the file is the work order.

import { fenceMask, headingLevel, isoDate, joinLines, oneLine, splitLines, type Lines } from './lines';

export const STATUSES = [
  'NEW',
  'TODO',
  'IN-PROGRESS',
  'DONE',
  'BLOCKED',
  'NEEDS-DECISION',
  'OWNER',
  'CANCELLED',
] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses a worker run can still pick up (or is working on). */
export const QUEUE_STATUSES: readonly Status[] = ['IN-PROGRESS', 'TODO', 'NEW'];
/** Statuses the owner can reorder in the hub. */
export const MOVABLE_STATUSES: readonly Status[] = ['TODO', 'NEW'];

export interface BacklogItem {
  id: string;
  title: string;
  /** null when the block has no `Durum:` line or an unknown status. */
  status: Status | null;
  /** Index of the `### ID title` line. */
  line: number;
  /** One past the block's last line: the next heading, or the end of the file. */
  end: number;
  /** The lines under the heading, without trailing blank lines. */
  body: string[];
  /** The `## ` heading the item sits under ('' before the first one). */
  section: string;
}

export interface Backlog {
  text: Lines;
  items: BacklogItem[];
}

const ITEM_HEADING = /^###\s+([A-Za-z]+-\d+)\b[:.]?\s*(.*)$/;
const STATUS_LINE = /^Durum:\s*([A-Za-z-]+)/;
const DONE_SECTION = /tamamlan|iptal|done|completed|archive/i;

function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

function trimTrailingBlanks(lines: string[]): string[] {
  let n = lines.length;
  while (n > 0 && lines[n - 1].trim() === '') n--;
  return lines.slice(0, n);
}

export function parseBacklog(text: string): Backlog {
  const t = splitLines(text);
  const mask = fenceMask(t.lines);
  const items: BacklogItem[] = [];
  let section = '';
  let open: BacklogItem | null = null;

  const close = (end: number) => {
    if (!open) return;
    open.end = end;
    open.body = trimTrailingBlanks(t.lines.slice(open.line + 1, end));
    for (let i = open.line + 1; i < end; i++) {
      const m = mask[i] ? null : STATUS_LINE.exec(t.lines[i]);
      if (m) {
        const s = m[1].toUpperCase();
        open.status = isStatus(s) ? s : null;
        break;
      }
    }
    items.push(open);
    open = null;
  };

  t.lines.forEach((line, i) => {
    if (mask[i]) return;
    const level = headingLevel(line);
    if (level === 0 || level > 3) return;
    close(i);
    if (level < 3) {
      section = level === 2 ? line.replace(/^##\s+/, '').trim() : '';
      return;
    }
    const m = ITEM_HEADING.exec(line);
    if (m) {
      open = { id: m[1].toUpperCase(), title: m[2].trim(), status: null, line: i, end: i + 1, body: [], section };
    }
  });
  close(t.lines.length);
  return { text: t, items };
}

/** Value of the first `Key: value` line in an item, e.g. field(item, 'Boyut'). */
export function itemField(item: BacklogItem, key: string): string | null {
  const prefix = key + ':';
  const line = item.body.find((l) => l.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
}

/** The item's `Not (...)` / `Not:` lines, newest last as written. */
export function itemNotes(item: BacklogItem): string[] {
  return item.body.filter((l) => /^Not\b[^:]*:/.test(l));
}

/** The newest YYYY-MM-DD date written anywhere in the item, or null. */
export function itemDate(item: BacklogItem): string | null {
  let best: string | null = null;
  for (const l of item.body) {
    for (const m of l.matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)) if (!best || m[1] > best) best = m[1];
  }
  return best;
}

/** Question ids (S-xxx) an item refers to. */
export function itemQuestionIds(item: BacklogItem): string[] {
  const ids = new Set<string>();
  for (const l of item.body) for (const m of l.matchAll(/\bS-\d+\b/g)) ids.add(m[0]);
  return [...ids];
}

function findItem(b: Backlog, id: string): BacklogItem {
  const item = b.items.find((i) => i.id === id);
  if (!item) throw new Error(`Backlog item ${id} not found`);
  return item;
}

/** An item's lines, ending with exactly one blank line. */
function block(lines: readonly string[], item: BacklogItem): string[] {
  return [...trimTrailingBlanks(lines.slice(item.line, item.end)), ''];
}

/** Inserts a block at `at`, keeping one blank line before it. */
function insertBlock(lines: string[], at: number, blk: string[]): void {
  const before = at > 0 && lines[at - 1].trim() !== '' ? [''] : [];
  lines.splice(at, 0, ...before, ...blk);
}

/** Moves item `id` right before or after item `targetId`. */
export function moveItem(text: string, id: string, targetId: string, where: 'before' | 'after'): string {
  if (id === targetId) return text;
  const b = parseBacklog(text);
  const item = findItem(b, id);
  const target = findItem(b, targetId);
  const lines = b.text.lines.slice();
  const blk = block(lines, item);
  const removed = item.end - item.line;
  lines.splice(item.line, removed);
  const shift = target.line > item.line ? removed : 0;
  const at = where === 'before' ? target.line - shift : target.end - shift;
  insertBlock(lines, at, blk);
  return joinLines({ ...b.text, lines });
}

export type QueueMove = 'top' | 'up' | 'down' | 'bottom';

/** Moves a TODO / NEW item within the work order; other items keep their places. */
export function moveInQueue(text: string, id: string, move: QueueMove): string {
  const movable = parseBacklog(text).items.filter((i) => i.status && MOVABLE_STATUSES.includes(i.status));
  const idx = movable.findIndex((i) => i.id === id);
  if (idx < 0) throw new Error(`${id} is not a TODO or NEW item`);
  const last = movable.length - 1;
  switch (move) {
    case 'top':
      return idx === 0 ? text : moveItem(text, id, movable[0].id, 'before');
    case 'up':
      return idx === 0 ? text : moveItem(text, id, movable[idx - 1].id, 'before');
    case 'down':
      return idx === last ? text : moveItem(text, id, movable[idx + 1].id, 'after');
    case 'bottom':
      return idx === last ? text : moveItem(text, id, movable[last].id, 'after');
  }
}

/** The next free id: the most used prefix, one past the highest number mentioned. */
export function nextId(text: string): string {
  const b = parseBacklog(text);
  const counts = new Map<string, number>();
  for (const i of b.items) {
    const p = i.id.split('-')[0];
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let prefix = 'B';
  let best = 0;
  for (const [p, n] of counts) if (n > best) [prefix, best] = [p, n];
  // Mentions count too (a note may name an item planned for later), fenced examples do not.
  const mask = fenceMask(b.text.lines);
  const mentioned = new RegExp(`\\b${prefix}-(\\d+)\\b`, 'g');
  let max = 0;
  let width = 3;
  b.text.lines.forEach((line, i) => {
    if (mask[i]) return;
    for (const m of line.matchAll(mentioned)) {
      max = Math.max(max, Number(m[1]));
      width = Math.max(width, m[1].length);
    }
  });
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

/** Owner text made safe inside a block: no headings, no status lines, fences closed. */
function safeBody(text: string): string[] {
  const lines = trimTrailingBlanks(text.replace(/\r\n/g, '\n').split('\n'));
  while (lines.length && lines[0].trim() === '') lines.shift();
  const out = lines.map((l) => {
    if (/^\s*#/.test(l)) return '\\' + l.trimStart();
    if (/^Durum:/.test(l)) return 'Durum -' + l.slice('Durum:'.length);
    return l;
  });
  if (out.filter((l) => /^\s*(```|~~~)/.test(l)).length % 2) out.push('```');
  return out;
}

export interface NewItem {
  title: string;
  description: string;
  /** true: straight to the work queue (TODO); false: the manager plans it first (NEW). */
  direct: boolean;
  position: 'top' | 'bottom';
  date: Date;
}

export function addItem(text: string, n: NewItem): { text: string; id: string } {
  const title = oneLine(n.title);
  if (!title) throw new Error('A task needs a title');
  const id = nextId(text);
  const b = parseBacklog(text);
  const desc = safeBody(n.description);
  const blk = [
    `### ${id} ${title}`,
    `Durum: ${n.direct ? 'TODO' : 'NEW'}`,
    `Kaynak: hub (${isoDate(n.date)})`,
    ...(desc.length ? ['Sahibinin notu:', ...desc] : []),
    '',
  ];
  const lines = b.text.lines.slice();
  const movable = b.items.filter((i) => i.status && MOVABLE_STATUSES.includes(i.status));
  const queue = b.items.filter((i) => i.status && QUEUE_STATUSES.includes(i.status));
  let at: number;
  if (n.position === 'top' && movable.length) {
    at = movable[0].line;
  } else if (queue.length) {
    at = queue[queue.length - 1].end;
  } else {
    const mask = fenceMask(lines);
    const doneHeading = lines.findIndex((l, i) => !mask[i] && headingLevel(l) === 2 && DONE_SECTION.test(l));
    at = doneHeading >= 0 ? doneHeading : lines.length;
  }
  insertBlock(lines, at, blk);
  return { text: joinLines({ ...b.text, lines }), id };
}

/** Sets an item's status line (adding one if missing), with an optional note under it. */
export function setStatus(text: string, id: string, status: Status, note: string | null, date: Date): string {
  const b = parseBacklog(text);
  const item = findItem(b, id);
  const lines = b.text.lines.slice();
  const mask = fenceMask(lines);
  let at = -1;
  for (let i = item.line + 1; i < item.end; i++) {
    if (!mask[i] && STATUS_LINE.test(lines[i])) {
      at = i;
      break;
    }
  }
  if (at >= 0) {
    lines[at] = `Durum: ${status}`;
  } else {
    at = item.line + 1;
    lines.splice(at, 0, `Durum: ${status}`);
  }
  if (note && oneLine(note)) lines.splice(at + 1, 0, `Not (${isoDate(date)}): ${oneLine(note)}`);
  return joinLines({ ...b.text, lines });
}
