// Stock rules. Pure functions over the app state (no Vue), so they can be unit-tested with `npm test`.
//
// `state` exposes: items, records, groups, groupRecords, counts (see CLAUDE.md for their shapes).
import { formatDate, parseDateLocal } from './dates.js';

export function createStockMath(state, { minDateStr }) {
  // Sum of the room counts for an item on a day (including rooms removed since), or null when nobody counted it
  const roomSum = (itemId, dateStr) => {
    const byLocation = state.counts[dateStr];
    if (!byLocation) return null;
    let sum = 0;
    let found = false;
    for (const locId in byLocation) {
      const v = byLocation[locId]?.[itemId];
      if (v != null) { sum += Number(v); found = true; }
    }
    return found ? sum : null;
  };

  // Departures × items used per departure, over all groups
  const calculateAutoConsumption = (item, dateStr) => {
    if (!item.multipliers) return 0;
    let totalAuto = 0;
    state.groups.forEach(g => {
      const qty = Number(item.multipliers[g.id]) || 0;
      if (qty > 0) {
        const deps = Number(state.groupRecords[g.id]?.[dateStr]?.d) || 0;
        totalAuto += qty * deps;
      }
    });
    return totalAuto;
  };

  // One day of an item: consumption, income and end-of-day stock, given the previous day's stock.
  // A count is the end-of-day figure, so that day's income/consumption don't change it.
  // Precedence: count typed on the Stock tab (m) > sum of the room counts > calculation.
  const dayFigures = (item, dateStr, prevTotal) => {
    const rec = state.records[item.id]?.[dateStr];
    const autoC = calculateAutoConsumption(item, dateStr);

    let consumption = autoC;
    if (rec && rec.mc != null) {
      consumption = Number(rec.mc);
    } else if (rec && rec.c) {
      consumption = autoC + (Number(rec.c) || 0);
    }

    const income = Number(rec?.i) || 0;
    const rooms = rec?.m != null ? null : roomSum(item.id, dateStr);
    const counted = rec?.m != null || rooms != null;
    const total = rec?.m != null ? Number(rec.m) : rooms != null ? rooms : prevTotal + income - consumption;
    return { consumption, income, total, counted };
  };

  // Earliest date anything was recorded (never later than minDateStr)
  const earliestDate = () => {
    let earliest = minDateStr;
    for (const iId in state.records) {
      for (const d in state.records[iId]) { if (d < earliest) earliest = d; }
    }
    for (const gId in state.groupRecords) {
      for (const d in state.groupRecords[gId]) { if (d < earliest) earliest = d; }
    }
    for (const d in state.counts) { if (d < earliest) earliest = d; }
    return earliest;
  };

  // Totals aren't stored: replay every day from the earliest record up to the target date
  const calculateTotal = (itemId, targetDateStr) => {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return 0;

    let total = 0;
    const curr = parseDateLocal(earliestDate());
    const target = parseDateLocal(targetDateStr);
    while (curr <= target) {
      total = dayFigures(item, formatDate(curr), total).total;
      curr.setDate(curr.getDate() + 1);
    }
    return total;
  };

  // Whether anything happened to an item on a day: consumption, income or a count.
  // The week overview shows '—' for days without activity (there is always consumption on a real day).
  const hasActivity = (itemId, dateStr) => {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return false;
    const f = dayFigures(item, dateStr, 0);
    return f.counted || f.consumption !== 0 || f.income !== 0;
  };

  return { roomSum, calculateAutoConsumption, dayFigures, calculateTotal, hasActivity };
}
