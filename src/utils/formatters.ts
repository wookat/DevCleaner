export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function getIdeColor(ideId: string): string {
  const colors: Record<string, string> = {
    vscode: "#007ACC",
    cursor: "#7C3AED",
    windsurf: "#06B6D4",
    kiro: "#F59E0B",
    trae: "#10B981",
    trae_cn: "#10B981",
    qoder: "#E11D48",
    intellij: "#FE315D",
    pycharm: "#21D789",
    webstorm: "#07C3F2",
    goland: "#07C3F2",
    clion: "#21D789",
    rider: "#C90F5E",
    phpstorm: "#B345F1",
    rubymine: "#FE2857",
    datagrip: "#22D88F",
    rustrover: "#FE315D",
    dataspell: "#087CFA",
    aqua: "#07C3F2",
    android_studio: "#3DDC84",
    fleet: "#7B61FF",
    antigravity: "#4285F4",
    pearai: "#22C55E",
    aide: "#F97316",
    positron: "#4E7FBF",
    vscodium: "#2F80ED",
    void: "#8B5CF6",
  };
  return colors[ideId] || "#6366F1";
}

export function getIdeIcon(ideId: string): string {
  const icons: Record<string, string> = {
    vscode: "VS",
    cursor: "Cu",
    windsurf: "Ws",
    kiro: "Ki",
    trae: "Tr",
    trae_cn: "Tr",
    qoder: "Qo",
    intellij: "IJ",
    pycharm: "Py",
    webstorm: "WS",
    goland: "Go",
    clion: "CL",
    rider: "Rd",
    phpstorm: "PS",
    rubymine: "RM",
    datagrip: "DG",
    rustrover: "RR",
    dataspell: "DS",
    aqua: "Aq",
    android_studio: "AS",
    fleet: "Fl",
    antigravity: "AG",
    pearai: "PA",
    aide: "Ai",
    positron: "Po",
    vscodium: "VC",
    void: "Vo",
  };
  return icons[ideId] || ideId.slice(0, 2).toUpperCase();
}

export function getCategoryIcon(categoryType: string): string {
  const icons: Record<string, string> = {
    Cache: "database",
    Log: "file-text",
    WorkspaceStorage: "folder",
    Extension: "puzzle",
    CrashReport: "alert-triangle",
    GlobalStorage: "globe",
  };
  return icons[categoryType] || "file";
}
