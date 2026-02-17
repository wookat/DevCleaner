import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Database,
  FileText,
  Folder,
  Puzzle,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  ArrowRight,
  FolderOpen,
  Globe,
} from "lucide-react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";
import type { ScanSummary, CleanMode, CleanResult, IdeScanResult, CategoryType, IdeInfo, ScanCategory, StorageEntry } from "../types";
import { formatBytes, formatNumber, formatDuration, getIdeColor } from "../utils/formatters";
import { useIdeIcons } from "../hooks/useIdeIcons";
import IdeIcon from "./IdeIcon";
import { loadSettings } from "../utils/storage";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";

let cachedScanResult: ScanSummary | null = null;

async function openPath(path: string) {
  try {
    await invoke("open_path", { path });
  } catch {
    // ignore
  }
}

export default function ScanCleanPage() {
  const { t } = useTranslation();
  const initialSettings = loadSettings();
  const [scanResult, setScanResult] = useState<ScanSummary | null>(cachedScanResult);
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
  const [installedIdes, setInstalledIdes] = useState<IdeInfo[]>([]);
  const ideIcons = useIdeIcons();

  useEffect(() => {
    if (cachedScanResult) {
      applyModeSelection(cachedScanResult, cleanMode);
    }
    loadIdes();
  }, []);

  async function loadIdes() {
    try {
      const result = await invoke<IdeInfo[]>("detect_ides");
      setInstalledIdes(result.filter((i) => i.installed));
    } catch {
      // ignore
    }
  }

  function getAllowedCategoryTypes(mode: CleanMode): Set<CategoryType> {
    switch (mode) {
      case "Safe":
        return new Set(["Cache", "Log"]);
      case "Recommended":
        return new Set(["Cache", "Log", "WorkspaceStorage", "CrashReport"]);
      case "Aggressive":
        return new Set(["Cache", "Log", "WorkspaceStorage", "CrashReport", "Extension", "GlobalStorage"]);
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

  async function handleScan() {
    setScanning(true);
    setError(null);
    setCleanResults([]);
    try {
      const result = await invoke<ScanSummary>("scan_all_ides");
      setScanResult(result);
      cachedScanResult = result;
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
      cachedScanResult = newScan;
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
      case "GlobalStorage": return <Globe size={14} className="text-cyan-400" />;
      default: return <FileText size={14} />;
    }
  };

  // Treemap data — flat structure to avoid nested depth issues
  const treemapData = scanResult
    ? scanResult.results
        .filter((r) => r.total_size > 0)
        .flatMap((r) =>
          r.categories.map((c) => ({
            name: `${r.ide_name} · ${c.name}`,
            size: c.total_size,
            fill: getIdeColor(r.ide_id),
            ideName: r.ide_name,
          }))
        )
    : [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t("scan.title")}</h2>
            <p className="text-muted-foreground mt-1">{t("scan.subtitle")}</p>
          </div>
          {scanResult && (
            <Button onClick={handleScan} disabled={scanning} variant="outline" className="shadow-sm">
              <RefreshCw size={16} className={`mr-2 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? t("dashboard.scanning") : t("scan.rescan")}
            </Button>
          )}
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
                    <span className="font-medium">{r.ide_id}</span>
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

        {scanResult ? (
          <div className="space-y-6">
            {/* Summary Stats Bar */}
            <Card className="bg-gradient-to-r from-primary/10 via-card to-card border-primary/20">
              <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("dashboard.totalSize")}</p>
                    <p className="text-2xl font-bold tracking-tight">{formatBytes(scanResult.grand_total_size)}</p>
                  </div>
                </div>
                <Separator orientation="vertical" className="h-10 hidden sm:block" />
                <Badge variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                  <FileText size={14} className="mr-2 opacity-70" />
                  {formatNumber(scanResult.grand_total_files)} {t("dashboard.files")}
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                  <Loader2 size={14} className="mr-2 opacity-70" />
                  {formatDuration(scanResult.scan_duration_ms)}
                </Badge>
              </CardContent>
            </Card>

            {/* Treemap Visualization */}
            {treemapData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive size={18} className="text-primary" />
                    {t("scan.spaceMap")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <Treemap
                        data={treemapData}
                        dataKey="size"
                        aspectRatio={4 / 3}
                        stroke="var(--color-background)"
                        content={<TreemapCell />}
                      >
                        <Tooltip
                          formatter={(value) => formatBytes(Number(value))}
                          contentStyle={{
                            backgroundColor: "var(--color-surface)",
                            borderColor: "var(--color-border)",
                            borderRadius: "8px",
                            color: "var(--color-text)",
                            fontSize: "12px",
                          }}
                        />
                      </Treemap>
                    </ResponsiveContainer>
                  </div>
                  {/* Treemap Legend */}
                  <div className="flex flex-wrap gap-3 mt-3">
                    {scanResult.results
                      .filter((r) => r.total_size > 0)
                      .map((r) => (
                        <div key={r.ide_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getIdeColor(r.ide_id) }} />
                          <span>{r.ide_name}</span>
                          <span className="font-mono font-medium text-foreground">{formatBytes(r.total_size)}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Clean Mode Selection */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("clean.cleanMode")}</h3>
              {modeHint && (
                <div className="mb-3 inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                  {modeHint}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <div className="space-y-4 pb-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("clean.selectItems")}</h3>
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
                    iconBase64={ideIcons[result.ide_id]}
                  />
                ))}
            </div>
          </div>
        ) : (
          /* Empty State / Scanning State */
          <div className="min-h-[360px] flex items-start justify-center pt-8">
            {scanning ? (
              <div className="flex flex-col items-center gap-6 pt-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                  <Loader2 size={64} className="text-primary animate-spin relative z-10" />
                </div>
                <p className="text-lg font-medium text-muted-foreground animate-pulse">{t("dashboard.scanning")}</p>
              </div>
            ) : (
              <Card className="max-w-xl w-full border-dashed border-2 bg-transparent shadow-none">
                <CardContent className="flex flex-col items-center text-center p-8 sm:p-10">
                  <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-6 text-primary animate-in zoom-in duration-300">
                    <HardDrive size={40} />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{t("scan.readyTitle")}</h3>
                  <p className="text-muted-foreground mb-6 leading-relaxed max-w-md">
                    {t("scan.readyDesc", { count: installedIdes.length })}
                  </p>
                  <Button onClick={handleScan} size="lg" className="min-w-48 text-base">
                    {t("scan.startScan")}
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Fixed Action Bar */}
      {scanResult && (
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
      )}

      {/* Confirm Dialog — rendered via Portal to cover full window */}
      {confirmStep !== "idle" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Treemap custom cell renderer ── */
function TreemapCell(props: any) {
  const { x, y, width, height, name, fill, root } = props;
  if (!width || !height || width < 2 || height < 2) return null;

  const cellFill = fill || root?.fill || "#666";
  const displaySize = root?.size ?? props.value ?? 0;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={cellFill}
        stroke="var(--color-background)"
        strokeWidth={2}
        rx={4}
        style={{ opacity: 0.88 }}
      />
      {width > 60 && height > 28 && (
        <>
          <text
            x={x + 6}
            y={y + 16}
            fill="white"
            fontSize={11}
            fontWeight="600"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)", pointerEvents: "none" }}
          >
            {(name || "").length > Math.floor(width / 7) ? (name || "").slice(0, Math.floor(width / 7)) + "…" : name}
          </text>
          {height > 38 && (
            <text
              x={x + 6}
              y={y + 30}
              fill="rgba(255,255,255,0.75)"
              fontSize={10}
              style={{ pointerEvents: "none" }}
            >
              {formatBytes(displaySize)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/* ── IDE Card with categories showing paths ── */
function IdeCleanCard({
  result,
  selected,
  selectedCategories,
  onToggleIde,
  onToggleCategory,
  categoryIcon,
  iconBase64,
}: {
  result: IdeScanResult;
  selected: boolean;
  selectedCategories: Set<string>;
  onToggleIde: () => void;
  onToggleCategory: (cat: string) => void;
  categoryIcon: (type: string) => React.ReactNode;
  iconBase64?: string;
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
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary border-muted-foreground/50 transition-all duration-200"
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <IdeIcon ideId={result.ide_id} iconBase64={iconBase64} size={36} />
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
              <CategoryItem
                key={cat.name}
                cat={cat}
                isSelected={selectedCategories.has(cat.name)}
                onToggle={() => onToggleCategory(cat.name)}
                icon={categoryIcon(cat.category_type)}
                ideTotal={result.total_size}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Expandable category types ── */
const EXPANDABLE_TYPES: Set<string> = new Set(["Extension", "WorkspaceStorage", "GlobalStorage"]);

/* ── Single category item with path display + proportion bar + expandable sub-items ── */
function CategoryItem({
  cat,
  isSelected,
  onToggle,
  icon,
  ideTotal,
  onSizeChange,
}: {
  cat: ScanCategory;
  isSelected: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  ideTotal: number;
  onSizeChange?: () => void;
}) {
  const { t } = useTranslation();
  const primaryPath = cat.paths[0] || "";
  const shortPath = primaryPath.replace(/\\\\/g, "\\");
  const pct = ideTotal > 0 ? (cat.total_size / ideTotal) * 100 : 0;
  const canExpand = EXPANDABLE_TYPES.has(cat.category_type) && primaryPath;

  const [expanded, setExpanded] = useState(false);
  const [subItems, setSubItems] = useState<StorageEntry[]>([]);
  const [loadingSub, setLoadingSub] = useState(false);
  const [deletingPaths, setDeletingPaths] = useState<Set<string>>(new Set());

  const handleOpenPath = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (primaryPath) openPath(primaryPath);
    },
    [primaryPath]
  );

  const loadSubItems = useCallback(async () => {
    if (!primaryPath) return;
    setLoadingSub(true);
    try {
      const items = await invoke<StorageEntry[]>("list_storage_entries", { path: primaryPath });
      setSubItems(items);
    } catch { /* ignore */ }
    setLoadingSub(false);
  }, [primaryPath]);

  const handleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!expanded) loadSubItems();
    setExpanded(prev => !prev);
  }, [expanded, loadSubItems]);

  const handleDeleteItem = useCallback(async (e: React.MouseEvent, itemPath: string) => {
    e.stopPropagation();
    setDeletingPaths(prev => new Set(prev).add(itemPath));
    try {
      await invoke("delete_storage_entry", { path: itemPath });
      setSubItems(prev => prev.filter(i => i.path !== itemPath));
      onSizeChange?.();
    } catch { /* ignore */ }
    setDeletingPaths(prev => { const n = new Set(prev); n.delete(itemPath); return n; });
  }, [onSizeChange]);

  return (
    <div
      className={`flex flex-col gap-1.5 p-3 rounded-xl transition-all select-none border ${
        isSelected
          ? "bg-primary/5 border-primary/20 shadow-sm"
          : "bg-muted/30 border-transparent hover:bg-muted/60 hover:border-border/50"
      }`}
    >
      <div onClick={onToggle} className="flex items-center justify-between gap-2 cursor-pointer">
        <div className="flex items-center gap-3 min-w-0">
          <Checkbox
            checked={isSelected}
            className="data-[state=checked]:bg-primary/80 border-muted-foreground/40 w-4 h-4 rounded-[4px]"
          />
          <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
            <div className="opacity-80 shrink-0">{icon}</div>
            <span className={`text-xs font-medium truncate ${isSelected ? "text-foreground" : ""}`}>
              {cat.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground/60 font-mono">{pct.toFixed(0)}%</span>
          <span className={`text-xs font-mono ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
            {formatBytes(cat.total_size)}
          </span>
          {canExpand && (
            <button
              onClick={handleExpand}
              className="ml-1 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground"
              title={expanded ? t("scan.collapse", "收起") : t("scan.expand", "展开详情")}
            >
              <ArrowRight size={12} className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>
      </div>
      {/* Proportion bar */}
      <div className="ml-7 mr-1 h-1 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isSelected ? "bg-primary/60" : "bg-muted-foreground/20"}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      {/* Path display with click-to-open */}
      {primaryPath && !expanded && (
        <button
          onClick={handleOpenPath}
          className="flex items-center gap-1.5 ml-7 text-[10px] text-muted-foreground/70 hover:text-primary transition-colors truncate text-left group/path"
          title={shortPath}
        >
          <FolderOpen size={10} className="shrink-0 opacity-60 group-hover/path:opacity-100" />
          <span className="truncate">{shortPath}</span>
        </button>
      )}
      {/* Expandable sub-items */}
      {expanded && (
        <div className="ml-7 mt-1 flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {loadingSub ? (
            <div className="flex items-center gap-2 py-2 text-muted-foreground/60">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-[10px]">{t("scan.loading", "加载中...")}</span>
            </div>
          ) : subItems.length === 0 ? (
            <span className="text-[10px] text-muted-foreground/50 py-1">{t("scan.noItems", "无子项")}</span>
          ) : (
            subItems.map((item) => (
              <div
                key={item.path}
                className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-muted/40 group/sub transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Folder size={11} className="shrink-0 text-muted-foreground/50" />
                  <span className="text-[11px] truncate text-muted-foreground group-hover/sub:text-foreground" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-muted-foreground/60">{formatBytes(item.size)}</span>
                  <button
                    onClick={(e) => handleDeleteItem(e, item.path)}
                    disabled={deletingPaths.has(item.path)}
                    className="opacity-0 group-hover/sub:opacity-100 p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                    title={t("scan.deleteItem", "删除此项")}
                  >
                    {deletingPaths.has(item.path) ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
