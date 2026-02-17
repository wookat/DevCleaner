use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub ide_id: String,
    pub ide_name: String,
    pub timestamp: String,
    pub file_path: PathBuf,
    pub size: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupListResult {
    pub backups: Vec<BackupInfo>,
    pub total_size: u64,
}

fn get_backup_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("IDECleaner").join("backups");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

fn get_backup_manifest_path() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("IDECleaner").join("backup_manifest.json")
}

fn load_manifest() -> Vec<BackupInfo> {
    let path = get_backup_manifest_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(list) = serde_json::from_str::<Vec<BackupInfo>>(&data) {
                return list;
            }
        }
    }
    Vec::new()
}

fn save_manifest(list: &[BackupInfo]) {
    let path = get_backup_manifest_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string_pretty(list) {
        let _ = fs::write(&path, data);
    }
}

pub fn create_backup(ide: &crate::ide_detector::IdeInfo, paths: &[PathBuf]) -> Result<BackupInfo, String> {
    let backup_dir = get_backup_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_id = format!("{}_{}", ide.id, timestamp);
    let zip_path = backup_dir.join(format!("{}.zip", backup_id));

    let file = fs::File::create(&zip_path).map_err(|e| format!("Failed to create backup file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut file_count: u64 = 0;

    for base_path in paths {
        if !base_path.exists() {
            continue;
        }

        for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let rel = entry
                    .path()
                    .strip_prefix(base_path)
                    .unwrap_or(entry.path());
                let archive_name = format!(
                    "{}/{}",
                    base_path.file_name().unwrap_or_default().to_string_lossy(),
                    rel.to_string_lossy().replace('\\', "/")
                );

                if let Ok(mut src) = fs::File::open(entry.path()) {
                    if zip.start_file(&archive_name, options).is_ok() {
                        let mut buf = [0u8; 8192];
                        let mut ok = true;
                        loop {
                            match std::io::Read::read(&mut src, &mut buf) {
                                Ok(0) => break,
                                Ok(n) => {
                                    if zip.write_all(&buf[..n]).is_err() {
                                        ok = false;
                                        break;
                                    }
                                }
                                Err(_) => { ok = false; break; }
                            }
                        }
                        if ok { file_count += 1; }
                    }
                }
            }
        }
    }

    zip.finish().map_err(|e| format!("Failed to finalize zip: {}", e))?;

    let zip_size = fs::metadata(&zip_path).map(|m| m.len()).unwrap_or(0);

    let info = BackupInfo {
        id: backup_id,
        ide_id: ide.id.clone(),
        ide_name: ide.name.clone(),
        timestamp,
        file_path: zip_path,
        size: zip_size,
        file_count,
    };

    let mut manifest = load_manifest();
    manifest.push(info.clone());
    save_manifest(&manifest);

    Ok(info)
}

pub fn get_backup_dir_path() -> String {
    get_backup_dir().to_string_lossy().to_string()
}

pub fn clear_all_backups() -> Result<u64, String> {
    let manifest = load_manifest();
    let mut freed: u64 = 0;
    for info in &manifest {
        if info.file_path.exists() {
            if let Ok(meta) = fs::metadata(&info.file_path) {
                freed += meta.len();
            }
            let _ = fs::remove_file(&info.file_path);
        }
    }
    save_manifest(&[]);
    Ok(freed)
}

pub fn list_backups() -> BackupListResult {
    let backups = load_manifest();
    let total_size = backups.iter().map(|b| b.size).sum();
    BackupListResult {
        backups,
        total_size,
    }
}

pub fn delete_backup(backup_id: &str) -> Result<(), String> {
    let mut manifest = load_manifest();
    let pos = manifest.iter().position(|b| b.id == backup_id);

    if let Some(idx) = pos {
        let info = manifest.remove(idx);
        if info.file_path.exists() {
            fs::remove_file(&info.file_path)
                .map_err(|e| format!("Failed to delete backup file: {}", e))?;
        }
        save_manifest(&manifest);
        Ok(())
    } else {
        Err(format!("Backup '{}' not found", backup_id))
    }
}
