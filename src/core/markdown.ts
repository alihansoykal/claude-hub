// A small, safe Markdown subset for item and question bodies: everything is
// escaped first, then lists, quotes, code, bold, links and `Key:` labels.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESC[c]);
}

function inline(text: string): string {
  // Code spans first, so nothing inside them gets formatted.
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      let s = escapeHtml(part);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
        (_m, label: string | undefined, href: string | undefined, bare: string | undefined) => {
          const url = href ?? bare!;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label ?? url}</a>`;
        },
      );
      return s;
    })
    .join('');
}

/** `Kabul kriterleri: ...` → a bold label. Only short capitalised keys count. */
function labelled(line: string): string {
  const m = /^([A-ZÇĞİÖŞÜ→][^:`]{0,40}):(\s|$)(.*)$/.exec(line);
  if (!m) return inline(line);
  return `<strong>${escapeHtml(m[1])}:</strong>${m[3] ? ' ' + inline(m[3]) : ''}`;
}

export function renderMarkdown(lines: readonly string[]): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    if (code) {
      if (/^\s*(```|~~~)/.test(raw)) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }
    if (/^\s*(```|~~~)/.test(raw)) {
      flushPara();
      closeList();
      code = [];
      continue;
    }
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${labelled((bullet ?? numbered)![1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    para.push(labelled(line));
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushPara();
  closeList();
  return out.join('');
}
