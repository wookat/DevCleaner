pub mod backup;
pub mod cleaner;
pub mod commands;
pub mod conversation;
pub mod ide_detector;
pub mod scanner;
pub mod uninstaller;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_ides,
            commands::scan_all_ides,
            commands::scan_single_ide,
            commands::check_ide_running,
            commands::clean_ide,
            commands::list_backups,
            commands::delete_backup,
            commands::get_backup_dir_path,
            commands::clear_all_backups,
            commands::open_backup_dir,
            commands::open_path,
            commands::list_storage_entries,
            commands::get_ide_icons,
            commands::get_keep_option_sizes,
            commands::get_conversation_content,
            commands::delete_conversation,
            commands::delete_conversations_batch,
            commands::scan_conversations,
            commands::scan_installed_programs,
            commands::find_residual_data,
            commands::uninstall_program,
            commands::delete_storage_entry,
            commands::format_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
