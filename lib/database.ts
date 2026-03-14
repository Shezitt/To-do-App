import * as SQLite from 'expo-sqlite';

const DB_NAME = 'tasks.db';

let db: SQLite.SQLiteDatabase | null = null;
let dbReady: Promise<SQLite.SQLiteDatabase> | null = null;

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export const CATEGORY_COLORS = [
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#EC4899', // Pink
  '#8B5CF6', // Violet
  '#14B8A6', // Teal
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#F97316', // Orange
  '#84CC16', // Lime
];

async function initDB(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      order_index INTEGER NOT NULL DEFAULT 0,
      completed_date TEXT,
      completed_at TEXT,
      category_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Migrations for existing databases
  const taskCols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(tasks)`);
  if (!taskCols.some((c) => c.name === 'completed_at')) {
    await database.execAsync(`ALTER TABLE tasks ADD COLUMN completed_at TEXT`);
  }
  if (!taskCols.some((c) => c.name === 'category_id')) {
    await database.execAsync(`ALTER TABLE tasks ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
  }

  db = database;
  return database;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbReady) {
    dbReady = initDB();
  }
  return dbReady;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'pending' | 'done';
  order_index: number;
  completed_date: string | null;
  completed_at: string | null;
  category_id: number | null;
  created_at: string;
  // Joined from categories table (not always present)
  category_name?: string;
  category_color?: string;
}

export async function addTask(title: string, description?: string, categoryId?: number): Promise<void> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ max_order: number | null }>(
    `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
  );
  const nextOrder = (result?.max_order ?? -1) + 1;
  await database.runAsync(
    `INSERT INTO tasks (title, description, status, order_index, category_id) VALUES (?, ?, 'pending', ?, ?)`,
    [title, description || null, nextOrder, categoryId || null]
  );
}

const TASK_SELECT = `SELECT t.*, c.name as category_name, c.color as category_color
  FROM tasks t LEFT JOIN categories c ON t.category_id = c.id`;

export async function getPendingTasks(): Promise<Task[]> {
  const database = await getDatabase();
  return database.getAllAsync<Task>(
    `${TASK_SELECT} WHERE t.status = 'pending' ORDER BY t.order_index ASC`
  );
}

export async function getDoneTodayTasks(): Promise<Task[]> {
  const database = await getDatabase();
  const today = getLocalDateString();
  return database.getAllAsync<Task>(
    `${TASK_SELECT} WHERE t.status = 'done' AND t.completed_date = ? ORDER BY t.completed_at ASC`,
    [today]
  );
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  const database = await getDatabase();
  return database.getAllAsync<Task>(
    `${TASK_SELECT} WHERE t.status = 'done' AND t.completed_date = ? ORDER BY t.completed_at ASC`,
    [date]
  );
}

export async function getCompletedDates(): Promise<string[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ completed_date: string }>(
    `SELECT DISTINCT completed_date FROM tasks WHERE status = 'done' AND completed_date IS NOT NULL`
  );
  return rows.map((r) => r.completed_date);
}

export async function completeTask(id: number): Promise<void> {
  const database = await getDatabase();
  const today = getLocalDateString();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE tasks SET status = 'done', completed_date = ?, completed_at = ? WHERE id = ?`,
    [today, now, id]
  );
}

export async function undoTask(id: number): Promise<void> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ max_order: number | null }>(
    `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
  );
  const nextOrder = (result?.max_order ?? -1) + 1;
  await database.runAsync(
    `UPDATE tasks SET status = 'pending', completed_date = NULL, completed_at = NULL, order_index = ? WHERE id = ?`,
    [nextOrder, id]
  );
}

export async function deleteTask(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM tasks WHERE id = ?`, [id]);
}

export async function searchTasks(query: string): Promise<Task[]> {
  const database = await getDatabase();
  const pattern = `%${query}%`;
  return database.getAllAsync<Task>(
    `${TASK_SELECT} WHERE t.status = 'done' AND (t.title LIKE ? OR t.description LIKE ?) ORDER BY t.completed_at DESC`,
    [pattern, pattern]
  );
}

export async function updateTaskOrder(tasks: { id: number; order_index: number }[]): Promise<void> {
  const database = await getDatabase();
  for (const task of tasks) {
    await database.runAsync(
      `UPDATE tasks SET order_index = ? WHERE id = ?`,
      [task.order_index, task.id]
    );
  }
}

// Sync queue operations

export interface SyncQueueItem {
  id: number;
  action: string;
  data: string;
  created_at: string;
}

export async function enqueue(action: string, data: Record<string, unknown>): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sync_queue (action, data) VALUES (?, ?)`,
    [action, JSON.stringify(data)]
  );
}

export async function getQueueItems(): Promise<SyncQueueItem[]> {
  const database = await getDatabase();
  return database.getAllAsync<SyncQueueItem>(`SELECT * FROM sync_queue ORDER BY id ASC`);
}

export async function removeQueueItem(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

export async function clearQueue(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`DELETE FROM sync_queue`);
}

// Category CRUD

export async function getCategories(): Promise<Category[]> {
  const database = await getDatabase();
  return database.getAllAsync<Category>(`SELECT * FROM categories ORDER BY id ASC`);
}

export async function addCategory(name: string, color: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`INSERT INTO categories (name, color) VALUES (?, ?)`, [name, color]);
}

export async function deleteCategory(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`UPDATE tasks SET category_id = NULL WHERE category_id = ?`, [id]);
  await database.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
}
