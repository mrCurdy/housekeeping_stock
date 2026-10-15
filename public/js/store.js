// App state, loading and saving.
//
// Everything except room counts is saved as one document (POST /api/data): debounced, because
// inputs save on every keystroke, and chained, so requests can't reach the server out of order.
// Room counts are saved one by one through /api/count (see counting.js) because several people
// count at the same time.
const { ref } = Vue;

const isBlank = (v) => v === '' || v === null || v === undefined;
export const isEmptyRecord = (r) => isBlank(r.c) && isBlank(r.i) && isBlank(r.m) && isBlank(r.mc);
export const isEmptyGroupRecord = (r) => isBlank(r.d);

// The template binds inputs to placeholder records (see getRecord), so leave the blank ones out when saving
const pruneEmpty = (byId, isEmpty) => {
  const out = {};
  for (const id in byId) {
    out[id] = {};
    for (const d in byId[id]) {
      if (!isEmpty(byId[id][d])) out[id][d] = byId[id][d];
    }
  }
  return out;
};

export function createStore() {
  const items = ref([]);          // [{ id, name, multipliers: { groupId: qtyPerDeparture } }]
  const records = ref({});        // { itemId: { date: { c, i, m, mc } } }
  const groups = ref([]);         // [{ id, name }]
  const groupRecords = ref({});   // { groupId: { date: { d } } }
  const locations = ref([]);      // rooms where stock is counted: [{ id, name }]
  const counts = ref({});         // { date: { locationId: { itemId: number } } }
  const fileHandle = ref(null);   // auto-save file (File System Access API)

  // Plain view of the state for the stock rules (stock.js)
  const state = {
    get items() { return items.value; },
    get records() { return records.value; },
    get groups() { return groups.value; },
    get groupRecords() { return groupRecords.value; },
    get counts() { return counts.value; },
  };

  const applyData = (parsed, { withCounts = true } = {}) => {
    items.value = (parsed.items || []).map(i => ({ ...i, multipliers: i.multipliers || {} }));
    records.value = parsed.records || {};
    groups.value = parsed.groups || [];
    groupRecords.value = parsed.groupRecords || {};
    locations.value = parsed.locations || [];
    if (withCounts) counts.value = parsed.counts || {};
  };

  const loadLocalData = () => {
    try {
      const saved = localStorage.getItem('stockMonitorData');
      if (saved) applyData(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to load local data', e);
    }
  };

  const loadData = async () => {
    try {
      const res = await fetch('/api/data');
      if (res.ok) applyData(await res.json()); else loadLocalData();
    } catch (e) {
      console.error('Failed to load from server', e);
      loadLocalData();
    }
  };

  // Pretty-printed so backup and auto-save files stay readable.
  // Includes counts for backups; the server ignores them on normal saves.
  const serializeData = () => JSON.stringify({
    items: items.value,
    records: pruneEmpty(records.value, isEmptyRecord),
    groups: groups.value,
    groupRecords: pruneEmpty(groupRecords.value, isEmptyGroupRecord),
    locations: locations.value,
    counts: counts.value
  }, null, 2);

  let saveTimer = null;
  let saveChain = Promise.resolve();
  let writesInFlight = 0;

  const writeData = async (dataStr, restore) => {
    try {
      const res = await fetch(restore ? '/api/data?restore=1' : '/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: dataStr
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      console.error('Failed to save to server', e);
    }

    try {
      localStorage.setItem('stockMonitorData', dataStr);
      if (fileHandle.value) {
        const writable = await fileHandle.value.createWritable();
        await writable.write(dataStr);
        await writable.close();
      }
    } catch (e) {
      console.error('Failed to save local data', e);
      if (e.name === 'NotAllowedError') {
        alert('Permission to save to the file was revoked or denied.');
        fileHandle.value = null;
      }
    }
  };

  // restore = true also replaces the room counts on the server (backup restore)
  const persistData = ({ restore = false } = {}) => {
    clearTimeout(saveTimer);
    saveTimer = null;
    const dataStr = serializeData();
    writesInFlight++;
    saveChain = saveChain.then(() => writeData(dataStr, restore)).finally(() => { writesInFlight--; });
    return saveChain;
  };

  const saveData = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistData, 400);
  };

  const isSaving = () => saveTimer !== null || writesInFlight > 0;

  // Don't lose a pending debounced save when the tab is closed
  window.addEventListener('pagehide', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      const dataStr = serializeData();
      navigator.sendBeacon('/api/data', new Blob([dataStr], { type: 'application/json' }));
      try { localStorage.setItem('stockMonitorData', dataStr); } catch (e) { /* ignore */ }
    }
  });

  // Pick up changes made on other phones / computers, unless that could overwrite local work
  const startPolling = (isBusy) => {
    const refresh = async () => {
      if (isSaving() || isBusy()) return;
      try {
        const res = await fetch('/api/data');
        if (!res.ok) return;
        const parsed = await res.json();
        if (isSaving() || isBusy()) return; // something started while the request was running
        applyData(parsed);
      } catch (e) {
        // Offline: keep what we have
      }
    };
    setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
  };

  // Placeholder records let the template bind v-model before anything was entered for that day
  const getRecord = (itemId, dateStr) => {
    if (!records.value[itemId]) records.value[itemId] = {};
    if (!records.value[itemId][dateStr]) {
      records.value[itemId][dateStr] = { c: '', i: '', m: null, mc: null };
    }
    return records.value[itemId][dateStr];
  };

  const getGroupRecord = (groupId, dateStr) => {
    if (!groupRecords.value[groupId]) groupRecords.value[groupId] = {};
    if (!groupRecords.value[groupId][dateStr]) {
      groupRecords.value[groupId][dateStr] = { d: '' };
    }
    return groupRecords.value[groupId][dateStr];
  };

  return {
    items, records, groups, groupRecords, locations, counts, fileHandle, state,
    applyData, loadData, serializeData, saveData, persistData, startPolling,
    getRecord, getGroupRecord
  };
}
