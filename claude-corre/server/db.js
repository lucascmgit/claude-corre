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
