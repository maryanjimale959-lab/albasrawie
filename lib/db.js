import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });

const g = globalThis;
if (!g.__albasrawieDb) {
  const open = () => {
    // Concurrent build workers can hit SQLITE_BUSY while creating the schema; retry briefly.
    let lastErr;
    for (let i = 0; i < 30; i++) {
      try {
        const db = new Database(path.join(dir, "albasrawie.db"));
        db.pragma("busy_timeout = 5000");
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        g.__albasrawieDb = db;
        return db;
      } catch (e) {
        lastErr = e;
        const wait = 200 + Math.floor(Math.random() * 300);
        const end = Date.now() + wait;
        while (Date.now() < end) { /* spin */ }
      }
    }
    throw lastErr;
  };
  const db = open();
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
    avatar_url TEXT,
    time_zone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '',
    bio TEXT,
    portfolio_public INTEGER NOT NULL DEFAULT 0,
    UNIQUE (organization, student_id)
  );
  CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    organization TEXT,
    department TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    organization TEXT,
    class_name TEXT,
    level TEXT,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','listed')),
    course_code TEXT UNIQUE,
    enrollment_open INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS course_codes (
    code TEXT PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
    enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_id, course_id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS learning_activities (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    related_id INTEGER,
    activity_date TEXT NOT NULL,
    verification TEXT NOT NULL DEFAULT 'verified' CHECK (verification IN ('verified','teacher_confirmed','self_reported')),
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_id, type, related_id)
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    due_at TEXT,
    max_marks INTEGER NOT NULL DEFAULT 100,
    allowed_types TEXT NOT NULL DEFAULT 'text,link,file',
    rubric TEXT,
    attachment_path TEXT,
    attachment_name TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assignment_submissions (
    id INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    link TEXT,
    file_path TEXT,
    file_name TEXT,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','late','graded','revision')),
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    score INTEGER,
    grade_released INTEGER NOT NULL DEFAULT 0,
    feedback TEXT,
    UNIQUE (assignment_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    objectives TEXT,
    instructions TEXT,
    start_date TEXT,
    deadline TEXT,
    max_marks INTEGER NOT NULL DEFAULT 100,
    project_type TEXT NOT NULL DEFAULT 'individual' CHECK (project_type IN ('individual','group')),
    rubric TEXT,
    reference_links TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS project_progress (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone_id INTEGER NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
    done_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, student_id, milestone_id)
  );
  CREATE TABLE IF NOT EXISTS project_submissions (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    demo_url TEXT,
    repo_url TEXT,
    screenshot_path TEXT,
    screenshot_name TEXT,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','revision','completed')),
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    score INTEGER,
    grade_released INTEGER NOT NULL DEFAULT 0,
    feedback TEXT,
    UNIQUE (project_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS personal_projects (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    technologies TEXT,
    demo_url TEXT,
    repo_url TEXT,
    image_path TEXT,
    image_name TEXT,
    completed_on TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_date TEXT NOT NULL,
    code TEXT NOT NULL,
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closes_at TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_by INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present','late','absent','excused')),
    method TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','code','qr')),
    marked_at TEXT NOT NULL DEFAULT (datetime('now')),
    marked_by INTEGER REFERENCES users(id),
    note TEXT,
    UNIQUE (session_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    url TEXT,
    file_path TEXT,
    file_name TEXT,
    module TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS course_settings (
    course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    weight_assignments INTEGER NOT NULL DEFAULT 40,
    weight_projects INTEGER NOT NULL DEFAULT 40,
    weight_quizzes INTEGER NOT NULL DEFAULT 20
  );
  CREATE TABLE IF NOT EXISTS study_logs (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    minutes INTEGER NOT NULL DEFAULT 0,
    log_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id);
  CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
  CREATE INDEX IF NOT EXISTS idx_activity_student ON learning_activities(student_id, activity_date);
  CREATE INDEX IF NOT EXISTS idx_assign_course ON assignments(course_id);
  CREATE INDEX IF NOT EXISTS idx_assignsub_student ON assignment_submissions(student_id);
  CREATE INDEX IF NOT EXISTS idx_assignsub_assign ON assignment_submissions(assignment_id);
  CREATE INDEX IF NOT EXISTS idx_projects_course ON projects(course_id);
  CREATE INDEX IF NOT EXISTS idx_projsub_student ON project_submissions(student_id);
  CREATE INDEX IF NOT EXISTS idx_attend_course ON attendance_sessions(course_id);
  CREATE INDEX IF NOT EXISTS idx_attendrec_student ON attendance_records(student_id);
  CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
  CREATE INDEX IF NOT EXISTS idx_announce_course ON announcements(course_id);
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT,
    size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_personalproj_student ON personal_projects(student_id);
  `);
  g.__albasrawieDb = db;
}
export const db = g.__albasrawieDb;

export function audit(userId, action, target, details) {
  db.prepare("INSERT INTO audit_logs (user_id, action, target, details) VALUES (?,?,?,?)").run(
    userId ?? null, action, target ?? null, details ? JSON.stringify(details) : null
  );
}
