import React, { useEffect, useId, useRef } from 'react';

/**
 * 아래에서 올라오는 확인창 (PC에서는 가운데 창). Esc·바깥 누르기·[닫기]로 닫는다.
 * 열리면 첫 입력칸(없으면 닫기 버튼)으로 초점을 옮기고, 닫히면 연 버튼으로 돌려준다.
 */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; busy?: boolean }> = ({ title, onClose, children, busy }) => {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('textarea, input:not([type=checkbox]), input[type=checkbox]') ?? ref.current?.querySelector<HTMLElement>('button');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) close.current();
    };
    addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="btn small ghost" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
