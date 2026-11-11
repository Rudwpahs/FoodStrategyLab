import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RENDERS_TABLE = `CREATE TABLE IF NOT EXISTS renders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  stage TEXT NOT NULL DEFAULT '',
  progress REAL NOT NULL DEFAULT 0,
  output_dir TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);`;

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
${RENDERS_TABLE}
CREATE TABLE IF NOT EXISTS scene_media (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  file TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'image')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, scene_id)
);
CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  render_id INTEGER,
  script_version INTEGER NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT '',
  hook_type TEXT NOT NULL DEFAULT '',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Claude API 사용 기록 (달마다 금액 한도를 지키기 위해)
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  month TEXT NOT NULL,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL
);

-- 인스타그램 연결 (계정 하나). 토큰은 암호화해서만 저장한다.
CREATE TABLE IF NOT EXISTS instagram_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ig_user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  token_sealed TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  connected_at TEXT NOT NULL
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
  // 예전 DB: 제작 상태에 '취소됨(canceled)'이 없으면 표를 새 규칙으로 다시 만든다 (기존 기록은 그대로 옮김)
  const rendersSql = String((db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'renders'").get() as { sql?: string } | undefined)?.sql ?? '');
  if (rendersSql && !rendersSql.includes("'canceled'")) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`BEGIN;
      ALTER TABLE renders RENAME TO renders_old;
      ${RENDERS_TABLE}
      INSERT INTO renders (id, project_id, script_version, status, stage, progress, output_dir, error, created_at, finished_at)
        SELECT id, project_id, script_version, status, stage, progress, output_dir, error, created_at, finished_at FROM renders_old;
      DROP TABLE renders_old;
      COMMIT;`);
    db.exec('PRAGMA foreign_keys = ON;');
  }
  // 이전 버전 DB에 없는 열 추가
  const cols = new Set((db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('photo_file')) db.exec("ALTER TABLE projects ADD COLUMN photo_file TEXT NOT NULL DEFAULT ''");
  if (!cols.has('photo_color')) db.exec("ALTER TABLE projects ADD COLUMN photo_color TEXT NOT NULL DEFAULT ''");
  if (!cols.has('expert_notes')) db.exec("ALTER TABLE projects ADD COLUMN expert_notes TEXT NOT NULL DEFAULT '{}'");
  if (!cols.has('blog_style')) db.exec("ALTER TABLE projects ADD COLUMN blog_style TEXT NOT NULL DEFAULT ''");
  // 레시피를 사진·파일에서 읽었을 때: 원본 파일 목록, AI가 제안한 칸, 읽기 어려웠던 부분
  if (!cols.has('source_json')) db.exec("ALTER TABLE projects ADD COLUMN source_json TEXT NOT NULL DEFAULT '{}'");
  // 블로그 원고 윤문(im-not-ai): 원문 문단 → 다듬은 문단. 원문이 바뀌면 자연히 적용되지 않는다
  // 완성 영상 자동 품질 검사 결과 (대사 잘림·무음·검은 화면·받아쓰기 대조)
  const renderCols = new Set((db.prepare('PRAGMA table_info(renders)').all() as { name: string }[]).map((c) => c.name));
  if (!renderCols.has('qa_json')) db.exec("ALTER TABLE renders ADD COLUMN qa_json TEXT NOT NULL DEFAULT ''");
  if (!cols.has('polish_json')) db.exec("ALTER TABLE projects ADD COLUMN polish_json TEXT NOT NULL DEFAULT '{}'");
  // 계정 역할: 연구자(researcher) 계정이 하나라도 있으면 승인은 연구자 계정만 할 수 있다
  const userCols = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name));
  if (!userCols.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  return db;
}
