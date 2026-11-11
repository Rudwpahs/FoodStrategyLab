import React from 'react';

/** 진행 확인 요청이 실패하고 있을 때 보이는 안내 (확인은 자동으로 계속한다) */
export const ConnectionNote: React.FC<{ failures: number }> = ({ failures }) =>
  failures > 0 ? (
    <div className="muted small">
      연결 확인 중… 잠시 뒤 자동으로 다시 확인해요.{failures >= 3 ? ' 인터넷 연결을 확인해 주세요. 서버에서는 작업이 계속되고 있어요.' : ''}
    </div>
  ) : null;
