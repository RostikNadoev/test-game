import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const GRID_SIZE = 22; 
const TICK_RATE = 110;

export const PaperGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [gameOver, setGameOver] = useState<string | null>(null);

  const touchStart = useRef<{ x: number, y: number } | null>(null);

  const world = useRef({
    gridW: 0, gridH: 0,
    cells: [] as number[][], 
    p1: { x: 2, y: 2, dir: 'RIGHT', nextDir: 'RIGHT', color: '#3b82f6' },
    p2: { x: 0, y: 0, dir: 'LEFT', nextDir: 'LEFT', color: '#ef4444' },
    lastTick: 0
  });

  // --- ЛОГИКА ЗАХВАТА ---
  const fillCapturedArea = (playerNum: number) => {
    const w = world.current;
    const tailNum = playerNum === 1 ? 3 : 4;
    
    // Хвост -> База
    for(let x=0; x<w.gridW; x++) {
      for(let y=0; y<w.gridH; y++) {
        if(w.cells[x][y] === tailNum) w.cells[x][y] = playerNum;
      }
    }

    const tempGrid = w.cells.map(row => [...row]);
    const queue: [number, number][] = [];

    for(let x=0; x<w.gridW; x++) {
      if(tempGrid[x][0] !== playerNum) queue.push([x, 0]);
      if(tempGrid[x][w.gridH-1] !== playerNum) queue.push([x, w.gridH-1]);
    }
    for(let y=0; y<w.gridH; y++) {
      if(tempGrid[0][y] !== playerNum) queue.push([0, y]);
      if(tempGrid[w.gridW-1][y] !== playerNum) queue.push([w.gridW-1, y]);
    }

    let head = 0;
    while(head < queue.length) {
      const [qx, qy] = queue[head++];
      if(tempGrid[qx][qy] === playerNum || tempGrid[qx][qy] === -1) continue;
      tempGrid[qx][qy] = -1;
      [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
        const nx = qx + dx, ny = qy + dy;
        if(nx >= 0 && nx < w.gridW && ny >= 0 && ny < w.gridH && tempGrid[nx][ny] !== playerNum && tempGrid[nx][ny] !== -1) {
          queue.push([nx, ny]);
        }
      });
    }

    for(let x=0; x<w.gridW; x++) {
      for(let y=0; y<w.gridH; y++) {
        if(tempGrid[x][y] !== -1) w.cells[x][y] = playerNum;
      }
    }
  };

  // --- ЛОГИКА ИИ (БОТА) ---
  const runAI = () => {
    const w = world.current;
    const bot = w.p2;
    const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    
    // Шанс смены направления
    if (Math.random() < 0.1) {
      const opposite: Record<string, string> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
      const validDirs = directions.filter(d => d !== opposite[bot.dir]);
      
      // Проверка на столкновение с краем
      const nextX = bot.x + (bot.dir === 'RIGHT' ? 1 : bot.dir === 'LEFT' ? -1 : 0);
      const nextY = bot.y + (bot.dir === 'DOWN' ? 1 : bot.dir === 'UP' ? -1 : 0);

      if (nextX <= 0 || nextX >= w.gridW - 1 || nextY <= 0 || nextY >= w.gridH - 1 || Math.random() < 0.05) {
        bot.nextDir = validDirs[Math.floor(Math.random() * validDirs.length)];
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d')!;
    
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const cols = Math.floor(rect.width / GRID_SIZE);
      const rows = Math.floor(rect.height / GRID_SIZE);
      canvas.width = cols * GRID_SIZE;
      canvas.height = rows * GRID_SIZE;
      world.current.gridW = cols;
      world.current.gridH = rows;
      world.current.cells = Array(cols).fill(0).map(() => Array(rows).fill(0));
      
      // Стартовые зоны
      for(let i=0; i<5; i++) for(let j=0; j<5; j++) world.current.cells[i][j] = 1;
      for(let i=cols-5; i<cols; i++) for(let j=rows-5; j<rows; j++) world.current.cells[i][j] = 2;
      world.current.p1 = { ...world.current.p1, x: 2, y: 2 };
      world.current.p2 = { ...world.current.p2, x: cols-3, y: rows-3 };
    };

    updateSize();

    let raf: number;
    const loop = (time: number) => {
      if (time - world.current.lastTick > TICK_RATE && !gameOver) {
        runAI(); // Включаем бота
        update();
        world.current.lastTick = time;
      }
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };

    const update = () => {
      const w = world.current;
      [w.p1, w.p2].forEach((p, idx) => {
        const playerNum = idx + 1;
        const tailNum = playerNum === 1 ? 3 : 4;
        
        p.dir = p.nextDir;
        if (p.dir === 'UP') p.y--; 
        else if (p.dir === 'DOWN') p.y++;
        else if (p.dir === 'LEFT') p.x--; 
        else if (p.dir === 'RIGHT') p.x++;

        // Смерть от границ
        if (p.x < 0 || p.x >= w.gridW || p.y < 0 || p.y >= w.gridH) {
          setGameOver(playerNum === 1 ? 'RED WINS' : 'BLUE WINS'); return;
        }

        const cell = w.cells[p.x][p.y];
        // Смерть от хвоста (своего или чужого)
        if (cell === 3 || cell === 4) {
          setGameOver(playerNum === 1 ? 'RED WINS' : 'BLUE WINS'); return;
        }

        if (cell === 0 || cell === (playerNum === 1 ? 2 : 1)) {
          w.cells[p.x][p.y] = tailNum; 
        } else if (cell === playerNum) {
          if (w.cells.some(row => row.includes(tailNum))) {
             fillCapturedArea(playerNum); 
          }
        }
      });
      
      let s1=0, s2=0;
      w.cells.forEach(c => c.forEach(v => { if(v===1) s1++; if(v===2) s2++; }));
      setScore({ p1: s1, p2: s2 });
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = world.current;
      
      // Сетка
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff05';
      for(let i=0; i<=canvas.width; i+=GRID_SIZE) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
      for(let i=0; i<=canvas.height; i+=GRID_SIZE) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
      ctx.stroke();

      for (let x = 0; x < w.gridW; x++) {
        for (let y = 0; y < w.gridH; y++) {
          const v = w.cells[x][y];
          if (v === 0) continue;

          if (v === 1) ctx.fillStyle = '#3b82f633'; // Синяя база
          else if (v === 2) ctx.fillStyle = '#ef444433'; // Красная база
          else if (v === 3) ctx.fillStyle = '#3b82f6'; // Синий хвост
          else if (v === 4) ctx.fillStyle = '#ef4444'; // Красный хвост
          
          // Рисуем со скруглением
          const r = 4;
          const px = x * GRID_SIZE + 1;
          const py = y * GRID_SIZE + 1;
          const pw = GRID_SIZE - 2;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, pw, v > 2 ? 2 : 0);
          ctx.fill();
        }
      }
      
      // Отрисовка голов игроков
      const drawPlayer = (p: any, color: string) => {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(p.x * GRID_SIZE - 1, p.y * GRID_SIZE - 1, GRID_SIZE + 2, GRID_SIZE + 2, 5);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(p.x * GRID_SIZE + 2, p.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        ctx.restore();
      };

      drawPlayer(w.p1, '#3b82f6');
      drawPlayer(w.p2, '#ef4444');
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameOver]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    const threshold = 15;

    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      const p = world.current.p1;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && p.dir !== 'LEFT') p.nextDir = 'RIGHT';
        else if (dx < 0 && p.dir !== 'RIGHT') p.nextDir = 'LEFT';
      } else {
        if (dy > 0 && p.dir !== 'UP') p.nextDir = 'DOWN';
        else if (dy < 0 && p.dir !== 'DOWN') p.nextDir = 'UP';
      }
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0A0A0F] font-sans">
      <div className="flex justify-between items-center px-6 py-4 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
          <div>
            <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest opacity-60">Player 1</div>
            <div className="text-xl font-black text-white leading-none">{score.p1}</div>
          </div>
        </div>
        
        <button onClick={() => navigate(-1)} className="p-2 px-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-[10px] text-white font-bold uppercase tracking-widest transition-all active:scale-90">
          Quit
        </button>

        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-[10px] text-red-400 font-bold uppercase tracking-widest opacity-60">Bot AI</div>
            <div className="text-xl font-black text-white leading-none">{score.p2}</div>
          </div>
          <div className="w-2 h-8 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]" />
        </div>
      </div>

      <div 
        ref={containerRef} 
        className="flex-1 relative flex items-center justify-center touch-none overflow-hidden bg-[radial-gradient(circle_at_center,_#111_0%,_#000_100%)]"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        <canvas ref={canvasRef} className="rounded-sm" />
        
        {!gameOver && score.p1 < 50 && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute bottom-12 text-white/30 text-[9px] uppercase font-black tracking-[0.3em] flex flex-col items-center gap-2"
          >
            <div className="w-1 h-12 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            Swipe to control
          </motion.div>
        )}

        <AnimatePresence>
          {gameOver && (
            <motion.div 
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} 
              animate={{ opacity: 1, backdropFilter: 'blur(10px)' }} 
              className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-6"
            >
              <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="text-center">
                <h2 className="text-6xl font-black text-white italic tracking-tighter mb-2">
                  {gameOver.includes('BLUE') ? 'VICTORY' : 'DEFEAT'}
                </h2>
                <p className="text-white/40 font-bold uppercase tracking-widest mb-10">{gameOver}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="group relative px-12 py-4 bg-white rounded-2xl overflow-hidden active:scale-95 transition-transform"
                >
                  <span className="relative z-10 text-black font-black uppercase italic">Play Again</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-10 transition-opacity" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};