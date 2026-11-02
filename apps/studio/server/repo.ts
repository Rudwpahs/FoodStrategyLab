import {
  ChecklistSchema,
  RecipeInputSchema,
  ScriptSchema,
  canApprove,
  deriveStatus,
  type Checklist,
  type ProjectStatus,
  type RecipeInput,
  type Script,
  type ScriptSource,
  type VersionState,
} from '@mat-lab/recipe-core';
import type { Db } from './db.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const now = () => new Date().toISOString();

export interface ScriptVersion {
  version: number;
  script: Script;
  source: ScriptSource;
  note: string;
  createdAt: string;
}

export interface Review {
  id: number;
  scriptVersion: number;
  reviewer: string;
  checklist: Checklist;
  decision: 'approved' | 'changes_requested';
  note: string;
  createdAt: string;
}

export interface RenderRow {
  id: number;
  projectId: number;
  scriptVersion: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  stage: string;
  progress: number;
  outputDir: string;
  error: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface ProjectSummary {
  id: number;
  topic: string;
  dishName: string;
  category: RecipeInput['category'];
  format: RecipeInput['format'];
  status: ProjectStatus;
  latestVersion: number | null;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  recipe: RecipeInput;
  versionState: VersionState;
  latest: ScriptVersion | null;
  versions: Omit<ScriptVersion, 'script'>[];
  reviews: Review[];
  renders: RenderRow[];
  events: { type: string; message: string; createdAt: string }[];
  approval: Review | null;
}

type Row = Record<string, unknown>;

function toRender(r: Row): RenderRow {
  return {
    id: Number(r.id),
    projectId: Number(r.project_id),
    scriptVersion: Number(r.script_version),
    status: r.status as RenderRow['status'],
    stage: String(r.stage),
    progress: Number(r.progress),
    outputDir: String(r.output_dir),
    error: String(r.error),
    createdAt: String(r.created_at),
    finishedAt: (r.finished_at as string | null) ?? null,
  };
}

function toReview(r: Row): Review {
  return {
    id: Number(r.id),
    scriptVersion: Number(r.script_version),
    reviewer: String(r.reviewer),
    checklist: JSON.parse(String(r.checklist_json)),
    decision: r.decision as Review['decision'],
    note: String(r.note),
    createdAt: String(r.created_at),
  };
}

export class Repo {
  constructor(private db: Db) {}

  logEvent(projectId: number, type: string, message: string) {
    this.db.prepare('INSERT INTO events (project_id, type, message, created_at) VALUES (?, ?, ?, ?)').run(projectId, type, message, now());
  }

  createProject(input: unknown): number {
    const recipe = RecipeInputSchema.parse(input);
    const t = now();
    const res = this.db.prepare('INSERT INTO projects (recipe_json, created_at, updated_at) VALUES (?, ?, ?)').run(JSON.stringify(recipe), t, t);
    const id = Number(res.lastInsertRowid);
    this.logEvent(id, 'create', `콘텐츠 생성: ${recipe.topic}`);
    return id;
  }

  getRecipe(id: number): RecipeInput {
    const row = this.db.prepare('SELECT recipe_json FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    return RecipeInputSchema.parse(JSON.parse(String(row.recipe_json)));
  }

  /** 원본 레시피를 고치면, 승인된 대본이 있더라도 재검수를 받도록 새 버전을 만든다. */
  updateRecipe(id: number, input: unknown) {
    this.getRecipe(id);
    const recipe = RecipeInputSchema.parse(input);
    this.db.prepare('UPDATE projects SET recipe_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(recipe), now(), id);
    const state = this.versionState(id);
    if (state.latestScriptVersion !== null && state.approvedScriptVersion === state.latestScriptVersion) {
      const latest = this.latestScript(id)!;
      this.addScriptVersion(id, latest.script, 'edit', '원본 레시피 수정으로 재검수 필요');
    }
    this.logEvent(id, 'recipe', '원본 레시피 수정');
  }

  deleteProject(id: number) {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  addScriptVersion(id: number, input: unknown, source: ScriptSource, note = ''): number {
    this.getRecipe(id);
    const script = ScriptSchema.parse(input);
    const row = this.db.prepare('SELECT MAX(version) AS v FROM script_versions WHERE project_id = ?').get(id) as Row;
    const version = Number(row.v ?? 0) + 1;
    this.db
      .prepare('INSERT INTO script_versions (project_id, version, script_json, source, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, version, JSON.stringify(script), source, note, now());
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), id);
    const label = { template: '템플릿 생성', 'ai-paste': 'AI 대본 붙여넣기', edit: '대본 수정' }[source];
    this.logEvent(id, 'script', `대본 v${version} 저장 (${label})${note ? ` — ${note}` : ''}`);
    return version;
  }

  getScript(id: number, version: number): ScriptVersion {
    const r = this.db.prepare('SELECT * FROM script_versions WHERE project_id = ? AND version = ?').get(id, version) as Row | undefined;
    if (!r) throw new HttpError(404, `대본 v${version}이 없습니다.`);
    return { version, script: JSON.parse(String(r.script_json)), source: r.source as ScriptSource, note: String(r.note), createdAt: String(r.created_at) };
  }

  latestScript(id: number): ScriptVersion | null {
    const r = this.db.prepare('SELECT version FROM script_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(id) as Row | undefined;
    return r ? this.getScript(id, Number(r.version)) : null;
  }

  /** 대본 버전에 대한 마지막 검수 결과 */
  lastReview(id: number, version: number): Review | null {
    const r = this.db.prepare('SELECT * FROM reviews WHERE project_id = ? AND script_version = ? ORDER BY id DESC LIMIT 1').get(id, version) as Row | undefined;
    return r ? toReview(r) : null;
  }

  versionState(id: number): VersionState {
    const latest = this.latestScript(id);
    if (!latest) return { latestScriptVersion: null, approvedScriptVersion: null, renderedScriptVersion: null };
    const review = this.lastReview(id, latest.version);
    const rendered = this.db
      .prepare("SELECT 1 FROM renders WHERE project_id = ? AND script_version = ? AND status = 'done' LIMIT 1")
      .get(id, latest.version);
    return {
      latestScriptVersion: latest.version,
      approvedScriptVersion: review?.decision === 'approved' ? latest.version : null,
      renderedScriptVersion: rendered ? latest.version : null,
    };
  }

  addReview(id: number, input: { version: number; reviewer: string; checklist: unknown; decision: string; note?: string }): Review {
    const latest = this.latestScript(id);
    if (!latest) throw new HttpError(400, '검수할 대본이 없습니다.');
    if (input.version !== latest.version) throw new HttpError(409, `최신 대본(v${latest.version})만 검수할 수 있습니다.`);
    const checklist = ChecklistSchema.parse(input.checklist);
    const decision = input.decision === 'approved' ? 'approved' : 'changes_requested';
    if (decision === 'approved') {
      const gate = canApprove(checklist, input.reviewer);
      if (!gate.ok) throw new HttpError(400, gate.reason);
    } else if (!input.reviewer.trim()) {
      throw new HttpError(400, '검수자 이름을 입력하세요.');
    }
    this.db
      .prepare('INSERT INTO reviews (project_id, script_version, reviewer, checklist_json, decision, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, latest.version, input.reviewer.trim(), JSON.stringify(checklist), decision, input.note ?? '', now());
    this.logEvent(id, 'review', `대본 v${latest.version} ${decision === 'approved' ? '승인' : '수정 요청'} (${input.reviewer.trim()})${input.note ? ` — ${input.note}` : ''}`);
    return this.lastReview(id, latest.version)!;
  }

  createRender(id: number, version: number): number {
    const res = this.db
      .prepare("INSERT INTO renders (project_id, script_version, status, created_at) VALUES (?, ?, 'queued', ?)")
      .run(id, version, now());
    return Number(res.lastInsertRowid);
  }

  updateRender(renderId: number, patch: Partial<Pick<RenderRow, 'status' | 'stage' | 'progress' | 'outputDir' | 'error'>> & { finished?: boolean }) {
    const cur = this.getRender(renderId);
    const next = { ...cur, ...patch };
    this.db
      .prepare('UPDATE renders SET status = ?, stage = ?, progress = ?, output_dir = ?, error = ?, finished_at = ? WHERE id = ?')
      .run(next.status, next.stage, next.progress, next.outputDir, next.error, patch.finished ? now() : cur.finishedAt, renderId);
  }

  getRender(renderId: number): RenderRow {
    const r = this.db.prepare('SELECT * FROM renders WHERE id = ?').get(renderId) as Row | undefined;
    if (!r) throw new HttpError(404, '렌더 작업을 찾을 수 없습니다.');
    return toRender(r);
  }

  /** 서버가 꺼지며 중단된 작업은 실패로 표시한다 (복구용). */
  failInterruptedRenders(): number {
    const res = this.db
      .prepare("UPDATE renders SET status = 'failed', error = '서버가 다시 시작되어 중단되었습니다. 다시 제작하세요.', finished_at = ? WHERE status IN ('queued', 'running')")
      .run(now());
    return Number(res.changes);
  }

  summary(id: number): ProjectSummary {
    const recipe = this.getRecipe(id);
    const row = this.db.prepare('SELECT updated_at FROM projects WHERE id = ?').get(id) as Row;
    const state = this.versionState(id);
    return {
      id,
      topic: recipe.topic,
      dishName: recipe.dishName,
      category: recipe.category,
      format: recipe.format,
      status: deriveStatus(state),
      latestVersion: state.latestScriptVersion,
      updatedAt: String(row.updated_at),
    };
  }

  listProjects(): ProjectSummary[] {
    const rows = this.db.prepare('SELECT id FROM projects ORDER BY updated_at DESC').all() as Row[];
    return rows.map((r) => this.summary(Number(r.id)));
  }

  getProject(id: number): ProjectDetail {
    const base = this.summary(id);
    const versionState = this.versionState(id);
    const latest = this.latestScript(id);
    const versions = (this.db.prepare('SELECT version, source, note, created_at FROM script_versions WHERE project_id = ? ORDER BY version DESC').all(id) as Row[]).map((r) => ({
      version: Number(r.version),
      source: r.source as ScriptSource,
      note: String(r.note),
      createdAt: String(r.created_at),
    }));
    const reviews = (this.db.prepare('SELECT * FROM reviews WHERE project_id = ? ORDER BY id DESC').all(id) as Row[]).map(toReview);
    const renders = (this.db.prepare('SELECT * FROM renders WHERE project_id = ? ORDER BY id DESC').all(id) as Row[]).map(toRender);
    const events = (this.db.prepare('SELECT type, message, created_at FROM events WHERE project_id = ? ORDER BY id DESC LIMIT 50').all(id) as Row[]).map((r) => ({
      type: String(r.type),
      message: String(r.message),
      createdAt: String(r.created_at),
    }));
    const approval = versionState.approvedScriptVersion !== null ? this.lastReview(id, versionState.approvedScriptVersion) : null;
    return { ...base, recipe: this.getRecipe(id), versionState, latest, versions, reviews, renders, events, approval };
  }
}
