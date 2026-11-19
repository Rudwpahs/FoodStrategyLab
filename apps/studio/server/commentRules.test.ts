import { describe, expect, it } from 'vitest';
import { cleanRules, dmMessage, matchRule, normalizeForMatch, type CommentRule } from './commentRules.ts';

const rule = (keywords: string[], extra: Partial<CommentRule> = {}): CommentRule => ({ id: keywords[0]!, keywords, reply: `${keywords[0]} 답글`, dmText: '', dmLink: '', enabled: true, ...extra });

describe('댓글 단어 맞추기 (한글 친화)', () => {
  it('띄어쓰기·대소문자·문장부호·해시태그·이모지를 무시한다', () => {
    expect(normalizeForMatch(' 레 시 피 주세요!! 🙏 #RECIPE ')).toBe('레시피주세요recipe');
    const rules = [rule(['레시피']), rule(['Recipe'])];
    expect(matchRule(rules, '레시피 알려주세요')?.keyword).toBe('레시피');
    expect(matchRule(rules, '레 시 피')?.keyword).toBe('레시피');
    expect(matchRule(rules, '#레시피')?.keyword).toBe('레시피');
    expect(matchRule(rules, 'RECIPE please')?.keyword).toBe('Recipe');
    expect(matchRule(rules, '맛있겠다')).toBeNull();
    expect(matchRule(rules, '')).toBeNull();
    expect(matchRule(rules, '🙏🙏')).toBeNull();
  });

  it('조합형(자모가 나뉜) 한글도 같은 글자로 본다', () => {
    const decomposed = '레시피'.normalize('NFD');
    expect(decomposed).not.toBe('레시피');
    expect(matchRule([rule(['레시피'])], `${decomposed} 주세요`)).not.toBeNull();
  });

  it('위의 규칙이 먼저, 꺼진 규칙은 건너뛴다', () => {
    const rules = [rule(['재료'], { enabled: false }), rule(['분량', '재료표'])];
    expect(matchRule(rules, '재료표 있나요')?.rule.id).toBe('분량');
    expect(matchRule(rules, '재료만')).toBeNull();
  });

  it('DM은 문구 + 링크, 문구가 없으면 보내지 않는다', () => {
    expect(dmMessage(rule(['a'], { dmText: '레시피 카드예요', dmLink: 'https://example.com/r' }))).toBe('레시피 카드예요\nhttps://example.com/r');
    expect(dmMessage(rule(['a']))).toBe('');
  });
});

describe('규칙 검사', () => {
  it('사람이 쓴 문구를 그대로 두고, 쉼표로 단어를 나눈다', () => {
    const [r] = cleanRules([{ keywords: '레시피, 재료 ,', reply: '  DM 드렸어요!  ', dmText: '카드 보내요', dmLink: 'https://blog.naver.com/x/1' }]);
    expect(r).toMatchObject({ keywords: ['레시피', '재료'], reply: 'DM 드렸어요!', dmText: '카드 보내요', dmLink: 'https://blog.naver.com/x/1', enabled: true });
  });

  it('잘못된 규칙은 쉬운 말로 거절한다', () => {
    expect(() => cleanRules([{ keywords: '', reply: 'x' }])).toThrow(/찾을 단어/);
    expect(() => cleanRules([{ keywords: '!!', reply: 'x' }])).toThrow(/글자가 없어요/);
    expect(() => cleanRules([{ keywords: '레시피', reply: '' }])).toThrow(/답글/);
    expect(() => cleanRules([{ keywords: '레시피', reply: 'x', dmText: 'y', dmLink: 'http://insecure.example' }])).toThrow(/https/);
    expect(() => cleanRules([{ keywords: '레시피', reply: 'x', dmLink: 'https://a.example' }])).toThrow(/DM 문구/);
    expect(() => cleanRules([{ keywords: '레시피', reply: 'x' }, { keywords: '레 시피', reply: 'y' }])).toThrow(/다른 규칙/);
    expect(() => cleanRules(Array.from({ length: 21 }, (_, i) => ({ keywords: `k${i}`, reply: 'x' })))).toThrow(/20개/);
    expect(() => cleanRules('nope')).toThrow();
  });

  it('겹친 규칙 번호는 새로 매긴다', () => {
    const rules = cleanRules([
      { id: 'same', keywords: 'a', reply: 'x' },
      { id: 'same', keywords: 'b', reply: 'y' },
    ]);
    expect(new Set(rules.map((r) => r.id)).size).toBe(2);
  });
});
