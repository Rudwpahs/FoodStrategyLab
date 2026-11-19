import { describe, expect, it } from 'vitest';
import type { Script } from '../types.ts';
import { jaccard, storyDiversity } from './diversity.ts';

const script = (lines: string[], places: ('kitchen' | 'lab' | 'dining')[] = []): Script => ({
  title: 't',
  style: 'ai-story',
  scenes: lines.map((line, i) => ({ id: `s${i + 1}`, type: 'intro' as const, emotion: 'joy' as const, line, ...(places[i] ? { place: places[i] } : {}) })),
});

describe('대본 다양성', () => {
  it('같은 문장은 유사도 1, 전혀 다른 문장은 0에 가깝다', () => {
    expect(jaccard('호두정과가 왜 떫죠?', '호두정과가 왜 떫죠?')).toBe(1);
    expect(jaccard('호두정과가 왜 떫죠?', '시금치는 데친 뒤 헹궈요')).toBeLessThan(0.1);
  });

  it('첫 대사·첫 어절 반복, 비슷한 대본 쌍, 갈래·대상·무대 분포를 센다', () => {
    const r = storyDiversity([
      { dish: '호두정과', storyType: 'why', audience: 'hobby-learner', script: script(['오늘의 실험! 호두정과', '끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어요'], ['dining', 'kitchen']) },
      { dish: '김치전', storyType: 'why', audience: 'young-home', script: script(['오늘의 실험! 김치전', '끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어요'], ['kitchen', 'kitchen']) },
      { dish: '시금치나물', storyType: 'occasion', audience: 'young-home', script: script(['할머니가 시금치를 남기셨어요', '이번엔 헹궈 볼게요'], ['lab', 'dining']) },
    ]);
    expect(r.count).toBe(3);
    expect(r.uniqueFirstLines).toBe(1);
    expect(r.repeatedOpenings).toEqual([{ word: '오늘의', count: 2 }]);
    expect(r.similarity.similarPairs.map((p) => [p.a, p.b])).toEqual([[0, 1]]);
    expect(r.storyTypes).toEqual({ why: 2, occasion: 1 });
    expect(r.audiences).toEqual({ 'hobby-learner': 1, 'young-home': 2 });
    expect(r.places.kitchen).toBe(3);
    expect(r.bannedHits).toBe(2);
    expect(r.childishHits).toBe(0);
    // 장면 종류가 모두 intro라 구성이 하나뿐이다
    expect(r.uniqueStructures).toBeCloseTo(0.33);
    expect(r.failOpenings).toBe(0);
  });

  it('구성이 다른지, 실패로 시작하는 대본·유치한 구도가 몰렸는지 센다 (레파토리 반복 검사)', () => {
    const fail: Script = { title: '떫은 호두의 범인', style: 'ai-story', scenes: [{ id: 's1', type: 'intro', emotion: 'surprised', visual: 'fail-closeup', line: '호두정과가 떫어요' }, { id: 's2', type: 'explain', emotion: 'curious', line: '데치면 줄어요' }] };
    const mistake: Script = { title: '반죽을 미리 했더니', style: 'ai-story', scenes: [{ id: 's1', type: 'mistake', emotion: 'embarrassed', line: '전이 눅눅해요' }, { id: 's2', type: 'explain', emotion: 'curious', line: '바로 부쳐요' }] };
    const why: Script = { title: '왜 데칠까요', style: 'ai-story', scenes: [{ id: 's1', type: 'question', emotion: 'curious', visual: 'sizzle', line: '이 단계는 왜 할까요?' }, { id: 's2', type: 'steps', emotion: 'confident', line: '끓는 물에 데쳐요' }] };
    const r = storyDiversity([
      { dish: '호두정과', storyType: 'mystery', script: fail },
      { dish: '김치전', storyType: 'one-fix', script: mistake },
      { dish: '호두정과', storyType: 'why', script: why },
    ]);
    expect(r.failOpenings).toBe(2);
    expect(r.childishHits).toBe(1);
    expect(r.uniqueStructures).toBe(1);
  });
});
