/* MySQL / MariaDB schema for Albasrawie.
 *
 * Translated 1:1 from the SQLite schema this project shipped with, so every
 * column, default, CHECK and UNIQUE constraint behaves the same way:
 *
 *  - `INTEGER PRIMARY KEY` (SQLite rowid)  ->  `INT AUTO_INCREMENT PRIMARY KEY`
 *  - `TEXT DEFAULT (datetime('now'))`      ->  `DATETIME DEFAULT CURRENT_TIMESTAMP`
 *  - 0/1 flags                             ->  `TINYINT(1)`
 *  - date-only stamps kept as VARCHAR(20), because the app compares and writes
 *    them as "YYYY-MM-DD" strings and must not have them silently re-typed.
 *  - session/course-code `expires_at` kept as VARCHAR(40): the app writes a full
 *    ISO string there ("2026-10-28T18:04:56.789Z") and reads it straight back
 *    into `new Date(...)`, exactly as the old TEXT column allowed. A DATETIME
 *    column would reject it under STRICT_TRANS_TABLES.
 *
 * Collation is utf8mb4_general_ci: case-insensitive, which is what the old
 * `email ... UNIQUE COLLATE NOCASE` gave us, and index-key lengths are kept
 * under 767 bytes so the schema also installs on an older shared MySQL.
 *
 * Statements run in order because InnoDB enforces foreign keys at creation.
 */

const ENGINE = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci";

export const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('student','teacher','admin')),
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
    avatar_url VARCHAR(255),
    time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL,
    class_name VARCHAR(120) NOT NULL,
    organization VARCHAR(120) NOT NULL DEFAULT '',
    bio TEXT,
    portfolio_public TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_student_org (organization, student_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id INT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    organization VARCHAR(190),
    department VARCHAR(190)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at VARCHAR(40) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sessions_user (user_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS courses (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL REFERENCES users(id),
    name VARCHAR(190) NOT NULL,
    description TEXT,
    category VARCHAR(80),
    organization VARCHAR(190),
    class_name VARCHAR(120),
    level VARCHAR(60),
    visibility VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','listed')),
    course_code VARCHAR(24) UNIQUE,
    enrollment_open TINYINT(1) NOT NULL DEFAULT 1,
    archived TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_courses_teacher (teacher_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS course_codes (
    code VARCHAR(24) NOT NULL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at VARCHAR(40),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_codes_course (course_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS enrollments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_enrollment (student_id, course_id),
    KEY idx_enroll_course (course_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    message TEXT NOT NULL,
    link VARCHAR(500),
    \`read\` TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_user (user_id, \`read\`)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS learning_activities (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE SET NULL,
    type VARCHAR(40) NOT NULL,
    related_id INT,
    activity_date VARCHAR(20) NOT NULL,
    verification VARCHAR(24) NOT NULL DEFAULT 'verified' CHECK (verification IN ('verified','teacher_confirmed','self_reported')),
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_activity (student_id, type, related_id),
    KEY idx_activity_student (student_id, activity_date)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(60) NOT NULL,
    target VARCHAR(190),
    details TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_user (user_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS assignments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(190) NOT NULL,
    description TEXT,
    instructions TEXT,
    due_at DATETIME,
    max_marks INT NOT NULL DEFAULT 100,
    allowed_types VARCHAR(120) NOT NULL DEFAULT 'text,link,file',
    rubric TEXT,
    attachment_path VARCHAR(255),
    attachment_name VARCHAR(255),
    published TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_assign_course (course_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS assignment_submissions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    link VARCHAR(1000),
    file_path VARCHAR(255),
    file_name VARCHAR(255),
    status VARCHAR(16) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','late','graded','revision')),
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score INT,
    grade_released TINYINT(1) NOT NULL DEFAULT 0,
    feedback TEXT,
    UNIQUE KEY uq_assign_sub (assignment_id, student_id),
    KEY idx_assignsub_student (student_id),
    KEY idx_assignsub_assign (assignment_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS projects (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(190) NOT NULL,
    description TEXT,
    objectives TEXT,
    instructions TEXT,
    start_date VARCHAR(20),
    deadline DATETIME,
    max_marks INT NOT NULL DEFAULT 100,
    project_type VARCHAR(16) NOT NULL DEFAULT 'individual' CHECK (project_type IN ('individual','group')),
    rubric TEXT,
    reference_links TEXT,
    attachment_path VARCHAR(255),
    attachment_name VARCHAR(255),
    published TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_projects_course (course_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS project_milestones (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(190) NOT NULL,
    position INT NOT NULL DEFAULT 1,
    KEY idx_milestone_project (project_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS project_progress (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone_id INT NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
    done_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_progress (project_id, student_id, milestone_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS project_submissions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    demo_url VARCHAR(1000),
    repo_url VARCHAR(1000),
    screenshot_path VARCHAR(255),
    screenshot_name VARCHAR(255),
    status VARCHAR(16) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','revision','completed')),
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score INT,
    grade_released TINYINT(1) NOT NULL DEFAULT 0,
    feedback TEXT,
    UNIQUE KEY uq_project_sub (project_id, student_id),
    KEY idx_projsub_student (student_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS personal_projects (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(190) NOT NULL,
    description TEXT,
    technologies TEXT,
    demo_url VARCHAR(1000),
    repo_url VARCHAR(1000),
    image_path VARCHAR(255),
    image_name VARCHAR(255),
    completed_on VARCHAR(20),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_personalproj_student (student_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_date VARCHAR(20) NOT NULL,
    code VARCHAR(16) NOT NULL,
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closes_at DATETIME,
    status VARCHAR(8) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_by INT NOT NULL REFERENCES users(id),
    KEY idx_attend_course (course_id),
    KEY idx_attend_status (course_id, status)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS attendance_records (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL CHECK (status IN ('present','late','absent','excused')),
    method VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','code','qr')),
    marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    marked_by INT REFERENCES users(id),
    note VARCHAR(500),
    UNIQUE KEY uq_attend_rec (session_id, student_id),
    KEY idx_attendrec_student (student_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS materials (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id INT NOT NULL REFERENCES users(id),
    title VARCHAR(190) NOT NULL,
    description TEXT,
    url VARCHAR(1000),
    file_path VARCHAR(255),
    file_name VARCHAR(255),
    module VARCHAR(80),
    published TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_materials_course (course_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS announcements (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id INT NOT NULL REFERENCES users(id),
    title VARCHAR(190) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_announce_course (course_id)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS course_settings (
    course_id INT NOT NULL PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    weight_assignments INT NOT NULL DEFAULT 40,
    weight_projects INT NOT NULL DEFAULT 40,
    weight_quizzes INT NOT NULL DEFAULT 20
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS study_logs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE SET NULL,
    title VARCHAR(190) NOT NULL,
    minutes INT NOT NULL DEFAULT 0,
    log_date VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_study_student (student_id, log_date)
  ) ${ENGINE}`,

  `CREATE TABLE IF NOT EXISTS files (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_id INT REFERENCES users(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    kind VARCHAR(24) NOT NULL,
    stored_name VARCHAR(190) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime VARCHAR(120),
    size INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${ENGINE}`,
];

/* MySQL has no `CREATE INDEX IF NOT EXISTS`. Indexes that belong to a table are
   declared inline above; this list is only for statements that must run after
   the tables exist and is kept idempotent by ignoring error 1061 (duplicate key
   name) in lib/db.js. */
export const POST_STATEMENTS = [];
