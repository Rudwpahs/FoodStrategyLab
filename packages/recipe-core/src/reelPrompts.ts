import { BRAND } from './brand.ts';
import { formatIngredient } from './format.ts';
import type { RecipeInput, Scene, Script } from './types.ts';

/**
 * 선택 기능: 이미지·영상 생성 AI(ChatGPT 이미지, Gemini 영상 등)로 장면을 만들고 싶을 때 쓰는 프롬프트 묶음.
 * NMXWZ 'AI Reel in 3 Prompts' 방식(캐릭터 시트 → 장면 첫 프레임 → 영상)을 우리 브랜드에 맞춰 자동으로 채운다.
 * 스튜디오의 3D 영상은 이 프롬프트 없이도 만들어진다.
 */
export const STYLE_LINE = 'Simple low-poly 3D, PS1 game look, flat-shaded, warm soft light. NOT anime, NOT Pixar, NOT realistic.';
const END = 'No text, no labels, no watermark.';

export const CHARACTER_DESCRIPTION =
  'MATJOSU, a cute lab-assistant mascot: a round steamed-bun shaped cream-white body (no neck), a tall white chef hat with a red band and small mint-green round goggles on the hat, ' +
  'big black dot eyes, pink blush cheeks, small mouth, a tomato-red apron covering the lower body with a pocket showing a tiny flask icon, short stubby cream arms with round hands, small navy feet. ' +
  'About 1 m tall, stands on a small wooden step stool.';

export const ENVIRONMENT_DESCRIPTION =
  'A cozy home-style cooking lab kitchen: warm wood plank floor, white wainscot panel wall with cream upper wall, a window with soft daylight on the left, ' +
  'a long mint-green cabinet counter with a light wood top, a two-burner gas stove with black grates, a wooden shelf with spice jars (brown, beige, mint, red, yellow), ' +
  'hanging utensils, a white fridge on the right, a small wooden step stool in front of the stove.';

const VOICE_LOCK = 'VOICE LOCK: MATJOSU speaks Korean in a bright, friendly, slightly fast young voice, curious and a little hasty, warm and clear pronunciation.';
const STYLE_LOCK = `STYLE LOCK: keep the exact low-poly flat-shaded style and the exact MATJOSU design from the image (cream body, white chef hat with red band, mint goggles, red apron). Do not morph into another style.`;

const SHOT: Record<Scene['type'], string> = {
  intro: 'Wide shot of the whole kitchen, MATJOSU on the step stool waving at the camera.',
  question: 'Medium shot of MATJOSU facing the camera, one hand raised as if asking a question.',
  mistake: 'Medium shot, MATJOSU holding a plate with a pale, soggy failed dish, looking embarrassed.',
  explain: 'Over-the-shoulder high-angle shot looking down at the pan or pot on the stove, MATJOSU cooking with a spatula.',
  ingredients: 'Close shot of the counter with the ingredients neatly lined up in small bowls, bottles and jars.',
  steps: 'Over-the-shoulder high-angle shot of the stove, blue gas flame on, MATJOSU cooking step by step.',
  tip: 'Close-up of the finished dish on a white plate on the counter, light steam rising.',
  outro: 'Medium shot, MATJOSU proudly holding the finished dish toward the camera, happy.',
};

const EMOTION_EN: Record<Scene['emotion'], string> = {
  joy: 'happy, closed smiling eyes',
  embarrassed: 'embarrassed, squeezed eyes, a sweat drop',
  curious: 'curious, one eyebrow raised',
  confident: 'confident, half-closed eyes, smirk',
  surprised: 'surprised, wide round eyes, open mouth',
  disappointed: 'disappointed, droopy eyes, small frown',
};

export interface ReelPromptPack {
  characterSheet: string;
  environment: string;
  clips: { file: string; frameFile: string; framePrompt: string; videoPrompt: string; line: string }[];
  /** 전체를 한 문서로 (게시 묶음에 prompts.md로 들어감) */
  markdown: string;
}

export function buildReelPromptPack(recipe: RecipeInput, script: Script): ReelPromptPack {
  const dish = recipe.dishName || recipe.topic;
  const characterSheet = `${STYLE_LINE}
CHARACTER SHEET (wide 16:9): ${CHARACTER_DESCRIPTION}
Show front, 3/4, side and back views at the same scale, plus 6 face close-ups: happy, embarrassed, curious, confident, surprised, disappointed.
Simple shapes and colours. Plain dark grey background. ${END}`;

  const environment = `${STYLE_LINE}
ENVIRONMENT (vertical 9:16): ${ENVIRONMENT_DESCRIPTION}
NO characters. Keep the top 25% of the frame empty (plain wall) for captions. ${END}`;

  const food = `The dish is ${dish}. Ingredients: ${recipe.ingredients.map(formatIngredient).join(', ')}.`;
  const clips = script.scenes.map((scene, i) => {
    const n = i + 1;
    const framePrompt = `Use image 1 for MATJOSU and image 2 for the kitchen. Keep their designs and style exactly the same.
${STYLE_LINE}
${SHOT[scene.type]} MATJOSU looks ${EMOTION_EN[scene.emotion]}. ${food}
Keep the top 25% of the frame empty for captions. Vertical 9:16. ${END}`;
    const videoPrompt = `${STYLE_LOCK}
${VOICE_LOCK}
Camera: slow gentle push-in. Action: ${SHOT[scene.type]}
MATJOSU says, in Korean, exactly this line and nothing else: "${scene.line}"
Sounds: soft kitchen ambience${scene.type === 'steps' || scene.type === 'explain' ? ', sizzling pan, gas flame' : ''}${scene.type === 'tip' ? ', gentle steam' : ''}.
Do not add or change any words, ingredients or amounts. No music. No subtitles, no on-screen text.`;
    return { file: `clip${n}.mp4`, frameFile: `frame${n}.png`, framePrompt, videoPrompt, line: scene.line };
  });

  const md = [
    `# AI 영상 프롬프트 팩 — ${dish}`,
    '',
    `${BRAND.labName} · 승인된 대본으로 자동 생성. 이미지·영상 AI는 서비스마다 무료 사용량이 다르고 유료일 수 있습니다.`,
    '생성된 영상이 대사를 바꾸거나 재료·분량을 다르게 보여주면 쓰지 말고 다시 만드세요. (검수된 내용만 공개)',
    '',
    '## 1. 캐릭터 시트 (ChatGPT 이미지 · 가로 16:9 · sheet-MATJOSU.png)',
    '',
    '```',
    characterSheet,
    '```',
    '',
    '## 2. 주방 배경 (ChatGPT 이미지 · 세로 9:16 · environment.png)',
    '',
    '```',
    environment,
    '```',
    '',
    '## 3. 장면별 첫 프레임(A) → 영상(B)',
    '',
    ...clips.flatMap((c, i) => [
      `### 장면 ${i + 1}: ${c.line}`,
      '',
      `A · 첫 프레임 (ChatGPT, 시트와 배경 이미지를 함께 올리기 · ${c.frameFile})`,
      '',
      '```',
      c.framePrompt,
      '```',
      '',
      `B · 영상 (${c.frameFile}에서 시작 · ${c.file})`,
      '',
      '```',
      c.videoPrompt,
      '```',
      '',
    ]),
  ].join('\n');

  return { characterSheet, environment, clips, markdown: md };
}
