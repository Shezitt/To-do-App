import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Pressable,
  LayoutAnimation,
  View,
  Text,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './Themed';
import { Task } from '@/lib/database';


interface TaskItemProps {
  task: Task;
  onComplete?: (id: number) => void;
  onUndo?: (id: number) => void;
  onDelete?: (id: number) => void;
  isDragging?: boolean;
  readOnly?: boolean;
  onDrag?: () => void;
}

export default function TaskItem({
  task,
  onComplete,
  onUndo,
  onDelete,
  isDragging,
  readOnly,
  onDrag,
}: TaskItemProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const isDone = task.status === 'done';
  const showCheck = isDone || completing;
  const checkScale = useRef(new Animated.Value(1)).current;

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
          borderLeftColor: task.category_color ?? colors.border,
          borderLeftWidth: task.category_color ? 3 : 1,
          opacity: isDragging ? 0.8 : 1,
          transform: isDragging ? [{ scale: 1.03 }] : [{ scale: 1 }],
        },
      ]}>
      <View style={styles.row}>
        {!readOnly && (
          <Pressable
            onPress={() => {
              if (isDone && onUndo) {
                Animated.sequence([
                  Animated.spring(checkScale, { toValue: 0.7, useNativeDriver: true, speed: 40, bounciness: 0 }),
                  Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }),
                ]).start();
                onUndo(task.id);
              } else if (!isDone && onComplete) {
                setCompleting(true);
                Animated.sequence([
                  Animated.spring(checkScale, { toValue: 1.5, useNativeDriver: true, speed: 40, bounciness: 20 }),
                  Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
                ]).start();
                onComplete(task.id);
              }
            }}
            hitSlop={8}
            style={styles.checkbox}>
            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
              <Ionicons
                name={showCheck ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                color={showCheck ? colors.done : colors.tint}
              />
            </Animated.View>
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
          {task.category_name && task.category_color && (
            <View style={[styles.categoryBadge, { backgroundColor: task.category_color + '20' }]}>
              <View style={[styles.categoryDot, { backgroundColor: task.category_color }]} />
              <Text style={[styles.categoryText, { color: task.category_color }]}>
                {task.category_name}
              </Text>
            </View>
          )}
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
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
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
