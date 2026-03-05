import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure uploads directory exists (use /tmp on Vercel)
const uploadsDir = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for uploads to memory (for base64 conversion)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Database Connection
let isConnected = false;
const connectToDB = async () => {
  if (isConnected) return;
  try {
    const uri = process.env.atlas_URL || process.env.MONGODB_URI;
    if (!uri) throw new Error("MongoDB URI missing in .env (atlas_URL or MONGODB_URI)");

    await mongoose.connect(uri);
    isConnected = true;
    console.log("MongoDB Connected Successfully");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
};

// Mongoose Models
const AdminUser = mongoose.model('Admin', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}));

const Team = mongoose.model('Team', new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // slug id
  name: { type: String, required: true },
  password: { type: String, required: true },
  secret_character: { type: String },
  secret_index: { type: Number },
  created_at: { type: Date, default: Date.now }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  task_description: { type: String, required: true },
  sequence_order: { type: Number, default: 0 },
  is_checkpoint: { type: Number, default: 0 },
  is_active: { type: Number, default: 1 },
  image_required: { type: Number, default: 1 },
  section_name: { type: String, default: '' },
  form_template: { type: String, default: '[]' },
  next_clue_hint: { type: String, default: '' },
  unlock_passcode: { type: String, default: '' }
}, { toJSON: { virtuals: true } }));

const SubTask = mongoose.model('SubTask', new mongoose.Schema({
  qr_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  title: { type: String, required: true },
  description: { type: String },
  image_path: { type: String },
  is_required: { type: Number, default: 1 }
}, { toJSON: { virtuals: true } }));

const Log = mongoose.model('Log', new mongoose.Schema({
  team_id: { type: String, required: true },
  type: { type: String, required: true },
  qr_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  message: { type: String },
  timestamp: { type: String, required: true }
}, { toJSON: { virtuals: true } }));

const Progress = mongoose.model('Progress', new mongoose.Schema({
  team_id: { type: String, required: true },
  qr_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  status: { type: String, default: 'pending' },
  updated_at: { type: String }
}));

const Submission = mongoose.model('Submission', new mongoose.Schema({
  team_id: { type: String, required: true },
  qr_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  image_path: { type: String },
  task_data: { type: String },
  status: { type: String, default: 'pending' },
  timestamp: { type: String, required: true }
}));

const TeamSubTaskProgress = mongoose.model('TeamSubTaskProgress', new mongoose.Schema({
  team_id: { type: String, required: true },
  sub_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SubTask', required: true },
  is_completed: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now }
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String }
}));

const seedDatabase = async () => {
  await connectToDB();

  if (await Setting.countDocuments() === 0) {
    await Setting.insertMany([
      { key: "duration", value: "120" },
      { key: "game_status", value: "setup" },
      { key: "game_start_time", value: "" }
    ]);
  }

  if (await AdminUser.countDocuments() === 0) {
    await AdminUser.create({ username: "admin", password: "makeup2026" });
  }

  if (await Task.countDocuments() === 0) {
    await Task.insertMany([
      { slug: "qr-code-1", name: "Task One", task_description: "Complete the initial makeup challenge.", sequence_order: 1, unlock_passcode: "A" },
      { slug: "qr-code-2", name: "Task Two", task_description: "Second phase of the challenge.", sequence_order: 2, unlock_passcode: "B" },
      { slug: "qr-code-3", name: "Task Three", task_description: "Finalizing the look.", sequence_order: 3, unlock_passcode: "C" }
    ]);
  }
};
// Fire off seed locally
seedDatabase().catch(console.error);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({
  origin: ['http://localhost:5173', 'https://qr-quest-roboxion.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// Middleware connecting DB (Serverless robust)
app.use(async (req, res, next) => {
  await connectToDB();
  next();
});

// Broadcast Helper
const broadcast = (data: any) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

/* --- ADMIN API --- */
app.get("/api/admin/settings", async (req, res) => {
  const settings = await Setting.find({});
  const settingsObj = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json(settingsObj);
});

app.post("/api/admin/settings", async (req, res) => {
  const { duration, game_status, secret_passcode } = req.body;
  try {
    if (duration !== undefined) await Setting.findOneAndUpdate({ key: "duration" }, { value: duration.toString() }, { upsert: true });
    if (secret_passcode !== undefined) await Setting.findOneAndUpdate({ key: "secret_passcode" }, { value: secret_passcode.toString() }, { upsert: true });
    if (game_status !== undefined) {
      await Setting.findOneAndUpdate({ key: "game_status" }, { value: game_status }, { upsert: true });
      if (game_status === 'active') {
        const timestamp = new Date().toISOString();
        await Setting.findOneAndUpdate({ key: "game_start_time" }, { value: timestamp }, { upsert: true });
        broadcast({ type: "GLOBAL_EVENT", eventType: "game_start", timestamp });
      }
    }
    broadcast({ type: "SETTINGS_UPDATE" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

app.post("/api/admin/game/reset", async (req, res) => {
  try {
    await Progress.deleteMany({});
    await Log.deleteMany({});
    await Submission.deleteMany({});
    await Setting.findOneAndUpdate({ key: 'game_status' }, { value: 'setup' });
    await Setting.findOneAndUpdate({ key: 'game_start_time' }, { value: '' });

    const teams = await Team.find();
    const tasks = await Task.find();

    if (teams.length > 0 && tasks.length > 0) {
      const progressDocs = [];
      for (const team of teams) {
        for (const task of tasks) {
          progressDocs.push({ team_id: team.id, qr_task_id: task._id });
        }
      }
      await Progress.insertMany(progressDocs);
    }

    broadcast({ type: "LOG_RESET" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset game" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const admin = await AdminUser.findOne({ username: req.body.username, password: req.body.password });
  if (admin) res.json({ success: true, token: "admin-token", username: admin.username });
  else res.status(401).json({ error: "Invalid admin credentials" });
});

app.get("/api/admin/teams", async (req, res) => {
  const teams = await Team.find().lean();
  res.json(teams);
});

app.patch("/api/admin/teams/:id", async (req, res) => {
  try {
    await Team.findOneAndUpdate({ id: req.params.id }, { name: req.body.name, password: req.body.password });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: "Failed" }); }
});

app.delete("/api/admin/teams/:id", async (req, res) => {
  try {
    await Progress.deleteMany({ team_id: req.params.id });
    await Log.deleteMany({ team_id: req.params.id });
    await Submission.deleteMany({ team_id: req.params.id });
    await Team.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: "Failed" }); }
});

app.post("/api/admin/teams", async (req, res) => {
  const id = req.body.name.toLowerCase().replace(/\s+/g, "-");
  try {
    const settings = await Setting.findOne({ key: 'secret_passcode' });
    let secret_character = null; let secret_index = null;
    if (settings && settings.value && settings.value.length > 0) {
      const code = settings.value;
      const index = Math.floor(Math.random() * code.length);
      secret_character = code[index];
      secret_index = index + 1;
    }
    await Team.create({ id, name: req.body.name, password: req.body.password, secret_character, secret_index });

    const tasks = await Task.find();
    if (tasks.length > 0) {
      await Progress.insertMany(tasks.map(t => ({ team_id: id, qr_task_id: t._id })));
    }
    res.json({ success: true, team: { id, name: req.body.name } });
  } catch (e) { res.status(400).json({ error: "Team already exists" }); }
});

app.get("/api/admin/logs", async (req, res) => {
  const logs = await Log.find().sort({ _id: -1 }).limit(100).lean();
  const teams = await Team.find().lean();
  const teamMap = new Map<string, string>();
  teams.forEach(t => teamMap.set(t.id, t.name));
  res.json(logs.map(l => ({ ...l, id: l._id, team_name: teamMap.get(l.team_id) })));
});

app.get("/api/admin/progress", async (req, res) => {
  const progress = await Progress.find().lean();
  const teams = await Team.find().lean();
  const teamMap = new Map();
  teams.forEach(t => teamMap.set(t.id, t.name));
  res.json(progress.map(p => ({ ...p, team_name: teamMap.get(p.team_id) })));
});

app.get("/api/admin/stats", async (req, res) => {
  const totalTeams = await Team.countDocuments();
  const totalTasks = await Task.countDocuments();
  const totalSubmissions = await Submission.countDocuments();
  const pendingSubmissions = await Submission.countDocuments({ status: 'pending' });

  const logs = await Log.find().sort({ _id: -1 }).limit(5).lean();
  const teams = await Team.find().lean();
  const teamMap = new Map();
  teams.forEach(t => teamMap.set(t.id, t.name));

  res.json({
    totalTeams, totalTasks, totalSubmissions, pendingSubmissions,
    recentLogs: logs.map(l => ({ ...l, id: l._id, team_name: teamMap.get(l.team_id) }))
  });
});

app.get("/api/admin/qr-tasks", async (req, res) => {
  const tasks = await Task.find().lean();
  res.json(tasks.map(t => ({ ...t, id: t._id })));
});

app.post("/api/admin/qr-tasks", async (req, res) => {
  try {
    const task = await Task.create({
      ...req.body,
      sequence_order: req.body.sequence_order || 0,
      is_checkpoint: req.body.is_checkpoint ? 1 : 0,
      is_active: req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0),
      image_required: req.body.image_required === undefined ? 1 : (req.body.image_required ? 1 : 0),
      unlock_passcode: req.body.unlock_passcode || ''
    });
    const teams = await Team.find();
    if (teams.length > 0) {
      await Progress.insertMany(teams.map(team => ({ team_id: team.id, qr_task_id: task._id })));
    }
    res.json({ success: true, id: task._id });
  } catch (e) { res.status(400).json({ error: "Slug already exists" }); }
});

app.patch("/api/admin/qr-tasks/:id", async (req, res) => {
  try {
    await Task.findByIdAndUpdate(req.params.id, {
      ...req.body,
      sequence_order: req.body.sequence_order || 0,
      is_checkpoint: req.body.is_checkpoint ? 1 : 0,
      is_active: req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0),
      image_required: req.body.image_required === undefined ? 1 : (req.body.image_required ? 1 : 0),
      unlock_passcode: req.body.unlock_passcode || ''
    });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: "Failed" }); }
});

app.delete("/api/admin/qr-tasks/:id", async (req, res) => {
  try {
    await Progress.deleteMany({ qr_task_id: req.params.id });
    await Submission.deleteMany({ qr_task_id: req.params.id });
    await SubTask.deleteMany({ qr_task_id: req.params.id });
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: "Failed" }); }
});

app.get("/api/admin/qr-tasks/:id/sub-tasks", async (req, res) => {
  const subTasks = await SubTask.find({ qr_task_id: req.params.id }).lean();
  res.json(subTasks.map(t => ({ ...t, id: t._id })));
});

app.post("/api/admin/qr-tasks/:id/sub-tasks", upload.single('image'), async (req, res) => {
  const { title, description, is_required } = req.body;
  let image_path = null;
  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    image_path = `data:${req.file.mimetype};base64,${b64}`;
  }
  try {
    const subTask = await SubTask.create({ qr_task_id: req.params.id, title, description, image_path, is_required: is_required === 'true' ? 1 : 0 });
    res.json({ success: true, id: subTask.id });
  } catch (e) {
    res.status(500).json({ error: "Failed to create sub-task" });
  }
});

app.patch("/api/admin/sub-tasks/:id", upload.single('image'), async (req, res) => {
  const { title, description, is_required } = req.body;
  let image_path = null;
  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    image_path = `data:${req.file.mimetype};base64,${b64}`;
  }
  try {
    const updateData: any = { title, description, is_required: is_required === 'true' ? 1 : 0 };
    if (image_path) updateData.image_path = image_path;
    await SubTask.findByIdAndUpdate(req.params.id, updateData);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update sub-task" });
  }
});

app.delete("/api/admin/sub-tasks/:id", async (req, res) => {
  try {
    await SubTask.findByIdAndDelete(req.params.id);
    await TeamSubTaskProgress.deleteMany({ sub_task_id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete sub-task" });
  }
});

app.get("/api/admin/submissions", async (req, res) => {
  const submissions = await Submission.find().sort({ _id: -1 }).lean();
  const teams = await Team.find().lean();
  const tasks = await Task.find().lean();

  const teamMap = new Map(); teams.forEach(t => teamMap.set(t.id, t.name));
  const taskMap = new Map(); tasks.forEach(t => taskMap.set(t._id.toString(), t.name));

  res.json(submissions.map(s => ({
    ...s,
    id: s._id,
    team_name: teamMap.get(s.team_id),
    task_name: taskMap.get(s.qr_task_id.toString())
  })));
});

app.post("/api/admin/submissions/:id/review", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found" });

    submission.status = req.body.status;
    await submission.save();

    const progressStatus = req.body.status === 'approved' ? 'completed' : 'started';
    await Progress.findOneAndUpdate(
      { team_id: submission.team_id, qr_task_id: submission.qr_task_id },
      { status: progressStatus, updated_at: new Date().toISOString() }
    );

    const task = await Task.findById(submission.qr_task_id);

    broadcast({
      type: "SUBMISSION_REVIEWED",
      team_id: submission.team_id,
      status: req.body.status,
      task_id: submission.qr_task_id,
      hint: task?.next_clue_hint,
      passcode: task?.unlock_passcode,
      task_name: task?.name
    });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.delete("/api/admin/submissions/:id", async (req, res) => {
  try {
    const submission = await Submission.findByIdAndDelete(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete submission" }); }
});

app.post("/api/admin/logs/reset", async (req, res) => {
  await Log.deleteMany({});
  broadcast({ type: "LOG_RESET" });
  res.json({ success: true });
});

app.post("/api/admin/game/reset", async (req, res) => {
  try {
    // Keep teams and tasks, but clear everything else
    await Progress.deleteMany({});

    // Re-initialize progress tracking for all teams to active tasks
    const tasks = await Task.find({ is_active: 1 }).lean();
    const teams = await Team.find().lean();
    if (tasks.length > 0 && teams.length > 0) {
      const progressDocs = [];
      for (const team of teams) {
        for (const task of tasks) {
          progressDocs.push({ team_id: team.id, qr_task_id: task._id, status: 'pending' });
        }
      }
      await Progress.insertMany(progressDocs);
    }

    await Submission.deleteMany({});
    await Log.deleteMany({});
    await TeamSubTaskProgress.deleteMany({});

    // Update game status to setup mode
    await Setting.findOneAndUpdate(
      { key: 'game_status' },
      { value: 'setup' },
      { upsert: true }
    );
    await Setting.findOneAndUpdate(
      { key: 'game_start_time' },
      { value: '' },
      { upsert: true }
    );

    broadcast({ type: "LOG_RESET" });
    broadcast({ type: "SETTINGS_UPDATE" });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset game" });
  }
});

app.get("/api/admin/leaderboard", async (req, res) => {
  const tasks = await Task.find().lean();
  const teams = await Team.find().lean();
  const teamMap = new Map(); teams.forEach(t => teamMap.set(t.id, t.name));

  const leaderboard = [];
  for (const task of tasks) {
    const topScans = await Log.find({ type: 'scan', qr_task_id: task._id }).sort({ timestamp: 1 }).limit(3).lean();
    const topCompletes = await Log.find({ type: 'complete', qr_task_id: task._id }).sort({ timestamp: 1 }).limit(3).lean();

    leaderboard.push({
      taskId: task._id,
      taskName: task.name,
      topScans: topScans.map(s => ({ ...s, team_name: teamMap.get(s.team_id) })),
      topCompletes: topCompletes.map(c => ({ ...c, team_name: teamMap.get(c.team_id) }))
    });
  }
  res.json(leaderboard);
});


/* --- TEAM API --- */
app.post("/api/team/login", async (req, res) => {
  const team = await Team.findOne({ id: req.body.teamId, password: req.body.password });
  if (team) {
    const timestamp = new Date().toISOString();
    await Log.create({ team_id: team.id, type: "login", timestamp });
    broadcast({ type: "LOG_UPDATE", log: { team_id: team.id, team_name: team.name, type: "login", timestamp } });
    res.json({ success: true, team });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/team/:teamId/progress", async (req, res) => {
  const progress = await Progress.find({ team_id: req.params.teamId }).lean();
  const tasks = await Task.find().lean();
  const taskMap = new Map(); tasks.forEach(t => taskMap.set(t._id.toString(), { slug: t.slug, name: t.name }));

  res.json(progress.map(p => {
    const t = taskMap.get(p.qr_task_id.toString());
    return { ...p, qr_task_id: p.qr_task_id, slug: t?.slug, name: t?.name };
  }));
});

app.get("/api/team/:teamId/tasks/:taskId/sub-tasks", async (req, res) => {
  const { teamId, taskId } = req.params;
  const subTasks = await SubTask.find({ qr_task_id: taskId }).lean();

  const progresses = await TeamSubTaskProgress.find({ team_id: teamId }).lean();
  const progressMap = new Map(); progresses.forEach(p => progressMap.set(p.sub_task_id.toString(), p.is_completed));

  res.json(subTasks.map(s => ({
    ...s,
    id: s._id,
    is_completed: progressMap.get(s._id.toString()) || 0
  })));
});

app.post("/api/team/sub-tasks/:id/toggle", async (req, res) => {
  const { teamId, is_completed } = req.body;
  try {
    await TeamSubTaskProgress.findOneAndUpdate(
      { team_id: teamId, sub_task_id: req.params.id },
      { is_completed: is_completed ? 1 : 0, updated_at: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to toggle sub-task" });
  }
});

app.post("/api/team/validate-qr", async (req, res) => {
  const { teamId, slug } = req.body;
  const task = await Task.findOne({ slug }).lean();

  if (!task) return res.status(404).json({ error: "Invalid QR sequence" });
  if (task.is_active === 0) return res.status(400).json({ error: "This task is inactive." });

  const allActiveTasks = await Task.find({ is_active: 1 }).sort({ sequence_order: 1 }).lean();

  // Special case: Final Vault
  if (slug === 'final-passcode-check') {
    const otherTasks = allActiveTasks.filter(t => t.slug !== 'final-passcode-check');
    for (const ot of otherTasks) {
      const p = await Progress.findOne({ team_id: teamId, qr_task_id: ot._id });
      if (!p || p.status !== 'completed') {
        return res.status(403).json({ error: `You cannot access the Final Vault until you complete all other active tasks (Missing: ${ot.name}).` });
      }
    }
  } else {
    // Normal sequential check
    const taskIndex = allActiveTasks.findIndex(t => t._id.toString() === task._id.toString());
    if (taskIndex > 0) {
      const previousTask = allActiveTasks[taskIndex - 1];
      // Only enforce sequence if the previous task is not the final vault itself (just in case)
      if (previousTask.slug !== 'final-passcode-check') {
        const prevProgress = await Progress.findOne({ team_id: teamId, qr_task_id: previousTask._id });
        if (!prevProgress || prevProgress.status !== 'completed') {
          return res.status(403).json({ error: `You must complete ${previousTask.name} before scanning this QR code.` });
        }
      }
    }
  }

  res.json({ success: true, task: { ...task, id: task._id } });
});

app.post("/api/team/scan", async (req, res) => {
  const { teamId, qrTaskId } = req.body;
  const timestamp = new Date().toISOString();
  await Progress.findOneAndUpdate(
    { team_id: teamId, qr_task_id: qrTaskId, status: 'pending' },
    { status: 'started', updated_at: timestamp }
  );
  await Log.create({ team_id: teamId, type: "scan", qr_task_id: qrTaskId, timestamp });
  const team = await Team.findOne({ id: teamId });
  const task = await Task.findById(qrTaskId);
  broadcast({
    type: "LOG_UPDATE",
    log: { team_id: teamId, team_name: team?.name, type: "scan", qr_task_id: qrTaskId, timestamp }
  });
  broadcast({ type: "GLOBAL_EVENT", eventType: "scan", teamName: team?.name, taskName: task?.name, timestamp });
  res.json({ success: true });
});

app.post("/api/team/submit", upload.single("image"), async (req, res) => {
  const { teamId, qrTaskId, taskData } = req.body;
  const timestamp = new Date().toISOString();
  let imagePath = null;
  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    imagePath = `data:${req.file.mimetype};base64,${b64}`;
  }

  const task = await Task.findById(qrTaskId);
  const isCheckpoint = task && task.is_checkpoint === 1;
  const newStatus = (isCheckpoint || task?.image_required !== 0 || imagePath) ? 'pending_approval' : 'completed';

  await Submission.create({ team_id: teamId, qr_task_id: qrTaskId, image_path: imagePath, task_data: taskData, status: newStatus, timestamp });
  await Progress.findOneAndUpdate({ team_id: teamId, qr_task_id: qrTaskId }, { status: newStatus, updated_at: timestamp });
  await Log.create({ team_id: teamId, type: "complete", qr_task_id: qrTaskId, timestamp });

  const team = await Team.findOne({ id: teamId });
  broadcast({
    type: "LOG_UPDATE",
    log: { team_id: teamId, team_name: team?.name, type: "complete", qr_task_id: qrTaskId, timestamp }
  });
  if (newStatus === 'completed') {
    broadcast({ type: "GLOBAL_EVENT", eventType: "complete", teamName: team?.name, taskName: task?.name, timestamp });
  }

  // Check winner condition
  const tasksAll = await Task.find({ is_active: 1 }).distinct('_id');
  const pendingCount = await Progress.countDocuments({
    team_id: teamId,
    status: { $nin: ['completed', 'pending_approval'] },
    qr_task_id: { $in: tasksAll }
  });

  if (pendingCount === 0) {
    broadcast({ type: "TEAM_FINISHED", teamName: team?.name, isWinner: false });
  }

  res.json({ success: true, status: newStatus });
});

app.post("/api/team/verify-passcode", async (req, res) => {
  const { teamId, passcode } = req.body;
  const setting = await Setting.findOne({ key: 'secret_passcode' });
  if (setting && setting.value && setting.value.toUpperCase() === passcode.toUpperCase()) {
    // Correct passcode
    res.json({ success: true });
  } else {
    res.json({ success: false, error: "Incorrect passcode." });
  }
});

// Port Config
if (!process.env.VERCEL) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
