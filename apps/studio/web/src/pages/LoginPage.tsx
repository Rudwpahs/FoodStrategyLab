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
  const setup = auth.mode === 'setup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (setup && password !== password2) {
      setError('비밀번호 두 칸이 서로 달라요.');
      return;
    }
    setBusy(true);
    try {
      if (setup) await api.setup({ code, username, displayName, password });
      else await api.login(username, password);
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
            {setup && (
              <>
                <div className="issue info">처음 한 번만 계정을 만들어요. 설정 코드는 서버를 준비할 때 정한 값이에요.</div>
                <label className="field">
                  설정 코드
                  <input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} required />
                </label>
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
              비밀번호{setup && ' (10자 이상)'}
              <input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup ? 10 : undefined} />
            </label>
            {setup && (
              <label className="field">
                비밀번호 한 번 더
                <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </label>
            )}
            {error && <div className="issue error" role="alert">{error}</div>}
            <button className="btn primary big block" disabled={busy}>
              {busy ? '확인 중…' : setup ? '계정 만들고 시작하기' : '로그인'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
