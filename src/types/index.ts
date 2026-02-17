export type IdeType = "VscodeBased" | "JetBrains";

export interface IdeInfo {
  name: string;
  id: string;
  ide_type: IdeType;
  installed: boolean;
  config_path: string | null;
  cache_paths: string[];
  log_paths: string[];
  extension_path: string | null;
  workspace_storage_path: string | null;
  global_storage_path: string | null;
  versioned_folders: VersionedFolder[];
}

export interface VersionedFolder {
  version: string;
  config_path: string | null;
  cache_path: string | null;
  log_path: string | null;
  plugins_path: string | null;
  install_path: string | null;
  is_latest: boolean;
  total_size: number;
}

export type CategoryType =
  | "Cache"
  | "Log"
  | "WorkspaceStorage"
  | "Extension"
  | "CrashReport"
  | "GlobalStorage";

export interface ScanCategory {
  name: string;
  category_type: CategoryType;
  total_size: number;
  file_count: number;
  paths: string[];
}

export interface IdeScanResult {
  ide_id: string;
  ide_name: string;
  categories: ScanCategory[];
  total_size: number;
  total_files: number;
}

export interface ScanSummary {
  results: IdeScanResult[];
  grand_total_size: number;
  grand_total_files: number;
  scan_duration_ms: number;
}

export type CleanMode = "Safe" | "Recommended" | "Aggressive";

export interface CleanResult {
  ide_id: string;
  freed_bytes: number;
  deleted_files: number;
  errors: string[];
}

export interface BackupInfo {
  id: string;
  ide_id: string;
  ide_name: string;
  timestamp: string;
  file_path: string;
  size: number;
  file_count: number;
}

export interface BackupListResult {
  backups: BackupInfo[];
  total_size: number;
}

export interface StorageEntry {
  name: string;
  path: string;
  size: number;
  file_count: number;
  modified: number | null;
  is_ai_related: boolean;
}

export interface ConversationInfo {
  id: string;
  title: string;
  source_db: string;
  source_key: string;
  message_count: number;
  size_bytes: number;
  last_modified: number | null;
}

export interface DbFileInfo {
  path: string;
  size: number;
  name: string;
  modified: number | null;
}

export interface ConversationListResult {
  ide_id: string;
  conversations: ConversationInfo[];
  db_files: DbFileInfo[];
  total_size: number;
}

export interface VersionInstall {
  version: string;
  path: string;
  is_latest: boolean;
}

export interface InstalledProgram {
  display_name: string;
  publisher: string;
  install_location: string | null;
  uninstall_string: string | null;
  quiet_uninstall_string: string | null;
  display_version: string;
  estimated_size_kb: number;
  registry_key: string;
  icon_path: string | null;
  ide_id: string | null;
  icon_base64: string | null;
  version_installs: VersionInstall[];
}

export interface UninstallOptions {
  keep_user_data: boolean;
  keep_conversations: boolean;
  keep_extensions: boolean;
  keep_settings: boolean;
}

export interface UninstallResult {
  success: boolean;
  program_name: string;
  uninstaller_ran: boolean;
  residual_cleaned: boolean;
  residual_freed_bytes: number;
  errors: string[];
}

export interface ResidualInfo {
  paths: ResidualPath[];
  registry_keys: string[];
  total_size: number;
}

export interface ResidualPath {
  path: string;
  size: number;
  description: string;
}

export interface ConversationMessage {
  role: string;
  content: string;
}

export interface ConversationContent {
  title: string;
  messages: ConversationMessage[];
}

export interface KeepOptionSizes {
  settings_size: number;
  user_data_size: number;
  conversations_size: number;
  extensions_size: number;
}

export type Page = "scan" | "conversations" | "uninstall" | "settings";
