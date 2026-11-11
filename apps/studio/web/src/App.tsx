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
  // 로그인 확인 요청 자체가 실패했을 때(연결 끊김·서버 깨어나는 중): 로그인 화면으로 착각시키지 않는다
  const [authError, setAuthError] = useState('');
  const checkAuth = useCallback(
    () =>
      api.me().then(
        (a) => {
          setAuth(a);
          setAuthError('');
        },
        (e: Error) => setAuthError(e.message),
      ),
    [],
  );
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
    // 실패하면 meta가 비어 있고, 화면은 '모름'으로 다룬다 (목소리 엔진이 없다고 단정하지 않음)
    if (auth?.allowed) api.meta().then(setMeta).catch(() => undefined);
  }, [auth?.allowed]);

  if (authError && !auth?.allowed) {
    return (
      <div className="empty stack" style={{ alignItems: 'center' }}>
        <div>스튜디오에 연결하지 못했어요.</div>
        <div className="small">{authError}</div>
        <button className="btn primary" onClick={() => void checkAuth()}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!auth) return <div className="empty">불러오는 중…</div>;
  if (!auth.allowed) return <LoginPage auth={auth} onLoggedIn={checkAuth} />;

  const project = hash.match(/^#\/p\/(\d+)/);
  let page: React.ReactNode;
  if (project) page = <ProjectPage key={project[1]} id={Number(project[1])} />;
  else if (hash.startsWith('#/new')) page = <NewProjectPage />;
  else if (hash.startsWith('#/character')) page = <CharacterPage />;
  else page = <ProjectList />;

  return (
    <AppContext.Provider value={{ notify, run, meta, user: auth.user }}>
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
          {auth.user && (
            <button
              className="btn small ghost"
              title={`${auth.user.displayName} 로그아웃`}
              onClick={async () => {
                await run(() => api.logout());
                void checkAuth();
              }}
            >
              로그아웃
            </button>
          )}
        </nav>
      </header>
      <main>{page}</main>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </AppContext.Provider>
  );
};
