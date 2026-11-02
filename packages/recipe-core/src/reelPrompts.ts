import { BRAND } from './brand.ts';
import { formatIngredient } from './format.ts';
import type { RecipeInput, Scene, Script } from './types.ts';
import { estimateSceneSeconds } from './generator/template.ts';

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

/** 생성 영상 한 편 길이(초)와 한 클립에 넣는 최대 대사 수 (PDF 규칙: 약 8초, 대사 2줄 이하) */
export const CLIP_SECONDS = 8;
export const CLIP_MAX_LINES = 2;

/** 이어진 장면을 약 8초 클립으로 묶는다. 결과: 클립별 장면 id 목록 */
export function clipGroups(script: Script): string[][] {
  const groups: string[][] = [];
  let cur: string[] = [];
  let secs = 0;
  for (const scene of script.scenes) {
    const s = estimateSceneSeconds(scene);
    if (cur.length && (secs + s > CLIP_SECONDS || cur.length >= CLIP_MAX_LINES)) {
      groups.push(cur);
      cur = [];
      secs = 0;
    }
    cur.push(scene.id);
    secs += s;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export interface ReelPromptPack {
  characterSheet: string;
  environment: string;
  clips: { file: string; frameFile: string; framePrompt: string; videoPrompt: string; line: string; sceneIds: string[] }[];
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
  const byId = new Map(script.scenes.map((sc) => [sc.id, sc]));
  const clips = clipGroups(script).map((ids, i) => {
    const n = i + 1;
    const scenes = ids.map((id) => byId.get(id)!);
    const first = scenes[0]!;
    const framePrompt = `Use image 1 for MATJOSU and image 2 for the kitchen. Keep their designs and style exactly the same.
${STYLE_LINE}
${SHOT[first.type]} MATJOSU looks ${EMOTION_EN[first.emotion]}. ${food}
Keep the top 25% of the frame empty for captions. Vertical 9:16. ${END}`;
    const lines = scenes.map((sc) => `"${sc.line}"`).join(' then ');
    const actions = scenes.map((sc, k) => `${k === 0 ? '' : 'Then: '}${SHOT[sc.type]} (${EMOTION_EN[sc.emotion]})`).join(' ');
    const cooking = scenes.some((sc) => sc.type === 'steps' || sc.type === 'explain');
    const videoPrompt = `${STYLE_LOCK}
${VOICE_LOCK}
About ${CLIP_SECONDS} seconds. Camera: slow gentle push-in. Action: ${actions}
MATJOSU says, in Korean, exactly these lines and nothing else: ${lines}
Sounds: soft kitchen ambience${cooking ? ', sizzling pan, gas flame' : ''}${scenes.some((sc) => sc.type === 'tip') ? ', gentle steam' : ''}.
Do not add or change any words, ingredients or amounts. No music. No subtitles, no on-screen text.`;
    return { file: `clip${n}.mp4`, frameFile: `frame${n}.png`, framePrompt, videoPrompt, line: scenes.map((sc) => sc.line).join(' / '), sceneIds: ids };
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
    `## 3. 클립별 첫 프레임(A) → 영상(B) (약 ${CLIP_SECONDS}초, 대사 ${CLIP_MAX_LINES}줄 이하)`,
    '',
    '- 같은 채팅에서 이어서 만들고, 매번 캐릭터 시트와 주방 배경 이미지를 함께 올리세요.',
    '- 첫 프레임이 마음에 들 때만 영상으로 만드세요 (이미지 먼저, 영상은 그다음).',
    '- 다 만든 클립은 스튜디오 [영상 제작] 단계에서 클립 번호에 맞춰 올리면, 검수된 목소리·자막·브랜드가 입혀집니다.',
    '',
    ...clips.flatMap((c, i) => [
      `### 클립 ${i + 1}: ${c.line}`,
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
