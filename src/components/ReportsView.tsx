import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Category, DateFilterPreset, Expense } from '../types/expense';
import {
  calculateDelta,
  DATE_PRESET_OPTIONS,
  filterExpensesByRange,
  formatCompactINR,
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

interface ReportsViewProps {
  expenses: Expense[];
  categories: Category[];
  userName: string;
  isDark: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ReportsView({ expenses, categories, userName, isDark }: ReportsViewProps) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const [preset, setPreset] = useState<DateFilterPreset>('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear, currentYear - 1]);
    for (const exp of expenses) {
      const y = Number(exp.date.slice(0, 4));
      if (Number.isFinite(y) && y > 1900) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [expenses, currentYear]);

  // Automatic Monthly, Quarterly & Yearly Comparisons
  const periodReports = useMemo(() => {
    const thisMonthR = getDateRangeForPreset('thisMonth', undefined, undefined, now);
    const prevMonthR = getDateRangeForPreset('previousMonth', undefined, undefined, now);
    const thisQuarterR = getDateRangeForPreset('thisQuarter', undefined, undefined, now);
    const prevQuarterR = getDateRangeForPreset('previousQuarter', undefined, undefined, now);
    const thisYearR = getDateRangeForPreset('thisYear', undefined, undefined, now);
    const prevYearR = getDateRangeForPreset('previousYear', undefined, undefined, now);

    const monthTotal = sumExpenses(filterExpensesByRange(expenses, thisMonthR.start, thisMonthR.end));
    const prevMonthTotal = sumExpenses(filterExpensesByRange(expenses, prevMonthR.start, prevMonthR.end));
    const quarterTotal = sumExpenses(filterExpensesByRange(expenses, thisQuarterR.start, thisQuarterR.end));
    const prevQuarterTotal = sumExpenses(filterExpensesByRange(expenses, prevQuarterR.start, prevQuarterR.end));
    const yearTotal = sumExpenses(filterExpensesByRange(expenses, thisYearR.start, thisYearR.end));
    const prevYearTotal = sumExpenses(filterExpensesByRange(expenses, prevYearR.start, prevYearR.end));

    return {
      monthLabel: thisMonthR.label,
      monthTotal,
      prevMonthTotal,
      monthDelta: calculateDelta(monthTotal, prevMonthTotal),
      quarterLabel: thisQuarterR.label,
      quarterTotal,
      prevQuarterTotal,
      quarterDelta: calculateDelta(quarterTotal, prevQuarterTotal),
      yearLabel: thisYearR.label,
      yearTotal,
      prevYearTotal,
      yearDelta: calculateDelta(yearTotal, prevYearTotal),
    };
  }, [expenses]);

  // Date-Wise Filter Calculations
  const dateRange = useMemo(
    () => getDateRangeForPreset(preset, customStart, customEnd, now),
    [preset, customStart, customEnd]
  );

  const filteredExpenses = useMemo(
    () => filterExpensesByRange(expenses, dateRange.start, dateRange.end),
    [expenses, dateRange]
  );

  const filteredTotal = useMemo(() => sumExpenses(filteredExpenses), [filteredExpenses]);

  const highestTransaction = useMemo(() => {
    if (filteredExpenses.length === 0) return null;
    return filteredExpenses.reduce((max, e) => (e.amount > max.amount ? e : max), filteredExpenses[0]);
  }, [filteredExpenses]);

  // 1. Pie Chart Data (Category-Wise Expenses for filtered period)
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number; total: number }>();
    for (const exp of filteredExpenses) {
      const cat = categoryMap.get(exp.categoryId);
      const curr = map.get(exp.categoryId) || {
        name: cat?.name || 'Other Expenses',
        color: cat?.color || '#64748B',
        count: 0,
        total: 0,
      };
      curr.count += 1;
      curr.total += exp.amount;
      map.set(exp.categoryId, curr);
    }
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        total: Math.round(item.total * 100) / 100,
        share: filteredTotal > 0 ? (item.total / filteredTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses, categoryMap, filteredTotal]);

  // 2. Monthly Bar Chart (selected year)
  const monthlyBarData = useMemo(() => {
    const totals = new Array<number>(12).fill(0);
    for (const exp of expenses) {
      if (exp.date.startsWith(`${selectedYear}-`)) {
        const mIdx = Number(exp.date.slice(5, 7)) - 1;
        if (mIdx >= 0 && mIdx < 12) totals[mIdx] += exp.amount;
      }
    }
    return MONTH_NAMES.map((month, idx) => ({
      month,
      amount: Math.round(totals[idx] * 100) / 100,
    }));
  }, [expenses, selectedYear]);

  // 3. Daily Spending Line Chart (across filtered expenses grouped by date)
  const dailyLineData = useMemo(() => {
    const dayMap = new Map<string, number>();
    for (const exp of filteredExpenses) {
      dayMap.set(exp.date, (dayMap.get(exp.date) || 0) + exp.amount);
    }
    return Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateISO, amount]) => {
        const ddmmyyyy = formatDateDDMMYYYY(dateISO);
        return {
          dateISO,
          dateLabel: ddmmyyyy,
          shortLabel: ddmmyyyy.slice(0, 5),
          amount: Math.round(amount * 100) / 100,
        };
      });
  }, [filteredExpenses]);

  // 4. Yearly Expense Comparison (Selected Year vs Previous Year by Month)
  const yearlyComparisonData = useMemo(() => {
    const currTotals = new Array<number>(12).fill(0);
    const prevTotals = new Array<number>(12).fill(0);
    const prevYear = selectedYear - 1;

    for (const exp of expenses) {
      const y = Number(exp.date.slice(0, 4));
      const mIdx = Number(exp.date.slice(5, 7)) - 1;
      if (mIdx < 0 || mIdx >= 12) continue;
      if (y === selectedYear) currTotals[mIdx] += exp.amount;
      else if (y === prevYear) prevTotals[mIdx] += exp.amount;
    }

    return MONTH_NAMES.map((month, idx) => ({
      month,
      [String(selectedYear)]: Math.round(currTotals[idx] * 100) / 100,
      [String(prevYear)]: Math.round(prevTotals[idx] * 100) / 100,
    }));
  }, [expenses, selectedYear]);

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
      {/* Automatic Monthly, Quarterly, Yearly Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Monthly Total ({periodReports.monthLabel})
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(periodReports.monthTotal)}
          </p>
          <div className="mt-2 text-xs tabular-nums flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400">
              Prev Month: {formatINR(periodReports.prevMonthTotal)}
            </span>
            {periodReports.monthDelta.pct !== null && (
              <span
                className={`inline-flex items-center font-semibold ${
                  periodReports.monthDelta.trend === 'up'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {periodReports.monthDelta.trend === 'up' ? (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {periodReports.monthDelta.pct > 0 ? '+' : ''}
                {periodReports.monthDelta.pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Quarterly Total ({periodReports.quarterLabel})
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(periodReports.quarterTotal)}
          </p>
          <div className="mt-2 text-xs tabular-nums flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400">
              Prev Quarter: {formatINR(periodReports.prevQuarterTotal)}
            </span>
            {periodReports.quarterDelta.pct !== null && (
              <span
                className={`inline-flex items-center font-semibold ${
                  periodReports.quarterDelta.trend === 'up'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {periodReports.quarterDelta.trend === 'up' ? (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {periodReports.quarterDelta.pct > 0 ? '+' : ''}
                {periodReports.quarterDelta.pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Yearly Total ({periodReports.yearLabel})
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {formatINR(periodReports.yearTotal)}
          </p>
          <div className="mt-2 text-xs tabular-nums flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400">
              Prev Year: {formatINR(periodReports.prevYearTotal)}
            </span>
            {periodReports.yearDelta.pct !== null && (
              <span
                className={`inline-flex items-center font-semibold ${
                  periodReports.yearDelta.trend === 'up'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {periodReports.yearDelta.trend === 'up' ? (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {periodReports.yearDelta.pct > 0 ? '+' : ''}
                {periodReports.yearDelta.pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Date-Wise Filter Bar */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Date-Wise Expense Report
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select any preset or custom date range to inspect exact expenses and export reports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportExpensesToCSV(filteredExpenses, categoryMap, `report-${preset}`)
              }
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportExpensesToExcel(
                  filteredExpenses,
                  categoryMap,
                  dateRange.label,
                  `report-${preset}`
                )
              }
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Excel</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportExpensesToPDF(
                  filteredExpenses,
                  categoryMap,
                  dateRange.label,
                  userName,
                  `report-${preset}`
                )
              }
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPreset(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                preset === opt.value
                  ? 'bg-teal-700 dark:bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 max-w-xl">
            <div>
              <label
                htmlFor="rep-start"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Start Date {customStart ? `(${formatDateDDMMYYYY(customStart)})` : ''}
              </label>
              <input
                id="rep-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="rep-end"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                End Date {customEnd ? `(${formatDateDDMMYYYY(customEnd)})` : ''}
              </label>
              <input
                id="rep-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selected Period Total</p>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white font-mono-num mt-0.5">
              {formatINR(filteredTotal, true)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{dateRange.label}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Transactions in Period</p>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white font-mono-num mt-0.5">
              {filteredExpenses.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {dailyLineData.length > 0
                ? `Avg ${formatINR(filteredTotal / dailyLineData.length)} per active day`
                : 'No active days'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Largest Single Expense</p>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white font-mono-num mt-0.5">
              {highestTransaction ? formatINR(highestTransaction.amount) : '₹0'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {highestTransaction
                ? `${highestTransaction.description} (${formatDateDDMMYYYY(highestTransaction.date)})`
                : 'No transactions in range'}
            </p>
          </div>
        </div>
      </section>

      {/* 4 Interactive Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* 1. Pie Chart: Category-Wise */}
        <div className="xl:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Category-Wise Expenses (Pie Chart)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Distribution for {dateRange.label}
          </p>
          {categoryBreakdown.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {categoryBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: unknown, name: unknown) => [
                      formatINR(Number(value), true),
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              No category data for {dateRange.label}.
            </div>
          )}
        </div>

        {/* 2. Line Chart: Daily Spending */}
        <div className="xl:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Daily Spending (Line Chart)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Daily spending totals across {dateRange.label}
          </p>
          {dailyLineData.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyLineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="shortLabel" tick={{ fill: chartAxisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
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
                    formatter={(val: unknown) => [formatINR(Number(val), true), 'Daily Total']}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#0F766E"
                    strokeWidth={2.4}
                    dot={{ r: 3, fill: '#0F766E' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              No daily entries in {dateRange.label}.
            </div>
          )}
        </div>

        {/* 3. Bar Chart: Monthly Expenses */}
        <div className="xl:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Monthly Expenses (Bar Chart)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                12-month breakdown for {selectedYear}
              </p>
            </div>
            <select
              aria-label="Select year for monthly chart"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  formatter={(val: unknown) => [formatINR(Number(val), true), `${selectedYear} Expenses`]}
                />
                <Bar dataKey="amount" fill="#0284C7" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Yearly Comparison Chart */}
        <div className="xl:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="mb-4">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Yearly Expense Comparison ({selectedYear} vs {selectedYear - 1})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Month-over-month spending comparison across two years
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyComparisonData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  formatter={(val: unknown, name: unknown) => [formatINR(Number(val), true), `Year ${name}`]}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey={String(selectedYear - 1)} fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey={String(selectedYear)} fill="#0F766E" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Category-Wise Breakdown Table for Selected Period */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Category Breakdown — {dateRange.label}
            </h3>
          </div>
          <span className="text-sm font-mono-num font-bold text-slate-900 dark:text-white">
            {formatINR(filteredTotal, true)}
          </span>
        </div>
        {categoryBreakdown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Category</th>
                  <th className="py-3 px-5 text-right">Transactions</th>
                  <th className="py-3 px-5 text-right">Amount</th>
                  <th className="py-3 px-5 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {categoryBreakdown.map((row) => (
                  <tr key={row.name}>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="font-medium text-slate-900 dark:text-white">
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right font-mono-num text-slate-600 dark:text-slate-400">
                      {row.count}
                    </td>
                    <td className="py-3 px-5 text-right font-mono-num font-semibold text-slate-900 dark:text-white">
                      {formatINR(row.total, true)}
                    </td>
                    <td className="py-3 px-5 text-right font-mono-num text-slate-600 dark:text-slate-400">
                      {row.share.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No expenses found in this period.
          </div>
        )}
      </section>
    </div>
  );
}
