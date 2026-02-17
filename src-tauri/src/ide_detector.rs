use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IdeType {
    VscodeBased,
    JetBrains,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionedFolder {
    pub version: String,
    pub config_path: Option<PathBuf>,
    pub cache_path: Option<PathBuf>,
    pub log_path: Option<PathBuf>,
    pub plugins_path: Option<PathBuf>,
    pub install_path: Option<PathBuf>,
    pub is_latest: bool,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeInfo {
    pub name: String,
    pub id: String,
    pub ide_type: IdeType,
    pub installed: bool,
    pub config_path: Option<PathBuf>,
    pub cache_paths: Vec<PathBuf>,
    pub log_paths: Vec<PathBuf>,
    pub extension_path: Option<PathBuf>,
    pub workspace_storage_path: Option<PathBuf>,
    pub global_storage_path: Option<PathBuf>,
    pub versioned_folders: Vec<VersionedFolder>,
}

// ── VSCode-based IDE definitions ──

struct VscodeDefinition {
    name: &'static str,
    id: &'static str,
    appdata_folder: &'static str,
    home_dot_folder: &'static str,
}

const VSCODE_DEFS: &[VscodeDefinition] = &[
    VscodeDefinition { name: "Visual Studio Code", id: "vscode", appdata_folder: "Code", home_dot_folder: ".vscode" },
    VscodeDefinition { name: "Cursor", id: "cursor", appdata_folder: "Cursor", home_dot_folder: ".cursor" },
    VscodeDefinition { name: "Windsurf", id: "windsurf", appdata_folder: "Windsurf", home_dot_folder: ".windsurf" },
    VscodeDefinition { name: "Kiro", id: "kiro", appdata_folder: "Kiro", home_dot_folder: ".kiro" },
    VscodeDefinition { name: "Trae", id: "trae", appdata_folder: "Trae", home_dot_folder: ".trae" },
    VscodeDefinition { name: "Trae CN", id: "trae_cn", appdata_folder: "Trae CN", home_dot_folder: ".trae-cn" },
    VscodeDefinition { name: "Qoder", id: "qoder", appdata_folder: "Qoder", home_dot_folder: ".qoder" },
    VscodeDefinition { name: "Antigravity", id: "antigravity", appdata_folder: "Antigravity", home_dot_folder: ".antigravity" },
    VscodeDefinition { name: "PearAI", id: "pearai", appdata_folder: "PearAI", home_dot_folder: ".pearai" },
    VscodeDefinition { name: "Aide", id: "aide", appdata_folder: "Aide", home_dot_folder: ".aide" },
    VscodeDefinition { name: "Positron", id: "positron", appdata_folder: "Positron", home_dot_folder: ".positron" },
    VscodeDefinition { name: "VSCodium", id: "vscodium", appdata_folder: "VSCodium", home_dot_folder: ".vscode-oss" },
    VscodeDefinition { name: "Void", id: "void", appdata_folder: "Void", home_dot_folder: ".void" },
];

// ── JetBrains product folder prefixes ──

struct JetBrainsProduct {
    name: &'static str,
    id: &'static str,
    folder_prefixes: &'static [&'static str],
    process_name: &'static str,
}

const JETBRAINS_PRODUCTS: &[JetBrainsProduct] = &[
    JetBrainsProduct { name: "IntelliJ IDEA", id: "intellij", folder_prefixes: &["IntelliJIdea", "IdeaIC"], process_name: "idea64.exe" },
    JetBrainsProduct { name: "PyCharm", id: "pycharm", folder_prefixes: &["PyCharm", "PyCharmCE"], process_name: "pycharm64.exe" },
    JetBrainsProduct { name: "WebStorm", id: "webstorm", folder_prefixes: &["WebStorm"], process_name: "webstorm64.exe" },
    JetBrainsProduct { name: "GoLand", id: "goland", folder_prefixes: &["GoLand"], process_name: "goland64.exe" },
    JetBrainsProduct { name: "CLion", id: "clion", folder_prefixes: &["CLion"], process_name: "clion64.exe" },
    JetBrainsProduct { name: "Rider", id: "rider", folder_prefixes: &["Rider"], process_name: "rider64.exe" },
    JetBrainsProduct { name: "PhpStorm", id: "phpstorm", folder_prefixes: &["PhpStorm"], process_name: "phpstorm64.exe" },
    JetBrainsProduct { name: "RubyMine", id: "rubymine", folder_prefixes: &["RubyMine"], process_name: "rubymine64.exe" },
    JetBrainsProduct { name: "DataGrip", id: "datagrip", folder_prefixes: &["DataGrip"], process_name: "datagrip64.exe" },
    JetBrainsProduct { name: "RustRover", id: "rustrover", folder_prefixes: &["RustRover"], process_name: "rustrover64.exe" },
    JetBrainsProduct { name: "DataSpell", id: "dataspell", folder_prefixes: &["DataSpell"], process_name: "dataspell64.exe" },
    JetBrainsProduct { name: "Aqua", id: "aqua", folder_prefixes: &["Aqua"], process_name: "aqua64.exe" },
    JetBrainsProduct { name: "Android Studio", id: "android_studio", folder_prefixes: &["AndroidStudio", "Google/AndroidStudio"], process_name: "studio64.exe" },
    JetBrainsProduct { name: "Fleet", id: "fleet", folder_prefixes: &["Fleet"], process_name: "Fleet.exe" },
];

fn get_appdata_roaming() -> Option<PathBuf> {
    dirs::config_dir()
}

fn get_appdata_local() -> Option<PathBuf> {
    dirs::cache_dir()
}

fn get_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

// ── Detect VSCode-based IDEs ──

fn detect_vscode_ides() -> Vec<IdeInfo> {
    let appdata_roaming = get_appdata_roaming();
    let appdata_local = get_appdata_local();
    let home = get_home_dir();

    VSCODE_DEFS
        .iter()
        .map(|def| {
            let mut cache_paths = Vec::new();
            let mut log_paths = Vec::new();
            let mut config_path: Option<PathBuf> = None;
            let mut extension_path: Option<PathBuf> = None;
            let mut workspace_storage_path: Option<PathBuf> = None;
            let mut global_storage_path: Option<PathBuf> = None;
            let mut installed = false;

            if let Some(ref roaming) = appdata_roaming {
                let base = roaming.join(def.appdata_folder);
                if base.exists() {
                    installed = true;
                    config_path = Some(base.clone());

                    for sub in &[
                        "Cache", "CachedData", "CachedExtensions", "CachedExtensionVSIXs",
                        "CachedProfilesData", "Code Cache", "GPUCache", "DawnCache",
                        "DawnGraphiteCache", "Service Worker", "blob_storage",
                        "Network", "Session Storage", "Local Storage",
                        "IndexedDB", "WebStorage", "Crashpad",
                    ] {
                        let p = base.join(sub);
                        if p.exists() { cache_paths.push(p); }
                    }

                    let logs = base.join("logs");
                    if logs.exists() { log_paths.push(logs); }

                    let ws = base.join("User").join("workspaceStorage");
                    if ws.exists() { workspace_storage_path = Some(ws); }

                    let gs = base.join("User").join("globalStorage");
                    if gs.exists() { global_storage_path = Some(gs); }
                }
            }

            if let Some(ref local) = appdata_local {
                let local_base = local.join(def.appdata_folder);
                if local_base.exists() {
                    installed = true;
                    for sub in &["Cache", "Code Cache", "GPUCache"] {
                        let p = local_base.join(sub);
                        if p.exists() { cache_paths.push(p); }
                    }
                }
            }

            if let Some(ref home_dir) = home {
                let ext_dir = home_dir.join(def.home_dot_folder).join("extensions");
                if ext_dir.exists() {
                    extension_path = Some(ext_dir);
                    installed = true;
                }
            }

            IdeInfo {
                name: def.name.into(),
                id: def.id.into(),
                ide_type: IdeType::VscodeBased,
                installed,
                config_path,
                cache_paths,
                log_paths,
                extension_path,
                workspace_storage_path,
                global_storage_path,
                versioned_folders: vec![],
            }
        })
        .collect()
}

// ── Detect JetBrains IDEs (versioned folder scanning) ──

fn find_jetbrains_versioned_dirs(base: &PathBuf, prefixes: &[&str]) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if !base.exists() { return dirs; }
    if let Ok(entries) = std::fs::read_dir(base) {
        for entry in entries.filter_map(|e| e.ok()) {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) { continue; }
            let name = entry.file_name().to_string_lossy().to_string();
            for prefix in prefixes {
                if name.starts_with(prefix) {
                    dirs.push(entry.path());
                }
            }
        }
    }
    dirs.sort();
    dirs
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

/// Scan for JetBrains IDE installation directories.
/// Returns (product_id, version_string, install_path) tuples.
fn find_jetbrains_installs() -> Vec<(String, String, PathBuf)> {
    let mut results: Vec<(String, String, PathBuf)> = Vec::new();
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    // Standard Program Files locations
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let jb = PathBuf::from(&pf).join("JetBrains");
        if jb.exists() { search_dirs.push(jb); }
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        let jb = PathBuf::from(&pf86).join("JetBrains");
        if jb.exists() && !search_dirs.contains(&jb) { search_dirs.push(jb); }
    }

    // Scan all drive letters for Program Files\JetBrains
    #[cfg(target_os = "windows")]
    for letter in b'A'..=b'Z' {
        let drive = format!("{}:\\Program Files\\JetBrains", letter as char);
        let p = PathBuf::from(&drive);
        if p.exists() && !search_dirs.contains(&p) {
            search_dirs.push(p);
        }
    }

    // JetBrains Toolbox apps directory
    if let Some(local) = get_appdata_local() {
        let tb_apps = local.join("JetBrains").join("Toolbox").join("apps");
        if tb_apps.exists() { search_dirs.push(tb_apps); }
    }

    for dir in &search_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) { continue; }
                let name = entry.file_name().to_string_lossy().to_string();

                for product in JETBRAINS_PRODUCTS {
                    // Standalone format: "ProductName Version" e.g. "CLion 2022.3.3"
                    // Also matches "ProductName" without version (e.g. "IntelliJ IDEA")
                    if name.starts_with(product.name) {
                        let version = name[product.name.len()..].trim().to_string();
                        results.push((product.id.to_string(), version, entry.path()));
                        break;
                    }
                }
            }
        }
    }

    results
}

fn detect_jetbrains_ides() -> Vec<IdeInfo> {
    let appdata_roaming = get_appdata_roaming();
    let appdata_local = get_appdata_local();
    let all_installs = find_jetbrains_installs();

    JETBRAINS_PRODUCTS
        .iter()
        .filter_map(|product| {
            let mut cache_paths = Vec::new();
            let mut log_paths = Vec::new();
            let mut config_path: Option<PathBuf> = None;
            let mut extension_path: Option<PathBuf> = None;
            let mut versioned_folders: Vec<VersionedFolder> = Vec::new();

            let config_dirs = appdata_roaming.as_ref().map(|r| {
                find_jetbrains_versioned_dirs(&r.join("JetBrains"), product.folder_prefixes)
            }).unwrap_or_default();

            let cache_dirs = appdata_local.as_ref().map(|l| {
                find_jetbrains_versioned_dirs(&l.join("JetBrains"), product.folder_prefixes)
            }).unwrap_or_default();

            // Collect install dirs for this product
            let product_installs: Vec<&(String, String, PathBuf)> = all_installs
                .iter()
                .filter(|(pid, _, _)| pid == product.id)
                .collect();

            // Build unified version set from config, cache, AND install dirs
            let mut version_set = std::collections::BTreeSet::new();
            for d in config_dirs.iter().chain(cache_dirs.iter()) {
                let name = d.file_name().unwrap_or_default().to_string_lossy().to_string();
                for prefix in product.folder_prefixes {
                    if name.starts_with(prefix) {
                        version_set.insert(name[prefix.len()..].to_string());
                    }
                }
            }
            for (_, ver, _) in &product_installs {
                if !ver.is_empty() {
                    version_set.insert(ver.clone());
                }
            }

            let versions: Vec<String> = version_set.into_iter().collect();
            let latest_version = versions.last().cloned().unwrap_or_default();

            for ver in &versions {
                let is_latest = ver == &latest_version;
                let mut vf = VersionedFolder {
                    version: ver.clone(),
                    config_path: None,
                    cache_path: None,
                    log_path: None,
                    plugins_path: None,
                    install_path: None,
                    is_latest,
                    total_size: 0,
                };

                // Find config dir for this version
                for cd in &config_dirs {
                    let name = cd.file_name().unwrap_or_default().to_string_lossy();
                    if name.ends_with(ver.as_str()) {
                        vf.config_path = Some(cd.clone());
                        let plugins = cd.join("plugins");
                        if plugins.exists() { vf.plugins_path = Some(plugins); }
                        if is_latest {
                            config_path = Some(cd.clone());
                            let plugins = cd.join("plugins");
                            if plugins.exists() { extension_path = Some(plugins); }
                        }
                        break;
                    }
                }

                // Find cache dir for this version
                for cd in &cache_dirs {
                    let name = cd.file_name().unwrap_or_default().to_string_lossy();
                    if name.ends_with(ver.as_str()) {
                        vf.cache_path = Some(cd.clone());
                        cache_paths.push(cd.clone());
                        let log_dir = cd.join("log");
                        if log_dir.exists() {
                            vf.log_path = Some(log_dir.clone());
                            log_paths.push(log_dir);
                        }
                        break;
                    }
                }

                // Find install dir for this version
                for (_, iv, ip) in &product_installs {
                    if iv == ver {
                        vf.install_path = Some(ip.clone());
                        break;
                    }
                }

                // Calculate total size (config + cache, NOT install dir)
                let mut sz: u64 = 0;
                if let Some(ref p) = vf.config_path { sz += dir_size(p); }
                if let Some(ref p) = vf.cache_path { sz += dir_size(p); }
                vf.total_size = sz;

                versioned_folders.push(vf);
            }

            // Handle install dirs with no version string (e.g. "IntelliJ IDEA" folder)
            for (_, ver, ip) in &product_installs {
                if ver.is_empty() {
                    // Try to find a matching versioned folder to attach to, or create standalone
                    let already_attached = versioned_folders.iter().any(|vf| vf.install_path.as_ref() == Some(ip));
                    if !already_attached {
                        // Attach to the latest version if any, otherwise create a new entry
                        if let Some(vf) = versioned_folders.iter_mut().find(|vf| vf.is_latest) {
                            if vf.install_path.is_none() {
                                vf.install_path = Some(ip.clone());
                            }
                        }
                    }
                }
            }

            let has_install = versioned_folders.iter().any(|vf| vf.install_path.is_some());
            let installed = config_path.is_some() || !cache_paths.is_empty() || has_install;
            if !installed { return None; }

            Some(IdeInfo {
                name: product.name.into(),
                id: product.id.into(),
                ide_type: IdeType::JetBrains,
                installed,
                config_path,
                cache_paths,
                log_paths,
                extension_path,
                workspace_storage_path: None,
                global_storage_path: None,
                versioned_folders,
            })
        })
        .collect()
}

// ── Public API ──

pub fn detect_installed_ides() -> Vec<IdeInfo> {
    let mut all = detect_vscode_ides();
    all.extend(detect_jetbrains_ides());
    all
}

pub fn get_process_names(ide_id: &str) -> Vec<&'static str> {
    match ide_id {
        "vscode" => vec!["Code.exe"],
        "cursor" => vec!["Cursor.exe"],
        "windsurf" => vec!["Windsurf.exe"],
        "kiro" => vec!["Kiro.exe"],
        "trae" => vec!["Trae.exe"],
        "trae_cn" => vec!["Trae.exe"],
        "qoder" => vec!["Qoder.exe"],
        "antigravity" => vec!["Antigravity.exe"],
        "pearai" => vec!["PearAI.exe"],
        "aide" => vec!["Aide.exe"],
        "positron" => vec!["Positron.exe"],
        "vscodium" => vec!["codium.exe"],
        "void" => vec!["Void.exe"],
        _ => {
            for p in JETBRAINS_PRODUCTS {
                if p.id == ide_id {
                    return vec![p.process_name];
                }
            }
            vec![]
        }
    }
}
