import { IG_MAX_CAPTION, IG_MAX_HASHTAGS } from './candidates.ts';
import { findHealthClaims } from './wordLists.ts';

/**
 * 인스타그램에 올리기 전 점검 (설명 글). 화면에서 글을 고칠 때마다 바로 다시 검사한다.
 * 근거: docs/research/content-strategy/instagram-cases.md
 * - 2,200자 (API 한도), 해시태그 5개 이하 (2025-12 공지 보도. API 문서는 아직 30개라 30개 넘으면 막고, 5개 넘으면 경고)
 * - AI 캐릭터·AI 음성 표시 (Meta: 실제처럼 들리는 AI 음성은 표시 대상. 사례: 바이오에만 작게 적었다가 역풍)
 * - 건강·효능 표현은 추천에서 빠질 수 있다 (Meta 추천 가이드라인)
 */
export interface IgCheck {
  level: 'ok' | 'warn' | 'error';
  text: string;
}

export function instagramCaptionChecks(caption: string): IgCheck[] {
  const out: IgCheck[] = [];
  const len = caption.length;
  out.push(!caption.trim() ? { level: 'error', text: '설명 글이 비어 있어요.' } : len > IG_MAX_CAPTION ? { level: 'error', text: `설명 글이 ${len}자예요. 2,200자까지만 올릴 수 있어요.` } : { level: 'ok', text: `설명 글 ${len}자 (2,200자 이하)` });
  const tags = caption.match(/#[^\s#]+/g) ?? [];
  out.push(
    tags.length > 30
      ? { level: 'error', text: `해시태그 ${tags.length}개 — 30개를 넘으면 올라가지 않아요.` }
      : tags.length > IG_MAX_HASHTAGS
        ? { level: 'warn', text: `해시태그 ${tags.length}개 — 지금 인스타그램은 5개까지만 권해요. 검색어는 본문에 쓰는 편이 나아요.` }
        : { level: 'ok', text: `해시태그 ${tags.length}개 (5개 이하)` },
  );
  out.push(/AI/.test(caption) ? { level: 'ok', text: 'AI 캐릭터·AI 음성 표시가 있어요' } : { level: 'warn', text: 'AI 캐릭터·AI 음성이라는 표시가 없어요. 설명 글에 남겨 두는 편이 안전해요.' });
  // 재료 목록 블록이 있어야 한다 ("전체 재료와 만드는 법은 블로그에" 같은 문장의 '재료'는 목록이 아니다)
  out.push(/^\[재료\]\s*$/m.test(caption) ? { level: 'ok', text: '재료가 설명 글에 있어요 (저장·검색에 도움)' } : { level: 'warn', text: '설명 글에 재료가 없어요. 실제 요리 계정들은 재료·분량을 본문에 적어요.' });
  const health = findHealthClaims(caption);
  out.push(health.length ? { level: 'warn', text: `건강·효능 표현(${health.join(', ')})은 추천에서 빠질 수 있어요.` } : { level: 'ok', text: '건강·효능 표현 없음' });
  if (/댓글[^\n]{0,15}(?:DM|디엠)/.test(caption)) out.push({ level: 'warn', text: '"댓글 달면 DM으로" 방식은 거부감이 크다는 반응이 많아요. 레시피는 본문에 그대로 두는 편을 권해요.' });
  return out;
}
