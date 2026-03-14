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
const undoSound = require('@/assets/sounds/undo.wav');

let completionPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let undoPlayer: ReturnType<typeof createAudioPlayer> | null = null;

function getCompletionPlayer() {
  if (!completionPlayer) completionPlayer = createAudioPlayer(completionSound);
  return completionPlayer;
}

function getUndoPlayer() {
  if (!undoPlayer) undoPlayer = createAudioPlayer(undoSound);
  return undoPlayer;
}

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
 * Push local-only tasks to the server.
 * Compares local SQLite tasks against server tasks by ID,
 * and creates any missing ones on the server.
 */
async function pushLocalToServer(): Promise<void> {
  const database = await getDatabase();

  // Push local-only categories first
  const remoteCategories = await api.getCategories();
  const remoteCatIds = new Set(remoteCategories.map((c) => c.id));
  const localCategories = await database.getAllAsync<{ id: number; name: string; color: string }>(
    `SELECT id, name, color FROM categories`
  );
  let catIdMap = new Map<number, number>(); // local ID → server ID
  for (const cat of localCategories) {
    if (!remoteCatIds.has(cat.id)) {
      try {
        const serverCat = await api.createCategory(cat.name, cat.color);
        catIdMap.set(cat.id, serverCat.id);
        console.log(`[sync] Pushed local category "${cat.name}" → server ID ${serverCat.id}`);
      } catch (err) {
        console.warn(`[sync] Failed to push category "${cat.name}":`, err);
      }
    }
  }

  // Push local-only tasks
  const remoteTasks = await api.getTasks();
  const remoteTaskIds = new Set(remoteTasks.map((t) => t.id));
  const localTasks = await database.getAllAsync<{
    id: number; title: string; description: string | null;
    status: string; order_index: number; completed_date: string | null;
    completed_at: string | null; category_id: number | null;
  }>(`SELECT id, title, description, status, order_index, completed_date, completed_at, category_id FROM tasks`);

  let pushed = 0;
  for (const task of localTasks) {
    if (!remoteTaskIds.has(task.id)) {
      try {
        const resolvedCatId = task.category_id ? (catIdMap.get(task.category_id) ?? task.category_id) : null;
        const serverTask = await api.createTask(task.title, task.description, resolvedCatId);
        // If it was completed locally, complete it on server too
        if (task.status === 'done') {
          await api.completeTask(serverTask.id);
        }
        // Update local ID to match server
        await database.runAsync(`UPDATE tasks SET id = ? WHERE id = ?`, [serverTask.id, task.id]);
        pushed++;
      } catch (err) {
        console.warn(`[sync] Failed to push task "${task.title}":`, err);
      }
    }
  }
  if (pushed > 0) {
    console.log(`[sync] Pushed ${pushed} local-only tasks to server`);
  }
}

/**
 * Pull all tasks from the API and replace local SQLite data.
 * Called on app start to ensure local cache matches server.
 * First pushes any local-only data to the server.
 */
export async function syncFromServer(): Promise<void> {
  try {
    const database = await getDatabase();

    // Push local-only data to server first
    try {
      await pushLocalToServer();
    } catch (err) {
      console.warn('[sync] Failed to push local data to server:', err);
    }

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

    // Sync tasks
    const remoteTasks = await api.getTasks();
    await database.execAsync(`DELETE FROM tasks`);

    for (const task of remoteTasks) {
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
          task.category_id,
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
    const player = getCompletionPlayer();
    player.seekTo(0);
    player.play();
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
    const player = getUndoPlayer();
    player.seekTo(0);
    player.play();
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
