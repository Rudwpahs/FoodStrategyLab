import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import fontUrl from 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2';
import './styles.css';

const font = new FontFace('Pretendard', `url(${fontUrl}) format('woff2')`, { weight: '45 920' });
font.load().then((f) => document.fonts.add(f)).catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
