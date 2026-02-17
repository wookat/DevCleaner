import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Info, Languages, Palette, Archive, FolderOpen, Trash2, Github, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLanguage } from "../i18n";
import { loadSettings, saveSettings } from "../utils/storage";
import { formatBytes } from "../utils/formatters";
import type { BackupListResult } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(loadSettings);
  const [backupInfo, setBackupInfo] = useState<{ path: string; count: number; size: number } | null>(null);
  const [clearing, setClearing] = useState(false);

  const update = useCallback((patch: Partial<typeof settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    loadBackupInfo();
  }, []);

  async function loadBackupInfo() {
    try {
      const [dirPath, list] = await Promise.all([
        invoke<string>("get_backup_dir_path"),
        invoke<BackupListResult>("list_backups"),
      ]);
      setBackupInfo({ path: dirPath, count: list.backups.length, size: list.total_size });
    } catch {
      // ignore
    }
  }

  async function handleClearBackups() {
    setClearing(true);
    try {
      await invoke("clear_all_backups");
      await loadBackupInfo();
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }

  async function handleOpenBackupDir() {
    try {
      await invoke("open_backup_dir");
    } catch {
      // ignore
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t("settings.title")}</h2>
        <p className="text-muted-foreground mt-2">{t("settings.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        {/* General */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Settings size={20} />
              </div>
              <CardTitle>{t("settings.general")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">{t("settings.autoBackup")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.autoBackupDesc")}
                </p>
              </div>
              <Switch
                checked={settings.autoBackup}
                onCheckedChange={(checked) => update({ autoBackup: checked })}
              />
            </div>
            
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">{t("settings.defaultCleanMode")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.defaultCleanModeDesc")}
                </p>
              </div>
              <select
                value={settings.defaultCleanMode}
                onChange={(e) => update({ defaultCleanMode: e.target.value })}
                className="bg-muted border border-input rounded-md px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="Safe">{t("clean.modes.safe")}</option>
                <option value="Recommended">{t("clean.modes.recommended")}</option>
                <option value="Aggressive">{t("clean.modes.aggressive")}</option>
              </select>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Palette size={14} className="text-primary" />
                  <p className="text-sm font-medium leading-none">{t("settings.theme")}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.themeDesc")}
                </p>
              </div>
              <select
                value={settings.themeMode}
                onChange={(e) => update({ themeMode: e.target.value as "system" | "light" | "dark" })}
                className="bg-muted border border-input rounded-md px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="system">{t("settings.themeSystem")}</option>
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Languages size={20} />
              </div>
              <CardTitle>{t("settings.language")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">{t("settings.language")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.languageDesc")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={i18n.language === "en" ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeLanguage("en")}
                >
                  English
                </Button>
                <Button
                  variant={i18n.language === "zh" ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeLanguage("zh")}
                >
                  中文
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Archive size={20} />
              </div>
              <CardTitle>{t("settings.backupManagement")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {backupInfo && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("settings.backupLocation")}</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded max-w-[300px] truncate block" title={backupInfo.path}>
                    {backupInfo.path}
                  </code>
                </div>
                <Separator />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("settings.backupCount")}</span>
                  <span className="font-medium">{backupInfo.count} ({formatBytes(backupInfo.size)})</span>
                </div>
                <Separator />
                <div className="flex items-center gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={handleOpenBackupDir}>
                    <FolderOpen size={14} className="mr-1.5" />
                    {t("settings.openBackupDir")}
                  </Button>
                  {backupInfo.count > 0 && (
                    <Button variant="destructive" size="sm" onClick={handleClearBackups} disabled={clearing}>
                      <Trash2 size={14} className="mr-1.5" />
                      {t("settings.clearAllBackups")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Info size={20} />
              </div>
              <CardTitle>{t("settings.about")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("settings.version")}</span>
              <Badge variant="secondary">0.1.0</Badge>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("settings.framework")}</span>
              <span className="font-medium">Tauri v2 + React</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("settings.supportedIdes")}</span>
              <span className="font-medium text-right text-xs">Cursor, Windsurf, Kiro, Trae, JetBrains...</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("settings.license")}</span>
              <span className="font-medium">MIT</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("settings.author")}</span>
              <div className="flex items-center gap-3">
                <span className="font-medium">wookat</span>
                <a
                  href="https://github.com/wookat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="GitHub"
                >
                  <Github size={15} />
                </a>
                <a
                  href="mailto:wookat@qq.com"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="wookat@qq.com"
                >
                  <Mail size={15} />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

