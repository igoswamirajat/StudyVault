import { useEffect, useRef, useCallback } from "react";

interface ButterScrollProps {
  lerp?: number;
  threshold?: number;
}

/**
  * Cinematic momentum-based smooth scroll hook/wrapper.
  * Interpolates scroll movement smoothly using requestAnimationFrame.
  */
export function useButterScroll(containerRef: React.RefObject<HTMLElement | null>, options: ButterScrollProps = {}) {
  const lerpFactor = options.lerp ?? 0.12;
  const threshold = options.threshold ?? 0.5;

  const targetScrollY = useRef(0);
  const currentScrollY = useRef(0);
  const rafId = useRef<number | null>(null);
  const isScrolling = useRef(false);

  const lerp = useCallback((start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Respect reduced motion settings
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    targetScrollY.current = el.scrollTop;
    currentScrollY.current = el.scrollTop;

    const updateScroll = () => {
      const diff = targetScrollY.current - currentScrollY.current;

      if (Math.abs(diff) > threshold) {
        currentScrollY.current = lerp(currentScrollY.current, targetScrollY.current, lerpFactor);
        el.scrollTop = currentScrollY.current;
        rafId.current = requestAnimationFrame(updateScroll);
      } else {
        currentScrollY.current = targetScrollY.current;
        el.scrollTop = targetScrollY.current;
        isScrolling.current = false;
        if (rafId.current !== null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Don't scroll-jack if nested element handles scroll or if default prevented
      if (e.defaultPrevented) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      targetScrollY.current = Math.max(0, Math.min(maxScroll, targetScrollY.current + e.deltaY));

      if (!isScrolling.current) {
        isScrolling.current = true;
        rafId.current = requestAnimationFrame(updateScroll);
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [containerRef, lerp, lerpFactor, threshold]);
}
