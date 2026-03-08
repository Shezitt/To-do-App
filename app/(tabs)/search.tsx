import React, { useState } from 'react';
import {
  StyleSheet,
  FlatList,
  View,
  Text,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '@/components/Themed';
import TaskItem from '@/components/TaskItem';
import { Task, searchTasks } from '@/lib/database';

export default function SearchScreen() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Task[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    const found = await searchTasks(text.trim());
    setResults(found);
    setHasSearched(true);
  };

  const renderItem = ({ item }: { item: Task }) => <TaskItem task={item} readOnly />;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search completed tasks..."
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>

        {!hasSearched && (
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            Search by task title or description
          </Text>
        )}
        {hasSearched && results.length === 0 && (
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>No tasks found</Text>
        )}
        {hasSearched && results.length > 0 && (
          <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  hintText: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 15,
  },
  resultCount: {
    marginHorizontal: 20,
    marginVertical: 8,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 20,
  },
});
