import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  PAYMENT_METHODS,
  type Category,
  type DateFilterPreset,
  type Expense,
} from '../types/expense';
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

interface TransactionsViewProps {
  expenses: Expense[];
  categories: Category[];
  userName: string;
  initialCategoryFilter?: string;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expense: Expense) => void;
}

type SortOption = 'latest' | 'oldest' | 'highest' | 'lowest';

export function TransactionsView({
  expenses,
  categories,
  userName,
  initialCategoryFilter = 'all',
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
}: TransactionsViewProps) {
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter);
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('latest');

  useEffect(() => {
    setCategoryFilter(initialCategoryFilter);
  }, [initialCategoryFilter]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const dateRange = useMemo(
    () => getDateRangeForPreset(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd]
  );

  const filteredExpenses = useMemo(() => {
    const byDate = filterExpensesByRange(expenses, dateRange.start, dateRange.end);
    const query = search.trim().toLowerCase();
    const min = minAmount !== '' ? Number(minAmount) : null;
    const max = maxAmount !== '' ? Number(maxAmount) : null;

    const list = byDate.filter((exp) => {
      if (categoryFilter !== 'all' && exp.categoryId !== categoryFilter) return false;
      if (paymentFilter !== 'all' && exp.paymentMethod !== paymentFilter) return false;
      if (min !== null && Number.isFinite(min) && exp.amount < min) return false;
      if (max !== null && Number.isFinite(max) && exp.amount > max) return false;
      if (query) {
        const catName = (categoryMap.get(exp.categoryId)?.name || '').toLowerCase();
        const matches =
          exp.description.toLowerCase().includes(query) ||
          exp.notes.toLowerCase().includes(query) ||
          catName.includes(query) ||
          exp.paymentMethod.toLowerCase().includes(query) ||
          formatDateDDMMYYYY(exp.date).includes(query);
        if (!matches) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
        case 'highest':
          return b.amount - a.amount;
        case 'lowest':
          return a.amount - b.amount;
        case 'latest':
        default:
          return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [
    expenses,
    dateRange,
    categoryFilter,
    paymentFilter,
    minAmount,
    maxAmount,
    search,
    categoryMap,
    sortBy,
  ]);

  const filteredTotal = useMemo(() => sumExpenses(filteredExpenses), [filteredExpenses]);

  const hasActiveFilters =
    search !== '' ||
    datePreset !== 'all' ||
    categoryFilter !== 'all' ||
    paymentFilter !== 'all' ||
    minAmount !== '' ||
    maxAmount !== '';

  function handleResetFilters() {
    setSearch('');
    setDatePreset('all');
    setCustomStart('');
    setCustomEnd('');
    setCategoryFilter('all');
    setPaymentFilter('all');
    setMinAmount('');
    setMaxAmount('');
    setSortBy('latest');
  }

  return (
    <div className="space-y-5">
      {/* Filter Controls */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by description, category, notes, payment method, or DD-MM-YYYY..."
              aria-label="Search transactions"
              className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Filters</span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                exportExpensesToCSV(filteredExpenses, categoryMap, 'expense-history')
              }
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportExpensesToExcel(
                  filteredExpenses,
                  categoryMap,
                  dateRange.label,
                  'expense-history'
                )
              }
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportExpensesToPDF(
                  filteredExpenses,
                  categoryMap,
                  dateRange.label,
                  userName,
                  'expense-history'
                )
              }
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>PDF</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label
              htmlFor="tx-date-preset"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Date Period
            </label>
            <select
              id="tx-date-preset"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DateFilterPreset)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {DATE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tx-cat-filter"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Category
            </label>
            <select
              id="tx-cat-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tx-method-filter"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Payment Method
            </label>
            <select
              id="tx-method-filter"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tx-min-amount"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Amount Range (₹)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="tx-min-amount"
                type="number"
                min="0"
                placeholder="Min"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-1/2 px-2.5 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="number"
                min="0"
                placeholder="Max"
                aria-label="Maximum amount"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-1/2 px-2.5 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="tx-sort"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Sort Order
            </label>
            <select
              id="tx-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="latest">Latest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
          </div>
        </div>

        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label
                htmlFor="tx-custom-start"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Start Date {customStart ? `(${formatDateDDMMYYYY(customStart)})` : ''}
              </label>
              <input
                id="tx-custom-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="tx-custom-end"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                End Date {customEnd ? `(${formatDateDDMMYYYY(customEnd)})` : ''}
              </label>
              <input
                id="tx-custom-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}
      </section>

      {/* Summary Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
          Showing <span className="font-semibold text-slate-900 dark:text-white">{filteredExpenses.length}</span>{' '}
          {filteredExpenses.length === 1 ? 'transaction' : 'transactions'} ·{' '}
          <span>{dateRange.label}</span>
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
          Period Total:{' '}
          <span className="font-display text-base font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(filteredTotal, true)}
          </span>
        </p>
      </div>

      {/* Ledger Table */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {filteredExpenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredExpenses.map((exp) => {
                  const cat = categoryMap.get(exp.categoryId);
                  return (
                    <tr
                      key={exp.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4 text-xs font-mono-num text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateDDMMYYYY(exp.date)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: cat?.color || '#64748B' }}
                          />
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {cat?.name || 'Other Expenses'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 min-w-[200px]">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {exp.description}
                        </p>
                        {exp.notes && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {exp.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {exp.paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white font-mono-num whitespace-nowrap">
                        {formatINR(exp.amount, true)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditExpense(exp)}
                            aria-label={`Edit ${exp.description}`}
                            className="p-1.5 rounded-md text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteExpense(exp)}
                            aria-label={`Delete ${exp.description}`}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 px-4 text-center">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {expenses.length === 0
                ? 'No expenses recorded yet'
                : 'No transactions match your current filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {expenses.length === 0
                ? 'Add your first expense to begin building your financial history.'
                : 'Try adjusting the search text, date period, or category filter.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={onAddExpense}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Expense</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
