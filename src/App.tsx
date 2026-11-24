import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Database,
  IndianRupee,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  Plus,
  Sun,
  Tags,
  Wallet,
  X,
} from 'lucide-react';
import type { Category, Expense, UserProfile } from './types/expense';
import { ApiError, apiRequest, setAuthToken } from './utils/api';
import { AuthView } from './components/AuthView';
import { BudgetsView } from './components/BudgetsView';
import { CategoriesView, type CategoryFormData } from './components/CategoriesView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DashboardView } from './components/DashboardView';
import { DataBackupView } from './components/DataBackupView';
import { ExpenseModal, type ExpenseFormData } from './components/ExpenseModal';
import { ReportsView } from './components/ReportsView';
import { TransactionsView } from './components/TransactionsView';

type AppTab = 'dashboard' | 'transactions' | 'categories' | 'reports' | 'budgets' | 'backup';

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ListOrdered },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'reports', label: 'Reports & Charts', icon: BarChart3 },
  { id: 'budgets', label: 'Budgets', icon: Wallet },
  { id: 'backup', label: 'Data & Backup', icon: Database },
];

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('mep_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    }
    return 'light';
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [txInitialCategory, setTxInitialCategory] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deletingExpenseLoading, setDeletingExpenseLoading] = useState(false);

  const [deletingCategory, setDeletingCategory] = useState<{
    category: Category;
    txCount: number;
  } | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [deletingCategoryLoading, setDeletingCategoryLoading] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('mep_theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setDataLoading(true);
    setGlobalError('');
    try {
      const [meRes, catRes, expRes] = await Promise.all([
        apiRequest<{ user: UserProfile }>('/api/auth/me'),
        apiRequest<{ categories: Category[] }>('/api/categories'),
        apiRequest<{ expenses: Expense[] }>('/api/expenses'),
      ]);
      setUser(meRes.user);
      setCategories(catRes.categories);
      setExpenses(expRes.expenses);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        setUser(null);
        setCategories([]);
        setExpenses([]);
      } else {
        setGlobalError(err instanceof Error ? err.message : 'Unable to load workspace data.');
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const res = await apiRequest<{ user: UserProfile }>('/api/auth/me');
        if (!active) return;
        setUser(res.user);
        await loadWorkspaceData();
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [loadWorkspaceData]);

  async function handleAuthenticated(loggedInUser: UserProfile) {
    setUser(loggedInUser);
    await loadWorkspaceData();
  }

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed to clear local session state regardless
    }
    setAuthToken(null);
    setUser(null);
    setCategories([]);
    setExpenses([]);
    setActiveTab('dashboard');
  }

  async function handleSaveExpense(data: ExpenseFormData, existingId?: string) {
    if (existingId) {
      const res = await apiRequest<{ expense: Expense }>(`/api/expenses/${existingId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setExpenses((prev) =>
        prev
          .map((item) => (item.id === existingId ? res.expense : item))
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      );
    } else {
      const res = await apiRequest<{ expense: Expense }>('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setExpenses((prev) =>
        [res.expense, ...prev].sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
        )
      );
    }
  }

  async function confirmDeleteExpense() {
    if (!deletingExpense) return;
    setDeletingExpenseLoading(true);
    try {
      await apiRequest(`/api/expenses/${deletingExpense.id}`, { method: 'DELETE' });
      setExpenses((prev) => prev.filter((item) => item.id !== deletingExpense.id));
      setDeletingExpense(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Unable to delete expense.');
    } finally {
      setDeletingExpenseLoading(false);
    }
  }

  async function handleCreateCategory(data: CategoryFormData) {
    const res = await apiRequest<{ category: Category }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setCategories((prev) =>
      [...prev, res.category].sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    );
  }

  async function handleUpdateCategory(id: string, data: CategoryFormData) {
    const res = await apiRequest<{ category: Category }>(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setCategories((prev) => prev.map((c) => (c.id === id ? res.category : c)));
  }

  function requestDeleteCategory(category: Category, txCount: number) {
    const fallback =
      categories.find((c) => c.id !== category.id && c.name.toLowerCase() === 'other expenses') ||
      categories.find((c) => c.id !== category.id);
    setReassignTargetId(fallback?.id || '');
    setDeletingCategory({ category, txCount });
  }

  async function confirmDeleteCategory() {
    if (!deletingCategory) return;
    setDeletingCategoryLoading(true);
    try {
      const res = await apiRequest<{
        deletedId: string;
        reassignedToCategoryId: string | null;
      }>(`/api/categories/${deletingCategory.category.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reassignToCategoryId: reassignTargetId || undefined }),
      });

      setCategories((prev) => prev.filter((c) => c.id !== res.deletedId));
      if (res.reassignedToCategoryId) {
        setExpenses((prev) =>
          prev.map((exp) =>
            exp.categoryId === res.deletedId
              ? { ...exp, categoryId: res.reassignedToCategoryId! }
              : exp
          )
        );
      }
      setDeletingCategory(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Unable to delete category.');
    } finally {
      setDeletingCategoryLoading(false);
    }
  }

  async function handleSaveMonthlyBudget(amount: number) {
    const res = await apiRequest<{ user: UserProfile }>('/api/user/budget', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudget: amount }),
    });
    setUser(res.user);
  }

  async function handleSaveCategoryBudget(category: Category, budgetLimit: number) {
    await handleUpdateCategory(category.id, {
      name: category.name,
      color: category.color,
      icon: category.icon,
      budgetLimit,
    });
  }

  const activeNavLabel = useMemo(
    () => NAV_ITEMS.find((item) => item.id === activeTab)?.label || 'Dashboard',
    [activeTab]
  );

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center mx-auto">
            <IndianRupee className="w-5 h-5" aria-hidden="true" />
          </div>
          <p className="font-display text-base font-semibold text-slate-800 dark:text-slate-200">
            Loading My Expense Manager Pro...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        theme={theme}
        onToggleTheme={toggleTheme}
        onAuthenticated={(u) => void handleAuthenticated(u)}
      />
    );
  }

  const reassignmentOptions = categories.filter(
    (c) => c.id !== deletingCategory?.category.id
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-700 dark:bg-teal-600 text-white flex items-center justify-center shrink-0">
              <IndianRupee className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">
              My Expense Manager Pro
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'transactions') setTxInitialCategory('all');
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {user.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                {activeNavLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setExpenseModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add Expense</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {globalError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center justify-between gap-3 text-sm text-red-700 dark:text-red-300"
            >
              <span>{globalError}</span>
              <button
                type="button"
                onClick={() => setGlobalError('')}
                className="text-xs font-semibold underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {dataLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  expenses={expenses}
                  categories={categories}
                  monthlyBudget={user.monthlyBudget}
                  isDark={theme === 'dark'}
                  onAddExpense={() => {
                    setEditingExpense(null);
                    setExpenseModalOpen(true);
                  }}
                  onEditExpense={(exp) => {
                    setEditingExpense(exp);
                    setExpenseModalOpen(true);
                  }}
                  onDeleteExpense={(exp) => setDeletingExpense(exp)}
                  onNavigate={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'transactions' && (
                <TransactionsView
                  expenses={expenses}
                  categories={categories}
                  userName={user.name}
                  initialCategoryFilter={txInitialCategory}
                  onAddExpense={() => {
                    setEditingExpense(null);
                    setExpenseModalOpen(true);
                  }}
                  onEditExpense={(exp) => {
                    setEditingExpense(exp);
                    setExpenseModalOpen(true);
                  }}
                  onDeleteExpense={(exp) => setDeletingExpense(exp)}
                />
              )}

              {activeTab === 'categories' && (
                <CategoriesView
                  categories={categories}
                  expenses={expenses}
                  isDark={theme === 'dark'}
                  onCreateCategory={handleCreateCategory}
                  onUpdateCategory={handleUpdateCategory}
                  onDeleteCategory={requestDeleteCategory}
                  onViewCategoryTransactions={(catId) => {
                    setTxInitialCategory(catId);
                    setActiveTab('transactions');
                  }}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsView
                  expenses={expenses}
                  categories={categories}
                  userName={user.name}
                  isDark={theme === 'dark'}
                />
              )}

              {activeTab === 'budgets' && (
                <BudgetsView
                  monthlyBudget={user.monthlyBudget}
                  categories={categories}
                  expenses={expenses}
                  onSaveMonthlyBudget={handleSaveMonthlyBudget}
                  onSaveCategoryBudget={handleSaveCategoryBudget}
                />
              )}

              {activeTab === 'backup' && (
                <DataBackupView
                  expenses={expenses}
                  categories={categories}
                  userName={user.name}
                  onRestored={loadWorkspaceData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Add / Edit Expense Modal */}
      <ExpenseModal
        open={expenseModalOpen}
        categories={categories}
        initialExpense={editingExpense}
        onClose={() => {
          setExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        onSave={handleSaveExpense}
      />

      {/* Delete Expense Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Delete Expense"
        description={
          deletingExpense
            ? `Are you sure you want to delete "${deletingExpense.description}"? All dashboard totals, charts, and category summaries will update immediately.`
            : ''
        }
        confirmLabel="Delete Expense"
        loading={deletingExpenseLoading}
        onConfirm={() => void confirmDeleteExpense()}
        onCancel={() => setDeletingExpense(null)}
      />

      {/* Delete Category Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingCategory)}
        title={`Delete Category "${deletingCategory?.category.name || ''}"?`}
        description={
          deletingCategory && deletingCategory.txCount > 0
            ? `This category has ${deletingCategory.txCount} ${
                deletingCategory.txCount === 1 ? 'transaction' : 'transactions'
              }. Choose another category to move those transactions into before deleting.`
            : 'Are you sure you want to delete this category? This cannot be undone.'
        }
        confirmLabel="Delete Category"
        loading={deletingCategoryLoading}
        onConfirm={() => void confirmDeleteCategory()}
        onCancel={() => setDeletingCategory(null)}
      >
        {deletingCategory && deletingCategory.txCount > 0 && (
          <div>
            <label
              htmlFor="reassign-category-select"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
            >
              Move existing transactions to:
            </label>
            <select
              id="reassign-category-select"
              value={reassignTargetId}
              onChange={(e) => setReassignTargetId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {reassignmentOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
