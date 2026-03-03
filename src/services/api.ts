
export interface Team {
  id: string;
  name: string;
  password?: string;
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
  firstScan: Log | null;
  firstComplete: Log | null;
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
      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }).then(handleResponse<{ success: boolean; token: string; username: string }>),

    getStats: () => fetch('/api/admin/stats').then(handleResponse<Stats>),
    getLogs: () => fetch('/api/admin/logs').then(handleResponse<Log[]>),
    getTeams: () => fetch('/api/admin/teams').then(handleResponse<Team[]>),
    getProgress: () => fetch('/api/admin/progress').then(handleResponse<Progress[]>),
    getQrTasks: () => fetch('/api/admin/qr-tasks').then(handleResponse<QRTask[]>),
    getLeaderboard: () => fetch('/api/admin/leaderboard').then(handleResponse<LeaderboardItem[]>),

    createTeam: (team: Partial<Team>) =>
      fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team),
      }).then(handleResponse<{ success: boolean; team: Team }>),

    updateTeam: (id: string, team: Partial<Team>) =>
      fetch(`/api/admin/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team),
      }).then(handleResponse<{ success: boolean }>),

    deleteTeam: (id: string) =>
      fetch(`/api/admin/teams/${id}`, { method: 'DELETE' }).then(handleResponse<{ success: boolean }>),

    createTask: (task: Partial<QRTask>) =>
      fetch('/api/admin/qr-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      }).then(handleResponse<{ success: boolean; id: number }>),

    updateTask: (id: number, task: Partial<QRTask>) =>
      fetch(`/api/admin/qr-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      }).then(handleResponse<{ success: boolean }>),

    deleteTask: (id: number) =>
      fetch(`/api/admin/qr-tasks/${id}`, { method: 'DELETE' }).then(handleResponse<{ success: boolean }>),

    getSubmissions: () => fetch('/api/admin/submissions').then(handleResponse<Submission[]>),
    reviewSubmission: (id: number, status: 'approved' | 'rejected') =>
      fetch(`/api/admin/submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(handleResponse<{ success: boolean }>),

    getSubTasks: (taskId: number) => fetch(`/api/admin/qr-tasks/${taskId}/sub-tasks`).then(handleResponse<SubTask[]>),
    createSubTask: (taskId: number, formData: FormData) =>
      fetch(`/api/admin/qr-tasks/${taskId}/sub-tasks`, {
        method: 'POST',
        body: formData,
      }).then(handleResponse<{ success: boolean; id: number }>),
    updateSubTask: (id: number, formData: FormData) =>
      fetch(`/api/admin/sub-tasks/${id}`, {
        method: 'PATCH',
        body: formData,
      }).then(handleResponse<{ success: boolean }>),
    deleteSubTask: (id: number) =>
      fetch(`/api/admin/sub-tasks/${id}`, { method: 'DELETE' }).then(handleResponse<{ success: boolean }>),

    getSettings: () => fetch('/api/admin/settings').then(handleResponse<GameSettings>),
    updateSettings: (settings: Partial<GameSettings>) =>
      fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).then(handleResponse<{ success: boolean }>),

    resetGame: () => fetch('/api/admin/game/reset', { method: 'POST' }).then(handleResponse<{ success: boolean }>),

    resetLogs: () => fetch('/api/admin/logs/reset', { method: 'POST' }).then(handleResponse<{ success: boolean }>),
  },

  team: {
    login: (credentials: any) =>
      fetch('/api/team/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }).then(handleResponse<{ success: boolean; team: Team }>),

    getProgress: (teamId: string) => fetch(`/api/team/${teamId}/progress`).then(handleResponse<Progress[]>),

    validateQr: (slug: string) =>
      fetch('/api/team/validate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      }).then(handleResponse<{ success: boolean; task: QRTask }>),

    scanQr: (teamId: string, qrTaskId: number) =>
      fetch('/api/team/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, qrTaskId }),
      }).then(handleResponse<{ success: boolean }>),

    submitTask: (formData: FormData) =>
      fetch('/api/team/submit', {
        method: 'POST',
        body: formData,
      }).then(handleResponse<{ success: boolean }>),

    getSubTasks: (teamId: string, taskId: number) =>
      fetch(`/api/team/${teamId}/tasks/${taskId}/sub-tasks`).then(handleResponse<SubTask[]>),
    toggleSubTask: (subTaskId: number, teamId: string, is_completed: boolean) =>
      fetch(`/api/team/sub-tasks/${subTaskId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, is_completed }),
      }).then(handleResponse<{ success: boolean }>),
  }
};
