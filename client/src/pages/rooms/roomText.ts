import { DEFAULT_ROOM_STATUSES, type Room, type RoomStatus, type RoomType } from '@app/shared';
import type { SelectOption } from '@/components/ui/Select';
import type { Messages } from '@/i18n/en';

/** Another card already has this number (the server refuses it with 409). */
export const roomExists = (rooms: readonly Room[], number: string, exceptId?: string) =>
  rooms.some((r) => r.id !== exceptId && r.number === number);

/** The room type dropdown: "No type" first, then the types in their order. */
export const typeOptions = (types: readonly RoomType[], noType: string): SelectOption[] => [
  { value: '', label: noType },
  ...types.map((type) => ({ value: type.id, label: type.name })),
];

/** "Cleaned 3 days ago · Mari" (today / yesterday wording), or "No general cleaning yet". */
export function cleaningText(days: number | null, by: string, tx: Messages['rooms']): string {
  if (days === null) return tx.neverCleaned;
  if (days <= 0) return tx.cleanedToday(by);
  if (days === 1) return tx.cleanedYesterday(by);
  return tx.cleanedDaysAgo(days, by);
}

/**
 * A status's name on screen. A default status (OK / Needs attention / Needs fixing) that still has
 * its English default name is shown translated; a renamed or own status is shown as typed.
 */
export function statusName(status: RoomStatus, names: Messages['rooms']['defaultStatus']): string {
  const fallback = DEFAULT_ROOM_STATUSES.find((d) => d.id === status.id);
  return fallback && fallback.name === status.name
    ? names[fallback.id as keyof typeof names]
    : status.name;
}
