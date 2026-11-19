import { HttpError } from './repo.ts';

/**
 * 댓글 단어 규칙: 정한 단어가 댓글에 있으면, 사람이 미리 써 둔 답글(공개)과 DM(비공개 답장)을 보낸다.
 * 답글·DM 문구는 사람이 쓴 것만 쓴다 (AI가 쓰지 않는다 — 연구자 경험·사실을 지어내지 않게, 원칙 4).
 * 순수 함수만 둔다 (화면·서버·시험이 같이 쓴다).
 */
export interface CommentRule {
  id: string;
  /** 쉼표로 나눈 단어들. 하나라도 댓글에 있으면 맞음 */
  keywords: string[];
  /** 댓글 아래 공개 답글 */
  reply: string;
  /** 비공개 답장(DM) 문구. 비우면 DM은 보내지 않는다 */
  dmText: string;
  /** DM 끝에 붙일 링크 (https만) */
  dmLink: string;
  enabled: boolean;
}

export const MAX_RULES = 20;
export const MAX_REPLY = 300;
export const MAX_DM = 900;

/**
 * 비교용으로 다듬기: 한글 자모 합치기(NFKC), 영어 대소문자 무시, 띄어쓰기·문장부호·이모지·# 무시.
 * '레시피 주세요!!' · '레 시 피' · '#레시피' · 'RECIPE'/'recipe' 가 같은 단어로 맞는다.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** 댓글에 맞는 첫 규칙 (켜진 규칙만, 위에서부터). 맞은 단어도 돌려준다 */
export function matchRule(rules: CommentRule[], comment: string): { rule: CommentRule; keyword: string } | null {
  const text = normalizeForMatch(comment);
  if (!text) return null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const k of rule.keywords) {
      const key = normalizeForMatch(k);
      if (key && text.includes(key)) return { rule, keyword: k };
    }
  }
  return null;
}

/** DM에 실제로 보낼 글 (문구 + 링크). DM 문구가 없으면 빈 글 */
export function dmMessage(rule: CommentRule): string {
  if (!rule.dmText.trim()) return '';
  return rule.dmLink ? `${rule.dmText.trim()}\n${rule.dmLink}` : rule.dmText.trim();
}

const rid = () => Math.random().toString(36).slice(2, 10);

/** 화면에서 받은 규칙을 검사·정리한다. 잘못되면 쉬운 말로 거절한다 */
export function cleanRules(input: unknown): CommentRule[] {
  if (!Array.isArray(input)) throw new HttpError(400, '규칙 목록이 올바르지 않아요.');
  if (input.length > MAX_RULES) throw new HttpError(400, `규칙은 ${MAX_RULES}개까지 만들 수 있어요.`);
  const seen = new Set<string>();
  const ids = new Set<string>();
  return input.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const keywords = (Array.isArray(r.keywords) ? r.keywords.map(String) : String(r.keywords ?? '').split(','))
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (!keywords.length) throw new HttpError(400, `규칙 ${n}: 댓글에서 찾을 단어를 적어 주세요.`);
    for (const k of keywords) {
      const key = normalizeForMatch(k);
      if (!key) throw new HttpError(400, `규칙 ${n}: '${k}'에는 글자가 없어요. 글자나 숫자로 된 단어를 적어 주세요.`);
      if (key.length > 30) throw new HttpError(400, `규칙 ${n}: 단어는 30자까지예요.`);
      if (seen.has(key)) throw new HttpError(400, `규칙 ${n}: '${k}'는 다른 규칙에도 있어요. 한 단어는 한 규칙에만 넣어 주세요.`);
      seen.add(key);
    }
    const reply = String(r.reply ?? '').trim();
    if (!reply) throw new HttpError(400, `규칙 ${n}: 댓글에 달 답글을 적어 주세요.`);
    if (reply.length > MAX_REPLY) throw new HttpError(400, `규칙 ${n}: 답글은 ${MAX_REPLY}자까지예요.`);
    const dmText = String(r.dmText ?? '').trim();
    if (dmText.length > MAX_DM) throw new HttpError(400, `규칙 ${n}: DM 문구는 ${MAX_DM}자까지예요.`);
    const dmLink = String(r.dmLink ?? '').trim();
    if (dmLink) {
      if (!dmText) throw new HttpError(400, `규칙 ${n}: 링크를 보내려면 DM 문구도 적어 주세요.`);
      let ok = false;
      try {
        ok = new URL(dmLink).protocol === 'https:';
      } catch {
        ok = false;
      }
      if (!ok) throw new HttpError(400, `규칙 ${n}: 링크는 https:// 로 시작하는 주소만 넣을 수 있어요.`);
    }
    let id = typeof r.id === 'string' && /^[\w-]{1,20}$/.test(r.id) ? r.id : rid();
    while (ids.has(id)) id = rid();
    ids.add(id);
    return { id, keywords, reply, dmText, dmLink, enabled: r.enabled !== false };
  });
}
