import { useEffect, useState, useCallback } from "react";
import { getAllSettings, setSetting, SETTINGS_CHANGED_EVENT } from "@/services/storageService";
import { DEFAULT_SETTINGS } from "@/db/schema";

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, unknown>>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const all = await getAllSettings();
    setSettings(all);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSettingsChanged = () => {
      void refresh();
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
  }, [refresh]);

  const update = useCallback(
    async (key: string, value: unknown) => {
      await setSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return { settings, loaded, update, refresh };
}
