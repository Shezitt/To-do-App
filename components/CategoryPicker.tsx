import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './Themed';
import { Category } from '@/lib/database';

interface CategoryPickerProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  showAll?: boolean;
  onAdd?: () => void;
  onDelete?: (id: number) => void;
}

export default function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  showAll,
  onAdd,
  onDelete,
}: CategoryPickerProps) {
  const colors = useColors();

  const handleLongPress = (cat: Category) => {
    if (!onDelete) return;
    Alert.alert(
      'Delete Category',
      `Delete "${cat.name}"? Tasks using it will become uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(cat.id),
        },
      ]
    );
  };

  if (categories.length === 0 && !onAdd) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}>
      {showAll && (
        <TouchableOpacity
          onPress={() => onSelect(null)}
          style={[
            styles.chip,
            {
              backgroundColor: selectedId === null ? colors.tint : colors.surface,
              borderColor: selectedId === null ? colors.tint : colors.border,
            },
          ]}>
          <Text
            style={[
              styles.chipText,
              { color: selectedId === null ? '#FFFFFF' : colors.textSecondary },
            ]}>
            All
          </Text>
        </TouchableOpacity>
      )}
      {categories.map((cat) => {
        const isSelected = selectedId === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            onPress={() => onSelect(isSelected && !showAll ? null : cat.id)}
            onLongPress={() => handleLongPress(cat)}
            delayLongPress={500}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? cat.color : colors.surface,
                borderColor: isSelected ? cat.color : colors.border,
              },
            ]}>
            <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : cat.color }]} />
            <Text
              style={[
                styles.chipText,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        );
      })}
      {onAdd && (
        <TouchableOpacity
          onPress={onAdd}
          style={[styles.addChip, { borderColor: colors.border }]}>
          <Ionicons name="add" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 50,
  },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  addChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
