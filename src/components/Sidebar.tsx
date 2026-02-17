import { Search, Settings, MessageSquare, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Page } from "../types";
import { cn } from "../lib/utils";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { t } = useTranslation();

  const navItems: { page: Page; labelKey: string; icon: React.ReactNode }[] = [
    { page: "scan", labelKey: "nav.scan", icon: <Search size={20} /> },
    { page: "conversations", labelKey: "nav.conversations", icon: <MessageSquare size={20} /> },
    { page: "uninstall", labelKey: "nav.uninstall", icon: <Trash2 size={20} /> },
    { page: "settings", labelKey: "nav.settings", icon: <Settings size={20} /> },
  ];

  return (
    <aside className="app-shell-sidebar relative w-64 shrink-0 h-full flex flex-col bg-card/60 backdrop-blur-md border-r border-border">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent opacity-20" />

      <div className="relative z-10 px-6 pt-8 pb-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-indigo-500 flex items-center justify-center text-primary-foreground font-black text-sm shadow-lg shadow-primary/30">
          DC
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-foreground truncate tracking-tight">{t("app.name")}</h1>
          <p className="text-[10px] text-muted-foreground font-medium tracking-wide opacity-80">{t("app.version")}</p>
        </div>
      </div>

      <nav className="relative z-10 flex-1 px-4 py-2 flex flex-col gap-2">
        <p className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 opacity-60">Menu</p>
        {navItems.map((item) => {
          const isActive = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative overflow-hidden",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />
              )}
              <span
                className={cn(
                  "transition-transform duration-200",
                  isActive ? "scale-110" : "group-hover:scale-110"
                )}
              >
                {item.icon}
              </span>
              <span className="relative z-10">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative z-10 px-6 py-6 border-t border-border/50">
        <div className="bg-secondary/50 rounded-xl p-4 border border-border/50">
            <p className="text-[10px] text-muted-foreground text-center font-medium leading-relaxed opacity-70">
            {t("app.footer")}
            </p>
        </div>
      </div>
    </aside>
  );
}
