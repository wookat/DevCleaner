const STORAGE_KEY = "ide-cleaner-settings";

export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  autoBackup: boolean;
  defaultCleanMode: string;
  themeMode: ThemeMode;
}

const defaults: AppSettings = {
  autoBackup: true,
  defaultCleanMode: "Recommended",
  themeMode: "system",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...defaults };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("app-settings-changed", { detail: settings }));
}
