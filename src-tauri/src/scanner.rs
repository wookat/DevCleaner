use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: PathBuf,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCategory {
    pub name: String,
    pub category_type: CategoryType,
    pub total_size: u64,
    pub file_count: u64,
    pub paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CategoryType {
    Cache,
    Log,
    WorkspaceStorage,
    Extension,
    CrashReport,
    GlobalStorage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeScanResult {
    pub ide_id: String,
    pub ide_name: String,
    pub categories: Vec<ScanCategory>,
    pub total_size: u64,
    pub total_files: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub results: Vec<IdeScanResult>,
    pub grand_total_size: u64,
    pub grand_total_files: u64,
    pub scan_duration_ms: u64,
}

fn dir_size_and_count(path: &Path) -> (u64, u64) {
    let mut total_size: u64 = 0;
    let mut file_count: u64 = 0;

    if !path.exists() {
        return (0, 0);
    }

    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
                file_count += 1;
            }
        }
    }

    (total_size, file_count)
}

pub fn scan_ide(ide: &crate::ide_detector::IdeInfo) -> IdeScanResult {
    let mut categories = Vec::new();
    let mut total_size: u64 = 0;
    let mut total_files: u64 = 0;

    // Scan cache paths
    if !ide.cache_paths.is_empty() {
        let mut cat_size: u64 = 0;
        let mut cat_files: u64 = 0;
        let mut existing_paths = Vec::new();

        for p in &ide.cache_paths {
            if p.exists() {
                let (size, count) = dir_size_and_count(p);
                cat_size += size;
                cat_files += count;
                existing_paths.push(p.clone());
            }
        }

        if cat_size > 0 {
            categories.push(ScanCategory {
                name: "Cache".into(),
                category_type: CategoryType::Cache,
                total_size: cat_size,
                file_count: cat_files,
                paths: existing_paths,
            });
            total_size += cat_size;
            total_files += cat_files;
        }
    }

    // Scan log paths
    if !ide.log_paths.is_empty() {
        let mut cat_size: u64 = 0;
        let mut cat_files: u64 = 0;
        let mut existing_paths = Vec::new();

        for p in &ide.log_paths {
            if p.exists() {
                let (size, count) = dir_size_and_count(p);
                cat_size += size;
                cat_files += count;
                existing_paths.push(p.clone());
            }
        }

        if cat_size > 0 {
            categories.push(ScanCategory {
                name: "Logs".into(),
                category_type: CategoryType::Log,
                total_size: cat_size,
                file_count: cat_files,
                paths: existing_paths,
            });
            total_size += cat_size;
            total_files += cat_files;
        }
    }

    // Scan workspace storage
    if let Some(ref ws) = ide.workspace_storage_path {
        if ws.exists() {
            let (size, count) = dir_size_and_count(ws);
            if size > 0 {
                categories.push(ScanCategory {
                    name: "Workspace Storage".into(),
                    category_type: CategoryType::WorkspaceStorage,
                    total_size: size,
                    file_count: count,
                    paths: vec![ws.clone()],
                });
                total_size += size;
                total_files += count;
            }
        }
    }

    // Scan extensions
    if let Some(ref ext) = ide.extension_path {
        if ext.exists() {
            let (size, count) = dir_size_and_count(ext);
            if size > 0 {
                categories.push(ScanCategory {
                    name: "Extensions".into(),
                    category_type: CategoryType::Extension,
                    total_size: size,
                    file_count: count,
                    paths: vec![ext.clone()],
                });
                total_size += size;
                total_files += count;
            }
        }
    }

    // Scan global storage (AI conversations, extension data)
    if let Some(ref gs) = ide.global_storage_path {
        if gs.exists() {
            let (size, count) = dir_size_and_count(gs);
            if size > 0 {
                categories.push(ScanCategory {
                    name: "Global Storage".into(),
                    category_type: CategoryType::GlobalStorage,
                    total_size: size,
                    file_count: count,
                    paths: vec![gs.clone()],
                });
                total_size += size;
                total_files += count;
            }
        }
    }

    IdeScanResult {
        ide_id: ide.id.clone(),
        ide_name: ide.name.clone(),
        categories,
        total_size,
        total_files,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageEntry {
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    pub file_count: u64,
    pub modified: Option<i64>,
    pub is_ai_related: bool,
}

fn is_ai_extension(name: &str) -> bool {
    let lower = name.to_lowercase();
    let ai_patterns = [
        "cursor", "codeium", "copilot", "tabnine", "kite",
        "anthropic", "openai", "chatgpt", "cascade", "supermaven",
        "continue", "aider", "codegpt",
    ];
    ai_patterns.iter().any(|p| lower.contains(p))
}

pub fn list_storage_entries(base_path: &Path) -> Vec<StorageEntry> {
    let mut entries = Vec::new();
    if !base_path.exists() {
        return entries;
    }

    if let Ok(read_dir) = std::fs::read_dir(base_path) {
        for entry in read_dir.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                let path = entry.path();
                let (size, count) = dir_size_and_count(&path);
                if size == 0 {
                    continue;
                }
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64);

                let is_ai_related = is_ai_extension(&name);

                entries.push(StorageEntry {
                    name,
                    path,
                    size,
                    file_count: count,
                    modified,
                    is_ai_related,
                });
            }
        }
    }

    entries.sort_by(|a, b| b.size.cmp(&a.size));
    entries
}

pub fn scan_all(ides: &[crate::ide_detector::IdeInfo]) -> ScanSummary {
    let start = SystemTime::now();

    let results: Vec<IdeScanResult> = ides
        .iter()
        .filter(|ide| ide.installed)
        .map(|ide| scan_ide(ide))
        .collect();

    let grand_total_size = results.iter().map(|r| r.total_size).sum();
    let grand_total_files = results.iter().map(|r| r.total_files).sum();
    let scan_duration_ms = start
        .elapsed()
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    ScanSummary {
        results,
        grand_total_size,
        grand_total_files,
        scan_duration_ms,
    }
}
