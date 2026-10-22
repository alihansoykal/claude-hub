import { describe, expect, it } from 'vitest';
import { answerQuestion, parseQuestions } from '../../src/core/questions';

const SAMPLE = `# Sorular

Format:

\`\`\`
### S-001 Kısa soru başlığı
Cevap:
\`\`\`

---

### S-001 Ekran yönü
Neden soruyorum: ...
Önerim: (a)
Cevap: (a) sadece dikey.
→ İşlendi: B-030

### S-002 İkon
Seçenekler: (a) eski (b) yeni
Cevap:

### S-003 No answer line yet
Önerim: x
`;

describe('parseQuestions', () => {
  it('skips the fenced template and reads answers', () => {
    const qs = parseQuestions(SAMPLE);
    expect(qs.map((q) => [q.id, q.open, q.answer])).toEqual([
      ['S-001', false, '(a) sadece dikey.'],
      ['S-002', true, ''],
      ['S-003', true, ''],
    ]);
    expect(qs[0].body).toEqual(['Neden soruyorum: ...', 'Önerim: (a)', '→ İşlendi: B-030']);
    expect(qs[1].title).toBe('İkon');
  });
});

describe('answerQuestion', () => {
  it('fills an empty Cevap line', () => {
    const out = answerQuestion(SAMPLE, 'S-002', '(b) yeni\nikon');
    expect(out).toContain('Seçenekler: (a) eski (b) yeni\nCevap: (b) yeni ikon\n\n### S-003');
    expect(parseQuestions(out).find((q) => q.id === 'S-002')!.open).toBe(false);
  });

  it('adds a Cevap line at the end of a block that has none', () => {
    const out = answerQuestion(SAMPLE, 'S-003', 'evet');
    expect(out.endsWith('### S-003 No answer line yet\nÖnerim: x\nCevap: evet\n')).toBe(true);
  });

  it('does not touch the fenced template', () => {
    const out = answerQuestion(SAMPLE, 'S-002', 'b');
    expect(out).toContain('### S-001 Kısa soru başlığı\nCevap:\n```');
  });

  it('rejects empty answers and unknown ids', () => {
    expect(() => answerQuestion(SAMPLE, 'S-002', '  ')).toThrow();
    expect(() => answerQuestion(SAMPLE, 'S-009', 'x')).toThrow();
  });
});
