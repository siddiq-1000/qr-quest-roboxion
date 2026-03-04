/// <reference types="vite/client" />

export interface Team {
  id: string;
  name: string;
  password?: string;
  secret_character?: string | null;
  secret_index?: number | null;
}

export interface Log {
  id: number;
  team_id: string;
  team_name: string;
  type: 'login' | 'scan' | 'complete' | 'submit';
  qr_task_id?: number;
  timestamp: string;
}

export interface Progress {
  team_id: string;
  qr_task_id: number;
  slug: string;
  name: string;
  status: 'pending' | 'started' | 'completed' | 'pending_approval';
  updated_at: string;
}

export interface QRTask {
  id: number;
  slug: string;
  name: string;
  task_description: string;
  sequence_order: number;
  is_checkpoint?: number;
  is_active?: number;
  section_name?: string;
  form_template?: string;
  image_required?: number;
  next_clue_hint?: string;
  unlock_passcode?: string;
}

export interface Stats {
  totalTeams: number;
  totalTasks: number;
  totalSubmissions: number;
  pendingSubmissions: number;
  recentLogs: Log[];
}

export interface LeaderboardItem {
  taskId: number;
  taskName: string;
  topScans: (Log & { team_name: string })[];
  topCompletes: (Log & { team_name: string })[];
}

export interface Submission {
  id: number;
  team_id: string;
  team_name: string;
  qr_task_id: number;
  task_name: string;
  image_path: string | null;
  task_data: string;
  status: 'pending' | 'completed' | 'rejected' | 'pending_approval' | 'approved';
  timestamp: string;
}

export interface GameSettings {
  duration: string;
  game_status: 'setup' | 'active' | 'finished';
  game_start_time?: string;
  secret_passcode?: string;
}

export interface SubTask {
  id: number;
  qr_task_id: number;
  title: string;
  description: string | null;
  image_path: string | null;
  is_required: number;
  is_completed?: number; // For team view
}

export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://qr-quest-roboxion.onrender.com');

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const api = {
  admin: {
    login: (credentials: any) =>
      fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }).then(handleResponse<{ success: boolean; token: string; username: string }>),

    getStats: () => fetch(`${API_BASE_URL}/api/admin/stats`).then(handleResponse<Stats>),
    getLogs: () => fetch(`${API_BASE_URL}/api/admin/logs`).then(handleResponse<Log[]>),
    getTeams: () => fetch(`${API_BASE_URL}/api/admin/teams`).then(handleResponse<Team[]>),
    getProgress: () => fetch(`${API_BASE_URL}/api/admin/progress`).then(handleResponse<Progress[]>),
    getQrTasks: () => fetch(`${API_BASE_URL}/api/admin/qr-tasks`).then(handleResponse<QRTask[]>),
    getLeaderboard: () => fetch(`${API_BASE_URL}/api/admin/leaderboard`).then(handleResponse<LeaderboardItem[]>),

    createTeam: (team: Partial<Team>) =>
      fetch(`${API_BASE_URL}/api/admin/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team),
      }).then(handleResponse<{ success: boolean; team: Team }>),

    updateTeam: (id: string, team: Partial<Team>) =>
      fetch(`${API_BASE_URL}/api/admin/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team),
      }).then(handleResponse<{ success: boolean }>),

    deleteTeam: (id: string) =>
      fetch(`${API_BASE_URL}/api/admin/teams/${id}`, { method: 'DELETE' }).then(handleResponse<{ success: boolean }>),

    createTask: (task: Partial<QRTask>) =>
      fetch(`${API_BASE_URL}/api/admin/qr-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      }).then(handleResponse<{ success: boolean; id: number }>),

    updateTask: (id: number, task: Partial<QRTask>) =>
      fetch(`${API_BASE_URL}/api/admin/qr-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      }).then(handleResponse<{ success: boolean }>),

    deleteTask: (id: number) =>
      fetch(`${API_BASE_URL}/api/admin/qr-tasks/${id}`, { method: 'DELETE' }).then(handleResponse<{ success: boolean }>),

    getSubmissions: () => fetch(`${API_BASE_URL}/api/admin/submissions`).then(handleResponse<Submission[]>),
    reviewSubmission: (id: string | number, status: 'approved' | 'rejected') =>
      fetch(`${API_BASE_URL}/api/admin/submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(handleResponse<{ success: boolean }>),

    getSubTasks: (taskId: number) => fetch(`${API_BASE_URL}/api/admin/qr-tasks/${taskId}/sub-tasks`).then(handleResponse<SubTask[]>),
    createSubTask: (taskId: number, formData: FormData) =>
      fetch(`${API_BASE_URL}/api/admin/qr-tasks/${taskId}/sub-tasks`, {
        method: 'POST',
        body: formData,
      }).then(handleResponse<{ success: boolean; id: number }>),
    updateSubTask: (id: number, formData: FormData) =>
      fetch(`${API_BASE_URL}/api/admin/sub-tasks/${id}`, {
        method: 'PATCH',
        body: formData,
      }).then(handleResponse<{ success: boolean }>),
    deleteSubTask: (id: number) =>
      fetch(`${API_BASE_URL}/api/admin/sub-tasks/${id}`, { method: 'DELETE' }).then(handleResponse<{ success: boolean }>),

    getSettings: () => fetch(`${API_BASE_URL}/api/admin/settings`).then(handleResponse<GameSettings>),
    updateSettings: (settings: Partial<GameSettings>) =>
      fetch(`${API_BASE_URL}/api/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).then(handleResponse<{ success: boolean }>),

    resetGame: () => fetch(`${API_BASE_URL}/api/admin/game/reset`, { method: 'POST' }).then(handleResponse<{ success: boolean }>),

    resetLogs: () => fetch(`${API_BASE_URL}/api/admin/logs/reset`, { method: 'POST' }).then(handleResponse<{ success: boolean }>),
  },

  team: {
    login: (credentials: any) =>
      fetch(`${API_BASE_URL}/api/team/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }).then(handleResponse<{ success: boolean; team: Team }>),

    getProgress: (teamId: string) => fetch(`${API_BASE_URL}/api/team/${teamId}/progress`).then(handleResponse<Progress[]>),

    validateQr: (teamId: string, slug: string) =>
      fetch(`${API_BASE_URL}/api/team/validate-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, slug }),
      }).then(handleResponse<{ success: boolean; task: QRTask }>),

    scanQr: (teamId: string, qrTaskId: number) =>
      fetch(`${API_BASE_URL}/api/team/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, qrTaskId }),
      }).then(handleResponse<{ success: boolean }>),

    submitTask: (formData: FormData) =>
      fetch(`${API_BASE_URL}/api/team/submit`, {
        method: 'POST',
        body: formData,
      }).then(handleResponse<{ success: boolean }>),

    getSubTasks: (teamId: string, taskId: number) =>
      fetch(`${API_BASE_URL}/api/team/${teamId}/tasks/${taskId}/sub-tasks`).then(handleResponse<SubTask[]>),
    toggleSubTask: (subTaskId: number, teamId: string, is_completed: boolean) =>
      fetch(`${API_BASE_URL}/api/team/sub-tasks/${subTaskId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, is_completed }),
      }).then(handleResponse<{ success: boolean }>),
  }
};

export const getWsUrl = () => {
  if (API_BASE_URL) {
    const parsed = new URL(API_BASE_URL);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${parsed.host}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
};
