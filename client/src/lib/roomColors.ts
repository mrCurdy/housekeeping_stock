import type { RoomColor } from '@app/shared';

/** Tailwind classes for one room status colour (tokens `--status-<colour>` in `styles/index.css`). */
export interface RoomColorClasses {
  /** A solid swatch or dot */
  dot: string;
  /** Coloured text */
  text: string;
  /** A light chip background (pair with `text`) */
  soft: string;
  border: string;
}

/**
 * Room status colour id → classes. Written out in full so Tailwind finds every class; the colours
 * follow light/dark mode through their tokens.
 */
export const ROOM_COLOR_CLASSES: Record<RoomColor, RoomColorClasses> = {
  green: {
    dot: 'bg-status-green',
    text: 'text-status-green',
    soft: 'bg-status-green-soft',
    border: 'border-status-green',
  },
  yellow: {
    dot: 'bg-status-yellow',
    text: 'text-status-yellow',
    soft: 'bg-status-yellow-soft',
    border: 'border-status-yellow',
  },
  red: {
    dot: 'bg-status-red',
    text: 'text-status-red',
    soft: 'bg-status-red-soft',
    border: 'border-status-red',
  },
  blue: {
    dot: 'bg-status-blue',
    text: 'text-status-blue',
    soft: 'bg-status-blue-soft',
    border: 'border-status-blue',
  },
  purple: {
    dot: 'bg-status-purple',
    text: 'text-status-purple',
    soft: 'bg-status-purple-soft',
    border: 'border-status-purple',
  },
  orange: {
    dot: 'bg-status-orange',
    text: 'text-status-orange',
    soft: 'bg-status-orange-soft',
    border: 'border-status-orange',
  },
  teal: {
    dot: 'bg-status-teal',
    text: 'text-status-teal',
    soft: 'bg-status-teal-soft',
    border: 'border-status-teal',
  },
  pink: {
    dot: 'bg-status-pink',
    text: 'text-status-pink',
    soft: 'bg-status-pink-soft',
    border: 'border-status-pink',
  },
  brown: {
    dot: 'bg-status-brown',
    text: 'text-status-brown',
    soft: 'bg-status-brown-soft',
    border: 'border-status-brown',
  },
  grey: {
    dot: 'bg-status-grey',
    text: 'text-status-grey',
    soft: 'bg-status-grey-soft',
    border: 'border-status-grey',
  },
};
