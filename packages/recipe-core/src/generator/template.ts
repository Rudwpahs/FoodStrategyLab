import { BRAND, hostLines } from '../brand.ts';
import { firstSentence, formatIngredient, splitSentences } from '../format.ts';
import { spoken } from '../korean.ts';
import type { RecipeInput, Scene, Script } from '../types.ts';

/** 영상 조리 순서 카드에 보여 주는 단계 수 (연출 엔진과 같이 쓴다) */
export const MAX_STEPS_ON_CARD = 5;
const MAX_EXPLAIN_SCENES = 2;

type Draft = Omit<Scene, 'id'>;

/**
 * 비용 0원 기본 생성기: LLM 없이 입력 데이터만으로 대본을 조립한다.
 * 분량·재료·단계는 원본을 그대로 옮기고, 캐릭터 대사만 템플릿으로 만든다.
 * 브랜드 규칙은 연출 엔진(styles.ts)과 같다: 연구소 이름(연구자 이름)은 엔딩 인사(SIGN_OFFS 중 하나)에서 한 번만 말한다.
 * 맛조수는 기록 담당 AI 성격(persona.ts lab-notes)으로 말한다: 실수·비명 없이, 직접 만들거나 맛본 척하지 않는다.
 * 영상 포맷이 캐릭터 문답형이고 흔한 실수가 있으면, 그 실수를 많은 사람이 겪는 일로 꺼내고 바로 원인(선생님 노트)으로 넘어간다.
 */
export function generateTemplateScript(recipe: RecipeInput): Script {
  const drafts: Draft[] = [];
  const withMistake = recipe.format === 'comedy' && recipe.commonMistake.length > 0;
  const say = hostLines(recipe, 'template');

  drafts.push({ type: 'intro', emotion: 'joy', line: say.opening, cardTitle: recipe.topic });

  if (withMistake) {
    // 실패는 맛조수의 것이 아니다: 맛조수가 든 접시 대신 음식 클로즈업(설명용 연출)으로 보여 주고, 카드에는 원본 문장 그대로
    drafts.push({ type: 'mistake', emotion: 'curious', line: `${say.caseLead} ${spoken(recipe.commonMistake)}`, visual: 'fail-closeup', cardTitle: firstSentence(recipe.commonMistake) });
    drafts.push({ type: 'question', emotion: 'curious', line: '왜 이렇게 되는지 같이 볼게요.', cardTitle: '오늘의 질문' });
  } else {
    drafts.push({ type: 'question', emotion: 'curious', line: `오늘의 질문! ${recipe.topic}`, cardTitle: '오늘의 질문' });
  }

  const sentences = splitSentences(recipe.principle).slice(0, MAX_EXPLAIN_SCENES);
  sentences.forEach((sentence, i) => {
    drafts.push({
      type: 'explain',
      emotion: i === 0 ? 'surprised' : 'confident',
      line: i === 0 ? `${say.noteLead} ${spoken(sentence)}` : spoken(sentence),
      cardTitle: BRAND.notePhrase,
      cardItems: [sentence],
    });
  });

  if (recipe.ingredients.length > 0) {
    const names = recipe.ingredients.map((i) => i.name);
    drafts.push({
      type: 'ingredients',
      emotion: 'joy',
      line: names.length <= 3 ? `준비물은 ${names.join(', ')}!` : '준비물은 이거예요!',
      cardTitle: '준비물',
      cardItems: recipe.ingredients.map(formatIngredient),
    });
  }

  if (recipe.steps.length > 0) {
    const shown = recipe.steps.slice(0, MAX_STEPS_ON_CARD);
    const rest = recipe.steps.length - shown.length;
    drafts.push({
      type: 'steps',
      emotion: 'confident',
      line: withMistake
        ? `노트대로 하면 ${rest > 0 ? `핵심 ${shown.length}단계예요. 전체 ${recipe.steps.length}단계는 블로그에 정리했어요.` : `딱 ${shown.length}단계예요.`}`
        : `순서는 ${rest > 0 ? `핵심 ${shown.length}단계, 전체 ${recipe.steps.length}단계는 블로그에 정리했어요` : `딱 ${shown.length}단계`}!`,
      cardTitle: '조리 순서',
      cardItems: shown,
    });
  }

  const tip = recipe.tips[0];
  if (tip) {
    drafts.push({ type: 'tip', emotion: 'confident', line: `${say.tipLead} ${spoken(tip)}`, cardTitle: BRAND.tipPhrase, cardItems: [tip] });
  }

  drafts.push({
    type: 'outro',
    emotion: 'joy',
    line: `저장해 두세요! ${say.signOff}`,
  });

  return {
    title: recipe.topic,
    scenes: drafts.map((d, i) => ({ id: `s${i + 1}`, ...d })),
  };
}

/** 한국어 TTS 기준 대략적인 길이(초). 실제 길이는 음성 생성 후 확정된다. */
export const CHARS_PER_SECOND = 7;
/** 아주 짧은 대사도 이만큼은 말한다 (초) */
const MIN_SPEECH_SECONDS = 1.1;
/** 장면 길이 = 말하는 시간 + 이만큼의 여유 (초) */
const SCENE_PAD_SECONDS = 0.5;

/** 대사를 말하는 시간만 (여유 없이). 음성이 아직 없을 때 영상 타임라인이 쓴다 */
export function estimateSpeechSeconds(line: string): number {
  const chars = line.replace(/\s/g, '').length;
  return Math.max(MIN_SPEECH_SECONDS, chars / CHARS_PER_SECOND);
}
export function estimateSceneSeconds(scene: Pick<Scene, 'line'>): number {
  return estimateSpeechSeconds(scene.line) + SCENE_PAD_SECONDS;
}
export function estimateScriptSeconds(script: Script): number {
  return script.scenes.reduce((sum, s) => sum + estimateSceneSeconds(s), 0);
}
