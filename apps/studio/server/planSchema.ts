/**
 * 주간 계획 칸 (plan_slots). 화면 #/plan과 자동 게시가 함께 읽는다.
 *
 * - id          칸 번호
 * - project_id  콘텐츠 (콘텐츠를 지우면 칸도 지워진다)
 * - at          올릴 시각. 한국 시간 고정 형식 'YYYY-MM-DDTHH:MM:00+09:00' (문자열 정렬 = 시간 순서)
 * - status      planned(준비 중) | waiting(영상 완성, 승인 대기) | approved(승인됨) |
 *               change-requested(수정 요청 반영 중) | posted(올림) | skipped(건너뜀)
 *               posted·skipped는 사람이나 자동 게시가 정하고, 나머지는 콘텐츠 상태로 다시 계산한다
 *               (PlanStore.sync: 계획 화면을 열 때·검수·수정 요청 때). 영상 완성만으로는 바로 바뀌지 않으니
 *               읽기 전에 sync()를 부르거나 직접 확인한다.
 * - note        메모 (자동 게시 결과 등)
 * - created_at, updated_at  ISO(UTC)
 *
 * 칸 상태는 안내용이다: 올리기 직전에는 반드시 승인된 최신 대본 버전의 영상인지 다시 확인한다 (원칙 2, pipeline.ts approvedRender).
 */
export const PLAN_SLOTS_SQL = `
CREATE TABLE IF NOT EXISTS plan_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'waiting', 'approved', 'change-requested', 'posted', 'skipped')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plan_slots_at ON plan_slots(at);
CREATE INDEX IF NOT EXISTS plan_slots_project ON plan_slots(project_id);
`;
