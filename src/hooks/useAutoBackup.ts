import { useEffect, useRef } from "react";
import { useSettings } from "./useSettings";
import { performAutoBackup, checkForNewerBackup, getBackupHandle } from "@/services/autoBackupService";
import { toast } from "sonner";

const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useAutoBackup() {
  const { settings } = useSettings();
  const enabled = Boolean(settings.autoBackupEnabled);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Check for newer backup on mount (once)
    if (!checkedRef.current) {
      checkedRef.current = true;
      void checkForNewerBackup().then(({ hasNewer, backupAt }) => {
        if (hasNewer) {
          toast.info(`A newer backup exists (${backupAt}). Restore it from Settings > Auto-Backup.`, {
            duration: 10_000,
          });
        }
      });
    }

    const doBackup = async () => {
      const handle = await getBackupHandle();
      if (!handle) return;
      await performAutoBackup();
    };

    timerRef.current = setInterval(doBackup, BACKUP_INTERVAL_MS);

    const onVisChange = () => {
      if (document.visibilityState === "hidden") void doBackup();
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [enabled]);
}
