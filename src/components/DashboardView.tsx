import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Category, Expense } from '../types/expense';
import { CategoryIcon } from '../utils/categoryIcons';
import {
  calculateDelta,
  filterExpensesByRange,
  formatCompactINR,
  formatDateDDMMYYYY,
  formatINR,
  getDateRangeForPreset,
  sumExpenses,
  toISODate,
} from '../utils/format';

interface DashboardViewProps {
  expenses: Expense[];
  categories: Category[];
  monthlyBudget: number;
  isDark: boolean;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expense: Expense) => void;
  onNavigate: (tab: 'transactions' | 'categories' | 'reports' | 'budgets') => void;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DashboardView({
  expenses,
  categories,
  monthlyBudget,
  isDark,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onNavigate,
}: DashboardViewProps) {
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const now = new Date();
  const currentYear = now.getFullYear();

  const metrics = useMemo(() => {
    const todayRange = getDateRangeForPreset('today', undefined, undefined, now);
    const thisMonthRange = getDateRangeForPreset('thisMonth', undefined, undefined, now);
    const prevMonthRange = getDateRangeForPreset('previousMonth', undefined, undefined, now);
    const thisYearRange = getDateRangeForPreset('thisYear', undefined, undefined, now);
    const prevYearRange = getDateRangeForPreset('previousYear', undefined, undefined, now);

    const todayExpenses = filterExpensesByRange(expenses, todayRange.start, todayRange.end);
    const monthExpenses = filterExpensesByRange(expenses, thisMonthRange.start, thisMonthRange.end);
    const prevMonthExpenses = filterExpensesByRange(expenses, prevMonthRange.start, prevMonthRange.end);
    const yearExpenses = filterExpensesByRange(expenses, thisYearRange.start, thisYearRange.end);
    const prevYearExpenses = filterExpensesByRange(expenses, prevYearRange.start, prevYearRange.end);

    const totalAll = sumExpenses(expenses);
    const totalToday = sumExpenses(todayExpenses);
    const totalMonth = sumExpenses(monthExpenses);
    const totalPrevMonth = sumExpenses(prevMonthExpenses);
    const totalYear = sumExpenses(yearExpenses);
    const totalPrevYear = sumExpenses(prevYearExpenses);

    const monthDelta = calculateDelta(totalMonth, totalPrevMonth);
    const yearDelta = calculateDelta(totalYear, totalPrevYear);

    // Category summary across all expenses & this month
    const byCatAll = new Map<string, { total: number; count: number }>();
    for (const exp of expenses) {
      const prev = byCatAll.get(exp.categoryId) || { total: 0, count: 0 };
      prev.total += exp.amount;
      prev.count += 1;
      byCatAll.set(exp.categoryId, prev);
    }

    const byCatMonth = new Map<string, number>();
    for (const exp of monthExpenses) {
      byCatMonth.set(exp.categoryId, (byCatMonth.get(exp.categoryId) || 0) + exp.amount);
    }

    const categorySummary = categories
      .map((cat) => {
        const stats = byCatAll.get(cat.id) || { total: 0, count: 0 };
        const monthSpent = byCatMonth.get(cat.id) || 0;
        return {
          category: cat,
          total: stats.total,
          count: stats.count,
          monthSpent,
          share: totalAll > 0 ? (stats.total / totalAll) * 100 : 0,
        };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.total - a.total);

    const highestCategory = categorySummary[0] || null;

    // Budget Alerts (Monthly + Category-wise for this month)
    const alerts: Array<{ label: string; spent: number; limit: number; pct: number }> = [];
    if (monthlyBudget > 0) {
      const pct = (totalMonth / monthlyBudget) * 100;
      if (pct >= 80) {
        alerts.push({
          label: 'Overall Monthly Budget',
          spent: totalMonth,
          limit: monthlyBudget,
          pct,
        });
      }
    }
    for (const cat of categories) {
      if (cat.budgetLimit > 0) {
        const spent = byCatMonth.get(cat.id) || 0;
        const pct = (spent / cat.budgetLimit) * 100;
        if (pct >= 80) {
          alerts.push({
            label: `${cat.name} Category Budget`,
            spent,
            limit: cat.budgetLimit,
            pct,
          });
        }
      }
    }

    // Monthly Bar Chart data for current year
    const monthlyTotals = new Array<number>(12).fill(0);
    for (const exp of yearExpenses) {
      const monthIdx = Number(exp.date.slice(5, 7)) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        monthlyTotals[monthIdx] += exp.amount;
      }
    }
    const monthlyChartData = MONTH_LABELS.map((label, idx) => ({
      month: label,
      amount: Math.round(monthlyTotals[idx] * 100) / 100,
    }));

    // Daily Line Chart data (last 30 days)
    const dailyMap = new Map<string, number>();
    const dailyChartData: Array<{ dateISO: string; dateLabel: string; shortLabel: string; amount: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const iso = toISODate(dt);
      dailyMap.set(iso, 0);
    }
    for (const exp of expenses) {
      if (dailyMap.has(exp.date)) {
        dailyMap.set(exp.date, (dailyMap.get(exp.date) || 0) + exp.amount);
      }
    }
    for (const [iso, amt] of dailyMap.entries()) {
      const ddmmyyyy = formatDateDDMMYYYY(iso);
      dailyChartData.push({
        dateISO: iso,
        dateLabel: ddmmyyyy,
        shortLabel: ddmmyyyy.slice(0, 5),
        amount: Math.round(amt * 100) / 100,
      });
    }

    return {
      totalAll,
      totalToday,
      todayCount: todayExpenses.length,
      totalMonth,
      monthCount: monthExpenses.length,
      monthDelta,
      totalYear,
      yearCount: yearExpenses.length,
      yearDelta,
      categorySummary,
      highestCategory,
      alerts,
      monthlyChartData,
      dailyChartData,
    };
  }, [expenses, categories, monthlyBudget]);

  const recentTransactions = useMemo(() => expenses.slice(0, 8), [expenses]);

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
      {/* Budget Alerts */}
      {metrics.alerts.length > 0 && (
        <section
          aria-label="Budget alerts"
          className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 p-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  Budget Threshold Reached ({metrics.alerts.length}{' '}
                  {metrics.alerts.length === 1 ? 'alert' : 'alerts'})
                </h2>
                <div className="mt-1 space-y-1">
                  {metrics.alerts.map((alert) => {
                    const exceeded = alert.pct >= 100;
                    return (
                      <p
                        key={alert.label}
                        className="text-xs text-amber-900 dark:text-amber-200 tabular-nums"
                      >
                        <span className="font-semibold">{alert.label}:</span>{' '}
                        {formatINR(alert.spent)} of {formatINR(alert.limit)} spent (
                        {alert.pct.toFixed(0)}% ·{' '}
                        <span
                          className={
                            exceeded
                              ? 'font-semibold text-red-700 dark:text-red-300'
                              : 'font-semibold'
                          }
                        >
                          {exceeded ? '100% Budget Exceeded' : '80% Warning Reached'}
                        </span>
                        )
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('budgets')}
              className="self-start sm:self-center px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0"
            >
              Manage Budgets
            </button>
          </div>
        </section>
      )}

      {/* Empty State Banner when no transactions exist yet */}
      {expenses.length === 0 && (
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Start Tracking Your Expenses
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Your 15 default expense categories are ready. Add your first expense to populate live dashboard totals, charts, and budget progress.
          </p>
          <button
            type="button"
            onClick={onAddExpense}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add First Expense</span>
          </button>
        </section>
      )}

      {/* 4 Primary KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Expenses
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(metrics.totalAll)}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {expenses.length} {expenses.length === 1 ? 'transaction' : 'transactions'} recorded
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Today&apos;s Expenses
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(metrics.totalToday)}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDateDDMMYYYY(toISODate(now))} · {metrics.todayCount}{' '}
            {metrics.todayCount === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            This Month&apos;s Expenses
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(metrics.totalMonth)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs tabular-nums">
            {metrics.monthDelta.pct !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 font-medium ${
                  metrics.monthDelta.trend === 'up'
                    ? 'text-red-600 dark:text-red-400'
                    : metrics.monthDelta.trend === 'down'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {metrics.monthDelta.trend === 'up' ? (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : metrics.monthDelta.trend === 'down' ? (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : null}
                {metrics.monthDelta.pct > 0 ? '+' : ''}
                {metrics.monthDelta.pct.toFixed(1)}% vs last month
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {metrics.monthCount} {metrics.monthCount === 1 ? 'entry' : 'entries'} this month
              </span>
            )}
          </div>
          {monthlyBudget > 0 && (
            <div className="mt-3">
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    metrics.totalMonth >= monthlyBudget
                      ? 'bg-red-600'
                      : metrics.totalMonth >= monthlyBudget * 0.8
                        ? 'bg-amber-500'
                        : 'bg-teal-600'
                  }`}
                  style={{
                    width: `${Math.min(100, (metrics.totalMonth / monthlyBudget) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                Budget: {formatINR(monthlyBudget)} ({((metrics.totalMonth / monthlyBudget) * 100).toFixed(0)}% used)
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            This Year&apos;s Expenses ({currentYear})
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(metrics.totalYear)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs tabular-nums">
            {metrics.yearDelta.pct !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 font-medium ${
                  metrics.yearDelta.trend === 'up'
                    ? 'text-red-600 dark:text-red-400'
                    : metrics.yearDelta.trend === 'down'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {metrics.yearDelta.trend === 'up' ? (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : metrics.yearDelta.trend === 'down' ? (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : null}
                {metrics.yearDelta.pct > 0 ? '+' : ''}
                {metrics.yearDelta.pct.toFixed(1)}% vs {currentYear - 1}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {metrics.yearCount} {metrics.yearCount === 1 ? 'entry' : 'entries'} in {currentYear}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Highest Spending Category & Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Monthly Expense Chart ({currentYear})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Month-by-month total spending in ₹
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              Full Analytics
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.monthlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  formatter={(value: unknown) => [formatINR(Number(value)), 'Expenses']}
                />
                <Bar dataKey="amount" fill="#0F766E" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Daily Expense Chart (Last 30 Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily spending trajectory in ₹
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              Date Reports
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.dailyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fill: chartAxisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
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
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { dateLabel?: string } | undefined;
                    return row?.dateLabel ? `Date: ${row.dateLabel}` : '';
                  }}
                  formatter={(value: unknown) => [formatINR(Number(value)), 'Spent']}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#0EA5E9"
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Highest Spending Category + Category Summary + Recent Transactions */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 space-y-6">
          {/* Highest Spending Category */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Highest Spending Category
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('categories')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                All Categories
              </button>
            </div>
            {metrics.highestCategory ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: metrics.highestCategory.category.color }}
                  >
                    <CategoryIcon
                      name={metrics.highestCategory.category.icon}
                      className="w-5 h-5"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {metrics.highestCategory.category.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {metrics.highestCategory.count} transactions ·{' '}
                      {metrics.highestCategory.share.toFixed(1)}% of total spending
                    </p>
                  </div>
                </div>
                <p className="font-display text-lg font-bold text-slate-900 dark:text-white font-mono-num shrink-0">
                  {formatINR(metrics.highestCategory.total)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                No category expenses recorded yet.
              </p>
            )}
          </div>

          {/* Category-Wise Expense Summary */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Category-Wise Summary
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {metrics.categorySummary.length} active
              </span>
            </div>

            {metrics.categorySummary.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {metrics.categorySummary.slice(0, 7).map((item) => (
                  <div key={item.category.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: item.category.color }}
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {item.category.name}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                          · {item.count}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono-num shrink-0">
                        {formatINR(item.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, item.share)}%`,
                            backgroundColor: item.category.color,
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums w-11 text-right">
                        {item.share.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Category totals will appear once you add transactions.
              </p>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="xl:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Recent Transactions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Latest recorded expenses
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {recentTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-3">Date</th>
                    <th className="py-2.5 px-3">Description &amp; Category</th>
                    <th className="py-2.5 px-3 hidden sm:table-cell">Method</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {recentTransactions.map((exp) => {
                    const cat = categoryMap.get(exp.categoryId);
                    return (
                      <tr
                        key={exp.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-3 pr-3 text-xs font-mono-num text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDateDDMMYYYY(exp.date)}
                        </td>
                        <td className="py-3 px-3 min-w-[160px]">
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[240px]">
                            {exp.description}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {cat?.name || 'Other Expenses'}
                            {exp.notes ? ` · ${exp.notes}` : ''}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-400 hidden sm:table-cell whitespace-nowrap">
                          {exp.paymentMethod}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-900 dark:text-white font-mono-num whitespace-nowrap">
                          {formatINR(exp.amount)}
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditExpense(exp)}
                              aria-label={`Edit ${exp.description}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteExpense(exp)}
                              aria-label={`Delete ${exp.description}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No transactions yet. Click &ldquo;Add Expense&rdquo; to record your first transaction.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
