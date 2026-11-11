import { EXPERT_QUESTION_IDS, type ExpertNotes } from '@mat-lab/publishing';
import type { CheckedSuggestion } from './recipeReader.ts';
import type { QaIssue, QaReport } from '@mat-lab/video/qa';
import {
  CATEGORIES,
  checkScript,
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

/** 서버가 기록하는 자동 검사 결과. code 'skipped' = 검사나 처리를 하지 못함 (검사했다고 적지 않고 경고로 남긴다) */
export type RenderQaIssue = Omit<QaIssue, 'code'> & { code: QaIssue['code'] | 'skipped' };
export type RenderQa = Omit<QaReport, 'issues'> & { issues: RenderQaIssue[] };

export interface RenderRow {
  id: number;
  projectId: number;
  scriptVersion: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  stage: string;
  progress: number;
  outputDir: string;
  error: string;
  createdAt: string;
  finishedAt: string | null;
  /** 자동 품질 검사 결과 (예전 영상은 없음) */
  qa: RenderQa | null;
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

export interface ProjectPhoto {
  /** data 폴더 기준 상대 경로 (예: photos/3.jpg) */
  file: string;
  url: string;
  color: string;
}

/** 장면별로 올린 생성 AI 클립·이미지 (장면 id → 파일) */
export type SceneMedia = Record<string, { file: string; url: string; kind: 'video' | 'image' }>;

export interface Publication {
  id: number;
  projectId: number;
  renderId: number | null;
  scriptVersion: number;
  platform: 'instagram' | 'naver' | 'youtube';
  status: 'scheduled' | 'published';
  url: string;
  scheduledAt: string;
  publishedAt: string;
  style: string;
  hookType: string;
  metrics: Record<string, number>;
  note: string;
  createdAt: string;
}

function toPublication(r: Row): Publication {
  return {
    id: Number(r.id),
    projectId: Number(r.project_id),
    renderId: r.render_id === null || r.render_id === undefined ? null : Number(r.render_id),
    scriptVersion: Number(r.script_version),
    platform: String(r.platform) as Publication['platform'],
    status: String(r.status) as Publication['status'],
    url: String(r.url),
    scheduledAt: String(r.scheduled_at),
    publishedAt: String(r.published_at),
    style: String(r.style),
    hookType: String(r.hook_type),
    metrics: JSON.parse(String(r.metrics_json || '{}')) as Record<string, number>,
    note: String(r.note),
    createdAt: String(r.created_at),
  };
}

/** 레시피를 사진·파일에서 읽었을 때의 기록 */
export interface RecipeSource {
  /** 저장한 원본 파일 (DATA_DIR 기준 경로) */
  files: { name: string; type: string; file: string; url: string }[];
  /** AI가 제안해서 채운 칸 (연구자 확인 필요) */
  aiFields: string[];
  /** 읽기 어려웠던 부분·다른 메모 */
  problems: string[];
  /** AI가 낸 주제·원리 후보 (근거 확인 결과 포함). 첫 번째가 레시피에 들어간 것 */
  suggestions: CheckedSuggestion[];
  /** 영상 주제를 고른 기록 (사진에서 읽은 레시피는 주제를 고르기 전에 후보 영상을 만들지 않는다) */
  topicChosenBy?: string;
  topicChosenAt?: string;
  /** 연구자가 AI 제안 칸을 확인한 기록 (확인 전에는 승인할 수 없다) */
  aiConfirmedBy?: string;
  aiConfirmedAt?: string;
}

export interface ProjectDetail extends ProjectSummary {
  recipe: RecipeInput;
  source: RecipeSource | null;
  photo: ProjectPhoto | null;
  sceneMedia: SceneMedia;
  versionState: VersionState;
  latest: ScriptVersion | null;
  versions: Omit<ScriptVersion, 'script'>[];
  reviews: Review[];
  renders: RenderRow[];
  events: { type: string; message: string; createdAt: string }[];
  approval: Review | null;
  blogStyle: string;
  publications: Publication[];
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
    qa: parseQa(r.qa_json),
  };
}

function parseQa(v: unknown): RenderQa | null {
  if (!v) return null;
  try {
    return JSON.parse(String(v)) as RenderQa;
  } catch {
    return null;
  }
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
  constructor(readonly db: Db) {}

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

  /**
   * 원본 레시피를 고치면, 대본이 있을 때(승인 여부와 상관없이) 새 대본 버전을 만든다.
   * 그래야 옛 레시피로 그린 재료·순서 카드가 든 영상이 승인·내보내기·게시되지 않는다.
   */
  updateRecipe(id: number, input: unknown) {
    const before = this.getRecipe(id);
    const recipe = RecipeInputSchema.parse(input);
    this.db.prepare('UPDATE projects SET recipe_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(recipe), now(), id);
    const latest = this.latestScript(id);
    if (latest && JSON.stringify(before) !== JSON.stringify(recipe)) {
      this.addScriptVersion(id, latest.script, 'edit', '원본 레시피 수정으로 재검수 필요');
    }
    this.logEvent(id, 'recipe', '원본 레시피 수정');
  }

  getPhoto(id: number): ProjectPhoto | null {
    const row = this.db.prepare('SELECT photo_file, photo_color, updated_at FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row || !row.photo_file) return null;
    const file = String(row.photo_file);
    return { file, url: `/media/${file}?v=${encodeURIComponent(String(row.updated_at))}`, color: String(row.photo_color) };
  }

  setPhoto(id: number, file: string, color: string) {
    this.getRecipe(id);
    this.db.prepare('UPDATE projects SET photo_file = ?, photo_color = ?, updated_at = ? WHERE id = ?').run(file, color, now(), id);
    this.logEvent(id, 'photo', file ? '완성 사진 등록' : '완성 사진 삭제');
  }

  /** 블로그용 연구자 답변. 답이 바뀌면 '본인 확인'은 풀린다. */
  getExpertNotes(id: number): ExpertNotes {
    const row = this.db.prepare('SELECT expert_notes FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    try {
      const v = JSON.parse(String(row.expert_notes || '{}')) as ExpertNotes;
      return { answers: v.answers ?? {}, ...(v.confirmedBy ? { confirmedBy: v.confirmedBy, confirmedAt: v.confirmedAt } : {}) };
    } catch {
      return { answers: {} };
    }
  }

  setExpertNotes(id: number, input: { answers?: unknown; confirmBy?: unknown }): ExpertNotes {
    const prev = this.getExpertNotes(id);
    const answers: ExpertNotes['answers'] = {};
    const raw = (input.answers && typeof input.answers === 'object' ? input.answers : {}) as Record<string, unknown>;
    for (const key of EXPERT_QUESTION_IDS) {
      const v = raw[key];
      if (typeof v === 'string' && v.trim()) {
        if (v.length > 4000) throw new HttpError(400, '답변은 4000자 이내로 적어 주세요.');
        answers[key] = v.trim();
      }
    }
    const changed = JSON.stringify(answers) !== JSON.stringify(prev.answers);
    const by = typeof input.confirmBy === 'string' ? input.confirmBy.trim() : '';
    const next: ExpertNotes = { answers };
    if (by) Object.assign(next, { confirmedBy: by, confirmedAt: now() });
    else if (!changed && prev.confirmedBy) Object.assign(next, { confirmedBy: prev.confirmedBy, confirmedAt: prev.confirmedAt });
    this.db.prepare('UPDATE projects SET expert_notes = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), now(), id);
    this.logEvent(id, 'notes', by ? `연구자 답변 확인 (${by})` : changed ? '연구자 답변 수정' : '연구자 답변 저장');
    return next;
  }

  getSource(id: number): RecipeSource | null {
    const row = this.db.prepare('SELECT source_json FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    const src = JSON.parse(String(row.source_json || '{}')) as Partial<RecipeSource>;
    if (!src.files?.length && !src.aiFields?.length && !src.suggestions?.length) return null;
    return {
      files: (src.files ?? []).map((f) => ({ ...f, url: `/media/${f.file}` })),
      aiFields: src.aiFields ?? [],
      problems: src.problems ?? [],
      suggestions: src.suggestions ?? [],
      ...(src.topicChosenAt ? { topicChosenBy: src.topicChosenBy ?? '', topicChosenAt: src.topicChosenAt } : {}),
      ...(src.aiConfirmedAt ? { aiConfirmedBy: src.aiConfirmedBy ?? '', aiConfirmedAt: src.aiConfirmedAt } : {}),
    };
  }

  /** AI 주제 후보를 더한다 (새 후보가 앞으로, 최대 20개) */
  addSuggestions(id: number, list: CheckedSuggestion[], note: string): RecipeSource {
    const row = this.db.prepare('SELECT source_json FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    const src = JSON.parse(String(row.source_json || '{}')) as Record<string, unknown> & { suggestions?: CheckedSuggestion[] };
    src.suggestions = [...list, ...(src.suggestions ?? [])].slice(0, 20);
    src.files ??= [];
    src.aiFields ??= [];
    src.problems ??= [];
    this.db.prepare('UPDATE projects SET source_json = ? WHERE id = ?').run(JSON.stringify(src), id);
    this.logEvent(id, 'recipe', note);
    return this.getSource(id)!;
  }

  /** 사진에서 읽은 레시피인데 아직 영상 주제를 고르지 않았는지 (이미 대본이 있으면 고른 것으로 본다) */
  needsTopic(id: number): boolean {
    const src = this.getSource(id);
    return Boolean(src?.suggestions.length && !src.topicChosenAt && this.versionState(id).latestScriptVersion === null);
  }

  /**
   * 영상 주제를 고른다: AI 후보 중 하나, 또는 직접 쓴 주제·원리.
   * 직접 쓴 칸은 더 이상 'AI 제안'이 아니므로 확인 대상에서 뺀다. 재료·분량·순서는 건드리지 않는다.
   */
  chooseTopic(id: number, input: { topic: string; principle: string; category?: string }, by: string): RecipeSource {
    const topic = input.topic.trim();
    const principle = input.principle.trim();
    if (topic.length < 4) throw new HttpError(400, '주제를 한 문장으로 적어 주세요.');
    if (principle.length < 5) throw new HttpError(400, '핵심 원리를 한 문장으로 적어 주세요.');
    const recipe = this.getRecipe(id);
    const category = (CATEGORIES as readonly string[]).includes(String(input.category)) ? (input.category as RecipeInput['category']) : recipe.category;
    this.updateRecipe(id, { ...recipe, topic, principle, category });
    const row = this.db.prepare('SELECT source_json FROM projects WHERE id = ?').get(id) as Row;
    const src = JSON.parse(String(row.source_json || '{}')) as Record<string, unknown> & { aiFields?: string[]; suggestions?: { topic: string; principle: string }[] };
    const fromAi = (src.suggestions ?? []).find((s) => s.topic === topic && s.principle === principle);
    if (!fromAi) src.aiFields = (src.aiFields ?? []).filter((f) => f !== 'topic' && f !== 'principle' && f !== 'category');
    src.topicChosenBy = by;
    src.topicChosenAt = now();
    this.db.prepare('UPDATE projects SET source_json = ? WHERE id = ?').run(JSON.stringify(src), id);
    this.logEvent(id, 'recipe', `영상 주제 선택 (${by}): ${topic}${fromAi ? ' — AI 후보' : ' — 직접 씀'}`);
    return this.getSource(id)!;
  }

  /** AI가 제안한 칸(주제·핵심 원리·흔한 실수)을 연구자가 확인했다고 기록한다 */
  confirmAiFields(id: number, by: string): RecipeSource {
    const row = this.db.prepare('SELECT source_json FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    const src = JSON.parse(String(row.source_json || '{}')) as Record<string, unknown>;
    src.aiConfirmedBy = by;
    src.aiConfirmedAt = now();
    this.db.prepare('UPDATE projects SET source_json = ? WHERE id = ?').run(JSON.stringify(src), id);
    this.logEvent(id, 'recipe', `AI 제안 내용 확인 (${by})`);
    return this.getSource(id)!;
  }

  setSource(id: number, src: Omit<RecipeSource, 'files'> & { files: { name: string; type: string; file: string }[] }) {
    this.getRecipe(id);
    this.db.prepare('UPDATE projects SET source_json = ? WHERE id = ?').run(JSON.stringify(src), id);
  }

  /** 블로그 윤문 (원문 문단 → 다듬은 문단) */
  getPolish(id: number): Record<string, string> {
    const row = this.db.prepare('SELECT polish_json FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    try {
      const v = JSON.parse(String(row.polish_json || '{}')) as unknown;
      if (!v || typeof v !== 'object') return {};
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
    } catch {
      return {};
    }
  }

  setPolish(id: number, map: Record<string, string>, note: string) {
    this.getRecipe(id);
    this.db.prepare('UPDATE projects SET polish_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(map), now(), id);
    this.logEvent(id, 'blog', note);
  }

  getBlogStyle(id: number): string {
    const row = this.db.prepare('SELECT blog_style FROM projects WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없습니다.');
    return String(row.blog_style ?? '');
  }

  setBlogStyle(id: number, style: string) {
    this.getRecipe(id);
    this.db.prepare('UPDATE projects SET blog_style = ?, updated_at = ? WHERE id = ?').run(style, now(), id);
    this.logEvent(id, 'blog', `블로그 문체 선택: ${style || '기본 자동 원고'}`);
  }

  listPublications(id: number): Publication[] {
    return (this.db.prepare('SELECT * FROM publications WHERE project_id = ? ORDER BY id DESC').all(id) as Row[]).map(toPublication);
  }

  allPublications(): Publication[] {
    return (this.db.prepare('SELECT * FROM publications ORDER BY id DESC').all() as Row[]).map(toPublication);
  }

  addPublication(id: number, p: Omit<Publication, 'id' | 'projectId' | 'createdAt' | 'metrics'>): Publication {
    const res = this.db
      .prepare('INSERT INTO publications (project_id, render_id, script_version, platform, status, url, scheduled_at, published_at, style, hook_type, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, p.renderId, p.scriptVersion, p.platform, p.status, p.url, p.scheduledAt, p.publishedAt, p.style, p.hookType, p.note, now());
    this.logEvent(id, 'publish', `${p.platform} ${p.status === 'published' ? '게시 기록' : '예약 기록'}${p.url ? ` (${p.url})` : ''}`);
    return this.listPublications(id).find((x) => x.id === Number(res.lastInsertRowid))!;
  }

  setPublicationMetrics(pubId: number, metrics: Record<string, number>): Publication {
    const row = this.db.prepare('SELECT * FROM publications WHERE id = ?').get(pubId) as Row | undefined;
    if (!row) throw new HttpError(404, '게시 기록을 찾을 수 없습니다.');
    this.db.prepare('UPDATE publications SET metrics_json = ? WHERE id = ?').run(JSON.stringify(metrics), pubId);
    this.logEvent(Number(row.project_id), 'metrics', `성과 입력 (${String(row.platform)})`);
    return toPublication(this.db.prepare('SELECT * FROM publications WHERE id = ?').get(pubId) as Row);
  }

  getSceneMedia(id: number): SceneMedia {
    const rows = this.db.prepare('SELECT scene_id, file, kind, created_at FROM scene_media WHERE project_id = ?').all(id) as Row[];
    const out: SceneMedia = {};
    for (const r of rows) {
      out[String(r.scene_id)] = { file: String(r.file), kind: r.kind as 'video' | 'image', url: `/media/${String(r.file)}?v=${encodeURIComponent(String(r.created_at))}` };
    }
    return out;
  }

  setSceneMedia(id: number, sceneId: string, file: string, kind: 'video' | 'image') {
    this.getRecipe(id);
    this.db
      .prepare('INSERT INTO scene_media (project_id, scene_id, file, kind, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, scene_id) DO UPDATE SET file = excluded.file, kind = excluded.kind, created_at = excluded.created_at')
      .run(id, sceneId, file, kind, now());
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), id);
    this.logEvent(id, 'media', `장면 ${sceneId}에 ${kind === 'video' ? 'AI 클립' : '이미지'} 등록`);
  }

  deleteSceneMedia(id: number, sceneId: string): string | null {
    const row = this.db.prepare('SELECT file FROM scene_media WHERE project_id = ? AND scene_id = ?').get(id, sceneId) as Row | undefined;
    this.db.prepare('DELETE FROM scene_media WHERE project_id = ? AND scene_id = ?').run(id, sceneId);
    if (row) this.logEvent(id, 'media', `장면 ${sceneId}의 AI 클립 삭제`);
    return row ? String(row.file) : null;
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
      // 원본 레시피와 다른 분량·재료·순서가 있으면 승인하지 않는다 (확인창으로 넘기지 않음)
      const errors = checkScript(this.getRecipe(id), latest.script).filter((i) => i.level === 'error');
      if (errors.length) throw new HttpError(409, `원본 레시피와 다른 곳 ${errors.length}건을 고쳐야 승인할 수 있어요: ${errors[0]!.message}`);
      // 사진에서 읽을 때 AI가 채운 칸은 연구자가 확인해야 한다 (영상에서 "이희재 연구자의 조리 노트"로 나오므로)
      const src = this.getSource(id);
      if (src?.aiFields.length && !src.aiConfirmedAt) {
        throw new HttpError(409, 'AI가 제안한 내용(주제·핵심 원리·흔한 실수)을 먼저 확인해 주세요. 영상에서 연구자의 조리 노트로 소개돼요.');
      }
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

  setRenderQa(renderId: number, qa: RenderQa) {
    this.db.prepare('UPDATE renders SET qa_json = ? WHERE id = ?').run(JSON.stringify(qa), renderId);
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
    return { ...base, recipe: this.getRecipe(id), source: this.getSource(id), photo: this.getPhoto(id), sceneMedia: this.getSceneMedia(id), versionState, latest, versions, reviews, renders, events, approval, blogStyle: this.getBlogStyle(id), publications: this.listPublications(id) };
  }
}
