import crypto from 'node:crypto';
import express from 'express';
import type { Response } from 'express';
import { db, seedDefaultCategoriesForUser } from './db.ts';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  requireAuth,
  revokeSession,
  setSessionCookie,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';

const VALID_PAYMENT_METHODS = new Set(['Cash', 'UPI', 'Card', 'Bank']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function mapCategoryRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    color: String(row.color),
    icon: String(row.icon),
    isDefault: Number(row.is_default) === 1,
    budgetLimit: Number(row.budget_limit || 0),
    createdAt: String(row.created_at),
  };
}

function mapExpenseRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    categoryId: String(row.category_id),
    amount: Number(row.amount),
    description: String(row.description),
    date: String(row.date),
    paymentMethod: String(row.payment_method),
    notes: String(row.notes || ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const apiRouter = express.Router();

// --- AUTH ROUTES ---

apiRouter.post('/auth/register', (req, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    return;
  }
  if (!EMAIL_REGEX.test(email) || email.length > 160) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  try {
    db.exec('BEGIN');
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, monthly_budget, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).run(userId, name, email, passwordHash, now);
    seedDefaultCategoriesForUser(userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Unable to create account. Please try again.' });
    return;
  }

  const token = createSession(userId);
  setSessionCookie(req, res, token);

  res.status(201).json({
    user: {
      id: userId,
      name,
      email,
      monthlyBudget: 0,
      createdAt: now,
    },
    token,
  });
});

apiRouter.post('/auth/login', (req, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!EMAIL_REGEX.test(email) || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const userRow = db
    .prepare(
      `SELECT id, name, email, password_hash, monthly_budget, created_at
       FROM users WHERE email = ?`
    )
    .get(email) as
    | {
        id: string;
        name: string;
        email: string;
        password_hash: string;
        monthly_budget: number;
        created_at: string;
      }
    | undefined;

  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = createSession(userRow.id);
  setSessionCookie(req, res, token);

  res.json({
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      monthlyBudget: Number(userRow.monthly_budget || 0),
      createdAt: userRow.created_at,
    },
    token,
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.authToken) {
    revokeSession(req.authToken);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.authUser });
});

// --- USER BUDGET ROUTE ---

apiRouter.put('/user/budget', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const body = req.body as Record<string, unknown>;
  const monthlyBudget = Number(body?.monthlyBudget);

  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0 || monthlyBudget > 1_000_000_000) {
    res.status(400).json({ error: 'Monthly budget must be a valid non-negative amount.' });
    return;
  }

  db.prepare(`UPDATE users SET monthly_budget = ? WHERE id = ?`).run(
    Math.round(monthlyBudget * 100) / 100,
    userId
  );

  res.json({
    user: {
      ...req.authUser!,
      monthlyBudget: Math.round(monthlyBudget * 100) / 100,
    },
  });
});

// --- CATEGORY ROUTES ---

apiRouter.get('/categories', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const rows = db
    .prepare(
      `SELECT id, user_id, name, color, icon, is_default, budget_limit, created_at
       FROM categories
       WHERE user_id = ?
       ORDER BY is_default DESC, name ASC`
    )
    .all(userId) as Record<string, unknown>[];

  res.json({ categories: rows.map(mapCategoryRow) });
});

apiRouter.post('/categories', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const body = req.body as Record<string, unknown>;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const color = typeof body?.color === 'string' && HEX_COLOR_REGEX.test(body.color) ? body.color : '#0D9488';
  const icon = typeof body?.icon === 'string' && body.icon.trim().length > 0 ? body.icon.trim().slice(0, 40) : 'Tag';
  const budgetLimit = body?.budgetLimit !== undefined ? Number(body.budgetLimit) : 0;

  if (name.length < 1 || name.length > 50) {
    res.status(400).json({ error: 'Category name must be between 1 and 50 characters.' });
    return;
  }
  if (!Number.isFinite(budgetLimit) || budgetLimit < 0 || budgetLimit > 1_000_000_000) {
    res.status(400).json({ error: 'Category budget limit must be a non-negative number.' });
    return;
  }

  const duplicate = db
    .prepare(`SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)`)
    .get(userId, name);
  if (duplicate) {
    res.status(409).json({ error: 'A category with this name already exists.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const roundedBudget = Math.round(budgetLimit * 100) / 100;

  db.prepare(
    `INSERT INTO categories (id, user_id, name, color, icon, is_default, budget_limit, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, userId, name, color, icon, roundedBudget, now);

  res.status(201).json({
    category: {
      id,
      userId,
      name,
      color,
      icon,
      isDefault: false,
      budgetLimit: roundedBudget,
      createdAt: now,
    },
  });
});

apiRouter.put('/categories/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const categoryId = req.params.id;
  const existing = db
    .prepare(`SELECT * FROM categories WHERE id = ? AND user_id = ?`)
    .get(categoryId, userId) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = typeof body?.name === 'string' ? body.name.trim() : String(existing.name);
  const color =
    typeof body?.color === 'string' && HEX_COLOR_REGEX.test(body.color)
      ? body.color
      : String(existing.color);
  const icon =
    typeof body?.icon === 'string' && body.icon.trim().length > 0
      ? body.icon.trim().slice(0, 40)
      : String(existing.icon);
  const budgetLimit =
    body?.budgetLimit !== undefined ? Number(body.budgetLimit) : Number(existing.budget_limit || 0);

  if (name.length < 1 || name.length > 50) {
    res.status(400).json({ error: 'Category name must be between 1 and 50 characters.' });
    return;
  }
  if (!Number.isFinite(budgetLimit) || budgetLimit < 0 || budgetLimit > 1_000_000_000) {
    res.status(400).json({ error: 'Category budget limit must be a non-negative number.' });
    return;
  }

  const duplicate = db
    .prepare(`SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?) AND id != ?`)
    .get(userId, name, categoryId);
  if (duplicate) {
    res.status(409).json({ error: 'Another category with this name already exists.' });
    return;
  }

  const roundedBudget = Math.round(budgetLimit * 100) / 100;
  db.prepare(
    `UPDATE categories SET name = ?, color = ?, icon = ?, budget_limit = ? WHERE id = ? AND user_id = ?`
  ).run(name, color, icon, roundedBudget, categoryId, userId);

  res.json({
    category: {
      id: categoryId,
      userId,
      name,
      color,
      icon,
      isDefault: Number(existing.is_default) === 1,
      budgetLimit: roundedBudget,
      createdAt: String(existing.created_at),
    },
  });
});

apiRouter.delete('/categories/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const categoryId = req.params.id;
  const existing = db
    .prepare(`SELECT id, name FROM categories WHERE id = ? AND user_id = ?`)
    .get(categoryId, userId) as { id: string; name: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }

  const totalCategories = db
    .prepare(`SELECT COUNT(*) AS cnt FROM categories WHERE user_id = ?`)
    .get(userId) as { cnt: number };

  if (totalCategories.cnt <= 1) {
    res.status(400).json({ error: 'You must keep at least one category.' });
    return;
  }

  const usage = db
    .prepare(`SELECT COUNT(*) AS cnt FROM expenses WHERE user_id = ? AND category_id = ?`)
    .get(userId, categoryId) as { cnt: number };

  const body = (req.body || {}) as Record<string, unknown>;
  let reassignToId =
    typeof body.reassignToCategoryId === 'string'
      ? body.reassignToCategoryId
      : typeof req.query.reassignToCategoryId === 'string'
        ? req.query.reassignToCategoryId
        : '';

  if (usage.cnt > 0) {
    if (!reassignToId || reassignToId === categoryId) {
      const fallback = db
        .prepare(
          `SELECT id FROM categories WHERE user_id = ? AND id != ?
           ORDER BY CASE WHEN LOWER(name) = 'other expenses' THEN 0 ELSE 1 END, name ASC LIMIT 1`
        )
        .get(userId, categoryId) as { id: string } | undefined;
      if (!fallback) {
        res.status(400).json({ error: 'Cannot delete category without a reassignment target.' });
        return;
      }
      reassignToId = fallback.id;
    } else {
      const target = db
        .prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`)
        .get(reassignToId, userId);
      if (!target) {
        res.status(400).json({ error: 'Target reassignment category not found.' });
        return;
      }
    }
  }

  try {
    db.exec('BEGIN');
    if (usage.cnt > 0 && reassignToId) {
      db.prepare(`UPDATE expenses SET category_id = ?, updated_at = ? WHERE user_id = ? AND category_id = ?`).run(
        reassignToId,
        new Date().toISOString(),
        userId,
        categoryId
      );
    }
    db.prepare(`DELETE FROM categories WHERE id = ? AND user_id = ?`).run(categoryId, userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Delete category failed:', err);
    res.status(500).json({ error: 'Failed to delete category.' });
    return;
  }

  res.json({ deletedId: categoryId, reassignedToCategoryId: usage.cnt > 0 ? reassignToId : null });
});

// --- EXPENSE ROUTES ---

apiRouter.get('/expenses', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const rows = db
    .prepare(
      `SELECT id, user_id, category_id, amount, description, date, payment_method, notes, created_at, updated_at
       FROM expenses
       WHERE user_id = ?
       ORDER BY date DESC, created_at DESC`
    )
    .all(userId) as Record<string, unknown>[];

  res.json({ expenses: rows.map(mapExpenseRow) });
});

apiRouter.post('/expenses', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const body = req.body as Record<string, unknown>;

  const categoryId = typeof body?.categoryId === 'string' ? body.categoryId.trim() : '';
  const amount = Number(body?.amount);
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const date = typeof body?.date === 'string' ? body.date.trim() : '';
  const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod.trim() : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

  if (!categoryId) {
    res.status(400).json({ error: 'Please select an expense category.' });
    return;
  }
  const catExists = db
    .prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`)
    .get(categoryId, userId);
  if (!catExists) {
    res.status(400).json({ error: 'Selected category does not exist.' });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    res.status(400).json({ error: 'Amount must be greater than zero.' });
    return;
  }
  if (description.length < 1 || description.length > 160) {
    res.status(400).json({ error: 'Description must be between 1 and 160 characters.' });
    return;
  }
  if (!isValidCalendarDate(date)) {
    res.status(400).json({ error: 'Please enter a valid date.' });
    return;
  }
  if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
    res.status(400).json({ error: 'Payment method must be Cash, UPI, Card, or Bank.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const roundedAmount = Math.round(amount * 100) / 100;

  db.prepare(
    `INSERT INTO expenses (id, user_id, category_id, amount, description, date, payment_method, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, categoryId, roundedAmount, description, date, paymentMethod, notes, now, now);

  res.status(201).json({
    expense: {
      id,
      userId,
      categoryId,
      amount: roundedAmount,
      description,
      date,
      paymentMethod,
      notes,
      createdAt: now,
      updatedAt: now,
    },
  });
});

apiRouter.put('/expenses/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const expenseId = req.params.id;
  const existing = db
    .prepare(`SELECT * FROM expenses WHERE id = ? AND user_id = ?`)
    .get(expenseId, userId) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Expense not found.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const categoryId = typeof body?.categoryId === 'string' ? body.categoryId.trim() : '';
  const amount = Number(body?.amount);
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const date = typeof body?.date === 'string' ? body.date.trim() : '';
  const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod.trim() : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

  const catExists = db
    .prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`)
    .get(categoryId, userId);
  if (!catExists) {
    res.status(400).json({ error: 'Selected category does not exist.' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    res.status(400).json({ error: 'Amount must be greater than zero.' });
    return;
  }
  if (description.length < 1 || description.length > 160) {
    res.status(400).json({ error: 'Description must be between 1 and 160 characters.' });
    return;
  }
  if (!isValidCalendarDate(date)) {
    res.status(400).json({ error: 'Please enter a valid date.' });
    return;
  }
  if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
    res.status(400).json({ error: 'Payment method must be Cash, UPI, Card, or Bank.' });
    return;
  }

  const updatedAt = new Date().toISOString();
  const roundedAmount = Math.round(amount * 100) / 100;

  db.prepare(
    `UPDATE expenses
     SET category_id = ?, amount = ?, description = ?, date = ?, payment_method = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(categoryId, roundedAmount, description, date, paymentMethod, notes, updatedAt, expenseId, userId);

  res.json({
    expense: {
      id: expenseId,
      userId,
      categoryId,
      amount: roundedAmount,
      description,
      date,
      paymentMethod,
      notes,
      createdAt: String(existing.created_at),
      updatedAt,
    },
  });
});

apiRouter.delete('/expenses/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const expenseId = req.params.id;
  const result = db
    .prepare(`DELETE FROM expenses WHERE id = ? AND user_id = ?`)
    .run(expenseId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Expense not found.' });
    return;
  }

  res.json({ deletedId: expenseId });
});

// --- BACKUP & RESTORE ROUTES ---

apiRouter.get('/backup', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const categories = db
    .prepare(
      `SELECT id, name, color, icon, is_default, budget_limit
       FROM categories WHERE user_id = ? ORDER BY is_default DESC, name ASC`
    )
    .all(user.id) as Record<string, unknown>[];

  const categoryNameMap = new Map<string, string>();
  const exportedCategories = categories.map((c) => {
    const id = String(c.id);
    const name = String(c.name);
    categoryNameMap.set(id, name);
    return {
      id,
      name,
      color: String(c.color),
      icon: String(c.icon),
      isDefault: Number(c.is_default) === 1,
      budgetLimit: Number(c.budget_limit || 0),
    };
  });

  const expenses = db
    .prepare(
      `SELECT id, category_id, amount, description, date, payment_method, notes
       FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC`
    )
    .all(user.id) as Record<string, unknown>[];

  const exportedExpenses = expenses.map((e) => ({
    id: String(e.id),
    categoryId: String(e.category_id),
    categoryName: categoryNameMap.get(String(e.category_id)) || 'Other Expenses',
    amount: Number(e.amount),
    description: String(e.description),
    date: String(e.date),
    paymentMethod: String(e.payment_method),
    notes: String(e.notes || ''),
  }));

  res.json({
    app: 'My Expense Manager Pro',
    version: 1,
    exportedAt: new Date().toISOString(),
    monthlyBudget: user.monthlyBudget,
    categories: exportedCategories,
    expenses: exportedExpenses,
  });
});

apiRouter.post('/restore', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUser!.id;
  const body = req.body as Record<string, unknown>;
  const mode = body?.mode === 'replace' ? 'replace' : 'merge';
  const payload = body?.backup as Record<string, unknown> | undefined;

  if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.expenses)) {
    res.status(400).json({ error: 'Invalid backup file structure.' });
    return;
  }

  if (payload.categories.length > 200 || payload.expenses.length > 50000) {
    res.status(400).json({ error: 'Backup exceeds allowed record limits.' });
    return;
  }

  const now = new Date().toISOString();
  const monthlyBudget = Number(payload.monthlyBudget);

  try {
    db.exec('BEGIN');

    if (mode === 'replace') {
      db.prepare(`DELETE FROM expenses WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM categories WHERE user_id = ?`).run(userId);
      if (Number.isFinite(monthlyBudget) && monthlyBudget >= 0 && monthlyBudget <= 1_000_000_000) {
        db.prepare(`UPDATE users SET monthly_budget = ? WHERE id = ?`).run(
          Math.round(monthlyBudget * 100) / 100,
          userId
        );
      }
    } else if (
      Number.isFinite(monthlyBudget) &&
      monthlyBudget > 0 &&
      req.authUser!.monthlyBudget === 0 &&
      monthlyBudget <= 1_000_000_000
    ) {
      db.prepare(`UPDATE users SET monthly_budget = ? WHERE id = ?`).run(
        Math.round(monthlyBudget * 100) / 100,
        userId
      );
    }

    const existingCats = db
      .prepare(`SELECT id, name FROM categories WHERE user_id = ?`)
      .all(userId) as Array<{ id: string; name: string }>;

    const nameToCatId = new Map<string, string>();
    const oldIdToNewId = new Map<string, string>();

    for (const c of existingCats) {
      nameToCatId.set(c.name.toLowerCase(), c.id);
    }

    const insertCat = db.prepare(
      `INSERT INTO categories (id, user_id, name, color, icon, is_default, budget_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const rawCat of payload.categories) {
      if (!rawCat || typeof rawCat !== 'object') continue;
      const cat = rawCat as Record<string, unknown>;
      const catName = typeof cat.name === 'string' ? cat.name.trim().slice(0, 50) : '';
      if (!catName) continue;

      const existingId = nameToCatId.get(catName.toLowerCase());
      if (existingId) {
        if (typeof cat.id === 'string') oldIdToNewId.set(cat.id, existingId);
        continue;
      }

      const newId = crypto.randomUUID();
      const color =
        typeof cat.color === 'string' && HEX_COLOR_REGEX.test(cat.color) ? cat.color : '#0D9488';
      const icon =
        typeof cat.icon === 'string' && cat.icon.trim() ? cat.icon.trim().slice(0, 40) : 'Tag';
      const isDefault = cat.isDefault ? 1 : 0;
      const budgetLimit =
        Number.isFinite(Number(cat.budgetLimit)) && Number(cat.budgetLimit) >= 0
          ? Math.round(Number(cat.budgetLimit) * 100) / 100
          : 0;

      insertCat.run(newId, userId, catName, color, icon, isDefault, budgetLimit, now);
      nameToCatId.set(catName.toLowerCase(), newId);
      if (typeof cat.id === 'string') {
        oldIdToNewId.set(cat.id, newId);
      }
    }

    // Ensure at least one fallback category exists
    if (nameToCatId.size === 0) {
      seedDefaultCategoriesForUser(userId);
      const seeded = db
        .prepare(`SELECT id, name FROM categories WHERE user_id = ?`)
        .all(userId) as Array<{ id: string; name: string }>;
      for (const s of seeded) {
        nameToCatId.set(s.name.toLowerCase(), s.id);
      }
    }

    let fallbackId = nameToCatId.get('other expenses');
    if (!fallbackId) {
      fallbackId = Array.from(nameToCatId.values())[0];
    }

    const insertExpense = db.prepare(
      `INSERT INTO expenses (id, user_id, category_id, amount, description, date, payment_method, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let importedCount = 0;
    for (const rawExp of payload.expenses) {
      if (!rawExp || typeof rawExp !== 'object') continue;
      const exp = rawExp as Record<string, unknown>;
      const amount = Number(exp.amount);
      const description =
        typeof exp.description === 'string' ? exp.description.trim().slice(0, 160) : '';
      const date = typeof exp.date === 'string' ? exp.date.trim() : '';
      const paymentMethod =
        typeof exp.paymentMethod === 'string' && VALID_PAYMENT_METHODS.has(exp.paymentMethod)
          ? exp.paymentMethod
          : 'UPI';
      const notes = typeof exp.notes === 'string' ? exp.notes.trim().slice(0, 500) : '';

      if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) continue;
      if (!description || !isValidCalendarDate(date)) continue;

      let resolvedCatId: string | undefined;
      if (typeof exp.categoryId === 'string' && oldIdToNewId.has(exp.categoryId)) {
        resolvedCatId = oldIdToNewId.get(exp.categoryId);
      }
      if (!resolvedCatId && typeof exp.categoryName === 'string') {
        resolvedCatId = nameToCatId.get(exp.categoryName.trim().toLowerCase());
      }
      if (!resolvedCatId) {
        resolvedCatId = fallbackId;
      }

      insertExpense.run(
        crypto.randomUUID(),
        userId,
        resolvedCatId!,
        Math.round(amount * 100) / 100,
        description,
        date,
        paymentMethod,
        notes,
        now,
        now
      );
      importedCount++;
    }

    db.exec('COMMIT');

    res.json({
      ok: true,
      importedExpenses: importedCount,
      categoriesCount: nameToCatId.size,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Restore failed:', err);
    res.status(500).json({ error: 'Failed to restore backup data.' });
  }
});
