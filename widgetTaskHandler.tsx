import React from 'react';
import { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { TaskWidget } from './widgets/TaskWidget';
import { getDatabase } from './lib/database';
import { api } from './lib/api';

async function getPendingTasks() {
  try {
    const db = await getDatabase();
    return db.getAllAsync<{ id: number; title: string }>(
      `SELECT id, title FROM tasks WHERE status = 'pending' ORDER BY order_index ASC`
    );
  } catch {
    return [];
  }
}

async function quickSync() {
  try {
    const db = await getDatabase();
    const remoteTasks = await api.getTasks();
    await db.execAsync(`DELETE FROM tasks`);
    for (const task of remoteTasks) {
      await db.runAsync(
        `INSERT INTO tasks (id, title, description, status, order_index, completed_date, completed_at, category_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [task.id, task.title, task.description, task.status, task.order_index,
         task.completed_date, task.completed_at, task.category_id, task.created_at]
      );
    }
  } catch {
    // API unreachable, just use local data
  }
}

async function renderTaskWidget(renderWidget: WidgetTaskHandlerProps['renderWidget']) {
  const tasks = await getPendingTasks();
  renderWidget(
    <TaskWidget
      tasks={tasks}
      pendingCount={tasks.length}
      allDone={tasks.length === 0}
    />
  );
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, renderWidget, clickAction } = props;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await renderTaskWidget(renderWidget);
      break;

    case 'WIDGET_CLICK':
      if (clickAction === 'REFRESH') {
        await quickSync();
        await renderTaskWidget(renderWidget);
      }
      break;

    default:
      break;
  }
}
