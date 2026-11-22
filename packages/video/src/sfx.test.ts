import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, buildStyledScript, generateTemplateScript } from '@mat-lab/recipe-core';
import { sfxCues, sfxSamples, sfxUrl } from './sfx.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

describe('효과음', () => {
  it('실제 녹음 효과음은 1초 안(장면에 둔 1초 칸)이고, 소리가 있고, 넘치지 않으며, 끝이 서서히 줄어든다', () => {
    for (const name of ['whoosh', 'ding', 'boing', 'pop'] as const) {
      const { samples: s, rate } = sfxSamples(name);
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(rate, name).toBe(22050);
      expect(s.length / rate, name).toBeLessThan(1);
      expect(peak, name).toBeGreaterThan(0.3);
      // 최대 -1dBFS로 맞췄다 (찢어지는 소리 없음)
      expect(peak, name).toBeLessThan(0.9);
      // 끝 20ms는 거의 무음 (뚝 끊기지 않게 줄여 놓음)
      const tail = s.subarray(s.length - Math.round(rate * 0.02)).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(tail, name).toBeLessThan(0.05);
    }
    expect(sfxUrl('ding')).toMatch(/^data:audio\/wav;base64,UklGR/);
  });

  it('효과음마다 출처·CC0 라이선스가 기록돼 있다 (상업 이용·출처 표기 의무 없음)', () => {
    const doc = fs.readFileSync(new URL('../assets/sfx/LICENSES.md', import.meta.url), 'utf8');
    for (const name of ['whoosh', 'ding', 'boing', 'pop']) {
      const row = doc.split('\n').find((l) => l.startsWith(`| \`${name}.wav\``));
      expect(row, name).toBeTruthy();
      expect(row, name).toContain('CC0');
      expect(row, name).toMatch(/https:\/\/freesound\.org\/people\/[^/]+\/sounds\/\d+/);
      expect(row, name).not.toMatch(/CC BY|BY-SA|NC|ND/);
    }
  });

  it('훅·실패·공개·서명에만 넣고, 영상당 4개 이하다', () => {
    const comedy = buildStyledScript(walnut, { style: 'comedy' }).script;
    const cues = sfxCues(comedy);
    expect(cues[0]).toMatchObject({ sceneId: comedy.scenes[0]!.id, name: 'boing' });
    expect(cues.some((c) => c.name === 'pop')).toBe(true);
    expect(cues.length).toBeLessThanOrEqual(4);
    // 템플릿 대본(연출 없음)에는 효과음이 없다
    expect(sfxCues(generateTemplateScript(walnut))).toEqual([]);
    // 흔한 실수가 있는 템플릿(김치전 문답형)은 실패 장면을 음식 클로즈업(설명용 연출)으로 보여 주므로, 그 장면에만 효과음 하나
    // (예전에는 맛조수가 실패 접시를 드는 기본 화면이었다. 맛조수는 실수하지 않는다: persona.ts lab-notes)
    for (const r of SAMPLE_RECIPES) {
      const script = generateTemplateScript(r);
      const failure = script.scenes.find((s) => s.type === 'mistake');
      expect(sfxCues(script), r.dishName).toEqual(failure ? [{ sceneId: failure.id, name: 'boing', offset: 2 }] : []);
    }
    expect(SAMPLE_RECIPES.filter((r) => generateTemplateScript(r).scenes.some((s) => s.type === 'mistake')).map((r) => r.dishName)).toEqual(['바삭한 김치전']);
  });
});
