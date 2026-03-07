import React, { useState, useCallback } from 'react';
import { StyleSheet, FlatList, View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Calendar, DateData } from 'react-native-calendars';

import { useColors } from '@/components/Themed';
import TaskItem from '@/components/TaskItem';
import { Task, getTasksByDate, getCompletedDates } from '@/lib/database';
import Colors from '@/constants/Colors';

export default function HistoryScreen() {
  const colors = useColors();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});

  const loadMarkedDates = useCallback(async () => {
    const dates = await getCompletedDates();
    const marked: Record<string, any> = {};
    dates.forEach((date) => {
      marked[date] = { marked: true, dotColor: Colors.primary };
    });
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: Colors.primary,
      };
    }
    setMarkedDates(marked);
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadMarkedDates();
    }, [loadMarkedDates])
  );

  const handleDayPress = async (day: DateData) => {
    setSelectedDate(day.dateString);
    const dayTasks = await getTasksByDate(day.dateString);
    setTasks(dayTasks);

    const dates = await getCompletedDates();
    const marked: Record<string, any> = {};
    dates.forEach((date) => {
      marked[date] = { marked: true, dotColor: Colors.primary };
    });
    marked[day.dateString] = {
      ...marked[day.dateString],
      selected: true,
      selectedColor: Colors.primary,
    };
    setMarkedDates(marked);
  };

  const renderItem = ({ item }: { item: Task }) => <TaskItem task={item} readOnly />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={markedDates}
        maxDate={new Date().toISOString().split('T')[0]}
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.surface,
          textSectionTitleColor: colors.textSecondary,
          selectedDayBackgroundColor: Colors.primary,
          selectedDayTextColor: '#ffffff',
          todayTextColor: Colors.accent,
          dayTextColor: colors.text,
          textDisabledColor: colors.textSecondary + '60',
          monthTextColor: colors.text,
          arrowColor: colors.tint,
        }}
        style={[styles.calendar, { borderColor: colors.border }]}
      />

      <View style={styles.taskList}>
        {selectedDate && (
          <Text style={[styles.dateTitle, { color: colors.text }]}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        )}
        {selectedDate && tasks.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks here</Text>
        )}
        {!selectedDate && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Select a date to view completed tasks
          </Text>
        )}
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  calendar: {
    borderBottomWidth: 1,
  },
  taskList: {
    flex: 1,
    paddingTop: 8,
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 20,
    marginVertical: 8,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 20,
  },
});
