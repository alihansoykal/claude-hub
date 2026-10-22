// docs/QUESTIONS.md: the manager appends `### S-xxx <title>` blocks; the owner
// answers on the block's `Cevap:` line. An empty `Cevap:` means still open.

import { fenceMask, headingLevel, joinLines, oneLine, splitLines } from './lines';

export interface Question {
  id: string;
  title: string;
  line: number;
  end: number;
  /** The lines under the heading, without the `Cevap:` line and trailing blanks. */
  body: string[];
  answer: string;
  open: boolean;
}

const Q_HEADING = /^###\s+([A-Za-z]+-\d+)\b[:.]?\s*(.*)$/;
const ANSWER = /^Cevap:\s?(.*)$/;

export function parseQuestions(text: string): Question[] {
  const { lines } = splitLines(text);
  const mask = fenceMask(lines);
  const out: Question[] = [];
  let open: Question | null = null;
  const close = (end: number) => {
    if (!open) return;
    open.end = end;
    const body: string[] = [];
    let answered = false;
    for (let i = open.line + 1; i < end; i++) {
      const m = !answered && !mask[i] ? ANSWER.exec(lines[i]) : null;
      if (m) {
        answered = true;
        open.answer = m[1].trim();
      } else {
        body.push(lines[i]);
      }
    }
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    open.body = body;
    open.open = open.answer === '';
    out.push(open);
    open = null;
  };
  lines.forEach((line, i) => {
    if (mask[i]) return;
    const level = headingLevel(line);
    if (level === 0 || level > 3) return;
    close(i);
    const m = level === 3 ? Q_HEADING.exec(line) : null;
    if (m) open = { id: m[1].toUpperCase(), title: m[2].trim(), line: i, end: i + 1, body: [], answer: '', open: true };
  });
  close(lines.length);
  return out;
}

/** Writes the owner's answer on the question's `Cevap:` line (adding one if missing). */
export function answerQuestion(text: string, id: string, answer: string): string {
  const value = oneLine(answer);
  if (!value) throw new Error('An answer cannot be empty');
  const t = splitLines(text);
  const q = parseQuestions(text).find((x) => x.id === id);
  if (!q) throw new Error(`Question ${id} not found`);
  const lines = t.lines.slice();
  const mask = fenceMask(lines);
  for (let i = q.line + 1; i < q.end; i++) {
    if (!mask[i] && ANSWER.test(lines[i])) {
      lines[i] = `Cevap: ${value}`;
      return joinLines({ ...t, lines });
    }
  }
  let at = q.end;
  while (at > q.line + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, `Cevap: ${value}`);
  return joinLines({ ...t, lines });
}
