// Entry point: wires the modules together and exposes them to the template in index.html.
import { formatDate, addDays } from './dates.js';
import { createStore } from './store.js';
import { createStockMath } from './stock.js';
import { useCounting } from './counting.js';
import { useBackup } from './backup.js';
import { exportExcel as buildExcel } from './excel.js';
import { useTheme } from './theme.js';

const { createApp, ref, computed, watch, nextTick, onMounted } = Vue;

createApp({
  setup() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDateObj = addDays(today, -30);
    const maxDateObj = addDays(today, 7);

    const store = createStore();
    const { items, records, groups, groupRecords, locations, getRecord, saveData } = store;
    const math = createStockMath(store.state, { minDateStr: formatDate(minDateObj) });

    // --- Selected date ---
    const currentDate = ref(new Date(today));
    const currentDateStr = computed(() => formatDate(currentDate.value));
    const formattedDate = computed(() =>
      currentDate.value.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }));
    const isMinDate = computed(() => currentDate.value.getTime() <= minDateObj.getTime());
    const isMaxDate = computed(() => currentDate.value.getTime() >= maxDateObj.getTime());
    const prevDay = () => { if (!isMinDate.value) currentDate.value = addDays(currentDate.value, -1); };
    const nextDay = () => { if (!isMaxDate.value) currentDate.value = addDays(currentDate.value, 1); };
    const goToToday = () => { currentDate.value = new Date(today); };
    const goToDate = (date) => {
      if (date.getTime() >= minDateObj.getTime() && date.getTime() <= maxDateObj.getTime()) currentDate.value = new Date(date);
    };

    // Overview: every day you can navigate to (today −30 … +7), scrolled sideways
    const overviewDays = Array.from({ length: 38 }, (_, n) => {
      const d = addDays(minDateObj, n);
      return {
        date: d,
        str: formatDate(d),
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        isToday: d.getTime() === today.getTime()
      };
    });

    // Keep the selected day in view, centred between earlier and later days
    const overviewScroll = ref(null);
    const scrollOverviewToSelected = (smooth) => {
      const wrap = overviewScroll.value;
      const cell = wrap?.querySelector(`[data-day="${currentDateStr.value}"]`);
      if (!wrap || !cell) return;
      const nameWidth = wrap.querySelector('.week-name')?.offsetWidth || 0;
      const left = cell.offsetLeft - nameWidth - (wrap.clientWidth - nameWidth - cell.offsetWidth) / 2;
      wrap.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
    };
    watch(currentDateStr, () => nextTick(() => scrollOverviewToSelected(true)));
    watch(() => items.value.length, (n, old) => { if (!old) nextTick(() => scrollOverviewToSelected(false)); });

    // --- Stock tab ---
    const selectedGroup = ref(null);
    const newItemName = ref('');
    const newGroupName = ref('');

    const isManualTotal = (itemId, dateStr) =>
      records.value[itemId]?.[dateStr]?.m != null || math.roomSum(itemId, dateStr) != null;

    // "2/3 rooms" info for the Total Stock cell; null when the total doesn't come from room counts
    const roomStatus = (itemId, dateStr) => {
      if (records.value[itemId]?.[dateStr]?.m != null || math.roomSum(itemId, dateStr) == null) return null;
      const counted = locations.value.filter(l => store.counts.value[dateStr]?.[l.id]?.[itemId] != null);
      return {
        label: `${counted.length}/${locations.value.length} rooms`,
        title: 'Counted in: ' + (counted.map(l => l.name).join(', ') || 'removed rooms')
      };
    };

    const setOverride = (field) => (itemId, dateStr, val) => {
      const num = parseFloat(val);
      getRecord(itemId, dateStr)[field] = isNaN(num) ? null : num;
      saveData();
    };
    const clearOverride = (field) => (itemId, dateStr) => {
      getRecord(itemId, dateStr)[field] = null;
      saveData();
    };

    const addGroup = () => {
      const id = 'g_' + Date.now();
      groups.value.push({ id, name: newGroupName.value.trim() || 'New Group' });
      groupRecords.value[id] = {};
      newGroupName.value = '';
      saveData();
    };

    const removeGroup = (id) => {
      if (confirm('Are you sure you want to remove this group?')) {
        groups.value = groups.value.filter(g => g.id !== id);
        delete groupRecords.value[id];
        items.value.forEach(item => { if (item.multipliers) delete item.multipliers[id]; });
        saveData();
      }
    };

    const addItem = () => {
      const name = newItemName.value.trim();
      if (!name) return;
      const id = Date.now().toString();
      items.value.push({ id, name, multipliers: {} });
      records.value[id] = {};
      newItemName.value = '';
      saveData();
    };

    const removeItem = (id) => {
      if (confirm('Are you sure you want to remove this item and all its history?')) {
        items.value = items.value.filter(i => i.id !== id);
        delete records.value[id];
        saveData();
      }
    };

    // --- Toolbar ---
    const exporting = ref(false);
    const exportExcel = async () => {
      exporting.value = true;
      try {
        await buildExcel(store.state, math, formatDate(today));
      } catch (e) {
        console.error('Excel export failed', e);
        alert('Excel export failed: ' + e.message);
      } finally {
        exporting.value = false;
      }
    };

    const counting = useCounting(store, currentDateStr);
    const backup = useBackup(store);
    const { theme, cycleTheme } = useTheme();

    onMounted(() => {
      store.loadData();
      store.startPolling(() => {
        const active = document.activeElement;
        const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        return typing || counting.isCountBusy() || selectedGroup.value !== null;
      });
    });

    return {
      // state
      items, groups, locations, fileHandle: store.fileHandle,
      getRecord, getGroupRecord: store.getGroupRecord, saveData,
      // dates
      currentDateStr, formattedDate, isMinDate, isMaxDate, prevDay, nextDay, goToToday, goToDate, overviewDays, overviewScroll,
      // stock tab
      calculateTotal: math.calculateTotal, calculateAutoConsumption: math.calculateAutoConsumption,
      roomSum: math.roomSum, hasActivity: math.hasActivity, isManualTotal, roomStatus,
      updateManualTotal: setOverride('m'), clearManualTotal: clearOverride('m'),
      updateManualConsumption: setOverride('mc'), clearManualConsumption: clearOverride('mc'),
      selectedGroup, newItemName, newGroupName, addGroup, removeGroup, addItem, removeItem,
      // toolbar
      exportExcel, exporting, ...backup, theme, cycleTheme,
      // inventory count tab
      ...counting
    };
  }
}).mount('#app');
