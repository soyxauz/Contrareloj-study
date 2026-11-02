import confetti from 'canvas-confetti';
import { HELLO_KITTY_PNG_DATA_URL } from './kittyAsset';
import { getStoredTheme } from '../services/themeService';

let cachedKittyImage: HTMLImageElement | null = null;

function getKittyImage(): Promise<HTMLImageElement> {
  if (cachedKittyImage && cachedKittyImage.complete) {
    return Promise.resolve(cachedKittyImage);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.src = HELLO_KITTY_PNG_DATA_URL;
    img.onload = () => {
      cachedKittyImage = img;
      resolve(img);
    };
    img.onerror = () => {
      resolve(img);
    };
  });
}

interface KittyParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  rotation: number;
  vRot: number;
  width: number;
  height: number;
  opacity: number;
  life: number;
  decay: number;
  wobble: number;
  wobbleSpeed: number;
  isSparkle?: boolean;
  color?: string;
}

export function fireKittyConfetti(options?: {
  particleCount?: number;
  spread?: number;
  origin?: { x?: number; y?: number };
}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const count = options?.particleCount || 45;
  const originX = (options?.origin?.x ?? 0.5) * window.innerWidth;
  const originY = (options?.origin?.y ?? 0.6) * window.innerHeight;

  getKittyImage().then((kittyImg) => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '99999';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      document.body.removeChild(canvas);
      return;
    }
    ctx.scale(dpr, dpr);

    const particles: KittyParticle[] = [];
    const aspectRatio = kittyImg.width && kittyImg.height ? kittyImg.height / kittyImg.width : 0.64;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / 180) * (270 + (Math.random() - 0.5) * (options?.spread || 80));
      const velocity = Math.random() * 18 + 10;
      const baseWidth = Math.random() * 26 + 32;

      particles.push({
        x: originX + (Math.random() - 0.5) * 40,
        y: originY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * velocity + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * velocity,
        gravity: 0.42,
        drag: 0.985,
        rotation: (Math.random() - 0.5) * 0.8,
        vRot: (Math.random() - 0.5) * 0.12,
        width: baseWidth,
        height: baseWidth * aspectRatio,
        opacity: 1,
        life: 1,
        decay: Math.random() * 0.005 + 0.004,
        wobble: Math.random() * 10,
        wobbleSpeed: Math.random() * 0.08 + 0.04,
      });

      // Extra pink/white sparkle star particles
      if (i % 2 === 0) {
        const starAngle = Math.random() * Math.PI * 2;
        const starVel = Math.random() * 14 + 6;
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(starAngle) * starVel,
          vy: Math.sin(starAngle) * starVel - 5,
          gravity: 0.35,
          drag: 0.98,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.2,
          width: Math.random() * 10 + 6,
          height: Math.random() * 10 + 6,
          opacity: 1,
          life: 1,
          decay: Math.random() * 0.008 + 0.006,
          wobble: 0,
          wobbleSpeed: 0,
          isSparkle: true,
          color: Math.random() > 0.5 ? '#f472b6' : '#ffffff',
        });
      }
    }

    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        alive++;

        p.vy += p.gravity;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 1.2;
        p.y += p.vy;
        p.rotation += p.vRot;
        p.life -= p.decay;
        p.opacity = Math.max(0, Math.min(1, p.life * 2));

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        if (p.isSparkle) {
          ctx.fillStyle = p.color || '#f472b6';
          ctx.beginPath();
          ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (kittyImg.complete) {
          ctx.drawImage(kittyImg, -p.width / 2, -p.height / 2, p.width, p.height);
        }

        ctx.restore();
      }

      if (alive > 0) {
        animId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animId);
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
      }
    };

    animId = requestAnimationFrame(render);
  });
}

export function triggerThemeAwareConfetti(options?: {
  particleCount?: number;
  spread?: number;
  origin?: { x?: number; y?: number };
}): void {
  const currentTheme = getStoredTheme();
  if (currentTheme === 'kitty') {
    fireKittyConfetti(options);
  } else if (currentTheme === 'light') {
    confetti({
      colors: ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed'],
      ...options,
    });
  } else {
    confetti(options);
  }
}
