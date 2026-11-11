import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { DB_FILE } from './config.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';

/** 파일럿 샘플 3개를 넣는다 (검수 전 상태). */
const repo = new Repo(openDb(DB_FILE));
const existing = new Set(repo.listProjects().map((p) => p.topic));
for (const recipe of SAMPLE_RECIPES) {
  if (existing.has(recipe.topic)) continue;
  const id = repo.createProject(recipe);
  repo.addScriptVersion(id, generateTemplateScript(recipe), 'template');
  console.log(`샘플 추가: #${id} ${recipe.topic}`);
}
console.log('완료');
