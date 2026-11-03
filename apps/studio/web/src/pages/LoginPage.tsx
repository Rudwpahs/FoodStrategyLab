import React, { useState } from 'react';
import { BRAND } from '@mat-lab/recipe-core';
import { api, type AuthState } from '../api.ts';
import { LogoMark } from '../components/LogoMark.tsx';

/** 로그인 화면. 계정이 없으면 스튜디오 PC에서만 쓸 수 있다고 안내한다. */
export const LoginPage: React.FC<{ auth: AuthState; onLoggedIn: () => void }> = ({ auth, onLoggedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card stack" style={{ width: '100%', maxWidth: 380 }}>
        <div className="row" style={{ gap: 10 }}>
          <LogoMark size={40} />
          <b style={{ fontSize: 20 }}>{BRAND.labName} 스튜디오</b>
        </div>
        {auth.mode === 'local' ? (
          <div className="issue warning">
            아직 계정이 없어 스튜디오 PC에서만 쓸 수 있어요. 스튜디오 PC에서 <code>npm run user:add -- 아이디 이름</code>으로 계정을 만든 뒤 다시 열어 주세요.
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api.login(username, password);
                setPassword('');
                onLoggedIn();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              아이디
              <input type="text" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="field">
              비밀번호
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="issue error">{error}</div>}
            <button className="btn primary" disabled={busy}>
              {busy ? '확인 중…' : '로그인'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
