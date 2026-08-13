import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/useSettings";

export function BootScreen({ onComplete }: { onComplete?: () => void }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [particles, setParticles] = useState<{ id: number; size: number; x: number; dur: number; delay: number }[]>([]);
  const { settings } = useSettings();

  const messages = [
    "Opening the vault",
    "Loading your workspace",
    "Almost ready",
    "Syncing your data",
  ];

  useEffect(() => {
    // Generate initial particles
    const initialParticles = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      size: 2 + Math.random() * 3,
      x: 10 + Math.random() * 80,
      dur: 4 + Math.random() * 5,
      delay: Math.random() * 2,
    }));
    setParticles(initialParticles);

    const pInterval = setInterval(() => {
      setParticles((prev) => {
        const newP = {
          id: Date.now(),
          size: 2 + Math.random() * 3,
          x: 10 + Math.random() * 80,
          dur: 4 + Math.random() * 5,
          delay: Math.random() * 2,
        };
        return [...prev.slice(-15), newP]; // Keep max 15 particles
      });
    }, 700);

    const msgInterval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setMsgIdx((prev) => (prev + 1) % messages.length);
        setOpacity(1);
      }, 400);
    }, 2800);

    // Call onComplete after a minimum time if provided
    let completeTimeout: number;
    if (onComplete) {
      completeTimeout = window.setTimeout(() => {
        onComplete();
      }, 3500); // Minimum 3.5s boot time to show the animation
    }

    return () => {
      clearInterval(pInterval);
      clearInterval(msgInterval);
      if (completeTimeout) clearTimeout(completeTimeout);
    };
  }, [onComplete]);

  // Use primary color from settings or fallback to default purple
  const accentColor = (settings.accentColor as string) || "var(--primary, #6b5fff)";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8 overflow-hidden bg-[#0e0e0e]">
      <style>{`
        .boot-splash * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .boot-logo-icon {
          width: 44px;
          height: 44px;
          background: #1a1a1a;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }

        .boot-logo-sheen {
          position: absolute;
          top: -100%;
          left: -60%;
          width: 60%;
          height: 300%;
          background: rgba(255,255,255,0.22);
          transform: skewX(-20deg);
          animation: boot-sheen 3s ease-in-out infinite;
        }

        @keyframes boot-sheen {
          0% { left: -60%; opacity: 0; }
          20% { opacity: 1; }
          40% { left: 140%; opacity: 0; }
          100% { left: 140%; opacity: 0; }
        }

        .boot-orbit-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1.5px solid transparent;
          animation: boot-orbit-pulse 2.4s ease-in-out infinite;
        }

        .boot-orbit-ring:nth-child(2) {
          inset: 10px;
          animation-delay: 0.4s;
        }

        .boot-orbit-ring:nth-child(3) {
          inset: 20px;
          animation-delay: 0.8s;
        }

        @keyframes boot-orbit-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.06); opacity: 1; }
        }

        .boot-orbit-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          animation: boot-dot-breathe 2.4s ease-in-out infinite;
        }

        @keyframes boot-dot-breathe {
          0%, 100% { transform: translate(-50%,-50%) scale(0.85); opacity: 0.7; }
          50% { transform: translate(-50%,-50%) scale(1.15); opacity: 1; }
        }

        .boot-dot-trail span {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          opacity: 0.2;
          animation: boot-trail-wave 1.6s ease-in-out infinite;
        }

        .boot-dot-trail span:nth-child(1) { animation-delay: 0s; }
        .boot-dot-trail span:nth-child(2) { animation-delay: 0.18s; }
        .boot-dot-trail span:nth-child(3) { animation-delay: 0.36s; }
        .boot-dot-trail span:nth-child(4) { animation-delay: 0.54s; }
        .boot-dot-trail span:nth-child(5) { animation-delay: 0.72s; }

        @keyframes boot-trail-wave {
          0%, 100% { opacity: 0.18; height: 5px; border-radius: 50%; }
          50% { opacity: 1; height: 8px; border-radius: 3px; }
        }

        .boot-particle {
          position: absolute;
          border-radius: 50%;
          animation: boot-float-up linear forwards;
        }

        @keyframes boot-float-up {
          0% { opacity: 0; transform: translateY(0) scale(0); }
          15% { opacity: 1; }
          85% { opacity: 0.4; }
          100% { opacity: 0; transform: translateY(-300px) scale(1); }
        }
      `}</style>

      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none boot-splash">
        {particles.map((p) => (
          <div
            key={p.id}
            className="boot-particle"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              bottom: "5%",
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              backgroundColor: accentColor,
              opacity: 0.45,
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3.5 z-10 boot-splash">
        <div className="boot-logo-icon">
          <div className="relative overflow-hidden rounded-md w-[26px] h-[26px]" style={{ backgroundColor: accentColor }}>
            <div className="boot-logo-sheen"></div>
          </div>
        </div>
        <span className="font-sans text-[22px] font-semibold tracking-[0.08em] text-[#f0f0f0]">
          STUDYVAULT
        </span>
      </div>

      <div className="relative w-20 h-20 z-10 boot-splash">
        <div className="boot-orbit-ring" style={{ borderColor: accentColor, opacity: 0.2 }}></div>
        <div className="boot-orbit-ring" style={{ borderColor: accentColor, opacity: 0.35 }}></div>
        <div className="boot-orbit-ring" style={{ borderColor: accentColor, opacity: 0.55 }}></div>
        <div 
          className="boot-orbit-dot" 
          style={{ 
            backgroundColor: accentColor, 
            boxShadow: `0 0 14px ${accentColor}` 
          }}
        ></div>
      </div>

      <div className="flex items-center gap-[7px] z-10 boot-splash boot-dot-trail">
        <span style={{ backgroundColor: accentColor }}></span>
        <span style={{ backgroundColor: accentColor }}></span>
        <span style={{ backgroundColor: accentColor }}></span>
        <span style={{ backgroundColor: accentColor }}></span>
        <span style={{ backgroundColor: accentColor }}></span>
      </div>

      <div
        className="font-sans text-xs tracking-[0.18em] text-white/30 uppercase transition-opacity duration-400 z-10 boot-splash"
        style={{ opacity }}
      >
        {messages[msgIdx]}
      </div>
    </div>
  );
}
