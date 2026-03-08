import React, { useState, useCallback } from 'react';
import { StyleSheet, FlatList, View, Text, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColors } from '@/components/Themed';
import AddTaskInput from '@/components/AddTaskInput';
import TaskItem from '@/components/TaskItem';
import {
  Task,
  addTask,
  getPendingTasks,
  getDoneTodayTasks,
  completeTask,
  undoTask,
  deleteTask,
  updateTaskOrder,
} from '@/lib/database';

export default function TodayScreen() {
  const colors = useColors();
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    const [pending, done] = await Promise.all([getPendingTasks(), getDoneTodayTasks()]);
    setPendingTasks(pending);
    setDoneTasks(done);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );

  const handleAdd = async (title: string, description?: string) => {
    await addTask(title, description);
    await loadTasks();
  };

  const handleComplete = async (id: number) => {
    await completeTask(id);
    await loadTasks();
  };

  const handleUndo = async (id: number) => {
    await undoTask(id);
    await loadTasks();
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTask(id);
            await loadTasks();
          },
        },
      ]
    );
  };

  const handleDragEnd = async ({ data }: { data: Task[] }) => {
    setPendingTasks(data);
    const updates = data.map((task, index) => ({ id: task.id, order_index: index }));
    await updateTaskOrder(updates);
  };

  const renderPendingItem = ({ item, drag, isActive }: RenderItemParams<Task>) => (
    <ScaleDecorator>
      <TaskItem
        task={item}
        onComplete={handleComplete}
        onDelete={handleDelete}
        isDragging={isActive}
      />
    </ScaleDecorator>
  );

  const renderDoneItem = ({ item }: { item: Task }) => (
    <TaskItem task={item} onUndo={handleUndo} />
  );

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.container}>
      <AddTaskInput onAdd={handleAdd} />

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Pending{' '}
            <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
              ({pendingTasks.length})
            </Text>
          </Text>
          {pendingTasks.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks here</Text>
          ) : (
            <DraggableFlatList
              data={pendingTasks}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderPendingItem}
              onDragEnd={handleDragEnd}
              activationDistance={10}
            />
          )}
        </View>

        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.done }]}>
            Done Today{' '}
            <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
              ({doneTasks.length})
            </Text>
          </Text>
          {doneTasks.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks here</Text>
          ) : (
            <FlatList
              data={doneTasks}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderDoneItem}
              scrollEnabled={false}
            />
          )}
        </View>
      </View>
        </View>
      </TouchableWithoutFeedback>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  section: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 20,
    marginVertical: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 15,
  },
});
