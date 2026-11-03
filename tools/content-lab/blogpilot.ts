import fs from 'node:fs';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { buildBlogPost, buildExpertBlog, lintBlog, questionsFor } from '@mat-lab/publishing';
const w = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const dir = 'docs/research/content-strategy/samples';
// 승인 전 상태로 만든다 (실제 승인 기록이 없으므로)
const A = buildBlogPost({ recipe: w, review: null });
const B = buildExpertBlog({ recipe: w, style: 'expert-note', notes: { answers: {} }, review: null });
fs.writeFileSync(`${dir}/walnut-blog-A-auto.md`, A.markdown);
fs.writeFileSync(`${dir}/walnut-blog-B-expert-note.md`, B.markdown);
const q = questionsFor('expert-note');
console.log(JSON.stringify({
  A: { chars: A.markdown.length, lint: lintBlog(A.markdown, { dish: '호두정과' }) },
  B: { chars: B.markdown.length, pending: B.pending.map((p) => p.question), blockers: B.blockers, lint: lintBlog(B.markdown, { dish: '호두정과' }), optional: q.optional.map((x) => x.question) },
}, null, 1));
