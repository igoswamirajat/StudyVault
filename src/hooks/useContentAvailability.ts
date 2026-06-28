import { useEffect, useState } from "react";

export type AvailabilityFilter = "both" | "online" | "offline";

const KEY = "studyvault:availability-filter";
const EVT = "studyvault:availability-filter-changed";

export function getAvailabilityFilter(): AvailabilityFilter {
  if (typeof window === "undefined") return "both";
  const v = window.localStorage.getItem(KEY);
  return v === "online" || v === "offline" ? v : "both";
}

export function setAvailabilityFilter(v: AvailabilityFilter): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, v);
  window.dispatchEvent(new CustomEvent(EVT, { detail: v }));
}

export function useAvailabilityFilter(): [AvailabilityFilter, (v: AvailabilityFilter) => void] {
  const [value, setValue] = useState<AvailabilityFilter>("both");
  useEffect(() => {
    setValue(getAvailabilityFilter());
    const sync = () => setValue(getAvailabilityFilter());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [
    value,
    (v) => {
      setAvailabilityFilter(v);
      setValue(v);
    },
  ];
}
