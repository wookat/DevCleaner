import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

let globalIconCache: Record<string, string> | null = null;
let fetchPromise: Promise<Record<string, string>> | null = null;

async function fetchIcons(): Promise<Record<string, string>> {
  if (globalIconCache) return globalIconCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const map = await invoke<Record<string, string>>("get_ide_icons");
      globalIconCache = map;
      return map;
    } catch {
      return {};
    }
  })();

  return fetchPromise;
}

export function useIdeIcons(): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>(globalIconCache || {});

  useEffect(() => {
    fetchIcons().then(setIcons);
  }, []);

  return icons;
}
