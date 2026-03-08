const API_BASE = __DEV__
  ? 'http://192.168.100.48:8000/api'  // Local network IP (for Expo Go on physical device)
  : 'https://your-server.com/api'; // Production URL (update when deploying)

interface ApiTask {
  id: number;
  title: string;
  description: string | null;
  status: 'pending' | 'done';
  order_index: number;
  completed_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

export const api = {
  getTasks(params?: { status?: string; date?: string }): Promise<ApiTask[]> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request(`/tasks${query ? `?${query}` : ''}`);
  },

  createTask(title: string, description?: string | null): Promise<ApiTask> {
    return request('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    });
  },

  completeTask(id: number): Promise<ApiTask> {
    return request(`/tasks/${id}/complete`, { method: 'PATCH' });
  },

  undoTask(id: number): Promise<ApiTask> {
    return request(`/tasks/${id}/undo`, { method: 'PATCH' });
  },

  deleteTask(id: number): Promise<void> {
    return request(`/tasks/${id}`, { method: 'DELETE' });
  },

  reorder(tasks: { id: number; order_index: number }[]): Promise<void> {
    return request('/tasks/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ tasks }),
    });
  },

  searchTasks(q: string): Promise<ApiTask[]> {
    return request(`/tasks/search?q=${encodeURIComponent(q)}`);
  },

  getCompletedDates(): Promise<string[]> {
    return request('/tasks/dates');
  },
};
