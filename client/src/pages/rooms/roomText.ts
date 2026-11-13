import type { Room, RoomType } from '@app/shared';
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
