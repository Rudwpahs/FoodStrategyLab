import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS script_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  script_json TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(project_id, version)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_version INTEGER NOT NULL,
  reviewer TEXT NOT NULL,
  checklist_json TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS renders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  stage TEXT NOT NULL DEFAULT '',
  progress REAL NOT NULL DEFAULT 0,
  output_dir TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS scene_media (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  file TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'image')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, scene_id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // 이전 버전 DB에 없는 열 추가
  const cols = new Set((db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('photo_file')) db.exec("ALTER TABLE projects ADD COLUMN photo_file TEXT NOT NULL DEFAULT ''");
  if (!cols.has('photo_color')) db.exec("ALTER TABLE projects ADD COLUMN photo_color TEXT NOT NULL DEFAULT ''");
  if (!cols.has('expert_notes')) db.exec("ALTER TABLE projects ADD COLUMN expert_notes TEXT NOT NULL DEFAULT '{}'");
  return db;
}
