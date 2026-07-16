import { useAuth } from '../auth/useAuth';

const getInitials = (value: string) =>
  value
    .replace('@', '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TG';

const ProfilePill = ({
  name,
  photoUrl,
  value,
  tone,
}: {
  name: string;
  photoUrl?: string;
  value: string;
  tone: 'mint' | 'gold';
}) => (
  <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.08] bg-black/20 p-1.5 pr-3 backdrop-blur-lg">
    <div
      className={[
        'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] font-black uppercase',
        tone === 'mint'
          ? 'border-[#52FFE5]/35 bg-[#52FFE5]/12 text-[#52FFE5]'
          : 'border-[#F2C766]/35 bg-[#F2C766]/12 text-[#F2C766]',
      ].join(' ')}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        getInitials(name)
      )}
    </div>
    <div className="min-w-0">
      <div className="max-w-[86px] truncate text-[9px] font-black leading-none text-white/70">{name}</div>
      <div
        className={[
          'mt-1 text-[11px] font-black leading-none tabular-nums',
          tone === 'mint' ? 'text-[#52FFE5]' : 'text-[#F2C766]',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  </div>
);

export const SpiralJumpGame = () => {
  const { user } = useAuth();
  const playerName = user?.tg_user || 'Player';

  return (
    <div className="relative flex h-full min-h-[440px] w-full select-none flex-col overflow-hidden bg-[#070b12] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(82,255,229,0.12),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(242,199,102,0.11),transparent_34%)]" />

      <header className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3">
        <ProfilePill name={playerName} photoUrl={user?.photo_url} value="0 m" tone="mint" />

        <div className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-2 text-center backdrop-blur-lg">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/55">Spiral Jump</div>
          <div className="mt-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-white/25">Prototype</div>
        </div>

        <ProfilePill name="Opponent" value="0 m" tone="gold" />
      </header>

      <main className="relative z-10 grid flex-1 place-items-center px-6 pb-6 text-center">
        <div className="max-w-[320px]">
          <div className="relative mx-auto h-40 w-40">
            <div className="absolute left-1/2 top-2 h-36 w-2 -translate-x-1/2 rounded-full bg-white/10" />
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="absolute left-1/2 h-3 -translate-x-1/2 rotate-[-14deg] rounded-full border border-white/10 bg-gradient-to-r from-[#52FFE5]/35 to-[#F2C766]/20"
                style={{ top: 18 + index * 34, width: 118 - index * 9 }}
              />
            ))}
            <div className="absolute left-[58%] top-4 h-8 w-8 rounded-full bg-[#52FFE5] shadow-[0_0_30px_rgba(82,255,229,0.45)]" />
          </div>

          <h1 className="mt-2 text-[30px] font-black uppercase leading-none tracking-[-0.06em]">
            Spiral Jump
          </h1>
          <p className="mt-3 text-[11px] font-bold leading-relaxed text-white/38">
            Каркас страницы готов. Пока можно открывать игру напрямую без лобби и WebSocket.
          </p>
        </div>
      </main>
    </div>
  );
};

export default SpiralJumpGame;
