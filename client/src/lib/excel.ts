// "Excel" button: the human-readable history workbook. Loaded on first use (dynamic import), so
// ExcelJS (~1 MB) stays out of the main bundle. ExcelJS rather than SheetJS because SheetJS
// community edition can't write cell styles. Item names are often Cyrillic: another reason for .xlsx over CSV.
import { dateRange, formatDate, type StockData, type StockMath } from '@app/shared';
import ExcelJS from 'exceljs';
import type { Messages } from '@/i18n/en';
import { downloadBlob } from './download';

/** First day with data up to max(last day with data, today); empty when there is no data. */
function historyRange(data: StockData, todayStr: string): string[] {
  let first: string | null = null;
  let last = todayStr;
  const see = (d: string) => {
    if (first === null || d < first) first = d;
    if (d > last) last = d;
  };
  Object.values(data.records).forEach((byDate) => Object.keys(byDate).forEach(see));
  Object.values(data.groupRecords).forEach((byDate) => Object.keys(byDate).forEach(see));
  Object.keys(data.counts).forEach(see);
  return first === null ? [] : dateRange(first, last);
}

/**
 * "Stock" sheet: one row per day, Consumption / Income / Stock columns per item.
 * "Departures" sheet when groups exist. Returns false when there is nothing to export.
 */
export async function exportExcel(
  data: StockData,
  math: StockMath,
  todayStr: string,
  t: Messages['excel'],
) {
  const { items, groups, groupRecords } = data;
  const days = historyRange(data, todayStr);
  if (items.length === 0 || days.length === 0) return false;

  const wb = new ExcelJS.Workbook();

  const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
  const itemDivider: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF64748B' } };
  const fill = (argb: string): ExcelJS.Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  });
  const headerFill = fill('FFF1F5F9');
  const consumptionFill = fill('FFEFF6FF');
  const todayFill = fill('FFE0E7FF');
  const countedFill = fill('FFFEF3C7');
  const toExcelDate = (dStr: string) => {
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!));
  };
  const styleDateCell = (cell: ExcelJS.Cell, dStr: string) => {
    cell.value = toExcelDate(dStr);
    cell.numFmt = 'yyyy-mm-dd ddd';
    cell.border = border;
    if (dStr === todayStr) cell.fill = todayFill;
    if (dStr > todayStr) cell.font = { italic: true, color: { argb: 'FF64748B' } };
  };
  const styleHeader = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };

  // --- Stock sheet ---
  const ws = wb.addWorksheet(t.stockSheet, { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  ws.getColumn(1).width = 16;
  ws.getCell(1, 1).value = t.date;
  ws.mergeCells(1, 1, 2, 1);
  styleHeader(ws.getCell(1, 1));

  items.forEach((item, k) => {
    const col = 2 + k * 3;
    ws.getCell(1, col).value = item.name || t.unnamedItem;
    ws.mergeCells(1, col, 1, col + 2);
    [t.consumption, t.income, t.stock].forEach((label, n) => {
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
      const f = math.dayFigures(item, dStr, running[k]!);
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
      [cCell, iCell, sCell].forEach((c) => {
        c.border = border;
      });
      cCell.border = { ...border, left: itemDivider };
    });
  });

  const legendRow = 3 + days.length + 1;
  t.legend.forEach((text, n) => {
    const cell = ws.getCell(legendRow + n, 1);
    cell.value = text;
    cell.font = { italic: true, color: { argb: 'FF64748B' } };
  });

  // --- Departures sheet ---
  if (groups.length > 0) {
    const ds = wb.addWorksheet(t.departuresSheet, {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    });
    ds.getColumn(1).width = 16;
    ds.getCell(1, 1).value = t.date;
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
        cell.value = groupRecords[g.id]?.[dStr]?.d ?? 0;
        cell.border = border;
      });
    });

    // Items used per departure, as set up in each group
    const setupRow = 2 + days.length + 1;
    ds.getCell(setupRow, 1).value = t.itemsPerDeparture;
    styleHeader(ds.getCell(setupRow, 1));
    groups.forEach((g, k) => {
      ds.getCell(setupRow, 2 + k).value = g.name;
      styleHeader(ds.getCell(setupRow, 2 + k));
    });
    items.forEach((item, n) => {
      const nameCell = ds.getCell(setupRow + 1 + n, 1);
      nameCell.value = item.name || t.unnamedItem;
      nameCell.border = border;
      groups.forEach((g, k) => {
        const cell = ds.getCell(setupRow + 1 + n, 2 + k);
        cell.value = item.multipliers[g.id] ?? 0;
        cell.border = border;
      });
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `stock_history_${formatDate(new Date())}.xlsx`,
  );
  return true;
}
