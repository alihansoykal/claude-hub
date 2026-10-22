// Finding hub projects, loading what a project page shows, and writing the
// owner's changes to the work branch the cloud runs read.

import { parseHubConfig, CONFIG_PATH, PAUSE_PATH, type Commit, type HubConfig } from './core/project';
import { ConflictError, type FileData, type GitHub, type RepoInfo } from './github';

export interface Project {
  repo: RepoInfo;
  config: HubConfig;
}

export interface ProjectData {
  /** The ref everything was read from: the work branch, or the default branch before it exists. */
  ref: string;
  branchExists: boolean;
  backlog: FileData | null;
  questions: FileData | null;
  paused: boolean;
  commits: Commit[];
  loadedAt: number;
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Every repo the token can see that has `.claude/hub.json` on its default branch. */
export async function discoverProjects(gh: GitHub): Promise<Project[]> {
  const repos = await gh.repos();
  const found = await pool(repos, 6, async (repo) => {
    const file = await gh.getFile(repo.fullName, CONFIG_PATH, repo.defaultBranch).catch(() => null);
    return file ? { repo, config: parseHubConfig(file.text) } : null;
  });
  return found.filter((p): p is Project => p !== null);
}

export async function loadProject(gh: GitHub, p: Project): Promise<ProjectData> {
  const repo = p.repo.fullName;
  const branchExists = (await gh.branchSha(repo, p.config.branch)) !== null;
  const ref = branchExists ? p.config.branch : p.repo.defaultBranch;
  const [backlog, questions, pause, commits] = await Promise.all([
    gh.getFile(repo, p.config.backlog, ref),
    gh.getFile(repo, p.config.questions, ref),
    gh.getFile(repo, PAUSE_PATH, ref),
    gh.commits(repo, ref, 40),
  ]);
  return { ref, branchExists, backlog, questions, paused: pause !== null, commits, loadedAt: Date.now() };
}

/** Creates the work branch from the default branch when it is missing. */
async function ensureBranch(gh: GitHub, p: Project): Promise<void> {
  if ((await gh.branchSha(p.repo.fullName, p.config.branch)) !== null) return;
  const base = await gh.branchSha(p.repo.fullName, p.repo.defaultBranch);
  if (!base) throw new Error(`${p.repo.fullName}: varsayılan dal bulunamadı.`);
  await gh.createBranch(p.repo.fullName, p.config.branch, base);
}

/**
 * Reads a file from the work branch, applies `change` and commits the result.
 * When the file moved in between (a cloud run pushed), it reads again and
 * re-applies `change` to the new text, so the owner's edit lands on top.
 */
export async function editFile(
  gh: GitHub,
  p: Project,
  path: string,
  change: (text: string) => string,
  /** A function when the message depends on the change (e.g. the new item's id). */
  message: string | (() => string),
  /** The text to start from when the file does not exist yet; without it a missing file is an error. */
  initial?: string,
): Promise<void> {
  await ensureBranch(gh, p);
  for (let attempt = 0; ; attempt++) {
    const file = await gh.getFile(p.repo.fullName, path, p.config.branch);
    if (!file && initial === undefined) throw new Error(`${path} bu projede yok.`);
    const before = file?.text ?? initial!;
    const text = change(before);
    if (file && text === before) return;
    try {
      const msg = typeof message === 'string' ? message : message();
      await gh.putFile(p.repo.fullName, path, p.config.branch, text, file?.sha ?? null, msg);
      return;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 3) throw e;
    }
  }
}

/** Pausing adds `.claude/hub-paused` on the work branch; the cloud prompt stops while it exists. */
export async function setPaused(gh: GitHub, p: Project, paused: boolean): Promise<void> {
  await ensureBranch(gh, p);
  const repo = p.repo.fullName;
  for (let attempt = 0; ; attempt++) {
    const file = await gh.getFile(repo, PAUSE_PATH, p.config.branch);
    try {
      if (paused && !file) {
        const text = 'The owner paused the cloud runs from Claude Hub. Delete this file to resume.\n';
        await gh.putFile(repo, PAUSE_PATH, p.config.branch, text, null, 'hub: pause cloud runs');
      } else if (!paused && file) {
        await gh.deleteFile(repo, PAUSE_PATH, p.config.branch, file.sha, 'hub: resume cloud runs');
      }
      return;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 3) throw e;
    }
  }
}

export function projectName(p: Project): string {
  return p.config.name ?? p.repo.fullName.split('/')[1];
}

/** Link to a line of a file on the work branch. */
export function fileUrl(p: Project, ref: string, path: string, line?: number): string {
  const base = `${p.repo.htmlUrl}/blob/${ref.split('/').map(encodeURIComponent).join('/')}/${path}`;
  return line === undefined ? base : `${base}?plain=1#L${line + 1}`;
}
