// An in-memory GitHub for the demo mode (`?demo`) and the unit tests.

import type { Commit } from './core/project';
import { ConflictError, type FileData, type GitHub, type RepoInfo } from './github';

interface Branch {
  files: Map<string, FileData>;
  /** Newest first. */
  commits: Commit[];
}

interface MemRepo {
  info: RepoInfo;
  branches: Map<string, Branch>;
}

let shaCounter = 0;
const newSha = () => (++shaCounter).toString(16).padStart(40, '0');

export class MemoryGitHub implements GitHub {
  private readonly data = new Map<string, MemRepo>();
  /** Called before every write; tests use it to simulate a cloud run pushing in between. */
  beforeWrite: ((repo: string, path: string) => void) | null = null;
  /** How long each call takes, so the demo shows its loading states. */
  delayMs = 0;

  constructor(private readonly user = 'demo') {}

  private async wait(): Promise<void> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
  }

  addRepo(fullName: string, isPrivate = true): void {
    this.data.set(fullName, {
      info: {
        fullName,
        defaultBranch: 'main',
        private: isPrivate,
        pushedAt: new Date().toISOString(),
        htmlUrl: `https://github.com/${fullName}`,
      },
      branches: new Map([['main', { files: new Map(), commits: [] }]]),
    });
  }

  private branch(repo: string, name: string): Branch | null {
    return this.data.get(repo)?.branches.get(name) ?? null;
  }

  /** The branch, branched off the default branch when it does not exist yet (setup). */
  private grow(repo: string, branch: string): { r: MemRepo; b: Branch } {
    const r = this.data.get(repo);
    if (!r) throw new Error(`No repo ${repo}`);
    let b = r.branches.get(branch);
    if (!b) {
      const main = r.branches.get(r.info.defaultBranch)!;
      b = { files: new Map(main.files), commits: [...main.commits] };
      r.branches.set(branch, b);
    }
    return { r, b };
  }

  /** Writes a file directly, with a commit dated `date` (setup and tests). */
  seed(repo: string, branch: string, path: string, text: string | null, message: string, date = new Date()): void {
    const { b } = this.grow(repo, branch);
    if (text === null) b.files.delete(path);
    else b.files.set(path, { text, sha: newSha() });
    this.addCommit(repo, branch, message, date);
  }

  /** A commit that changes no file the hub reads (setup). */
  addCommit(repo: string, branch: string, message: string, date = new Date()): void {
    const { r, b } = this.grow(repo, branch);
    const sha = newSha();
    b.commits.unshift({ sha, message, date: date.toISOString(), url: `${r.info.htmlUrl}/commit/${sha}` });
    r.info.pushedAt = date.toISOString();
  }

  async login(): Promise<string> {
    await this.wait();
    return this.user;
  }

  async repos(): Promise<RepoInfo[]> {
    await this.wait();
    return [...this.data.values()].map((r) => ({ ...r.info }));
  }

  async getFile(repo: string, path: string, ref: string): Promise<FileData | null> {
    await this.wait();
    const f = this.branch(repo, ref)?.files.get(path);
    return f ? { ...f } : null;
  }

  async putFile(repo: string, path: string, branch: string, text: string, sha: string | null, message: string): Promise<void> {
    await this.wait();
    this.beforeWrite?.(repo, path);
    const b = this.branch(repo, branch);
    if (!b) throw new Error(`No branch ${branch}`);
    const current = b.files.get(path);
    if ((current?.sha ?? null) !== sha) throw new ConflictError(`${path} changed`);
    this.seed(repo, branch, path, text, message);
  }

  async deleteFile(repo: string, path: string, branch: string, sha: string, message: string): Promise<void> {
    await this.wait();
    this.beforeWrite?.(repo, path);
    const current = this.branch(repo, branch)?.files.get(path);
    if (!current) return;
    if (current.sha !== sha) throw new ConflictError(`${path} changed`);
    this.seed(repo, branch, path, null, message);
  }

  async branchSha(repo: string, branch: string): Promise<string | null> {
    await this.wait();
    return this.branch(repo, branch)?.commits[0]?.sha ?? (this.branch(repo, branch) ? '0'.repeat(40) : null);
  }

  async createBranch(repo: string, branch: string): Promise<void> {
    await this.wait();
    this.grow(repo, branch);
  }

  async commits(repo: string, ref: string, count: number): Promise<Commit[]> {
    await this.wait();
    return (this.branch(repo, ref)?.commits ?? []).slice(0, count);
  }
}
