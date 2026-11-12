import React, { useState } from 'react';
import { BRAND } from '@mat-lab/recipe-core';
import { api, type AuthState } from '../api.ts';
import { LogoMark } from '../components/LogoMark.tsx';

/**
 * 로그인 화면.
 * - 계정이 있으면 로그인
 * - 클라우드 서버에 계정이 아직 없으면(setup) 설정 코드로 첫 계정을 만든다
 * - 그 밖에 계정이 없으면 스튜디오 PC에서만 쓸 수 있다고 안내한다
 */
export const LoginPage: React.FC<{ auth: AuthState; onLoggedIn: () => void }> = ({ auth, onLoggedIn }) => {
  const [username, setUsername] = useState(auth.mode === 'setup' ? 'heejae' : '');
  const [displayName, setDisplayName] = useState('이희재');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 첫 계정은 보통 연구자 본인이다. 연구자 계정이 있으면 승인은 연구자 계정만 할 수 있다
  const [researcher, setResearcher] = useState(true);
  // 비밀번호를 잊었을 때: 설정 코드로 새 비밀번호 정하기
  const [reset, setReset] = useState(false);
  const setup = auth.mode === 'setup';
  const withCode = setup || reset;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (withCode && password !== password2) {
      setError('비밀번호 두 칸이 서로 달라요.');
      return;
    }
    setBusy(true);
    try {
      if (setup) await api.setup({ code, username, displayName, password, researcher });
      else if (reset) {
        await api.resetPassword({ code, username, password });
        await api.login(username, password);
      } else await api.login(username, password);
      setPassword('');
      setPassword2('');
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="card stack login-card">
        <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
          <LogoMark size={44} />
          <div>
            <h1 className="login-title">{BRAND.labName} 스튜디오</h1>
            <div className="muted small">{auth.mode === 'local' ? '계정을 먼저 만들어야 해요' : setup ? '처음 한 번, 계정을 만들어요' : '로그인하고 이어서 작업하세요'}</div>
          </div>
        </div>
        {auth.mode === 'local' ? (
          <div className="issue warning">
            아직 계정이 없어 스튜디오 PC에서만 쓸 수 있어요. 스튜디오 PC에서 <code>npm run user:add -- 아이디 이름</code>으로 계정을 만든 뒤 다시 열어 주세요.
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            {reset && <div className="issue info">설정 코드(서버를 준비할 때 정한 값)를 알면 새 비밀번호를 정할 수 있어요. 그 계정의 다른 기기 로그인은 모두 끊겨요.</div>}
            {withCode && (
              <label className="field">
                설정 코드
                <input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} required />
              </label>
            )}
            {setup && (
              <>
                <div className="issue info">처음 한 번만 계정을 만들어요. 설정 코드는 서버를 준비할 때 정한 값이에요.</div>
                <label className="field">
                  이름 (승인 기록에 남아요)
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </label>
              </>
            )}
            <label className="field">
              아이디{setup && ' (영문·숫자)'}
              <input type="text" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="field">
              {reset ? '새 비밀번호' : '비밀번호'}{withCode && ' (10자 이상)'}
              <input type="password" autoComplete={withCode ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={withCode ? 10 : undefined} />
            </label>
            {withCode && (
              <label className="field">
                비밀번호 한 번 더
                <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </label>
            )}
            {setup && (
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={researcher} onChange={(e) => setResearcher(e.target.checked)} />
                연구자 본인 계정이에요 (이 계정만 승인할 수 있어요)
              </label>
            )}
            {error && <div className="issue error" role="alert">{error}</div>}
            <button className="btn primary big block" disabled={busy}>
              {busy ? '확인 중…' : setup ? '계정 만들고 시작하기' : reset ? '새 비밀번호로 바꾸고 로그인' : '로그인'}
            </button>
            {!setup && auth.canReset && (
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  setReset(!reset);
                  setError('');
                  setPassword('');
                  setPassword2('');
                }}
              >
                {reset ? '로그인으로 돌아가기' : '비밀번호를 잊었어요'}
              </button>
            )}
            {!setup && !auth.canReset && <div className="muted small">비밀번호를 잊었으면 서버를 관리하는 사람에게 부탁해 주세요.</div>}
          </form>
        )}
      </div>
    </div>
  );
};
