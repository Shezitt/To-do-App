import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './Themed';
import CategoryPicker from './CategoryPicker';
import { Category } from '@/lib/database';

interface AddTaskInputProps {
  onAdd: (title: string, description?: string, categoryId?: number) => void;
  categories: Category[];
}

export default function AddTaskInput({ onAdd, categories }: AddTaskInputProps) {
  const colors = useColors();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const handleAdd = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onAdd(trimmedTitle, description.trim() || undefined, selectedCategoryId || undefined);
    setTitle('');
    setDescription('');
    setShowDescription(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground }]}
          placeholder="Add a new task..."
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={() => setShowDescription(!showDescription)}
          style={[styles.iconButton, { backgroundColor: showDescription ? colors.tint + '20' : 'transparent' }]}>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={showDescription ? colors.tint : colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAdd}
          style={[styles.addButton, { backgroundColor: colors.tint }]}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      {showDescription && (
        <TextInput
          style={[
            styles.descriptionInput,
            { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border },
          ]}
          placeholder="Add description (optional)..."
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      )}
      {categories.length > 0 && (
        <CategoryPicker
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    marginLeft: 6,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  descriptionInput: {
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
