use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInstall {
    pub version: String,
    pub path: String,
    pub is_latest: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledProgram {
    pub display_name: String,
    pub publisher: String,
    pub install_location: Option<String>,
    pub uninstall_string: Option<String>,
    pub quiet_uninstall_string: Option<String>,
    pub display_version: String,
    pub estimated_size_kb: u64,
    pub registry_key: String,
    pub icon_path: Option<String>,
    pub ide_id: Option<String>,
    pub icon_base64: Option<String>,
    pub version_installs: Vec<VersionInstall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallOptions {
    pub keep_user_data: bool,
    pub keep_conversations: bool,
    pub keep_extensions: bool,
    pub keep_settings: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallResult {
    pub success: bool,
    pub program_name: String,
    pub uninstaller_ran: bool,
    pub residual_cleaned: bool,
    pub residual_freed_bytes: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResidualInfo {
    pub paths: Vec<ResidualPath>,
    pub registry_keys: Vec<String>,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResidualPath {
    pub path: PathBuf,
    pub size: u64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeepOptionSizes {
    pub settings_size: u64,
    pub user_data_size: u64,
    pub conversations_size: u64,
    pub extensions_size: u64,
}

/// Calculate sizes for each keep option category of a given IDE
pub fn get_keep_option_sizes(ide_id: &str) -> KeepOptionSizes {
    let ides = crate::ide_detector::detect_installed_ides();
    let ide = match ides.iter().find(|i| i.id == ide_id && i.installed) {
        Some(i) => i,
        None => return KeepOptionSizes { settings_size: 0, user_data_size: 0, conversations_size: 0, extensions_size: 0 },
    };

    let mut settings_size: u64 = 0;
    let mut user_data_size: u64 = 0;
    let mut conversations_size: u64 = 0;
    let mut extensions_size: u64 = 0;

    match ide.ide_type {
        crate::ide_detector::IdeType::VscodeBased => {
            // Settings: User/settings.json, keybindings.json, snippets/, profiles/, argv.json
            if let Some(ref config) = ide.config_path {
                let user_dir = config.join("User");
                if user_dir.exists() {
                    for name in &["settings.json", "keybindings.json", "argv.json", "tasks.json"] {
                        let f = user_dir.join(name);
                        if f.exists() {
                            settings_size += std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0);
                        }
                    }
                    for dir_name in &["snippets", "profiles"] {
                        let d = user_dir.join(dir_name);
                        if d.exists() { settings_size += dir_size(&d); }
                    }
                }
            }

            // Workspace data: workspaceStorage/
            if let Some(ref ws) = ide.workspace_storage_path {
                if ws.exists() { user_data_size = dir_size(ws); }
            }

            // Conversations: globalStorage/ (contains state.vscdb with AI conversations)
            if let Some(ref gs) = ide.global_storage_path {
                if gs.exists() { conversations_size = dir_size(gs); }
            }

            // Extensions: ~/.cursor/extensions/ etc.
            if let Some(ref ext) = ide.extension_path {
                if ext.exists() { extensions_size = dir_size(ext); }
            }
        }
        crate::ide_detector::IdeType::JetBrains => {
            // Settings: config dir (minus plugins subfolder)
            if let Some(ref config) = ide.config_path {
                if config.exists() {
                    let total = dir_size(config);
                    let plugins_dir = config.join("plugins");
                    let plugins_size = if plugins_dir.exists() { dir_size(&plugins_dir) } else { 0 };
                    settings_size = total.saturating_sub(plugins_size);
                }
            }

            // Extensions/Plugins
            if let Some(ref ext) = ide.extension_path {
                if ext.exists() { extensions_size = dir_size(ext); }
            }

            // JetBrains has no workspace storage or conversation concepts
            // user_data_size and conversations_size remain 0
        }
    }

    KeepOptionSizes {
        settings_size,
        user_data_size,
        conversations_size,
        extensions_size,
    }
}

// IDE name patterns to match in registry DisplayName
const IDE_PATTERNS: &[(&str, &str)] = &[
    ("Visual Studio Code", "vscode"),
    ("Microsoft Visual Studio Code", "vscode"),
    ("Cursor", "cursor"),
    ("Windsurf", "windsurf"),
    ("Kiro", "kiro"),
    ("Trae CN", "trae_cn"),
    ("Trae", "trae"),
    ("Qoder", "qoder"),
    ("Antigravity", "antigravity"),
    ("Google Antigravity", "antigravity"),
    ("PearAI", "pearai"),
    ("Aide", "aide"),
    ("CodeStory", "aide"),
    ("Positron", "positron"),
    ("VSCodium", "vscodium"),
    ("Void", "void"),
    ("IntelliJ IDEA", "intellij"),
    ("PyCharm", "pycharm"),
    ("WebStorm", "webstorm"),
    ("GoLand", "goland"),
    ("CLion", "clion"),
    ("Rider", "rider"),
    ("PhpStorm", "phpstorm"),
    ("RubyMine", "rubymine"),
    ("DataGrip", "datagrip"),
    ("RustRover", "rustrover"),
    ("DataSpell", "dataspell"),
    ("Aqua", "aqua"),
    ("Android Studio", "android_studio"),
    ("Fleet", "fleet"),
];

fn match_ide_id(display_name: &str) -> Option<String> {
    let lower = display_name.to_lowercase();
    for (pattern, id) in IDE_PATTERNS {
        if lower.contains(&pattern.to_lowercase()) {
            return Some(id.to_string());
        }
    }
    None
}

/// Scan Windows registry for installed programs matching dev tools
pub fn scan_installed_programs() -> Vec<InstalledProgram> {
    let mut programs = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let paths = [
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        ];

        for (hive, path) in &paths {
            let hkey = RegKey::predef(*hive);
            if let Ok(uninstall_key) = hkey.open_subkey(path) {
                for name in uninstall_key.enum_keys().filter_map(|k| k.ok()) {
                    if let Ok(subkey) = uninstall_key.open_subkey(&name) {
                        let display_name: String = subkey.get_value("DisplayName").unwrap_or_default();
                        if display_name.is_empty() {
                            continue;
                        }

                        // Only include dev-tool-related programs
                        let ide_id = match_ide_id(&display_name);
                        if ide_id.is_none() {
                            continue;
                        }

                        let publisher: String = subkey.get_value("Publisher").unwrap_or_default();
                        let install_location: Option<String> = subkey.get_value("InstallLocation").ok();
                        let uninstall_string: Option<String> = subkey.get_value("UninstallString").ok();
                        let quiet_uninstall: Option<String> = subkey.get_value("QuietUninstallString").ok();
                        let display_version: String = subkey.get_value("DisplayVersion").unwrap_or_default();
                        let estimated_size: u32 = subkey.get_value("EstimatedSize").unwrap_or(0);
                        let icon_path: Option<String> = subkey.get_value("DisplayIcon").ok();

                        // If estimated size is 0, try to compute from install location
                        let mut size_kb = estimated_size as u64;
                        if size_kb == 0 {
                            if let Some(ref loc) = install_location {
                                let p = std::path::Path::new(loc);
                                if p.exists() {
                                    size_kb = dir_size(p) / 1024;
                                }
                            }
                        }

                        programs.push(InstalledProgram {
                            display_name,
                            publisher,
                            install_location,
                            uninstall_string,
                            quiet_uninstall_string: quiet_uninstall,
                            display_version,
                            estimated_size_kb: size_kb,
                            registry_key: format!("{}\\{}", path, name),
                            icon_path,
                            ide_id,
                            icon_base64: None,
                            version_installs: vec![],
                        });
                    }
                }
            }
        }
    }

    // Merge IDEs detected by filesystem that have no registry entry (e.g. Toolbox-managed, or already uninstalled but residual data remains)
    let detected_ides = crate::ide_detector::detect_installed_ides();
    let registry_ide_ids: std::collections::HashSet<String> = programs.iter()
        .filter_map(|p| p.ide_id.clone())
        .collect();

    for ide in &detected_ides {
        if !ide.installed { continue; }
        if registry_ide_ids.contains(&ide.id) { continue; }

        // Calculate total data size for this IDE
        let mut total_size: u64 = 0;
        for p in &ide.cache_paths { if p.exists() { total_size += dir_size(p); } }
        for p in &ide.log_paths { if p.exists() { total_size += dir_size(p); } }
        if let Some(ref p) = ide.extension_path { if p.exists() { total_size += dir_size(p); } }
        if let Some(ref p) = ide.workspace_storage_path { if p.exists() { total_size += dir_size(p); } }
        if let Some(ref p) = ide.global_storage_path { if p.exists() { total_size += dir_size(p); } }
        if let Some(ref p) = ide.config_path { if p.exists() { total_size += dir_size(p); } }
        for vf in &ide.versioned_folders { total_size += vf.total_size; }

        if total_size < 1024 { continue; } // Skip if < 1KB of data

        // Check if any version has an actual installation directory
        let has_install_dir = ide.versioned_folders.iter().any(|vf| vf.install_path.is_some());

        // Find the primary install path (latest version's install dir)
        let primary_install_path = ide.versioned_folders.iter()
            .rev()
            .find_map(|vf| vf.install_path.as_ref())
            .map(|p| p.display().to_string());

        // Build version string from versioned folders
        let version = ide.versioned_folders.iter()
            .filter(|v| v.is_latest)
            .map(|v| v.version.clone())
            .next()
            .unwrap_or_default();

        // Label: "残留数据" only if no install dir; otherwise no suffix
        let display_name = if has_install_dir {
            ide.name.clone()
        } else {
            format!("{} (残留数据)", ide.name)
        };

        // Collect all versioned install paths
        let vi: Vec<VersionInstall> = ide.versioned_folders.iter()
            .filter_map(|vf| vf.install_path.as_ref().map(|p| VersionInstall {
                version: vf.version.clone(),
                path: p.display().to_string(),
                is_latest: vf.is_latest,
            }))
            .collect();

        programs.push(InstalledProgram {
            display_name,
            publisher: if ide.ide_type == crate::ide_detector::IdeType::JetBrains { "JetBrains s.r.o.".into() } else { String::new() },
            install_location: primary_install_path.or_else(|| ide.config_path.as_ref().map(|p| p.display().to_string())),
            uninstall_string: None,
            quiet_uninstall_string: None,
            display_version: version,
            estimated_size_kb: total_size / 1024,
            registry_key: format!("detected:{}", ide.id),
            icon_path: None,
            ide_id: Some(ide.id.clone()),
            icon_base64: None,
            version_installs: vi,
        });
    }

    // Also update existing registry entries with install paths from detection
    for prog in &mut programs {
        if let Some(ref ide_id) = prog.ide_id {
            if let Some(ide) = detected_ides.iter().find(|i| &i.id == ide_id) {
                // Populate version_installs if empty
                if prog.version_installs.is_empty() {
                    prog.version_installs = ide.versioned_folders.iter()
                        .filter_map(|vf| vf.install_path.as_ref().map(|p| VersionInstall {
                            version: vf.version.clone(),
                            path: p.display().to_string(),
                            is_latest: vf.is_latest,
                        }))
                        .collect();
                }
                // Fill install_location if missing
                if prog.install_location.is_none() {
                    let install = ide.versioned_folders.iter()
                        .rev()
                        .find_map(|vf| vf.install_path.as_ref())
                        .map(|p| p.display().to_string());
                    if install.is_some() {
                        prog.install_location = install;
                    }
                }
            }
        }
    }

    programs.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    programs.dedup_by(|a, b| a.display_name == b.display_name);

    // Extract icons in batch
    extract_icons_batch(&mut programs);

    programs
}

/// Parse DisplayIcon path: strip trailing ",N" icon index and quotes
fn parse_icon_exe_path(display_icon: &str) -> Option<String> {
    let trimmed = display_icon.trim().trim_matches('"');
    // Try stripping ",N" suffix
    if let Some(comma_pos) = trimmed.rfind(',') {
        let path = trimmed[..comma_pos].trim();
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    if std::path::Path::new(trimmed).exists() {
        return Some(trimmed.to_string());
    }
    None
}

/// Extract icons for all programs in one PowerShell batch call
fn extract_icons_batch(programs: &mut [InstalledProgram]) {
    let exe_paths: Vec<(usize, String)> = programs.iter().enumerate()
        .filter_map(|(i, p)| {
            p.icon_path.as_ref()
                .and_then(|ip| parse_icon_exe_path(ip))
                .map(|path| (i, path))
        })
        .collect();

    if exe_paths.is_empty() { return; }

    #[cfg(target_os = "windows")]
    {
        // Build PowerShell script to extract all icons at once
        let mut script = String::from(
            "Add-Type -AssemblyName System.Drawing\n$results = @{}\n"
        );
        for (i, path) in &exe_paths {
            let escaped = path.replace("'", "''");
            script.push_str(&format!(
                "try {{ $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{}'); \
                if ($icon) {{ $bmp = $icon.ToBitmap(); $ms = New-Object System.IO.MemoryStream; \
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); \
                $results['{}'] = [Convert]::ToBase64String($ms.ToArray()); \
                $ms.Dispose(); $bmp.Dispose(); $icon.Dispose() }} }} catch {{}}\n",
                escaped, i
            ));
        }
        script.push_str("$results | ConvertTo-Json -Compress\n");

        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(map) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                    if let Some(obj) = map.as_object() {
                        for (key, val) in obj {
                            if let (Ok(idx), Some(b64)) = (key.parse::<usize>(), val.as_str()) {
                                if idx < programs.len() && !b64.is_empty() {
                                    programs[idx].icon_base64 = Some(b64.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Find residual files/folders after an IDE is uninstalled
pub fn find_residual_data(ide_id: &str, options: &UninstallOptions) -> ResidualInfo {
    let mut paths = Vec::new();
    let mut total_size: u64 = 0;

    let ides = crate::ide_detector::detect_installed_ides();
    if let Some(ide) = ides.iter().find(|i| i.id == ide_id) {
        // Cache paths — always clean
        for cache_path in &ide.cache_paths {
            if cache_path.exists() {
                let size = dir_size(cache_path);
                total_size += size;
                paths.push(ResidualPath {
                    path: cache_path.clone(),
                    size,
                    description: "Cache".into(),
                });
            }
        }

        // Log paths — always clean
        for log_path in &ide.log_paths {
            if log_path.exists() {
                let size = dir_size(log_path);
                total_size += size;
                paths.push(ResidualPath {
                    path: log_path.clone(),
                    size,
                    description: "Logs".into(),
                });
            }
        }

        // Config path (settings) — respect keep_settings
        if !options.keep_settings {
            if let Some(ref config) = ide.config_path {
                if config.exists() {
                    let size = dir_size(config);
                    total_size += size;
                    paths.push(ResidualPath {
                        path: config.clone(),
                        size,
                        description: "Configuration".into(),
                    });
                }
            }
        }

        // Extensions — respect keep_extensions
        if !options.keep_extensions {
            if let Some(ref ext) = ide.extension_path {
                if ext.exists() {
                    let size = dir_size(ext);
                    total_size += size;
                    paths.push(ResidualPath {
                        path: ext.clone(),
                        size,
                        description: "Extensions".into(),
                    });
                }
            }
        }

        // Workspace storage (user data) — respect keep_user_data
        if !options.keep_user_data {
            if let Some(ref ws) = ide.workspace_storage_path {
                if ws.exists() {
                    let size = dir_size(ws);
                    total_size += size;
                    paths.push(ResidualPath {
                        path: ws.clone(),
                        size,
                        description: "Workspace Storage".into(),
                    });
                }
            }
        }

        // Global storage (conversations) — respect keep_conversations
        if !options.keep_conversations {
            if let Some(ref gs) = ide.global_storage_path {
                if gs.exists() {
                    let size = dir_size(gs);
                    total_size += size;
                    paths.push(ResidualPath {
                        path: gs.clone(),
                        size,
                        description: "Global Storage (conversations)".into(),
                    });
                }
            }
        }
    }

    ResidualInfo {
        paths,
        registry_keys: vec![],
        total_size,
    }
}

/// Run uninstaller for a program and clean residuals
pub fn uninstall_program(
    program: &InstalledProgram,
    options: &UninstallOptions,
) -> UninstallResult {
    let mut errors = Vec::new();
    let mut uninstaller_ran = false;

    // Try quiet uninstall first, then normal
    let uninstall_cmd = program
        .quiet_uninstall_string
        .as_ref()
        .or(program.uninstall_string.as_ref());

    let has_uninstaller = uninstall_cmd.is_some();
    if let Some(cmd) = uninstall_cmd {
        match run_uninstaller(cmd) {
            Ok(_) => uninstaller_ran = true,
            Err(e) => errors.push(format!("Uninstaller failed: {}", e)),
        }
    }

    // Find and clean residual data
    let mut residual_freed: u64 = 0;
    let residual_cleaned;

    if let Some(ref ide_id) = program.ide_id {
        let residual = find_residual_data(ide_id, options);
        residual_cleaned = !residual.paths.is_empty();
        for rp in &residual.paths {
            if rp.path.exists() {
                match std::fs::remove_dir_all(&rp.path) {
                    Ok(_) => residual_freed += rp.size,
                    Err(e) => errors.push(format!("{}: {}", rp.path.display(), e)),
                }
            }
        }
    } else {
        residual_cleaned = false;
    }

    // For detected-only entries (no uninstaller), success = residual cleaned without errors
    // For registry entries, success = uninstaller ran + no errors
    let success = if has_uninstaller {
        uninstaller_ran && errors.is_empty()
    } else {
        residual_cleaned && errors.is_empty()
    };

    UninstallResult {
        success,
        program_name: program.display_name.clone(),
        uninstaller_ran,
        residual_cleaned,
        residual_freed_bytes: residual_freed,
        errors,
    }
}

fn run_uninstaller(cmd: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(["/C", cmd])
            .output()
            .map_err(|e| format!("Failed to start uninstaller: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Uninstaller exited with code: {}",
                output.status.code().unwrap_or(-1)
            ));
        }
    }
    Ok(())
}

fn dir_size(path: &std::path::Path) -> u64 {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}
