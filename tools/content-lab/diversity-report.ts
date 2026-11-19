/**
 * 견본 여러 편(render-sample 결과 폴더들)의 stories.json을 모아 대본 다양성을 잰다.
 * 실행: npx tsx tools/content-lab/diversity-report.ts 결과폴더 [결과폴더 …] > report.md
 * 폴더 안의 하위 폴더까지 찾아 stories.json을 모두 읽는다 (만든 영상 외에 고르지 않은 대본도 포함).
 */
import fs from 'node:fs';
import path from 'node:path';
import { AUDIENCE_INFO, STORY_TYPE_INFO, storyDiversity, type Audience, type DiversityItem, type Script, type StoryType } from '@mat-lab/recipe-core';

function find(dir: string, name: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) find(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

const items: (DiversityItem & { picked: boolean; title: string })[] = [];
for (const root of process.argv.slice(2)) {
  for (const file of find(root, 'stories.json')) {
    const dir = path.dirname(file);
    const summary = fs.existsSync(path.join(dir, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')) : {};
    const stories = JSON.parse(fs.readFileSync(file, 'utf8')) as ({ error: string } | { storyType: StoryType; audience?: Audience; script: Script })[];
    for (const st of stories) {
      if ('error' in st) continue;
      items.push({ dish: summary.dish ?? path.basename(dir), storyType: st.storyType, audience: st.audience, script: st.script, picked: summary.title === st.script.title, title: st.script.title });
    }
  }
}
if (!items.length) {
  console.error('stories.json을 찾지 못했어요');
  process.exit(1);
}
const r = storyDiversity(items);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const label = (k: string, map: Record<string, { label: string }>) => map[k]?.label ?? k;
const lines = [
  `# 대본 다양성 보고 (${items.length}편, 요리 ${new Set(items.map((i) => i.dish)).size}가지)`,
  '',
  `- 첫 대사가 서로 다른 비율: **${pct(r.uniqueFirstLines)}**`,
  `- 같은 첫 어절 반복: ${r.repeatedOpenings.length ? r.repeatedOpenings.map((o) => `"${o.word}" ${o.count}번`).join(', ') : '없음'}`,
  `- 대본끼리 문장 겹침(0~1): 평균 **${r.similarity.mean}**, 최대 ${r.similarity.max} · 많이 겹치는 쌍(0.35 초과) ${r.similarity.similarPairs.length}개`,
  `- 첫 대사 길이(공백 제외): ${r.firstLineChars.min}~${r.firstLineChars.max}자, 평균 ${r.firstLineChars.mean}자`,
  `- 예전 반복 문구가 들어간 대본: ${r.bannedHits}편`,
  `- 이야기 갈래: ${Object.entries(r.storyTypes).map(([k, n]) => `${label(k, STORY_TYPE_INFO)} ${n}`).join(', ')}`,
  `- 시청 대상: ${Object.entries(r.audiences).map(([k, n]) => `${label(k, AUDIENCE_INFO)} ${n}`).join(', ')}`,
  `- 무대(장면 수): ${Object.entries(r.places).map(([k, n]) => `${k} ${n}`).join(', ')}`,
  '',
  '## 대본별 첫 대사',
  '',
  '| 요리 | 대상 | 갈래 | 제목 | 첫 대사 | 영상 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...items.map((i) => `| ${i.dish} | ${i.audience ? AUDIENCE_INFO[i.audience as Audience].short : '-'} | ${label(i.storyType ?? '', STORY_TYPE_INFO)} | ${i.title} | ${i.script.scenes[0]?.line ?? ''} | ${i.picked ? '✓' : ''} |`),
  ...(r.similarity.similarPairs.length ? ['', '## 많이 겹치는 쌍', '', ...r.similarity.similarPairs.map((p) => `- ${items[p.a]!.dish} "${items[p.a]!.title}" ↔ ${items[p.b]!.dish} "${items[p.b]!.title}": ${p.score}`)] : []),
];
console.log(lines.join('\n'));
