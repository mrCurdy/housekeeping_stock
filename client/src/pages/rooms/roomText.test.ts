import { DEFAULT_ROOM_STATUSES } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { ru } from '@/i18n/ru';
import { statusName } from './roomText';

describe('statusName', () => {
  const names = ru.rooms.defaultStatus;
  it('translates a default status while its name is unchanged', () => {
    expect(statusName(DEFAULT_ROOM_STATUSES[0]!, names)).toBe(names.ok);
  });
  it('shows a renamed or own status as typed', () => {
    expect(statusName({ id: 'ok', name: 'Fine', color: 'green' }, names)).toBe('Fine');
    expect(statusName({ id: 's1', name: 'OK', color: 'blue' }, names)).toBe('OK');
  });
});
