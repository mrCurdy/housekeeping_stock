const { createApp, ref, computed, watch, onMounted } = Vue;

    createApp({
      setup() {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const minDateObj = new Date(today);
        minDateObj.setDate(today.getDate() - 30);
        
        const maxDateObj = new Date(today);
        maxDateObj.setDate(today.getDate() + 7);

        const currentDate = ref(new Date(today));
        
        const items = ref([]);
        const records = ref({}); // { itemId: { dateStr: { c: 0, i: 0, m: null } } }
        const groups = ref([]); // { id, name }
        const groupRecords = ref({}); // { groupId: { dateStr: { d: 0 } } }
        
        const selectedGroup = ref(null);
        const newItemName = ref('');
        const newGroupName = ref('');
        const fileInput = ref(null);
        
        const supportsFileSystemAccess = 'showOpenFilePicker' in window;
        const fileHandle = ref(null);

        const formatDate = (date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };

        const currentDateStr = computed(() => formatDate(currentDate.value));
        const formattedDate = computed(() => {
          return currentDate.value.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        });

        const isMinDate = computed(() => currentDate.value.getTime() <= minDateObj.getTime());
        const isMaxDate = computed(() => currentDate.value.getTime() >= maxDateObj.getTime());
        
        const maxRows = computed(() => Math.max(groups.value.length, items.value.length));

        const loadData = async () => {
          try {
            const res = await fetch('/api/data');
            if (res.ok) {
              const parsed = await res.json();
              items.value = (parsed.items || []).map(i => ({ ...i, multipliers: i.multipliers || {} }));
              records.value = parsed.records || {};
              groups.value = parsed.groups || [];
              groupRecords.value = parsed.groupRecords || {};
            } else {
              loadLocalData();
            }
          } catch (e) {
            console.error("Failed to load from server", e);
            loadLocalData();
          }
        };

        const loadLocalData = () => {
          try {
            const saved = localStorage.getItem('stockMonitorData');
            if (saved) {
              const parsed = JSON.parse(saved);
              items.value = (parsed.items || []).map(i => ({
                ...i,
                multipliers: i.multipliers || {}
              }));
              records.value = parsed.records || {};
              groups.value = parsed.groups || [];
              groupRecords.value = parsed.groupRecords || {};
            }
          } catch (e) {
            console.error("Failed to load local data", e);
          }
        };

        const saveData = async () => {
          const dataObj = {
            items: items.value,
            records: records.value,
            groups: groups.value,
            groupRecords: groupRecords.value
          };
          const dataStr = JSON.stringify(dataObj);

          try {
            await fetch('/api/data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: dataStr
            });
          } catch (e) {
            console.error("Failed to save to server", e);
          }

          try {
            localStorage.setItem('stockMonitorData', dataStr);
            if (fileHandle.value) {
              const writable = await fileHandle.value.createWritable();
              await writable.write(dataStr);
              await writable.close();
            }
          } catch (e) {
            console.error("Failed to save local data", e);
            if (e.name === 'NotAllowedError') {
              alert("Permission to save to the file was revoked or denied.");
              fileHandle.value = null;
            }
          }
        };

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

        const calculateAutoConsumption = (item, dateStr) => {
          if (!item.multipliers) return 0;
          let totalAuto = 0;
          groups.value.forEach(g => {
            const qty = Number(item.multipliers[g.id]) || 0;
            if (qty > 0) {
              const gRec = groupRecords.value[g.id]?.[dateStr];
              const deps = Number(gRec?.d) || 0;
              totalAuto += qty * deps;
            }
          });
          return totalAuto;
        };

        const calculateTotal = (itemId, targetDateStr) => {
          const item = items.value.find(i => i.id === itemId);
          if (!item) return 0;

          // Find absolute earliest date from both records and groupRecords to ensure accurate totals
          let earliest = formatDate(minDateObj);
          for (const iId in records.value) {
            for (const d in records.value[iId]) { if (d < earliest) earliest = d; }
          }
          for (const gId in groupRecords.value) {
            for (const d in groupRecords.value[gId]) { if (d < earliest) earliest = d; }
          }
          
          const parseDateLocal = (dateStr) => {
            const [y, m, d] = dateStr.split('-');
            return new Date(y, m - 1, d, 0, 0, 0);
          };

          let total = 0;
          let curr = parseDateLocal(earliest);
          const target = parseDateLocal(targetDateStr);

          while (curr <= target) {
            const dStr = formatDate(curr);
            const rec = records.value[itemId]?.[dStr];
            
            if (rec && rec.m !== null && rec.m !== undefined) {
              total = rec.m;
            } else {
              const autoC = calculateAutoConsumption(item, dStr);
              
              let actualC = autoC;
              if (rec && rec.mc !== null && rec.mc !== undefined) {
                actualC = Number(rec.mc);
              } else if (rec && rec.c) {
                actualC = autoC + (Number(rec.c) || 0);
              }
              
              const income = Number(rec?.i) || 0;
              total = total + income - actualC;
            }
            curr.setDate(curr.getDate() + 1);
          }
          return total;
        };

        const updateManualTotal = (itemId, dateStr, val) => {
          const num = parseFloat(val);
          const rec = getRecord(itemId, dateStr);
          if (!isNaN(num)) {
            rec.m = num;
          } else {
            rec.m = null;
          }
          saveData();
        };

        const clearManualTotal = (itemId, dateStr) => {
          const rec = getRecord(itemId, dateStr);
          rec.m = null;
          saveData();
        };

        const updateManualConsumption = (itemId, dateStr, val) => {
          const num = parseFloat(val);
          const rec = getRecord(itemId, dateStr);
          if (!isNaN(num)) {
            rec.mc = num;
          } else {
            rec.mc = null;
          }
          saveData();
        };

        const clearManualConsumption = (itemId, dateStr) => {
          const rec = getRecord(itemId, dateStr);
          rec.mc = null;
          saveData();
        };

        const prevDay = () => {
          if (!isMinDate.value) {
            const d = new Date(currentDate.value);
            d.setDate(d.getDate() - 1);
            currentDate.value = d;
          }
        };

        const nextDay = () => {
          if (!isMaxDate.value) {
            const d = new Date(currentDate.value);
            d.setDate(d.getDate() + 1);
            currentDate.value = d;
          }
        };

        const goToToday = () => {
          currentDate.value = new Date(today);
        };

        const addGroup = () => {
          const name = newGroupName.value.trim() || 'New Group';
          const id = 'g_' + Date.now();
          groups.value.push({ id, name });
          groupRecords.value[id] = {};
          newGroupName.value = '';
          saveData();
        };

        const removeGroup = (id) => {
          if (confirm('Are you sure you want to remove this group?')) {
            groups.value = groups.value.filter(g => g.id !== id);
            delete groupRecords.value[id];
            items.value.forEach(item => {
              if (item.multipliers) delete item.multipliers[id];
            });
            saveData();
          }
        };

        const addItem = () => {
          if (newItemName.value.trim()) {
            const id = Date.now().toString();
            items.value.push({ id, name: newItemName.value.trim(), multipliers: {} });
            records.value[id] = {};
            newItemName.value = '';
            saveData();
          }
        };

        const removeItem = (id) => {
          if (confirm('Are you sure you want to remove this item and all its history?')) {
            items.value = items.value.filter(i => i.id !== id);
            delete records.value[id];
            saveData();
          }
        };

        const exportData = () => {
          const dataStr = localStorage.getItem('stockMonitorData');
          if (!dataStr) return alert("No data to export yet!");
          const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
          const exportFileDefaultName = `stock_backup_${formatDate(new Date())}.json`;

          const linkElement = document.createElement('a');
          linkElement.setAttribute('href', dataUri);
          linkElement.setAttribute('download', exportFileDefaultName);
          linkElement.click();
        };

        const exportCSV = () => {
          if (items.value.length === 0) return alert("No data to export!");
          
          let csvContent = "Date,Stock Name,Auto Consump (From Groups),Extra Consump,Total Consump,Income,Total Stock\n";
          
          items.value.forEach(item => {
            const itemRecords = records.value[item.id] || {};
            
            // Collect all dates that have activity for this item OR group departures
            const datesSet = new Set(Object.keys(itemRecords));
            for (const gId in groupRecords.value) {
              for (const dStr in groupRecords.value[gId]) {
                if (Number(groupRecords.value[gId][dStr].d) > 0 && Number(item.multipliers?.[gId]) > 0) {
                  datesSet.add(dStr);
                }
              }
            }
            
            const dates = Array.from(datesSet).sort();
            
            dates.forEach(dStr => {
              const rec = itemRecords[dStr] || {};
              const autoC = calculateAutoConsumption(item, dStr);
              
              if (rec.c || rec.mc !== null || rec.i || rec.m !== null || autoC > 0) {
                let actualC = autoC;
                if (rec.mc !== null && rec.mc !== undefined) {
                  actualC = Number(rec.mc);
                } else if (rec.c) {
                  actualC = autoC + (Number(rec.c) || 0);
                }
                
                const totalStock = calculateTotal(item.id, dStr);
                const safeName = item.name.replace(/"/g, '""');
                csvContent += `${dStr},"${safeName}",${autoC},${rec.c || 0},${actualC},${rec.i || 0},${totalStock}\n`;
              }
            });
          });

          const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
          const exportFileDefaultName = `stock_history_${formatDate(new Date())}.csv`;

          const linkElement = document.createElement('a');
          linkElement.setAttribute('href', dataUri);
          linkElement.setAttribute('download', exportFileDefaultName);
          linkElement.click();
        };

        const triggerImport = () => {
          if (fileInput.value) {
            fileInput.value.click();
          }
        };

        const handleImport = (event) => {
          const file = event.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const content = e.target.result;
              const parsed = JSON.parse(content);
              if (parsed.items && parsed.records) {
                localStorage.setItem('stockMonitorData', content);
                items.value = parsed.items;
                records.value = parsed.records;
                alert("Data imported successfully!");
              } else {
                alert("Invalid backup file format.");
              }
            } catch (err) {
              alert("Error reading file.");
            }
            event.target.value = ''; // Reset input
          };
          reader.readAsText(file);
        };

        const connectLocalFile = async () => {
          try {
            const [handle] = await window.showOpenFilePicker({
              types: [{
                description: 'JSON Backup Files',
                accept: { 'application/json': ['.json'] },
              }],
              multiple: false
            });
            fileHandle.value = handle;
            
            // Read the file and update the app
            const file = await handle.getFile();
            const contents = await file.text();
            if (contents.trim().length > 0) {
              const parsed = JSON.parse(contents);
              if (parsed.items) {
                items.value = parsed.items.map(i => ({ ...i, multipliers: i.multipliers || {} }));
              }
              if (parsed.records) records.value = parsed.records;
              if (parsed.groups) groups.value = parsed.groups;
              if (parsed.groupRecords) groupRecords.value = parsed.groupRecords;
            }
            // Trigger a save immediately to ensure sync
            await saveData();
            
          } catch (e) {
            console.error("File connection cancelled", e);
          }
        };

        onMounted(() => {
          loadData();
        });

        return {
          currentDateStr,
          formattedDate,
          isMinDate,
          isMaxDate,
          items,
          newItemName,
          newGroupName,
          prevDay,
          nextDay,
          goToToday,
          addItem,
          removeItem,
          getRecord,
          getGroupRecord,
          calculateAutoConsumption,
          calculateTotal,
          updateManualTotal,
          clearManualTotal,
          updateManualConsumption,
          clearManualConsumption,
          saveData,
          fileInput,
          exportData,
          exportCSV,
          triggerImport,
          handleImport,
          supportsFileSystemAccess,
          fileHandle,
          connectLocalFile,
          groups,
          addGroup,
          removeGroup,
          selectedGroup,
          maxRows
        };
      }
    }).mount('#app');
