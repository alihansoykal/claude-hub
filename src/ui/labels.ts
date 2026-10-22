// Turkish names and colour classes for statuses and commit kinds.

import type { Status } from '../core/backlog';
import type { CommitKind } from '../core/project';

export const STATUS_LABEL: Record<Status, string> = {
  NEW: 'Planlanacak',
  TODO: 'Sırada',
  'IN-PROGRESS': 'Çalışılıyor',
  DONE: 'Bitti',
  BLOCKED: 'Takıldı',
  'NEEDS-DECISION': 'Karar bekliyor',
  OWNER: 'Senin işin',
  CANCELLED: 'İptal',
};

export const STATUS_CLASS: Record<Status, string> = {
  NEW: 'st-new',
  TODO: 'st-todo',
  'IN-PROGRESS': 'st-progress',
  DONE: 'st-done',
  BLOCKED: 'st-blocked',
  'NEEDS-DECISION': 'st-decision',
  OWNER: 'st-owner',
  CANCELLED: 'st-cancelled',
};

export const COMMIT_LABEL: Record<CommitKind, string> = {
  claim: 'İşe başladı',
  feat: 'Tamamladı',
  fix: 'Düzeltti',
  plan: 'Planladı',
  hub: 'Sen (hub)',
  merge: 'Birleştirme',
  chore: 'Bakım',
  other: 'Commit',
};
