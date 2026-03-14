import React from 'react';
import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { requestWidgetUpdate } from 'react-native-android-widget';
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
  enqueue,
  getQueueItems,
  removeQueueItem,
} from './database';
import { TaskWidget } from '../widgets/TaskWidget';

// ── Widget refresh ──────────────────────────────────────────────

async function refreshWidget() {
  try {
    const tasks = await getPendingTasks();
    const simpleTasks = tasks.map((t) => ({ id: t.id, title: t.title }));
    await requestWidgetUpdate({
      widgetName: 'TaskWidget',
      renderWidget: () =>
        React.createElement(TaskWidget, {
          tasks: simpleTasks,
          pendingCount: simpleTasks.length,
          allDone: simpleTasks.length === 0,
        }),
    });
  } catch {
    // Widget might not be placed, ignore
  }
}

// ── Audio ───────────────────────────────────────────────────────

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

// ── Re-exports (reads always from local SQLite) ─────────────────

export type { Task, Category };
export { getPendingTasks, getDoneTodayTasks, getTasksByDate, getCompletedDates, searchTasks, getCategories };

// ── Queue replay ────────────────────────────────────────────────

async function replayQueue(): Promise<void> {
  const items = await getQueueItems();
  if (items.length === 0) return;

  console.log(`[sync] Replaying ${items.length} queued operations`);

  for (const item of items) {
    const data = JSON.parse(item.data);
    try {
      switch (item.action) {
        case 'create_task': {
          const serverTask = await api.createTask(data.title, data.description, data.categoryId);
          // Update local task ID to match server ID
          const database = await getDatabase();
          if (data.localId) {
            await database.runAsync(`UPDATE tasks SET id = ? WHERE id = ?`, [serverTask.id, data.localId]);
          }
          break;
        }
        case 'complete_task':
          await api.completeTask(data.id);
          break;
        case 'undo_task':
          await api.undoTask(data.id);
          break;
        case 'delete_task':
          await api.deleteTask(data.id);
          break;
        case 'reorder_tasks':
          await api.reorder(data.tasks);
          break;
        case 'create_category': {
          const serverCat = await api.createCategory(data.name, data.color);
          const database = await getDatabase();
          if (data.localId) {
            await database.runAsync(`UPDATE categories SET id = ? WHERE id = ?`, [serverCat.id, data.localId]);
            // Update any tasks referencing the old local category ID
            await database.runAsync(`UPDATE tasks SET category_id = ? WHERE category_id = ?`, [serverCat.id, data.localId]);
          }
          break;
        }
        case 'delete_category':
          await api.deleteCategory(data.id);
          break;
        default:
          console.warn(`[sync] Unknown queue action: ${item.action}`);
      }
      // Remove from queue after successful replay
      await removeQueueItem(item.id);
      console.log(`[sync] Replayed: ${item.action}`);
    } catch (err) {
      console.warn(`[sync] Failed to replay ${item.action}, will retry next sync:`, err);
      // Stop replaying — don't skip items to preserve order
      break;
    }
  }
}

// ── Sync from server ────────────────────────────────────────────

export async function syncFromServer(): Promise<void> {
  try {
    // Replay any queued offline operations first
    await replayQueue();

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
    refreshWidget();
  } catch (error) {
    console.warn('[sync] Failed to sync from server, using local data:', error);
  }
}

// ── Write operations (API first, queue on failure) ──────────────

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
    console.warn('[sync] API unreachable, adding locally + queuing:', error);
    const result = await database.getFirstAsync<{ max_order: number | null }>(
      `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
    );
    const nextOrder = (result?.max_order ?? -1) + 1;
    const insertResult = await database.runAsync(
      `INSERT INTO tasks (title, description, status, order_index, category_id) VALUES (?, ?, 'pending', ?, ?)`,
      [title, description || null, nextOrder, categoryId || null]
    );
    await enqueue('create_task', { title, description: description || null, categoryId: categoryId || null, localId: insertResult.lastInsertRowId });
  }
  refreshWidget();
}

export async function completeTask(id: number): Promise<void> {
  const database = await getDatabase();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  try {
    const serverTask = await api.completeTask(id);
    await database.runAsync(
      `UPDATE tasks SET status = 'done', completed_date = ?, completed_at = ? WHERE id = ?`,
      [serverTask.completed_date, serverTask.completed_at, id]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, completing locally + queuing:', error);
    await database.runAsync(
      `UPDATE tasks SET status = 'done', completed_date = ?, completed_at = ? WHERE id = ?`,
      [today, now.toISOString(), id]
    );
    await enqueue('complete_task', { id });
  }

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  try {
    const player = getCompletionPlayer();
    player.seekTo(0);
    player.play();
  } catch (err) {
    console.warn('[sync] Failed to play completion sound:', err);
  }
  refreshWidget();
}

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
    console.warn('[sync] API unreachable, undoing locally + queuing:', error);
    const result = await database.getFirstAsync<{ max_order: number | null }>(
      `SELECT MAX(order_index) as max_order FROM tasks WHERE status = 'pending'`
    );
    const nextOrder = (result?.max_order ?? -1) + 1;
    await database.runAsync(
      `UPDATE tasks SET status = 'pending', completed_date = NULL, completed_at = NULL, order_index = ? WHERE id = ?`,
      [nextOrder, id]
    );
    await enqueue('undo_task', { id });
  }
  refreshWidget();
}

export async function deleteTask(id: number): Promise<void> {
  const database = await getDatabase();

  try {
    await api.deleteTask(id);
  } catch (error) {
    console.warn('[sync] API unreachable, deleting locally + queuing:', error);
    await enqueue('delete_task', { id });
  }

  await database.runAsync(`DELETE FROM tasks WHERE id = ?`, [id]);
  refreshWidget();
}

export async function updateTaskOrder(tasks: { id: number; order_index: number }[]): Promise<void> {
  const database = await getDatabase();

  try {
    await api.reorder(tasks);
  } catch (error) {
    console.warn('[sync] API unreachable, reordering locally + queuing:', error);
    await enqueue('reorder_tasks', { tasks });
  }

  for (const task of tasks) {
    await database.runAsync(
      `UPDATE tasks SET order_index = ? WHERE id = ?`,
      [task.order_index, task.id]
    );
  }
}

export async function addCategory(name: string, color: string): Promise<void> {
  const database = await getDatabase();
  try {
    const serverCat = await api.createCategory(name, color);
    await database.runAsync(
      `INSERT OR REPLACE INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
      [serverCat.id, serverCat.name, serverCat.color, serverCat.created_at]
    );
  } catch (error) {
    console.warn('[sync] API unreachable, adding category locally + queuing:', error);
    const result = await database.runAsync(`INSERT INTO categories (name, color) VALUES (?, ?)`, [name, color]);
    await enqueue('create_category', { name, color, localId: result.lastInsertRowId });
  }
}

export async function deleteCategory(id: number): Promise<void> {
  const database = await getDatabase();
  try {
    await api.deleteCategory(id);
  } catch (error) {
    console.warn('[sync] API unreachable, deleting category locally + queuing:', error);
    await enqueue('delete_category', { id });
  }
  await database.runAsync(`UPDATE tasks SET category_id = NULL WHERE category_id = ?`, [id]);
  await database.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
}
