use crate::backup;
use crate::cleaner;
use crate::conversation;
use crate::ide_detector;
use crate::scanner;
use crate::uninstaller;
use std::process::Command;

#[tauri::command]
pub fn detect_ides() -> Vec<ide_detector::IdeInfo> {
    ide_detector::detect_installed_ides()
}

#[tauri::command]
pub fn scan_all_ides() -> scanner::ScanSummary {
    let ides = ide_detector::detect_installed_ides();
    scanner::scan_all(&ides)
}

#[tauri::command]
pub fn scan_single_ide(ide_id: String) -> Option<scanner::IdeScanResult> {
    let ides = ide_detector::detect_installed_ides();
    ides.iter()
        .find(|ide| ide.id == ide_id && ide.installed)
        .map(|ide| scanner::scan_ide(ide))
}

#[tauri::command]
pub fn check_ide_running(ide_id: String) -> Vec<String> {
    let process_names = ide_detector::get_process_names(&ide_id);

    let mut running = Vec::new();
    if let Ok(output) = Command::new("tasklist").output() {
        let list = String::from_utf8_lossy(&output.stdout).to_lowercase();
        for name in process_names {
            if list.contains(&name.to_lowercase()) {
                running.push(name.to_string());
            }
        }
    }
    running
}

#[tauri::command]
pub fn clean_ide(
    ide_id: String,
    categories: Vec<String>,
    mode: cleaner::CleanMode,
    create_backup: bool,
) -> Result<cleaner::CleanResult, String> {
    let ides = ide_detector::detect_installed_ides();
    let ide = ides
        .iter()
        .find(|i| i.id == ide_id && i.installed)
        .ok_or_else(|| format!("IDE '{}' not found or not installed", ide_id))?;

    if create_backup {
        let scan = scanner::scan_ide(ide);
        let paths_to_backup: Vec<_> = scan
            .categories
            .iter()
            .filter(|c| categories.contains(&c.name))
            .flat_map(|c| c.paths.clone())
            .collect();

        if !paths_to_backup.is_empty() {
            backup::create_backup(ide, &paths_to_backup)?;
        }
    }

    Ok(cleaner::clean_ide(ide, &categories, &mode))
}

#[tauri::command]
pub fn list_backups() -> backup::BackupListResult {
    backup::list_backups()
}

#[tauri::command]
pub fn delete_backup(backup_id: String) -> Result<(), String> {
    backup::delete_backup(&backup_id)
}

#[tauri::command]
pub fn get_backup_dir_path() -> String {
    backup::get_backup_dir_path()
}

#[tauri::command]
pub fn clear_all_backups() -> Result<u64, String> {
    backup::clear_all_backups()
}

#[tauri::command]
pub fn open_backup_dir() -> Result<(), String> {
    let dir = backup::get_backup_dir_path();
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let target = if p.is_dir() {
        p.to_path_buf()
    } else {
        p.parent().unwrap_or(p).to_path_buf()
    };
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(target.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_storage_entries(path: String) -> Vec<scanner::StorageEntry> {
    scanner::list_storage_entries(std::path::Path::new(&path))
}

#[tauri::command]
pub fn get_ide_icons() -> std::collections::HashMap<String, String> {
    let programs = uninstaller::scan_installed_programs();
    let mut map = std::collections::HashMap::new();
    for p in programs {
        if let (Some(ide_id), Some(icon)) = (p.ide_id, p.icon_base64) {
            map.entry(ide_id).or_insert(icon);
        }
    }
    map
}

#[tauri::command]
pub fn get_conversation_content(
    source_db: String,
    source_key: String,
    conversation_id: String,
) -> Result<conversation::ConversationContent, String> {
    conversation::get_conversation_content(&source_db, &source_key, &conversation_id)
}

#[tauri::command]
pub fn delete_conversation(source_db: String, source_key: String) -> Result<u64, String> {
    conversation::delete_conversation(&source_db, &source_key)
}

#[tauri::command]
pub fn delete_conversations_batch(items: Vec<conversation::BatchDeleteRequest>) -> Result<u64, String> {
    conversation::delete_conversations_batch(&items)
}

#[tauri::command]
pub fn scan_conversations(ide_id: String) -> conversation::ConversationListResult {
    let ides = ide_detector::detect_installed_ides();
    if let Some(ide) = ides.iter().find(|i| i.id == ide_id && i.installed) {
        conversation::scan_conversations(ide)
    } else {
        conversation::ConversationListResult {
            ide_id,
            conversations: vec![],
            db_files: vec![],
            total_size: 0,
        }
    }
}

#[tauri::command]
pub fn get_keep_option_sizes(ide_id: String) -> uninstaller::KeepOptionSizes {
    uninstaller::get_keep_option_sizes(&ide_id)
}

#[tauri::command]
pub fn scan_installed_programs() -> Vec<uninstaller::InstalledProgram> {
    uninstaller::scan_installed_programs()
}

#[tauri::command]
pub fn find_residual_data(
    ide_id: String,
    options: uninstaller::UninstallOptions,
) -> uninstaller::ResidualInfo {
    uninstaller::find_residual_data(&ide_id, &options)
}

#[tauri::command]
pub fn uninstall_program(
    program: uninstaller::InstalledProgram,
    options: uninstaller::UninstallOptions,
) -> uninstaller::UninstallResult {
    uninstaller::uninstall_program(&program, &options)
}

#[tauri::command]
pub fn delete_storage_entry(path: String) -> Result<u64, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Path does not exist".into());
    }
    let size = walkdir::WalkDir::new(p)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum::<u64>();
    std::fs::remove_dir_all(p).map_err(|e| format!("Failed to delete: {}", e))?;
    Ok(size)
}

#[tauri::command]
pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
