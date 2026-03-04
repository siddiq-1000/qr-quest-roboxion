import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel locks the filesystem to read-only except for /tmp.
const dbPath = process.env.VERCEL ? "/tmp/qr_quest.db" : "qr_quest.db";
const db = new Database(dbPath);

// Ensure uploads directory exists (use /tmp on Vercel)
const uploadsDir = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    secret_character TEXT,
    secret_index INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS qr_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    task_description TEXT NOT NULL,
    sequence_order INTEGER DEFAULT 0,
    is_checkpoint INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    image_required INTEGER DEFAULT 1,
    section_name TEXT DEFAULT '',
    form_template TEXT DEFAULT '[]',
    next_clue_hint TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT,
    type TEXT NOT NULL,
    qr_task_id INTEGER,
    message TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    team_id TEXT,
    qr_task_id INTEGER,
    status TEXT DEFAULT 'pending',
    updated_at TEXT,
    PRIMARY KEY(team_id, qr_task_id),
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT,
    qr_task_id INTEGER,
    image_path TEXT,
    task_data TEXT,
    status TEXT DEFAULT 'pending',
    timestamp TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(qr_task_id) REFERENCES qr_tasks(id)
  );

  CREATE TABLE IF NOT EXISTS sub_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_task_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_path TEXT,
    is_required INTEGER DEFAULT 1,
    FOREIGN KEY(qr_task_id) REFERENCES qr_tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS team_sub_task_progress (
    team_id TEXT NOT NULL,
    sub_task_id INTEGER NOT NULL,
    is_completed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(team_id, sub_task_id),
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed settings if empty
const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
if (settingsCount.count === 0) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("duration", "120"); // default 120 minutes
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("game_status", "setup"); // setup, active, finished
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("game_start_time", "");
}

// Migration: Ensure columns exist for older databases
const migrate = () => {
  const tables = {
    teams: ['secret_character', 'secret_index'],
    logs: ['qr_task_id'],
    progress: ['status', 'qr_task_id'],
    submissions: ['status', 'qr_task_id'],
    qr_tasks: ['sequence_order', 'is_checkpoint', 'is_active', 'image_required', 'section_name', 'form_template', 'next_clue_hint']
  };

  for (const [table, columns] of Object.entries(tables)) {
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const existingColumns = tableInfo.map(c => c.name);

    for (const column of columns) {
      if (!existingColumns.includes(column)) {
        console.log(`Migrating: Adding ${column} to ${table}`);
        try {
          if (column === 'status') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN status TEXT DEFAULT 'pending'`);
          } else if (column === 'qr_task_id') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN qr_task_id INTEGER`);
          } else if (column === 'sequence_order') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN sequence_order INTEGER DEFAULT 0`);
          } else if (column === 'is_checkpoint') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN is_checkpoint INTEGER DEFAULT 0`);
          } else if (column === 'is_active') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN is_active INTEGER DEFAULT 1`);
          } else if (column === 'image_required') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN image_required INTEGER DEFAULT 1`);
          } else if (column === 'section_name') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN section_name TEXT DEFAULT ''`);
          } else if (column === 'form_template') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN form_template TEXT DEFAULT '[]'`);
          } else if (column === 'secret_character') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN secret_character TEXT`);
          } else if (column === 'secret_index') {
            db.exec(`ALTER TABLE ${table} ADD COLUMN secret_index INTEGER`);
          }
        } catch (e) {
          console.error(`Migration failed for ${table}.${column}:`, e);
        }
      }
    }
  }
};
migrate();

// Seed admin if empty
const adminCount = db.prepare("SELECT COUNT(*) as count FROM admins").get() as { count: number };
if (adminCount.count === 0) {
  db.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run("admin", "makeup2026");
}

// Seed QR tasks if empty
const taskCount = db.prepare("SELECT COUNT(*) as count FROM qr_tasks").get() as { count: number };
if (taskCount.count === 0) {
  const insertTask = db.prepare("INSERT INTO qr_tasks (slug, name, task_description, sequence_order) VALUES (?, ?, ?, ?)");
  insertTask.run("qr-code-1", "Task One", "Complete the initial makeup challenge.", 1);
  insertTask.run("qr-code-2", "Task Two", "Second phase of the challenge.", 2);
  insertTask.run("qr-code-3", "Task Three", "Finalizing the look.", 3);
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// WebSocket broadcast helper
const broadcast = (data: any) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

app.get("/api/admin/settings", (req, res) => {
  const settings = db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
  const settingsObj = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json(settingsObj);
});

app.get("/api/admin/qr-tasks/:id/sub-tasks", (req, res) => {
  const { id } = req.params;
  const subTasks = db.prepare("SELECT * FROM sub_tasks WHERE qr_task_id = ?").all(id);
  res.json(subTasks);
});

app.post("/api/admin/qr-tasks/:id/sub-tasks", upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { title, description, is_required } = req.body;
  const image_path = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = db.prepare("INSERT INTO sub_tasks (qr_task_id, title, description, image_path, is_required) VALUES (?, ?, ?, ?, ?)")
      .run(id, title, description, image_path, is_required === 'true' ? 1 : 0);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: "Failed to create sub-task" });
  }
});

app.patch("/api/admin/sub-tasks/:id", upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { title, description, is_required } = req.body;
  const image_path = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    if (image_path) {
      db.prepare("UPDATE sub_tasks SET title = ?, description = ?, is_required = ?, image_path = ? WHERE id = ?")
        .run(title, description, is_required === 'true' ? 1 : 0, image_path, id);
    } else {
      db.prepare("UPDATE sub_tasks SET title = ?, description = ?, is_required = ? WHERE id = ?")
        .run(title, description, is_required === 'true' ? 1 : 0, id);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update sub-task" });
  }
});

app.delete("/api/admin/sub-tasks/:id", (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM sub_tasks WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete sub-task" });
  }
});

app.get("/api/team/:teamId/tasks/:taskId/sub-tasks", (req, res) => {
  const { teamId, taskId } = req.params;
  const subTasks = db.prepare(`
      SELECT s.*, COALESCE(p.is_completed, 0) as is_completed
      FROM sub_tasks s
      LEFT JOIN team_sub_task_progress p ON s.id = p.sub_task_id AND p.team_id = ?
      WHERE s.qr_task_id = ?
    `).all(teamId, taskId);
  res.json(subTasks);
});

app.post("/api/team/sub-tasks/:id/toggle", (req, res) => {
  const { id } = req.params;
  const { teamId, is_completed } = req.body;
  try {
    db.prepare("INSERT OR REPLACE INTO team_sub_task_progress (team_id, sub_task_id, is_completed, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
      .run(teamId, id, is_completed ? 1 : 0);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to toggle sub-task" });
  }
});

app.post("/api/admin/settings", (req, res) => {
  const { duration, game_status, secret_passcode } = req.body;
  try {
    if (duration !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("duration", duration.toString());
    }
    if (secret_passcode !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("secret_passcode", secret_passcode.toString());
    }
    if (game_status !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("game_status", game_status);
      if (game_status === 'active') {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("game_start_time", new Date().toISOString());
      }
    }
    broadcast({ type: "SETTINGS_UPDATE" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

app.post("/api/admin/game/reset", (req, res) => {
  try {
    db.prepare("DELETE FROM progress").run();
    db.prepare("DELETE FROM logs").run();
    db.prepare("DELETE FROM submissions").run();
    db.prepare("UPDATE settings SET value = 'setup' WHERE key = 'game_status'").run();
    db.prepare("UPDATE settings SET value = '' WHERE key = 'game_start_time'").run();

    // Re-initialize progress for all teams and tasks
    const teams = db.prepare("SELECT id FROM teams").all() as { id: string }[];
    const tasks = db.prepare("SELECT id FROM qr_tasks").all() as { id: number }[];
    const insertProgress = db.prepare("INSERT INTO progress (team_id, qr_task_id) VALUES (?, ?)");

    teams.forEach(team => {
      tasks.forEach(task => {
        insertProgress.run(team.id, task.id);
      });
    });

    broadcast({ type: "LOG_RESET" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset game" });
  }
});

// API Routes
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE username = ? AND password = ?").get(username, password) as any;
  if (admin) {
    res.json({ success: true, token: "admin-token", username: admin.username });
  } else {
    res.status(401).json({ error: "Invalid admin credentials" });
  }
});

app.get("/api/admin/teams", (req, res) => {
  const teams = db.prepare("SELECT * FROM teams").all();
  res.json(teams);
});

app.patch("/api/admin/teams/:id", (req, res) => {
  const { name, password } = req.body;
  const { id } = req.params;
  try {
    db.prepare("UPDATE teams SET name = ?, password = ? WHERE id = ?").run(name, password, id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to update team" });
  }
});

app.delete("/api/admin/teams/:id", (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM progress WHERE team_id = ?").run(id);
    db.prepare("DELETE FROM logs WHERE team_id = ?").run(id);
    db.prepare("DELETE FROM submissions WHERE team_id = ?").run(id);
    db.prepare("DELETE FROM teams WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to delete team" });
  }
});

app.post("/api/admin/teams", (req, res) => {
  const { name, password } = req.body;
  const id = name.toLowerCase().replace(/\s+/g, "-");
  try {
    // Fetch the secret passcode if it exists
    const settings = db.prepare("SELECT value FROM settings WHERE key = 'secret_passcode'").get() as { value: string } | undefined;
    let secret_character = null;
    let secret_index = null;

    // Assign a random character from the secret code to this team
    if (settings && settings.value && settings.value.length > 0) {
      const code = settings.value;
      const index = Math.floor(Math.random() * code.length);
      secret_character = code[index];
      secret_index = index + 1; // 1-indexed for the UI display
    }

    db.prepare("INSERT INTO teams (id, name, password, secret_character, secret_index) VALUES (?, ?, ?, ?, ?)").run(id, name, password, secret_character, secret_index);

    // Initialize progress for all tasks
    const tasks = db.prepare("SELECT id FROM qr_tasks").all() as { id: number }[];
    const insertProgress = db.prepare("INSERT INTO progress (team_id, qr_task_id) VALUES (?, ?)");
    tasks.forEach(t => insertProgress.run(id, t.id));

    res.json({ success: true, team: { id, name } });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Team already exists or invalid data" });
  }
});

app.get("/api/admin/logs", (req, res) => {
  const logs = db.prepare(`
      SELECT logs.*, teams.name as team_name 
      FROM logs 
      LEFT JOIN teams ON logs.team_id = teams.id 
      ORDER BY id DESC LIMIT 100
    `).all();
  res.json(logs);
});

app.get("/api/admin/progress", (req, res) => {
  const progress = db.prepare(`
      SELECT progress.*, teams.name as team_name 
      FROM progress 
      JOIN teams ON progress.team_id = teams.id
    `).all();
  res.json(progress);
});

app.get("/api/admin/stats", (req, res) => {
  const totalTeams = db.prepare("SELECT COUNT(*) as count FROM teams").get() as any;
  const totalTasks = db.prepare("SELECT COUNT(*) as count FROM qr_tasks").get() as any;
  const totalSubmissions = db.prepare("SELECT COUNT(*) as count FROM submissions").get() as any;
  const pendingSubmissions = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'").get() as any;
  const recentLogs = db.prepare(`
      SELECT logs.*, teams.name as team_name 
      FROM logs 
      LEFT JOIN teams ON logs.team_id = teams.id 
      ORDER BY id DESC LIMIT 5
    `).all();

  res.json({
    totalTeams: totalTeams.count,
    totalTasks: totalTasks.count,
    totalSubmissions: totalSubmissions.count,
    pendingSubmissions: pendingSubmissions.count,
    recentLogs
  });
});

app.get("/api/admin/qr-tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM qr_tasks").all();
  res.json(tasks);
});

app.post("/api/admin/qr-tasks", (req, res) => {
  const { name, slug, task_description, sequence_order, is_checkpoint, is_active, image_required, section_name, form_template, next_clue_hint } = req.body;
  try {
    const result = db.prepare("INSERT INTO qr_tasks (name, slug, task_description, sequence_order, is_checkpoint, is_active, image_required, section_name, form_template, next_clue_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(name, slug, task_description, sequence_order || 0, is_checkpoint ? 1 : 0, is_active === undefined ? 1 : (is_active ? 1 : 0), image_required === undefined ? 1 : (image_required ? 1 : 0), section_name || '', form_template || '[]', next_clue_hint || '');
    const taskId = result.lastInsertRowid;

    // Initialize progress for all existing teams
    const teams = db.prepare("SELECT id FROM teams").all() as { id: string }[];
    const insertProgress = db.prepare("INSERT INTO progress (team_id, qr_task_id) VALUES (?, ?)");
    teams.forEach(team => insertProgress.run(team.id, taskId));

    res.json({ success: true, id: taskId });
  } catch (e) {
    res.status(400).json({ error: "Slug already exists or invalid data" });
  }
});

app.patch("/api/admin/qr-tasks/:id", (req, res) => {
  const { name, slug, task_description, sequence_order, is_checkpoint, is_active, image_required, section_name, form_template, next_clue_hint } = req.body;
  const { id } = req.params;
  try {
    db.prepare("UPDATE qr_tasks SET name = ?, slug = ?, task_description = ?, sequence_order = ?, is_checkpoint = ?, is_active = ?, image_required = ?, section_name = ?, form_template = ?, next_clue_hint = ? WHERE id = ?")
      .run(name, slug, task_description, sequence_order || 0, is_checkpoint ? 1 : 0, is_active === undefined ? 1 : (is_active ? 1 : 0), image_required === undefined ? 1 : (image_required ? 1 : 0), section_name || '', form_template || '[]', next_clue_hint || '', id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to update task" });
  }
});

app.delete("/api/admin/qr-tasks/:id", (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM progress WHERE qr_task_id = ?").run(id);
    db.prepare("DELETE FROM submissions WHERE qr_task_id = ?").run(id);
    db.prepare("DELETE FROM qr_tasks WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to delete task" });
  }
});

app.get("/api/admin/submissions", (req, res) => {
  const submissions = db.prepare(`
      SELECT submissions.*, teams.name as team_name, qr_tasks.name as task_name 
      FROM submissions 
      JOIN teams ON submissions.team_id = teams.id 
      JOIN qr_tasks ON submissions.qr_task_id = qr_tasks.id 
      ORDER BY id DESC
    `).all();
  res.json(submissions);
});

app.post("/api/admin/submissions/:id/review", (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'
  const { id } = req.params;
  try {
    const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as any;
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    db.prepare("UPDATE submissions SET status = ? WHERE id = ?").run(status, id);

    const progressStatus = status === 'approved' ? 'completed' : 'started'; // go back to started if rejected
    db.prepare("UPDATE progress SET status = ?, updated_at = ? WHERE team_id = ? AND qr_task_id = ?").run(progressStatus, new Date().toISOString(), submission.team_id, submission.qr_task_id);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to review submission" });
  }
});

app.post("/api/admin/logs/reset", (req, res) => {
  try {
    db.prepare("DELETE FROM logs").run();
    broadcast({ type: "LOG_RESET" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset logs" });
  }
});

app.get("/api/admin/leaderboard", (req, res) => {
  const tasks = db.prepare("SELECT * FROM qr_tasks").all() as any[];
  const leaderboard = tasks.map(task => {
    const firstScan = db.prepare(`
        SELECT logs.*, teams.name as team_name 
        FROM logs 
        JOIN teams ON logs.team_id = teams.id 
        WHERE type = 'scan' AND qr_task_id = ? 
        ORDER BY timestamp ASC LIMIT 1
      `).get(task.id) as any;

    const firstComplete = db.prepare(`
        SELECT logs.*, teams.name as team_name 
        FROM logs 
        JOIN teams ON logs.team_id = teams.id 
        WHERE type = 'complete' AND qr_task_id = ? 
        ORDER BY timestamp ASC LIMIT 1
      `).get(task.id) as any;

    return {
      taskId: task.id,
      taskName: task.name,
      firstScan,
      firstComplete
    };
  });
  res.json(leaderboard);
});

// Team Routes
app.post("/api/team/login", (req, res) => {
  const { teamId, password } = req.body;
  const team = db.prepare("SELECT * FROM teams WHERE id = ? AND password = ?").get(teamId, password) as any;
  if (team) {
    const timestamp = new Date().toISOString();
    db.prepare("INSERT INTO logs (team_id, type, timestamp) VALUES (?, ?, ?)").run(teamId, "login", timestamp);
    broadcast({ type: "LOG_UPDATE", log: { team_id: teamId, team_name: team.name, type: "login", timestamp } });
    res.json({ success: true, team });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/team/:teamId/progress", (req, res) => {
  const progress = db.prepare(`
      SELECT progress.*, qr_tasks.slug, qr_tasks.name 
      FROM progress 
      JOIN qr_tasks ON progress.qr_task_id = qr_tasks.id 
      WHERE team_id = ?
    `).all(req.params.teamId);
  res.json(progress);
});

app.post("/api/team/validate-qr", (req, res) => {
  const { slug } = req.body;
  const task = db.prepare("SELECT * FROM qr_tasks WHERE slug = ?").get(slug) as any;
  if (task) {
    res.json({ success: true, task });
  } else {
    res.status(404).json({ error: "Invalid QR Code" });
  }
});

app.post("/api/team/scan", (req, res) => {
  const { teamId, qrTaskId } = req.body;
  const timestamp = new Date().toISOString();

  db.prepare("UPDATE progress SET status = 'started', updated_at = ? WHERE team_id = ? AND qr_task_id = ? AND status = 'pending'")
    .run(timestamp, teamId, qrTaskId);

  db.prepare("INSERT INTO logs (team_id, type, qr_task_id, timestamp) VALUES (?, ?, ?, ?)")
    .run(teamId, "scan", qrTaskId, timestamp);

  const team = db.prepare("SELECT name FROM teams WHERE id = ?").get(teamId) as any;
  broadcast({
    type: "LOG_UPDATE",
    log: { team_id: teamId, team_name: team?.name, type: "scan", qr_task_id: qrTaskId, timestamp }
  });

  res.json({ success: true });
});

app.post("/api/team/submit", upload.single("image"), (req, res) => {
  const { teamId, qrTaskId, taskData } = req.body;
  const timestamp = new Date().toISOString();
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const task = db.prepare("SELECT is_checkpoint FROM qr_tasks WHERE id = ?").get(qrTaskId) as any;
  const isCheckpoint = task && task.is_checkpoint === 1;
  const newStatus = isCheckpoint ? 'pending_approval' : 'completed';

  db.prepare("INSERT INTO submissions (team_id, qr_task_id, image_path, task_data, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
    .run(teamId, qrTaskId, imagePath, taskData, newStatus, timestamp);

  db.prepare("UPDATE progress SET status = ?, updated_at = ? WHERE team_id = ? AND qr_task_id = ?")
    .run(newStatus, timestamp, teamId, qrTaskId);

  db.prepare("INSERT INTO logs (team_id, type, qr_task_id, timestamp) VALUES (?, ?, ?, ?)")
    .run(teamId, "complete", qrTaskId, timestamp);

  const team = db.prepare("SELECT name FROM teams WHERE id = ?").get(teamId) as any;
  broadcast({
    type: "LOG_UPDATE",
    log: { team_id: teamId, team_name: team?.name, type: "complete", qr_task_id: qrTaskId, timestamp }
  });

  const pending = db.prepare("SELECT COUNT(*) as count FROM progress WHERE team_id = ? AND status != 'completed' AND status != 'pending_approval' AND qr_task_id IN (SELECT id FROM qr_tasks WHERE is_active = 1)").get(teamId) as any;
  if (pending.count === 0) {
    // Check if they are the first winner
    const finishedTeams = db.prepare(`
        SELECT p.team_id, MAX(p.updated_at) as finish_time
        FROM progress p
        WHERE p.team_id IN (
          SELECT team_id 
          FROM progress 
          WHERE qr_task_id IN (SELECT id FROM qr_tasks WHERE is_active = 1)
          GROUP BY team_id
          HAVING SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) = 0
        )
        GROUP BY p.team_id
        ORDER BY finish_time ASC
      `).all() as any[];

    const placementIndex = finishedTeams.findIndex(t => t.team_id === teamId);
    const placement = placementIndex + 1; // 1st, 2nd, 3rd, etc.

    if (placement > 0 && placement <= 3) {
      broadcast({ type: "WINNER_ANNOUNCED", teamName: team?.name, placement: placement });
    } else {
      broadcast({ type: "TEAM_FINISHED", teamName: team?.name, isWinner: false });
    }
  }

  res.json({ success: true, status: newStatus });
});

// Since we are running Frontend (Vite) on port 5173, Backend on 3000
// we no longer serve the Vite bundle or API on the same port in development.

// Only listen natively if we are not running in a Serverless environment (like Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Export for Vercel serverless functions
export default app;
