import React, { useEffect, useState } from 'react';
import { api, type AuthState } from '../api.ts';
import { useApp } from '../App.tsx';

type User = NonNullable<AuthState['user']>;

/**
 * 계정: 내 비밀번호 바꾸기, 도와주는 사람 계정 추가, 연구자 계정 정하기.
 * 클라우드 서버에는 명령창이 없어서 이 화면에서 한다.
 */
export const AccountPage: React.FC = () => {
  const { run, user, researcherSet, checkAuth } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nu, setNu] = useState({ username: '', displayName: '', password: '' });

  const load = () => void api.users().then((r) => setUsers(r.users), () => setUsers([]));
  useEffect(load, []);

  if (!user) return <div className="card empty">이 PC 전용 모드에서는 계정을 쓰지 않아요.</div>;
  const canAdd = !researcherSet || user.role === 'researcher';

  return (
    <div className="stack">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>내 계정</h2>
        <div>
          {user.displayName} ({user.username}) · {user.role === 'researcher' ? <span className="badge approved">연구자 계정</span> : <span className="badge">일반 계정</span>}
        </div>
        {!researcherSet && (
          <div className="issue warning">
            연구자 계정이 아직 정해지지 않아 누구나 승인할 수 있어요. 이희재 연구자 본인 계정이면 정해 주세요 (한 번만 정할 수 있어요).
            <div>
              <button
                className="btn small"
                onClick={async () => {
                  if (!confirm(`'${user.displayName}' 계정을 연구자 계정으로 정할까요? 정한 뒤에는 이 계정만 승인할 수 있어요.`)) return;
                  if (await run(() => api.claimResearcher(), '연구자 계정으로 정했어요')) {
                    checkAuth();
                    load();
                  }
                }}
              >
                이 계정을 연구자 계정으로 정하기
              </button>
            </div>
          </div>
        )}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api.changePassword(current, next), '비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요')) {
              setCurrent('');
              setNext('');
            }
          }}
        >
          <b>비밀번호 바꾸기</b>
          <label className="field">
            지금 비밀번호
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label className="field">
            새 비밀번호 (10자 이상)
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
          </label>
          <button className="btn">비밀번호 바꾸기</button>
        </form>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>계정 목록</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {users.map((u) => (
            <li key={u.id}>
              {u.displayName} ({u.username}){u.role === 'researcher' ? ' · 연구자' : ''}
            </li>
          ))}
        </ul>
        {canAdd ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api.addUser(nu), `'${nu.displayName || nu.username}' 계정을 만들었어요`)) {
                setNu({ username: '', displayName: '', password: '' });
                load();
              }
            }}
          >
            <b>도와주는 사람 계정 추가</b>
            <div className="muted small">일반 계정은 콘텐츠를 만들고 고칠 수 있지만, 연구자 계정이 정해져 있으면 승인은 할 수 없어요.</div>
            <label className="field">
              이름
              <input type="text" value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} required />
            </label>
            <label className="field">
              아이디 (영문·숫자 3자 이상)
              <input type="text" autoCapitalize="none" autoComplete="off" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} required />
            </label>
            <label className="field">
              처음 비밀번호 (10자 이상, 알려 준 뒤 바꾸게 하세요)
              <input type="password" autoComplete="new-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required minLength={10} />
            </label>
            <button className="btn">계정 만들기</button>
          </form>
        ) : (
          <div className="muted small">계정 추가는 연구자 계정만 할 수 있어요.</div>
        )}
      </div>
    </div>
  );
};
