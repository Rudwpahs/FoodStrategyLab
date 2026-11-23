import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LETTER_FICTION, LETTER_REAL, type Scene } from '@mat-lab/recipe-core';
import { SceneCard } from './components/SceneCard.tsx';
import { cardHeadline } from './realFootage.ts';

const letter = (cardTitle: string, cardItems?: string[]): Scene => ({ id: 's2', type: 'question', emotion: 'curious', line: '오늘 사연은 명절 전날 부엌에서 왔어요.', cardTitle, ...(cardItems ? { cardItems } : {}) });
const html = (scene: Scene) => renderToStaticMarkup(React.createElement(SceneCard, { scene, topic: '김치전', frame: 30, fps: 30, reviewed: false }));

describe('사연 카드 (편지 모양)', () => {
  it('가상 사연: 이름표와 꾸민 이야기라는 한 줄이 보이고, 글은 대사', () => {
    const out = html(letter(LETTER_FICTION));
    expect(out).toContain(LETTER_FICTION);
    expect(out).toContain('꾸민 이야기');
    expect(out).toContain('명절 전날 부엌');
    expect(out).not.toContain('Q. ');
  });

  it('선생님이 받은 질문: 카드 글은 답변 원문(카드 항목)이고, 꾸민 이야기 표시는 없다', () => {
    const out = html(letter(LETTER_REAL, ['반죽을 미리 만들면 왜 질어지냐는 질문']));
    expect(out).toContain(LETTER_REAL);
    expect(out).toContain('반죽을 미리 만들면');
    expect(out).not.toContain('꾸민 이야기');
  });

  it('위쪽 카드 글(실제 촬영 화면·첫 화면 판단)도 같은 글', () => {
    expect(cardHeadline(letter(LETTER_FICTION), '김치전')).toBe('오늘 사연은 명절 전날 부엌에서 왔어요.');
    expect(cardHeadline(letter(LETTER_REAL, ['답변 원문']), '김치전')).toBe('답변 원문');
  });

  it('보통 질문 카드는 그대로', () => {
    expect(html({ ...letter('오늘의 질문'), hook: true })).toContain('Q. ');
  });
});
