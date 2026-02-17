import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Monitor,
  CheckCircle2,
  Loader2,
  Database,
  FileText,
  Folder,
  Puzzle,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScanSummary, CleanMode, CleanResult, IdeScanResult, CategoryType } from "../types";
import { formatBytes, formatNumber, getIdeColor } from "../utils/formatters";
import { loadSettings } from "../utils/storage";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Separator } from "./ui/separator";

export default function CleanPage() {
  const { t } = useTranslation();
  const initialSettings = loadSettings();
  const [scanResult, setScanResult] = useState<ScanSummary | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMode, setCleanMode] = useState<CleanMode>(() => initialSettings.defaultCleanMode as CleanMode);
  const [selectedIdes, setSelectedIdes] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Map<string, Set<string>>>(new Map());
  const [createBackup, setCreateBackup] = useState(() => initialSettings.autoBackup);
  const [cleanResults, setCleanResults] = useState<CleanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modeHint, setModeHint] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<"idle" | "warning" | "confirm">("idle");
  const [runningIdes, setRunningIdes] = useState<string[]>([]);

  useEffect(() => {
    loadAndScan();
  }, []);

  function getAllowedCategoryTypes(mode: CleanMode): Set<CategoryType> {
    switch (mode) {
      case "Safe":
        return new Set(["Cache", "Log"]);
      case "Recommended":
        return new Set(["Cache", "Log", "WorkspaceStorage", "CrashReport"]);
      case "Aggressive":
        return new Set(["Cache", "Log", "WorkspaceStorage", "CrashReport", "Extension"]);
    }
  }

  function applyModeSelection(result: ScanSummary, mode: CleanMode): number {
    const allowTypes = getAllowedCategoryTypes(mode);
    const catMap = new Map<string, Set<string>>();
    const ideSet = new Set<string>();
    let selectedCount = 0;

    result.results.forEach((r) => {
      const allowedCats = new Set(
        r.categories
          .filter((c) => allowTypes.has(c.category_type) && c.total_size > 0)
          .map((c) => c.name)
      );
      selectedCount += allowedCats.size;
      catMap.set(r.ide_id, allowedCats);
      if (r.total_size > 0 && allowedCats.size > 0) {
        ideSet.add(r.ide_id);
      }
    });

    setSelectedCategories(catMap);
    setSelectedIdes(ideSet);
    return selectedCount;
  }

  async function loadAndScan() {
    setScanning(true);
    try {
      const result = await invoke<ScanSummary>("scan_all_ides");
      setScanResult(result);
      applyModeSelection(result, cleanMode);
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }

  function handleCleanModeChange(mode: CleanMode) {
    setCleanMode(mode);
    if (scanResult) {
      const count = applyModeSelection(scanResult, mode);
      setModeHint(t("clean.autoSelectedHint", { count }));
      window.setTimeout(() => setModeHint(null), 1800);
    }
  }

  function toggleIde(ideId: string) {
    setSelectedIdes((prev) => {
      const next = new Set(prev);
      if (next.has(ideId)) next.delete(ideId);
      else next.add(ideId);
      return next;
    });
  }

  function toggleCategory(ideId: string, catName: string) {
    setSelectedCategories((prev) => {
      const next = new Map(prev);
      const cats = new Set(next.get(ideId) || []);
      if (cats.has(catName)) cats.delete(catName);
      else cats.add(catName);
      next.set(ideId, cats);
      return next;
    });
  }

  function getSelectedSize(): number {
    if (!scanResult) return 0;
    let total = 0;
    for (const r of scanResult.results) {
      if (!selectedIdes.has(r.ide_id)) continue;
      const cats = selectedCategories.get(r.ide_id) || new Set();
      for (const c of r.categories) {
        if (cats.has(c.name)) total += c.total_size;
      }
    }
    return total;
  }

  async function requestClean() {
    if (selectedIdes.size === 0) return;
    setError(null);

    // Check if any selected IDE is running
    const running: string[] = [];
    for (const ideId of selectedIdes) {
      const procs = await invoke<string[]>("check_ide_running", { ideId });
      running.push(...procs);
    }

    if (running.length > 0) {
      setRunningIdes(running);
      setConfirmStep("warning");
    } else {
      setConfirmStep("confirm");
    }
  }

  async function executeClean() {
    setConfirmStep("idle");
    setCleaning(true);
    setCleanResults([]);
    setError(null);

    const results: CleanResult[] = [];
    try {
      for (const ideId of selectedIdes) {
        const cats = Array.from(selectedCategories.get(ideId) || []);
        if (cats.length === 0) continue;

        const result = await invoke<CleanResult>("clean_ide", {
          ideId,
          categories: cats,
          mode: cleanMode,
          createBackup,
        });
        results.push(result);
      }
      setCleanResults(results);
      const newScan = await invoke<ScanSummary>("scan_all_ides");
      setScanResult(newScan);
    } catch (e) {
      setError(String(e));
    } finally {
      setCleaning(false);
    }
  }

  const modes: { mode: CleanMode; labelKey: string; descKey: string; icon: React.ReactNode; color: string; bg: string }[] = [
    {
      mode: "Safe",
      labelKey: "clean.modes.safe",
      descKey: "clean.modes.safeDesc",
      icon: <Shield size={20} />,
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/50",
    },
    {
      mode: "Recommended",
      labelKey: "clean.modes.recommended",
      descKey: "clean.modes.recommendedDesc",
      icon: <ShieldCheck size={20} />,
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/50",
    },
    {
      mode: "Aggressive",
      labelKey: "clean.modes.aggressive",
      descKey: "clean.modes.aggressiveDesc",
      icon: <ShieldAlert size={20} />,
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/50",
    },
  ];

  const categoryIcon = (type_: string) => {
    switch (type_) {
      case "Cache": return <Database size={14} className="text-blue-400" />;
      case "Log": return <FileText size={14} className="text-yellow-400" />;
      case "WorkspaceStorage": return <Folder size={14} className="text-green-400" />;
      case "Extension": return <Puzzle size={14} className="text-purple-400" />;
      case "CrashReport": return <AlertTriangle size={14} className="text-red-400" />;
      default: return <FileText size={14} />;
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t("clean.title")}</h2>
          <p className="text-muted-foreground mt-2">
            {t("clean.subtitle")}
          </p>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="flex items-center gap-3 p-4 text-destructive">
              <AlertTriangle size={18} />
              <span className="text-sm font-medium">{error}</span>
            </CardContent>
          </Card>
        )}

        {/* Clean Results */}
        {cleanResults.length > 0 && (
          <Card className="bg-success/10 border-success/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 size={24} />
                <CardTitle className="text-success">{t("clean.cleanComplete")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cleanResults.map((r) => (
                  <div key={r.ide_id} className="flex items-center justify-between p-3 bg-success/5 rounded-xl border border-success/10">
                    <span className="font-medium text-success-foreground">{r.ide_id}</span>
                    <div className="text-sm">
                      <span className="text-success">{t("clean.freed")} {formatBytes(r.freed_bytes)}</span>
                      <span className="text-muted-foreground text-xs ml-2">({formatNumber(r.deleted_files)} {t("dashboard.files")})</span>
                      {r.errors.length > 0 && (
                        <span className="text-warning ml-2">({r.errors.length} {t("clean.errors")})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mode Selection */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">{t("clean.cleanMode")}</h3>
          {modeHint && (
            <div className="mb-3 inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
              {modeHint}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {modes.map((m) => (
              <Card
                key={m.mode}
                onClick={() => handleCleanModeChange(m.mode)}
                className={`cursor-pointer transition-all duration-200 border-2 ${
                  cleanMode === m.mode
                    ? m.bg
                    : "hover:bg-muted/50 hover:border-muted-foreground/20"
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${cleanMode === m.mode ? m.color : "text-foreground"}`}>
                      {t(m.labelKey)}
                    </span>
                    <div className={`p-1.5 rounded-lg ${cleanMode === m.mode ? "bg-white/10" : "bg-muted"} ${m.color}`}>
                      {m.icon}
                    </div>
                  </div>
                  <p className={`text-xs ${cleanMode === m.mode ? "text-foreground/90" : "text-muted-foreground"}`}>
                    {t(m.descKey)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* IDE & Category Selection */}
        {scanning ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-4">
            <Loader2 size={48} className="text-primary animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">{t("dashboard.scanning")}</p>
          </div>
        ) : scanResult ? (
          <div className="space-y-6 pb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("clean.selectItems")}</h3>
            <div className="space-y-4">
              {scanResult.results
                .filter((r) => r.total_size > 0)
                .map((result) => (
                  <IdeCleanCard
                    key={result.ide_id}
                    result={result}
                    selected={selectedIdes.has(result.ide_id)}
                    selectedCategories={selectedCategories.get(result.ide_id) || new Set()}
                    onToggleIde={() => toggleIde(result.ide_id)}
                    onToggleCategory={(cat) => toggleCategory(result.ide_id, cat)}
                    categoryIcon={categoryIcon}
                  />
                ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Confirm Dialog */}
      {confirmStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <CardHeader>
              <CardTitle className={`flex items-center gap-3 ${confirmStep === "warning" ? "text-warning" : "text-destructive"}`}>
                {confirmStep === "warning" ? <AlertTriangle size={24} /> : <Trash2 size={24} />}
                {confirmStep === "warning" ? t("clean.ideRunning") : t("clean.confirmClean")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                {confirmStep === "warning" ? t("clean.ideRunningDesc") : t("clean.confirmCleanDesc", { size: formatBytes(getSelectedSize()) })}
              </p>
              {confirmStep === "warning" && (
                <div className="p-3 bg-muted rounded-xl text-sm font-mono text-warning mb-4">
                  {runningIdes.join(", ")}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setConfirmStep("idle")}>
                  {t("backups.no")}
                </Button>
                <Button 
                  variant={confirmStep === "warning" ? "secondary" : "destructive"}
                  className={confirmStep === "warning" ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}
                  onClick={confirmStep === "warning" ? () => setConfirmStep("confirm") : executeClean}
                >
                  {confirmStep === "warning" ? t("clean.continueAnyway") : t("clean.confirmYes")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Bar */}
      <div className="shrink-0 border-t bg-background/80 backdrop-blur-xl px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 z-10">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none group">
            <Checkbox 
              checked={createBackup}
              onCheckedChange={(checked) => setCreateBackup(checked === true)}
            />
            <span className="group-hover:text-foreground transition-colors text-muted-foreground">
              {t("clean.createBackup")}
            </span>
          </label>
          <Separator orientation="vertical" className="h-6 hidden md:block" />
          <span className="text-sm text-muted-foreground">
            {t("clean.selected")}: <strong className="text-foreground text-base ml-1">{formatBytes(getSelectedSize())}</strong>
          </span>
        </div>
        <Button
          onClick={requestClean}
          disabled={cleaning || selectedIdes.size === 0}
          variant="destructive"
          size="lg"
          className="w-full md:w-auto shadow-lg shadow-destructive/20"
        >
          {cleaning ? <Loader2 size={18} className="animate-spin mr-2" /> : <Trash2 size={18} className="mr-2" />}
          {cleaning ? t("clean.cleaning") : t("clean.cleanSelected")}
        </Button>
      </div>
    </div>
  );
}

function IdeCleanCard({
  result,
  selected,
  selectedCategories,
  onToggleIde,
  onToggleCategory,
  categoryIcon,
}: {
  result: IdeScanResult;
  selected: boolean;
  selectedCategories: Set<string>;
  onToggleIde: () => void;
  onToggleCategory: (cat: string) => void;
  categoryIcon: (type: string) => React.ReactNode;
}) {
  return (
    <Card
      className={`transition-all duration-300 ${
        selected
          ? "border-primary/50 shadow-md"
          : "border-border/50 opacity-80 hover:opacity-100 hover:border-border hover:bg-muted/30"
      }`}
    >
      <div 
        onClick={onToggleIde}
        className="flex items-center justify-between p-4 cursor-pointer select-none group"
      >
        <div className="flex items-center gap-4 min-w-0">
          <Checkbox 
            checked={selected} 
            onCheckedChange={onToggleIde}
            className={`data-[state=checked]:bg-primary data-[state=checked]:border-primary border-muted-foreground/50 transition-all duration-200`}
          />
          
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm"
              style={{ backgroundColor: getIdeColor(result.ide_id) }}
            >
              <Monitor size={18} />
            </div>
            <span className={`font-bold text-sm truncate transition-colors ${selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
              {result.ide_name}
            </span>
          </div>
        </div>
        <span className={`text-xs font-mono font-medium shrink-0 transition-colors ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {formatBytes(result.total_size)}
        </span>
      </div>

      {selected && (
        <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-2 fade-in duration-200">
          <Separator className="mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-10">
            {result.categories.map((cat) => (
              <div
                key={cat.name}
                onClick={() => onToggleCategory(cat.name)}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-all select-none border ${
                  selectedCategories.has(cat.name)
                    ? "bg-primary/5 border-primary/20 shadow-sm"
                    : "bg-muted/30 border-transparent hover:bg-muted/60 hover:border-border/50"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox 
                    checked={selectedCategories.has(cat.name)}
                    className="data-[state=checked]:bg-primary/80 border-muted-foreground/40 w-4 h-4 rounded-[4px]"
                  />
                  <div className="flex items-center gap-2.5 min-w-0 text-muted-foreground">
                    <div className="opacity-80">
                      {categoryIcon(cat.category_type)}
                    </div>
                    <span className={`text-xs font-medium truncate ${selectedCategories.has(cat.name) ? "text-foreground" : ""}`}>
                      {cat.name}
                    </span>
                  </div>
                </div>
                <span className={`text-xs shrink-0 font-mono ${selectedCategories.has(cat.name) ? "text-foreground" : "text-muted-foreground"}`}>
                  {formatBytes(cat.total_size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}


