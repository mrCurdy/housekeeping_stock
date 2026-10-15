// Dates are local-time 'YYYY-MM-DD' strings, so plain string comparison sorts them correctly.

export const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseDateLocal = (dateStr) => {
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d, 0, 0, 0);
};

export const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};
