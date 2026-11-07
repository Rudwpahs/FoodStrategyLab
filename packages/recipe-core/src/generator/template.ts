import { BRAND } from '../brand.ts';
import { formatIngredient, splitSentences } from '../format.ts';
import { spoken } from '../korean.ts';
import type { RecipeInput, Scene, Script } from '../types.ts';

const MAX_STEPS_ON_CARD = 5;
const MAX_EXPLAIN_SCENES = 2;

type Draft = Omit<Scene, 'id'>;

/**
 * 비용 0원 기본 생성기: LLM 없이 입력 데이터만으로 대본을 조립한다.
 * 분량·재료·단계는 원본을 그대로 옮기고, 캐릭터 대사만 템플릿으로 만든다.
 */
export function generateTemplateScript(recipe: RecipeInput): Script {
  const drafts: Draft[] = [];
  const comedy = recipe.format === 'comedy' && recipe.commonMistake.length > 0;

  drafts.push({ type: 'intro', emotion: 'joy', line: BRAND.openingLine, cardTitle: recipe.topic });

  if (comedy) {
    drafts.push({ type: 'mistake', emotion: 'embarrassed', line: `으악, 망했어요! ${recipe.commonMistake}` });
    drafts.push({ type: 'question', emotion: 'disappointed', line: '대체 왜 그럴까요?', cardTitle: '오늘의 질문' });
  } else {
    drafts.push({ type: 'question', emotion: 'curious', line: `오늘의 질문! ${recipe.topic}`, cardTitle: '오늘의 질문' });
  }

  const sentences = splitSentences(recipe.principle).slice(0, MAX_EXPLAIN_SCENES);
  sentences.forEach((sentence, i) => {
    drafts.push({
      type: 'explain',
      emotion: i === 0 ? 'surprised' : 'confident',
      line: i === 0 ? `${BRAND.noteLead} ${spoken(sentence)}` : spoken(sentence),
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
      line: comedy
        ? `이번엔 제대로! ${rest > 0 ? `핵심 ${shown.length}단계, 전체 ${recipe.steps.length}단계는 블로그에` : `딱 ${shown.length}단계`}!`
        : `순서는 ${rest > 0 ? `핵심 ${shown.length}단계, 전체 ${recipe.steps.length}단계는 블로그에 정리했어요` : `딱 ${shown.length}단계`}!`,
      cardTitle: '조리 순서',
      cardItems: shown,
    });
  }

  const tip = recipe.tips[0];
  if (tip) {
    drafts.push({ type: 'tip', emotion: 'confident', line: `${BRAND.tipLead} ${spoken(tip)}`, cardTitle: BRAND.tipPhrase, cardItems: [tip] });
  }

  drafts.push({
    type: 'outro',
    emotion: 'joy',
    line: comedy ? '대성공! 저장하고 다음 실험에서 만나요!' : '저장하고 다음 실험에서 만나요!',
  });

  return {
    title: recipe.topic,
    scenes: drafts.map((d, i) => ({ id: `s${i + 1}`, ...d })),
  };
}

/** 한국어 TTS 기준 대략적인 길이(초). 실제 길이는 음성 생성 후 확정된다. */
export const CHARS_PER_SECOND = 7;
export function estimateSceneSeconds(scene: Pick<Scene, 'line'>): number {
  const chars = scene.line.replace(/\s/g, '').length;
  return Math.max(1.6, chars / CHARS_PER_SECOND + 0.5);
}
export function estimateScriptSeconds(script: Script): number {
  return script.scenes.reduce((sum, s) => sum + estimateSceneSeconds(s), 0);
}
