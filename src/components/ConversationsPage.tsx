import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  MessageSquare,
  Loader2,
  Trash2,
  FolderOpen,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Database,
  HardDrive,
  X,
  User,
  Bot,
  Eye,
  Clock,
  HardDriveDownload,
  CheckSquare,
  Square,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import type { IdeInfo, ConversationListResult, ConversationInfo, ConversationContent, DbFileInfo } from "../types";
import { formatBytes } from "../utils/formatters";
import { useIdeIcons } from "../hooks/useIdeIcons";
import IdeIcon from "./IdeIcon";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

type SortMode = "time" | "size";
type SortDir = "asc" | "desc";

export default function ConversationsPage() {
  const { t } = useTranslation();
  const [ides, setIdes] = useState<IdeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIde, setExpandedIde] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Map<string, ConversationListResult>>(new Map());
  const [loadingIde, setLoadingIde] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ideIcons = useIdeIcons();
  const [viewingConv, setViewingConv] = useState<ConversationInfo | null>(null);
  const [convContent, setConvContent] = useState<ConversationContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Sort & selection state
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  useEffect(() => {
    loadIdes();
  }, []);

  // Clear selection when IDE changes
  useEffect(() => { setSelectedIds(new Set()); }, [expandedIde]);

  async function loadIdes() {
    setLoading(true);
    try {
      const result = await invoke<IdeInfo[]>("detect_ides");
      const vsIdes = result.filter((i) => i.installed && i.ide_type === "VscodeBased");
      setIdes(vsIdes);
      for (const ide of vsIdes) {
        loadConversations(ide.id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function toggleIde(ideId: string) {
    if (expandedIde === ideId) {
      setExpandedIde(null);
      return;
    }
    setExpandedIde(ideId);
    if (!conversations.has(ideId)) {
      await loadConversations(ideId);
    }
  }

  async function loadConversations(ideId: string) {
    setLoadingIde(ideId);
    setError(null);
    try {
      const convResult = await invoke<ConversationListResult>("scan_conversations", { ideId });
      setConversations((prev) => new Map(prev).set(ideId, convResult));
      setSelectedIds(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingIde(null);
    }
  }

  async function handleDeleteConversation(conv: ConversationInfo, ideId: string) {
    setDeleting(conv.id);
    try {
      await invoke("delete_conversation", {
        sourceDb: conv.source_db,
        sourceKey: conv.source_key,
      });
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(conv.id); return n; });
      await loadConversations(ideId);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(null);
    }
  }

  async function handleBatchDelete(ideId: string, convs: ConversationInfo[]) {
    const selected = convs.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    const msg = t("conversations.batchDeleteConfirm", { count: selected.length });
    if (!window.confirm(msg)) return;

    setBatchDeleting(true);
    try {
      await invoke("delete_conversations_batch", {
        items: selected.map((c) => ({ source_db: c.source_db, source_key: c.source_key })),
      });
      setSelectedIds(new Set());
      await loadConversations(ideId);
    } catch (e) {
      setError(String(e));
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleViewConversation(conv: ConversationInfo) {
    setViewingConv(conv);
    setConvContent(null);
    setLoadingContent(true);
    try {
      if (conv.id.startsWith("pb:")) {
        setConvContent({ title: conv.title, messages: [{ role: "system", content: t("conversations.binaryContent") }] });
        return;
      }
      const parts = conv.id.split(":");
      const conversationId = parts.length >= 3 ? parts.slice(2).join(":") : "";
      const result = await invoke<ConversationContent>("get_conversation_content", {
        sourceDb: conv.source_db,
        sourceKey: conv.source_key,
        conversationId,
      });
      setConvContent(result);
    } catch (e) {
      setConvContent({ title: conv.title, messages: [] });
    } finally {
      setLoadingContent(false);
    }
  }

  async function handleOpenPath(path: string) {
    try { await invoke("open_path", { path }); } catch { /* ignore */ }
  }

  const handleSortToggle = useCallback((mode: SortMode) => {
    if (sortMode === mode) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortMode(mode);
      setSortDir("desc");
    }
  }, [sortMode]);

  // Sort conversations client-side
  const sortConversations = useCallback((convs: ConversationInfo[]): ConversationInfo[] => {
    return [...convs].sort((a, b) => {
      const mul = sortDir === "desc" ? 1 : -1;
      if (sortMode === "size") return mul * (b.size_bytes - a.size_bytes);
      return mul * ((b.last_modified ?? 0) - (a.last_modified ?? 0));
    });
  }, [sortMode, sortDir]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const selectAllToggle = useCallback((convs: ConversationInfo[]) => {
    setSelectedIds((prev) => {
      const allSelected = convs.every((c) => prev.has(c.id));
      if (allSelected) return new Set();
      return new Set(convs.map((c) => c.id));
    });
  }, []);

  const selectBefore = useCallback((sorted: ConversationInfo[], idx: number) => {
    setSelectedIds(new Set(sorted.slice(0, idx + 1).map((c) => c.id)));
  }, []);

  const selectAfter = useCallback((sorted: ConversationInfo[], idx: number) => {
    setSelectedIds(new Set(sorted.slice(idx).map((c) => c.id)));
  }, []);

  const vsCodeIdes = ides.filter((i) => i.ide_type === "VscodeBased");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              {t("conversations.title")}
            </h2>
            <p className="text-muted-foreground mt-1">{t("conversations.subtitle")}</p>
          </div>
          <Button onClick={loadIdes} disabled={loading} variant="outline" className="shadow-sm">
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

        {loading ? (
          <div className="flex flex-col items-center gap-4 pt-16">
            <Loader2 size={48} className="text-primary animate-spin" />
            <p className="text-muted-foreground">{t("dashboard.scanning")}</p>
          </div>
        ) : vsCodeIdes.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="flex flex-col items-center text-center p-10">
              <MessageSquare size={48} className="text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t("conversations.noIdes")}</h3>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {vsCodeIdes.map((ide) => {
              const isExpanded = expandedIde === ide.id;
              const convData = conversations.get(ide.id);
              const isLoading = loadingIde === ide.id;
              const sorted = convData ? sortConversations(convData.conversations) : [];
              const allSelected = sorted.length > 0 && sorted.every((c) => selectedIds.has(c.id));
              const someSelected = sorted.some((c) => selectedIds.has(c.id));
              const selectedCount = sorted.filter((c) => selectedIds.has(c.id)).length;

              return (
                <Card key={ide.id} className="transition-all duration-200">
                  {/* IDE Header */}
                  <button
                    onClick={() => toggleIde(ide.id)}
                    className="w-full flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-muted/30 rounded-t-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <IdeIcon ideId={ide.id} iconBase64={ideIcons[ide.id]} size={32} />
                      <div className="text-left">
                        <span className="font-bold text-sm">{ide.name}</span>
                        {convData && (
                          <p className="text-xs text-muted-foreground">
                            {convData.conversations.length} {t("conversations.chats")} · {formatBytes(convData.total_size)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLoading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
                      {isExpanded ? (
                        <ChevronDown size={18} className="text-muted-foreground" />
                      ) : (
                        <ChevronRight size={18} className="text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 fade-in duration-200">
                      <Separator className="mb-3" />

                      {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 size={24} className="animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Database files overview */}
                          {convData && convData.db_files && convData.db_files.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                <HardDrive size={12} />
                                {t("conversations.dbFiles")}
                              </h4>
                              <div className="space-y-1.5">
                                {convData.db_files.map((df: DbFileInfo) => (
                                  <div key={df.path} className="flex items-center justify-between p-2 rounded-lg border border-border/50 bg-muted/20">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <Database size={13} className="text-primary/60 shrink-0" />
                                      <span className="text-xs truncate">{df.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        {formatBytes(df.size)}
                                      </Badge>
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleOpenPath(df.path)}>
                                        <FolderOpen size={12} />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Conversations list */}
                          {sorted.length > 0 && (
                            <div>
                              {/* Toolbar: sort + select all + batch delete */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <MessageSquare size={12} />
                                    {t("conversations.chatHistory")} ({sorted.length})
                                  </h4>
                                  {/* Sort toggle */}
                                  <div className="flex items-center bg-muted/40 rounded-md p-0.5 ml-2">
                                    <button
                                      onClick={() => handleSortToggle("time")}
                                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sortMode === "time" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                      <Clock size={10} />
                                      {t("conversations.sortByTime")}
                                      {sortMode === "time" && <span className="text-[9px] opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                                    </button>
                                    <button
                                      onClick={() => handleSortToggle("size")}
                                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sortMode === "size" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                      <HardDriveDownload size={10} />
                                      {t("conversations.sortBySize")}
                                      {sortMode === "size" && <span className="text-[9px] opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {/* Select all */}
                                  <button
                                    onClick={() => selectAllToggle(sorted)}
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                                    {allSelected ? t("conversations.deselectAll") : t("conversations.selectAll")}
                                  </button>
                                  {/* Batch delete */}
                                  {someSelected && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-6 text-[10px] px-2"
                                      disabled={batchDeleting}
                                      onClick={() => handleBatchDelete(ide.id, sorted)}
                                    >
                                      {batchDeleting ? <Loader2 size={10} className="animate-spin mr-1" /> : <Trash2 size={10} className="mr-1" />}
                                      {t("conversations.deleteSelected", { count: selectedCount })}
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {/* Selection info bar */}
                              {someSelected && (
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-primary/5 border border-primary/10 rounded-md px-2.5 py-1 mb-2">
                                  <CheckSquare size={10} className="text-primary" />
                                  {t("conversations.selected", { count: selectedCount })} ·{" "}
                                  {formatBytes(sorted.filter((c) => selectedIds.has(c.id)).reduce((s, c) => s + c.size_bytes, 0))}
                                </div>
                              )}

                              <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                                {sorted.map((conv, idx) => (
                                  <ConversationItem
                                    key={conv.id}
                                    conv={conv}
                                    selected={selectedIds.has(conv.id)}
                                    deleting={deleting === conv.id}
                                    onToggleSelect={() => toggleSelect(conv.id)}
                                    onDelete={() => handleDeleteConversation(conv, ide.id)}
                                    onView={() => handleViewConversation(conv)}
                                    onSelectBefore={() => selectBefore(sorted, idx)}
                                    onSelectAfter={() => selectAfter(sorted, idx)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Empty state */}
                          {(!convData || (convData.conversations.length === 0 && (!convData.db_files || convData.db_files.length === 0))) && (
                            <div className="text-center py-6 text-muted-foreground">
                              <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                              <p className="text-sm">{t("conversations.noData")}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {/* Conversation Content Viewer */}
      {viewingConv && createPortal(
        <ConversationViewer
          conv={viewingConv}
          content={convContent}
          loading={loadingContent}
          onClose={() => { setViewingConv(null); setConvContent(null); }}
          t={t}
        />,
        document.body
      )}
    </div>
  );
}

function ConversationItem({
  conv, selected, deleting, onToggleSelect, onDelete, onView, onSelectBefore, onSelectAfter,
}: {
  conv: ConversationInfo;
  selected: boolean;
  deleting: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onView: () => void;
  onSelectBefore: () => void;
  onSelectAfter: () => void;
}) {
  const { t } = useTranslation();
  const modified = conv.last_modified
    ? new Date(conv.last_modified * 1000).toLocaleDateString()
    : null;

  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors group ${
      selected ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20 hover:bg-muted/40"
    }`}>
      {/* Checkbox */}
      <button
        onClick={onToggleSelect}
        className="shrink-0 mr-2 text-muted-foreground hover:text-primary transition-colors"
      >
        {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
      </button>

      {/* Content (clickable to view) */}
      <button
        onClick={onView}
        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer text-left"
      >
        <MessageSquare size={14} className="text-primary/60 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{conv.title}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {conv.message_count > 0 && <span>{conv.message_count} messages</span>}
            {modified && <span>· {modified}</span>}
            <span>· {formatBytes(conv.size_bytes)}</span>
          </div>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 ml-2">
        <Button
          size="sm" variant="ghost" title={t("conversations.selectBefore")}
          className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onSelectBefore}
        >
          <ChevronsUp size={12} />
        </Button>
        <Button
          size="sm" variant="ghost" title={t("conversations.selectAfter")}
          className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onSelectAfter}
        >
          <ChevronsDown size={12} />
        </Button>
        <Button
          size="sm" variant="ghost"
          className="h-6 w-6 p-0 text-primary/60 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onView}
        >
          <Eye size={12} />
        </Button>
        <Button
          size="sm" variant="ghost"
          className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </Button>
      </div>
    </div>
  );
}

/* ── Conversation Content Viewer ── */
function ConversationViewer({
  conv,
  content,
  loading,
  onClose,
  t,
}: {
  conv: ConversationInfo;
  content: ConversationContent | null;
  loading: boolean;
  onClose: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[80vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{content?.title || conv.title}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {conv.message_count > 0 && <>{conv.message_count} {t("conversations.messagesCount")} · </>}
              {formatBytes(conv.size_bytes)}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 ml-3" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : content && content.messages.length > 0 ? (
            content.messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "" : ""}`}>
                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary/15 text-primary"
                    : msg.role === "system"
                    ? "bg-amber-500/15 text-amber-600"
                    : "bg-emerald-500/15 text-emerald-600"
                }`}>
                  {msg.role === "user" ? <User size={12} /> : <Bot size={12} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">{msg.role}</p>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words bg-muted/30 rounded-lg px-3 py-2 border border-border/30">
                    {msg.content.length > 3000 ? msg.content.slice(0, 3000) + "..." : msg.content}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">{t("conversations.noMessages")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
