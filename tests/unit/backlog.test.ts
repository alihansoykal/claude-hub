import { describe, expect, it } from 'vitest';
import {
  addItem,
  itemDate,
  itemField,
  itemNotes,
  itemQuestionIds,
  moveInQueue,
  moveItem,
  nextId,
  parseBacklog,
  setStatus,
} from '../../src/core/backlog';

const SAMPLE = `# Backlog

Durumlar:
- \`TODO\` — sırada
Durum: TODO

\`\`\`
### B-900 Not an item, inside a fence
Durum: TODO
\`\`\`

## Epic: Levels

### B-001 Level list
Durum: DONE
Not (2026-10-19): Bitti.
Boyut: S

### B-002 Paddle out
Durum: IN-PROGRESS
Boyut: M

### B-003 Catch the wave
Durum: TODO
Kaynak: IDEAS 2
Soru: S-004

### [Sen] B-004 Not an item heading

### B-005 [Sen] Try on the phone
Durum: OWNER

## Polish

### B-006 Icon
Durum: NEEDS-DECISION
Soru: S-003

### B-007 Splash
Durum: TODO

### B-010 Map
Durum: NEW

## Tamamlananlar / İptaller

### B-008 Old idea
Durum: CANCELLED
`;

const ids = (text: string, status?: string) =>
  parseBacklog(text)
    .items.filter((i) => !status || i.status === status)
    .map((i) => i.id);

describe('parseBacklog', () => {
  it('reads item blocks, skipping prose and fenced examples', () => {
    expect(ids(SAMPLE)).toEqual(['B-001', 'B-002', 'B-003', 'B-005', 'B-006', 'B-007', 'B-010', 'B-008']);
  });

  it('reads status, title and section', () => {
    const b = parseBacklog(SAMPLE);
    const byId = Object.fromEntries(b.items.map((i) => [i.id, i]));
    expect(byId['B-002'].status).toBe('IN-PROGRESS');
    expect(byId['B-005'].title).toBe('[Sen] Try on the phone');
    expect(byId['B-006'].section).toBe('Polish');
    expect(byId['B-008'].section).toBe('Tamamlananlar / İptaller');
    expect(byId['B-001'].body).toEqual(['Durum: DONE', 'Not (2026-10-19): Bitti.', 'Boyut: S']);
  });

  it('marks an unknown status as null', () => {
    expect(parseBacklog('### B-001 X\nDurum: SOMEDAY\n').items[0].status).toBeNull();
    expect(parseBacklog('### B-001 X\n').items[0].status).toBeNull();
  });

  it('reads fields, notes, dates and question refs', () => {
    const [b1, , b3] = parseBacklog(SAMPLE).items;
    expect(itemField(b1, 'Boyut')).toBe('S');
    expect(itemField(b1, 'Kaynak')).toBeNull();
    expect(itemNotes(b1)).toEqual(['Not (2026-10-19): Bitti.']);
    expect(itemDate(b1)).toBe('2026-10-19');
    expect(itemQuestionIds(b3)).toEqual(['S-004']);
  });

  it('handles CRLF files', () => {
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    expect(ids(crlf)).toEqual(ids(SAMPLE));
  });
});

describe('moveItem / moveInQueue', () => {
  it('moves a TODO to the top of the movable queue', () => {
    const out = moveInQueue(SAMPLE, 'B-010', 'top');
    expect(ids(out).filter((id) => ['B-003', 'B-007', 'B-010'].includes(id))).toEqual(['B-010', 'B-003', 'B-007']);
    // The moved block lands in the first item's section, right before it.
    expect(parseBacklog(out).items.find((i) => i.id === 'B-010')!.section).toBe('Epic: Levels');
  });

  it('moves up and down one queue place, skipping non-queue items', () => {
    expect(ids(moveInQueue(SAMPLE, 'B-007', 'up'))).toEqual([
      'B-001', 'B-002', 'B-007', 'B-003', 'B-005', 'B-006', 'B-010', 'B-008',
    ]);
    expect(ids(moveInQueue(SAMPLE, 'B-003', 'down'))).toEqual([
      'B-001', 'B-002', 'B-005', 'B-006', 'B-007', 'B-003', 'B-010', 'B-008',
    ]);
    expect(ids(moveInQueue(SAMPLE, 'B-003', 'bottom'))).toEqual([
      'B-001', 'B-002', 'B-005', 'B-006', 'B-007', 'B-010', 'B-003', 'B-008',
    ]);
  });

  it('leaves the text untouched for impossible moves', () => {
    expect(moveInQueue(SAMPLE, 'B-003', 'top')).toBe(SAMPLE);
    expect(moveInQueue(SAMPLE, 'B-010', 'down')).toBe(SAMPLE);
    expect(() => moveInQueue(SAMPLE, 'B-001', 'up')).toThrow();
  });

  it('keeps every line and one blank line between blocks', () => {
    const out = moveItem(SAMPLE, 'B-001', 'B-007', 'after');
    expect(out.split('\n').sort()).toEqual(SAMPLE.split('\n').sort());
    expect(out).not.toMatch(/\n\n\n/);
    expect(out).toContain('Durum: TODO\n\n### B-001 Level list\nDurum: DONE');
  });

  it('moves the last block of a file without a final newline', () => {
    const text = '### B-001 A\nDurum: TODO\n\n### B-002 B\nDurum: TODO';
    expect(moveInQueue(text, 'B-002', 'top')).toBe('### B-002 B\nDurum: TODO\n\n### B-001 A\nDurum: TODO\n');
  });
});

describe('nextId', () => {
  it('continues the main prefix past every mention', () => {
    expect(nextId(SAMPLE)).toBe('B-011');
    expect(nextId(SAMPLE + '\nSee B-042 later.\n')).toBe('B-043');
  });

  it('starts at 001 on an empty backlog', () => {
    expect(nextId('# Backlog\n')).toBe('B-001');
  });
});

describe('addItem', () => {
  const date = new Date(2026, 9, 22);

  it('adds a NEW item after the last queue item by default', () => {
    const { text, id } = addItem(SAMPLE, { title: 'Level map', description: 'A map\nof levels', direct: false, position: 'bottom', date });
    expect(id).toBe('B-011');
    expect(ids(text)).toEqual(['B-001', 'B-002', 'B-003', 'B-005', 'B-006', 'B-007', 'B-010', 'B-011', 'B-008']);
    expect(text).toContain('### B-011 Level map\nDurum: NEW\nKaynak: hub (2026-10-22)\nSahibinin notu:\nA map\nof levels\n\n## Tamamlananlar');
  });

  it('adds a direct TODO on top of the movable queue', () => {
    const { text } = addItem(SAMPLE, { title: 'Urgent', description: '', direct: true, position: 'top', date });
    const items = parseBacklog(text).items;
    expect(items.map((i) => i.id).slice(0, 3)).toEqual(['B-001', 'B-002', 'B-011']);
    expect(items[2].status).toBe('TODO');
    expect(items[2].body).toEqual(['Durum: TODO', 'Kaynak: hub (2026-10-22)']);
  });

  it('puts the first item of an empty queue before the done section', () => {
    const text = '# Backlog\n\n## Tamamlananlar\n\n### B-001 X\nDurum: DONE\n';
    const out = addItem(text, { title: 'Y', description: '', direct: false, position: 'bottom', date }).text;
    expect(out).toBe('# Backlog\n\n### B-002 Y\nDurum: NEW\nKaynak: hub (2026-10-22)\n\n## Tamamlananlar\n\n### B-001 X\nDurum: DONE\n');
  });

  it('defuses headings, status lines and open fences in the description', () => {
    const { text } = addItem(SAMPLE, {
      title: 'Line\nbreak',
      description: '## Not a section\nDurum: TODO\n```js\ncode',
      direct: false,
      position: 'bottom',
      date,
    });
    const b = parseBacklog(text);
    const added = b.items.find((i) => i.id === 'B-011')!;
    expect(added.title).toBe('Line break');
    expect(added.status).toBe('NEW');
    expect(added.body).toContain('\\## Not a section');
    expect(added.body).toContain('Durum - TODO');
    expect(added.body[added.body.length - 1]).toBe('```');
    // Items after it still parse.
    expect(b.items.find((i) => i.id === 'B-008')!.status).toBe('CANCELLED');
  });

  it('rejects an empty title', () => {
    expect(() => addItem(SAMPLE, { title: '  ', description: '', direct: false, position: 'top', date })).toThrow();
  });
});

describe('setStatus', () => {
  const date = new Date(2026, 9, 22);

  it('rewrites the status line and adds a note under it', () => {
    const out = setStatus(SAMPLE, 'B-005', 'DONE', "Sahibi hub'dan tamamladı.", date);
    expect(out).toContain("### B-005 [Sen] Try on the phone\nDurum: DONE\nNot (2026-10-22): Sahibi hub'dan tamamladı.\n");
    expect(parseBacklog(out).items.find((i) => i.id === 'B-005')!.status).toBe('DONE');
  });

  it('adds a status line when the block has none', () => {
    expect(setStatus('### B-001 X\nBoyut: S\n', 'B-001', 'TODO', null, date)).toBe('### B-001 X\nDurum: TODO\nBoyut: S\n');
  });

  it('changes nothing else', () => {
    const out = setStatus(SAMPLE, 'B-007', 'CANCELLED', null, date);
    expect(out).toBe(SAMPLE.replace('### B-007 Splash\nDurum: TODO', '### B-007 Splash\nDurum: CANCELLED'));
  });
});
