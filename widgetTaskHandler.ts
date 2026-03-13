import { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { renderReactNativeWidget } from 'react-native-android-widget';
import { TaskWidget } from './widgets/TaskWidget';
import { getDatabase } from './lib/database';

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

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, renderWidget } = props;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const tasks = await getPendingTasks();
      renderWidget(
        <TaskWidget
          tasks={tasks}
          pendingCount={tasks.length}
          allDone={false}
        />
      );
      break;
    }

    case 'WIDGET_CLICK': {
      // Opens the app when tapped — handled by the library automatically
      break;
    }

    default:
      break;
  }
}
