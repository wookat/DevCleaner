use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CleanMode {
    Safe,
    Recommended,
    Aggressive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanRequest {
    pub ide_id: String,
    pub categories: Vec<String>,
    pub mode: CleanMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanResult {
    pub ide_id: String,
    pub freed_bytes: u64,
    pub deleted_files: u64,
    pub errors: Vec<String>,
}

/// Protected file names that should never be deleted regardless of user selection.
const PROTECTED_NAMES: &[&str] = &[
    "settings.json", "keybindings.json", "argv.json",
];
const PROTECTED_DIRS: &[&str] = &[
    "snippets", "profiles",
];

fn is_protected(path: &Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    for name in PROTECTED_NAMES {
        if path_str.ends_with(name) { return true; }
    }
    // Check if any ancestor directory is protected
    for component in path.components() {
        let s = component.as_os_str().to_string_lossy().to_lowercase();
        for d in PROTECTED_DIRS {
            if s == *d { return true; }
        }
    }
    false
}

/// Clean directory contents, skipping protected user files.
pub fn clean_directory_safe(dir: &Path) -> (u64, u64, Vec<String>) {
    let mut freed: u64 = 0;
    let mut deleted: u64 = 0;
    let mut errors = Vec::new();

    if !dir.exists() {
        return (0, 0, vec![]);
    }

    let files: Vec<_> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    for entry in &files {
        if is_protected(entry.path()) { continue; }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        match fs::remove_file(entry.path()) {
            Ok(()) => { freed += size; deleted += 1; }
            Err(e) => errors.push(format!("{}: {}", entry.path().display(), e)),
        }
    }

    // Remove empty directories (bottom-up)
    let mut dirs: Vec<_> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .map(|e| e.into_path())
        .collect();
    dirs.sort_by(|a, b| b.components().count().cmp(&a.components().count()));
    for d in dirs {
        if d != dir { let _ = fs::remove_dir(&d); }
    }

    (freed, deleted, errors)
}

pub fn clean_directory(dir: &Path) -> (u64, u64, Vec<String>) {
    let mut freed: u64 = 0;
    let mut deleted: u64 = 0;
    let mut errors = Vec::new();

    if !dir.exists() {
        return (0, 0, vec![]);
    }

    // Collect files first, then delete (avoid iterator invalidation)
    let files: Vec<_> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    for entry in &files {
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        match fs::remove_file(entry.path()) {
            Ok(()) => {
                freed += size;
                deleted += 1;
            }
            Err(e) => {
                errors.push(format!("{}: {}", entry.path().display(), e));
            }
        }
    }

    // Try to remove empty directories (bottom-up)
    let mut dirs: Vec<_> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .map(|e| e.into_path())
        .collect();
    dirs.sort_by(|a, b| b.components().count().cmp(&a.components().count()));

    for d in dirs {
        if d != dir {
            let _ = fs::remove_dir(&d);
        }
    }

    (freed, deleted, errors)
}

pub fn clean_ide(
    ide: &crate::ide_detector::IdeInfo,
    categories: &[String],
    _mode: &CleanMode,
) -> CleanResult {
    let mut total_freed: u64 = 0;
    let mut total_deleted: u64 = 0;
    let mut all_errors = Vec::new();

    let scan = crate::scanner::scan_ide(ide);

    for cat in &scan.categories {
        if !categories.contains(&cat.name) {
            continue;
        }

        for path in &cat.paths {
            // Trust the user's explicit selection — mode only controls auto-selection in the frontend.
            // Protected files (settings.json, keybindings.json, snippets) are still preserved.
            let (freed, deleted, errors) = clean_directory_safe(path);
            total_freed += freed;
            total_deleted += deleted;
            all_errors.extend(errors);
        }
    }

    CleanResult {
        ide_id: ide.id.clone(),
        freed_bytes: total_freed,
        deleted_files: total_deleted,
        errors: all_errors,
    }
}
