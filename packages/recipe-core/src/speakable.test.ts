import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from './samples.ts';
import { alignWordTimes, hardWords, nativeNumber, respellDoubleFinalLB, sinoNumber, speakNumbers, speakable } from './speakable.ts';

describe('수 읽기', () => {
  it('한자어 수: 천·백·십 앞의 일은 읽지 않고 만 단위로 띄운다', () => {
    expect(sinoNumber(0)).toBe('영');
    expect(sinoNumber(10)).toBe('십');
    expect(sinoNumber(140)).toBe('백사십');
    expect(sinoNumber(500)).toBe('오백');
    expect(sinoNumber(1000)).toBe('천');
    expect(sinoNumber(2026)).toBe('이천이십육');
    expect(sinoNumber(10000)).toBe('만');
    expect(sinoNumber(12000)).toBe('만 이천');
    expect(sinoNumber(35000)).toBe('삼만 오천');
    expect(sinoNumber(100000000)).toBe('일억');
  });
  it('고유어 수(단위 앞 꼴): 한, 스무, 스물한, 백스무', () => {
    expect([1, 2, 3, 4, 5, 8, 10, 11, 12].map(nativeNumber)).toEqual(['한', '두', '세', '네', '다섯', '여덟', '열', '열한', '열두']);
    expect(nativeNumber(20)).toBe('스무');
    expect(nativeNumber(21)).toBe('스물한');
    expect(nativeNumber(30)).toBe('서른');
    expect(nativeNumber(99)).toBe('아흔아홉');
    expect(nativeNumber(100)).toBe('백');
    expect(nativeNumber(120)).toBe('백스무');
  });
});

describe('숫자+단위를 읽는 말로 (사용자 지적: "1컵"을 "일컵"으로 읽음)', () => {
  it('실제 대본 줄 (호두정과)', () => {
    expect(speakable('정석대로 다시 갈게요. 호두 500g에 설탕 1컵, 물엿 1/2컵까지요.')).toBe('정석대로 다시 갈게요. 호두 오백 그램에 설탕 한 컵, 물엿 반 컵까지요.');
    expect(speakable('호두 500g, 설탕 1컵, 꿀 1큰술 장보기 끝!')).toBe('호두 오백 그램, 설탕 한 컵, 꿀 한 큰술 장보기 끝!');
    expect(speakable('데치고, 찬물에 두세번 헹구고, 말려서 조려요. 튀김은 140도정도에서요!')).toBe('데치고, 찬물에 두세번 헹구고, 말려서 조려요. 튀김은 백사십 도정도에서요!');
    expect(speakable('조린 호두를 140도 정도 기름에 튀겨야 겉 시럽이 굳어요.')).toBe('조린 호두를 백사십 도 정도 기름에 튀겨야 겉 시럽이 굳어요.');
  });
  it('실제 대본 줄 (시금치나물·들깨고사리파스타)', () => {
    expect(speakable('하루를 위해 다시! 시금치 1단, 국간장, 다진 마늘, 참기름 1큰술.')).toBe('하루를 위해 다시! 시금치 한 단, 국간장, 다진 마늘, 참기름 한 큰술.');
    expect(speakable('분명 30초만 데쳤는데요.')).toBe('분명 삼십 초만 데쳤는데요.');
    expect(speakable('고사리를 밑간해 1분 볶고, 육수 붓고 4분, 들깨가루 넣고 4분 더요.')).toBe('고사리를 밑간해 일 분 볶고, 육수 붓고 사 분, 들깨가루 넣고 사 분 더요.');
    expect(speakable('재료는 다 맞아요. 고사리 400g, 거피들깨가루 100g까지 확인했거든요.')).toBe('재료는 다 맞아요. 고사리 사백 그램, 거피들깨가루 백 그램까지 확인했거든요.');
    expect(speakable('소스는 한 번에 만들어 4통으로 나눠 냉동하면, 1인분씩 꺼내 쓸 수 있어요.')).toBe('소스는 한 번에 만들어 네 통으로 나눠 냉동하면, 일 인분씩 꺼내 쓸 수 있어요.');
    expect(speakable('스파게티니는 5분 30초 삶고, 면수 4T는 꼭 남겨요.')).toBe('스파게티니는 오 분 삼십 초 삶고, 면수 네 큰술은 꼭 남겨요.');
    expect(speakable('소스에 생크림 넣고 끓으면, 면이랑 면수 넣고 1~2분이면 끝!')).toBe('소스에 생크림 넣고 끓으면, 면이랑 면수 넣고 일이 분이면 끝!');
  });
  it('고유어로 세는 단위: 컵·큰술·작은술·개·장·통·단·번·가지·시간·시', () => {
    expect(speakNumbers('1컵 2큰술 3작은술 4개 2장 1통 1모 3번 2가지 2시간 3시 12시 1볼 2배')).toBe('한 컵 두 큰술 세 작은술 네 개 두 장 한 통 한 모 세 번 두 가지 두 시간 세 시 열두 시 한 볼 두 배');
    expect(speakNumbers('달걀 20개, 21개, 120개')).toBe('달걀 스무 개, 스물한 개, 백스무 개');
    expect(speakNumbers('8개')).toBe('여덟 개');
  });
  it('한자어로 읽는 단위: 분·초·도·인분·g·kg·ml·L·%·℃', () => {
    expect(speakNumbers('7분 30초 180도 2인분 1kg 200ml 1L 30% 180℃ 170°C 5cm 5단계 3일 2주 12,000원')).toBe(
      '칠 분 삼십 초 백팔십 도 이 인분 일 킬로그램 이백 밀리리터 일 리터 삼십 퍼센트 백팔십 도 백칠십 도 오 센티미터 오 단계 삼 일 이 주 만 이천 원',
    );
  });
  it('요리책 약자: T(큰술)·t(작은술)·C(컵), 띄어 쓴 영문 단위', () => {
    expect(speakNumbers('간장 2T, 설탕 2t, 물 4C, 우유 500 ml')).toBe('간장 두 큰술, 설탕 두 작은술, 물 네 컵, 우유 오백 밀리리터');
  });
  it('분수: 1/2은 반, 나머지는 몇분의 몇', () => {
    expect(speakNumbers('물엿 1/2컵, 소금 1/2작은술, 우유 3/4컵, 1/3컵, 1/2kg')).toBe('물엿 반 컵, 소금 반 작은술, 우유 사분의 삼 컵, 삼분의 일 컵, 반 킬로그램');
    expect(speakNumbers('간장 1 1/2T, 1과 1/2컵, 2 1/3컵')).toBe('간장 한 큰술 반, 한 컵 반, 이와 삼분의 일 컵');
    expect(speakNumbers('전체의 1/2만')).toBe('전체의 이분의 일만');
    expect(speakNumbers('3분의1만')).toBe('삼분의 일만');
  });
  it('범위: 이웃한 수는 붙여 읽는다 (삼사 분, 두세 컵, 서너 개)', () => {
    expect(speakNumbers('3~4분')).toBe('삼사 분');
    expect(speakNumbers('5~6분, 2~3일')).toBe('오륙 분, 이삼 일');
    expect(speakNumbers('2~3컵, 3~4개, 4~5개, 5~6장, 1~2큰술')).toBe('두세 컵, 서너 개, 네다섯 개, 대여섯 장, 한두 큰술');
    expect(speakNumbers('10~15분, 2~4개, 180~190도')).toBe('십에서 십오 분, 두 개에서 네 개, 백팔십에서 백구십 도');
    expect(speakNumbers('3-4분')).toBe('삼사 분');
    expect(speakNumbers('1.5~2kg')).toBe('일점오에서 이 킬로그램');
  });
  it('소수: 고유어 단위의 .5는 "반"', () => {
    expect(speakNumbers('1.5컵, 0.5컵, 2.5T를')).toBe('한 컵 반, 반 컵, 두 큰술 반을');
    expect(speakNumbers('2.5kg, 0.3%')).toBe('이점오 킬로그램, 영점삼 퍼센트');
  });
  it('읽는 말이 바뀌면 뒤에 붙은 조사를 맞춘다', () => {
    expect(speakNumbers('4T는 남겨요')).toBe('네 큰술은 남겨요');
    expect(speakNumbers('4T면 돼요')).toBe('네 큰술이면 돼요');
    expect(speakNumbers('1T로 맞춰요')).toBe('한 큰술로 맞춰요');
    expect(speakNumbers('500g이 기준')).toBe('오백 그램이 기준');
    expect(speakNumbers('2L가 필요')).toBe('이 리터가 필요');
    expect(speakNumbers('1.5개를')).toBe('한 개 반을');
    // 조사가 아닌 말(가량·정도)은 그대로
    expect(speakNumbers('500g가량')).toBe('오백 그램가량');
  });
  it('특별한 꼴: 첫 번째, 유월·시월, 오후 열세 시는 십삼 시', () => {
    expect(speakNumbers('1번째, 2번째')).toBe('첫 번째, 두 번째');
    expect(speakNumbers('6월, 10월, 3월')).toBe('유월, 시월, 삼월');
    expect(speakNumbers('13시')).toBe('십삼 시');
  });
  it('날짜·번호·시각·비율처럼 단위 없는 숫자 묶음은 건드리지 않는다', () => {
    for (const t of ['2026-11-19', '010-1234-5678', '10:30', '1:1', 'v2.5.1', '007']) expect(speakNumbers(t)).toBe(t);
  });
  it('숫자가 없는 문장은 그대로', () => {
    expect(speakNumbers('재료는 그대로, 순서만 지키면 돼요.')).toBe('재료는 그대로, 순서만 지키면 돼요.');
  });
  it('예시 레시피의 분량 표기는 모두 숫자 없이 읽힌다', () => {
    const amounts = SAMPLE_RECIPES.flatMap((r) => r.ingredients.map((i) => i.amount)).filter((a) => /\d/.test(a));
    expect(amounts.length).toBeGreaterThan(10);
    for (const a of amounts) expect(speakable(a), a).not.toMatch(/\d/);
  });
});

describe("겹받침 'ㄼ' (사용자 지적: '떫'을 못 읽음)", () => {
  it('실제 대본 줄', () => {
    expect(speakable('떫은맛이 줄어요')).toBe('떨븐 맛이 줄어요');
    expect(speakable('떫죠?')).toBe('떨쬬?');
    expect(speakable('선물용 호두정과, 한 입 먹자마자 떫어요!')).toBe('선물용 호두정과, 한 입 먹자마자 떨버요!');
    expect(speakable('떫은맛 범인 검거 완료!')).toBe('떨븐 맛 범인 검거 완료!');
    // 꾸미는 말 뒤만 띄운다: 끝나는 말(떫은)·다른 끝(떫어서)은 그대로
    expect(speakable('호두가 떫은 건 껍질 때문, 떫어서')).toBe('호두가 떨븐 건 껍질 때문, 떨버서');
  });
  it('표준 발음법: 모음 앞 연음(제14항), 자음 앞 [ㄹ]+된소리(제10·25항), ㄴ 앞 [ㄹ](제20항), ㅎ 앞 [ㅍ]', () => {
    expect(respellDoubleFinalLB('떫다 떫지 떫고 떫게 떫네 떫어서')).toBe('떨따 떨찌 떨꼬 떨께 떨레 떨버서');
    expect(respellDoubleFinalLB('여덟 여덟을 엷은 엷게')).toBe('여덜 여덜블 열븐 열께');
    expect(respellDoubleFinalLB('밟히다')).toBe('발피다');
  });
  it('엔진이 이미 맞게 읽는 흔한 말(얇게·넓은·짧게, 소리 실험)은 그대로 둔다', () => {
    expect(respellDoubleFinalLB('반죽은 얇게 펴고, 넓은 팬에 짧게 부쳐요.')).toBe('반죽은 얇게 펴고, 넓은 팬에 짧게 부쳐요.');
  });
  it("예외 '밟-'은 자음 앞에서 [밥], '넓죽'은 [넙]", () => {
    expect(respellDoubleFinalLB('밟다 밟지 밟는 밟아')).toBe('밥따 밥찌 밤는 발바');
    expect(respellDoubleFinalLB('넓죽하다 넓둥글다')).toBe('넙쭉하다 넙뚱글다');
  });
  it('ㄼ이 없는 말은 바꾸지 않는다 (흔한 겹받침도 엔진이 잘 읽으면 그대로)', () => {
    const t = '굵은소금 넣고 끓는 물에 삶아요. 없어요, 많이, 앉아요.';
    expect(speakable(t)).toBe(t);
  });
  it('숫자를 풀어 생긴 "여덟"도 소리 나는 대로', () => {
    expect(speakable('달걀 8개')).toBe('달걀 여덜 개');
  });
});

describe('이름', () => {
  it('"이희재의"는 성 뒤를 띄워 읽힌다 (붙여 쓰면 엔진이 "이제의"로 읽었다)', () => {
    expect(speakable('오늘의 실험 끝! 이희재의 맛 연구소였어요.')).toBe('오늘의 실험 끝! 이 희재의 맛 연구소였어요.');
    expect(speakable('희재 선생님 노트에 답이 있었어요.')).toBe('희재 선생님 노트에 답이 있었어요.');
  });
});

describe('받아쓴 어절 시간을 자막 어절에 맞추기', () => {
  it('읽는 말이 어절 수를 바꿔도 자막 어절마다 시간을 준다 ("1/2컵" → "반 컵")', () => {
    const heard = [
      { text: '물엿', start: 0, end: 0.4 },
      { text: '반', start: 0.4, end: 0.6 },
      { text: '컵까지요.', start: 0.6, end: 1.2 },
    ];
    expect(alignWordTimes('물엿 1/2컵까지요.', heard)).toEqual([
      [0, 0.4],
      [0.4, 1.2],
    ]);
  });
  it('받아쓰기가 숫자로 적어도 맞춘다 ("한 컵" ↔ "1컵")', () => {
    const heard = [
      { text: '설탕', start: 0, end: 0.5 },
      { text: '1컵', start: 0.5, end: 1 },
    ];
    expect(alignWordTimes('설탕 1컵', heard)).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
  });
  it('받아쓰기가 붙여 적은 어절은 글자 수로 나눈다 ("맛연구소" → 맛 / 연구소)', () => {
    const heard = [
      { text: '이희재의', start: 0, end: 0.8 },
      { text: '맛연구소였어요.', start: 0.8, end: 2.2 },
    ];
    const t = alignWordTimes('이희재의 맛 연구소였어요.', heard)!;
    expect(t).toHaveLength(3);
    expect(t[0]).toEqual([0, 0.8]);
    expect(t[1]![0]).toBeCloseTo(0.8);
    expect(t[1]![1]).toBeCloseTo(1);
    expect(t[2]![0]).toBeCloseTo(1);
    expect(t[2]![1]).toBeCloseTo(2.2);
  });
  it('받아쓰기가 놓친 어절은 앞뒤 사이에 두고, 많이 다르면 쓰지 않는다', () => {
    const heard = [
      { text: '호두를', start: 0, end: 0.5 },
      { text: '튀겨요', start: 1.5, end: 2 },
    ];
    const t = alignWordTimes('호두를 기름에 튀겨요', heard)!;
    // 맞는 글자가 60% 이상일 때만 쓴다 (5/8 글자)
    expect(t).toEqual([
      [0, 0.5],
      [0.5, 1.5],
      [1.5, 2],
    ]);
    expect(alignWordTimes('다른 문장', [{ text: '이희재의', start: 0, end: 1 }])).toBeUndefined();
  });
});

describe('받아쓰기로 꼭 확인할 낱말 (hardWords)', () => {
  it('발음을 고쳐 넘긴 ㄼ 낱말은 바뀐 글자와 앞뒤 한 글자만 (조사는 빼고)', () => {
    expect(hardWords('호두를 끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어들어요.')).toEqual([{ written: '떫은맛', said: '떨븐맛' }]);
    expect(hardWords('선물용 호두정과, 한 입 먹자마자 떫어요!')).toEqual([{ written: '떫어요', said: '떨버요' }]);
    expect(hardWords('달걀 여덟을 삶아요')).toEqual([{ written: '여덟을', said: '여덜블' }]);
  });
  it('이름은 이름 글자만 (읽는 글자는 띄어쓰기만 다르다)', () => {
    expect(hardWords('이희재의 맛 연구소였어요.')).toEqual([{ written: '이희재', said: '이희재' }]);
  });
  it('같은 낱말은 한 번만, 고친 말이 없으면 비어 있다 (숫자·잘 읽는 겹받침은 넣지 않는다)', () => {
    expect(hardWords('데치면 떫은맛이 빠지고, 떫은맛 걱정 끝')).toHaveLength(1);
    expect(hardWords('설탕 1컵, 반죽은 얇게, 넓은 팬에')).toEqual([]);
  });
});

describe('꼭 또렷해야 하는 말 (이름·요리 이름·주재료)', () => {
  it('성 없이 부르는 "희재 선생님"도 확인한다 (어디에 나오든)', () => {
    expect(hardWords('희재 선생님은 거피들깨가루를 마지막에 넣어요.')).toEqual([{ written: '희재', said: '희재' }]);
    expect(hardWords('그래서 희재 선생님은 데쳐요.')).toEqual([{ written: '희재', said: '희재' }]);
  });
  it('요리 이름·주재료는 문장 첫머리에서만 (문장 가운데 ㅎ은 사람도 약하게 읽는다)', () => {
    const must = ['호두정과', '호두'];
    expect(hardWords('호두를 튀기기 전에 왜 먼저 데칠까요?', must)).toEqual([{ written: '호두', said: '호두' }]);
    expect(hardWords('호두정과, 왜 데친 뒤에 튀길까요?', must)).toEqual([{ written: '호두정과', said: '호두정과' }]);
    expect(hardWords('데친 호두는 찬물에 헹궈 주세요.', must)).toEqual([]);
    expect(hardWords('그다음 말려요. 호두는 140도에서 튀겨요.', must)).toEqual([{ written: '호두', said: '호두' }]);
  });
});
