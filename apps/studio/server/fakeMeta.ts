import express from 'express';

/**
 * 시험 전용 가짜 Meta 서버 (instagram.com · api.instagram.com · graph.instagram.com 역할).
 * 자동 게시·댓글 답장 시험(autoPilot.test.ts)과 E2E 시험 서버(e2e/server.ts)가 쓴다. 운영 코드에서는 쓰지 않는다.
 * 실제 Meta 서버에는 아무것도 보내지 않는다.
 */
export const FAKE_LONG_TOKEN = 'FAKE-LONG-LIVED-TOKEN-777';
export const FAKE_IG_ID = '1789';

export interface FakeMetaState {
  /** 로그인할 때 허용했다고 할 권한 */
  grant: string[];
  published: number;
  /** 지금까지 게시된 미디어 id */
  publishedIds: string[];
  lastCaption: string;
  fetchedVideo: number;
  /** 24시간 게시 한도 응답 (quotaFail이면 오류를 돌려준다) */
  quota: { usage: number; total: number };
  quotaFail: boolean;
  /** 처리 상태 순서 (비면 FINISHED) */
  containerStatus: string[];
  /** 최근 게시물과 댓글 */
  media: { id: string; timestamp: string; permalink: string; comments_count?: number }[];
  comments: Record<string, { id: string; text: string; timestamp: string; username: string; from?: { id: string; username: string } }[]>;
  replies: { commentId: string; message: string }[];
  dms: { commentId: string; text: string }[];
  /** true면 DM을 거절한다 (권한 없음 흉내) */
  rejectDm: boolean;
  /** 모든 요청 경로 (Meta를 불렀는지 확인용) */
  calls: string[];
}

export function newFakeMetaState(): FakeMetaState {
  return {
    grant: ['instagram_business_basic', 'instagram_business_content_publish'],
    published: 0,
    publishedIds: [],
    lastCaption: '',
    fetchedVideo: 0,
    quota: { usage: 0, total: 50 },
    quotaFail: false,
    containerStatus: [],
    media: [],
    comments: {},
    replies: [],
    dms: [],
    rejectDm: false,
    calls: [],
  };
}

export function fakeMetaRouter(state: FakeMetaState, version = 'v26.0'): express.Router {
  const m = express.Router();
  m.use(express.urlencoded({ extended: false }));
  m.use(express.json());
  m.use((req, _res, next) => {
    state.calls.push(`${req.method} ${req.path}`);
    next();
  });
  // 로그인 창: 바로 '허용'한 것처럼 돌아간다 (E2E 브라우저 흐름용)
  m.get('/oauth/authorize', (req, res) => {
    const q = req.query as Record<string, string>;
    state.grant = ['instagram_business_basic', 'instagram_business_content_publish', ...String(q.scope ?? '').split(',').filter((s) => s.startsWith('instagram_business_manage'))];
    res.redirect(`${q.redirect_uri}?${new URLSearchParams({ code: 'GOOD-CODE', state: String(q.state ?? '') })}`);
  });
  m.post('/oauth/access_token', (req, res) => {
    if (req.body.code !== 'GOOD-CODE') return res.status(400).json({ error_type: 'OAuthException', code: 400, error_message: 'Matching code was not found or was already used' });
    res.json({ data: [{ access_token: 'FAKE-SHORT', user_id: FAKE_IG_ID, permissions: state.grant.join(',') }] });
  });
  m.get('/access_token', (req, res) => {
    if (req.query.access_token !== 'FAKE-SHORT') return res.status(400).json({ error: { message: 'bad exchange' } });
    res.json({ access_token: FAKE_LONG_TOKEN, token_type: 'bearer', expires_in: 5183944 });
  });
  const authed = (req: express.Request, res: express.Response) => {
    if (req.headers.authorization !== `Bearer ${FAKE_LONG_TOKEN}`) {
      res.status(401).json({ error: { message: 'Invalid OAuth access token', code: 190 } });
      return false;
    }
    return true;
  };
  m.get(`/${version}/me`, (_req, res) => res.json({ user_id: FAKE_IG_ID, username: 'matlab_lab' }));
  m.get(`/${version}/${FAKE_IG_ID}/content_publishing_limit`, (req, res) => {
    if (!authed(req, res)) return;
    if (state.quotaFail) return res.status(500).json({ error: { message: 'temporarily unavailable' } });
    res.json({ data: [{ quota_usage: state.quota.usage, config: { quota_total: state.quota.total, quota_duration: 86400 } }] });
  });
  m.post(`/${version}/${FAKE_IG_ID}/media`, async (req, res) => {
    if (!authed(req, res)) return;
    if (req.body.media_type !== 'REELS') return res.status(400).json({ error: { message: 'need REELS' } });
    state.lastCaption = req.body.caption;
    const v = await fetch(req.body.video_url).catch(() => null);
    if (v?.ok) state.fetchedVideo++;
    res.json({ id: `C-${state.published + 1}` });
  });
  m.get(`/${version}/${FAKE_IG_ID}/media`, (req, res) => {
    if (!authed(req, res)) return;
    res.json({ data: state.media });
  });
  m.post(`/${version}/${FAKE_IG_ID}/media_publish`, (req, res) => {
    if (!authed(req, res)) return;
    state.published++;
    state.quota.usage++;
    const id = `M-${state.published}`;
    state.publishedIds.push(id);
    res.json({ id });
  });
  m.post(`/${version}/${FAKE_IG_ID}/messages`, (req, res) => {
    if (!authed(req, res)) return;
    if (state.rejectDm) return res.status(403).json({ error: { message: '(#10) Application does not have permission for this action', code: 10 } });
    state.dms.push({ commentId: String(req.body.recipient?.comment_id ?? ''), text: String(req.body.message?.text ?? '') });
    res.json({ recipient_id: 'IGSID-1', message_id: `mid.${state.dms.length}` });
  });
  m.get(`/${version}/:id/comments`, (req, res) => {
    if (!authed(req, res)) return;
    res.json({ data: state.comments[req.params.id] ?? [] });
  });
  m.post(`/${version}/:id/replies`, (req, res) => {
    if (!authed(req, res)) return;
    state.replies.push({ commentId: req.params.id, message: String(req.body.message ?? '') });
    res.json({ id: `R-${state.replies.length}` });
  });
  m.get(`/${version}/:id`, (req, res) => {
    if (!authed(req, res)) return;
    const id = req.params.id;
    if (id.startsWith('M-')) return res.json({ permalink: `https://www.instagram.com/reel/AUTO${id.slice(2)}/` });
    res.json({ status_code: state.containerStatus.shift() ?? 'FINISHED' });
  });
  return m;
}
