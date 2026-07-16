import { useAuth } from '../auth/useAuth';

const getInitials = (value: string) =>
  value.replace('@', '').trim().slice(0, 2).toUpperCase() || 'TG';

const MiniAvatar = ({ photoUrl, name }: { photoUrl?: string; name: string }) => (
  <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.07] text-[10px] font-black uppercase text-white/80">
    {photoUrl ? (
      <img src={photoUrl} alt={name} className="h-full w-full object-cover" draggable={false} />
    ) : (
      getInitials(name)
    )}
  </div>
);

export const StackBallGame = () => {
  const { user } = useAuth();
  const playerName = user?.tg_user || 'Player';

  return (
    <div className="relative h-full min-h-[440px] w-full select-none overflow-hidden bg-[#08080c] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(157,124,255,0.16),transparent_34%),linear-gradient(180deg,transparent,rgba(255,122,144,0.05))]" />

      <aside className="absolute left-3 top-3 z-20 flex flex-col items-center gap-2 rounded-[22px] border border-white/[0.07] bg-black/20 px-2 py-2.5 backdrop-blur-lg">
        <MiniAvatar photoUrl={user?.photo_url} name={playerName} />
        <div className="text-center">
          <div className="text-[18px] font-black leading-none tabular-nums text-[#9D7CFF]">0</div>
          <div className="mt-1 max-w-[54px] truncate text-[7px] font-black uppercase tracking-[0.12em] text-white/35">
            {playerName}
          </div>
        </div>

        <div className="h-px w-8 bg-white/10" />

        <div className="text-center">
          <div className="text-[18px] font-black leading-none tabular-nums text-[#FF7A90]">0</div>
          <div className="mt-1 text-[7px] font-black uppercase tracking-[0.12em] text-white/35">
            Rival
          </div>
        </div>
        <MiniAvatar name="Opponent" />
      </aside>

      <div className="absolute right-3 top-3 z-20 rounded-full border border-white/[0.08] bg-black/20 px-3 py-2 text-[8px] font-black uppercase tracking-[0.18em] text-white/35 backdrop-blur-lg">
        Stack Ball · Preview
      </div>

      <main className="relative z-10 grid h-full place-items-center px-6 text-center">
        <div className="max-w-[320px]">
          <div className="relative mx-auto h-36 w-28">
            <div className="absolute left-1/2 top-0 h-11 w-11 -translate-x-1/2 rounded-full bg-[#FF7A90] shadow-[0_0_35px_rgba(255,122,144,0.45)]" />
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="absolute left-1/2 h-4 -translate-x-1/2 rounded-full border border-white/10 bg-white/[0.08]"
                style={{ top: 54 + index * 22, width: 110 - index * 10 }}
              />
            ))}
          </div>

          <h1 className="mt-3 text-[30px] font-black uppercase leading-none tracking-[-0.06em]">
            Stack Ball
          </h1>
          <p className="mt-3 text-[11px] font-bold leading-relaxed text-white/38">
            Пустая игровая страница. Физика, управление и backend будут добавлены позже.
          </p>
        </div>
      </main>
    </div>
  );
};

export default StackBallGame;
