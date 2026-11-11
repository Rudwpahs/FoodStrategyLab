import { describe, expect, it } from 'vitest';
import { ApiError, NOT_JSON_MESSAGE, isDuplicateError, readResponse } from './api.ts';

const res = (status: number, body: string, type = 'application/json') => new Response(body, { status, headers: { 'content-type': type } });

describe('readResponse', () => {
  it('정상 JSON은 그대로 돌려준다', async () => {
    expect(await readResponse(res(200, '{"a":1}'), '/x')).toEqual({ a: 1 });
    expect(await readResponse(res(200, ''), '/x')).toBeNull();
  });

  it('서버가 준 한국어 오류 문장과 상태 코드를 그대로 전한다 (409 = 중복 확인용)', async () => {
    const err = await readResponse(res(409, '{"error":"이미 게시됐어요"}'), '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('이미 게시됐어요');
    expect((err as ApiError).status).toBe(409);
  });

  it('JSON이 아닌 응답(클라우드가 깨어나는 중의 HTML 등)은 영어 대신 쉬운 말로 알린다', async () => {
    const err = await readResponse(res(502, '<html>Bad Gateway</html>', 'text/html'), '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain(NOT_JSON_MESSAGE);
    expect((err as ApiError).message).not.toMatch(/Unexpected token|SyntaxError/);
    expect((err as ApiError).status).toBe(502);
  });
});

describe('isDuplicateError', () => {
  it('이미 게시한 경우의 409만 중복으로 본다 (승인 전·영상 없음 같은 다른 409는 아님)', () => {
    expect(isDuplicateError(new ApiError('이 콘텐츠는 이미 naver에 게시됐어요 (https://…). 다시 기록하려면 확인이 필요해요.', 409))).toBe(true);
    expect(isDuplicateError(new ApiError('이 콘텐츠는 이미 인스타그램에 올렸어요 (주소 없음). 다시 올리려면 확인이 필요해요.', 409))).toBe(true);
    expect(isDuplicateError(new ApiError('아무 말', 409, 'duplicate'))).toBe(true);
    expect(isDuplicateError(new ApiError('이희재 연구자의 승인을 받은 최신 콘텐츠만 게시할 수 있어요.', 409))).toBe(false);
    expect(isDuplicateError(new ApiError('게시물 주소를 확인해 주세요.', 400))).toBe(false);
    expect(isDuplicateError(new Error('다시 기록하려면 확인이 필요해요'))).toBe(false);
  });
});
