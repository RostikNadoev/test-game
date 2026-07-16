import { useAuth } from '../auth/useAuth';

const getInitials = (value: string) =>
  value.replace('@', '').trim().slice(0, 2).toUpperCase() || 'TG';

const HudPlayer = ({
  name,
  photoUrl,
  score,
  align,
}: {
  name: string;
  photoUrl?: string;
  score: number;
  align: 'left' | 'right';
}) => (
  <div className={['flex min-w-0 items-center gap-2', align === 'right' ? 'flex-row-reverse text-right' : ''].join(' ')}>
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-white/10 bg-white/[0.06] text-[10px] font-black uppercase text-white/75">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        getInitials(name)
      )}
    </div>
    <div className="min-w-0">
      <div className="max-w-[92px] truncate text-[9px] font-black leading-none text-white/65">{name}</div>
      <div className="mt-1 text-[15px] font-black leading-none tabular-nums text-white">{score}</div>
    </div>
  </div>
);

export const RailGrindGame = () => {
  const { user } = useAuth();
  const playerName = user?.tg_user || 'Player';

  return (
    <div className="relative flex h-full min-h-[440px] w-full select-none flex-col overflow-hidden bg-[#07070b] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(157,124,255,0.11),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(82,255,229,0.1),transparent_35%)]" />

      <header className="relative z-20 px-3 pt-3">
        <div className="mx-auto grid max-w-[480px] grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.08] px-1 pb-3">
          <HudPlayer name={playerName} photoUrl={user?.photo_url} score={0} align="left" />

          <div className="text-center">
            <div className="text-[8px] font-black uppercase tracking-[0.22em] text-[#9D7CFF]">Rail Grind</div>
            <div className="mt-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-white/28">
              Offline shell
            </div>
          </div>

          <HudPlayer name="Opponent" score={0} align="right" />
        </div>
      </header>

      <main className="relative z-10 grid flex-1 place-items-center px-6 pb-7 text-center">
        <div className="max-w-[330px]">
          <div className="relative mx-auto h-32 w-64 overflow-hidden rounded-[30px] border border-white/[0.07] bg-white/[0.025]">
            <div className="absolute bottom-7 left-[-20px] h-1 w-[310px] rotate-[-8deg] rounded-full bg-gradient-to-r from-[#9D7CFF] via-[#52FFE5] to-[#F2C766] shadow-[0_0_25px_rgba(82,255,229,0.3)]" />
            <div className="absolute bottom-[52px] left-[118px] text-[34px] drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)]">🛹</div>
            <div className="absolute left-6 top-5 h-2 w-2 rounded-full bg-white/25" />
            <div className="absolute right-9 top-8 h-1.5 w-1.5 rounded-full bg-white/20" />
          </div>

          <h1 className="mt-5 text-[30px] font-black uppercase leading-none tracking-[-0.06em]">
            Rail Grind
          </h1>
          <p className="mt-3 text-[11px] font-bold leading-relaxed text-white/38">
            Пока это пустой экран будущей игры. Открывается напрямую и ничего не запрашивает у backend.
          </p>
        </div>
      </main>
    </div>
  );
};

export default RailGrindGame;
