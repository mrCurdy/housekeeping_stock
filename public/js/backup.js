// Backup (download JSON), Restore (upload JSON) and Auto-save (keep a local file in sync, Chromium only)
import { formatDate } from './dates.js';
import { downloadBlob } from './excel.js';

export function useBackup(store) {
  const { items, groups, fileHandle } = store;
  const fileInput = Vue.ref(null);
  const supportsFileSystemAccess = 'showOpenFilePicker' in window;

  const exportData = () => {
    if (items.value.length === 0 && groups.value.length === 0) return alert('No data to back up yet!');
    downloadBlob(new Blob([store.serializeData()], { type: 'application/json' }), `stock_backup_${formatDate(new Date())}.json`);
  };

  const triggerImport = () => fileInput.value?.click();

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.items) || !parsed.records || typeof parsed.records !== 'object') {
          alert('This file is not a Stock Monitor backup.');
        } else if (confirm(
          `Restore from "${file.name}"?\n\n` +
          `It contains ${parsed.items.length} items, ${(parsed.groups || []).length} groups ` +
          `and ${(parsed.locations || []).length} rooms.\n` +
          `This replaces ALL current data, including room counts.`
        )) {
          store.applyData(parsed);
          store.persistData({ restore: true });
          alert('Backup restored.');
        }
      } catch (err) {
        alert('Could not read the file: it is not a valid backup.');
      }
      event.target.value = ''; // allow picking the same file again
    };
    reader.readAsText(file);
  };

  const connectLocalFile = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON Backup Files', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      fileHandle.value = handle;

      const contents = await (await handle.getFile()).text();
      if (contents.trim().length > 0) {
        const parsed = JSON.parse(contents);
        // Room counts stay as they are on the server; they change only through /api/count
        if (parsed.items) store.applyData(parsed, { withCounts: false });
      }
      await store.persistData();
    } catch (e) {
      console.error('File connection cancelled', e);
    }
  };

  return { fileInput, supportsFileSystemAccess, exportData, triggerImport, handleImport, connectLocalFile };
}
