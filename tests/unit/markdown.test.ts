import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/core/markdown';

describe('renderMarkdown', () => {
  it('escapes HTML everywhere', () => {
    const html = renderMarkdown(['<img src=x onerror=alert(1)>', '- <b>x</b>', '`<script>`']);
    expect(html).not.toMatch(/<img|<b>|<script>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<code>&lt;script&gt;</code>');
  });

  it('renders labels, lists and paragraphs', () => {
    expect(renderMarkdown(['Boyut: M', 'Kabul kriterleri:', '- bir', '- **iki**', '', 'son'])).toBe(
      '<p><strong>Boyut:</strong> M<br><strong>Kabul kriterleri:</strong></p><ul><li>bir</li><li><strong>iki</strong></li></ul><p>son</p>',
    );
  });

  it('keeps code fences verbatim', () => {
    expect(renderMarkdown(['```', '**not bold** <x>', '```'])).toBe('<pre><code>**not bold** &lt;x&gt;</code></pre>');
  });

  it('links only http(s) URLs', () => {
    const html = renderMarkdown(['[ok](https://a.b/c) [bad](javascript:alert(1)) https://x.y/z.']);
    expect(html).toContain('<a href="https://a.b/c" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(html).toContain('<a href="https://x.y/z" target="_blank" rel="noopener noreferrer">https://x.y/z</a>.');
    expect(html).not.toContain('href="javascript');
  });

  it('does not label lowercase or long prefixes', () => {
    expect(renderMarkdown(['note: x'])).toBe('<p>note: x</p>');
    expect(renderMarkdown(['Not (2026-10-19): Bitti.'])).toBe('<p><strong>Not (2026-10-19):</strong> Bitti.</p>');
  });
});
