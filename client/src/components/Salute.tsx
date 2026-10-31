import { useEffect, useRef } from 'react';

/** Timeline in ms: the rocket rises, bursts, the sparks spell the text, hold it, then fall away. */
const RISE = 650;
const GATHER = 550;
const HOLD = 1300;
const FALL = 650;
const TOTAL = RISE + GATHER + HOLD + FALL;
const COLORS = ['--primary', '--success', '--warning', '--info', '--danger'];

interface Spark {
  x: number;
  y: number;
  /** Where it settles in the text; burst sparks have none and just fly off. */
  tx?: number;
  ty?: number;
  vx: number;
  vy: number;
  delay: number;
  r: number;
  color: string;
}

const easeOut = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;

/** The theme colours as values a canvas understands (a probe resolves the CSS variables). */
function themeColors(): string[] {
  const probe = document.createElement('span');
  document.body.append(probe);
  const colors = COLORS.map((name) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return colors;
}

/** Points on a grid that fall inside `text` drawn centred on (cx, cy), sized to fit the screen. */
function textPoints(text: string, w: number, h: number, cx: number, cy: number) {
  const font = (px: number) => `800 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { points: [], gap: 4 };
  ctx.font = font(100);
  const size = Math.min((100 * w * 0.9) / Math.max(ctx.measureText(text).width, 1), h * 0.3, 240);
  ctx.font = font(size);
  const width = Math.ceil(ctx.measureText(text).width) + 4;
  const height = Math.ceil(size * 1.3);
  canvas.width = width;
  canvas.height = height;
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  // Coarser grid for big text, so there are never more than ~1000 sparks
  let gap = Math.max(4, Math.round(size / 18));
  while ((width * height) / (gap * gap) > 6000) gap++;
  const points: [number, number][] = [];
  for (let y = 0; y < height; y += gap) {
    for (let x = 0; x < width; x += gap) {
      if (pixels[(y * width + x) * 4 + 3]! > 128) {
        points.push([cx - width / 2 + x, cy - height / 2 + y]);
      }
    }
  }
  return { points, gap };
}

/**
 * Fireworks for a finished day: a rocket rises from the bottom centre of the screen, bursts in
 * the middle and its sparks spell `text`, then fall away. Draws on a canvas over the page that
 * ignores the pointer, calls `onDone` when finished, and is skipped when the system asks for
 * reduced motion.
 */
export function Salute({ text, onDone }: { text: string; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const timer = setTimeout(onDone, TOTAL);
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => clearTimeout(timer);
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const colors = themeColors();
    const pick = () => colors[Math.floor(Math.random() * colors.length)]!;
    const cx = w / 2;
    const cy = h * 0.45;
    const { points, gap } = textPoints(text, w, h, cx, cy);
    const sparks: Spark[] = [
      ...points.map(([tx, ty]) => ({
        x: cx,
        y: cy,
        tx,
        ty,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * -1,
        delay: Math.random() * 120,
        r: gap * (0.38 + Math.random() * 0.12),
        color: pick(),
      })),
      ...Array.from({ length: 70 }, () => {
        const angle = Math.random() * 2 * Math.PI;
        const speed = 3 + Math.random() * 7;
        return {
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          delay: 0,
          r: 1.5 + Math.random() * 1.5,
          color: pick(),
        };
      }),
    ];
    const rocketColor = colors[2]!;
    const trail: [number, number][] = [];

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);

      if (t < RISE) {
        // The rocket and a short fading trail
        const y = h + 10 - (h + 10 - cy) * (1 - (1 - t / RISE) ** 2);
        trail.push([cx + Math.sin(t / 40) * 1.5, y]);
        if (trail.length > 14) trail.shift();
        trail.forEach(([x, ty], i) => {
          ctx.globalAlpha = (i + 1) / trail.length;
          ctx.fillStyle = rocketColor;
          ctx.beginPath();
          ctx.arc(x, ty, 1 + (3 * i) / trail.length, 0, 2 * Math.PI);
          ctx.fill();
        });
      } else {
        const b = t - RISE; // time since the burst
        for (const s of sparks) {
          let alpha = 1;
          if (s.tx === undefined) {
            // Burst sparks: fly out, slow down, drop and fade within ~0.9 s
            s.vx *= 0.94;
            s.vy = s.vy * 0.94 + 0.12;
            s.x += s.vx;
            s.y += s.vy;
            alpha = 1 - b / 900;
          } else if (b < GATHER + HOLD) {
            const k = easeOut((b - s.delay) / (GATHER - 120));
            s.x = cx + (s.tx - cx) * k;
            s.y = cy + (s.ty! - cy) * k;
            if (b > GATHER) alpha = 0.75 + 0.25 * Math.sin((b + s.delay * 20) / 90);
          } else {
            // Fall: drift and drop under gravity, fading out
            s.vy += 0.35;
            s.x += s.vx;
            s.y += s.vy;
            alpha = 1 - (b - GATHER - HOLD) / FALL;
          }
          if (alpha <= 0) continue;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      if (t < TOTAL) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [text, onDone]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="salute pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
