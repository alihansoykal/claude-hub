// Shared helpers for the line-based Markdown files the hub reads and edits.
// Edits keep every untouched line byte for byte, so git merges stay clean.

export interface Lines {
  lines: string[];
  eol: '\n' | '\r\n';
  /** Whether the text ended with a line break. */
  finalEol: boolean;
}

export function splitLines(text: string): Lines {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const finalEol = text.endsWith('\n');
  const body = finalEol ? text.slice(0, text.endsWith('\r\n') ? -2 : -1) : text;
  return { lines: body === '' && !finalEol ? [] : body.split(/\r?\n/), eol, finalEol };
}

export function joinLines({ lines, eol, finalEol }: Lines): string {
  return lines.join(eol) + (finalEol || lines.length === 0 ? eol : '');
}

/** For each line, whether it sits inside a ``` fence (fence lines included). */
export function fenceMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = [];
  let inFence = false;
  for (const line of lines) {
    const isFence = /^\s*(```|~~~)/.test(line);
    if (isFence) {
      mask.push(true);
      inFence = !inFence;
    } else {
      mask.push(inFence);
    }
  }
  return mask;
}

/** Heading level (1..6) of a Markdown ATX heading line, or 0. */
export function headingLevel(line: string): number {
  const m = /^(#{1,6})\s/.exec(line);
  return m ? m[1].length : 0;
}

/** Today's date as YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One line of free text for a `Key: value` line (no line breaks). */
export function oneLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' ').trim();
}
