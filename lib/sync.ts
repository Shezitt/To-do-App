import { api } from './api';
import {
  Task,
  getDatabase,
  getPendingTasks,
  getDoneTodayTasks,
  getTasksByDate,
  getCompletedDates,
  searchTasks,
} from './database';

export type { Task };

// Re-export read operations unchanged (always read from local SQLite)
export { getPendingTasks, getDoneTodayTasks, getTasksByDate, getCompletedDates, searchTasks };

/**
 * Pull all tasks from the API and replace local SQLite data.
 * Called on app start to ensure local cache matches server.
 */
export async function syncFromServer(): Promise<void> {
  try {
    const remoteTasks = await api.getTasks();
    const database = await getDatabase();

    await database.execAsync(`DELETE FROM tasks`);

    for (const task of remoteTasks) {
      await database.runAsync(
        `INSERT INTO tasks (id, title, description, status, order_index, completed_date, completed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.title,
          task.description,
          task.status,
          task.order_index,
          task.completed_date,
          task.completed_at,
          task.created_at,
        ]
      );
    }
    console.log(`[sync] Synced ${remoteTasks.length} tasks from server`);
  } catch (error) {
    console.warn('[sync] Failed to sync from server, using local data:', error);
  }
}

/**
 * Add a task: API first, then store locally with server ID.
 * Falls back to local-only if API is unreachable.
 */
export async function addTask(title: string, description?: string): Promise<void> {
  const database = await getDatabase();

  try {
    const serverTask = await api.createTask(title, description || null);
    await database.runAsync(
      `INSERT INTO tasks (id, title, description, status, order_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [serverTask.id, serverTask.title, serverTask.description, serverTask.status, serverTask.order_index, serverTask.created_at]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, adding locally:', error);
    const result = await database.getFirstAsync<{ max_order: number | null }>(
      `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
    );
    const nextOrder = (result?.max_order ?? -1) + 1;
    await database.runAsync(
      `INSERT INTO tasks (title, description, status, order_index) VALUES (?, ?, 'pending', ?)`,
      [title, description || null, nextOrder]
    );
  }
}

/**
 * Complete a task: API first, then update locally.
 */
export async function completeTask(id: number): Promise<void> {
  const database = await getDatabase();

  try {
    const serverTask = await api.completeTask(id);
    await database.runAsync(
      `UPDATE tasks SET status = 'done', completed_date = ?, completed_at = ? WHERE id = ?`,
      [serverTask.completed_date, serverTask.completed_at, id]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, completing locally:', error);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await database.runAsync(
      `UPDATE tasks SET status = 'done', completed_date = ?, completed_at = ? WHERE id = ?`,
      [today, now.toISOString(), id]
    );
  }
}

/**
 * Undo a task: API first, then update locally.
 */
export async function undoTask(id: number): Promise<void> {
  const database = await getDatabase();

  try {
    const serverTask = await api.undoTask(id);
    await database.runAsync(
      `UPDATE tasks SET status = 'pending', completed_date = NULL, completed_at = NULL, order_index = ? WHERE id = ?`,
      [serverTask.order_index, id]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, undoing locally:', error);
    const result = await database.getFirstAsync<{ max_order: number | null }>(
      `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
    );
    const nextOrder = (result?.max_order ?? -1) + 1;
    await database.runAsync(
      `UPDATE tasks SET status = 'pending', completed_date = NULL, completed_at = NULL, order_index = ? WHERE id = ?`,
      [nextOrder, id]
    );
  }
}

/**
 * Delete a task: API first, then delete locally.
 */
export async function deleteTask(id: number): Promise<void> {
  const database = await getDatabase();

  try {
    await api.deleteTask(id);
  } catch (error) {
    console.warn('[sync] API unreachable, deleting locally only:', error);
  }

  await database.runAsync(`DELETE FROM tasks WHERE id = ?`, [id]);
}

/**
 * Update task order: API first, then update locally.
 */
export async function updateTaskOrder(tasks: { id: number; order_index: number }[]): Promise<void> {
  const database = await getDatabase();

  try {
    await api.reorder(tasks);
  } catch (error) {
    console.warn('[sync] API unreachable, reordering locally only:', error);
  }

  for (const task of tasks) {
    await database.runAsync(
      `UPDATE tasks SET order_index = ? WHERE id = ?`,
      [task.order_index, task.id]
    );
  }
}
