import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  QrCode,
  Trophy,
  Activity,
  LogOut,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Camera,
  Upload,
  Image as ImageIcon,
  FileSearch,
  Check,
  X,
  ImageIcon as ImageIconLucide,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsQR from 'jsqr';
import { api, Team, Log, Progress, QRTask, Stats, LeaderboardItem, GameSettings, Submission, SubTask } from './services/api';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger', size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-black text-white hover:bg-zinc-800',
      secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
      outline: 'border border-zinc-200 bg-transparent hover:bg-zinc-50',
      danger: 'bg-red-500 text-white hover:bg-red-600',
    };
    const sizes = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string;[key: string]: any }) => (
  <div className={cn('rounded-xl border border-zinc-200 bg-white p-6 shadow-sm', className)} {...props}>
    {children}
  </div>
);

// --- Scanner Component ---
const Scanner = ({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationId: number | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          requestAnimationFrame(scan);
        }
      } catch (err) {
        setError('Could not access camera. Please check permissions.');
      }
    };

    const scan = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code) {
            onScan(code.data);
            return;
          }
        }
      }
      animationId = requestAnimationFrame(scan);
    };

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4">
      <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-2xl border-2 border-white/20">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 border-[40px] border-black/40">
          <div className="h-full w-full border-2 border-white/50" />
        </div>
      </div>
      <div className="mt-8 text-center text-white">
        <p className="text-lg font-bold">Scanning QR Code...</p>
        <p className="mt-2 text-sm text-white/60">Position the QR code within the frame</p>
        {error && <p className="mt-4 text-red-400">{error}</p>}
        <Button variant="outline" className="mt-8 border-white/20 text-white hover:bg-white/10" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

const CountdownTimer = ({ settings }: { settings: GameSettings | null }) => {
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');

  useEffect(() => {
    if (!settings || settings.game_status !== 'active' || !settings.game_start_time) {
      setTimeLeft('--:--:--');
      return;
    }

    const durationMs = parseInt(settings.duration) * 60 * 1000;
    const startTime = new Date(settings.game_start_time).getTime();
    const endTime = startTime + durationMs;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        clearInterval(timer);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [settings]);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-red-600 p-4 text-white shadow-lg ring-4 ring-red-500/20">
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Game Time Remaining</span>
      <span className="text-3xl font-black font-mono">{timeLeft}</span>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [toasts, setToasts] = useState<{ id: number, message: string, type: 'success' | 'error' | 'info' }[]>([]);
  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const [user, setUser] = useState<{ type: 'admin' | 'team'; id: string; name: string } | null>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'admin' | 'task'>('login');
  const [activeTask, setActiveTask] = useState<QRTask | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [qrTasks, setQrTasks] = useState<QRTask[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [winnerTeam, setWinnerTeam] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [adminTab, setAdminTab] = useState<string>('summary');
  const [teamTab, setTeamTab] = useState<'dashboard' | 'tasks'>('dashboard');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingTask, setEditingTask] = useState<QRTask | null>(null);
  const [editingFormTemplate, setEditingFormTemplate] = useState<{ id: string, label: string, type: string }[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [teamSubTasks, setTeamSubTasks] = useState<SubTask[]>([]);
  const [editingSubTask, setEditingSubTask] = useState<SubTask | null>(null);
  const [isAddingSubTask, setIsAddingSubTask] = useState(false);
  const hasRedirected = useRef(false);

  // WebSocket Setup
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'LOG_UPDATE' || data.type === 'LOG_RESET') {
        if (data.type === 'LOG_RESET') {
          setLogs([]);
        } else {
          setLogs(prev => [data.log, ...prev].slice(0, 100));
        }

        if (user?.type === 'admin') {
          fetchProgress();
          fetchLeaderboard();
          fetchStats();
          fetchSubmissions();
        } else if (user?.type === 'team') {
          fetchProgress();
        }
      }
      if (data.type === 'SETTINGS_UPDATE') {
        fetchSettings();
      }
      if (data.type === 'TEAM_FINISHED') {
        if (data.isWinner) {
          setWinnerTeam(data.teamName);
          const utterance = new SpeechSynthesisUtterance(`The first key has been successfully acquired by ${data.teamName}.`);
          utterance.rate = 0.9;
          utterance.pitch = 1.1;
          window.speechSynthesis.speak(utterance);
        } else {
          showToast(`🎉 Notification: ${data.teamName} has completed all tasks!`, 'success');
        }
      }
    };

    return () => socket.close();
  }, [user]);

  useEffect(() => {
    // Handle deep links from QR codes
    const path = window.location.pathname;
    if (path.startsWith('/scan/')) {
      const slug = path.split('/scan/')[1];
      if (slug) {
        // Store slug to validate after login
        sessionStorage.setItem('pending_scan', slug);
      }
    }
  }, []);

  useEffect(() => {
    if (user?.type === 'team') {
      const pendingScan = sessionStorage.getItem('pending_scan');
      if (pendingScan) {
        sessionStorage.removeItem('pending_scan');
        validateAndStartTask(pendingScan);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user?.type === 'team' && view === 'login') {
      // If user is restored from state but view is still login
      setView('dashboard');
    }
  }, [user, view]);

  useEffect(() => {
    if (user?.type === 'team' && view === 'dashboard' && !sessionStorage.getItem('pending_scan') && !hasRedirected.current) {
      const active = progress.find(p => p.status === 'started');
      if (active) {
        const task = qrTasks.find(t => t.id === active.qr_task_id);
        if (task) {
          hasRedirected.current = true;
          setActiveTask(task);
          setView('task');
        }
      }
    }
  }, [user, progress, qrTasks, view]);

  useEffect(() => {
    if (user?.type === 'team' && activeTask) {
      fetchTeamSubTasks(user.id, activeTask.id);
    }
  }, [user, activeTask]);

  const fetchSettings = async () => {
    try {
      const data = await api.admin.getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const data = await api.admin.getSubmissions();
      setSubmissions(data);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await api.admin.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const data = await api.admin.getLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const fetchTeams = async () => {
    try {
      const data = await api.admin.getTeams();
      setTeams(data);
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    }
  };

  const fetchProgress = async () => {
    if (!user) return;
    try {
      const data = user.type === 'admin'
        ? await api.admin.getProgress()
        : await api.team.getProgress(user.id);
      setProgress(data);
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    }
  };

  const fetchQrTasks = async () => {
    try {
      const data = await api.admin.getQrTasks();
      setQrTasks(data);
    } catch (err) {
      console.error('Failed to fetch QR tasks:', err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await api.admin.getLeaderboard();
      setLeaderboard(data);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  };

  const fetchSubTasks = async (taskId: number) => {
    try {
      const data = await api.admin.getSubTasks(taskId);
      setSubTasks(data);
    } catch (err) {
      console.error('Failed to fetch sub-tasks:', err);
    }
  };

  const fetchTeamSubTasks = async (teamId: string, taskId: number) => {
    try {
      const data = await api.team.getSubTasks(teamId, taskId);
      setTeamSubTasks(data);
    } catch (err) {
      console.error('Failed to fetch team sub-tasks:', err);
    }
  };

  const handleCreateSubTask = async (e: React.FormEvent<HTMLFormElement>, taskId: number) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await api.admin.createSubTask(taskId, formData);
      fetchSubTasks(taskId);
      setIsAddingSubTask(false);
    } catch (err: any) {
      alert(err.message || 'Error creating sub-task');
    }
  };

  const handleUpdateSubTask = async (e: React.FormEvent<HTMLFormElement>, taskId: number) => {
    e.preventDefault();
    if (!editingSubTask) return;
    const formData = new FormData(e.currentTarget);
    try {
      await api.admin.updateSubTask(editingSubTask.id, formData);
      fetchSubTasks(taskId);
      setEditingSubTask(null);
    } catch (err: any) {
      showToast(err.message || 'Error updating sub-task', 'error');
    }
  };

  const handleDeleteSubTask = async (id: number, taskId: number) => {
    if (!confirm('Are you sure you want to delete this sub-task?')) return;
    try {
      await api.admin.deleteSubTask(id);
      fetchSubTasks(taskId);
    } catch (err: any) {
      showToast(err.message || 'Error deleting sub-task', 'error');
    }
  };

  const handleToggleSubTask = async (subTaskId: number, is_completed: boolean) => {
    if (!user || user.type !== 'team') return;
    try {
      await api.team.toggleSubTask(subTaskId, user.id, is_completed);
      if (activeTask) fetchTeamSubTasks(user.id, activeTask.id);
    } catch (err) {
      console.error('Failed to toggle sub-task:', err);
    }
  };

  useEffect(() => {
    if (user?.type === 'admin') {
      fetchLogs();
      fetchTeams();
      fetchProgress();
      fetchQrTasks();
      fetchLeaderboard();
      fetchStats();
      fetchSettings();
      fetchSubmissions();
    } else if (user?.type === 'team') {
      fetchProgress();
      fetchQrTasks();
      fetchSettings();
    }
  }, [user]);

  // Handle URL-based QR scans
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/scan\/([^\/]+)/);
    if (match) {
      if (user?.type === 'team') {
        const slug = match[1];
        validateAndStartTask(slug);
        window.history.replaceState({}, '', '/');
      } else if (!user) {
        setError('Please login first to scan this QR code.');
        window.history.replaceState({}, '', '/');
      }
    }
  }, [user]);

  const validateAndStartTask = async (slug: string) => {
    setError(null);
    setSuccess(null);

    // Check game status
    if (user?.type === 'team') {
      try {
        const currentSettings = await api.admin.getSettings();
        if (currentSettings.game_status === 'setup') {
          setError('Game has not started yet. Please wait for the administrator.');
          return;
        }
        if (currentSettings.game_status === 'finished') {
          setError('The game has already finished.');
          return;
        }
      } catch (err) {
        console.error('Failed to check game status');
      }
    }

    try {
      const { task } = await api.team.validateQr(slug);

      // Check if already completed
      const p = progress.find(item => item.qr_task_id === task.id);
      if (p?.status === 'completed') {
        setError('You have already completed this task.');
        return;
      }

      // If already started, just navigate
      if (p?.status === 'started') {
        setActiveTask(task);
        setView('task');
        return;
      }

      // Removed strict linear sequence checking to allow non-linear progress
      // Teams can now scan any active task regardless of sequence order.

      setSuccess(`Success! Unlocked: ${task.name}`);
      setTimeout(() => {
        setActiveTask(task);
        setView('task');
        setSuccess(null);
      }, 1500);

      // Mark as started
      await api.team.scanQr(user?.id || '', task.id);
      fetchProgress();
    } catch (err: any) {
      setError(err.message || 'Invalid QR Code. This code is not registered.');
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const id = formData.get('id') as string;
    const password = formData.get('password') as string;

    try {
      if (id === 'admin') {
        const data = await api.admin.login({ username: id, password });
        setUser({ type: 'admin', id: data.username, name: 'Administrator' });
        setView('admin');
      } else {
        const data = await api.team.login({ teamId: id, password });
        const teamUser = { type: 'team' as const, id: data.team.id, name: data.team.name };
        setUser(teamUser);

        // Pre-fetch to determine best landing page
        try {
          const [prog, tasks, gameSettings] = await Promise.all([
            api.team.getProgress(data.team.id),
            api.admin.getQrTasks(),
            api.admin.getSettings()
          ]);
          setProgress(prog);
          setQrTasks(tasks);
          setSettings(gameSettings);

          if (gameSettings.game_status === 'finished') {
            setView('dashboard');
            setTeamTab('dashboard'); // Leaderboard is on dashboard
            return;
          }

          // If there's a pending scan, the useEffect will handle it.
          // Otherwise, find the active task.
          if (!sessionStorage.getItem('pending_scan')) {
            const active = prog.find(p => p.status === 'started');
            if (active) {
              const task = tasks.find(t => t.id === active.qr_task_id);
              if (task) {
                setActiveTask(task);
                setView('task');
                return;
              }
            }
            setView('dashboard');
          }
        } catch (err) {
          console.error('Error during post-login fetch:', err);
          setView('dashboard');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;

    try {
      await api.admin.createTeam({ name, password });
      fetchTeams();
      e.currentTarget.reset();
    } catch (err: any) {
      alert(err.message || 'Error creating team');
    }
  };

  const handleUpdateTeam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTeam) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;

    try {
      await api.admin.updateTeam(editingTeam.id, { name, password });
      fetchTeams();
      setEditingTeam(null);
    } catch (err: any) {
      alert(err.message || 'Error updating team');
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!confirm('Are you sure you want to delete this team? All progress and logs will be lost.')) return;
    try {
      await api.admin.deleteTeam(id);
      fetchTeams();
    } catch (err: any) {
      alert(err.message || 'Error deleting team');
    }
  };

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const slug = formData.get('slug') as string;
    const task_description = formData.get('task_description') as string;
    const sequence_order = parseInt(formData.get('sequence_order') as string);

    try {
      await api.admin.createTask({ name, slug, task_description, sequence_order });
      fetchQrTasks();
      setIsAddingTask(false);
    } catch (err: any) {
      alert(err.message || 'Error creating task. Slug might already exist.');
    }
  };

  const handleUpdateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTask) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const slug = formData.get('slug') as string;
    const task_description = formData.get('task_description') as string;
    const sequence_order = parseInt(formData.get('sequence_order') as string);
    const is_checkpoint = formData.get('is_checkpoint') ? 1 : 0;
    const is_active = formData.get('is_active') ? 1 : 0;
    const image_required = formData.get('image_required') ? 1 : 0;
    const section_name = formData.get('section_name') as string;
    const next_clue_hint = formData.get('next_clue_hint') as string;

    try {
      await api.admin.updateTask(editingTask.id, {
        name, slug, task_description, sequence_order,
        is_checkpoint, is_active, section_name, image_required, next_clue_hint,
        form_template: JSON.stringify(editingFormTemplate)
      });
      fetchQrTasks();
      showToast('Task updated successfully!', 'success');
      // Update local editingTask to reflect changes without closing tab
      setEditingTask(prev => prev ? {
        ...prev, name, slug, task_description, sequence_order,
        is_checkpoint, is_active, section_name, image_required, next_clue_hint,
        form_template: JSON.stringify(editingFormTemplate)
      } : null);
    } catch (err: any) {
      showToast(err.message || 'Error updating task', 'error');
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm('Are you sure you want to delete this task? All progress will be lost.')) return;
    try {
      await api.admin.deleteTask(id);
      fetchQrTasks();
    } catch (err: any) {
      alert(err.message || 'Error deleting task');
    }
  };

  const handleResetLogs = async () => {
    if (!confirm('Are you sure you want to reset all spectator logs?')) return;
    try {
      await api.admin.resetLogs();
      fetchLogs();
    } catch (err: any) {
      alert(err.message || 'Error resetting logs');
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const duration = formData.get('duration') as string;
    const game_status = formData.get('game_status') as any;

    try {
      await api.admin.updateSettings({ duration, game_status });
      fetchSettings();
      alert('Settings updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Error updating settings');
    }
  };

  const handleResetGame = async () => {
    if (!confirm('CRITICAL: This will reset ALL team progress, logs, and submissions. Are you sure?')) return;
    try {
      await api.admin.resetGame();
      fetchProgress();
      fetchLogs();
      fetchStats();
      alert('Game has been reset!');
    } catch (err: any) {
      alert(err.message || 'Error resetting game');
    }
  };

  const handleReviewSubmission = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await api.admin.reviewSubmission(id, status);
      fetchSubmissions();
    } catch (err: any) {
      alert(err.message || 'Error reviewing submission');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          // Extract slug from URL if it's a full URL
          const url = code.data;
          const match = url.match(/\/scan\/([^\/]+)/);
          const slug = match ? match[1] : url;
          validateAndStartTask(slug);
        } else {
          setError('No QR code found in the image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleTaskSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !activeTask) return;

    const formData = new FormData(e.currentTarget);

    try {
      const template = activeTask.form_template ? JSON.parse(activeTask.form_template) : [];
      if (template && template.length > 0) {
        const answers: Record<string, any> = {};
        template.forEach((field: any) => {
          answers[field.label] = formData.get(field.id);
          formData.delete(field.id);
        });
        formData.set('taskData', JSON.stringify(answers));
      }
    } catch { }

    formData.append('teamId', user.id);
    formData.append('qrTaskId', activeTask.id.toString());

    try {
      await api.team.submitTask(formData);
      setActiveTask(null);
      setImagePreview(null);
      setView('dashboard');
      fetchProgress();
    } catch (err: any) {
      showToast(err.message || 'Error submitting task', 'error');
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Success Message Overlay */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl bg-white p-8 text-center shadow-2xl"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check size={32} />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">Scan Successful!</h3>
              <p className="mt-2 text-zinc-500">{success}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Golden Winner Overlay */}
      <AnimatePresence>
        {winnerTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 p-6 text-center shadow-2xl backdrop-blur-md"
            onClick={() => setWinnerTeam(null)} // Click anywhere to dismiss eventually
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
              className="rounded-3xl border-4 border-yellow-200 bg-black/20 p-12 backdrop-blur-xl"
            >
              <Trophy size={80} className="mx-auto mb-6 text-yellow-200 drop-shadow-[0_0_15px_rgba(253,224,71,0.8)]" />
              <h1 className="mb-4 text-5xl font-black uppercase tracking-widest text-white drop-shadow-lg">
                We have a Winner!
              </h1>
              <p className="text-2xl font-bold text-yellow-100 drop-shadow-md">
                The first key has been successfully acquired by
              </p>
              <div className="mt-8 inline-block transform rounded-xl bg-white/10 px-8 py-4 backdrop-blur-sm transition-transform hover:scale-105 hover:bg-white/20">
                <p className="font-mono text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                  {winnerTeam}
                </p>
              </div>
              <p className="mt-12 text-sm text-yellow-100/70">Click anywhere to dismiss</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Scanner */}
      {scanning && (
        <Scanner
          onScan={(data) => {
            setScanning(false);
            // Extract slug from URL if it's a full URL
            const match = data.match(/\/scan\/([^\/]+)/);
            const slug = match ? match[1] : data;
            validateAndStartTask(slug);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {/* Navigation */}
      {user && (
        <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white">
                <QrCode size={18} />
              </div>
              <span className="font-bold tracking-tight">QR QUEST</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-zinc-500">
                {user.name}
              </span>
              <Button variant="outline" size="sm" onClick={() => {
                hasRedirected.current = false;
                setUser(null);
                setView('login');
              }} className="h-8 px-2">
                <LogOut size={16} />
              </Button>
            </div>
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8">
        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto max-w-md pt-20"
            >
              <Card>
                <div className="mb-6 text-center">
                  <h1 className="text-2xl font-bold">Welcome to QR Quest</h1>
                  <p className="text-sm text-zinc-500">Enter your credentials to begin the challenge</p>
                  {sessionStorage.getItem('pending_scan') && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
                      <QrCode size={14} />
                      QR Code detected! Login to unlock the task.
                    </div>
                  )}
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Team ID / Admin</label>
                    <input autoComplete="off"
                      name="id"
                      placeholder="e.g. admin or team-name"
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Password</label>
                    <input autoComplete="off"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                      required
                    />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="w-full py-3">Login</Button>
                </form>
                <div className="mt-8 border-t border-zinc-100 pt-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Disclaimer</h2>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                    By participating in this event, you agree to follow all safety guidelines.
                    Your progress and location data will be tracked for scoring purposes.
                    All tasks must be completed fairly.
                  </p>
                </div>
              </Card>
            </motion.div>
          )}

          {view === 'admin' && user?.type === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="mb-8 p-4 bg-white rounded-xl shadow-sm border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white">
                    <Activity size={16} />
                  </div>
                  <h2 className="text-lg font-bold text-zinc-900">Admin Control Panel</h2>
                </div>

                <div className="relative">
                  <select
                    value={adminTab}
                    onChange={(e) => {
                      const id = e.target.value;
                      setAdminTab(id);
                      if (id.startsWith('task-')) {
                        const taskId = parseInt(id.split('-')[1]);
                        const task = qrTasks.find(t => t.id === taskId);
                        if (task) {
                          setEditingTask(task);
                          setEditingFormTemplate(task.form_template ? JSON.parse(task.form_template) : []);
                          fetchSubTasks(task.id);
                        }
                      } else {
                        setEditingTask(null);
                        setEditingFormTemplate([]);
                      }
                    }}
                    className="w-full sm:w-64 appearance-none rounded-lg border border-zinc-200 bg-white px-4 py-2 pr-10 text-sm font-bold shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  >
                    <option value="summary">Summary & Progress</option>
                    <option value="logs">Activity Logs</option>
                    <option value="setup">Game Setup</option>
                    <option value="leaderboard">Leaderboard</option>
                    <optgroup label="Tasks">
                      {qrTasks.map(t => (
                        <option key={t.id} value={`task-${t.id}`}>{t.name}</option>
                      ))}
                    </optgroup>
                    <option value="add-task">+ Create New Task</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500">
                    <ChevronRight size={16} className="rotate-90" />
                  </div>
                </div>
              </div>

              {adminTab === 'summary' && (
                <div className="space-y-8">
                  {/* Stats Summary */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Card className="flex flex-col items-center justify-center py-6 text-center">
                      <span className="text-3xl font-bold text-zinc-900">{stats?.totalTeams || 0}</span>
                      <span className="mt-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">Active Teams</span>
                    </Card>
                    <Card className="flex flex-col items-center justify-center py-6 text-center">
                      <span className="text-3xl font-bold text-zinc-900">{stats?.totalTasks || 0}</span>
                      <span className="mt-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Tasks</span>
                    </Card>
                    <Card className="flex flex-col items-center justify-center py-6 text-center border-emerald-100 bg-emerald-50/30">
                      <span className="text-3xl font-bold text-emerald-600">{logs.length}</span>
                      <span className="mt-1 text-xs font-medium text-emerald-500 uppercase tracking-wider">Total Logs</span>
                    </Card>
                  </div>

                  <Card>
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                      <Activity size={20} /> Team Progress Overview
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-100">
                            <th className="pb-3 pr-4 font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Team Name</th>
                            {qrTasks.map(task => (
                              <th key={task.id} className="pb-3 px-4 font-bold text-zinc-400 uppercase tracking-wider text-[10px] text-center">{task.name}</th>
                            ))}
                            <th className="pb-3 pl-4 font-bold text-zinc-400 uppercase tracking-wider text-[10px] text-right">Progress</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {(() => {
                            const sortedTeams = [...teams].sort((a, b) => {
                              const aCompleted = progress.filter(p => p.team_id === a.id && p.status === 'completed').length;
                              const bCompleted = progress.filter(p => p.team_id === b.id && p.status === 'completed').length;
                              if (bCompleted !== aCompleted) return bCompleted - aCompleted;

                              // Tiebreaker using precise overall timestamps
                              const aLatest = Math.max(...progress.filter(p => p.team_id === a.id).map(p => new Date(p.updated_at).getTime()), 0);
                              const bLatest = Math.max(...progress.filter(p => p.team_id === b.id).map(p => new Date(p.updated_at).getTime()), 0);
                              return aLatest - bLatest; // Smaller timestamp wins since they finished earlier
                            });
                            return sortedTeams.map(team => {
                              const teamProgress = progress.filter(p => p.team_id === team.id);
                              const completedCount = teamProgress.filter(p => p.status === 'completed').length;
                              const totalTasks = qrTasks.length;
                              const percentage = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

                              return (
                                <tr key={team.id}>
                                  <td className="py-4 pr-4 font-bold">{team.name}</td>
                                  {qrTasks.map(task => {
                                    const p = teamProgress.find(tp => tp.qr_task_id === task.id);
                                    return (
                                      <td key={task.id} className="py-4 px-4 text-center">
                                        <div className={cn(
                                          "mx-auto h-3 w-3 rounded-full",
                                          p?.status === 'completed' ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" :
                                            p?.status === 'started' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-200"
                                        )} />
                                      </td>
                                    );
                                  })}
                                  <td className="py-4 pl-4 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                      <span className="text-xs font-mono text-zinc-400">{completedCount}/{totalTasks}</span>
                                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                                        <motion.div
                                          className={cn("h-full", percentage === 100 ? "bg-emerald-500" : "bg-black")}
                                          initial={{ width: 0 }}
                                          animate={{ width: `${percentage}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}

              {adminTab === 'teams' && (
                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="lg:col-span-1">
                    <Card>
                      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                        <Users size={20} /> {editingTeam ? 'Edit Team' : 'Create New Team'}
                      </h2>
                      <form onSubmit={editingTeam ? handleUpdateTeam : handleCreateTeam} className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-zinc-400">Team Name</label>
                          <input autoComplete="off"
                            name="name"
                            defaultValue={editingTeam?.name || ''}
                            placeholder="Team Name"
                            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-zinc-400">Password</label>
                          <input autoComplete="off"
                            name="password"
                            defaultValue={editingTeam?.password || ''}
                            placeholder="Password"
                            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                            required
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" className="flex-1">
                            {editingTeam ? 'Update Team' : 'Create Team'}
                          </Button>
                          {editingTeam && (
                            <Button variant="outline" onClick={() => setEditingTeam(null)}>Cancel</Button>
                          )}
                        </div>
                      </form>
                    </Card>
                  </div>
                  <div className="lg:col-span-2">
                    <Card>
                      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                        <Users size={20} /> Active Teams
                      </h2>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {teams.map(t => (
                          <div key={t.id} className="group relative flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 transition-all hover:border-zinc-200">
                            <div>
                              <span className="block font-bold">{t.name}</span>
                              <span className="text-xs text-zinc-400">ID: {t.id}</span>
                            </div>
                            <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button variant="outline" size="sm" onClick={() => setEditingTeam(t)}>Edit</Button>
                              <Button variant="danger" size="sm" onClick={() => handleDeleteTeam(t.id)}>Delete</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {adminTab === 'add-task' && (
                <div className="space-y-8">
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Plus size={20} /> Add New QR Task
                  </h2>
                  <Card className="border-black">
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const name = formData.get('name') as string;
                      const slug = formData.get('slug') as string;
                      const task_description = formData.get('task_description') as string;
                      const sequence_order = parseInt(formData.get('sequence_order') as string);
                      const image_required = formData.get('image_required') ? 1 : 0;
                      const next_clue_hint = formData.get('next_clue_hint') as string;
                      try {
                        const response = await api.admin.createTask({ name, slug, task_description, sequence_order, image_required, next_clue_hint });
                        await fetchQrTasks();
                        if (response && response.id) {
                          setAdminTab(`task-${response.id}`);
                          const newTask = await api.admin.getQrTasks().then(tasks => tasks.find(t => t.id === response.id));
                          if (newTask) {
                            setEditingTask(newTask);
                            fetchSubTasks(newTask.id);
                          }
                        } else {
                          setAdminTab('summary');
                        }
                      } catch (err: any) {
                        showToast(err.message || 'Error creating task. Slug might already exist.', 'error');
                      }
                    }} className="grid gap-4 sm:grid-cols-4">
                      <input autoComplete="off" name="name" placeholder="Task Name" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />
                      <input autoComplete="off" name="slug" placeholder="Slug (e.g. task-1)" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />
                      <input autoComplete="off" name="section_name" placeholder="Section Name (Optional)" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                      <input autoComplete="off" name="sequence_order" type="number" placeholder="Order (1, 2, 3...)" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />
                      <div className="flex items-center gap-2">
                        <input autoComplete="off" type="checkbox" id="is_checkpoint" name="is_checkpoint" className="rounded border-zinc-300" />
                        <label htmlFor="is_checkpoint" className="text-sm font-medium">Is Checkpoint (Requires Approval)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input autoComplete="off" type="checkbox" id="is_active" name="is_active" className="rounded border-zinc-300" defaultChecked />
                        <label htmlFor="is_active" className="text-sm font-medium">Active (Visible)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input autoComplete="off" type="checkbox" id="image_required" name="image_required" className="rounded border-zinc-300" defaultChecked />
                        <label htmlFor="image_required" className="text-sm font-medium">Image Required</label>
                      </div>
                      <input autoComplete="off" name="task_description" placeholder="Description" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" required />
                      <input autoComplete="off" name="next_clue_hint" placeholder="Next Clue Hint (Shown exactly after completing this task)" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-4" />
                      <div className="sm:col-span-4 flex justify-end gap-2">
                        <Button type="submit">Create Task</Button>
                      </div>
                    </form>
                  </Card>
                </div>
              )}

              {adminTab.startsWith('task-') && editingTask && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 text-lg font-bold">
                        <QrCode size={20} /> {editingTask.name}
                      </span>
                      <span className="text-sm text-zinc-500 font-mono">/{editingTask.slug}</span>
                    </h2>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = `${window.location.origin}/scan/${editingTask.slug}`;
                          window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`, '_blank');
                        }}
                      >
                        View QR
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = `${window.location.origin}/scan/${editingTask.slug}`;
                          navigator.clipboard.writeText(url);
                          showToast('URL copied to clipboard!', 'success');
                        }}
                      >
                        Copy URL
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => {
                        handleDeleteTask(editingTask.id);
                        setAdminTab('summary');
                        setEditingTask(null);
                      }}>Delete Task</Button>
                    </div>
                  </div>

                  <Card className="border-blue-500">
                    <h3 className="mb-4 font-bold">Edit Task Details</h3>
                    <form onSubmit={handleUpdateTask} className="grid gap-4 sm:grid-cols-4">
                      <input autoComplete="off" name="name" defaultValue={editingTask.name} placeholder="Task Name" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />
                      <input autoComplete="off" name="slug" defaultValue={editingTask.slug} placeholder="Slug" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />
                      <input autoComplete="off" name="section_name" defaultValue={editingTask.section_name || ''} placeholder="Section Name" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                      <input autoComplete="off" name="sequence_order" type="number" defaultValue={editingTask.sequence_order} placeholder="Order" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />

                      <div className="flex items-center gap-2">
                        <input autoComplete="off" type="checkbox" id="edit_is_checkpoint" name="is_checkpoint" defaultChecked={!!editingTask.is_checkpoint} className="rounded border-zinc-300" />
                        <label htmlFor="edit_is_checkpoint" className="text-sm font-medium">Is Checkpoint (Requires Approval)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input autoComplete="off" type="checkbox" id="edit_is_active" name="is_active" defaultChecked={editingTask.is_active !== 0} className="rounded border-zinc-300" />
                        <label htmlFor="edit_is_active" className="text-sm font-medium">Active (Visible)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input autoComplete="off" type="checkbox" id="edit_image_required" name="image_required" defaultChecked={editingTask.image_required !== 0} className="rounded border-zinc-300" />
                        <label htmlFor="edit_image_required" className="text-sm font-medium">Image Required</label>
                      </div>

                      <input autoComplete="off" name="task_description" defaultValue={editingTask.task_description} placeholder="Description" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" required />
                      <input autoComplete="off" name="next_clue_hint" defaultValue={editingTask.next_clue_hint || ''} placeholder="Next Clue Hint (Shown exactly after completing this task)" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-4" />

                      <div className="sm:col-span-4 mt-4 border-t border-zinc-100 pt-4">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-bold text-sm">Form Builder (Optional)</h4>
                          <Button type="button" size="sm" onClick={() => {
                            setEditingFormTemplate([...editingFormTemplate, { id: `field_${Date.now()}`, label: 'New Field', type: 'text' }]);
                          }}>
                            <Plus size={14} className="mr-1" /> Add Field
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {editingFormTemplate.map((field, idx) => (
                            <div key={field.id} className="flex items-center gap-3 bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                              <input autoComplete="off"
                                value={field.label}
                                onChange={(e) => {
                                  const newTemp = [...editingFormTemplate];
                                  newTemp[idx].label = e.target.value;
                                  setEditingFormTemplate(newTemp);
                                }}
                                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
                                placeholder="Field Label"
                              />
                              <select
                                value={field.type}
                                onChange={(e) => {
                                  const newTemp = [...editingFormTemplate];
                                  newTemp[idx].type = e.target.value;
                                  setEditingFormTemplate(newTemp);
                                }}
                                className="rounded border border-zinc-200 px-2 py-1 text-sm"
                              >
                                <option value="text">Text Check</option>
                                <option value="number">Number Check</option>
                                <option value="longtext">Long Answer</option>
                              </select>
                              <Button type="button" variant="danger" size="sm" className="px-2" onClick={() => {
                                const newTemp = editingFormTemplate.filter((_, i) => i !== idx);
                                setEditingFormTemplate(newTemp);
                              }}>
                                Remove
                              </Button>
                            </div>
                          ))}
                          {editingFormTemplate.length === 0 && (
                            <p className="text-xs text-zinc-400">No custom form fields added. standard file upload/text input will be used.</p>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-4 flex justify-end gap-2 mt-4">
                        <Button type="submit">Update Task Details & Form</Button>
                      </div>
                    </form>
                  </Card>

                  <Card className="border-zinc-200">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="font-bold">Sub-Tasks (Checklist)</h3>
                      <Button size="sm" onClick={() => {
                        setIsAddingSubTask(true);
                        setEditingSubTask(null);
                      }}>
                        <Plus size={14} className="mr-1" /> Add Sub-Task
                      </Button>
                    </div>

                    {(isAddingSubTask || editingSubTask) && (
                      <div className="mb-8 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                        <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-400">
                          {editingSubTask ? 'Edit Sub-Task' : 'New Sub-Task'}
                        </h4>
                        <form
                          onSubmit={(e) => editingSubTask ? handleUpdateSubTask(e, editingTask.id) : handleCreateSubTask(e, editingTask.id)}
                          className="space-y-4"
                        >
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-zinc-400">Title</label>
                              <input autoComplete="off" name="title" defaultValue={editingSubTask?.title || ''} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" required />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-zinc-400">Required?</label>
                              <select name="is_required" defaultValue={editingSubTask?.is_required?.toString() || '1'} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                                <option value="1">Yes</option>
                                <option value="0">No</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-zinc-400">Description</label>
                            <textarea autoComplete="off" name="description" defaultValue={editingSubTask?.description || ''} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" rows={2} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-zinc-400">Image (Optional)</label>
                            <input autoComplete="off" type="file" name="image" className="w-full text-xs" accept="image/*" />
                            {editingSubTask?.image_path && (
                              <p className="mt-1 text-[10px] text-zinc-400">Current: {editingSubTask.image_path}</p>
                            )}
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => {
                              setIsAddingSubTask(false);
                              setEditingSubTask(null);
                            }}>Cancel</Button>
                            <Button type="submit" size="sm">{editingSubTask ? 'Update' : 'Add'}</Button>
                          </div>
                        </form>
                      </div>
                    )}

                    <div className="space-y-3">
                      {subTasks.map(st => (
                        <div key={st.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white p-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md border",
                              st.is_required ? "border-amber-200 bg-amber-50 text-amber-600" : "border-zinc-100 bg-zinc-50 text-zinc-400"
                            )}>
                              <Check size={14} />
                            </div>
                            <div>
                              <span className="text-sm font-bold">{st.title}</span>
                              {st.description && <p className="text-[10px] text-zinc-400">{st.description}</p>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setEditingSubTask(st)}>Edit</Button>
                            <Button variant="danger" size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleDeleteSubTask(st.id, editingTask.id)}>Delete</Button>
                          </div>
                        </div>
                      ))}
                      {subTasks.length === 0 && (
                        <p className="py-4 text-center text-xs text-zinc-400">No sub-tasks added yet.</p>
                      )}
                    </div>
                  </Card>
                </div>
              )}

              {adminTab === 'leaderboard' && (
                <div className="space-y-8">
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Trophy size={20} /> Quest Leaderboard
                  </h2>

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {leaderboard.map((item, idx) => (
                      <Card key={item.taskId} className="relative overflow-hidden border-zinc-100">
                        <div className="absolute top-0 right-0 p-2 text-[40px] font-black text-zinc-50 opacity-10">
                          0{idx + 1}
                        </div>
                        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">{item.taskName}</h3>

                        <div className="space-y-4">
                          <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                            <span className="block text-[10px] font-bold uppercase text-emerald-600">First Scan (Started)</span>
                            {item.firstScan ? (
                              <div className="mt-1">
                                <span className="block text-sm font-bold text-emerald-900">{item.firstScan.team_name}</span>
                                <span className="text-[10px] font-mono text-emerald-500">{formatTime(item.firstScan.timestamp)}</span>
                              </div>
                            ) : (
                              <span className="mt-1 block text-xs italic text-emerald-400">No scans yet</span>
                            )}
                          </div>

                          <div className="rounded-lg bg-amber-50 p-3 border border-amber-100">
                            <span className="block text-[10px] font-bold uppercase text-amber-600">First Completion</span>
                            {item.firstComplete ? (
                              <div className="mt-1">
                                <div className="flex items-center gap-2">
                                  <span className="block text-sm font-bold text-amber-900">{item.firstComplete.team_name}</span>
                                  <Trophy size={12} className="text-amber-500" />
                                </div>
                                <span className="text-[10px] font-mono text-amber-500">{formatTime(item.firstComplete.timestamp)}</span>
                              </div>
                            ) : (
                              <span className="mt-1 block text-xs italic text-amber-400">Not completed yet</span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <Card>
                    <h3 className="mb-4 font-bold">Overall Standings</h3>
                    <div className="space-y-3">
                      {teams.map((team, idx) => {
                        const teamProgress = progress.filter(p => p.team_id === team.id);
                        const completed = teamProgress.filter(p => p.status === 'completed');
                        const lastUpdate = completed.length > 0 ? completed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0].updated_at : null;
                        const isWinner = completed.length === qrTasks.length && qrTasks.length > 0;

                        return (
                          <div key={team.id} className={cn(
                            "flex items-center justify-between rounded-xl border p-4 transition-all",
                            isWinner ? "border-red-200 bg-red-50 shadow-md" : "border-zinc-100 bg-white"
                          )}>
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full font-bold",
                                idx === 0 ? "bg-amber-100 text-amber-600" : "bg-zinc-100 text-zinc-400"
                              )}>
                                {idx + 1}
                              </div>
                              <div>
                                <span className="block font-bold">{team.name}</span>
                                {lastUpdate && (
                                  <span className="text-[10px] text-zinc-400">Last activity: {formatTime(lastUpdate)}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span className={cn(
                                  "block text-lg font-black",
                                  isWinner ? "text-red-600" : "text-zinc-900"
                                )}>
                                  {completed.length}/{qrTasks.length}
                                </span>
                                <span className="text-[10px] font-bold uppercase text-zinc-400">Tasks Done</span>
                              </div>
                              {isWinner && <Trophy size={24} className="text-red-500" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              )}

              {adminTab === 'logs' && (
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                      <Clock size={20} /> Live Activity Logs
                    </h2>
                    <Button variant="danger" size="sm" onClick={handleResetLogs}>
                      Reset All Logs
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {logs.map(log => (
                      <div key={log.id} className="flex items-start gap-4 border-b border-zinc-50 pb-3 last:border-0">
                        <div className={cn(
                          "mt-1 flex h-2 w-2 shrink-0 rounded-full",
                          log.type === 'login' ? "bg-blue-500" :
                            log.type === 'scan' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                              log.type === 'complete' ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "bg-zinc-300"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">{log.team_name}</span>
                            <span className="font-mono text-[10px] text-zinc-400">{formatTime(log.timestamp)}</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {log.type === 'login' && 'Logged into the system'}
                            {log.type === 'scan' && `Started QR Task ${log.qr_task_id}`}
                            {log.type === 'complete' && `Completed QR Task ${log.qr_task_id}`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <p className="py-8 text-center text-sm text-zinc-400">No activity logs found.</p>
                    )}
                  </div>
                </Card>
              )}

              {adminTab === 'submissions' && (
                <div className="space-y-6">
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <ImageIcon size={20} /> Team Submissions
                  </h2>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {submissions.map(sub => (
                      <Card key={sub.id} className="overflow-hidden p-0">
                        {sub.image_path ? (
                          <div className="aspect-video w-full overflow-hidden bg-zinc-100">
                            <img
                              src={sub.image_path}
                              alt={`Submission from ${sub.team_name}`}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center bg-zinc-100 text-zinc-400">
                            <ImageIcon size={48} />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-bold">{sub.team_name}</span>
                            <span className="text-[10px] font-mono text-zinc-400">{formatTime(sub.timestamp)}</span>
                          </div>
                          <div className="mb-4">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Task</span>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs font-medium">{sub.task_name}</p>
                              {sub.status === 'pending_approval' && (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">Needs Review</span>
                              )}
                              {sub.status === 'approved' && (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600">Approved</span>
                              )}
                              {sub.status === 'rejected' && (
                                <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">Rejected</span>
                              )}
                            </div>
                          </div>
                          <div className="mb-4">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Team Notes / Data</span>
                            <div className="mt-1 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-600">
                              {(() => {
                                try {
                                  const parsed = JSON.parse(sub.task_data);
                                  if (typeof parsed === 'object' && parsed !== null) {
                                    return (
                                      <ul className="space-y-1">
                                        {Object.entries(parsed).map(([k, v]) => (
                                          <li key={k}><span className="font-semibold">{k}:</span> {String(v)}</li>
                                        ))}
                                      </ul>
                                    );
                                  }
                                } catch {
                                  // not json
                                }
                                return sub.task_data || 'No data provided.';
                              })()}
                            </div>
                          </div>
                          {sub.status === 'pending_approval' && (
                            <div className="flex gap-2 border-t border-zinc-100 pt-4 mt-4">
                              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" size="sm" onClick={() => handleReviewSubmission(sub.id, 'approved')}>
                                Approve
                              </Button>
                              <Button variant="danger" className="flex-1" size="sm" onClick={() => handleReviewSubmission(sub.id, 'rejected')}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                    {submissions.length === 0 && (
                      <div className="col-span-full py-12 text-center text-zinc-400">
                        No submissions found yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {adminTab === 'setup' && (
                <div className="grid gap-8 lg:grid-cols-2">
                  <Card>
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                      <Activity size={20} /> Game Configuration
                    </h2>
                    <form onSubmit={handleUpdateSettings} className="space-y-6">
                      <div>
                        <label className="text-xs font-bold uppercase text-zinc-400">Challenge Duration (minutes)</label>
                        <input autoComplete="off"
                          name="duration"
                          type="number"
                          defaultValue={settings?.duration || '120'}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-black focus:outline-none"
                          required
                        />
                        <p className="mt-1 text-[10px] text-zinc-400">Total time allowed for teams to complete all tasks.</p>
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase text-zinc-400">Game Status</label>
                        <select
                          name="game_status"
                          defaultValue={settings?.game_status || 'setup'}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-black focus:outline-none"
                        >
                          <option value="setup">Setup Mode (Locked for teams)</option>
                          <option value="active">Active (Game in progress)</option>
                          <option value="finished">Finished (Leaderboard final)</option>
                        </select>
                      </div>

                      <Button type="submit" className="w-full">Save Configuration</Button>
                    </form>
                  </Card>

                  <Card className="border-red-100 bg-red-50/10">
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-red-600">
                      <AlertCircle size={20} /> Danger Zone
                    </h2>
                    <p className="mb-6 text-sm text-zinc-500">
                      Resetting the game will clear all progress for all teams. This action cannot be undone.
                    </p>
                    <div className="space-y-4">
                      <Button variant="danger" className="w-full" onClick={handleResetGame}>
                        Reset Entire Game Progress
                      </Button>
                      <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" onClick={handleResetLogs}>
                        Clear Live Logs Only
                      </Button>
                    </div>
                  </Card>

                  <Card className="lg:col-span-2">
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                      <QrCode size={20} /> Initial Clue Locations
                    </h2>
                    <p className="mb-4 text-sm text-zinc-500">
                      Configure the tasks that teams must complete. Each task generates a unique QR code.
                    </p>
                    <div className="flex gap-4">
                      <Button variant="outline" onClick={() => setAdminTab('tasks')}>
                        Manage QR Tasks
                      </Button>
                      <Button variant="outline" onClick={() => setAdminTab('teams')}>
                        Manage Teams
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </motion.div>
          )}

          {view === 'dashboard' && user?.type === 'team' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-black tracking-tighter sm:text-3xl">
                  {user.name} <span className="text-zinc-400">/ Dashboard</span>
                </h1>
                <div className="flex items-center gap-2">
                  <div className="mr-4 hidden items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500 sm:flex">
                    <Users size={12} /> Team Account
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    setTeamTab(teamTab === 'dashboard' ? 'tasks' : 'dashboard');
                  }}>
                    {teamTab === 'dashboard' ? 'View Task List' : 'Back to Dashboard'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    hasRedirected.current = false;
                    setUser(null);
                  }}>
                    <LogOut size={16} className="mr-2" /> Logout
                  </Button>
                </div>
              </div>

              {teamTab === 'dashboard' ? (
                <motion.div
                  key="team-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8"
                >
                  {/* Game Status Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-black p-6 text-white shadow-xl">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl",
                        settings?.game_status === 'active' ? "bg-emerald-500" : "bg-zinc-700"
                      )}>
                        <Activity size={24} className={settings?.game_status === 'active' ? "animate-pulse" : ""} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight">
                          {settings?.game_status === 'active' ? 'Game is Active' :
                            settings?.game_status === 'setup' ? 'Waiting for Start' : 'Game Finished'}
                        </h2>
                        <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
                          Challenge Status
                        </p>
                      </div>
                    </div>

                    {settings?.game_status === 'active' && <CountdownTimer settings={settings} />}

                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <span className="block text-xl font-black">{settings?.duration || '--'}</span>
                        <span className="text-[10px] font-bold uppercase text-zinc-400">Minutes Total</span>
                      </div>
                      <div className="h-8 w-px bg-zinc-800" />
                      <div className="text-center">
                        <span className="block text-xl font-black">{qrTasks.filter(t => t.is_active !== 0).length}</span>
                        <span className="text-[10px] font-bold uppercase text-zinc-400">Total Clues</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-3">
                    <Card className="md:col-span-2">
                      <div className="mb-6 flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold">Your Progress</h2>
                          <p className="text-sm text-zinc-500">Scan QR codes to unlock your next challenge</p>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold">
                            {progress.filter(p => p.status === 'completed' && qrTasks.find(t => t.id === p.qr_task_id)?.is_active !== 0).length}/{progress.filter(p => qrTasks.find(t => t.id === p.qr_task_id)?.is_active !== 0).length}
                          </div>
                          <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tasks Done</div>
                        </div>
                      </div>
                      <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-100">
                        <motion.div
                          className="h-full bg-black"
                          initial={{ width: 0 }}
                          animate={{ width: `${(progress.filter(p => p.status === 'completed' && qrTasks.find(t => t.id === p.qr_task_id)?.is_active !== 0).length / (progress.filter(p => qrTasks.find(t => t.id === p.qr_task_id)?.is_active !== 0).length || 1)) * 100}%` }}
                        />
                      </div>
                    </Card>

                    <Card className="flex flex-col items-center justify-center text-center">
                      <div className="grid w-full grid-cols-2 gap-2">
                        <Button
                          size="lg"
                          className="h-24 flex-col gap-2 rounded-2xl"
                          onClick={() => setScanning(true)}
                        >
                          <Camera size={24} />
                          <span className="text-xs">Camera</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-24 flex-col gap-2 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-300"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <ImageIcon size={24} />
                          <span className="text-xs">Upload</span>
                        </Button>
                      </div>
                      <input autoComplete="off"
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileUpload}
                      />
                      <p className="mt-4 text-xs font-medium text-zinc-500 uppercase tracking-widest">Scan QR Code</p>
                      {error && (
                        <p className="mt-2 text-xs font-medium text-red-500">{error}</p>
                      )}
                    </Card>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {progress.filter(p => qrTasks.find(t => t.id === p.qr_task_id)?.is_active !== 0).map(p => (
                      <Card
                        key={p.qr_task_id}
                        className={cn(
                          "relative flex flex-col items-center justify-between transition-all",
                          p.status === 'completed' ? "border-green-200 bg-green-50/30" :
                            p.status === 'started' ? "border-amber-200 bg-amber-50/30" : ""
                        )}
                      >
                        <div className="mb-4 text-center">
                          <div className={cn(
                            "mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold",
                            p.status === 'completed' ? "border-green-500 bg-green-500 text-white" : "border-zinc-200"
                          )}>
                            {p.status === 'completed' ? <CheckCircle2 size={20} /> : <QrCode size={20} />}
                          </div>
                          <h4 className="font-bold">{p.name}</h4>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-400">
                            {p.status === 'completed' ? 'Finished' :
                              p.status === 'pending_approval' ? 'Awaiting Approval' :
                                p.status === 'started' ? 'In Progress' : 'Locked'}
                          </p>
                        </div>
                        {p.status === 'completed' || p.status === 'pending_approval' ? (
                          <div className="text-[10px] font-mono text-zinc-400">
                            {formatTime(p.updated_at)}
                          </div>
                        ) : (
                          <Button
                            variant={p.status === 'started' ? "primary" : "outline"}
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => {
                              if (p.status === 'started') {
                                const task = qrTasks.find(t => t.id === p.qr_task_id);
                                if (task) {
                                  setActiveTask(task);
                                  setView('task');
                                } else {
                                  // If tasks not loaded, fetch them
                                  fetchQrTasks().then(() => {
                                    const t = qrTasks.find(item => item.id === p.qr_task_id);
                                    if (t) {
                                      setActiveTask(t);
                                      setView('task');
                                    }
                                  });
                                }
                              } else {
                                setError('Please scan the QR code for this task first.');
                              }
                            }}
                          >
                            {p.status === 'started' ? 'Continue Task' : 'Scan to Unlock'}
                          </Button>
                        )}
                      </Card>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="team-tasks"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Task Files</h2>
                      <p className="text-sm text-zinc-500">Access your unlocked challenge pages</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
                      <FileSearch size={20} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[...qrTasks].filter(t => t.is_active !== 0).sort((a, b) => a.sequence_order - b.sequence_order).map((task, idx) => {
                      const p = progress.find(item => item.qr_task_id === task.id);
                      const isLocked = !p || (p.status === 'pending');
                      const isCompleted = p?.status === 'completed';
                      const isCurrent = p?.status === 'started';

                      return (
                        <button
                          key={task.id}
                          disabled={isLocked}
                          onClick={() => {
                            setActiveTask(task);
                            setView('task');
                          }}
                          className={cn(
                            "group relative flex flex-col items-start rounded-2xl border-2 p-6 text-left transition-all",
                            isLocked ? "border-zinc-100 bg-zinc-50 opacity-50 grayscale cursor-not-allowed" :
                              isCompleted ? "border-green-100 bg-green-50/30 hover:border-green-200" :
                                isCurrent ? "border-black bg-white shadow-lg ring-4 ring-black/5" :
                                  "border-zinc-200 bg-white hover:border-black"
                          )}
                        >
                          <div className={cn(
                            "mb-4 flex h-12 w-12 items-center justify-center rounded-xl font-mono text-xl font-black transition-colors",
                            isLocked ? "bg-zinc-200 text-zinc-400" : "bg-zinc-100 group-hover:bg-black group-hover:text-white"
                          )}>
                            {idx + 1}
                          </div>
                          <h3 className="font-bold line-clamp-1">{task.name}</h3>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                            {isLocked ? 'Locked' :
                              isCompleted ? 'Completed' :
                                p?.status === 'pending_approval' ? 'Pending Approval' :
                                  isCurrent ? 'Active' : 'Unlocked'}
                          </p>

                          <div className="mt-4 flex w-full items-center justify-between border-t border-zinc-50 pt-4">
                            <span className="text-[10px] font-mono text-zinc-400">PAGE_{idx + 1}.DOC</span>
                            {isLocked ? (
                              <QrCode size={14} className="text-zinc-300" />
                            ) : isCompleted || p?.status === 'pending_approval' ? (
                              <CheckCircle2 size={14} className={p?.status === 'pending_approval' ? "text-amber-500" : "text-green-500"} />
                            ) : (
                              <ChevronRight size={14} className="text-zinc-400 group-hover:translate-x-1 transition-transform" />
                            )}
                          </div>
                          {isCompleted && task.next_clue_hint && (
                            <div className="mt-4 w-full rounded bg-emerald-50/50 p-3 text-sm text-emerald-800 border border-emerald-100 flex items-start gap-2">
                              <span className="font-bold text-emerald-600 mt-0.5 whitespace-nowrap">NEXT CLUE:</span>
                              <p className="leading-snug">{task.next_clue_hint}</p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {view === 'task' && activeTask && (
            <motion.div
              key="task-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mx-auto max-w-2xl"
            >
              <Card>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{activeTask.name}</h2>
                    <p className="text-sm text-zinc-500">Complete the task below and upload your proof</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setView('dashboard')}>
                    Back
                  </Button>
                </div>

                <div className="mb-8 rounded-lg bg-zinc-50 p-6">
                  <h3 className="mb-2 font-bold">Task Instructions</h3>
                  <p className="text-sm leading-relaxed text-zinc-600">
                    {activeTask.task_description}
                  </p>
                </div>

                {teamSubTasks.length > 0 && (
                  <div className="mb-8 space-y-4">
                    <h3 className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={18} className="text-emerald-500" /> Task Checklist
                    </h3>
                    <div className="grid gap-4">
                      {teamSubTasks.map(st => (
                        <Card
                          key={st.id}
                          className={cn(
                            "flex flex-col gap-4 transition-all",
                            st.is_completed ? "border-emerald-100 bg-emerald-50/20" : "border-zinc-100"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => handleToggleSubTask(st.id, !st.is_completed)}
                                className={cn(
                                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all",
                                  st.is_completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-200 hover:border-black"
                                )}
                              >
                                {st.is_completed && <Check size={14} />}
                              </button>
                              <div>
                                <h4 className={cn("font-bold", st.is_completed && "text-zinc-400 line-through")}>
                                  {st.title}
                                  {st.is_required === 1 && <span className="ml-2 text-[10px] font-bold uppercase text-amber-500">Required</span>}
                                </h4>
                                {st.description && <p className="mt-1 text-xs text-zinc-500">{st.description}</p>}
                              </div>
                            </div>
                          </div>
                          {st.image_path && (
                            <div className="overflow-hidden rounded-xl border border-zinc-100">
                              <img
                                src={st.image_path}
                                alt={st.title}
                                className="h-auto w-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleTaskSubmit} className="space-y-6">
                  {(() => {
                    let template: any[] = [];
                    try { if (activeTask.form_template) template = JSON.parse(activeTask.form_template); } catch { }

                    if (template.length > 0) {
                      return (
                        <div className="space-y-4">
                          {template.map((field) => (
                            <div key={field.id} className="space-y-2">
                              <label className="text-sm font-bold">{field.label}</label>
                              {field.type === 'longtext' ? (
                                <textarea autoComplete="off" name={field.id} className="w-full rounded-lg border border-zinc-200 p-3 text-sm focus:border-black focus:outline-none" required rows={4} />
                              ) : field.type === 'number' ? (
                                <input autoComplete="off" type="number" name={field.id} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-black focus:outline-none" required />
                              ) : (
                                <input autoComplete="off" type="text" name={field.id} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-black focus:outline-none" required />
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <label className="text-sm font-bold">Task Notes / Description</label>
                        <textarea autoComplete="off"
                          name="taskData"
                          placeholder="Describe what you did..."
                          className="h-32 w-full rounded-lg border border-zinc-200 p-4 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                          required
                        />
                      </div>
                    );
                  })()}

                  {activeTask.image_required !== 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold">Upload Image Proof</label>
                      <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 p-8 transition-colors hover:border-zinc-300 relative overflow-hidden">
                        <label className="flex w-full cursor-pointer flex-col items-center gap-2 text-center">
                          {imagePreview ? (
                            <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-contain" />
                          ) : (
                            <>
                              <div className="rounded-full bg-zinc-100 p-3">
                                <Upload size={24} className="text-zinc-500" />
                              </div>
                              <span className="text-sm font-medium text-zinc-600">Click to upload image</span>
                              <span className="text-xs text-zinc-400">JPG, PNG or GIF up to 5MB</span>
                            </>
                          )}
                          <input autoComplete="off" type="file" name="image" className="hidden" accept="image/*" required
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setImagePreview(URL.createObjectURL(file));
                              } else {
                                setImagePreview(null);
                              }
                            }}
                          />
                        </label>
                        {imagePreview && (
                          <button type="button" onClick={(e) => { e.preventDefault(); setImagePreview(null); }} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-zinc-100 transition-colors pointer-events-auto z-10">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="w-full py-4 text-lg">
                    Submit Task
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${t.type === 'error' ? 'bg-red-500 text-white' :
                t.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-zinc-900 text-white'
                }`}
            >
              <span className="text-sm font-medium">{t.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-2 hover:opacity-70">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div >
  );
}
