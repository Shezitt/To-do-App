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

async function initDB(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME);
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      order_index INTEGER NOT NULL DEFAULT 0,
      completed_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  const cols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(tasks)`);
  if (!cols.some((c) => c.name === 'completed_at')) {
    await database.execAsync(`ALTER TABLE tasks ADD COLUMN completed_at TEXT`);
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
  created_at: string;
}

export async function addTask(title: string, description?: string): Promise<void> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ max_order: number | null }>(
    `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
  );
  const nextOrder = (result?.max_order ?? -1) + 1;
  await database.runAsync(
    `INSERT INTO tasks (title, description, status, order_index) VALUES (?, ?, 'pending', ?)`,
    [title, description || null, nextOrder]
  );
}

export async function getPendingTasks(): Promise<Task[]> {
  const database = await getDatabase();
  return database.getAllAsync<Task>(
    `SELECT * FROM tasks WHERE status = 'pending' ORDER BY order_index ASC`
  );
}

export async function getDoneTodayTasks(): Promise<Task[]> {
  const database = await getDatabase();
  const today = getLocalDateString();
  return database.getAllAsync<Task>(
    `SELECT * FROM tasks WHERE status = 'done' AND completed_date = ? ORDER BY completed_at ASC`,
    [today]
  );
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  const database = await getDatabase();
  return database.getAllAsync<Task>(
    `SELECT * FROM tasks WHERE status = 'done' AND completed_date = ? ORDER BY completed_at ASC`,
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

export async function updateTaskOrder(tasks: { id: number; order_index: number }[]): Promise<void> {
  const database = await getDatabase();
  for (const task of tasks) {
    await database.runAsync(
      `UPDATE tasks SET order_index = ? WHERE id = ?`,
      [task.order_index, task.id]
    );
  }
}
