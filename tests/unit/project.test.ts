import { describe, expect, it } from 'vitest';
import { parseBacklog } from '../../src/core/backlog';
import { commitKind, completionDates, groupItems, parseHubConfig, relativeTime, runState, type Commit } from '../../src/core/project';

const BACKLOG = `### B-001 A
Durum: DONE
Not (2026-10-18): ok

### B-002 B
Durum: DONE
Not (2026-10-21): ok

### B-003 C
Durum: IN-PROGRESS

### B-004 D
Durum: NEW

### B-005 E
Durum: TODO

### B-006 F
Durum: OWNER

### B-007 G
Durum: DONE
`;

const commit = (message: string, date: string): Commit => ({ sha: message, message, date, url: '' });

describe('parseHubConfig', () => {
  it('fills defaults and ignores junk', () => {
    expect(parseHubConfig('{"name":"Surf Master","icon":"🏄"}')).toEqual({
      name: 'Surf Master',
      icon: '🏄',
      branch: 'claude/cloud-backlog',
      backlog: 'docs/BACKLOG.md',
      questions: 'docs/QUESTIONS.md',
    });
    expect(parseHubConfig('not json').branch).toBe('claude/cloud-backlog');
    expect(parseHubConfig('{"branch": 5, "backlog": "BACKLOG.md"}')).toMatchObject({ branch: 'claude/cloud-backlog', backlog: 'BACKLOG.md' });
  });
});

describe('groupItems', () => {
  it('groups by status and sorts done newest first', () => {
    const g = groupItems(parseBacklog(BACKLOG).items);
    expect(g.inProgress.map((i) => i.id)).toEqual(['B-003']);
    expect(g.queue.map((i) => i.id)).toEqual(['B-004', 'B-005']);
    expect(g.owner.map((i) => i.id)).toEqual(['B-006']);
    expect(g.done.map((i) => i.id)).toEqual(['B-002', 'B-001', 'B-007']);
  });

  it('orders finished items by their commit when known', () => {
    const dates = completionDates([
      commit('feat(B-007): G', '2026-10-22T09:00:00Z'),
      commit('claim: B-007', '2026-10-22T08:00:00Z'),
      commit('fix(B-001, B-002): both', '2026-10-17T09:00:00Z'),
      commit('feat(B-007): older', '2026-10-16T09:00:00Z'),
    ]);
    expect([...dates]).toEqual([
      ['B-007', '2026-10-22T09:00:00Z'],
      ['B-001', '2026-10-17T09:00:00Z'],
      ['B-002', '2026-10-17T09:00:00Z'],
    ]);
    const g = groupItems(parseBacklog(BACKLOG).items, dates);
    expect(g.done.map((i) => i.id)).toEqual(['B-007', 'B-002', 'B-001']);
  });
});

describe('runState', () => {
  const items = parseBacklog(BACKLOG).items;
  const now = Date.parse('2026-10-22T10:00:00Z');

  it('is working while the claim is fresh', () => {
    const s = runState(items, [commit('claim: B-003', '2026-10-22T09:30:00Z'), commit('claim: B-002', '2026-10-22T08:00:00Z')], now);
    expect(s).toMatchObject({ kind: 'working', since: '2026-10-22T09:30:00Z' });
  });

  it('is stale after 75 minutes or without a claim', () => {
    expect(runState(items, [commit('claim: B-003', '2026-10-22T08:40:00Z')], now).kind).toBe('stale');
    expect(runState(items, [commit('claim: B-0031', '2026-10-22T09:50:00Z')], now).kind).toBe('stale');
  });

  it('is idle with nothing in progress', () => {
    expect(runState(parseBacklog('### B-001 A\nDurum: TODO\n').items, [], now).kind).toBe('idle');
  });
});

describe('commitKind / relativeTime', () => {
  it('classifies the workflow commits', () => {
    expect(commitKind('claim: B-047')).toBe('claim');
    expect(commitKind('feat(B-047): speed command')).toBe('feat');
    expect(commitKind('plan: speed command')).toBe('plan');
    expect(commitKind('hub: add B-051 Map')).toBe('hub');
    expect(commitKind("Merge remote-tracking branch 'origin/main'")).toBe('merge');
    expect(commitKind('chore: cloud run blocked')).toBe('chore');
    expect(commitKind('Initial commit')).toBe('other');
  });

  it('speaks Turkish', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    expect(relativeTime('2026-10-22T09:59:30Z', now)).toBe('az önce');
    expect(relativeTime('2026-10-22T09:35:00Z', now)).toBe('25 dk önce');
    expect(relativeTime('2026-10-22T07:00:00Z', now)).toBe('3 sa önce');
    expect(relativeTime('2026-10-19T10:00:00Z', now)).toBe('3 gün önce');
  });
});
