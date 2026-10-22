// App state and the owner's actions. Views (src/ui/views.ts) read this state
// and call these methods; every change ends in `changed()`, which re-renders.

import { addItem, moveInQueue, parseBacklog, setStatus, type BacklogItem, type QueueMove, type Status } from './core/backlog';
import { completionDates, groupItems, runState, type Groups, type RunState } from './core/project';
import { answerQuestion, parseQuestions, type Question } from './core/questions';
import { demoGitHub } from './demo';
import { AuthError, RestGitHub, type GitHub } from './github';
import { discoverProjects, editFile, loadProject, setPaused, type Project, type ProjectData } from './hub';

export type Tab = 'queue' | 'waiting' | 'done' | 'activity';
export const TABS: readonly Tab[] = ['queue', 'waiting', 'done', 'activity'];

export type Route = { name: 'home' } | { name: 'settings' } | { name: 'project'; repo: string; tab: Tab };

export interface ProjectView {
  items: BacklogItem[];
  groups: Groups;
  questions: Question[];
  openQuestions: Question[];
  run: RunState;
  /** Things only the owner can move: open questions, OWNER, NEEDS-DECISION and BLOCKED items. */
  waitingCount: number;
}

export interface Entry {
  project: Project;
  data: ProjectData | null;
  view: ProjectView | null;
  loading: boolean;
  error: string | null;
}

export type Sheet = { kind: 'item'; repo: string; id: string } | { kind: 'add'; repo: string | null; title: string };

export interface Toast {
  text: string;
  tone: 'info' | 'ok' | 'error';
}

const KEY_TOKEN = 'claude-hub.token';
const KEY_PROJECTS = 'claude-hub.projects';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the hub still works for this visit.
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function deriveView(data: ProjectData, now: number): ProjectView {
  const items = data.backlog ? parseBacklog(data.backlog.text).items : [];
  const groups = groupItems(items, completionDates(data.commits));
  const questions = data.questions ? parseQuestions(data.questions.text) : [];
  const openQuestions = questions.filter((q) => q.open);
  return {
    items,
    groups,
    questions,
    openQuestions,
    run: runState(items, data.commits, now),
    waitingCount: openQuestions.length + groups.owner.length + groups.decision.length + groups.blocked.length,
  };
}

export class App {
  readonly demo: boolean;
  gh: GitHub | null = null;
  login: string | null = null;
  authError: string | null = null;
  entries: Entry[] = [];
  discovering = false;
  discovered = false;
  discoverError: string | null = null;
  route: Route = { name: 'home' };
  sheet: Sheet | null = null;
  toast: Toast | null = null;
  busy = false;
  /** Unsent text in inputs, by input key, so a re-render does not lose it. */
  drafts = new Map<string, string>();
  lastRefresh = 0;
  private toastTimer = 0;

  constructor(
    private readonly changed: () => void,
    search: string,
  ) {
    this.demo = new URLSearchParams(search).has('demo');
    if (this.demo) {
      this.gh = demoGitHub();
    } else {
      const token = load(KEY_TOKEN);
      if (token) this.gh = new RestGitHub(token);
      const cached = load(KEY_PROJECTS);
      if (cached && this.gh) {
        try {
          this.entries = (JSON.parse(cached) as Project[]).map((project) => ({ project, data: null, view: null, loading: false, error: null }));
        } catch {
          // Stale cache format: discover again.
        }
      }
    }
  }

  get hasToken(): boolean {
    return this.gh !== null;
  }

  entry(repo: string): Entry | undefined {
    return this.entries.find((e) => e.project.repo.fullName === repo);
  }

  /** Start: who am I, which projects, then every project's data. */
  async start(): Promise<void> {
    if (!this.gh) return;
    if (this.entries.length) void this.loadAll();
    try {
      this.login = await this.gh.login();
    } catch (e) {
      this.handleError(e);
    }
    await this.discover();
  }

  async discover(): Promise<void> {
    if (!this.gh || this.discovering) return;
    this.discovering = true;
    this.discoverError = null;
    this.changed();
    try {
      const projects = await discoverProjects(this.gh);
      const old = new Map(this.entries.map((e) => [e.project.repo.fullName, e]));
      this.entries = projects.map((project) => {
        const prev = old.get(project.repo.fullName);
        return prev ? { ...prev, project } : { project, data: null, view: null, loading: false, error: null };
      });
      this.discovered = true;
      if (!this.demo) save(KEY_PROJECTS, JSON.stringify(projects));
      // Cached projects are already loading since start(); load only the new ones.
      await Promise.all(this.entries.filter((e) => !e.data && !e.loading).map((e) => this.loadEntry(e)));
    } catch (e) {
      this.discoverError = message(e);
      this.handleError(e);
    } finally {
      this.discovering = false;
      this.changed();
    }
  }

  async loadAll(): Promise<void> {
    this.lastRefresh = Date.now();
    await Promise.all(this.entries.map((e) => this.loadEntry(e)));
  }

  async loadEntry(e: Entry): Promise<void> {
    if (!this.gh) return;
    e.loading = true;
    this.changed();
    try {
      e.data = await loadProject(this.gh, e.project);
      e.view = deriveView(e.data, Date.now());
      e.error = null;
      this.lastRefresh = Date.now();
    } catch (err) {
      e.error = message(err);
      this.handleError(err);
    } finally {
      e.loading = false;
      this.changed();
    }
  }

  async refresh(): Promise<void> {
    if (this.route.name === 'project') {
      const e = this.entry(this.route.repo);
      this.lastRefresh = Date.now();
      if (e) await this.loadEntry(e);
    } else {
      await this.loadAll();
    }
  }

  private handleError(e: unknown): void {
    if (e instanceof AuthError) this.authError = e.message;
  }

  setToken(token: string): void {
    const t = token.trim();
    if (!t) return;
    save(KEY_TOKEN, t);
    save(KEY_PROJECTS, null);
    this.gh = new RestGitHub(t);
    this.entries = [];
    this.login = null;
    this.authError = null;
    this.discovered = false;
    this.changed();
    void this.start();
  }

  clearToken(): void {
    save(KEY_TOKEN, null);
    save(KEY_PROJECTS, null);
    this.gh = null;
    this.entries = [];
    this.login = null;
    this.discovered = false;
    this.changed();
  }

  showToast(text: string, tone: Toast['tone'], sticky = false): void {
    window.clearTimeout(this.toastTimer);
    this.toast = { text, tone };
    if (!sticky) {
      this.toastTimer = window.setTimeout(() => {
        this.toast = null;
        this.changed();
      }, tone === 'error' ? 6000 : 2500);
    }
    this.changed();
  }

  /** One write at a time: commit, then reload that project. */
  private async write(e: Entry, doing: string, done: string, fn: (gh: GitHub) => Promise<void>): Promise<boolean> {
    if (!this.gh || this.busy) return false;
    this.busy = true;
    this.showToast(doing, 'info', true);
    try {
      await fn(this.gh);
      await this.loadEntry(e);
      this.showToast(done, 'ok');
      return true;
    } catch (err) {
      this.handleError(err);
      this.showToast(message(err), 'error');
      return false;
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  move(e: Entry, id: string, move: QueueMove): Promise<boolean> {
    const p = e.project;
    return this.write(e, 'Sıra değişiyor…', 'Sıra kaydedildi', (gh) =>
      editFile(gh, p, p.config.backlog, (t) => moveInQueue(t, id, move), `hub: move ${id} ${move}`),
    );
  }

  setItemStatus(e: Entry, id: string, status: Status, note: string | null): Promise<boolean> {
    const p = e.project;
    return this.write(e, 'Kaydediliyor…', 'Kaydedildi', (gh) =>
      editFile(gh, p, p.config.backlog, (t) => setStatus(t, id, status, note, new Date()), `hub: ${id} ${status}`),
    );
  }

  addTask(e: Entry, title: string, description: string, direct: boolean, position: 'top' | 'bottom'): Promise<boolean> {
    const p = e.project;
    let id = '';
    return this.write(e, 'Görev ekleniyor…', 'Görev eklendi', (gh) =>
      editFile(
        gh,
        p,
        p.config.backlog,
        (t) => {
          const r = addItem(t, { title, description, direct, position, date: new Date() });
          id = r.id;
          return r.text;
        },
        () => `hub: add ${id} ${title.trim().split('\n')[0].slice(0, 60)}`,
        '# Backlog\n',
      ),
    );
  }

  answer(e: Entry, questionId: string, text: string): Promise<boolean> {
    const p = e.project;
    return this.write(e, 'Cevap gönderiliyor…', 'Cevap kaydedildi', (gh) =>
      editFile(gh, p, p.config.questions, (t) => answerQuestion(t, questionId, text), `hub: answer ${questionId}`),
    );
  }

  pause(e: Entry, paused: boolean): Promise<boolean> {
    return this.write(e, paused ? 'Duraklatılıyor…' : 'Açılıyor…', paused ? 'Bulut çalışması duraklatıldı' : 'Bulut çalışması açıldı', (gh) =>
      setPaused(gh, e.project, paused),
    );
  }
}
