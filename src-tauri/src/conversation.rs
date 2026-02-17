use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationInfo {
    pub id: String,
    pub title: String,
    pub source_db: String,
    pub source_key: String,
    pub message_count: usize,
    pub size_bytes: u64,
    pub last_modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbFileInfo {
    pub path: String,
    pub size: u64,
    pub name: String,
    pub modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationListResult {
    pub ide_id: String,
    pub conversations: Vec<ConversationInfo>,
    pub db_files: Vec<DbFileInfo>,
    pub total_size: u64,
}

// ── Key patterns ──

// Exact keys for aggregated chat data (need full read)
const CHAT_DATA_KEYS: &[&str] = &[
    "workbench.panel.aichat.view.aichat.chatdata",
    "workbench.panel.chat.view.chatView.chatdata",
    "aiChat.chatdata",
    "chat.data",
    "cascade.chatdata",
    "cascade.conversations",
    "composer.composerData",
    "interactive.sessions",
];

// LIKE patterns for individual conversations in ItemTable
const ITEM_TABLE_LIKE: &[&str] = &[
    "composerData:%",
    "cascade.%",
    "chat.%",
    "aichat.%",
    "aiChat.%",
    "copilot.%",
    "trae.%",
    "marscode.%",
    "kiro.%",
    "memento/icube-ai-agent-storage",
    "memento/interactive-session%",
    "jetskiStateSync.agentManagerInitState",
    "antigravityUnifiedStateSync.trajectorySummaries",
];

// Discovery LIKE patterns for unknown key schemas
const DISCOVERY_LIKE: &[&str] = &[
    "%chatdata%",
    "%chatData%",
    "%conversation%",
    "%Conversation%",
];

// Keys that look like conversations but are actually metadata/config
const IGNORED_KEYS: &[&str] = &[
    "chat.participantNameRegistry",
    "chat.ChatSessionStore.index",
    "chat.workspaceTransfer",
    "chat.customModes",
    "chat.setupContext",
    "composer.planRegistry",
];

fn is_ignored_key(key: &str) -> bool {
    IGNORED_KEYS.contains(&key)
        || key.starts_with("workbench.panel.composerChatViewPane.")
        || key.starts_with("windsurf.cascadeViewContainerId.")
        || key.starts_with("workbench.panel.icube.")
        || key.starts_with("workbench.panel.chat")
        || key.starts_with("workbench.panel.chatSidebar")
        || key.starts_with("workbench.panel.chatEditing")
        || key.starts_with("workbench.view.trae.")
        || key.contains("AI.agent.model")
        || key.contains("AI.agent.modeList")
        || key.contains("sessionRelation:")
        || key.starts_with("currentAgentData_")
        || key.starts_with("icube_session_agent_map")
        || key.starts_with("icube-ai-agent-storage-input-history")
        || key.starts_with("chatHistoryNeedToBeMigrated")
        || key.starts_with("hasAutoNewSession")
        || key.ends_with(".hidden")
        || key.ends_with(".state")
}

const MAX_FULL_READ: u64 = 50_000_000;
const PREVIEW_LEN: usize = 8000;

// ── DB helpers ──

fn get_tables(conn: &Connection) -> Vec<String> {
    conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(0))
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default()
}

fn query_value_size(conn: &Connection, table: &str, key: &str) -> u64 {
    let sql = format!("SELECT length(value) FROM [{}] WHERE key = ?1", table);
    conn.query_row(&sql, [key], |row| row.get::<_, i64>(0))
        .unwrap_or(0) as u64
}

fn query_value_full(conn: &Connection, table: &str, key: &str) -> Option<String> {
    let sql = format!("SELECT value FROM [{}] WHERE key = ?1", table);
    conn.query_row(&sql, [key], |row| row.get::<_, String>(0)).ok()
}

struct KeyEntry {
    key: String,
    preview: String,
    size: u64,
}

fn scan_keys_preview(conn: &Connection, table: &str, pattern: &str) -> Vec<KeyEntry> {
    let sql = format!(
        "SELECT key, substr(value, 1, {}), length(value) FROM [{}] WHERE key LIKE ?1",
        PREVIEW_LEN, table
    );
    conn.prepare(&sql)
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([pattern], |row| {
                Ok(KeyEntry {
                    key: row.get::<_, String>(0)?,
                    preview: row.get::<_, String>(1).unwrap_or_default(),
                    size: row.get::<_, i64>(2).unwrap_or(0) as u64,
                })
            })
            .ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default()
}

// ── Generic conversation parser (handles multiple JSON formats) ──

fn parse_chat_value(json_str: &str, db_path: &str, key: &str, modified: Option<i64>) -> Vec<ConversationInfo> {
    let mut results = Vec::new();
    let parsed: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return results,
    };

    // 1. { "tabs": [...] } - Cursor/Windsurf chat mode
    if let Some(tabs) = parsed.get("tabs").and_then(|t| t.as_array()) {
        for (i, tab) in tabs.iter().enumerate() {
            if let Some(c) = try_parse_conversation_item(tab, db_path, key, i, modified) {
                results.push(c);
            }
        }
    }

    // 2. { "allComposers": [...] } - Cursor composer data
    if let Some(composers) = parsed.get("allComposers").and_then(|c| c.as_array()) {
        for (i, comp) in composers.iter().enumerate() {
            if let Some(c) = try_parse_conversation_item(comp, db_path, key, i, modified) {
                results.push(c);
            }
        }
    }

    // 3. Top-level array [{ ... }, { ... }]
    if results.is_empty() {
        if let Some(arr) = parsed.as_array() {
            for (i, item) in arr.iter().enumerate() {
                if let Some(c) = try_parse_conversation_item(item, db_path, key, i, modified) {
                    results.push(c);
                }
            }
        }
    }

    // 4. Try common wrapper keys: { "conversations": [...], "chats": [...], etc. }
    if results.is_empty() {
        for wrapper in &["conversations", "chats", "history", "data", "items", "threads", "sessions"] {
            if let Some(arr) = parsed.get(wrapper).and_then(|v| v.as_array()) {
                for (i, item) in arr.iter().enumerate() {
                    if let Some(c) = try_parse_conversation_item(item, db_path, key, i, modified) {
                        results.push(c);
                    }
                }
                if !results.is_empty() { break; }
            }
        }
    }

    // 5. Single conversation object at top level
    if results.is_empty() && parsed.is_object() {
        if let Some(c) = try_parse_conversation_item(&parsed, db_path, key, 0, modified) {
            results.push(c);
        }
    }

    results
}

fn try_parse_conversation_item(
    item: &serde_json::Value, db_path: &str, key: &str, idx: usize, modified: Option<i64>,
) -> Option<ConversationInfo> {
    if !item.is_object() { return None; }

    let title = item.get("chatTitle")
        .or_else(|| item.get("title"))
        .or_else(|| item.get("name"))
        .or_else(|| item.get("subject"))
        .or_else(|| item.get("description"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let msg_count = item.get("bubbles")
        .or_else(|| item.get("messages"))
        .or_else(|| item.get("conversation"))
        .or_else(|| item.get("turns"))
        .or_else(|| item.get("exchanges"))
        .or_else(|| item.get("entries"))
        .or_else(|| item.get("requests"))
        .and_then(|a| a.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let item_id = item.get("id")
        .or_else(|| item.get("chatId"))
        .or_else(|| item.get("composerId"))
        .or_else(|| item.get("conversationId"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let size = serde_json::to_string(item).map(|s| s.len() as u64).unwrap_or(0);

    // Skip tiny or completely empty entries
    if size < 50 && title.is_empty() && msg_count == 0 { return None; }
    if msg_count == 0 && title.is_empty() { return None; }

    Some(ConversationInfo {
        id: if item_id.is_empty() {
            format!("{}:{}:item_{}", db_path, key, idx)
        } else {
            format!("{}:{}:{}", db_path, key, item_id)
        },
        title: if title.is_empty() { format!("Chat {}", idx + 1) } else { title },
        source_db: db_path.to_string(),
        source_key: key.to_string(),
        message_count: msg_count,
        size_bytes: size,
        last_modified: modified,
    })
}

fn extract_from_preview(entry: &KeyEntry, db_path: &str, modified: Option<i64>) -> Option<ConversationInfo> {
    // Try special format handlers first
    if entry.key.starts_with("memento/interactive-session") {
        return extract_interactive_session(entry, db_path, modified);
    }
    if entry.key.starts_with("jetskiStateSync.") || entry.key.starts_with("antigravityUnifiedStateSync.") {
        return extract_antigravity_protobuf(entry, db_path, modified);
    }

    // Try full JSON parsing first (works for small values that fit in preview)
    let convs = parse_chat_value(&entry.preview, db_path, &entry.key, modified);
    if !convs.is_empty() {
        return convs.into_iter().next();
    }

    // Fallback: string-based title extraction for truncated JSON
    let title = extract_title_from_text(&entry.preview);
    let msg_count = count_messages_from_text(&entry.preview);

    if title.is_empty() && entry.size < 100 { return None; }

    Some(ConversationInfo {
        id: format!("{}:{}", db_path, entry.key),
        title: if title.is_empty() {
            clean_key_title(&entry.key)
        } else {
            title
        },
        source_db: db_path.to_string(),
        source_key: entry.key.clone(),
        message_count: msg_count,
        size_bytes: entry.size,
        last_modified: modified,
    })
}

/// Extract conversation from VSCode memento/interactive-session* keys.
/// Format: {"history":{"copilot":[{"text":"prompt1"},{"text":"prompt2"}]}}
fn extract_interactive_session(entry: &KeyEntry, db_path: &str, modified: Option<i64>) -> Option<ConversationInfo> {
    let parsed: serde_json::Value = serde_json::from_str(&entry.preview).ok()?;

    // Extract from {"history":{"copilot":[...]}} or {"history":{"chatParticipant":[...]}}
    let history = parsed.get("history").and_then(|h| h.as_object())?;
    let mut total_count = 0usize;
    let mut first_text = String::new();

    for (_participant, entries) in history {
        if let Some(arr) = entries.as_array() {
            total_count += arr.len();
            if first_text.is_empty() {
                if let Some(first) = arr.first() {
                    if let Some(t) = first.get("text").and_then(|v| v.as_str()) {
                        first_text = t.chars().take(80).collect();
                    }
                }
            }
        }
    }

    if total_count == 0 { return None; }

    let label = if entry.key.contains("view-copilot") {
        "Copilot Edits"
    } else {
        "Copilot Chat"
    };
    let title = if first_text.is_empty() {
        label.to_string()
    } else {
        format!("{}: {}", label, first_text)
    };

    Some(ConversationInfo {
        id: format!("{}:{}", db_path, entry.key),
        title,
        source_db: db_path.to_string(),
        source_key: entry.key.clone(),
        message_count: total_count,
        size_bytes: entry.size,
        last_modified: modified,
    })
}

/// Extract conversation info from Antigravity's protobuf-encoded keys.
/// These contain base64-encoded protobuf with conversation titles as UTF-8 strings.
fn extract_antigravity_protobuf(entry: &KeyEntry, db_path: &str, modified: Option<i64>) -> Option<ConversationInfo> {
    // The value is raw protobuf bytes (not base64 in the preview, since SQLite stores as TEXT)
    // Try to extract readable strings from the raw bytes
    let bytes = entry.preview.as_bytes();
    let titles = extract_readable_strings(bytes, 10);

    if titles.is_empty() { return None; }

    // First long readable string is likely the conversation title
    let title = titles.into_iter()
        .find(|s| s.len() >= 10 && s.chars().all(|c| c.is_alphanumeric() || c.is_whitespace() || ".,;:!?-_'\"()".contains(c)))
        .unwrap_or_else(|| "Antigravity Session".to_string());

    Some(ConversationInfo {
        id: format!("{}:{}", db_path, entry.key),
        title,
        source_db: db_path.to_string(),
        source_key: entry.key.clone(),
        message_count: 0,
        size_bytes: entry.size,
        last_modified: modified,
    })
}

/// Extract readable ASCII/UTF-8 strings from binary data.
fn extract_readable_strings(data: &[u8], min_len: usize) -> Vec<String> {
    let mut strings = Vec::new();
    let mut current = String::new();
    for &b in data {
        if b >= 0x20 && b < 0x7F {
            current.push(b as char);
        } else {
            if current.len() >= min_len {
                strings.push(current.clone());
            }
            current.clear();
        }
    }
    if current.len() >= min_len {
        strings.push(current);
    }
    strings
}

/// Clean up a raw DB key to produce a human-readable title.
fn clean_key_title(key: &str) -> String {
    let cleaned = key
        .strip_prefix("memento/").unwrap_or(key)
        .replace("icube-ai-agent-storage", "Trae AI Sessions")
        .replace("interactive-session-view-copilot", "Copilot Edits")
        .replace("interactive-session", "Copilot Chat");
    // For keys like "composerData:UUID", show just the UUID short form
    if let Some(uuid) = cleaned.strip_prefix("composerData:") {
        return format!("Composer {}", &uuid[..8.min(uuid.len())]);
    }
    cleaned
}

fn extract_title_from_text(text: &str) -> String {
    for prefix in &["\"chatTitle\":\"", "\"chatTitle\": \"", "\"name\":\"", "\"name\": \"", "\"title\":\"", "\"title\": \""] {
        if let Some(start) = text.find(prefix) {
            let value_start = start + prefix.len();
            let remaining = &text[value_start..];
            let mut end = 0;
            let bytes = remaining.as_bytes();
            while end < bytes.len() {
                if bytes[end] == b'\\' { end += 2; continue; }
                if bytes[end] == b'"' { break; }
                end += 1;
            }
            if end > 0 && end < 200 {
                return remaining[..end].to_string();
            }
        }
    }
    String::new()
}

fn count_messages_from_text(text: &str) -> usize {
    // Rough estimate: count occurrences of "role" fields which indicate messages
    text.matches("\"role\"").count()
        .max(text.matches("\"type\":\"user\"").count())
}

fn file_modified_time(path: &Path) -> Option<i64> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

// ── Core extraction ──

fn extract_from_db(db_path: &Path) -> Vec<ConversationInfo> {
    let mut results = Vec::new();
    let db_str = db_path.display().to_string();
    let modified = file_modified_time(db_path);

    let conn = match Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(c) => c,
        Err(_) => return results,
    };

    let tables = get_tables(&conn);
    let has_disk_kv = tables.iter().any(|t| t == "cursorDiskKV");
    let mut processed_keys = HashSet::new();

    // ── ItemTable ──
    if tables.iter().any(|t| t == "ItemTable") {
        // 1. Aggregated chat data keys (full read + multi-format parse)
        for key in CHAT_DATA_KEYS {
            let size = query_value_size(&conn, "ItemTable", key);
            if size < 10 { continue; }
            processed_keys.insert(key.to_string());
            if size < MAX_FULL_READ {
                if let Some(value) = query_value_full(&conn, "ItemTable", key) {
                    results.extend(parse_chat_value(&value, &db_str, key, modified));
                }
            } else {
                results.push(ConversationInfo {
                    id: format!("{}:{}", db_str, key),
                    title: key.to_string(),
                    source_db: db_str.clone(),
                    source_key: key.to_string(),
                    message_count: 0,
                    size_bytes: size,
                    last_modified: modified,
                });
            }
        }

        // 2. Individual conversation keys (preview read)
        if !has_disk_kv {
            for pattern in ITEM_TABLE_LIKE {
                let entries = scan_keys_preview(&conn, "ItemTable", pattern);
                for entry in &entries {
                    if processed_keys.contains(&entry.key) || is_ignored_key(&entry.key) { continue; }
                    processed_keys.insert(entry.key.clone());
                    if entry.size > 20 {
                        if let Some(conv) = extract_from_preview(entry, &db_str, modified) {
                            results.push(conv);
                        }
                    }
                }
            }
        }

        // 3. Discovery scan for unknown key patterns
        if results.is_empty() {
            for pattern in DISCOVERY_LIKE {
                let entries = scan_keys_preview(&conn, "ItemTable", pattern);
                for entry in &entries {
                    if processed_keys.contains(&entry.key) || is_ignored_key(&entry.key) { continue; }
                    processed_keys.insert(entry.key.clone());
                    if entry.size > 100 {
                        // Try full read for aggregated keys, preview for individual
                        if entry.size < MAX_FULL_READ && entry.size > 1000 {
                            if let Some(value) = query_value_full(&conn, "ItemTable", &entry.key) {
                                let convs = parse_chat_value(&value, &db_str, &entry.key, modified);
                                if !convs.is_empty() {
                                    results.extend(convs);
                                    continue;
                                }
                            }
                        }
                        if let Some(conv) = extract_from_preview(entry, &db_str, modified) {
                            results.push(conv);
                        }
                    }
                }
            }
        }
    }

    // ── cursorDiskKV (Cursor v2.0+) ──
    if has_disk_kv {
        results.extend(extract_cursor_disk_kv(&conn, &db_str, modified));
    }

    results
}

/// Dedicated extraction for Cursor's cursorDiskKV table.
/// composerData entries are TEXT (JSON) with `name` field.
/// bubbleId:composerId:bubbleId entries hold actual message data.
/// agentKv:blob entries are binary BLOBs.
fn extract_cursor_disk_kv(
    conn: &Connection,
    db_str: &str,
    modified: Option<i64>,
) -> Vec<ConversationInfo> {
    let mut results = Vec::new();

    // Build a map: composerId → total bubbleId data size
    let bubble_sizes = query_bubble_sizes_by_composer(conn);

    // composerData:UUID → full read (total ~6MB, safe to read all)
    let mut stmt = match conn.prepare(
        "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%' AND typeof(value) = 'text' AND length(value) > 50"
    ) {
        Ok(s) => s,
        Err(_) => return results,
    };
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    });
    if let Ok(rows) = rows {
        for row in rows.filter_map(|r| r.ok()) {
            let (key, value) = row;
            // Extract composerId for bubble size lookup
            let composer_id = serde_json::from_str::<serde_json::Value>(&value).ok()
                .and_then(|v| v.get("composerId").and_then(|c| c.as_str()).map(|s| s.to_string()));
            if let Some(mut conv) = parse_cursor_composer_data(&value, db_str, &key, modified) {
                if let Some(ref cid) = composer_id {
                    if let Some(bubble_size) = bubble_sizes.get(cid) {
                        conv.size_bytes += bubble_size;
                    }
                }
                results.push(conv);
            }
        }
    }

    results
}

/// Query total size of bubbleId:composerId:* entries grouped by composerId.
fn query_bubble_sizes_by_composer(conn: &Connection) -> std::collections::HashMap<String, u64> {
    let mut map = std::collections::HashMap::new();
    // bubbleId keys have format: bubbleId:{composerId}:{bubbleId}
    let sql = "SELECT key, length(value) FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'";
    if let Ok(mut stmt) = conn.prepare(sql) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1).unwrap_or(0) as u64))
        }) {
            for row in rows.filter_map(|r| r.ok()) {
                let (key, size) = row;
                // Extract composerId from "bubbleId:{composerId}:{bubbleId}"
                let parts: Vec<&str> = key.splitn(3, ':').collect();
                if parts.len() >= 2 {
                    *map.entry(parts[1].to_string()).or_insert(0u64) += size;
                }
            }
        }
    }
    map
}

/// Parse a single Cursor composerData JSON entry.
fn parse_cursor_composer_data(
    json_str: &str,
    db_path: &str,
    key: &str,
    modified: Option<i64>,
) -> Option<ConversationInfo> {
    let parsed: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let obj = parsed.as_object()?;

    let composer_id = obj.get("composerId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let title = obj.get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| obj.get("subtitle").and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
        .unwrap_or("")
        .to_string();

    let msg_count = obj.get("fullConversationHeadersOnly")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let size = json_str.len() as u64;

    if title.is_empty() && msg_count == 0 { return None; }

    let created_at = obj.get("createdAt")
        .and_then(|v| v.as_i64())
        .map(|ms| ms / 1000);

    Some(ConversationInfo {
        id: format!("{}:{}:{}", db_path, key, if composer_id.is_empty() { key } else { &composer_id }),
        title: if title.is_empty() { composer_id.clone() } else { title },
        source_db: db_path.to_string(),
        source_key: key.to_string(),
        message_count: msg_count,
        size_bytes: size,
        last_modified: created_at.or(modified),
    })
}

// ── Conversation content viewer ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationContent {
    pub title: String,
    pub messages: Vec<ConversationMessage>,
}

fn extract_message_content(val: &serde_json::Value) -> String {
    // Direct string
    if let Some(s) = val.as_str() {
        return s.to_string();
    }
    // Object with text/content/message field
    if let Some(obj) = val.as_object() {
        for key in &["text", "content", "message", "body", "value"] {
            if let Some(v) = obj.get(*key) {
                if let Some(s) = v.as_str() {
                    return s.to_string();
                }
            }
        }
    }
    // Array of parts (e.g. [{ "text": "..." }])
    if let Some(arr) = val.as_array() {
        let parts: Vec<String> = arr.iter()
            .filter_map(|p| {
                p.as_str().map(|s| s.to_string())
                    .or_else(|| p.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
                    .or_else(|| p.get("content").and_then(|t| t.as_str()).map(|s| s.to_string()))
            })
            .collect();
        if !parts.is_empty() {
            return parts.join("\n");
        }
    }
    String::new()
}

fn normalize_role(val: &serde_json::Value) -> String {
    let role_str = val.get("role")
        .or_else(|| val.get("type"))
        .or_else(|| val.get("sender"))
        .or_else(|| val.get("author"))
        .and_then(|r| r.as_str())
        .unwrap_or("unknown");

    match role_str.to_lowercase().as_str() {
        "user" | "human" => "user".to_string(),
        "assistant" | "ai" | "bot" | "model" | "gpt" | "claude" | "gemini" => "assistant".to_string(),
        "system" => "system".to_string(),
        _ => role_str.to_string(),
    }
}

fn extract_messages_from_item(item: &serde_json::Value) -> Vec<ConversationMessage> {
    let mut messages = Vec::new();

    // Try various message array keys
    let msg_array = item.get("bubbles")
        .or_else(|| item.get("messages"))
        .or_else(|| item.get("conversation"))
        .or_else(|| item.get("turns"))
        .or_else(|| item.get("exchanges"))
        .and_then(|a| a.as_array());

    if let Some(arr) = msg_array {
        for msg in arr {
            let role = normalize_role(msg);

            // Try to get content from various fields
            let content = msg.get("text")
                .or_else(|| msg.get("content"))
                .or_else(|| msg.get("message"))
                .or_else(|| msg.get("body"))
                .or_else(|| msg.get("value"))
                .map(|v| extract_message_content(v))
                .unwrap_or_default();

            if content.is_empty() { continue; }

            messages.push(ConversationMessage { role, content });
        }
    }

    // If no messages found via arrays, check for rawText/codeBlocks patterns in Cursor bubbles
    if messages.is_empty() {
        if let Some(arr) = item.get("bubbles").and_then(|a| a.as_array()) {
            for bubble in arr {
                let role = normalize_role(bubble);
                // rawText field used in some Cursor versions
                let content = bubble.get("rawText")
                    .or_else(|| bubble.get("displayText"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if content.is_empty() { continue; }
                messages.push(ConversationMessage { role, content });
            }
        }
    }

    messages
}

fn find_conversation_in_aggregated(
    parsed: &serde_json::Value,
    conversation_id: &str,
) -> Option<serde_json::Value> {
    // Collect all arrays from known wrapper keys + top-level array
    let mut arrays: Vec<&Vec<serde_json::Value>> = Vec::new();
    for key in &["tabs", "allComposers", "conversations", "chats", "history", "data", "items", "threads", "sessions"] {
        if let Some(arr) = parsed.get(*key).and_then(|v| v.as_array()) {
            arrays.push(arr);
        }
    }
    if let Some(arr) = parsed.as_array() {
        arrays.push(arr);
    }

    // If conversation_id looks like "item_N", use index
    if conversation_id.starts_with("item_") {
        if let Ok(idx) = conversation_id[5..].parse::<usize>() {
            for arr in &arrays {
                if let Some(item) = arr.get(idx) {
                    return Some(item.clone());
                }
            }
        }
    }

    // Search by id field match
    for arr in &arrays {
        for item in *arr {
            let item_id = item.get("id")
                .or_else(|| item.get("chatId"))
                .or_else(|| item.get("composerId"))
                .or_else(|| item.get("conversationId"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if item_id == conversation_id {
                return Some(item.clone());
            }
        }
    }

    None
}

pub fn get_conversation_content(
    source_db: &str,
    source_key: &str,
    conversation_id: &str,
) -> Result<ConversationContent, String> {
    let conn = Connection::open_with_flags(
        source_db,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ).map_err(|e| format!("Failed to open DB: {}", e))?;

    let tables = get_tables(&conn);

    // Try to read the value from available tables
    let value = if tables.contains(&"cursorDiskKV".to_string()) {
        query_value_full(&conn, "cursorDiskKV", source_key)
            .or_else(|| query_value_full(&conn, "ItemTable", source_key))
    } else if tables.contains(&"ItemTable".to_string()) {
        query_value_full(&conn, "ItemTable", source_key)
    } else {
        None
    };

    let value = value.ok_or_else(|| "Key not found in database".to_string())?;

    let parsed: serde_json::Value = serde_json::from_str(&value)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Check if this is a Cursor composerData entry (has composerId + conversationState)
    if source_key.starts_with("composerData:") {
        return Ok(extract_cursor_composer_content(&parsed, source_key));
    }

    // Determine if this is an aggregated key or individual conversation
    let is_aggregated = CHAT_DATA_KEYS.contains(&source_key);

    let (title, messages) = if is_aggregated && !conversation_id.is_empty() {
        // Find specific conversation within aggregated data
        match find_conversation_in_aggregated(&parsed, conversation_id) {
            Some(item) => {
                // Check if the found item is also a Cursor-style composer
                if item.get("composerId").is_some() && item.get("conversationState").is_some() {
                    let c = extract_cursor_composer_content(&item, source_key);
                    (c.title, c.messages)
                } else {
                    let title = item.get("chatTitle")
                        .or_else(|| item.get("title"))
                        .or_else(|| item.get("name"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_string();
                    let msgs = extract_messages_from_item(&item);
                    (title, msgs)
                }
            }
            None => return Err("Conversation not found in aggregated data".to_string()),
        }
    } else {
        // Individual conversation key - parse directly
        let title = parsed.get("chatTitle")
            .or_else(|| parsed.get("title"))
            .or_else(|| parsed.get("name"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let msgs = extract_messages_from_item(&parsed);
        (title, msgs)
    };

    Ok(ConversationContent {
        title: if title.is_empty() { source_key.to_string() } else { title },
        messages,
    })
}

/// Extract viewable content from Cursor's composerData format.
/// Cursor v2.0+ stores full messages in encrypted agentKv:blob BLOBs,
/// while composerData only has metadata. We extract everything available.
fn extract_cursor_composer_content(
    parsed: &serde_json::Value,
    source_key: &str,
) -> ConversationContent {
    let obj = parsed.as_object();
    let title = obj
        .and_then(|o| o.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or(source_key)
        .to_string();

    let mut messages = Vec::new();

    // ── Conversation overview from headers ──
    if let Some(headers) = obj.and_then(|o| o.get("fullConversationHeadersOnly")).and_then(|v| v.as_array()) {
        if !headers.is_empty() {
            let user_count = headers.iter().filter(|h| h.get("type").and_then(|v| v.as_i64()) == Some(1)).count();
            let assistant_count = headers.iter().filter(|h| h.get("type").and_then(|v| v.as_i64()) == Some(2)).count();
            let other_count = headers.len() - user_count - assistant_count;
            let mut overview = format!(
                "Conversation: {} messages ({} user, {} assistant",
                headers.len(), user_count, assistant_count
            );
            if other_count > 0 {
                overview.push_str(&format!(", {} other", other_count));
            }
            overview.push(')');
            messages.push(ConversationMessage {
                role: "system".to_string(),
                content: overview,
            });
        }
    }

    // ── User's last input text ──
    let user_text = extract_user_text_from_composer(obj);
    if !user_text.is_empty() {
        messages.push(ConversationMessage {
            role: "user".to_string(),
            content: user_text,
        });
    }

    // ── Subtitle (AI's summary of changes) ──
    if let Some(subtitle) = obj.and_then(|o| o.get("subtitle")).and_then(|v| v.as_str()) {
        if !subtitle.is_empty() {
            messages.push(ConversationMessage {
                role: "assistant".to_string(),
                content: subtitle.to_string(),
            });
        }
    }

    // ── Todo items ──
    if let Some(todos) = obj.and_then(|o| o.get("todos")).and_then(|v| v.as_array()) {
        if !todos.is_empty() {
            let mut todo_text = String::from("Tasks:\n");
            for todo in todos {
                let label = todo.get("label").and_then(|v| v.as_str()).unwrap_or("task");
                let status = todo.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");
                let check = if status == "done" { "✓" } else { "○" };
                todo_text.push_str(&format!("  {} {}\n", check, label));
            }
            messages.push(ConversationMessage {
                role: "assistant".to_string(),
                content: todo_text,
            });
        }
    }

    // ── Newly created files ──
    if let Some(files) = obj.and_then(|o| o.get("newlyCreatedFiles")).and_then(|v| v.as_array()) {
        if !files.is_empty() {
            let file_list: Vec<&str> = files.iter()
                .filter_map(|f| f.as_str())
                .collect();
            if !file_list.is_empty() {
                messages.push(ConversationMessage {
                    role: "system".to_string(),
                    content: format!("New files:\n  {}", file_list.join("\n  ")),
                });
            }
        }
    }

    // ── Status + stats ──
    if let Some(o) = obj {
        let status = o.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let lines_added = o.get("totalLinesAdded").and_then(|v| v.as_i64()).unwrap_or(0);
        let lines_removed = o.get("totalLinesRemoved").and_then(|v| v.as_i64()).unwrap_or(0);
        let files_changed = o.get("filesChangedCount").and_then(|v| v.as_i64()).unwrap_or(0);
        let mode = o.get("unifiedMode").and_then(|v| v.as_str()).unwrap_or("");

        if !status.is_empty() || lines_added > 0 || files_changed > 0 {
            let info = format!(
                "Status: {} | Mode: {} | Files: {} | +{} -{}",
                status, mode, files_changed, lines_added, lines_removed
            );
            messages.push(ConversationMessage {
                role: "system".to_string(),
                content: info,
            });
        }
    }

    // ── Encryption notice ──
    messages.push(ConversationMessage {
        role: "system".to_string(),
        content: "Note: Full conversation messages are stored in Cursor's encrypted binary format and cannot be displayed. Only metadata is shown above.".to_string(),
    });

    ConversationContent { title, messages }
}

/// Extract user text from Cursor composerData, trying text field then richText (Lexical).
fn extract_user_text_from_composer(obj: Option<&serde_json::Map<String, serde_json::Value>>) -> String {
    // Try plain text field first
    if let Some(text) = obj.and_then(|o| o.get("text")).and_then(|v| v.as_str()) {
        if !text.is_empty() {
            return text.to_string();
        }
    }
    // Try richText (Lexical editor JSON)
    if let Some(rich) = obj.and_then(|o| o.get("richText")).and_then(|v| v.as_str()) {
        if let Ok(rt) = serde_json::from_str::<serde_json::Value>(rich) {
            if let Some(children) = rt.get("root").and_then(|r| r.get("children")).and_then(|c| c.as_array()) {
                let mut parts = Vec::new();
                for child in children {
                    if let Some(kids) = child.get("children").and_then(|c| c.as_array()) {
                        for kid in kids {
                            if let Some(t) = kid.get("text").and_then(|v| v.as_str()) {
                                if !t.is_empty() { parts.push(t.to_string()); }
                            }
                        }
                    }
                }
                if !parts.is_empty() {
                    return parts.join("\n");
                }
            }
        }
    }
    String::new()
}

// ── Delete conversations ──

pub fn delete_conversation(source_db: &str, source_key: &str) -> Result<u64, String> {
    let db_path = Path::new(source_db);

    // Windsurf .pb files: source_db is the cascade directory, source_key is the UUID filename
    if db_path.is_dir() {
        let pb_file = db_path.join(format!("{}.pb", source_key));
        if pb_file.exists() {
            let size = file_size(&pb_file);
            std::fs::remove_file(&pb_file)
                .map_err(|e| format!("Failed to delete .pb file: {}", e))?;
            return Ok(size);
        }
        return Err("File not found".into());
    }

    // SQLite-based deletion
    let conn = Connection::open(source_db)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    let tables = get_tables(&conn);
    let size = query_value_size(&conn, "ItemTable", source_key)
        .max(query_value_size(&conn, "cursorDiskKV", source_key));

    for table in &["ItemTable", "cursorDiskKV"] {
        if tables.contains(&table.to_string()) {
            let sql = format!("DELETE FROM [{}] WHERE key = ?1", table);
            if let Ok(count) = conn.execute(&sql, [source_key]) {
                if count > 0 {
                    let _ = conn.execute_batch("VACUUM");
                    return Ok(size);
                }
            }
        }
    }

    Err("Conversation key not found".into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchDeleteRequest {
    pub source_db: String,
    pub source_key: String,
}

pub fn delete_conversations_batch(items: &[BatchDeleteRequest]) -> Result<u64, String> {
    let mut total_freed: u64 = 0;
    let mut errors = Vec::new();

    // Group by source_db to minimize DB open/close and batch VACUUM
    let mut groups: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for item in items {
        groups.entry(item.source_db.clone()).or_default().push(item.source_key.clone());
    }

    for (source_db, keys) in &groups {
        let db_path = Path::new(source_db);

        if db_path.is_dir() {
            // Windsurf .pb files
            for key in keys {
                let pb_file = db_path.join(format!("{}.pb", key));
                if pb_file.exists() {
                    let size = file_size(&pb_file);
                    match std::fs::remove_file(&pb_file) {
                        Ok(_) => total_freed += size,
                        Err(e) => errors.push(format!("{}: {}", key, e)),
                    }
                }
            }
        } else if db_path.exists() {
            // SQLite DB
            let conn = match Connection::open(source_db) {
                Ok(c) => c,
                Err(e) => { errors.push(format!("{}: {}", source_db, e)); continue; }
            };
            let tables = get_tables(&conn);
            for key in keys {
                for table in &["ItemTable", "cursorDiskKV"] {
                    if !tables.contains(&table.to_string()) { continue; }
                    let size = query_value_size(&conn, table, key);
                    let sql = format!("DELETE FROM [{}] WHERE key = ?1", table);
                    if let Ok(count) = conn.execute(&sql, [key.as_str()]) {
                        if count > 0 {
                            total_freed += size;
                            break;
                        }
                    }
                }
            }
            let _ = conn.execute_batch("VACUUM");
        }
    }

    if !errors.is_empty() && total_freed == 0 {
        return Err(errors.join("; "));
    }
    Ok(total_freed)
}

// ── Public API ──

pub fn scan_conversations(ide: &crate::ide_detector::IdeInfo) -> ConversationListResult {
    let mut conversations = Vec::new();
    let mut db_files = Vec::new();
    let mut total_size: u64 = 0;

    // ── globalStorage/state.vscdb (MAIN database) ──
    if let Some(ref gs) = ide.global_storage_path {
        let db = gs.join("state.vscdb");
        if db.exists() {
            let size = file_size(&db);
            total_size += size;
            db_files.push(DbFileInfo {
                path: db.display().to_string(),
                size,
                name: "globalStorage/state.vscdb".into(),
                modified: file_modified_time(&db),
            });
            conversations.extend(extract_from_db(&db));
        }

        let backup = gs.join("state.vscdb.backup");
        if backup.exists() {
            let size = file_size(&backup);
            total_size += size;
            db_files.push(DbFileInfo {
                path: backup.display().to_string(),
                size,
                name: "globalStorage/state.vscdb.backup".into(),
                modified: file_modified_time(&backup),
            });
        }
    }

    // ── workspaceStorage/*/state.vscdb ──
    if let Some(ref ws) = ide.workspace_storage_path {
        if ws.exists() {
            if let Ok(entries) = std::fs::read_dir(ws) {
                for entry in entries.filter_map(|e| e.ok()) {
                    if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) { continue; }
                    let db = entry.path().join("state.vscdb");
                    if !db.exists() { continue; }
                    let size = file_size(&db);
                    if size < 1024 { continue; }
                    total_size += size;
                    let hash = entry.file_name().to_string_lossy().to_string();
                    let short_hash = if hash.len() > 8 { &hash[..8] } else { &hash };
                    db_files.push(DbFileInfo {
                        path: db.display().to_string(),
                        size,
                        name: format!("workspaceStorage/{}/state.vscdb", short_hash),
                        modified: file_modified_time(&db),
                    });
                    conversations.extend(extract_from_db(&db));
                }
            }
        }
    }

    // ── Windsurf: ~/.codeium/windsurf/cascade/*.pb (protobuf conversation files) ──
    if ide.id == "windsurf" {
        if let Some(home) = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
        {
            let cascade_dir = Path::new(&home).join(".codeium/windsurf/cascade");
            if cascade_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&cascade_dir) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let path = entry.path();
                        if path.extension().map(|e| e == "pb").unwrap_or(false) {
                            let size = file_size(&path);
                            if size < 50 { continue; }
                            let modified = file_modified_time(&path);
                            let fname = path.file_stem()
                                .unwrap_or_default().to_string_lossy().to_string();
                            total_size += size;
                            conversations.push(ConversationInfo {
                                id: format!("pb:{}:{}", cascade_dir.display(), fname),
                                title: format!("Cascade {}", &fname[..8.min(fname.len())]),
                                source_db: cascade_dir.display().to_string(),
                                source_key: fname.clone(),
                                message_count: 0,
                                size_bytes: size,
                                last_modified: modified,
                            });
                        }
                    }
                }
                // Add cascade dir as a "db file" entry
                let dir_size: u64 = std::fs::read_dir(&cascade_dir)
                    .map(|d| d.filter_map(|e| e.ok())
                        .map(|e| file_size(&e.path()))
                        .sum())
                    .unwrap_or(0);
                db_files.push(DbFileInfo {
                    path: cascade_dir.display().to_string(),
                    size: dir_size,
                    name: ".codeium/windsurf/cascade/".into(),
                    modified: file_modified_time(&cascade_dir),
                });
            }
        }
    }

    // Default sort: most recent first
    conversations.sort_by(|a, b| {
        let ta = a.last_modified.unwrap_or(0);
        let tb = b.last_modified.unwrap_or(0);
        tb.cmp(&ta)
    });

    ConversationListResult {
        ide_id: ide.id.clone(),
        conversations,
        db_files,
        total_size,
    }
}
