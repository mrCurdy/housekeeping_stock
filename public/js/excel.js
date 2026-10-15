// "Excel" button: the human-readable history workbook.
// ExcelJS (not SheetJS) because SheetJS community edition can't write cell styles; it is loaded on first use.
import { formatDate, parseDateLocal } from './dates.js';
import { isEmptyRecord, isEmptyGroupRecord } from './store.js';

const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

const loadExcelJS = () => window.ExcelJS ? Promise.resolve(window.ExcelJS) : new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = EXCELJS_URL;
  script.onload = () => resolve(window.ExcelJS);
  script.onerror = () => reject(new Error('Could not load the Excel library (are you offline?)'));
  document.head.appendChild(script);
});

// First day with real (non-blank) data up to max(last day, today), every day in between
const historyRange = (state, todayStr) => {
  let first = null;
  let last = todayStr;
  const see = (d) => {
    if (first === null || d < first) first = d;
    if (d > last) last = d;
  };
  const scan = (byId, isEmpty) => {
    for (const id in byId) {
      for (const d in byId[id]) { if (!isEmpty(byId[id][d])) see(d); }
    }
  };
  scan(state.records, isEmptyRecord);
  scan(state.groupRecords, isEmptyGroupRecord);
  for (const d in state.counts) see(d);
  if (first === null) return [];

  const days = [];
  const end = parseDateLocal(last);
  for (let d = parseDateLocal(first); d <= end; d.setDate(d.getDate() + 1)) days.push(formatDate(d));
  return days;
};

export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// "Stock" sheet: one row per day, Consumption / Income / Stock columns per item.
// "Departures" sheet when groups exist.
export async function exportExcel(state, math, todayStr) {
  const { items, groups, groupRecords } = state;
  if (items.length === 0) return alert('No data to export!');
  const days = historyRange(state, todayStr);
  if (days.length === 0) return alert('No history to export yet!');

  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();

  const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const itemDivider = { style: 'medium', color: { argb: 'FF64748B' } };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const headerFill = fill('FFF1F5F9');
  const consumptionFill = fill('FFEFF6FF');
  const todayFill = fill('FFE0E7FF');
  const countedFill = fill('FFFEF3C7');
  const toExcelDate = (dStr) => {
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const styleDateCell = (cell, dStr) => {
    cell.value = toExcelDate(dStr);
    cell.numFmt = 'yyyy-mm-dd ddd';
    cell.border = border;
    if (dStr === todayStr) cell.fill = todayFill;
    if (dStr > todayStr) cell.font = { italic: true, color: { argb: 'FF64748B' } };
  };
  const styleHeader = (cell) => {
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };

  // --- Stock sheet ---
  const ws = wb.addWorksheet('Stock', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  ws.getColumn(1).width = 16;
  ws.getCell(1, 1).value = 'Date';
  ws.mergeCells(1, 1, 2, 1);
  styleHeader(ws.getCell(1, 1));

  items.forEach((item, k) => {
    const col = 2 + k * 3;
    ws.getCell(1, col).value = item.name || 'Unnamed Stock Item';
    ws.mergeCells(1, col, 1, col + 2);
    ['Consumption', 'Income', 'Stock'].forEach((label, n) => {
      ws.getColumn(col + n).width = 13;
      ws.getCell(2, col + n).value = label;
      styleHeader(ws.getCell(2, col + n));
    });
    styleHeader(ws.getCell(1, col));
    ws.getCell(1, col).border = { ...border, left: itemDivider };
    ws.getCell(2, col).border = { ...border, left: itemDivider };
  });
  ws.getRow(1).height = 30;

  // Nothing happened before the first exported day, so every item starts at 0 (as in calculateTotal)
  const running = items.map(() => 0);
  days.forEach((dStr, r) => {
    const row = 3 + r;
    styleDateCell(ws.getCell(row, 1), dStr);
    items.forEach((item, k) => {
      const f = math.dayFigures(item, dStr, running[k]);
      running[k] = f.total;
      const col = 2 + k * 3;
      const cCell = ws.getCell(row, col);
      const iCell = ws.getCell(row, col + 1);
      const sCell = ws.getCell(row, col + 2);
      cCell.value = f.consumption;
      cCell.fill = consumptionFill;
      iCell.value = f.income;
      sCell.value = f.total;
      sCell.font = { bold: true, color: { argb: f.total < 0 ? 'FFDC2626' : 'FF0F172A' } };
      if (f.counted) sCell.fill = countedFill;
      [cCell, iCell, sCell].forEach(c => { c.border = border; });
      cCell.border = { ...border, left: itemDivider };
    });
  });

  const legendRow = 3 + days.length + 1;
  [
    'Stock = end-of-day stock. Highlighted yellow = counted (sum of the room counts, or typed in); red = shortage.',
    'Consumption includes departures × items per room unless it was entered by hand.',
    'Dates in grey italics are planned (in the future).'
  ].forEach((text, n) => {
    const cell = ws.getCell(legendRow + n, 1);
    cell.value = text;
    cell.font = { italic: true, color: { argb: 'FF64748B' } };
  });

  // --- Departures sheet ---
  if (groups.length > 0) {
    const ds = wb.addWorksheet('Departures', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    ds.getColumn(1).width = 16;
    ds.getCell(1, 1).value = 'Date';
    styleHeader(ds.getCell(1, 1));
    groups.forEach((g, k) => {
      ds.getColumn(2 + k).width = 14;
      ds.getCell(1, 2 + k).value = g.name;
      styleHeader(ds.getCell(1, 2 + k));
    });
    days.forEach((dStr, r) => {
      styleDateCell(ds.getCell(2 + r, 1), dStr);
      groups.forEach((g, k) => {
        const cell = ds.getCell(2 + r, 2 + k);
        cell.value = Number(groupRecords[g.id]?.[dStr]?.d) || 0;
        cell.border = border;
      });
    });

    // Items used per departure, as set up in each group
    const setupRow = 2 + days.length + 1;
    ds.getCell(setupRow, 1).value = 'Items per departure';
    styleHeader(ds.getCell(setupRow, 1));
    groups.forEach((g, k) => {
      ds.getCell(setupRow, 2 + k).value = g.name;
      styleHeader(ds.getCell(setupRow, 2 + k));
    });
    items.forEach((item, n) => {
      const nameCell = ds.getCell(setupRow + 1 + n, 1);
      nameCell.value = item.name || 'Unnamed Stock Item';
      nameCell.border = border;
      groups.forEach((g, k) => {
        const cell = ds.getCell(setupRow + 1 + n, 2 + k);
        cell.value = Number(item.multipliers?.[g.id]) || 0;
        cell.border = border;
      });
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `stock_history_${formatDate(new Date())}.xlsx`
  );
}
