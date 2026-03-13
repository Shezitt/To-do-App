import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { api } from './api';
import {
  Task,
  Category,
  getDatabase,
  getPendingTasks,
  getDoneTodayTasks,
  getTasksByDate,
  getCompletedDates,
  searchTasks,
  getCategories,
} from './database';

const completionSound = require('@/assets/sounds/complete.wav');
const completionPlayer = createAudioPlayer(completionSound);

const undoSound = require('@/assets/sounds/undo.wav');
const undoPlayer = createAudioPlayer(undoSound);

export type { Task, Category };

// Re-export read operations unchanged (always read from local SQLite)
export { getPendingTasks, getDoneTodayTasks, getTasksByDate, getCompletedDates, searchTasks, getCategories };

export async function addCategory(name: string, color: string): Promise<void> {
  const database = await getDatabase();
  try {
    const serverCat = await api.createCategory(name, color);
    await database.runAsync(
      `INSERT OR REPLACE INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
      [serverCat.id, serverCat.name, serverCat.color, serverCat.created_at]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, adding category locally:', error);
    await database.runAsync(`INSERT INTO categories (name, color) VALUES (?, ?)`, [name, color]);
  }
}

export async function deleteCategory(id: number): Promise<void> {
  const database = await getDatabase();
  try {
    await api.deleteCategory(id);
  } catch (error) {
    console.warn('[sync] API unreachable, deleting category locally only:', error);
  }
  await database.runAsync(`UPDATE tasks SET category_id = NULL WHERE category_id = ?`, [id]);
  await database.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
}

/**
 * Pull all tasks from the API and replace local SQLite data.
 * Called on app start to ensure local cache matches server.
 */
export async function syncFromServer(): Promise<void> {
  try {
    const database = await getDatabase();

    // Sync categories
    try {
      const remoteCategories = await api.getCategories();
      await database.execAsync(`DELETE FROM categories`);
      for (const cat of remoteCategories) {
        await database.runAsync(
          `INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
          [cat.id, cat.name, cat.color, cat.created_at]
        );
      }
      console.log(`[sync] Synced ${remoteCategories.length} categories from server`);
    } catch (catError) {
      console.warn('[sync] Failed to sync categories, using local:', catError);
    }

    // Sync tasks — preserve local category_id if server doesn't support it yet
    const remoteTasks = await api.getTasks();
    const localTasks = await database.getAllAsync<{ id: number; category_id: number | null }>(
      `SELECT id, category_id FROM tasks`
    );
    const localCategoryMap = new Map(localTasks.map((t) => [t.id, t.category_id]));

    await database.execAsync(`DELETE FROM tasks`);

    for (const task of remoteTasks) {
      const resolvedCategoryId = task.category_id ?? localCategoryMap.get(task.id) ?? null;
      await database.runAsync(
        `INSERT INTO tasks (id, title, description, status, order_index, completed_date, completed_at, category_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.title,
          task.description,
          task.status,
          task.order_index,
          task.completed_date,
          task.completed_at,
          resolvedCategoryId,
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
export async function addTask(title: string, description?: string, categoryId?: number): Promise<void> {
  const database = await getDatabase();

  try {
    const serverTask = await api.createTask(title, description || null, categoryId || null);
    await database.runAsync(
      `INSERT INTO tasks (id, title, description, status, order_index, category_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [serverTask.id, serverTask.title, serverTask.description, serverTask.status, serverTask.order_index, serverTask.category_id ?? categoryId ?? null, serverTask.created_at]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, adding locally:', error);
    const result = await database.getFirstAsync<{ max_order: number | null }>(
      `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
    );
    const nextOrder = (result?.max_order ?? -1) + 1;
    await database.runAsync(
      `INSERT INTO tasks (title, description, status, order_index, category_id) VALUES (?, ?, 'pending', ?, ?)`,
      [title, description || null, nextOrder, categoryId || null]
    );
  }
}

/**
 * Complete a task: API first, then update locally. Plays a sound on completion.
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

  // Haptic feedback (instant) + sound
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  try {
    completionPlayer.seekTo(0);
    completionPlayer.play();
  } catch (err) {
    console.warn('[sync] Failed to play completion sound:', err);
  }
}

/**
 * Undo a task: API first, then update locally.
 */
export async function undoTask(id: number): Promise<void> {
  const database = await getDatabase();

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  try {
    undoPlayer.seekTo(0);
    undoPlayer.play();
  } catch (err) {
    console.warn('[sync] Failed to play undo sound:', err);
  }

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
