import React, { useState } from 'react';

/** 접힌 상자. 펼쳤을 때만 안쪽을 그린다 (안 쓰는 기능이 서버를 부르거나 화면을 길게 만들지 않게) */
export const Fold: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <details className="card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{title}</summary>
      {open && (
        <div className="stack" style={{ marginTop: 12 }}>
          {children}
        </div>
      )}
    </details>
  );
};
