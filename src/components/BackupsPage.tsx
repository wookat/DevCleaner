import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Archive, Trash2, RefreshCw, AlertCircle, HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BackupListResult, BackupInfo, Page } from "../types";
import { formatBytes, formatNumber } from "../utils/formatters";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface BackupsPageProps {
  onNavigate?: (page: Page) => void;
}

export default function BackupsPage({ onNavigate }: BackupsPageProps) {
  const { t } = useTranslation();
  const [backupList, setBackupList] = useState<BackupListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const result = await invoke<BackupListResult>("list_backups");
      setBackupList(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(backupId: string) {
    try {
      await invoke("delete_backup", { backupId });
      await loadBackups();
    } catch (e) {
      setError(String(e));
    }
  }

  function formatTimestamp(ts: string): string {
    if (ts.length === 15) {
      const y = ts.slice(0, 4);
      const m = ts.slice(4, 6);
      const d = ts.slice(6, 8);
      const h = ts.slice(9, 11);
      const min = ts.slice(11, 13);
      const s = ts.slice(13, 15);
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }
    return ts;
  }

  const backups = backupList?.backups || [];

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text)]">{t("backups.title")}</h2>
          <p className="text-muted-foreground mt-2">
            {t("backups.subtitle")}
          </p>
        </div>
        <Button
          onClick={loadBackups}
          disabled={loading}
          size="lg"
          variant="outline"
          className="shadow-sm bg-background"
        >
          <RefreshCw size={18} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
          {t("backups.refresh")}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4 text-destructive">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {backupList && backups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
             <div className="absolute right-0 top-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="p-6 relative z-10 flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Archive size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("backups.totalBackups")}</p>
                <p className="text-3xl font-bold mt-1 text-foreground">{backups.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-warning/5 border-warning/20 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-warning/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="p-6 relative z-10 flex items-center gap-4">
              <div className="p-3 bg-warning/10 rounded-xl text-warning">
                <HardDrive size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("backups.totalSize")}</p>
                <p className="text-3xl font-bold mt-1 text-foreground">{formatBytes(backupList.total_size)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Backup List */}
      {backups.length > 0 ? (
        <div className="space-y-4">
          {backups
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .map((backup) => (
              <BackupCard
                key={backup.id}
                backup={backup}
                formatTimestamp={formatTimestamp}
                onDelete={() => handleDelete(backup.id)}
              />
            ))}
        </div>
      ) : (
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center p-10 text-center">
            <div className="w-20 h-20 bg-muted/50 rounded-3xl flex items-center justify-center mb-6 text-muted-foreground/50">
              <Archive size={40} />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">{t("backups.noBackups")}</h3>
            <p className="text-muted-foreground max-w-sm mb-8 leading-relaxed">{t("backups.noBackupsDesc")}</p>
            <div className="flex items-center gap-4">
              <Button onClick={loadBackups} variant="outline">
                <RefreshCw size={16} className="mr-2" />
                {t("backups.refresh")}
              </Button>
              {onNavigate && (
                <Button onClick={() => onNavigate("scan")}>
                  <Trash2 size={16} className="mr-2" />
                  {t("backups.goClean")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackupCard({
  backup,
  formatTimestamp,
  onDelete,
}: {
  backup: BackupInfo;
  formatTimestamp: (ts: string) => string;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="hover:border-primary/30 transition-colors group">
      <CardContent className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-300 group-hover:scale-105">
            <Archive size={22} />
          </div>
          <div>
            <p className="text-base font-bold text-foreground mb-1.5">{backup.ide_name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium flex-wrap">
              <Badge variant="secondary" className="font-mono font-normal text-[10px] h-5">
                {formatTimestamp(backup.timestamp)}
              </Badge>
              <span>•</span>
              <span>{formatBytes(backup.size)}</span>
              <span>•</span>
              <span>{formatNumber(backup.file_count)} {t("backups.files")}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {confirming ? (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-4 fade-in duration-200">
              <span className="text-xs font-semibold text-warning mr-2 hidden sm:inline">{t("backups.confirmDelete")}</span>
              <Button
                onClick={() => {
                  onDelete();
                  setConfirming(false);
                }}
                variant="destructive"
                size="sm"
                className="h-8"
              >
                {t("backups.yes")}
              </Button>
              <Button
                onClick={() => setConfirming(false)}
                variant="ghost"
                size="sm"
                className="h-8"
              >
                {t("backups.no")}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 size={18} />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
