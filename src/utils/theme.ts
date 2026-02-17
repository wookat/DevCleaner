import { loadSettings, type ThemeMode } from "./storage";

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function applyThemeMode(mode: ThemeMode): void {
  const theme = resolveTheme(mode);
  document.documentElement.dataset.theme = theme;
}

export function initThemeSync(): () => void {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handleSystemThemeChange = () => {
    const { themeMode } = loadSettings();
    if (themeMode === "system") {
      applyThemeMode("system");
    }
  };

  mediaQuery.addEventListener("change", handleSystemThemeChange);
  applyThemeMode(loadSettings().themeMode);

  const handleSettingsChange = () => {
    applyThemeMode(loadSettings().themeMode);
  };

  window.addEventListener("app-settings-changed", handleSettingsChange);

  return () => {
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
    window.removeEventListener("app-settings-changed", handleSettingsChange);
  };
}
