import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColors } from '@/components/Themed';
import AddTaskInput from '@/components/AddTaskInput';
import TaskItem from '@/components/TaskItem';
import CategoryPicker from '@/components/CategoryPicker';
import AddCategoryModal from '@/components/AddCategoryModal';
import {
  Task,
  Category,
  addTask,
  getPendingTasks,
  getDoneTodayTasks,
  completeTask,
  undoTask,
  deleteTask,
  updateTaskOrder,
  getCategories,
  addCategory,
  deleteCategory,
} from '@/lib/sync';

export default function TodayScreen() {
  const colors = useColors();
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const loadTasks = useCallback(async () => {
    const [pending, done, cats] = await Promise.all([
      getPendingTasks(),
      getDoneTodayTasks(),
      getCategories(),
    ]);
    setPendingTasks(pending);
    setDoneTasks(done);
    setCategories(cats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );

  const handleAdd = async (title: string, description?: string, categoryId?: number) => {
    await addTask(title, description, categoryId);
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

  const handleAddCategory = async (name: string, color: string) => {
    await addCategory(name, color);
    await loadTasks();
  };

  const handleDeleteCategory = async (id: number) => {
    if (filterCategoryId === id) setFilterCategoryId(null);
    await deleteCategory(id);
    await loadTasks();
  };

  const filteredPending = filterCategoryId != null
    ? pendingTasks.filter((t) => Number(t.category_id) === filterCategoryId)
    : pendingTasks;

  const filteredDone = filterCategoryId != null
    ? doneTasks.filter((t) => Number(t.category_id) === filterCategoryId)
    : doneTasks;

  const handleDragEnd = async ({ data }: { data: Task[] }) => {
    if (filterCategoryId != null) {
      const filteredIds = new Set(data.map((t) => t.id));
      const others = pendingTasks.filter((t) => !filteredIds.has(t.id));
      setPendingTasks([...others, ...data].sort((a, b) => a.order_index - b.order_index));
    } else {
      setPendingTasks(data);
    }
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

  const doneFooter = (
    <View style={[styles.doneSection, { borderTopColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.done }]}>
        Done Today{' '}
        <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
          ({filteredDone.length})
        </Text>
      </Text>
      {filteredDone.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks here</Text>
      ) : (
        filteredDone.map((item) => (
          <TaskItem key={item.id} task={item} onUndo={handleUndo} />
        ))
      )}
    </View>
  );

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.container}>
          <AddTaskInput onAdd={handleAdd} categories={categories} />

          <CategoryPicker
            categories={categories}
            selectedId={filterCategoryId}
            onSelect={setFilterCategoryId}
            showAll
            onAdd={() => setShowAddCategory(true)}
            onDelete={handleDeleteCategory}
          />

          <View style={styles.content}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Pending{' '}
              <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
                ({filteredPending.length})
              </Text>
            </Text>
            {filteredPending.length === 0 ? (
              <View style={styles.container}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks here</Text>
                {doneFooter}
              </View>
            ) : (
              <DraggableFlatList
                data={filteredPending}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderPendingItem}
                onDragEnd={handleDragEnd}
                activationDistance={10}
                ListFooterComponent={doneFooter}
                containerStyle={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>

      <AddCategoryModal
        visible={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        onAdd={handleAddCategory}
      />
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
  doneSection: {
    borderTopWidth: 1,
    paddingTop: 4,
    marginTop: 8,
    paddingBottom: 20,
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
