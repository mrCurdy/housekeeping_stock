import { backupSchema, formatDate } from '@app/shared';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Tooltip } from '@/components/ui';
import { useConfirm } from '@/context/ConfirmContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/api';
import { downloadBlob } from '@/lib/download';

/** Header toolbar: Excel history, Backup (JSON download) and Restore (JSON upload). */
export function DataMenu() {
  const { data, math } = useStock();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    if (data.items.length === 0) return toast.info(t.data.noData);
    setExporting(true);
    try {
      const { exportExcel } = await import('@/lib/excel');
      if (!(await exportExcel(data, math, formatDate(new Date()), t.excel))) {
        toast.info(t.data.noHistory);
      }
    } catch (err) {
      console.error('Excel export failed', err);
      toast.error(t.data.exportFailed, apiErrorMessage(err, t));
    } finally {
      setExporting(false);
    }
  };

  const backup = () => {
    if (data.items.length === 0 && data.groups.length === 0 && data.tasks.length === 0) {
      return toast.info(t.data.noBackupData);
    }
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `stock_backup_${formatDate(new Date())}.json`,
    );
  };

  const { restore } = useStock();
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    let parsed;
    try {
      parsed = backupSchema.safeParse(JSON.parse(await file.text()));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) return toast.error(t.data.notBackup, t.data.notBackupFile(file.name));
    const { items, groups, locations } = parsed.data;
    const ok = await confirm({
      title: t.data.restoreTitle,
      description: t.data.restoreDescription(
        file.name,
        items.length,
        groups.length,
        locations.length,
      ),
      confirmLabel: t.data.restore,
    });
    if (!ok) return;
    try {
      await restore(parsed.data);
      toast.success(t.data.restored);
    } catch (err) {
      toast.error(t.data.restoreFailed, apiErrorMessage(err, t));
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip content={t.data.excelHint} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          onClick={exportExcel}
          loading={exporting}
          leftIcon={<FileSpreadsheet className="h-4 w-4" />}
        >
          <span className="hidden lg:inline">{t.data.excel}</span>
        </Button>
      </Tooltip>
      <Tooltip content={t.data.backupHint} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          onClick={backup}
          leftIcon={<Download className="h-4 w-4" />}
        >
          <span className="hidden lg:inline">{t.data.backup}</span>
        </Button>
      </Tooltip>
      <Tooltip content={t.data.restoreHint} side="bottom" align="end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInput.current?.click()}
          leftIcon={<Upload className="h-4 w-4" />}
        >
          <span className="hidden lg:inline">{t.data.restore}</span>
        </Button>
      </Tooltip>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
