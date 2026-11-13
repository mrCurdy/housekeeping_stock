import {
  addDays,
  DEFAULT_ROOM_STATUSES,
  emptyStockData,
  formatDate,
  parseDateLocal,
  type Cleaning,
  type DayRecord,
  type Item,
  type Room,
  type StockData,
  type Task,
  type UnitStatus,
} from '@app/shared';

/**
 * Demo data for a small hotel: 7 linen/amenity items, 3 departure groups, 3 checklist groups of
 * a day shift's admin tasks, and 29 room cards (2 on level 0, 9 on levels 1–3).
 * Deterministic for a given `today` (a seeded random), so tests can check exact figures.
 */

/** Days of stock history before today. Stays well inside HISTORY_DAYS, so nothing is pruned. */
export const SEED_DAYS = 14;

/** mulberry32: a tiny seeded random in [0, 1). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEMS = [
  'Bath towel',
  'Hand towel',
  'Bath mat',
  'Bed sheet',
  'Duvet cover',
  'Pillowcase',
  'Toiletry kit',
] as const;

/** Departure groups with the items one departure uses (same order as ITEMS) and departures/day. */
const GROUPS = [
  { id: 'g-single', name: 'Single', use: [1, 1, 1, 1, 1, 1, 1], daily: [1, 4] },
  { id: 'g-double', name: 'Double', use: [2, 2, 1, 1, 1, 2, 2], daily: [3, 8] },
  { id: 'g-family', name: 'Family', use: [4, 3, 1, 2, 2, 4, 4], daily: [0, 3] },
] as const;

/** Stock on the first seeded day (a manual count). */
const START_STOCK = [160, 140, 70, 110, 100, 180, 150];

const TASK_GROUPS: { id: string; name: string; tasks: [string, string][] }[] = [
  {
    id: 'tg-morning',
    name: 'Before 11',
    tasks: [
      [
        'Check arrivals and departures',
        '- [ ] Print the departures list\n- [ ] Mark early check-ins\n- [ ] Note VIP and long-stay rooms',
      ],
      ['Assign rooms to cleaners', 'Split departures evenly per level. Level 0 goes with level 1.'],
      ['Brief the team', 'Today’s priorities, rooms with maintenance issues, guest requests.'],
      ['Check the laundry delivery', '- [ ] Count the delivered linen\n- [ ] Enter it as income'],
    ],
  },
  {
    id: 'tg-service',
    name: 'Service',
    tasks: [
      [
        'Inspect cleaned rooms',
        '- [ ] Bathroom and towels\n- [ ] Bed made, no stains\n- [ ] Amenities restocked\n- [ ] Lights and TV work',
      ],
      ['Restock the carts', 'Towels, toiletry kits and bath mats for every level’s cart.'],
      ['Report maintenance issues', 'Set the unit’s status on the room card, with a short note.'],
      ['Log lost and found', 'Bag, label with the room number and date, enter it in the book.'],
    ],
  },
  {
    id: 'tg-end',
    name: 'End of shift',
    tasks: [
      ['Count the linen room', 'Enter the count on the Counter page.'],
      ['Send dirty linen to the laundry', ''],
      ['Lock the storage rooms', ''],
      ['Write a note for the next shift', 'Open issues, rooms out of order, missing deliveries.'],
    ],
  },
];

const ROOM_TYPES = [
  { id: 'rt-single', name: 'Single' },
  { id: 'rt-double', name: 'Double' },
  { id: 'rt-twin', name: 'Twin' },
  { id: 'rt-family', name: 'Family' },
];

const ROOM_UNIT_GROUPS = [
  { id: 'ug-bath', name: 'Bathroom' },
  { id: 'ug-tech', name: 'Electronics' },
  { id: 'ug-room', name: 'Room' },
];

const ROOM_UNITS = [
  { id: 'u-faucet', name: 'Faucet', group: 'ug-bath' },
  { id: 'u-shower', name: 'Shower', group: 'ug-bath' },
  { id: 'u-bulbs', name: 'Light bulbs', group: 'ug-tech' },
  { id: 'u-tv', name: 'TV', group: 'ug-tech' },
  { id: 'u-ac', name: 'Air conditioning', group: 'ug-tech' },
  { id: 'u-minibar', name: 'Minibar', group: 'ug-room' },
  { id: 'u-lock', name: 'Door lock', group: 'ug-room' },
];

const CLEANERS = ['Anna', 'Marina', 'Kati', 'Olga', 'Liis'];

/** Unit problems put on a few rooms: [room number, unit, status, note]. */
const ISSUES: [string, string, string, string][] = [
  ['002', 'u-bulbs', 'attention', 'One bulb by the mirror flickers'],
  ['103', 'u-faucet', 'fix', 'Dripping, water left running'],
  ['105', 'u-tv', 'attention', 'Remote needs batteries'],
  ['108', 'u-ac', 'ordered', 'Fan motor ordered, arrives Friday'],
  ['204', 'u-shower', 'fix', 'Low pressure, head clogged'],
  ['204', 'u-bulbs', 'attention', 'Bedside lamp bulb out'],
  ['207', 'u-lock', 'fix', 'Card reader battery low'],
  ['302', 'u-minibar', 'attention', 'Noisy, still cools'],
  ['306', 'u-faucet', 'attention', 'Hot water slow to come'],
  ['309', 'u-ac', 'fix', 'Does not cool'],
];

const ROOM_NOTES: Record<string, string> = {
  '001': 'Accessible room, roll-in shower',
  '002': 'Next to the staff room, can be noisy in the morning',
  '101': 'Connecting door to 102',
  '109': 'Corner room, sea view',
  '201': 'Allergy room: no feather pillows',
  '209': 'Corner room, sea view, bathtub',
  '305': 'Long-stay guest, clean every 3rd day',
  '309': 'Suite-size family room, sofa bed',
};

export function seedData(today: string): StockData {
  const rnd = random(20261113);
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const day = (offset: number) => formatDate(addDays(parseDateLocal(today), offset));
  const data = emptyStockData();

  // Stock: items, departure groups and their multipliers.
  data.groups = GROUPS.map(({ id, name }) => ({ id, name }));
  data.items = ITEMS.map((name, i): Item => ({
    id: `i-${i + 1}`,
    name,
    multipliers: Object.fromEntries(GROUPS.map((g) => [g.id, g.use[i] ?? 0])),
  }));
  data.locations = [
    { id: 'l-linen', name: 'Linen room' },
    { id: 'l-carts', name: 'Cleaning carts' },
  ];

  // Departures for every day but today, which the shift fills in.
  const used = (offset: number) =>
    data.items.map((item) =>
      GROUPS.reduce(
        (sum, g) =>
          sum + (item.multipliers[g.id] ?? 0) * (data.groupRecords[g.id]?.[day(offset)]?.d ?? 0),
        0,
      ),
    );
  for (const g of GROUPS) data.groupRecords[g.id] = {};
  for (let o = -SEED_DAYS; o < 0; o++)
    for (const g of GROUPS) {
      const d = int(g.daily[0], g.daily[1]);
      if (d > 0) data.groupRecords[g.id]![day(o)] = { d };
    }

  // A manual count on the first day, then the laundry delivers what two days used, every 2 days.
  data.items.forEach((item, i) => {
    const rec: Record<string, DayRecord> = { [day(-SEED_DAYS)]: { m: START_STOCK[i] } };
    for (let o = -SEED_DAYS + 2; o <= 0; o += 2) {
      const twoDays = used(o - 1)[i]! + used(o - 2)[i]!;
      if (twoDays > 0) rec[day(o)] = { i: Math.ceil(twoDays / 10) * 10 };
    }
    data.records[item.id] = rec;
  });

  // Room counts a week ago (linen room + carts), slightly off the calculation, as in real life.
  data.counts[day(-7)] = {
    'l-linen': Object.fromEntries(
      data.items.map((it, i) => [it.id, Math.round(START_STOCK[i]! * 0.7)]),
    ),
    'l-carts': Object.fromEntries(
      data.items.map((it, i) => [it.id, Math.round(START_STOCK[i]! * 0.25)]),
    ),
  };

  // Checklist: three groups of a day shift's admin tasks.
  data.taskGroups = TASK_GROUPS.map(({ id, name }) => ({ id, name }));
  data.tasks = TASK_GROUPS.flatMap((g) =>
    g.tasks.map(([name, description], i): Task => ({
      id: `${g.id}-${i + 1}`,
      name,
      description,
      group: g.id,
    })),
  );
  // Yesterday fully done, today the morning tasks are ticked.
  const tick = (date: string, hour: number, i: number) =>
    `${date}T${String(hour).padStart(2, '0')}:${String(10 + i * 7).padStart(2, '0')}:00`;
  data.checks[day(-1)] = Object.fromEntries(
    data.tasks.map((t, i) => [
      t.id,
      new Date(tick(day(-1), 8 + Math.floor(i / 2), i % 6)).toISOString(),
    ]),
  );
  data.checks[today] = Object.fromEntries(
    data.tasks
      .filter((t) => t.group === 'tg-morning')
      .map((t, i) => [t.id, new Date(tick(today, 8, i)).toISOString()]),
  );
  data.notes[day(-1)] =
    '204: shower reported to maintenance. Laundry delivery was 10 bath mats short. 305 long-stay, skip today.';

  // Room cards: 2 rooms on level 0, 9 on levels 1–3.
  const numbers = [
    '001',
    '002',
    ...[1, 2, 3].flatMap((level) => Array.from({ length: 9 }, (_, i) => `${level}0${i + 1}`)),
  ];
  const typeFor = (n: string) => {
    if (n.startsWith('0')) return 'rt-double';
    const pos = Number(n.slice(-1));
    return pos === 9 ? 'rt-family' : pos <= 2 ? 'rt-single' : pos % 2 ? 'rt-double' : 'rt-twin';
  };
  data.roomTypes = ROOM_TYPES;
  data.roomUnitGroups = ROOM_UNIT_GROUPS;
  data.roomUnits = ROOM_UNITS;
  data.roomStatuses = [
    ...DEFAULT_ROOM_STATUSES,
    { id: 'ordered', name: 'Part ordered', color: 'blue' },
  ];
  data.rooms = numbers.map((number): Room => ({
    id: `r-${number}`,
    number,
    type: typeFor(number),
    ...(ROOM_NOTES[number] ? { note: ROOM_NOTES[number] } : {}),
  }));

  for (const [number, unit, status, note] of ISSUES) {
    const roomId = `r-${number}`;
    const at = new Date(
      `${day(-int(0, 6))}T${String(int(9, 16)).padStart(2, '0')}:30:00`,
    ).toISOString();
    const entry: UnitStatus = { status, by: CLEANERS[int(0, CLEANERS.length - 1)]!, at, note };
    (data.unitStatus[roomId] ??= {})[unit] = entry;
  }

  // General cleanings: most rooms within the last weeks, a few overdue, 302 and 307 never.
  numbers.forEach((number, i) => {
    if (number === '302' || number === '307') return;
    const latest = i % 7 === 3 ? int(30, 45) : i % 5 === 1 ? int(16, 29) : int(0, 15);
    const list: Cleaning[] = [{ date: day(-latest), by: CLEANERS[i % CLEANERS.length]! }];
    // An earlier cleaning, when it is still inside the history window.
    if (latest + 18 < 30)
      list.push({ date: day(-latest - 18), by: CLEANERS[(i + 2) % CLEANERS.length]! });
    data.cleanings[`r-${number}`] = list;
  });

  return data;
}
