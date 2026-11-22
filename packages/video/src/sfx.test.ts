import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, buildStyledScript, generateTemplateScript } from '@mat-lab/recipe-core';
import { sfxCues, sfxSamples, sfxUrl } from './sfx.ts';
import { synthPage } from '../../../tools/content-lab/synth-page.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

describe('효과음', () => {
  it('효과음(실제 녹음 4개 + 합성한 노트 소리)은 1초 안(장면에 둔 1초 칸)이고, 소리가 있고, 넘치지 않으며, 끝이 서서히 줄어든다', () => {
    for (const name of ['whoosh', 'ding', 'boing', 'pop', 'page'] as const) {
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
    // 노트 넘기는 소리는 이 저장소에서 합성했다 (외부 음원 없음)
    const page = doc.split('\n').find((l) => l.startsWith('| `page.wav`'));
    expect(page).toContain('CC0');
    expect(page).toContain('tools/content-lab/synth-page.ts');
  });

  it('노트 넘기는 소리: 넣어 둔 소리가 합성 코드로 다시 만든 소리와 같고, "탁"이 0.255초쯤에 온다 (노트 카드가 나타나는 때)', () => {
    const { samples, rate } = sfxSamples('page');
    const made = synthPage();
    expect(samples.length).toBe(made.length);
    // 16비트로 저장하며 생긴 반올림만큼만 다르다
    expect(samples.reduce((m, v, i) => Math.max(m, Math.abs(v - made[i]!)), 0)).toBeLessThan(1 / 16384);
    const win = Math.round(rate * 0.01);
    const loud: number[] = [];
    for (let i = 0; i + win <= samples.length; i += win) loud.push(Math.sqrt(samples.subarray(i, i + win).reduce((a, v) => a + v * v, 0) / win));
    const peakAt = (loud.indexOf(Math.max(...loud)) + 0.5) * 0.01;
    expect(peakAt).toBeGreaterThan(0.24);
    expect(peakAt).toBeLessThan(0.29);
  });

  it('훅·공개·서명에만 넣고(실패 장면은 개그처럼 들리지 않게 소리 없음), 영상당 4개 이하다', () => {
    const comedy = buildStyledScript(walnut, { style: 'comedy' }).script;
    const cues = sfxCues(comedy);
    // 첫 장면은 실패 연출이지만 훅이라 훅 소리. 훅이 아니면 실패 장면에는 소리가 없다
    expect(cues[0]).toMatchObject({ sceneId: comedy.scenes[0]!.id, name: 'whoosh' });
    expect(sfxCues({ ...comedy, scenes: comedy.scenes.map((s) => ({ ...s, hook: false })) }).some((c) => c.sceneId === comedy.scenes[0]!.id)).toBe(false);
    expect(cues.some((c) => c.name === 'pop')).toBe(true);
    expect(cues.length).toBeLessThanOrEqual(4);
    // 템플릿 대본(연출 없음)에는 효과음이 없다
    expect(sfxCues(generateTemplateScript(walnut))).toEqual([]);
    // 흔한 실수가 있는 템플릿(김치전 문답형)도 실패 장면에 개그 효과음을 넣지 않는다 (맛조수는 실수하지 않는다: persona.ts lab-notes)
    for (const r of SAMPLE_RECIPES) expect(sfxCues(generateTemplateScript(r)), r.dishName).toEqual([]);
    expect(SAMPLE_RECIPES.filter((r) => generateTemplateScript(r).scenes.some((s) => s.type === 'mistake')).map((r) => r.dishName)).toEqual(['바삭한 김치전']);
  });
});
