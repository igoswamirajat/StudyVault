import { useEffect, useRef, useState } from "react";
import { startSession, endSession, addTimeSpent } from "@/services/progressService";

export function useStudySession(activeResourceId: string | null) {
  const sessionIdRef = useRef<number | null>(null);
  const studiedRef = useRef<Set<string>>(new Set());
  const startRef = useRef<number>(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!activeResourceId) return;
    studiedRef.current.add(activeResourceId);

    (async () => {
      if (sessionIdRef.current == null) {
        sessionIdRef.current = await startSession();
        startRef.current = Date.now();
      }
    })();

    const interval = window.setInterval(() => {
      if (cancelled) return;
      const sec = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsedSec(sec);
      // Persist incremental time every 10s
      if (sec > 0 && sec % 10 === 0 && activeResourceId) {
        void addTimeSpent(activeResourceId, 10);
      }
    }, 1000);

    const finish = async () => {
      if (sessionIdRef.current != null) {
        const total = Math.floor((Date.now() - startRef.current) / 1000);
        await endSession(sessionIdRef.current, Array.from(studiedRef.current), total);
      }
    };

    const onBeforeUnload = () => {
      void finish();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void finish();
      sessionIdRef.current = null;
    };
  }, [activeResourceId]);

  return { elapsedSec };
}
