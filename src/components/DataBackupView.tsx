import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import type { BackupPayload, Category, DateFilterPreset, Expense } from '../types/expense';
import { apiRequest } from '../utils/api';
import {
  DATE_PRESET_OPTIONS,
  filterExpensesByRange,
  formatDateDDMMYYYY,
  formatINR,
  getDateRangeForPreset,
  sumExpenses,
} from '../utils/format';
import {
  exportExpensesToCSV,
  exportExpensesToExcel,
  exportExpensesToPDF,
} from '../utils/exportUtils';
import { ConfirmDialog } from './ConfirmDialog';

interface DataBackupViewProps {
  expenses: Expense[];
  categories: Category[];
  userName: string;
  onRestored: () => Promise<void>;
}

export function DataBackupView({
  expenses,
  categories,
  userName,
  onRestored,
}: DataBackupViewProps) {
  const [exportPreset, setExportPreset] = useState<DateFilterPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [backupLoading, setBackupLoading] = useState(false);
  const [restorePreview, setRestorePreview] = useState<BackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const dateRange = useMemo(
    () => getDateRangeForPreset(exportPreset, customStart, customEnd),
    [exportPreset, customStart, customEnd]
  );

  const exportExpenses = useMemo(
    () => filterExpensesByRange(expenses, dateRange.start, dateRange.end),
    [expenses, dateRange]
  );

  const exportTotal = useMemo(() => sumExpenses(exportExpenses), [exportExpenses]);

  async function handleDownloadBackup() {
    setRestoreError('');
    setBackupLoading(true);
    try {
      const backup = await apiRequest<BackupPayload>('/api/backup');
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `my-expense-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Unable to generate backup.');
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    setRestoreError('');
    setRestoreSuccess('');
    setRestorePreview(null);

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.categories) ||
        !Array.isArray(parsed.expenses)
      ) {
        setRestoreError('Invalid backup file. Expected categories and expenses arrays.');
        return;
      }
      setRestorePreview(parsed);
    } catch {
      setRestoreError('Unable to parse JSON file. Please select a valid backup file.');
    }
  }

  async function executeRestore() {
    if (!restorePreview) return;
    setRestoring(true);
    setRestoreError('');
    setRestoreSuccess('');
    try {
      const result = await apiRequest<{
        ok: boolean;
        importedExpenses: number;
        categoriesCount: number;
      }>('/api/restore', {
        method: 'POST',
        body: JSON.stringify({
          mode: restoreMode,
          backup: restorePreview,
        }),
      });
      await onRestored();
      setRestoreSuccess(
        `Restore complete: ${result.importedExpenses} transactions and ${result.categoriesCount} categories active.`
      );
      setRestorePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
      setConfirmReplaceOpen(false);
    }
  }

  function handleRestoreSubmit() {
    if (!restorePreview) return;
    if (restoreMode === 'replace') {
      setConfirmReplaceOpen(true);
    } else {
      void executeRestore();
    }
  }

  return (
    <div className="space-y-6">
      {/* Export Reports Section */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Export Financial Reports
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Download formatted reports with DD-MM-YYYY dates, category breakdowns, and Indian Rupee (₹) totals.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="export-period"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Report Period
            </label>
            <select
              id="export-period"
              value={exportPreset}
              onChange={(e) => setExportPreset(e.target.value as DateFilterPreset)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {DATE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {exportPreset === 'custom' && (
            <>
              <div>
                <label
                  htmlFor="exp-custom-start"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  Start Date {customStart ? `(${formatDateDDMMYYYY(customStart)})` : ''}
                </label>
                <input
                  id="exp-custom-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="exp-custom-end"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  End Date {customEnd ? `(${formatDateDDMMYYYY(customEnd)})` : ''}
                </label>
                <input
                  id="exp-custom-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </>
          )}
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          Selected range ({dateRange.label}):{' '}
          <span className="font-semibold text-slate-900 dark:text-white">
            {exportExpenses.length} transactions
          </span>{' '}
          totalling{' '}
          <span className="font-semibold text-slate-900 dark:text-white font-mono-num">
            {formatINR(exportTotal, true)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            disabled={exportExpenses.length === 0}
            onClick={() =>
              exportExpensesToPDF(
                exportExpenses,
                categoryMap,
                dateRange.label,
                userName,
                `expense-report-${exportPreset}`
              )
            }
            className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-teal-600 dark:hover:border-teal-500 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <FileText className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Export PDF Report</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Printable A4 summary with category totals and transaction ledger.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={exportExpenses.length === 0}
            onClick={() =>
              exportExpensesToExcel(
                exportExpenses,
                categoryMap,
                dateRange.label,
                `expense-report-${exportPreset}`
              )
            }
            className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-teal-600 dark:hover:border-teal-500 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Export Excel (.xlsx)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Multi-sheet Excel workbook with Transactions and Category Summary tabs.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={exportExpenses.length === 0}
            onClick={() =>
              exportExpensesToCSV(
                exportExpenses,
                categoryMap,
                `expense-report-${exportPreset}`
              )
            }
            className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-teal-600 dark:hover:border-teal-500 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Export CSV File</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                UTF-8 CSV spreadsheet compatible with Excel, Numbers, and Google Sheets.
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* Backup & Restore Section */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Backup Account Data
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Download a full JSON snapshot of your monthly budget, all custom and default categories, category budgets, and every transaction.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={backupLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{backupLoading ? 'Preparing Backup...' : 'Download JSON Backup'}</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Restore from Backup
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Upload a previously exported JSON backup file to merge records or replace your current ledger.
            </p>
          </div>

          {restoreError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
            >
              {restoreError}
            </div>
          )}

          {restoreSuccess && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300"
            >
              {restoreSuccess}
            </div>
          )}

          <div>
            <label
              htmlFor="restore-json-file"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Choose Backup JSON File</span>
            </label>
            <input
              ref={fileInputRef}
              id="restore-json-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="sr-only"
            />
          </div>

          {restorePreview && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1 tabular-nums">
                <p className="font-semibold text-slate-900 dark:text-white">Backup Ready to Restore</p>
                <p>
                  Categories: {restorePreview.categories.length} · Transactions:{' '}
                  {restorePreview.expenses.length}
                </p>
                {restorePreview.exportedAt && (
                  <p className="text-slate-500 dark:text-slate-400">
                    Exported: {formatDateDDMMYYYY(restorePreview.exportedAt.slice(0, 10))}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                  />
                  <span>Merge with existing categories and transactions</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                  />
                  <span>Replace all existing data with this backup</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleRestoreSubmit}
                disabled={restoring}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white disabled:opacity-60"
              >
                {restoring ? 'Restoring...' : 'Apply Restore'}
              </button>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmReplaceOpen}
        title="Replace Existing Expense Data?"
        description="This will permanently delete your current categories and transactions before restoring the backup file. This action cannot be undone."
        confirmLabel="Replace & Restore"
        loading={restoring}
        onConfirm={() => void executeRestore()}
        onCancel={() => setConfirmReplaceOpen(false)}
      />
    </div>
  );
}
