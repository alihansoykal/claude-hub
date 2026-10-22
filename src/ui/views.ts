// Everything on screen, rebuilt from App state on every change.

import { TABS, type App, type Entry, type Sheet, type Tab } from '../app';
import { itemField, itemNotes, itemQuestionIds, type BacklogItem, type QueueMove } from '../core/backlog';
import { renderMarkdown } from '../core/markdown';
import { commitKind, minutesSince, relativeTime, type RunState } from '../core/project';
import type { Question } from '../core/questions';
import { fileUrl, projectName } from '../hub';
import { h, icon, type Child } from './dom';
import { COMMIT_LABEL, STATUS_CLASS, STATUS_LABEL } from './labels';

const TAB_LABEL: Record<Tab, string> = { queue: 'Sıra', waiting: 'Bekleyen', done: 'Biten', activity: 'Geçmiş' };

const now = () => Date.now();
const go = (hash: string) => {
  location.hash = hash;
};

// ---------------------------------------------------------------- sheets

/** True for the one render that opens a sheet, so re-renders do not replay its entrance. */
let sheetEntering = false;

export function openSheet(app: App, sheet: Sheet): void {
  if (!app.sheet) {
    history.pushState({ sheet: true }, '');
    sheetEntering = true;
  }
  app.sheet = sheet;
  if (sheet.kind === 'add') {
    if (sheet.title) app.drafts.set('add:title', sheet.title);
    if (sheet.repo) app.drafts.set('add:repo', sheet.repo);
  }
  render(app);
}

export function closeSheet(app: App): void {
  if (!app.sheet) return;
  if ((history.state as { sheet?: boolean } | null)?.sheet) {
    history.back(); // popstate (main.ts) clears the sheet
  } else {
    app.sheet = null;
    render(app);
  }
}

// ---------------------------------------------------------------- small parts

function draftInput(app: App, key: string, props: Record<string, unknown>, tag: 'input' | 'textarea' = 'input'): HTMLElement {
  return h(tag, {
    ...props,
    'data-draft': key,
    value: app.drafts.get(key) ?? '',
    oninput: (ev: Event) => app.drafts.set(key, (ev.target as HTMLInputElement).value),
  });
}

function badge(status: BacklogItem['status']): HTMLElement | null {
  if (!status) return h('span', { class: 'badge st-cancelled' }, 'Durum yok');
  return h('span', { class: `badge ${STATUS_CLASS[status]}` }, STATUS_LABEL[status]);
}

function iconButton(name: Parameters<typeof icon>[0], label: string, onclick: () => void, disabled = false): HTMLElement {
  return h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick, disabled }, icon(name));
}

function section(title: string, count: number | null, ...children: Child[]): HTMLElement {
  return h(
    'section',
    { class: 'section' },
    h('h2', { class: 'section-title' }, title, count !== null ? h('span', { class: 'count' }, count) : null),
    ...children,
  );
}

function empty(text: string): HTMLElement {
  return h('p', { class: 'empty' }, text);
}

function avatar(e: Entry): HTMLElement {
  const name = projectName(e.project);
  return h('span', { class: 'avatar', 'aria-hidden': 'true' }, e.project.config.icon ?? name.slice(0, 1).toUpperCase());
}

function lastActivity(e: Entry): string | null {
  const c = e.data?.commits[0];
  return c ? relativeTime(c.date, now()) : null;
}

function statePill(e: Entry): HTMLElement {
  const v = e.view;
  if (!v) return h('span', { class: 'pill' }, e.loading ? 'Yükleniyor…' : e.error ? 'Hata' : '…');
  if (e.data?.paused) return h('span', { class: 'pill pill-paused' }, 'Duraklatıldı');
  if (v.run.kind === 'working') return h('span', { class: 'pill pill-working' }, h('span', { class: 'dot' }), 'Çalışıyor');
  if (v.run.kind === 'stale') return h('span', { class: 'pill pill-stale' }, 'Yarım kaldı');
  if (v.groups.queue.length) return h('span', { class: 'pill pill-waiting' }, 'Sıradaki turu bekliyor');
  return h('span', { class: 'pill' }, 'Sıra boş');
}

function runLine(run: RunState, paused: boolean): HTMLElement | null {
  if (run.kind === 'working') {
    return h(
      'p',
      { class: 'now-line' },
      h('span', { class: 'dot' }),
      h(
        'span',
        null,
        'Şu an: ',
        h('b', null, run.item.id),
        ' ',
        run.item.title,
        h('span', { class: 'muted' }, ` · ${minutesSince(run.since, now())} dk'dır`),
      ),
    );
  }
  if (run.kind === 'stale') {
    return h(
      'p',
      { class: 'now-line stale' },
      h('span', null, h('b', null, run.item.id), ' yarım kaldı; ', paused ? 'açınca' : 'sonraki tur', ' baştan alacak.'),
    );
  }
  return null;
}

function itemRow(app: App, e: Entry, item: BacklogItem, opts: { index?: number; actions?: Child; showStatus?: boolean; extra?: Child } = {}): HTMLElement {
  const size = itemField(item, 'Boyut');
  return h(
    'div',
    { class: 'row' },
    opts.index !== undefined ? h('span', { class: 'row-num' }, opts.index) : null,
    h(
      'button',
      { class: 'row-main', type: 'button', onclick: () => openSheet(app, { kind: 'item', repo: e.project.repo.fullName, id: item.id }) },
      h('span', { class: 'row-title' }, item.title),
      h(
        'span',
        { class: 'row-meta' },
        h('span', { class: 'mono' }, item.id),
        opts.showStatus || item.status === 'NEW' ? badge(item.status) : null,
        size ? h('span', { class: 'tag' }, size) : null,
        opts.extra,
      ),
    ),
    opts.actions ? h('span', { class: 'row-actions' }, opts.actions) : null,
  );
}

// ---------------------------------------------------------------- top bar

function topbar(app: App): HTMLElement {
  const r = app.route;
  const refreshing = app.entries.some((e) => e.loading) || app.discovering;
  const refreshBtn = app.hasToken
    ? h(
        'button',
        { class: `icon-btn${refreshing ? ' spin' : ''}`, type: 'button', title: 'Yenile', 'aria-label': 'Yenile', onclick: () => void app.refresh() },
        icon('refresh'),
      )
    : null;
  if (r.name === 'project') {
    const e = app.entry(r.repo);
    return h(
      'header',
      { class: 'topbar' },
      iconButton('back', 'Projeler', () => go('#/')),
      h('h1', { class: 'topbar-title' }, e ? [avatar(e), projectName(e.project)] : r.repo),
      refreshBtn,
    );
  }
  if (r.name === 'settings') {
    return h('header', { class: 'topbar' }, iconButton('back', 'Geri', () => go('#/')), h('h1', { class: 'topbar-title' }, 'Ayarlar'));
  }
  return h(
    'header',
    { class: 'topbar' },
    h('h1', { class: 'topbar-title brand' }, h('span', { class: 'brand-mark' }, '◆'), 'Claude Hub'),
    refreshBtn,
    app.hasToken ? iconButton('settings', 'Ayarlar', () => go('#/settings')) : null,
  );
}

// ---------------------------------------------------------------- token

function tokenForm(app: App): HTMLElement {
  return h(
    'form',
    {
      class: 'token-form',
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        const value = app.drafts.get('token') ?? '';
        app.drafts.delete('token');
        app.setToken(value);
        go('#/');
      },
    },
    h('label', { class: 'label', for: 'token' }, 'GitHub token'),
    h(
      'div',
      { class: 'inline-form' },
      draftInput(app, 'token', { id: 'token', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…', class: 'input' }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Bağlan'),
    ),
  );
}

function tokenHelp(): HTMLElement {
  return h(
    'details',
    { class: 'help' },
    h('summary', null, 'Token nasıl alınır? (2 dakika)'),
    h(
      'ol',
      null,
      h('li', null, h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → Fine-grained token oluştur'), ' sayfasını aç.'),
      h('li', null, h('b', null, 'Repository access'), ': ', h('i', null, 'All repositories'), ' seç (yeni projelerin kendiliğinden görünür) ya da sadece proje repolarını seç.'),
      h('li', null, h('b', null, 'Permissions → Repository → Contents'), ': ', h('i', null, 'Read and write'), '. Başka izin gerekmez.'),
      h('li', null, h('b', null, 'Expiration'), ': istediğin süre. Dolunca buraya yenisini yapıştırırsın.'),
      h('li', null, 'Oluşan token’ı kopyala ve yukarıya yapıştır. Telefonda da aynı token’ı bir kez yapıştırman yeterli.'),
    ),
    h('p', { class: 'muted small' }, 'Token yalnızca bu tarayıcıda saklanır ve sadece api.github.com’a gönderilir.'),
  );
}

function welcome(app: App): HTMLElement {
  return h(
    'main',
    { class: 'page' },
    h(
      'section',
      { class: 'hero' },
      h('div', { class: 'hero-mark' }, '◆'),
      h('h2', null, 'Görevi ekle, Claude bulutta sırayla yapsın.'),
      h('p', { class: 'muted' }, 'Bilgisayarın kapalıyken bile. Burada her projede neyin bittiğini, neyin sürdüğünü, neyin seni beklediğini görür; sırayı değiştirirsin.'),
    ),
    h('div', { class: 'card' }, tokenForm(app), tokenHelp()),
    h('p', { class: 'center' }, h('a', { href: '?demo' }, 'Önce token olmadan demo ile dene →')),
  );
}

// ---------------------------------------------------------------- home

function projectCard(e: Entry): HTMLElement {
  const v = e.view;
  const repo = e.project.repo.fullName;
  const activity = lastActivity(e);
  const todo = v ? v.groups.queue.filter((i) => i.status === 'TODO').length : 0;
  const planned = v ? v.groups.queue.filter((i) => i.status === 'NEW').length : 0;
  const stat = (label: string, n: number, cls = '') => h('div', { class: `stat ${n > 0 ? cls : 'zero'}` }, h('b', null, n), h('span', null, label));
  return h(
    'a',
    { class: 'card project-card', href: `#/p/${repo}` },
    h(
      'div',
      { class: 'card-head' },
      avatar(e),
      h('div', { class: 'card-title' }, h('h3', null, projectName(e.project)), h('div', { class: 'muted small' }, repo, activity ? ` · ${activity}` : '')),
      statePill(e),
    ),
    e.error ? h('p', { class: 'error-text small' }, e.error) : null,
    v
      ? [
          runLine(v.run, e.data?.paused ?? false),
          h(
            'div',
            { class: 'stats' },
            stat('Sırada', todo),
            stat('Planlanacak', planned, 'st-new'),
            stat('Seni bekliyor', v.waitingCount, 'attention'),
            stat('Bitti', v.groups.done.length, 'st-done'),
          ),
          v.groups.queue.length
            ? h(
                'ol',
                { class: 'next-up' },
                v.groups.queue.slice(0, 3).map((i) => h('li', null, h('span', { class: 'mono' }, i.id), ' ', i.title)),
              )
            : null,
        ]
      : e.loading
        ? h('div', { class: 'skeleton' })
        : null,
  );
}

function home(app: App): HTMLElement {
  const list = app.entries.map((e) => projectCard(e));
  let body: Child;
  if (!app.entries.length && (app.discovering || !app.discovered)) {
    body = [h('div', { class: 'card skeleton-card' }), h('div', { class: 'card skeleton-card' })];
  } else if (!app.entries.length) {
    body = h(
      'div',
      { class: 'card' },
      h('h3', null, 'Henüz bağlı proje yok'),
      h('p', { class: 'muted' }, 'Bir repo, ana dalında ', h('code', null, '.claude/hub.json'), ' dosyası olunca burada görünür.'),
      connectHelp(),
    );
  } else {
    body = list;
  }
  return h(
    'main',
    { class: 'page' },
    app.discoverError && !app.entries.length ? h('p', { class: 'banner error' }, app.discoverError) : null,
    h(
      'div',
      { class: 'page-head' },
      h('h2', null, 'Projeler'),
      app.lastRefresh ? h('span', { class: 'muted small' }, 'güncellendi ', relativeTime(new Date(app.lastRefresh).toISOString(), now())) : null,
    ),
    body,
    app.entries.length ? fab(app, null) : null,
  );
}

function fab(app: App, repo: string | null): HTMLElement {
  return h(
    'button',
    { class: 'fab', type: 'button', onclick: () => openSheet(app, { kind: 'add', repo, title: '' }) },
    icon('plus'),
    'Görev ekle',
  );
}

// ---------------------------------------------------------------- project

function projectPage(app: App, repo: string, tab: Tab): HTMLElement {
  const e = app.entry(repo);
  if (!e) {
    return h(
      'main',
      { class: 'page' },
      app.discovering || !app.discovered ? h('div', { class: 'card skeleton-card' }) : empty('Bu proje bulunamadı. Token bu repoyu görebiliyor mu?'),
    );
  }
  const v = e.view;
  const d = e.data;
  const counts: Record<Tab, number | null> = {
    queue: v ? v.groups.queue.length + v.groups.inProgress.length : null,
    waiting: v ? v.waitingCount : null,
    done: v ? v.groups.done.length : null,
    activity: null,
  };
  let content: Child = null;
  if (v && d) {
    if (tab === 'queue') content = queueTab(app, e);
    else if (tab === 'waiting') content = waitingTab(app, e);
    else if (tab === 'done') content = doneTab(app, e);
    else content = activityTab(e);
  } else if (e.error) {
    content = h('p', { class: 'banner error' }, e.error);
  } else {
    content = [h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })];
  }
  return h(
    'main',
    { class: 'page' },
    h(
      'div',
      { class: 'project-meta' },
      h('a', { href: e.project.repo.htmlUrl, target: '_blank', rel: 'noopener', class: 'muted small' }, repo, ' ', icon('external')),
      d && !d.branchExists ? h('span', { class: 'muted small' }, ` · iş dalı (${e.project.config.branch}) ilk değişiklikte açılır`) : null,
    ),
    v && d ? statusPanel(app, e) : null,
    h(
      'nav',
      { class: 'tabs', role: 'tablist' },
      TABS.map((t) =>
        h(
          'a',
          { class: `tab${t === tab ? ' active' : ''}`, href: `#/p/${repo}/${t}`, role: 'tab', 'aria-selected': t === tab ? 'true' : 'false' },
          TAB_LABEL[t],
          counts[t] ? h('span', { class: `count${t === 'waiting' ? ' attention' : ''}` }, counts[t]) : null,
        ),
      ),
    ),
    content,
    fab(app, repo),
  );
}

function statusPanel(app: App, e: Entry): HTMLElement {
  const v = e.view!;
  const paused = e.data!.paused;
  let text: Child;
  if (paused) text = 'Bulut çalışması duraklatıldı. Açana kadar Claude bu projede iş almaz.';
  else if (v.run.kind === 'working') text = null;
  else if (v.run.kind === 'stale') text = null;
  else if (v.groups.queue.length) text = 'Claude her saat başı sıradaki işi alır.';
  else text = 'Sıra boş. Yeni görev ekleyince sonraki turda başlar.';
  return h(
    'div',
    { class: `status-panel${paused ? ' paused' : ''}` },
    runLine(v.run, paused),
    text ? h('p', { class: 'muted small' }, text) : null,
    h(
      'label',
      { class: 'switch-row' },
      h('span', null, 'Bulutta çalışsın'),
      h('input', {
        type: 'checkbox',
        role: 'switch',
        class: 'switch',
        checked: !paused,
        disabled: app.busy,
        onchange: (ev: Event) => {
          const on = (ev.target as HTMLInputElement).checked;
          void app.pause(e, !on);
        },
      }),
    ),
  );
}

function queueTab(app: App, e: Entry): HTMLElement {
  const g = e.view!.groups;
  const move = (id: string, m: QueueMove) => void app.move(e, id, m);
  return h(
    'div',
    null,
    g.inProgress.length
      ? section(
          'Şu an',
          null,
          g.inProgress.map((i) => itemRow(app, e, i, { showStatus: true })),
        )
      : null,
    section(
      'Sıra',
      g.queue.length,
      g.queue.length
        ? [
            h('p', { class: 'hint' }, 'Claude yukarıdan aşağı yapar. ', h('span', { class: 'badge st-new' }, 'Planlanacak'), ' işleri önce bir planlama turu küçük işlere böler.'),
            h(
              'div',
              { class: 'list' },
              g.queue.map((item, i) =>
                itemRow(app, e, item, {
                  index: i + 1,
                  actions: [
                    iconButton('up', 'Yukarı', () => move(item.id, 'up'), app.busy || i === 0),
                    iconButton('down', 'Aşağı', () => move(item.id, 'down'), app.busy || i === g.queue.length - 1),
                  ],
                }),
              ),
            ),
          ]
        : empty('Sıra boş. Sağ alttan görev ekle.'),
    ),
    g.other.length
      ? section(
          'Durumu okunamayanlar',
          g.other.length,
          h('p', { class: 'hint' }, 'Bu maddelerde geçerli bir "Durum:" satırı yok; Claude onları almaz.'),
          h('div', { class: 'list' }, g.other.map((i) => itemRow(app, e, i, { showStatus: true }))),
        )
      : null,
  );
}

function questionCard(app: App, e: Entry, q: Question): HTMLElement {
  const key = `q:${e.project.repo.fullName}:${q.id}`;
  return h(
    'div',
    { class: 'card question' },
    h('div', { class: 'q-head' }, h('span', { class: 'mono' }, q.id), h('h3', null, q.title)),
    h('div', { class: 'md', html: renderMarkdown(q.body) }),
    q.open
      ? h(
          'form',
          {
            class: 'answer-form',
            onsubmit: async (ev: Event) => {
              ev.preventDefault();
              const text = (app.drafts.get(key) ?? '').trim();
              if (!text) return;
              if (await app.answer(e, q.id, text)) app.drafts.delete(key);
            },
          },
          draftInput(app, key, { class: 'input', rows: '3', placeholder: 'Cevabın (ör. "a", ya da kendi kararın)' }, 'textarea'),
          h('button', { class: 'btn primary', type: 'submit', disabled: app.busy }, 'Cevabı gönder'),
        )
      : h('p', { class: 'answer' }, h('b', null, 'Cevap: '), q.answer),
  );
}

function waitingTab(app: App, e: Entry): HTMLElement {
  const v = e.view!;
  const g = v.groups;
  if (!v.waitingCount) return h('div', null, empty('Seni bekleyen bir şey yok.'));
  return h(
    'div',
    null,
    v.openQuestions.length
      ? section(
          'Cevap bekleyen sorular',
          v.openQuestions.length,
          v.openQuestions.map((q) => questionCard(app, e, q)),
        )
      : null,
    g.owner.length
      ? section(
          'Senin işlerin',
          g.owner.length,
          h(
            'div',
            { class: 'list' },
            g.owner.map((i) =>
              itemRow(app, e, i, {
                actions: h(
                  'button',
                  { class: 'btn small', type: 'button', disabled: app.busy, onclick: () => void app.setItemStatus(e, i.id, 'DONE', "Sahibi hub'dan tamamladı.") },
                  'Yaptım',
                ),
              }),
            ),
          ),
        )
      : null,
    g.decision.length
      ? section(
          'Karar bekleyen işler',
          g.decision.length,
          h('p', { class: 'hint' }, 'Sorusunu cevapladığın işler bir sonraki planlama turunda sıraya girer.'),
          h(
            'div',
            { class: 'list' },
            g.decision.map((i) =>
              itemRow(app, e, i, {
                extra: itemQuestionIds(i).map((qid) => {
                  const answered = v.questions.some((q) => q.id === qid && !q.open);
                  return h('span', { class: `tag${answered ? ' answered' : ''}` }, qid, answered ? ' ✓ cevaplandı' : '');
                }),
              }),
            ),
          ),
        )
      : null,
    g.blocked.length
      ? section(
          'Takılanlar',
          g.blocked.length,
          h(
            'div',
            { class: 'list' },
            g.blocked.map((i) =>
              itemRow(app, e, i, {
                actions: h(
                  'button',
                  { class: 'btn small', type: 'button', disabled: app.busy, onclick: () => void app.setItemStatus(e, i.id, 'TODO', "Sahibi hub'dan tekrar sıraya aldı.") },
                  'Tekrar dene',
                ),
              }),
            ),
          ),
        )
      : null,
  );
}

function doneTab(app: App, e: Entry): HTMLElement {
  const g = e.view!.groups;
  return h(
    'div',
    null,
    section(
      'Tamamlananlar',
      g.done.length,
      g.done.length
        ? h(
            'div',
            { class: 'list' },
            g.done.map((i) => {
              const note = itemNotes(i)[0]?.replace(/^Not\b[^:]*:\s*/, '');
              return itemRow(app, e, i, { extra: note ? h('span', { class: 'row-note' }, note) : null });
            }),
          )
        : empty('Henüz biten iş yok.'),
    ),
    g.cancelled.length
      ? h(
          'details',
          { class: 'section' },
          h('summary', { class: 'section-title' }, 'İptal edilenler', h('span', { class: 'count' }, g.cancelled.length)),
          h('div', { class: 'list' }, g.cancelled.map((i) => itemRow(app, e, i))),
        )
      : null,
  );
}

function activityTab(e: Entry): HTMLElement {
  const commits = e.data!.commits;
  return section(
    'Son hareketler',
    null,
    commits.length
      ? h(
          'ol',
          { class: 'timeline' },
          commits.map((c) => {
            const kind = commitKind(c.message);
            return h(
              'li',
              { class: `tl-${kind}` },
              h('span', { class: 'tl-dot' }),
              h(
                'a',
                { href: c.url, target: '_blank', rel: 'noopener', class: 'tl-body' },
                h('span', { class: 'tl-kind' }, COMMIT_LABEL[kind]),
                h('span', { class: 'tl-msg' }, c.message.split('\n')[0]),
                h('span', { class: 'muted small' }, relativeTime(c.date, now())),
              ),
            );
          }),
        )
      : empty('Bu dalda henüz commit yok.'),
  );
}

// ---------------------------------------------------------------- settings

function connectHelp(): HTMLElement {
  return h(
    'details',
    { class: 'help' },
    h('summary', null, 'Yeni bir projeyi nasıl bağlarım?'),
    h(
      'ol',
      null,
      h('li', null, 'Projenin GitHub’da bir reposu olsun.'),
      h('li', null, 'O projede Claude’a şunu söyle: ', h('i', null, '“Bu projeyi Claude Hub’a bağla ve bulutta çalıştırmayı kur. Kurallar: claude-hub reposundaki protocol/PROTOCOL.md.”')),
      h('li', null, 'Claude ', h('code', null, '.claude/hub.json'), ', ', h('code', null, 'docs/BACKLOG.md'), ' ve saatlik bulut görevini kurar. Ana dala gelince proje burada görünür (Ayarlar → Projeleri yeniden tara).'),
    ),
  );
}

function settings(app: App): HTMLElement {
  return h(
    'main',
    { class: 'page' },
    section(
      'GitHub bağlantısı',
      null,
      h(
        'div',
        { class: 'card' },
        app.demo
          ? h('p', null, 'Demo modundasın. ', h('a', { href: location.pathname }, 'Gerçek moda dön →'))
          : [
              h('p', null, app.login ? ['Bağlı hesap: ', h('b', null, '@' + app.login)] : app.authError ? h('span', { class: 'error-text' }, app.authError) : 'Bağlanıyor…'),
              tokenForm(app),
              tokenHelp(),
              h(
                'button',
                {
                  class: 'btn danger',
                  type: 'button',
                  onclick: () => {
                    if (confirm('Token bu tarayıcıdan silinsin mi?')) app.clearToken();
                  },
                },
                'Token’ı bu cihazdan sil',
              ),
            ],
      ),
    ),
    section(
      'Projeler',
      app.entries.length,
      h(
        'div',
        { class: 'card' },
        app.entries.length
          ? h('ul', { class: 'plain' }, app.entries.map((e) => h('li', null, avatar(e), ' ', projectName(e.project), h('span', { class: 'muted small' }, ' · ', e.project.repo.fullName))))
          : h('p', { class: 'muted' }, 'Bağlı proje yok.'),
        h('button', { class: 'btn', type: 'button', disabled: app.discovering, onclick: () => void app.discover() }, app.discovering ? 'Taranıyor…' : 'Projeleri yeniden tara'),
        connectHelp(),
      ),
    ),
    section(
      'Nasıl çalışır?',
      null,
      h(
        'div',
        { class: 'card md' },
        h('p', null, 'Görevler her projenin kendi reposunda, ', h('code', null, 'docs/BACKLOG.md'), ' dosyasında durur. Buradaki her değişiklik o dosyaya, bulut dalına (', h('code', null, 'claude/cloud-backlog'), ') bir commit olarak yazılır.'),
        h('p', null, 'Bulutta saatte bir çalışan Claude o dalı okur: ', h('b', null, 'Planlanacak'), ' iş varsa onu küçük işlere böler; yoksa yukarıdan ilk ', h('b', null, 'Sırada'), ' işi alıp yapar, test eder ve commit’ler.'),
        h('p', null, 'Bitenleri incelemek ve ana dala almak hâlâ senin elinde.'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- sheets

function sheetFrame(app: App, title: Child, body: Child): HTMLElement {
  return h(
    'div',
    { class: `sheet-backdrop${sheetEntering ? ' entering' : ''}`, onclick: (ev: Event) => ev.target === ev.currentTarget && closeSheet(app) },
    h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, title), iconButton('close', 'Kapat', () => closeSheet(app))),
      h('div', { class: 'sheet-body' }, body),
    ),
  );
}

function itemSheet(app: App, repo: string, id: string): HTMLElement {
  const e = app.entry(repo);
  const item = e?.view?.items.find((i) => i.id === id);
  if (!e || !item) return sheetFrame(app, id, empty('Bu iş artık listede yok.'));
  const v = e.view!;
  const status = item.status;
  const act = async (fn: () => Promise<boolean>) => {
    if (await fn()) closeSheet(app);
  };
  const cancel = h(
    'button',
    {
      class: 'btn danger',
      type: 'button',
      disabled: app.busy,
      onclick: () => {
        if (confirm(`${item.id} iptal edilsin mi? Claude bu işi yapmaz.`)) void act(() => app.setItemStatus(e, item.id, 'CANCELLED', "Sahibi hub'dan iptal etti."));
      },
    },
    'İptal et',
  );
  const actions: Child[] = [];
  if (status === 'TODO' || status === 'NEW') {
    actions.push(
      h('button', { class: 'btn', type: 'button', disabled: app.busy, onclick: () => void act(() => app.move(e, item.id, 'top')) }, icon('top'), 'En üste al'),
      h('button', { class: 'btn', type: 'button', disabled: app.busy, onclick: () => void act(() => app.move(e, item.id, 'bottom')) }, 'En alta al'),
      cancel,
    );
  } else if (status === 'OWNER') {
    actions.push(
      h('button', { class: 'btn primary', type: 'button', disabled: app.busy, onclick: () => void act(() => app.setItemStatus(e, item.id, 'DONE', "Sahibi hub'dan tamamladı.")) }, icon('check'), 'Yaptım'),
      cancel,
    );
  } else if (status === 'BLOCKED') {
    actions.push(
      h('button', { class: 'btn primary', type: 'button', disabled: app.busy, onclick: () => void act(() => app.setItemStatus(e, item.id, 'TODO', "Sahibi hub'dan tekrar sıraya aldı.")) }, 'Tekrar sıraya al'),
      cancel,
    );
  } else if (status === 'NEEDS-DECISION') {
    actions.push(cancel);
  } else if (status === 'CANCELLED') {
    actions.push(h('button', { class: 'btn', type: 'button', disabled: app.busy, onclick: () => void act(() => app.setItemStatus(e, item.id, 'TODO', "Sahibi hub'dan geri aldı.")) }, 'Sıraya geri al'));
  }
  if (status === 'DONE' || status === 'BLOCKED') {
    actions.push(
      h('button', { class: 'btn', type: 'button', onclick: () => openSheet(app, { kind: 'add', repo, title: `${item.id} düzeltmesi: ` }) }, 'Bununla ilgili yeni görev'),
    );
  }
  const linked = itemQuestionIds(item)
    .map((qid) => v.questions.find((q) => q.id === qid))
    .filter((q): q is Question => q !== undefined);
  const meta = [item.section, itemField(item, 'Boyut') && `Boyut ${itemField(item, 'Boyut')}`, itemField(item, 'Kaynak') && `Kaynak: ${itemField(item, 'Kaynak')}`].filter(Boolean);
  // Status, size and source are already in the header.
  const body = item.body.filter((l) => !/^(Durum|Boyut|Kaynak):/.test(l));
  return sheetFrame(
    app,
    [h('span', { class: 'mono' }, item.id), ' ', badge(status)],
    [
      h('h2', { class: 'sheet-heading' }, item.title),
      meta.length ? h('p', { class: 'muted small' }, meta.join(' · ')) : null,
      status === 'IN-PROGRESS' ? h('p', { class: 'banner info' }, 'Claude şu an bu iş üzerinde çalışıyor.') : null,
      linked.length ? h('div', { class: 'linked' }, linked.map((q) => questionCard(app, e, q))) : null,
      h('div', { class: 'md' + (body.length ? '' : ' muted'), html: body.length ? renderMarkdown(body) : 'Açıklama yok.' }),
      actions.length ? h('div', { class: 'actions' }, actions) : null,
      h('p', null, h('a', { class: 'small', href: fileUrl(e.project, e.data!.ref, e.project.config.backlog, item.line), target: '_blank', rel: 'noopener' }, 'GitHub’da aç ', icon('external'))),
    ],
  );
}

function addSheet(app: App, repo: string | null): HTMLElement {
  const choices = app.entries.filter((e) => e.view);
  const chosen = app.drafts.get('add:repo') ?? choices[0]?.project.repo.fullName ?? '';
  const pos = app.drafts.get('add:pos') ?? 'bottom';
  const direct = app.drafts.get('add:direct') === '1';
  const submit = async (ev: Event) => {
    ev.preventDefault();
    const e = app.entry(chosen);
    const title = (app.drafts.get('add:title') ?? '').trim();
    if (!e || !title) {
      app.showToast('Bir başlık yaz.', 'error');
      return;
    }
    const ok = await app.addTask(e, title, app.drafts.get('add:desc') ?? '', direct, pos === 'top' ? 'top' : 'bottom');
    if (ok) {
      for (const k of ['add:title', 'add:desc', 'add:pos', 'add:direct', 'add:repo']) app.drafts.delete(k);
      closeSheet(app);
    }
  };
  return sheetFrame(
    app,
    'Yeni görev',
    h(
      'form',
      { class: 'add-form', onsubmit: submit },
      choices.length > 1 || !repo
        ? [
            h('label', { class: 'label', for: 'add-repo' }, 'Proje'),
            h(
              'select',
              {
                id: 'add-repo',
                class: 'input',
                onchange: (ev: Event) => {
                  app.drafts.set('add:repo', (ev.target as HTMLSelectElement).value);
                },
              },
              choices.map((e) =>
                h('option', { value: e.project.repo.fullName, selected: e.project.repo.fullName === chosen }, `${e.project.config.icon ?? ''} ${projectName(e.project)}`.trim()),
              ),
            ),
          ]
        : null,
      h('label', { class: 'label', for: 'add-title' }, 'Başlık'),
      draftInput(app, 'add:title', { id: 'add-title', class: 'input', placeholder: 'ör. Level haritası ekle', maxlength: '120', required: true }),
      h('label', { class: 'label', for: 'add-desc' }, 'Açıklama'),
      draftInput(
        app,
        'add:desc',
        { id: 'add-desc', class: 'input', rows: '6', placeholder: 'Ne istiyorsun, neden, nasıl görünmeli? Ne kadar ayrıntı yazarsan o kadar isabetli olur.' },
        'textarea',
      ),
      h('span', { class: 'label' }, 'Sıradaki yeri'),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup' },
        (['bottom', 'top'] as const).map((value) =>
          h(
            'label',
            { class: `seg${pos === value ? ' on' : ''}` },
            h('input', {
              type: 'radio',
              name: 'pos',
              value,
              checked: pos === value,
              onchange: () => {
                app.drafts.set('add:pos', value);
                render(app);
              },
            }),
            value === 'bottom' ? 'Sıranın sonuna' : 'En üste (acil)',
          ),
        ),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: direct,
          onchange: (ev: Event) => app.drafts.set('add:direct', (ev.target as HTMLInputElement).checked ? '1' : ''),
        }),
        h('span', null, h('b', null, 'Küçük ve net iş'), ': planlamadan doğrudan yapılsın'),
      ),
      h(
        'p',
        { class: 'hint' },
        direct
          ? 'Görev "Sırada" olarak eklenir; sırası gelince Claude doğrudan yapar.'
          : 'Görev "Planlanacak" olarak eklenir; sonraki tur onu küçük işlere böler ve kabul kriterlerini yazar, sonra sırayla yapılır.',
      ),
      h('button', { class: 'btn primary wide', type: 'submit', disabled: app.busy || !choices.length }, 'Ekle'),
    ),
  );
}

// ---------------------------------------------------------------- root

export function render(app: App): void {
  const root = document.getElementById('app')!;
  // Keep focus, caret and the sheet's scroll across the rebuild.
  const active = document.activeElement as HTMLInputElement | null;
  const focusKey = active?.dataset?.draft;
  const sel = focusKey && 'selectionStart' in active! ? [active!.selectionStart, active!.selectionEnd] : null;
  const sheetScroll = root.querySelector('.sheet-body')?.scrollTop ?? 0;

  const r = app.route;
  let page: HTMLElement;
  if (!app.hasToken) page = welcome(app);
  else if (r.name === 'settings') page = settings(app);
  else if (r.name === 'project') page = projectPage(app, r.repo, r.tab);
  else page = home(app);

  root.replaceChildren(
    topbar(app),
    app.demo ? h('p', { class: 'banner demo' }, 'Demo modu: örnek projeler, değişiklikler sayfa yenilenince kaybolur.') : '',
    app.authError && app.hasToken && r.name !== 'settings'
      ? h('p', { class: 'banner error' }, app.authError, ' ', h('a', { href: '#/settings' }, 'Ayarlar →'))
      : '',
    page,
    app.sheet ? (app.sheet.kind === 'item' ? itemSheet(app, app.sheet.repo, app.sheet.id) : addSheet(app, app.sheet.repo)) : '',
    app.toast ? h('div', { class: `toast ${app.toast.tone}`, role: 'status' }, app.toast.text) : '',
  );
  document.body.classList.toggle('sheet-open', app.sheet !== null);
  sheetEntering = false;

  if (focusKey) {
    const el = root.querySelector<HTMLInputElement>(`[data-draft="${CSS.escape(focusKey)}"]`);
    if (el) {
      el.focus();
      if (sel && sel[0] !== null) el.setSelectionRange(sel[0], sel[1]);
    }
  }
  const sb = root.querySelector('.sheet-body');
  if (sb) sb.scrollTop = sheetScroll;
}
