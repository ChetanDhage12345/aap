import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Category, Expense } from '../types/expense';
import {
  CategoryIcon,
  SELECTABLE_CATEGORY_COLORS,
  SELECTABLE_CATEGORY_ICONS,
} from '../utils/categoryIcons';
import {
  filterExpensesByRange,
  formatCompactINR,
  formatINR,
  getDateRangeForPreset,
  sumExpenses,
} from '../utils/format';

export interface CategoryFormData {
  name: string;
  color: string;
  icon: string;
  budgetLimit: number;
}

interface CategoriesViewProps {
  categories: Category[];
  expenses: Expense[];
  isDark: boolean;
  onCreateCategory: (data: CategoryFormData) => Promise<void>;
  onUpdateCategory: (id: string, data: CategoryFormData) => Promise<void>;
  onDeleteCategory: (category: Category, txCount: number) => void;
  onViewCategoryTransactions: (categoryId: string) => void;
}

export function CategoriesView({
  categories,
  expenses,
  isDark,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onViewCategoryTransactions,
}: CategoriesViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SELECTABLE_CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState('Tag');
  const [budgetLimit, setBudgetLimit] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  const categoryStats = useMemo(() => {
    const now = new Date();
    const todayRange = getDateRangeForPreset('today', undefined, undefined, now);
    const monthRange = getDateRangeForPreset('thisMonth', undefined, undefined, now);
    const yearRange = getDateRangeForPreset('thisYear', undefined, undefined, now);

    const todayIds = new Set(
      filterExpensesByRange(expenses, todayRange.start, todayRange.end).map((e) => e.id)
    );
    const monthIds = new Set(
      filterExpensesByRange(expenses, monthRange.start, monthRange.end).map((e) => e.id)
    );
    const yearIds = new Set(
      filterExpensesByRange(expenses, yearRange.start, yearRange.end).map((e) => e.id)
    );

    const map = new Map<
      string,
      { total: number; count: number; daily: number; monthly: number; yearly: number }
    >();

    for (const cat of categories) {
      map.set(cat.id, { total: 0, count: 0, daily: 0, monthly: 0, yearly: 0 });
    }

    for (const exp of expenses) {
      const entry = map.get(exp.categoryId);
      if (!entry) continue;
      entry.total += exp.amount;
      entry.count += 1;
      if (todayIds.has(exp.id)) entry.daily += exp.amount;
      if (monthIds.has(exp.id)) entry.monthly += exp.amount;
      if (yearIds.has(exp.id)) entry.yearly += exp.amount;
    }

    return categories.map((cat) => ({
      category: cat,
      ...(map.get(cat.id) || { total: 0, count: 0, daily: 0, monthly: 0, yearly: 0 }),
    }));
  }, [categories, expenses]);

  const chartData = useMemo(
    () =>
      [...categoryStats]
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .map((item) => ({
          name: item.category.name,
          amount: Math.round(item.total * 100) / 100,
          color: item.category.color,
        })),
    [categoryStats]
  );

  const selectedCategoryDetail = useMemo(() => {
    const targetId = selectedCategoryId || categoryStats[0]?.category.id || '';
    const stat = categoryStats.find((c) => c.category.id === targetId);
    if (!stat) return null;

    const currentYear = new Date().getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totals = new Array<number>(12).fill(0);
    for (const exp of expenses) {
      if (exp.categoryId === targetId && exp.date.startsWith(`${currentYear}-`)) {
        const idx = Number(exp.date.slice(5, 7)) - 1;
        if (idx >= 0 && idx < 12) totals[idx] += exp.amount;
      }
    }
    return {
      stat,
      monthlyTrend: months.map((m, idx) => ({
        month: m,
        amount: Math.round(totals[idx] * 100) / 100,
      })),
    };
  }, [selectedCategoryId, categoryStats, expenses]);

  function openCreateModal() {
    setEditingCategory(null);
    setName('');
    setColor(SELECTABLE_CATEGORY_COLORS[0]);
    setIcon('Tag');
    setBudgetLimit('0');
    setError('');
    setModalOpen(true);
  }

  function openEditModal(cat: Category) {
    setEditingCategory(cat);
    setName(cat.name);
    setColor(cat.color);
    setIcon(cat.icon);
    setBudgetLimit(String(cat.budgetLimit || 0));
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      setError('Category name must be between 1 and 50 characters.');
      return;
    }
    const parsedBudget = Number(budgetLimit || 0);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setError('Monthly budget limit must be zero or positive.');
      return;
    }

    setSaving(true);
    try {
      const payload: CategoryFormData = {
        name: trimmed,
        color,
        icon,
        budgetLimit: Math.round(parsedBudget * 100) / 100,
      };
      if (editingCategory) {
        await onUpdateCategory(editingCategory.id, payload);
      } else {
        await onCreateCategory(payload);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  }

  const grandTotal = useMemo(() => sumExpenses(expenses), [expenses]);
  const chartAxisColor = isDark ? '#94A3B8' : '#64748B';
  const chartGridColor = isDark ? '#1E293B' : '#E2E8F0';
  const chartTooltipStyle = {
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
    borderRadius: '8px',
    color: isDark ? '#F8FAFC' : '#0F172A',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Expense Categories ({categories.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track daily, monthly, and yearly spending per category, or create custom categories.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>New Category</span>
        </button>
      </div>

      {/* Category Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Category Spending Comparison
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Total lifetime spending across active categories
          </p>
          {chartData.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: chartAxisColor, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: chartAxisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => formatCompactINR(Number(val))}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(val: unknown) => [formatINR(Number(val)), 'Total Spent']}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Add expenses to compare spending across categories.
            </div>
          )}
        </div>

        <div className="xl:col-span-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Category Monthly Trend
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {new Date().getFullYear()} monthly spending for selected category
              </p>
            </div>
            <select
              aria-label="Select category for monthly trend"
              value={selectedCategoryDetail?.stat.category.id || ''}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 max-w-[160px]"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          {selectedCategoryDetail && (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={selectedCategoryDetail.monthlyTrend}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: chartAxisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: chartAxisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => formatCompactINR(Number(val))}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(val: unknown) => [formatINR(Number(val)), selectedCategoryDetail.stat.category.name]}
                  />
                  <Bar
                    dataKey="amount"
                    fill={selectedCategoryDetail.stat.category.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Category Table */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Transactions</th>
                <th className="py-3 px-4 text-right">Today</th>
                <th className="py-3 px-4 text-right">This Month</th>
                <th className="py-3 px-4 text-right">This Year</th>
                <th className="py-3 px-4 text-right">Total Spent</th>
                <th className="py-3 px-4 text-right">Share</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {categoryStats.map((row) => {
                const share = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
                return (
                  <tr
                    key={row.category.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: row.category.color }}
                        >
                          <CategoryIcon name={row.category.icon} className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {row.category.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {row.category.isDefault ? 'Default' : 'Custom'}
                            {row.category.budgetLimit > 0
                              ? ` · Limit ${formatINR(row.category.budgetLimit)}/mo`
                              : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                      {row.count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                      {formatINR(row.daily)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                      {formatINR(row.monthly)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                      {formatINR(row.yearly)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900 dark:text-white">
                      {formatINR(row.total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-xs text-slate-500 dark:text-slate-400">
                      {share.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onViewCategoryTransactions(row.category.id)}
                          title="View transactions in this category"
                          aria-label={`View transactions for ${row.category.name}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(row.category)}
                          aria-label={`Edit ${row.category.name}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCategory(row.category, row.count)}
                          disabled={categories.length <= 1}
                          aria-label={`Delete ${row.category.name}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
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
      </section>

      {/* Create / Edit Category Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3
                id="category-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingCategory ? 'Edit Category' : 'Create Custom Category'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="cat-name"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Category Name *
                </label>
                <input
                  id="cat-name"
                  type="text"
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Subscriptions, Gym, Maintenance"
                  required
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="cat-budget"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Monthly Budget Limit (₹, optional)
                </label>
                <input
                  id="cat-budget"
                  type="number"
                  min="0"
                  step="1"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="0 for no limit"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Color Accent
                </span>
                <div className="flex flex-wrap gap-2">
                  {SELECTABLE_CATEGORY_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`Select color ${swatch}`}
                      className={`w-7 h-7 rounded-md transition-transform ${
                        color === swatch
                          ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-105'
                          : ''
                      }`}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Icon
                </span>
                <div className="grid grid-cols-8 gap-2">
                  {SELECTABLE_CATEGORY_ICONS.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setIcon(iconName)}
                      aria-label={`Select icon ${iconName}`}
                      className={`p-2 rounded-lg border flex items-center justify-center transition-colors ${
                        icon === iconName
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <CategoryIcon name={iconName} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingCategory ? 'Save Category' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
