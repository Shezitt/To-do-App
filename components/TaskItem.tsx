import React, { useState } from 'react';
import {
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './Themed';
import { Task } from '@/lib/database';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TaskItemProps {
  task: Task;
  onComplete?: (id: number) => void;
  onUndo?: (id: number) => void;
  onDelete?: (id: number) => void;
  isDragging?: boolean;
  readOnly?: boolean;
}

export default function TaskItem({
  task,
  onComplete,
  onUndo,
  onDelete,
  isDragging,
  readOnly,
}: TaskItemProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const isDone = task.status === 'done';

  const toggleExpand = () => {
    if (task.description) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(!expanded);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: isDragging ? 0.8 : 1,
          transform: isDragging ? [{ scale: 1.03 }] : [{ scale: 1 }],
        },
      ]}>
      <View style={styles.row}>
        {!readOnly && (
          <Pressable
            onPress={() => {
              if (isDone && onUndo) onUndo(task.id);
              else if (!isDone && onComplete) onComplete(task.id);
            }}
            hitSlop={8}
            style={styles.checkbox}>
            <Ionicons
              name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={isDone ? colors.done : colors.tint}
            />
          </Pressable>
        )}
        {readOnly && (
          <View style={styles.checkbox}>
            <Ionicons name="checkmark-circle" size={26} color={colors.done} />
          </View>
        )}

        <Pressable onPress={toggleExpand} style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              { color: colors.text },
              isDone && { textDecorationLine: 'line-through', color: colors.textSecondary },
            ]}
            numberOfLines={expanded ? undefined : 1}>
            {task.title}
          </Text>
          {task.description && !expanded && (
            <Text style={[styles.descriptionHint, { color: colors.textSecondary }]} numberOfLines={1}>
              {task.description}
            </Text>
          )}
          {task.description && expanded && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {task.description}
            </Text>
          )}
        </Pressable>

        {!readOnly && !isDone && onDelete && (
          <Pressable onPress={() => onDelete(task.id)} hitSlop={8} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        )}

        {task.description && (
          <Pressable onPress={toggleExpand} hitSlop={8} style={styles.expandIcon}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
  },
  descriptionHint: {
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  description: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  deleteButton: {
    padding: 6,
    marginLeft: 4,
  },
  expandIcon: {
    marginLeft: 4,
  },
});
