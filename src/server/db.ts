import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'expenses.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    monthly_budget REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    budget_limit REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'UPI', 'Card', 'Bank')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

export interface DefaultCategorySeed {
  name: string;
  color: string;
  icon: string;
}

export const DEFAULT_CATEGORIES: DefaultCategorySeed[] = [
  { name: 'Grocery', color: '#0D9488', icon: 'ShoppingCart' },
  { name: 'Milk', color: '#0284C7', icon: 'Milk' },
  { name: 'Petrol', color: '#D97706', icon: 'Fuel' },
  { name: 'Diesel', color: '#B45309', icon: 'Fuel' },
  { name: 'Electricity Bill', color: '#CA8A04', icon: 'Zap' },
  { name: 'Water Bill', color: '#0EA5E9', icon: 'Droplets' },
  { name: 'Mobile Recharge', color: '#6366F1', icon: 'Smartphone' },
  { name: 'Internet Bill', color: '#4F46E5', icon: 'Wifi' },
  { name: 'House Rent', color: '#7C3AED', icon: 'Home' },
  { name: 'Medical', color: '#DC2626', icon: 'HeartPulse' },
  { name: 'Education', color: '#2563EB', icon: 'GraduationCap' },
  { name: 'Shopping', color: '#DB2777', icon: 'ShoppingBag' },
  { name: 'Travel', color: '#059669', icon: 'Plane' },
  { name: 'Food', color: '#EA580C', icon: 'Utensils' },
  { name: 'Cigarette', color: '#E11D48', icon: 'Cigarette' },
  { name: 'Other Expenses', color: '#64748B', icon: 'Package' },
];

export function seedDefaultCategoriesForUser(userId: string): void {
  const now = new Date().toISOString();
  const insertStmt = db.prepare(
    `INSERT INTO categories (id, user_id, name, color, icon, is_default, budget_limit, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, ?)`
  );
  for (const cat of DEFAULT_CATEGORIES) {
    insertStmt.run(crypto.randomUUID(), userId, cat.name, cat.color, cat.icon, now);
  }
}

// Ensure any existing accounts created before Cigarette was added receive it automatically
function ensureNewDefaultCategoriesForExistingUsers(): void {
  const existingUsers = db.prepare(`SELECT id FROM users`).all() as Array<{ id: string }>;
  if (existingUsers.length === 0) return;

  const hasCategoryStmt = db.prepare(
    `SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)`
  );
  const insertStmt = db.prepare(
    `INSERT INTO categories (id, user_id, name, color, icon, is_default, budget_limit, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, ?)`
  );
  const now = new Date().toISOString();

  for (const user of existingUsers) {
    for (const cat of DEFAULT_CATEGORIES) {
      const exists = hasCategoryStmt.get(user.id, cat.name);
      if (!exists) {
        insertStmt.run(crypto.randomUUID(), user.id, cat.name, cat.color, cat.icon, now);
      }
    }
  }
}

ensureNewDefaultCategoriesForExistingUsers();
