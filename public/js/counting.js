// Inventory count tab: each counter enters what is in their room; the totals are the sum over rooms.
// Typing only creates a draft; Save / Enter stores it through /api/count and jumps to the next item.
const { ref, computed } = Vue;

export function useCounting(store, currentDateStr) {
  const { items, locations, counts } = store;

  const newLocationName = ref('');
  const countStatus = ref({}); // { 'date|locationId|itemId': 'saving' | 'saved' | 'error' }
  const countDrafts = ref({}); // typed but not yet saved: { 'date|locationId|itemId': text }
  const countError = ref('');
  let countsInFlight = 0;

  const countKey = (dateStr, locationId, itemId) => `${dateStr}|${locationId}|${itemId}`;
  const draftKey = (locationId, itemId) => countKey(currentDateStr.value, locationId, itemId);
  const roomCount = (locationId, itemId) => counts.value[currentDateStr.value]?.[locationId]?.[itemId];

  // Saves one count (empty text = not counted). Returns true when the server stored it.
  const setRoomCount = async (locationId, itemId, raw) => {
    const dateStr = currentDateStr.value;
    const text = String(raw ?? '').trim();
    const value = text === '' ? null : Number(text.replace(',', '.'));
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      alert('Please enter a number of 0 or more.');
      return false;
    }

    const key = countKey(dateStr, locationId, itemId);
    countStatus.value[key] = 'saving';
    countsInFlight++;
    try {
      const res = await fetch('/api/count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, locationId, itemId, value })
      });
      if (res.status === 404) {
        throw new Error('The server is running an older version of the app. Restart it (npm start), then tap Retry.');
      }
      if (!res.ok) throw new Error(`The server could not save it (error ${res.status}). Tap Retry.`);
      const body = await res.json();
      counts.value[dateStr] = body.counts; // includes what other people counted meanwhile
      countStatus.value[key] = 'saved';
      countError.value = '';
      return true;
    } catch (e) {
      console.error('Failed to save count', e);
      countStatus.value[key] = 'error';
      countError.value = e instanceof TypeError
        ? "Can't reach the server. Check the Wi-Fi, then tap Retry."
        : e.message;
      return false;
    } finally {
      countsInFlight--;
    }
  };

  const countInputValue = (locationId, itemId) => {
    const key = draftKey(locationId, itemId);
    return key in countDrafts.value ? countDrafts.value[key] : (roomCount(locationId, itemId) ?? '');
  };

  const onCountInput = (locationId, itemId, text) => {
    countDrafts.value[draftKey(locationId, itemId)] = text;
  };

  // empty | draft (typed, not saved) | saving | saved | error
  const countState = (locationId, itemId) => {
    const key = draftKey(locationId, itemId);
    const status = countStatus.value[key];
    if (status === 'saving' || status === 'error') return status;
    if (key in countDrafts.value && String(countDrafts.value[key]).trim() !== String(roomCount(locationId, itemId) ?? '')) {
      return 'draft';
    }
    return roomCount(locationId, itemId) != null ? 'saved' : 'empty';
  };

  const submitCount = async (locationId, itemId, event) => {
    const key = draftKey(locationId, itemId);
    const text = key in countDrafts.value ? countDrafts.value[key] : (roomCount(locationId, itemId) ?? '');
    if (await setRoomCount(locationId, itemId, text)) {
      delete countDrafts.value[key];
      const inputs = [...document.querySelectorAll('.count-row input')];
      const row = event?.target?.closest('.count-row');
      const next = inputs[inputs.indexOf(row?.querySelector('input')) + 1];
      if (next) {
        next.focus();
        next.closest('.count-row').scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        event?.target?.blur?.();
      }
    }
  };

  const hasUnsavedCounts = () => Object.keys(countDrafts.value).some(key => {
    const [dateStr, locationId, itemId] = key.split('|');
    return String(countDrafts.value[key]).trim() !== String(counts.value[dateStr]?.[locationId]?.[itemId] ?? '');
  });

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedCounts()) { e.preventDefault(); e.returnValue = ''; }
  });

  // How many items a room has counted on the selected day
  const roomProgress = (locationId) => {
    const room = counts.value[currentDateStr.value]?.[locationId] || {};
    return items.value.filter(i => room[i.id] != null).length;
  };

  // Counts on the selected day from rooms that were removed since; they still count in the sums
  const hasRemovedRoomCounts = computed(() =>
    Object.keys(counts.value[currentDateStr.value] || {}).some(id => !locations.value.some(l => l.id === id)));

  const removedRoomsCount = (itemId) => {
    let sum = null;
    for (const [locId, room] of Object.entries(counts.value[currentDateStr.value] || {})) {
      if (!locations.value.some(l => l.id === locId) && room[itemId] != null) sum = (sum ?? 0) + Number(room[itemId]);
    }
    return sum;
  };

  // --- Rooms and the selected room, kept in the URL (#count/<locationId>) so each floor can bookmark it ---
  const activeTab = ref('stock');
  const activeLocation = ref('all');

  const readHash = () => {
    const [tab, loc] = location.hash.replace(/^#/, '').split('/');
    activeTab.value = tab === 'count' ? 'count' : 'stock';
    activeLocation.value = loc ? decodeURIComponent(loc) : 'all';
  };
  readHash();
  window.addEventListener('hashchange', readHash);

  Vue.watch([activeTab, activeLocation], () => {
    const hash = activeTab.value === 'count'
      ? '#count' + (activeLocation.value !== 'all' ? '/' + encodeURIComponent(activeLocation.value) : '')
      : '';
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
  });

  const activeRoom = computed(() => locations.value.find(l => l.id === activeLocation.value) || null);

  const addLocation = () => {
    const name = newLocationName.value.trim();
    if (!name) return;
    const id = 'l_' + Date.now();
    locations.value.push({ id, name });
    newLocationName.value = '';
    activeLocation.value = id;
    store.saveData();
  };

  const removeLocation = (id) => {
    if (confirm('Remove this room? Counts already entered for it stay in the stock totals.')) {
      locations.value = locations.value.filter(l => l.id !== id);
      if (activeLocation.value === id) activeLocation.value = 'all';
      store.saveData();
    }
  };

  const isCountBusy = () => countsInFlight > 0;

  return {
    newLocationName, countError, activeTab, activeLocation, activeRoom,
    roomCount, setRoomCount, countInputValue, onCountInput, countState, submitCount,
    roomProgress, hasRemovedRoomCounts, removedRoomsCount, addLocation, removeLocation, isCountBusy
  };
}
