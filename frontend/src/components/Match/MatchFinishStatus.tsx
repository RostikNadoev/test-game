type MatchFinishStatusProps = {
  pending: boolean;
  error: string | null;
  onDismiss?: () => void;
};

export function MatchFinishStatus({ pending, error, onDismiss }: MatchFinishStatusProps) {
  if (!pending && !error) return null;

  return (
    <div
      role="status"
      className="match-finish-status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        zIndex: 60,
        width: 'min(92vw, 420px)',
        padding: '12px 14px',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,.14)',
        background: 'rgba(8, 12, 24, .92)',
        color: '#fff',
        boxShadow: '0 12px 32px rgba(0,0,0,.35)',
        fontSize: '13px',
        lineHeight: 1.4,
      }}
    >
      {pending ? (
        <p style={{ margin: 0 }}>Ожидаем подтверждение второго игрока…</p>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          <p style={{ margin: 0 }}>{error}</p>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              style={{
                justifySelf: 'start',
                border: 0,
                borderRadius: '10px',
                padding: '6px 10px',
                background: 'rgba(255,255,255,.12)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Закрыть
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
