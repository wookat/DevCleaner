import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Trash2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Package,
  CheckCircle2,
  MessageSquare,
  Puzzle,
  Settings,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { InstalledProgram, UninstallOptions, UninstallResult, KeepOptionSizes, VersionInstall } from "../types";
import { formatBytes, getIdeColor } from "../utils/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

export default function UninstallPage() {
  const { t } = useTranslation();
  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<InstalledProgram | null>(null);
  const [options, setOptions] = useState<UninstallOptions>({
    keep_user_data: true,
    keep_conversations: true,
    keep_extensions: false,
    keep_settings: true,
  });
  const [uninstalling, setUninstalling] = useState(false);
  const [result, setResult] = useState<UninstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [keepSizes, setKeepSizes] = useState<Record<string, KeepOptionSizes>>({});
  const [loadingSizes, setLoadingSizes] = useState<string | null>(null);

  useEffect(() => {
    loadPrograms();
  }, []);

  async function loadPrograms() {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<InstalledProgram[]>("scan_installed_programs");
      setPrograms(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleUninstall() {
    if (!selectedProgram) return;
    setConfirmOpen(false);
    setUninstalling(true);
    setError(null);
    setResult(null);
    try {
      const res = await invoke<UninstallResult>("uninstall_program", {
        program: selectedProgram,
        options,
      });
      setResult(res);
      // Refresh program list
      await loadPrograms();
      setSelectedProgram(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setUninstalling(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              {t("uninstall.title")}
            </h2>
            <p className="text-muted-foreground mt-1">{t("uninstall.subtitle")}</p>
          </div>
          <Button onClick={loadPrograms} disabled={loading} variant="outline" className="shadow-sm">
            <RefreshCw size={16} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("scan.rescan")}
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="flex items-center gap-3 p-4 text-destructive">
              <AlertTriangle size={18} />
              <span className="text-sm font-medium">{error}</span>
            </CardContent>
          </Card>
        )}

        {/* Uninstall Result */}
        {result && (
          <Card className={result.success ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"}>
            <CardHeader className="pb-2">
              <div className={`flex items-center gap-2 ${result.success ? "text-success" : "text-destructive"}`}>
                {result.success ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                <CardTitle className={result.success ? "text-success" : "text-destructive"}>
                  {result.success ? t("uninstall.success") : t("uninstall.failed")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {result.program_name}
                {result.residual_freed_bytes > 0 && (
                  <span className="ml-2">
                    — {t("clean.freed")} {formatBytes(result.residual_freed_bytes)}
                  </span>
                )}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 text-xs text-destructive">
                  {result.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-4 pt-16">
            <Loader2 size={48} className="text-primary animate-spin" />
            <p className="text-muted-foreground">{t("uninstall.scanning")}</p>
          </div>
        ) : programs.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="flex flex-col items-center text-center p-10">
              <Package size={48} className="text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t("uninstall.noPrograms")}</h3>
              <p className="text-sm text-muted-foreground">{t("uninstall.noProgramsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 pb-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("uninstall.installedPrograms")} ({programs.length})
            </h3>
            {programs.map((prog) => {
              const isSelected = selectedProgram?.registry_key === prog.registry_key;
              return (
                <Card
                  key={prog.registry_key}
                  className={`transition-all duration-200 ${
                    isSelected
                      ? "border-primary/50 shadow-md"
                      : "hover:bg-muted/30 hover:border-border"
                  }`}
                >
                  <button
                    onClick={() => setSelectedProgram(isSelected ? null : prog)}
                    className="w-full p-3.5 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {prog.icon_base64 ? (
                        <img
                          src={`data:image/png;base64,${prog.icon_base64}`}
                          alt={prog.display_name}
                          className="w-9 h-9 rounded-lg shadow-sm object-contain shrink-0"
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0"
                          style={{ backgroundColor: prog.ide_id ? getIdeColor(prog.ide_id) : "#666" }}
                        >
                          <Package size={16} />
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <p className="font-semibold text-sm truncate">{prog.display_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {prog.publisher && <span>{prog.publisher}</span>}
                          {prog.display_version && <span>v{prog.display_version}</span>}
                        </div>
                        {prog.version_installs.length > 0 ? (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {prog.version_installs.map((vi) => (
                              <VersionInstallRow key={vi.path} vi={vi} onDeleted={() => loadPrograms()} />
                            ))}
                          </div>
                        ) : prog.install_location ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); invoke("open_path", { path: prog.install_location }); }}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary mt-0.5 transition-colors text-left"
                            title={prog.install_location}
                          >
                            <FolderOpen size={10} className="shrink-0" />
                            <span className="truncate">{prog.install_location}</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {prog.estimated_size_kb > 0 && (
                        <Badge variant="secondary" className="text-xs font-mono">
                          {formatBytes(prog.estimated_size_kb * 1024)}
                        </Badge>
                      )}
                      <ChevronDown
                        size={16}
                        className={`text-muted-foreground transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>

                  {/* Inline Options */}
                  {isSelected && (
                    <KeepOptionsPanel
                      ideId={prog.ide_id}
                      options={options}
                      setOptions={setOptions}
                      keepSizes={keepSizes}
                      loadingSizes={loadingSizes}
                      setKeepSizes={setKeepSizes}
                      setLoadingSizes={setLoadingSizes}
                      t={t}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed Bottom Action Bar */}
      {selectedProgram && (
        <div className="shrink-0 border-t bg-background/80 backdrop-blur-xl px-6 py-3.5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            {selectedProgram.icon_base64 ? (
              <img src={`data:image/png;base64,${selectedProgram.icon_base64}`} alt="" className="w-7 h-7 rounded object-contain" />
            ) : (
              <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: selectedProgram.ide_id ? getIdeColor(selectedProgram.ide_id) : "#666" }}>
                <Package size={14} />
              </div>
            )}
            <span className="text-sm font-medium truncate">{selectedProgram.display_name}</span>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={uninstalling}
            variant="destructive"
            className="shadow-lg shadow-destructive/20"
          >
            {uninstalling ? <Loader2 size={16} className="animate-spin mr-2" /> : <Trash2 size={16} className="mr-2" />}
            {uninstalling ? t("uninstall.uninstalling") : t("uninstall.uninstallBtn")}
          </Button>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmOpen && selectedProgram && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-destructive">
                <Trash2 size={24} />
                {t("uninstall.confirmTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                {t("uninstall.confirmDesc", { name: selectedProgram.display_name })}
              </p>
              <div className="space-y-1 mb-4 text-sm">
                {options.keep_settings && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    {t("uninstall.keepSettings")}
                  </p>
                )}
                {options.keep_user_data && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    {t("uninstall.keepUserData")}
                  </p>
                )}
                {options.keep_conversations && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    {t("uninstall.keepConversations")}
                  </p>
                )}
                {options.keep_extensions && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    {t("uninstall.keepExtensions")}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                  {t("backups.no")}
                </Button>
                <Button variant="destructive" onClick={handleUninstall}>
                  {t("uninstall.confirmYes")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Keep Options Panel with size display ── */
function KeepOptionsPanel({
  ideId,
  options,
  setOptions,
  keepSizes,
  loadingSizes,
  setKeepSizes,
  setLoadingSizes,
  t,
}: {
  ideId: string | null;
  options: UninstallOptions;
  setOptions: React.Dispatch<React.SetStateAction<UninstallOptions>>;
  keepSizes: Record<string, KeepOptionSizes>;
  loadingSizes: string | null;
  setKeepSizes: React.Dispatch<React.SetStateAction<Record<string, KeepOptionSizes>>>;
  setLoadingSizes: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}) {
  const sizes = ideId ? keepSizes[ideId] : null;
  const isLoading = loadingSizes === ideId;

  useEffect(() => {
    if (ideId && !keepSizes[ideId]) {
      setLoadingSizes(ideId);
      invoke<KeepOptionSizes>("get_keep_option_sizes", { ideId })
        .then((res) => {
          setKeepSizes((prev) => ({ ...prev, [ideId]: res }));
        })
        .catch(() => {})
        .finally(() => setLoadingSizes(null));
    }
  }, [ideId]);

  const items: { key: keyof UninstallOptions; optionKey: keyof KeepOptionSizes; icon: React.ReactNode; label: string }[] = [
    { key: "keep_settings", optionKey: "settings_size", icon: <Settings size={14} className="text-muted-foreground" />, label: t("uninstall.keepSettings") },
    { key: "keep_user_data", optionKey: "user_data_size", icon: <FolderOpen size={14} className="text-muted-foreground" />, label: t("uninstall.keepUserData") },
    { key: "keep_conversations", optionKey: "conversations_size", icon: <MessageSquare size={14} className="text-muted-foreground" />, label: t("uninstall.keepConversations") },
    { key: "keep_extensions", optionKey: "extensions_size", icon: <Puzzle size={14} className="text-muted-foreground" />, label: t("uninstall.keepExtensions") },
  ];

  return (
    <div className="px-4 pb-4 animate-in slide-in-from-top-2 fade-in duration-200">
      <Separator className="mb-3" />
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {t("uninstall.keepOptions")}
      </p>
      <div className="space-y-1.5">
        {items.map((item) => {
          const size = sizes?.[item.optionKey] ?? 0;
          // Hide options with 0 size (not applicable for this IDE type)
          if (!isLoading && sizes && size === 0) return null;
          return (
            <label
              key={item.key}
              className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 cursor-pointer select-none transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Checkbox
                  checked={options[item.key]}
                  onCheckedChange={(c) => setOptions((o) => ({ ...o, [item.key]: c === true }))}
                />
                {item.icon}
                <span className="text-xs">{item.label}</span>
              </div>
              <div className="shrink-0 ml-3">
                {isLoading ? (
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                ) : size > 0 ? (
                  <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                    {formatBytes(size)}
                  </Badge>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ── Version install path row: clickable path + delete for old versions ── */
function VersionInstallRow({ vi, onDeleted }: { vi: VersionInstall; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("open_path", { path: vi.path });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("uninstall.confirmDeleteVersion", { version: vi.version, defaultValue: `确认删除 ${vi.version} 的安装目录？此操作不可撤销。` }))) return;
    setDeleting(true);
    try {
      await invoke("delete_storage_entry", { path: vi.path });
      onDeleted();
    } catch { /* ignore */ }
    setDeleting(false);
  };

  return (
    <div className="flex items-center gap-1 group/vi">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors truncate text-left"
        title={vi.path}
      >
        <FolderOpen size={10} className="shrink-0" />
        <span className="truncate">{vi.version ? `v${vi.version}` : ""} {vi.path}</span>
      </button>
      {!vi.is_latest && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="opacity-0 group-hover/vi:opacity-100 p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50 shrink-0"
          title={t("uninstall.deleteOldVersion", { defaultValue: "删除旧版本安装目录" })}
        >
          {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
        </button>
      )}
    </div>
  );
}
