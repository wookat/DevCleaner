import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  HardDrive,
  RefreshCw,
  Monitor,
  FileText,
  Database,
  Folder,
  Puzzle,
  AlertTriangle,
  ArrowRight,
  PieChart as PieChartIcon,
  Loader2,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { useTranslation } from "react-i18next";
import type { IdeInfo, ScanSummary } from "../types";
import { formatBytes, formatNumber, formatDuration, getIdeColor } from "../utils/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

let cachedIdes: IdeInfo[] | null = null;
let cachedScanResult: ScanSummary | null = null;

export default function Dashboard() {
  const { t } = useTranslation();
  const [ides, setIdes] = useState<IdeInfo[]>([]);
  const [scanResult, setScanResult] = useState<ScanSummary | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedIdes) {
      setIdes(cachedIdes);
    } else {
      loadIdes();
    }

    if (cachedScanResult) {
      setScanResult(cachedScanResult);
    }
  }, []);

  async function loadIdes() {
    try {
      const result = await invoke<IdeInfo[]>("detect_ides");
      setIdes(result);
      cachedIdes = result;
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const result = await invoke<ScanSummary>("scan_all_ides");
      setScanResult(result);
      cachedScanResult = result;
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }

  const installedIdes = ides.filter((i) => i.installed);

  const pieData =
    scanResult?.results
      .filter((r) => r.total_size > 0)
      .map((r) => ({
        name: r.ide_name,
        value: r.total_size,
        color: getIdeColor(r.ide_id),
      })) || [];

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
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t("dashboard.title")}</h2>
          <p className="text-muted-foreground mt-2">
            {t("dashboard.subtitle")}
          </p>
        </div>
        {scanResult && (
          <Button
            onClick={handleScan}
            disabled={scanning}
            size="lg"
            className="shadow-md"
          >
            <RefreshCw size={18} className={`mr-2 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? t("dashboard.scanning") : t("dashboard.scanAll")}
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

      {scanResult ? (
        <div className="space-y-6">
          {/* Hero Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
            <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <HardDrive size={16} className="text-primary" />
                  {t("dashboard.totalSize")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-6xl font-bold tracking-tighter text-foreground">
                    {formatBytes(scanResult.grand_total_size).split(' ')[0]}
                  </span>
                  <span className="text-2xl font-medium text-muted-foreground">
                    {formatBytes(scanResult.grand_total_size).split(' ')[1]}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Badge variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                    <FileText size={14} className="mr-2 opacity-70" />
                    {formatNumber(scanResult.grand_total_files)} {t("dashboard.files")}
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                    <Loader2 size={14} className="mr-2 opacity-70" />
                    {formatDuration(scanResult.scan_duration_ms)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* IDE Status Grid */}
            <div className="grid grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 auto-rows-min content-start">
              {installedIdes.map((ide) => (
                <Card
                  key={ide.id}
                  className={`flex flex-col justify-between transition-all duration-200 ${
                    ide.installed
                      ? "hover:border-primary/50 hover:shadow-md"
                      : "opacity-60 grayscale bg-muted/50"
                  }`}
                >
                  <CardContent className="p-4 flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm"
                        style={{ backgroundColor: ide.installed ? getIdeColor(ide.id) : "#64748b" }}
                      >
                        <Monitor size={20} />
                      </div>
                      {ide.installed && <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_var(--color-success)]" />}
                    </div>
                    <div className="mt-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {ide.installed ? t("dashboard.installed") : t("dashboard.notFound")}
                      </p>
                      <p className="font-bold text-sm truncate">{ide.name}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Bottom Row: Charts & Details */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-[360px]">
            {/* Pie Chart */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon size={18} className="text-primary" />
                  {t("dashboard.sizeByIde")}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatBytes(Number(value))}
                        contentStyle={{
                          backgroundColor: "var(--color-surface)",
                          borderColor: "var(--color-border)",
                          borderRadius: "12px",
                          color: "var(--color-text)",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                        }}
                        itemStyle={{ color: "var(--color-text)" }}
                      />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    {t("dashboard.noData")}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed List */}
            <Card className="xl:col-span-2 flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database size={18} className="text-primary" />
                  {t("dashboard.detailedResults")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto pr-2">
                <div className="space-y-6">
                  {scanResult.results
                    .filter((r) => r.total_size > 0)
                    .map((result, idx) => (
                      <div key={result.ide_id}>
                        {idx > 0 && <Separator className="my-6 opacity-50" />}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-1.5 h-6 rounded-full"
                              style={{ backgroundColor: getIdeColor(result.ide_id) }}
                            />
                            <span className="font-bold text-lg">{result.ide_name}</span>
                          </div>
                          <span className="font-mono font-bold text-lg text-foreground">
                            {formatBytes(result.total_size)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4">
                          {result.categories.map((cat) => (
                            <div
                              key={cat.name}
                              className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-transparent hover:border-border transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 bg-background rounded-lg text-muted-foreground shadow-sm">
                                  {categoryIcon(cat.category_type)}
                                </div>
                                <span className="text-sm font-medium truncate text-muted-foreground">{cat.name}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-bold">{formatBytes(cat.total_size)}</div>
                                <div className="text-xs text-muted-foreground/70">
                                  {formatNumber(cat.file_count)} {t("dashboard.files")}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="min-h-[420px] flex items-start justify-center pt-12">
          {!scanning && (
            <Card className="max-w-xl w-full border-dashed border-2 bg-transparent shadow-none">
              <CardContent className="flex flex-col items-center text-center p-8 sm:p-10">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-6 text-primary animate-in zoom-in duration-300">
                  <HardDrive size={40} />
                </div>
                <h3 className="text-2xl font-bold mb-2">{t("dashboard.readyToScan")}</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed max-w-md">
                  {t("dashboard.readyToScanDesc", { count: installedIdes.length })}
                </p>
                <Button onClick={handleScan} size="lg" className="min-w-48 text-base">
                  {t("dashboard.scanAll")}
                  <ArrowRight size={18} className="ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}
          {scanning && (
            <div className="flex flex-col items-center gap-6 pt-8">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                <Loader2 size={64} className="text-primary animate-spin relative z-10" />
              </div>
              <p className="text-lg font-medium text-muted-foreground animate-pulse">{t("dashboard.scanning")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
