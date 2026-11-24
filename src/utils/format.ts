import type { DateFilterPreset, Expense } from '../types/expense';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const inrExactFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number, exact = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return exact ? inrExactFormatter.format(safe) : inrFormatter.format(safe);
}

export function formatNumberIN(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatCompactINR(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayISO(): string {
  return toISODate(new Date());
}

export function formatDateDDMMYYYY(isoDate: string): string {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function getQuarterBounds(year: number, quarterIndex: number): { start: string; end: string; label: string } {
  const startMonth = quarterIndex * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return {
    start: toISODate(start),
    end: toISODate(end),
    label: `Q${quarterIndex + 1} ${year}`,
  };
}

export const DATE_PRESET_OPTIONS: Array<{ value: DateFilterPreset; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Previous Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'previousQuarter', label: 'Previous Quarter' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'previousYear', label: 'Previous Year' },
  { value: 'custom', label: 'Custom Date Range' },
];

export function getDateRangeForPreset(
  preset: DateFilterPreset,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): { start: string | null; end: string | null; label: string } {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const d = referenceDate.getDate();

  switch (preset) {
    case 'all':
      return { start: null, end: null, label: 'All Time' };
    case 'today': {
      const today = toISODate(referenceDate);
      return { start: today, end: today, label: `Today (${formatDateDDMMYYYY(today)})` };
    }
    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      const iso = toISODate(yest);
      return { start: iso, end: iso, label: `Yesterday (${formatDateDDMMYYYY(iso)})` };
    }
    case 'last7days': {
      const start = toISODate(new Date(y, m, d - 6));
      const end = toISODate(referenceDate);
      return {
        start,
        end,
        label: `${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}`,
      };
    }
    case 'thisWeek': {
      const dayOfWeek = referenceDate.getDay(); // 0=Sun, 1=Mon
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const startDate = new Date(y, m, d - diffToMonday);
      const endDate = new Date(y, m, d - diffToMonday + 6);
      const start = toISODate(startDate);
      const end = toISODate(endDate);
      return {
        start,
        end,
        label: `This Week (${formatDateDDMMYYYY(start)} – ${formatDateDDMMYYYY(end)})`,
      };
    }
    case 'thisMonth': {
      const start = toISODate(new Date(y, m, 1));
      const end = toISODate(new Date(y, m + 1, 0));
      const monthName = referenceDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      return { start, end, label: monthName };
    }
    case 'previousMonth': {
      const prev = new Date(y, m - 1, 1);
      const start = toISODate(prev);
      const end = toISODate(new Date(y, m, 0));
      const monthName = prev.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      return { start, end, label: monthName };
    }
    case 'thisQuarter': {
      const q = Math.floor(m / 3);
      return getQuarterBounds(y, q);
    }
    case 'previousQuarter': {
      const q = Math.floor(m / 3);
      if (q === 0) {
        return getQuarterBounds(y - 1, 3);
      }
      return getQuarterBounds(y, q - 1);
    }
    case 'thisYear':
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Year ${y}` };
    case 'previousYear':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: `Year ${y - 1}` };
    case 'custom': {
      const start = customStart || null;
      const end = customEnd || null;
      if (start && end) {
        return {
          start,
          end,
          label: `${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}`,
        };
      }
      if (start) {
        return { start, end: null, label: `From ${formatDateDDMMYYYY(start)}` };
      }
      if (end) {
        return { start: null, end, label: `Up to ${formatDateDDMMYYYY(end)}` };
      }
      return { start: null, end: null, label: 'Custom Date Range' };
    }
  }
}

export function filterExpensesByRange(
  expenses: Expense[],
  start: string | null,
  end: string | null
): Expense[] {
  if (!start && !end) return expenses;
  return expenses.filter((exp) => {
    if (start && exp.date < start) return false;
    if (end && exp.date > end) return false;
    return true;
  });
}

export function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function calculateDelta(current: number, previous: number): {
  diff: number;
  pct: number | null;
  trend: 'up' | 'down' | 'flat';
} {
  const diff = current - previous;
  const trend = diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : 'flat';
  const pct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return { diff, pct, trend };
}
