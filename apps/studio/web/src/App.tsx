import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BRAND } from '@mat-lab/recipe-core';
import { api, type Meta } from './api.ts';
import { CharacterPage } from './pages/CharacterPage.tsx';
import { NewProjectPage } from './pages/NewProjectPage.tsx';
import { ProjectList } from './pages/ProjectList.tsx';
import { ProjectPage } from './pages/ProjectPage.tsx';
import { LogoMark } from './components/LogoMark.tsx';

type Toast = { text: string; error?: boolean } | null;
interface Ctx {
  notify: (text: string, error?: boolean) => void;
  /** 비동기 작업을 실행하고 오류를 알림으로 보여준다 */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
  meta: Meta | null;
}
const AppContext = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppContext);

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function navigate(to: string) {
  location.hash = to;
}

export const App: React.FC = () => {
  const hash = useHash();
  const [toast, setToast] = useState<Toast>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), error ? 6000 : 2600);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string) => {
      try {
        const r = await fn();
        if (success) notify(success);
        return r;
      } catch (e) {
        notify((e as Error).message, true);
        return undefined;
      }
    },
    [notify],
  );

  useEffect(() => {
    api.meta().then(setMeta).catch(() => undefined);
  }, []);

  const project = hash.match(/^#\/p\/(\d+)/);
  let page: React.ReactNode;
  if (project) page = <ProjectPage key={project[1]} id={Number(project[1])} />;
  else if (hash.startsWith('#/new')) page = <NewProjectPage />;
  else if (hash.startsWith('#/character')) page = <CharacterPage />;
  else page = <ProjectList />;

  return (
    <AppContext.Provider value={{ notify, run, meta }}>
      <header className="topbar">
        <a className="brand" href="#/">
          <LogoMark size={34} />
          <span>
            {BRAND.labName} 스튜디오 <small>· 개인용 프로토타입</small>
          </span>
        </a>
        <nav>
          <a href="#/" className={!project && hash === '#/' ? 'active' : ''}>콘텐츠 목록</a>
          <a href="#/new" className={hash.startsWith('#/new') ? 'active' : ''}>새 콘텐츠</a>
          <a href="#/character" className={hash.startsWith('#/character') ? 'active' : ''}>캐릭터·목소리</a>
        </nav>
      </header>
      <main>{page}</main>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </AppContext.Provider>
  );
};
