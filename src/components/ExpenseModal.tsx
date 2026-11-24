import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { PAYMENT_METHODS, type Category, type Expense, type PaymentMethod } from '../types/expense';
import { formatDateDDMMYYYY, getTodayISO } from '../utils/format';

export interface ExpenseFormData {
  amount: number;
  categoryId: string;
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  notes: string;
}

interface ExpenseModalProps {
  open: boolean;
  categories: Category[];
  initialExpense: Expense | null;
  defaultCategoryId?: string;
  onClose: () => void;
  onSave: (data: ExpenseFormData, existingId?: string) => Promise<void>;
}

export function ExpenseModal({
  open,
  categories,
  initialExpense,
  defaultCategoryId,
  onClose,
  onSave,
}: ExpenseModalProps) {
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialExpense) {
      setAmount(String(initialExpense.amount));
      setCategoryId(initialExpense.categoryId);
      setDescription(initialExpense.description);
      setDate(initialExpense.date);
      setPaymentMethod(initialExpense.paymentMethod);
      setNotes(initialExpense.notes || '');
    } else {
      setAmount('');
      setCategoryId(defaultCategoryId || categories[0]?.id || '');
      setDescription('');
      setDate(getTodayISO());
      setPaymentMethod('UPI');
      setNotes('');
    }
  }, [open, initialExpense, defaultCategoryId, categories]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid expense amount greater than ₹0.');
      return;
    }
    if (!categoryId) {
      setError('Please select a category.');
      return;
    }
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setError('Please enter a short expense description.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Please choose a valid date.');
      return;
    }

    setSaving(true);
    try {
      await onSave(
        {
          amount: Math.round(parsedAmount * 100) / 100,
          categoryId,
          description: trimmedDesc,
          date,
          paymentMethod,
          notes: notes.trim(),
        },
        initialExpense?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="expense-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white"
            >
              {initialExpense ? 'Edit Expense' : 'Add New Expense'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {initialExpense
                ? 'Update transaction details and recalculate totals.'
                : 'Log a new transaction in Indian Rupees (₹).'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="exp-amount"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  ₹
                </span>
                <input
                  id="exp-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="exp-date"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Date ({formatDateDDMMYYYY(date)}) *
              </label>
              <input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="exp-category"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Expense Category *
            </label>
            <select
              id="exp-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="exp-desc"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Expense Description *
            </label>
            <input
              id="exp-desc"
              type="text"
              maxLength={160}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly vegetables and groceries"
              required
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Payment Method *
            </span>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    paymentMethod === method
                      ? 'bg-teal-700 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-600'
                      : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="exp-notes"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Optional Notes
            </label>
            <textarea
              id="exp-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bill reference, merchant name, or extra details..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500 resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : initialExpense ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
