import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function TitleBar() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  async function safelyRun(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      console.error("Window action failed", e);
    }
  }

  return (
    <header
      className="app-shell-titlebar h-10 shrink-0 border-b border-border/60 bg-card/90 flex items-center justify-between"
    >
      <div data-tauri-drag-region className="h-full flex-1 flex items-center pl-3 text-xs font-medium text-muted-foreground">
        DevCleaner
      </div>

      <div data-tauri-no-drag className="flex items-center">
        <button
          aria-label={t("titlebar.minimize")}
          className="h-10 w-12 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={() => safelyRun(() => getCurrentWindow().minimize())}
        >
          <Minus size={16} />
        </button>

        <button
          aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
          className="h-10 w-12 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={() => safelyRun(async () => {
            const appWindow = getCurrentWindow();
            await appWindow.toggleMaximize();
            setMaximized(await appWindow.isMaximized());
          })}
        >
          <Square size={14} />
        </button>

        <button
          aria-label={t("titlebar.close")}
          className="h-10 w-12 inline-flex items-center justify-center text-muted-foreground hover:text-white hover:bg-destructive transition-colors"
          onClick={() => safelyRun(() => getCurrentWindow().close())}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
