import { describe, expect, it } from 'vitest';
import { addItem, moveInQueue, parseBacklog, setStatus } from '../../src/core/backlog';
import { demoGitHub } from '../../src/demo';
import { discoverProjects, editFile, loadProject, setPaused, type Project } from '../../src/hub';
import { MemoryGitHub } from '../../src/memoryGitHub';

const WORK = 'claude/cloud-backlog';

async function setup() {
  const gh = demoGitHub();
  gh.delayMs = 0;
  const projects = await discoverProjects(gh);
  const byRepo = (name: string) => projects.find((p) => p.repo.fullName === name)!;
  return { gh, projects, surf: byRepo('demo/surf-oyunu'), horse: byRepo('demo/at-oyunu') };
}

describe('discoverProjects', () => {
  it('finds repos with .claude/hub.json and reads their config', async () => {
    const { projects } = await setup();
    expect(projects.map((p) => [p.repo.fullName, p.config.name, p.config.icon])).toEqual([
      ['demo/surf-oyunu', 'Sörf Oyunu', '🏄'],
      ['demo/at-oyunu', 'At Binme Oyunu', '🐎'],
    ]);
  });
});

describe('loadProject', () => {
  it('reads the work branch, questions, pause flag and commits', async () => {
    const { gh, surf, horse } = await setup();
    const s = await loadProject(gh, surf);
    expect(s).toMatchObject({ ref: WORK, branchExists: true, paused: false });
    expect(parseBacklog(s.backlog!.text).items.length).toBe(11);
    expect(s.questions).not.toBeNull();
    expect(s.commits[0].message).toBe('claim: B-013');
    const h = await loadProject(gh, horse);
    expect(h).toMatchObject({ paused: true, questions: null });
  });

  it('falls back to the default branch before the work branch exists', async () => {
    const gh = new MemoryGitHub();
    gh.addRepo('me/new');
    gh.seed('me/new', 'main', '.claude/hub.json', '{}', 'init');
    gh.seed('me/new', 'main', 'docs/BACKLOG.md', '# Backlog\n', 'init');
    const [p] = await discoverProjects(gh);
    expect(await loadProject(gh, p)).toMatchObject({ ref: 'main', branchExists: false });
  });
});

describe('editFile', () => {
  it('re-applies the change when a cloud run pushed in between', async () => {
    const { gh, surf } = await setup();
    let pushes = 0;
    gh.beforeWrite = (repo, path) => {
      if (pushes++ > 0) return;
      // A worker finishes B-013 while the owner is adding a task.
      gh.seed(repo, WORK, path, setStatus(currentText(gh, surf), 'B-013', 'DONE', 'bitti', new Date()), 'feat(B-013): hints');
    };
    await editFile(gh, surf, surf.config.backlog, (t) => addItem(t, { title: 'Yeni', description: '', direct: false, position: 'bottom', date: new Date() }).text, 'hub: add');
    const items = parseBacklog((await gh.getFile(surf.repo.fullName, surf.config.backlog, WORK))!.text).items;
    expect(items.find((i) => i.id === 'B-013')!.status).toBe('DONE');
    expect(items.find((i) => i.title === 'Yeni')!.status).toBe('NEW');
    expect((await gh.commits(surf.repo.fullName, WORK, 1))[0].message).toBe('hub: add');
  });

  it('creates the work branch on the first write', async () => {
    const gh = new MemoryGitHub();
    gh.addRepo('me/new');
    gh.seed('me/new', 'main', '.claude/hub.json', '{}', 'init');
    gh.seed('me/new', 'main', 'docs/BACKLOG.md', '### B-001 A\nDurum: TODO\n\n### B-002 B\nDurum: TODO\n', 'init');
    const [p] = await discoverProjects(gh);
    await editFile(gh, p, 'docs/BACKLOG.md', (t) => moveInQueue(t, 'B-002', 'top'), 'hub: move B-002 top');
    expect((await gh.getFile('me/new', 'docs/BACKLOG.md', WORK))!.text.startsWith('### B-002')).toBe(true);
    expect((await gh.getFile('me/new', 'docs/BACKLOG.md', 'main'))!.text.startsWith('### B-001')).toBe(true);
  });

  it('makes no commit when nothing changes', async () => {
    const { gh, surf } = await setup();
    const before = (await gh.commits(surf.repo.fullName, WORK, 1))[0].sha;
    await editFile(gh, surf, surf.config.backlog, (t) => t, 'hub: nothing');
    expect((await gh.commits(surf.repo.fullName, WORK, 1))[0].sha).toBe(before);
  });
});

describe('setPaused', () => {
  it('adds and removes the pause file', async () => {
    const { gh, surf, horse } = await setup();
    await setPaused(gh, surf, true);
    expect((await loadProject(gh, surf)).paused).toBe(true);
    await setPaused(gh, horse, false);
    expect((await loadProject(gh, horse)).paused).toBe(false);
    expect((await gh.commits(horse.repo.fullName, WORK, 1))[0].message).toBe('hub: resume cloud runs');
  });
});

function currentText(gh: MemoryGitHub, p: Project): string {
  // Synchronous peek for the conflict simulation (MemoryGitHub keeps plain maps).
  const data = (gh as unknown as { data: Map<string, { branches: Map<string, { files: Map<string, { text: string }> }> }> }).data;
  return data.get(p.repo.fullName)!.branches.get(WORK)!.files.get(p.config.backlog)!.text;
}
