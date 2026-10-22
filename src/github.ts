// The GitHub REST calls the hub needs, behind an interface so the demo mode
// (src/demo.ts) can stand in for it.

import { decodeBase64, encodeBase64 } from './core/base64';
import type { Commit } from './core/project';

export interface RepoInfo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  pushedAt: string;
  htmlUrl: string;
}

export interface FileData {
  text: string;
  sha: string;
}

/** The file or branch moved since it was read: read again and retry. */
export class ConflictError extends Error {}
/** The token is missing, wrong, expired or lacks a permission. */
export class AuthError extends Error {}

export interface GitHub {
  login(): Promise<string>;
  repos(): Promise<RepoInfo[]>;
  /** null when the file (or the ref) does not exist. */
  getFile(repo: string, path: string, ref: string): Promise<FileData | null>;
  /** `sha` null creates the file. */
  putFile(repo: string, path: string, branch: string, text: string, sha: string | null, message: string): Promise<void>;
  deleteFile(repo: string, path: string, branch: string, sha: string, message: string): Promise<void>;
  /** The branch's head commit, or null when it does not exist. */
  branchSha(repo: string, branch: string): Promise<string | null>;
  createBranch(repo: string, branch: string, fromSha: string): Promise<void>;
  /** Newest first. */
  commits(repo: string, ref: string, count: number): Promise<Commit[]>;
}

const API = 'https://api.github.com';

const encPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

interface ApiContent {
  type?: string;
  content?: string;
  encoding?: string;
  sha: string;
}

interface ApiCommit {
  sha: string;
  html_url: string;
  commit: { message: string; committer?: { date?: string }; author?: { date?: string } };
}

interface ApiRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  pushed_at: string;
  html_url: string;
}

export class RestGitHub implements GitHub {
  constructor(private readonly token: string) {}

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) throw new AuthError('GitHub token geçersiz ya da süresi dolmuş.');
    return res;
  }

  private async fail(res: Response, what: string): Promise<never> {
    let detail = '';
    try {
      detail = ((await res.json()) as { message?: string }).message ?? '';
    } catch {
      // No JSON body.
    }
    if (res.status === 409 || (res.status === 422 && /sha/i.test(detail))) throw new ConflictError(`${what}: ${detail}`);
    if (res.status === 403 && /permission|not accessible/i.test(detail)) {
      throw new AuthError(`Token'ın bu repoya yazma izni yok (${what}).`);
    }
    throw new Error(`GitHub ${res.status} (${what})${detail ? ': ' + detail : ''}`);
  }

  async login(): Promise<string> {
    const res = await this.call('GET', '/user');
    if (!res.ok) return this.fail(res, 'kullanıcı');
    return ((await res.json()) as { login: string }).login;
  }

  async repos(): Promise<RepoInfo[]> {
    const out: RepoInfo[] = [];
    for (let page = 1; page <= 5; page++) {
      const res = await this.call('GET', `/user/repos?per_page=100&sort=pushed&page=${page}`);
      if (!res.ok) return this.fail(res, 'repo listesi');
      const batch = (await res.json()) as ApiRepo[];
      for (const r of batch) {
        out.push({
          fullName: r.full_name,
          defaultBranch: r.default_branch,
          private: r.private,
          pushedAt: r.pushed_at,
          htmlUrl: r.html_url,
        });
      }
      if (batch.length < 100) break;
    }
    return out;
  }

  async getFile(repo: string, path: string, ref: string): Promise<FileData | null> {
    const res = await this.call('GET', `/repos/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`);
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, path);
    const data = (await res.json()) as ApiContent;
    if (data.type && data.type !== 'file') return null;
    if (data.encoding === 'base64' && data.content !== undefined) return { text: decodeBase64(data.content), sha: data.sha };
    // Files over 1 MB come without content; the blob API has it.
    const blob = await this.call('GET', `/repos/${repo}/git/blobs/${data.sha}`);
    if (!blob.ok) return this.fail(blob, path);
    const b = (await blob.json()) as { content: string };
    return { text: decodeBase64(b.content), sha: data.sha };
  }

  async putFile(repo: string, path: string, branch: string, text: string, sha: string | null, message: string): Promise<void> {
    const res = await this.call('PUT', `/repos/${repo}/contents/${encPath(path)}`, {
      message,
      branch,
      content: encodeBase64(text),
      ...(sha ? { sha } : {}),
    });
    if (!res.ok) await this.fail(res, path);
  }

  async deleteFile(repo: string, path: string, branch: string, sha: string, message: string): Promise<void> {
    const res = await this.call('DELETE', `/repos/${repo}/contents/${encPath(path)}`, { message, branch, sha });
    if (res.status === 404) return;
    if (!res.ok) await this.fail(res, path);
  }

  async branchSha(repo: string, branch: string): Promise<string | null> {
    const res = await this.call('GET', `/repos/${repo}/git/ref/heads/${encPath(branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, branch);
    const data = (await res.json()) as { object?: { sha: string } } | unknown[];
    // A prefix match returns a list instead of one ref: the branch itself does not exist.
    return Array.isArray(data) ? null : (data.object?.sha ?? null);
  }

  async createBranch(repo: string, branch: string, fromSha: string): Promise<void> {
    const res = await this.call('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: fromSha });
    if (res.status === 422) return; // Someone created it first.
    if (!res.ok) await this.fail(res, branch);
  }

  async commits(repo: string, ref: string, count: number): Promise<Commit[]> {
    const res = await this.call('GET', `/repos/${repo}/commits?sha=${encodeURIComponent(ref)}&per_page=${count}`);
    if (res.status === 404 || res.status === 409) return []; // 409: empty repository.
    if (!res.ok) return this.fail(res, 'commitler');
    return ((await res.json()) as ApiCommit[]).map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.committer?.date ?? c.commit.author?.date ?? '',
      url: c.html_url,
    }));
  }
}
