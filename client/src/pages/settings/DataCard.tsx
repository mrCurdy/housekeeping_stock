import { backupSchema, formatDate } from '@app/shared';
import { Database, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useSelectedDate } from '@/context/DateContext';
import { useI18n } from '@/context/I18nContext';
import { useStock } from '@/context/StockContext';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/api';
import { backupCounts, hasData } from '@/lib/backup';
import { downloadBlob } from '@/lib/download';
import { hasExcelData } from '@/lib/excelRows';

/** Settings card: Excel history, Backup (JSON download) and Restore (JSON upload, `can('restore')`). */
export function DataCard() {
  const { data, rawData, math } = useStock();
  const { today, minDate } = useSelectedDate();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const canRestore = useAuth().can('restore');
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    if (!hasExcelData(data)) return toast.info(t.data.noData);
    setExporting(true);
    try {
      const { exportExcel } = await import('@/lib/excel');
      if (!(await exportExcel(data, math, { from: minDate, today }, t.excel))) {
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
    if (!hasData(rawData)) return toast.info(t.data.noBackupData);
    downloadBlob(
      new Blob([JSON.stringify(rawData, null, 2)], { type: 'application/json' }),
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
    const ok = await confirm({
      title: t.data.restoreTitle,
      description: t.data.restoreDescription(file.name, backupCounts(parsed.data)),
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-fg-muted" />
          {t.data.title}
        </CardTitle>
        <CardDescription>{t.data.description}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={exportExcel}
          loading={exporting}
          leftIcon={<FileSpreadsheet className="h-4 w-4" />}
        >
          {t.data.excel}
        </Button>
        <Button variant="outline" onClick={backup} leftIcon={<Download className="h-4 w-4" />}>
          {t.data.backup}
        </Button>
        {canRestore && (
          <>
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              {t.data.restore}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              data-testid="restore-file"
              onChange={onFile}
            />
          </>
        )}
      </CardBody>
    </Card>
  );
}
