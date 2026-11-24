export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank';

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank'];

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  monthlyBudget: number;
  createdAt: string;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
  budgetLimit: number;
  createdAt: string;
}

export interface Expense {
  id: string;
  userId: string;
  categoryId: string;
  amount: number;
  description: string;
  date: string; // Stored as YYYY-MM-DD, always formatted as DD-MM-YYYY in UI
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type DateFilterPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'thisWeek'
  | 'thisMonth'
  | 'previousMonth'
  | 'thisQuarter'
  | 'previousQuarter'
  | 'thisYear'
  | 'previousYear'
  | 'custom';

export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: string;
  monthlyBudget: number;
  categories: Array<{
    id?: string;
    name: string;
    color: string;
    icon: string;
    isDefault?: boolean;
    budgetLimit: number;
  }>;
  expenses: Array<{
    id?: string;
    categoryName: string;
    categoryId?: string;
    amount: number;
    description: string;
    date: string;
    paymentMethod: PaymentMethod;
    notes: string;
  }>;
}
