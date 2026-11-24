import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import type { Category, Expense } from '../types/expense';
import { CategoryIcon } from '../utils/categoryIcons';
import {
  filterExpensesByRange,
  formatINR,
  getDateRangeForPreset,
  sumExpenses,
} from '../utils/format';

interface BudgetsViewProps {
  monthlyBudget: number;
  categories: Category[];
  expenses: Expense[];
  onSaveMonthlyBudget: (amount: number) => Promise<void>;
  onSaveCategoryBudget: (category: Category, budgetLimit: number) => Promise<void>;
}

export function BudgetsView({
  monthlyBudget,
  categories,
  expenses,
  onSaveMonthlyBudget,
  onSaveCategoryBudget,
}: BudgetsViewProps) {
  const [monthlyInput, setMonthlyInput] = useState(String(monthlyBudget || 0));
  const [savingMonthly, setSavingMonthly] = useState(false);
  const [monthlyMessage, setMonthlyMessage] = useState('');
  const [monthlyError, setMonthlyError] = useState('');

  const [categoryInputs, setCategoryInputs] = useState<Record<string, string>>({});
  const [savingCatId, setSavingCatId] = useState<string | null>(null);
  const [catFeedback, setCatFeedback] = useState<string>('');

  useEffect(() => {
    setMonthlyInput(String(monthlyBudget || 0));
  }, [monthlyBudget]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const cat of categories) {
      next[cat.id] = String(cat.budgetLimit || 0);
    }
    setCategoryInputs(next);
  }, [categories]);

  const monthRange = useMemo(() => getDateRangeForPreset('thisMonth'), []);
  const thisMonthExpenses = useMemo(
    () => filterExpensesByRange(expenses, monthRange.start, monthRange.end),
    [expenses, monthRange]
  );

  const monthTotalSpent = useMemo(() => sumExpenses(thisMonthExpenses), [thisMonthExpenses]);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of thisMonthExpenses) {
      map.set(exp.categoryId, (map.get(exp.categoryId) || 0) + exp.amount);
    }
    return map;
  }, [thisMonthExpenses]);

  async function handleMonthlySubmit(e: FormEvent) {
    e.preventDefault();
    setMonthlyError('');
    setMonthlyMessage('');

    const parsed = Number(monthlyInput || 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setMonthlyError('Please enter a valid non-negative monthly budget.');
      return;
    }

    setSavingMonthly(true);
    try {
      await onSaveMonthlyBudget(Math.round(parsed * 100) / 100);
      setMonthlyMessage('Monthly budget updated.');
    } catch (err) {
      setMonthlyError(err instanceof Error ? err.message : 'Unable to save monthly budget.');
    } finally {
      setSavingMonthly(false);
    }
  }

  async function handleSaveCategory(cat: Category) {
    setCatFeedback('');
    const raw = categoryInputs[cat.id] ?? '0';
    const parsed = Number(raw || 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setCatFeedback(`Invalid budget amount for ${cat.name}.`);
      return;
    }
    setSavingCatId(cat.id);
    try {
      await onSaveCategoryBudget(cat, Math.round(parsed * 100) / 100);
      setCatFeedback(`Saved ${cat.name} budget.`);
    } catch (err) {
      setCatFeedback(err instanceof Error ? err.message : 'Failed to update category budget.');
    } finally {
      setSavingCatId(null);
    }
  }

  const overallPct = monthlyBudget > 0 ? (monthTotalSpent / monthlyBudget) * 100 : 0;
  const overallRemaining = monthlyBudget - monthTotalSpent;

  const activeAlerts = useMemo(() => {
    const list: Array<{ title: string; pct: number; spent: number; limit: number }> = [];
    if (monthlyBudget > 0 && overallPct >= 80) {
      list.push({
        title: 'Overall Monthly Budget',
        pct: overallPct,
        spent: monthTotalSpent,
        limit: monthlyBudget,
      });
    }
    for (const cat of categories) {
      if (cat.budgetLimit > 0) {
        const spent = spentByCategory.get(cat.id) || 0;
        const pct = (spent / cat.budgetLimit) * 100;
        if (pct >= 80) {
          list.push({
            title: `${cat.name} Budget`,
            pct,
            spent,
            limit: cat.budgetLimit,
          });
        }
      }
    }
    return list;
  }, [monthlyBudget, overallPct, monthTotalSpent, categories, spentByCategory]);

  return (
    <div className="space-y-6">
      {/* Overall Monthly Budget Card */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Monthly Spending Budget ({monthRange.label})
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Set an overall monthly limit in ₹. Alerts activate automatically at 80% and 100% usage.
            </p>

            <form onSubmit={handleMonthlySubmit} className="flex flex-wrap items-end gap-3 pt-1">
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="overall-monthly-budget"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  Monthly Limit (₹)
                </label>
                <input
                  id="overall-monthly-budget"
                  type="number"
                  min="0"
                  step="100"
                  value={monthlyInput}
                  onChange={(e) => setMonthlyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={savingMonthly}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span>{savingMonthly ? 'Saving...' : 'Save Monthly Budget'}</span>
              </button>
            </form>

            {monthlyError && (
              <p className="text-xs text-red-600 dark:text-red-400">{monthlyError}</p>
            )}
            {monthlyMessage && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{monthlyMessage}</p>
            )}
          </div>

          <div className="lg:col-span-6 p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                This Month&apos;s Progress
              </span>
              {monthlyBudget > 0 ? (
                <span
                  className={`text-xs font-semibold ${
                    overallPct >= 100
                      ? 'text-red-600 dark:text-red-400'
                      : overallPct >= 80
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {overallPct >= 100
                    ? 'Budget Exceeded (100%+)'
                    : overallPct >= 80
                      ? 'Warning (80%+ Reached)'
                      : 'On Track'}
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">No Limit Set</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm tabular-nums">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Spent</p>
                <p className="font-mono-num font-bold text-slate-900 dark:text-white mt-0.5">
                  {formatINR(monthTotalSpent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Budget</p>
                <p className="font-mono-num font-bold text-slate-900 dark:text-white mt-0.5">
                  {monthlyBudget > 0 ? formatINR(monthlyBudget) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {overallRemaining < 0 ? 'Over By' : 'Remaining'}
                </p>
                <p
                  className={`font-mono-num font-bold mt-0.5 ${
                    monthlyBudget > 0 && overallRemaining < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {monthlyBudget > 0 ? formatINR(Math.abs(overallRemaining)) : '—'}
                </p>
              </div>
            </div>

            {monthlyBudget > 0 && (
              <div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      overallPct >= 100
                        ? 'bg-red-600'
                        : overallPct >= 80
                          ? 'bg-amber-500'
                          : 'bg-teal-600'
                    }`}
                    style={{ width: `${Math.min(100, overallPct)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {overallPct.toFixed(1)}% of monthly budget used
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Active Alerts Summary */}
      {activeAlerts.length > 0 && (
        <section className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Active Budget Alerts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeAlerts.map((a) => (
              <div
                key={a.title}
                className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 text-xs tabular-nums"
              >
                <p className="font-semibold text-slate-900 dark:text-white">{a.title}</p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  {formatINR(a.spent)} / {formatINR(a.limit)} ({a.pct.toFixed(0)}%)
                </p>
                <p
                  className={`mt-1 font-semibold ${
                    a.pct >= 100
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {a.pct >= 100 ? 'Exceeded 100% Limit' : 'Reached 80% Threshold'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Category-Wise Budgets */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Category-Wise Monthly Budgets
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set monthly spending caps per category (enter 0 to disable limit).
            </p>
          </div>
          {catFeedback && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{catFeedback}</span>
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-5">Category</th>
                <th className="py-3 px-5 text-right">Spent This Month</th>
                <th className="py-3 px-5">Monthly Limit (₹)</th>
                <th className="py-3 px-5 text-right">Remaining</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {categories.map((cat) => {
                const spent = spentByCategory.get(cat.id) || 0;
                const limit = cat.budgetLimit;
                const remaining = limit - spent;
                const pct = limit > 0 ? (spent / limit) * 100 : 0;

                return (
                  <tr key={cat.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: cat.color }}
                        >
                          <CategoryIcon name={cat.icon} className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {cat.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right font-mono-num text-slate-800 dark:text-slate-200">
                      {formatINR(spent)}
                    </td>
                    <td className="py-3 px-5">
                      <input
                        type="number"
                        min="0"
                        step="50"
                        aria-label={`Monthly budget for ${cat.name}`}
                        value={categoryInputs[cat.id] ?? '0'}
                        onChange={(e) =>
                          setCategoryInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))
                        }
                        className="w-32 px-2.5 py-1.5 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-3 px-5 text-right font-mono-num">
                      {limit > 0 ? (
                        <span
                          className={
                            remaining < 0
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {remaining < 0
                            ? `-${formatINR(Math.abs(remaining))}`
                            : formatINR(remaining)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-5 min-w-[160px]">
                      {limit > 0 ? (
                        <div className="space-y-1">
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                pct >= 100
                                  ? 'bg-red-600'
                                  : pct >= 80
                                    ? 'bg-amber-500'
                                    : 'bg-teal-600'
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <p
                            className={`text-[11px] font-medium tabular-nums ${
                              pct >= 100
                                ? 'text-red-600 dark:text-red-400'
                                : pct >= 80
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {pct.toFixed(0)}% ·{' '}
                            {pct >= 100 ? 'Exceeded' : pct >= 80 ? '80% Alert' : 'On Track'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No limit</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => handleSaveCategory(cat)}
                        disabled={savingCatId === cat.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        {savingCatId === cat.id ? 'Saving...' : 'Update'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
