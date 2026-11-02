import type { RecipeInput } from './types.ts';

/**
 * 파일럿 샘플 3개. 이희재 연구자 검수 전 초안이므로
 * 실제 공개 전 반드시 내용·분량을 확인받아야 한다.
 */
export const SAMPLE_RECIPES: RecipeInput[] = [
  {
    topic: '왜 김치전은 금방 눅눅해질까?',
    dishName: '바삭한 김치전',
    category: 'fix',
    format: 'comedy',
    ingredients: [
      { name: '잘 익은 김치', amount: '200g' },
      { name: '부침가루', amount: '1컵' },
      { name: '찬물', amount: '3/4컵' },
      { name: '김치 국물', amount: '2큰술' },
      { name: '식용유', amount: '4큰술' },
    ],
    steps: [
      '김치는 국물을 가볍게 짜고 잘게 썬다.',
      '부치기 직전에 부침가루, 찬물, 김치 국물을 섞는다.',
      '팬에 식용유를 넉넉히 두르고 충분히 달군다.',
      '반죽을 얇게 펴서 앞뒤로 노릇하게 부친다.',
      '다 부친 전은 겹치지 않게 식힘망에 올린다.',
    ],
    principle: '김치 속 소금이 반죽의 수분을 계속 끌어내서 시간이 지날수록 반죽이 질어집니다. 다 부친 전을 겹쳐 두면 김이 빠지지 못해 겉면이 다시 젖습니다.',
    tips: ['반죽은 부치기 직전에 섞고, 다 부친 전은 겹치지 말고 식힘망에 올리세요.'],
    commonMistake: '반죽을 미리 만들어 두었더니 전이 눅눅해졌어요.',
    source: '이희재 조리 노트 (검수 전 샘플)',
  },
  {
    topic: '시금치는 왜 데친 뒤 찬물에 헹굴까?',
    dishName: '시금치나물',
    category: 'science',
    format: 'explainer',
    ingredients: [
      { name: '시금치', amount: '1단' },
      { name: '굵은소금', amount: '1작은술' },
      { name: '국간장', amount: '1작은술' },
      { name: '다진 마늘', amount: '1/2작은술' },
      { name: '참기름', amount: '1큰술' },
    ],
    steps: [
      '끓는 물에 굵은소금을 넣는다.',
      '시금치를 뿌리 쪽부터 넣어 30초 정도 데친다.',
      '곧바로 찬물에 헹궈 물기를 꼭 짠다.',
      '국간장, 다진 마늘, 참기름을 넣고 조물조물 무친다.',
    ],
    principle: '데친 채소는 건져낸 뒤에도 남은 열로 계속 익습니다. 찬물에 바로 헹구면 익는 것이 멈춰서 식감과 초록색이 살아 있습니다.',
    tips: ['데치는 시간은 짧게, 헹굴 때는 넉넉한 찬물에 한 번에 식히세요.'],
    commonMistake: '',
    source: '이희재 조리 노트 (검수 전 샘플)',
  },
  {
    topic: '삶은 달걀 껍질이 잘 안 까지는 이유는?',
    dishName: '반숙 달걀',
    category: 'science',
    format: 'explainer',
    ingredients: [
      { name: '달걀', amount: '4개' },
      { name: '물', amount: '달걀이 잠길 만큼' },
      { name: '얼음물', amount: '1볼' },
    ],
    steps: [
      '달걀은 냉장고에서 미리 꺼내 둔다.',
      '끓는 물에 달걀을 조심히 넣고 7분 삶는다.',
      '건진 달걀을 바로 얼음물에 담가 식힌다.',
      '껍질에 금을 내고 물속에서 깐다.',
    ],
    principle: '갓 낳은 신선한 달걀일수록 흰자가 속껍질에 단단히 붙어 있습니다. 삶은 직후 얼음물에 식히면 흰자가 수축하면서 껍질과 떨어지기 쉬워집니다.',
    tips: ['삶자마자 얼음물에 담그고, 물속에서 까면 껍질이 훨씬 깔끔하게 벗겨집니다.'],
    commonMistake: '',
    source: '이희재 조리 노트 (검수 전 샘플)',
  },
];
