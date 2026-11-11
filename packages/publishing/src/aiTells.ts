/**
 * 한국어 'AI 티' 탐지 (규칙 기반, 모델 호출 없음).
 *
 * 출처: im-not-ai (Humanize KR, https://github.com/epoko77-ai/im-not-ai, MIT License, Copyright (c) 2026 epoko77-ai)
 * 의 분류 체계(ai-tell-taxonomy.md)·빠른 규칙(quick-rules.md)에서, 정규식으로 오탐이 적게 잡을 수 있는 패턴만 골라 옮겼다.
 * 규칙 번호(A-3, D-2 …)는 원본과 같다. 라이선스 전문: docs/third-party/im-not-ai-LICENSE.txt
 *
 * 원칙 (원본의 4대 철칙 중 우리에게 해당하는 것):
 * - 의미 불변: 이 모듈은 알려 주기만 하고 글을 바꾸지 않는다.
 * - 연구자 답변 원문은 검사하지 않는다 (프로젝트 원칙 4: 연구자 경험은 원문 그대로).
 * - 사람도 쓰는 표현은 '여러 번 반복될 때만' 알린다 (원본의 빈도 기준을 따름).
 */

export interface AiTell {
  /** 원본 분류 번호 (예: D-2) */
  rule: string;
  /** S1 = 강한 신호, S2 = 보통 */
  severity: 'S1' | 'S2';
  /** 무엇이 보였는지 (예: "시사하는 바" 1회) */
  found: string;
  /** 고치는 방법 (원본 처방을 쉬운 말로) */
  fix: string;
}

interface Rule {
  rule: string;
  severity: 'S1' | 'S2';
  pattern: RegExp;
  /** 몇 번 이상일 때 알릴지 (기본 1) */
  min?: number;
  /** 문단 하나 안에서 센다 */
  perParagraph?: boolean;
  /** 목록 줄("- ", "1. ")은 세지 않는다 */
  skipListLines?: boolean;
  label: string;
  fix: string;
}

const RULES: Rule[] = [
  // A. 번역투
  { rule: 'A-1', severity: 'S1', pattern: /에 대(?:해|하여)(?:서)?/g, min: 3, perParagraph: true, label: '"~에 대해"가 한 문단에 많음', fix: '목적격 조사로 바로 이어 주세요 ("X에 대해 설명" → "X를 설명").' },
  { rule: 'A-3', severity: 'S1', pattern: /에 있어(?:서)?(?=[\s,.]|$)/g, label: '"~에 있어(서)"', fix: '"~에서" 또는 "~을 볼 때"로 바꿔 보세요.' },
  { rule: 'A-5', severity: 'S2', pattern: /[와과] 관련(?:하여|해서|된|한)/g, label: '"~와 관련하여/관련된"', fix: '"~에", "~의"로 줄여 보세요.' },
  { rule: 'A-6', severity: 'S2', pattern: /(?:에 기반(?:하여|한|해)|[을를] 바탕으로)/g, min: 2, label: '"~에 기반하여/바탕으로" 반복', fix: '"~로", "~을 보고"처럼 짧게 바꿔 보세요.' },
  { rule: 'A-7', severity: 'S1', pattern: /(?:가지고|갖고) 있(?:다|습니다|어요|는)/g, label: '"가지고 있다" (영어 have 직역)', fix: '형용사·동사로 바꿔 보세요 ("향을 가지고 있다" → "향이 좋다").' },
  { rule: 'A-8', severity: 'S1', pattern: /(?:되어(?:지|진|집|졌|져)|지게 (?:된다|됩니다|돼요))/g, label: '이중 피동 "~되어진다/~지게 된다"', fix: '"~된다" 하나만 쓰거나 능동문으로 바꿔 주세요.' },
  { rule: 'A-9', severity: 'S2', pattern: /에 의(?:해|하여)\s+\S{0,12}?(?:되|된|됩|됐|받|당)/g, label: '"~에 의해 ~된다" 피동', fix: '하는 쪽을 주어로 ("열에 의해 익는다" → "열이 익힌다", 또는 "불에 익는다").' },
  { rule: 'A-10', severity: 'S2', pattern: /(?:할|될|볼|낼|살릴|줄일) 수 있(?:다|습니다|어요)/g, min: 4, label: '"~할 수 있다" 반복', fix: '단정으로 바꾸지 말고 일부만 "~할 수도 있다"처럼 바꿔 리듬만 깨 주세요.' },
  { rule: 'A-19', severity: 'S2', pattern: /(?:에서의|에로의|으로의|으로부터의|로부터의)/g, label: '이중 조사 "~에서의/~으로의"', fix: '절로 풀어 써 주세요 ("팬에서의 조리" → "팬에서 익힐 때").' },
  { rule: 'A-21', severity: 'S2', pattern: /단순(?:한|히)\s?[^\s]{1,10}\s?(?:을|를)?\s?넘어/g, label: '"단순한 X를 넘어 Y"', fix: '"X만이 아니라 Y다"로 풀거나 넘어-구를 빼 주세요.' },
  { rule: 'A-22', severity: 'S2', pattern: /[은는이가] (?:명확|분명)(?:하다|합니다|해요)/g, label: '"~은 분명하다/명확하다"', fix: '평가 말을 빼고 내용을 바로 말해 주세요.' },
  // C. 구조
  { rule: 'C-5', severity: 'S1', pattern: /\p{Extended_Pictographic}/gu, min: 4, label: '이모지 많음', fix: '꼭 필요한 곳만 남겨 주세요.' },
  { rule: 'C-8', severity: 'S1', pattern: /(?:[가이] 아니라|것이 아니라|것은 아니다|것은 아닙니다|인가, )/g, min: 2, label: '"A가 아니라 B" 대구 반복', fix: '한 번만 살리고 나머지는 그냥 평서문으로 써 주세요.' },
  { rule: 'C-9', severity: 'S2', pattern: /(?:^|\s)\d\)\s/gm, min: 3, label: '"1) 2) 3)" 번호 나열', fix: '본문에 녹이거나 "우선~, 다음으로~"로 바꿔 보세요.' },
  // 참고·창고·최고·광고 같은 명사는 연결어미가 아니고, 재료·순서 목록 줄은 문장이 아니다
  { rule: 'C-11', severity: 'S1', pattern: /(?:(?![참창최광원경])[가-힣]고|[가-힣](?:며|지만|면서|아서|어서)),/g, min: 4, skipListLines: true, label: '연결어미 뒤 쉼표 ("~하고,")', fix: '연결어미 바로 뒤 쉼표를 지워 주세요.' },
  // D. AI 관용구
  { rule: 'D-1', severity: 'S1', pattern: /(?:결론적으로|요약하면|종합하면|정리하자면|따라서|이를 통해|그러므로)/g, min: 4, label: '정리하는 말 ("결론적으로/따라서/이를 통해") 많음', fix: '1~2개만 남기고 지워 주세요.' },
  { rule: 'D-1', severity: 'S1', pattern: /라고 (?:할|볼) 수 있(?:다|습니다|어요)/g, label: '"~라고 할 수 있다"', fix: '"~다"로 바로 말해 주세요.' },
  { rule: 'D-2', severity: 'S1', pattern: /(?:매우 중요(?:하다|합니다|해요)|시사하는 바|주목할 만(?:하|한)|간과할 수 없|무시할 수 없|의미가 적지 않|의미심장)/g, label: '중요성 과장 ("시사하는 바가 크다/매우 중요하다")', fix: '지우거나 구체적인 결론(무엇이 어떻게 달라지는지)으로 바꿔 주세요.' },
  { rule: 'D-3', severity: 'S1', pattern: /(?:크게 (?:두|세|네) 가지로|다음과 같(?:은|이))/g, label: '열거 도입 ("크게 세 가지로/다음과 같은")', fix: '도입구를 지우고 바로 본론을 써 주세요.' },
  { rule: 'D-6', severity: 'S2', pattern: /(?:때|시점|순간)입니다(?=[.!]|$)/gm, label: '결말 공식 "~할 때입니다"', fix: '구체적인 동사로 끝내 주세요 ("지금 만들어 보세요").' },
  { rule: 'D-8', severity: 'S2', pattern: /(?:(?:중요한|필요한) (?:것|점)은|(?:핵심|관건)은 [^.!?\n]{1,30}(?:이다|입니다|이에요|라는 점))/g, label: '분열문 ("중요한 것은 ~이다")', fix: '주어와 서술어를 바로 이어 주세요 ("중요한 것은 불 조절이다" → "불 조절이 중요하다").' },
  { rule: 'D-10', severity: 'S2', pattern: /(?:하는|한|인|는) 이유(?:다|입니다|예요)(?=[.!]|$)/gm, label: '"~하는 이유다" 거꾸로 맺기', fix: '"그래서 ~다"처럼 순서대로 써 주세요.' },
  { rule: 'D-12', severity: 'S2', pattern: /(?:과제|한계|아쉬운 점)(?:도|가) (?:남아 있|분명하|있)/g, label: '내용 없는 "한계도 있다" 문장', fix: '실제 한계를 바로 첫 문장으로 써 주세요.' },
  // G. 완곡
  { rule: 'G-2', severity: 'S2', pattern: /(?:가능성이 있을 수 있|보여질 수 있|일 수도 있을 것)/g, label: '이중 완곡 ("~할 가능성이 있을 수 있다")', fix: '완곡 표현은 하나만 남겨 주세요.' },
  // H. 접속사
  { rule: 'H-4', severity: 'S2', pattern: /(?:^|\s)즉[ ,]/gm, min: 3, label: '"즉" 반복', fix: '2번 이하로 줄이거나 빼 주세요.' },
  // I. 형식명사
  { rule: 'I-2', severity: 'S2', pattern: /(?:점에 있(?:다|습니다)|주목할 점은)/g, label: '"~라는 점에 있다/주목할 점은"', fix: '"X는 ~다"로 바로 말해 주세요.' },
  { rule: 'I-3', severity: 'S2', pattern: /다는 (?:것|뜻|점)(?:이다|입니다|이에요)/g, min: 2, label: '"~다는 것이다/~다는 뜻이다" 맺음 반복', fix: '"~다"로 바로 끝내 주세요 (2번 이하).' },
  // J. 장식
  { rule: 'J-1', severity: 'S2', pattern: /\*\*[^*\n]+\*\*/g, min: 9, label: '굵은 글씨 많음', fix: '정말 중요한 곳만 굵게 남겨 주세요.' },
  { rule: 'J-2', severity: 'S2', pattern: /[‘'“"][^’'”"\n]{1,15}[’'”"]/g, min: 5, label: '강조용 따옴표 많음', fix: '진짜 인용만 남기고 따옴표를 빼 주세요.' },
];

/** 연구자 답변 원문(8자 이상)은 검사에서 뺀다 */
function withoutProtected(text: string, protectedTexts: string[]): string {
  let t = text;
  for (const p of protectedTexts) {
    const s = p.trim();
    if (s.length >= 8) t = t.split(s).join(' ');
  }
  return t;
}

function count(re: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].map((m) => m[0].trim());
}

/**
 * 글에서 AI 티 패턴을 찾는다. 같은 규칙 번호라도 패턴이 다르면 따로 알린다.
 * protectedTexts: 검사하지 않을 원문 (연구자 답변 등)
 */
export function findAiTells(text: string, protectedTexts: string[] = []): AiTell[] {
  // 제목 줄(#)과 마크다운 링크 주소는 빼고 본문만
  const body = withoutProtected(text, protectedTexts)
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n')
    .replace(/\]\([^)]*\)/g, ']');
  const out: AiTell[] = [];
  for (const r of RULES) {
    const min = r.min ?? 1;
    if (r.perParagraph) {
      const worst = body.split(/\n\s*\n/).map((p) => count(r.pattern, p)).sort((a, b) => b.length - a.length)[0] ?? [];
      if (worst.length >= min) out.push({ rule: r.rule, severity: r.severity, found: `${r.label} (한 문단 ${worst.length}번)`, fix: r.fix });
      continue;
    }
    const hits = count(r.pattern, r.skipListLines ? body.split('\n').filter((l) => !/^\s*(?:- |\d+\. )/.test(l)).join('\n') : body);
    if (hits.length >= min) {
      const sample = [...new Set(hits)].slice(0, 2).map((h) => `"${h}"`).join(', ');
      out.push({ rule: r.rule, severity: r.severity, found: `${r.label} — ${sample}${hits.length > 1 ? ` 등 ${hits.length}번` : ''}`, fix: r.fix });
    }
  }
  return out;
}
