import type { Ingredient } from './types.ts';

export function formatIngredient(i: Ingredient): string {
  return i.amount ? `${i.name} ${i.amount}` : i.name;
}

/** 첫 문장만 잘라낸다 (대사 길이 조절용). */
export function firstSentence(text: string): string {
  const m = text.trim().match(/^[\s\S]*?[.!?。](?=\s|$)/);
  return (m ? m[0] : text).trim();
}

/** 문장 단위로 나눈다. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
