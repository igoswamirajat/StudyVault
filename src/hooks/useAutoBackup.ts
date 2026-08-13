import { useEffect, useRef } from "react";
import { useSettings } from "./useSettings";
import { performAutoBackup, checkForNewerBackup, getBackupHandle, checkBackupPermission, requestBackupPermission } from "@/services/autoBackupService";
import { importFullBackup } from "@/services/exportService";
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

    // Check permissions and newer backups on mount
    if (!checkedRef.current) {
      checkedRef.current = true;
      
      void checkBackupPermission().then((perm) => {
        if (perm === "prompt") {
          toast.warning("Auto-Backup is paused. Click to restore folder access.", {
            duration: Infinity,
            action: {
              label: "Grant Access",
              onClick: () => {
                void requestBackupPermission().then((granted) => {
                  if (granted) {
                    toast.success("Folder access restored!");
                    checkNewer();
                  } else {
                    toast.error("Access denied.");
                  }
                });
              }
            }
          });
        } else if (perm === "granted") {
          checkNewer();
        }
      });
      
      const checkNewer = () => {
        void checkForNewerBackup().then(({ hasNewer, backupAt, file }) => {
          if (hasNewer && file) {
            toast.info(`A newer backup exists from another session (${backupAt}).`, {
              duration: Infinity,
              action: {
                label: "Restore Now",
                onClick: () => {
                  void importFullBackup(file).then(() => {
                    toast.success("Backup restored successfully!");
                    window.location.reload();
                  }).catch(e => {
                    toast.error("Failed to restore: " + e.message);
                  });
                }
              }
            });
          }
        });
      };
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
