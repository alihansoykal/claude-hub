import './styles.css';
import { App, TABS, type Route, type Tab } from './app';
import { closeSheet, render } from './ui/views';

/** Every 90 s while the page is visible; cloud runs commit at most every few minutes. */
const AUTO_REFRESH_MS = 90_000;

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'p' && parts.length >= 3) {
    const tab = (TABS as readonly string[]).includes(parts[3] ?? '') ? (parts[3] as Tab) : 'queue';
    return { name: 'project', repo: `${parts[1]}/${parts[2]}`, tab };
  }
  return { name: 'home' };
}

const app: App = new App(() => render(app), location.search);

function onRoute(): void {
  const before = app.route;
  app.route = parseRoute(location.hash);
  app.sheet = null;
  const pageChanged = before.name !== app.route.name || (before.name === 'project' && app.route.name === 'project' && before.repo !== app.route.repo);
  if (pageChanged) window.scrollTo(0, 0);
  render(app);
}

window.addEventListener('hashchange', onRoute);
window.addEventListener('popstate', () => {
  // Back while a sheet is open closes the sheet (views.ts pushes a history entry for it).
  if (app.sheet) {
    app.sheet = null;
    render(app);
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && app.sheet) closeSheet(app);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.hasToken && Date.now() - app.lastRefresh > 30_000) void app.refresh();
});
window.setInterval(() => {
  if (document.visibilityState === 'visible' && app.hasToken && !app.busy) void app.refresh();
}, AUTO_REFRESH_MS);

app.route = parseRoute(location.hash);
render(app);
void app.start();
