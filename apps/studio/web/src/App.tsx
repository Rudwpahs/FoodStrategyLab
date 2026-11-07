import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BRAND } from '@mat-lab/recipe-core';
import { api, type AuthState, type Meta } from './api.ts';
import { LoginPage } from './pages/LoginPage.tsx';
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
  /** 로그인한 사람 (이 컴퓨터 전용 모드면 null) */
  user: AuthState['user'];
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
  const [auth, setAuth] = useState<AuthState | null>(null);
  const checkAuth = useCallback(() => api.me().then(setAuth).catch(() => setAuth({ mode: 'login', allowed: false, user: null })), []);
  useEffect(() => {
    checkAuth();
    const on = () => checkAuth();
    addEventListener('matlab:logged-out', on);
    return () => removeEventListener('matlab:logged-out', on);
  }, [checkAuth]);

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
    if (auth?.allowed) api.meta().then(setMeta).catch(() => undefined);
  }, [auth?.allowed]);

  if (!auth) return <div className="loading">스튜디오를 여는 중…</div>;
  if (!auth.allowed) return <LoginPage auth={auth} onLoggedIn={checkAuth} />;

  const project = hash.match(/^#\/p\/(\d+)/);
  let page: React.ReactNode;
  if (project) page = <ProjectPage key={project[1]} id={Number(project[1])} />;
  else if (hash.startsWith('#/new')) page = <NewProjectPage />;
  else if (hash.startsWith('#/character')) page = <CharacterPage />;
  else page = <ProjectList />;

  const tab = hash.startsWith('#/new') ? 'new' : hash.startsWith('#/character') ? 'character' : 'list';
  const logout = async () => {
    await api.logout().catch(() => undefined);
    checkAuth();
  };

  return (
    <AppContext.Provider value={{ notify, run, meta, user: auth.user }}>
      <header className="topbar">
        <a className="brand" href="#/" aria-label={`${BRAND.labName} 스튜디오 처음 화면`}>
          <LogoMark size={32} />
          <span>{BRAND.labName} 스튜디오</span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#/" className={tab === 'list' ? 'active' : ''} aria-current={tab === 'list' ? 'page' : undefined}>콘텐츠</a>
          <a href="#/new" className={tab === 'new' ? 'active' : ''} aria-current={tab === 'new' ? 'page' : undefined}>새로 만들기</a>
          <a href="#/character" className={tab === 'character' ? 'active' : ''} aria-current={tab === 'character' ? 'page' : undefined}>맛조수·목소리</a>
        </nav>
        {auth.user && (
          <div className="who">
            <span className="hide-mobile">{auth.user.displayName}</span>
            <button className="btn small ghost" onClick={logout}>로그아웃</button>
          </div>
        )}
      </header>
      <main>{page}</main>
      <nav className="tabbar" aria-label="주요 메뉴">
        <a href="#/" className={tab === 'list' ? 'active' : ''} aria-current={tab === 'list' ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
          콘텐츠
        </a>
        <a href="#/new" className={`make ${tab === 'new' ? 'active' : ''}`} aria-current={tab === 'new' ? 'page' : undefined}>
          <span className="bubble"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 6v12M6 12h12" /></svg></span>
          새로 만들기
        </a>
        <a href="#/character" className={tab === 'character' ? 'active' : ''} aria-current={tab === 'character' ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 3h6M10 3v5l-5 10a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3L14 8V3" /><path d="M7.5 15h9" /></svg>
          맛조수
        </a>
      </nav>
      <div aria-live="polite" role="status">
        {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
      </div>
    </AppContext.Provider>
  );
};
