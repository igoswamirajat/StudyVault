import { useEffect, useRef, useState } from "react";

export function BootScreen({ onComplete }: { onComplete?: () => void }) {
  const logoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const [opacity, setOpacity] = useState(1);

  const msgs = [
    "Opening the vault",
    "Loading your workspace",
    "Almost ready",
    "Syncing your data",
  ];

  // Message cycling
  useEffect(() => {
    const msgInterval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setMsgIdx((prev) => (prev + 1) % msgs.length);
        setOpacity(1);
      }, 380);
    }, 2800);

    let completeTimeout: number;
    if (onComplete) {
      completeTimeout = window.setTimeout(() => {
        onComplete();
      }, 3500);
    }

    return () => {
      clearInterval(msgInterval);
      if (completeTimeout) clearTimeout(completeTimeout);
    };
  }, [onComplete]);

  // High-performance 60fps Canvas Animation Loop
  useEffect(() => {
    const logoCanvas = logoCanvasRef.current;
    const mainCanvas = mainCanvasRef.current;
    if (!logoCanvas || !mainCanvas) return;

    const lx = logoCanvas.getContext("2d", { alpha: true });
    const mx = mainCanvas.getContext("2d", { alpha: true });
    if (!lx || !mx) return;

    let animationFrameId: number;
    let startTime: number | null = null;

    function roundRect(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawLogo(t: number) {
      if (!lx) return;
      lx.clearRect(0, 0, 44, 44);
      lx.fillStyle = "#1a1a1a";
      roundRect(lx, 0, 0, 44, 44, 10);
      lx.fill();

      const pulse = 1 + Math.sin(t * 0.04) * 0.06;
      const cx = 22,
        cy = 22,
        s = 13 * pulse;
      lx.save();
      lx.translate(cx, cy);
      lx.rotate(Math.sin(t * 0.025) * 0.18);
      lx.fillStyle = "#6b5fff";
      roundRect(lx, -s, -s, s * 2, s * 2, 5 * pulse);
      lx.fill();

      lx.fillStyle = "rgba(255,255,255,0.15)";
      roundRect(lx, -s, -s, s * 2 * 0.55, s * 2 * 0.55, 3);
      lx.fill();
      lx.restore();
    }

    const N = 4;
    const colors = ["#6b5fff", "#8b7fff", "#5040dd", "#9d90ff"];
    const sizes = [16, 12, 9, 7];

    function cloverX(t: number, r: number) {
      return r * Math.sin(t) * Math.cos(t);
    }
    function cloverY(t: number, r: number) {
      return r * Math.sin(t);
    }

    function drawMain(t: number) {
      if (!mx) return;
      mx.clearRect(0, 0, 220, 120);
      const cx = 110,
        cy = 60,
        r = 38;

      for (let i = N - 1; i >= 0; i--) {
        const angle = t * 0.022 - i * 0.55;
        const x = cx + cloverX(angle, r);
        const y = cy + cloverY(angle, r * 0.55);
        const sz = sizes[i];
        const alpha = 1 - i * 0.18;

        mx.globalAlpha = alpha;
        mx.fillStyle = colors[i];
        const rr = 3 + i * 0.5;
        roundRect(mx, x - sz / 2, y - sz / 2, sz, sz, rr);
        mx.fill();
      }
      mx.globalAlpha = 1;
    }

    function loop(timestamp: number) {
      if (!startTime) startTime = timestamp;
      // Convert elapsed time to smooth frame units (normalized to ~60fps)
      const t = (timestamp - startTime) * 0.06;

      drawLogo(t);
      drawMain(t);

      animationFrameId = requestAnimationFrame(loop);
    }

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-9 bg-[#0e0e0e] select-none">
      {/* Logo Row */}
      <div className="flex items-center gap-3.25">
        <canvas ref={logoCanvasRef} width={44} height={44} className="block shrink-0" />
        <span className="font-sans text-[22px] font-semibold tracking-[0.08em] text-[#f0f0f0]">
          STUDYVAULT
        </span>
      </div>

      {/* Main Clover Animation Canvas */}
      <canvas ref={mainCanvasRef} width={220} height={120} className="block shrink-0" />

      {/* Animated Loading Text */}
      <div
        className="font-sans text-[11px] tracking-[0.22em] text-white/25 uppercase transition-opacity duration-350"
        style={{ opacity }}
      >
        {msgs[msgIdx]}
      </div>
    </div>
  );
}
