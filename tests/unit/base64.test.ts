import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../../src/core/base64';

describe('base64', () => {
  it('round-trips Turkish text and emoji', () => {
    const text = 'Durum: TODO\nŞu an çalışılıyor — ğüşıöç İ 🏄\n';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  it('reads GitHub style base64 with line breaks', () => {
    const b64 = encodeBase64('x'.repeat(200));
    const wrapped = b64.replace(/(.{60})/g, '$1\n');
    expect(decodeBase64(wrapped)).toBe('x'.repeat(200));
  });

  it('handles files bigger than one chunk', () => {
    const big = 'ğ'.repeat(100_000);
    expect(decodeBase64(encodeBase64(big))).toBe(big);
  });
});
