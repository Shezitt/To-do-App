import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, Keyboard, TouchableWithoutFeedback, Alert, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  syncFromServer,
} from '@/lib/sync';

export default function TodayScreen() {
  const colors = useColors();
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncFromServer();
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

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

  const totalToday = pendingTasks.length + doneTasks.length;
  const allDone = pendingTasks.length === 0 && doneTasks.length > 0;
  const noTasksYet = pendingTasks.length === 0 && doneTasks.length === 0;

  const emptyPendingState = (
    <View style={styles.emptyContainer}>
      {allDone ? (
        <>
          <Ionicons name="checkmark-circle" size={56} color={colors.done} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All done for today!</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Great work, keep it up</Text>
        </>
      ) : (
        <>
          <Ionicons name="list-outline" size={56} color={colors.textSecondary + '50'} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No tasks yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary + '80' }]}>Add one above to get started</Text>
        </>
      )}
    </View>
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
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nothing completed yet</Text>
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

          {totalToday > 0 && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: allDone ? colors.done : colors.tint,
                      width: `${(doneTasks.length / totalToday) * 100}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                {doneTasks.length}/{totalToday} done
              </Text>
            </View>
          )}

          <View style={styles.content}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Pending{' '}
              <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
                ({filteredPending.length})
              </Text>
            </Text>
            {filteredPending.length === 0 ? (
              <ScrollView
                style={styles.container}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.tint} colors={[colors.tint]} />
                }
              >
                {emptyPendingState}
                {doneFooter}
              </ScrollView>
            ) : (
              <DraggableFlatList
                data={filteredPending}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderPendingItem}
                onDragEnd={handleDragEnd}
                activationDistance={10}
                ListFooterComponent={doneFooter}
                containerStyle={{ flex: 1 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.tint} colors={[colors.tint]} />
                }
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 4,
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'right',
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
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 15,
  },
});
