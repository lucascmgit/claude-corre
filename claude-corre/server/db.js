import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'claude-corre.db')

// Ensure data directory exists (required in fresh containers)
mkdirSync(dirname(DB_PATH), { recursive: true })

let db

export function initDb() {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_logs (
      user_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      anthropic_api_key TEXT,
      garmin_oauth1_token TEXT,
      garmin_oauth2_token TEXT,
      garmin_oauth2_saved_at INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      user_id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- v2: Structured data tables ──────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS athlete_profiles (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      age INTEGER,
      weight_kg REAL,
      height_cm REAL,
      location TEXT,
      max_hr INTEGER,
      resting_hr INTEGER,
      previous_peak TEXT,
      injuries TEXT,
      weekly_availability TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      race_distance TEXT,
      target_time TEXT,
      target_date TEXT,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS training_zones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      hr_low INTEGER,
      hr_high INTEGER,
      pace_low TEXT,
      pace_high TEXT,
      description TEXT,
      calibrated_at INTEGER NOT NULL,
      source TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS training_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      goal_id TEXT,
      name TEXT,
      total_weeks INTEGER,
      start_date TEXT,
      status TEXT DEFAULT 'active',
      plan_json TEXT NOT NULL,
      rationale TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );

    CREATE TABLE IF NOT EXISTS plan_phases (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      phase_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      duration_weeks INTEGER,
      objective TEXT,
      entry_criteria TEXT,
      exit_criteria TEXT,
      weekly_template TEXT,
      status TEXT DEFAULT 'pending',
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prescribed_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT,
      phase_id TEXT,
      prescribed_date TEXT,
      session_type TEXT,
      description TEXT,
      target_distance_m INTEGER,
      target_duration_s INTEGER,
      target_hr_low INTEGER,
      target_hr_high INTEGER,
      target_pace_low TEXT,
      target_pace_high TEXT,
      workout_json TEXT,
      rationale TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES training_plans(id),
      FOREIGN KEY (phase_id) REFERENCES plan_phases(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prescribed_session_id TEXT,
      activity_date TEXT NOT NULL,
      activity_type TEXT,
      source TEXT,
      garmin_activity_id TEXT,
      distance_m REAL,
      duration_s REAL,
      avg_hr INTEGER,
      max_hr INTEGER,
      avg_pace TEXT,
      avg_cadence INTEGER,
      elevation_gain_m REAL,
      splits_json TEXT,
      raw_csv TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (prescribed_session_id) REFERENCES prescribed_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS workout_evaluations (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      standalone_analysis TEXT,
      prescription_comparison TEXT,
      adherence_score REAL,
      performance_rating TEXT,
      medium_term_trends TEXT,
      goal_progress TEXT,
      coach_notes TEXT,
      plan_adjustments TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      total_distance_m REAL,
      total_duration_s REAL,
      run_count INTEGER,
      avg_hr INTEGER,
      z2_percentage REAL,
      acute_load REAL,
      chronic_load REAL,
      acwr REAL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS availability_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      report_date TEXT NOT NULL,
      report_type TEXT,
      description TEXT,
      severity TEXT,
      affected_duration TEXT,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  // Migrate: add garmin_oauth2_saved_at column if it doesn't exist yet
  const cols = db.pragma('table_info(user_settings)').map(c => c.name)
  if (!cols.includes('garmin_oauth2_saved_at')) {
    db.exec('ALTER TABLE user_settings ADD COLUMN garmin_oauth2_saved_at INTEGER')
  }

  console.log(`Database ready: ${DB_PATH}`)
  return db
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}
