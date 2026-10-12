use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<Model>,
}
#[derive(Deserialize)]
struct Model {
    name: String,
}
#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    stream: bool,
    messages: Vec<Message<'a>>,
    format: &'a str,
    options: ChatOptions,
}
#[derive(Serialize)]
struct ChatOptions {
    num_predict: u32,
    temperature: f32,
}
#[derive(Serialize)]
struct Message<'a> {
    role: &'a str,
    content: &'a str,
}
#[derive(Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}
#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

fn approved_operation(value: &str) -> &'static str {
    match value {
        "ai_edit" => "ai_edit",
        "ai_translate" => "ai_translate",
        "ai_suggest" => "ai_suggest",
        "ai_grade" => "ai_grade",
        "ai_lorebook" => "ai_lorebook",
        "ai_optimize" => "ai_optimize",
        "ai_selection" => "ai_selection",
        "greeting_library_title" => "greeting_library_title",
        "greeting_library_improve" => "greeting_library_improve",
        "wizard_name" => "wizard_name",
        "wizard_description" => "wizard_description",
        "wizard_personality" => "wizard_personality",
        "wizard_scenario" => "wizard_scenario",
        "wizard_first_mes" => "wizard_first_mes",
        "wizard_mes_example" => "wizard_mes_example",
        "wizard_system_prompt" => "wizard_system_prompt",
        "window_error" => "window_error",
        "unhandled_promise" => "unhandled_promise",
        _ => "UNKNOWN_OPERATION",
    }
}

fn approved_error_kind(value: &str) -> &'static str {
    match value {
        "MODEL_JSON_INVALID" => "MODEL_JSON_INVALID",
        "OLLAMA_NETWORK" => "OLLAMA_NETWORK",
        "OLLAMA_TIMEOUT" => "OLLAMA_TIMEOUT",
        "CLIENT_RESPONSE_SHAPE" => "CLIENT_RESPONSE_SHAPE",
        "OLLAMA_HTTP" => "OLLAMA_HTTP",
        "TYPEERROR" => "TYPEERROR",
        "RANGEERROR" => "RANGEERROR",
        "ERROR" => "ERROR",
        "UNKNOWN" => "UNKNOWN",
        _ => "UNKNOWN_ERROR",
    }
}

fn error_log_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("logs")
        .join("technical-errors.log"))
}

#[tauri::command]
fn error_log_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(error_log_path(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_error_log(
    app: tauri::AppHandle,
    operation: String,
    error_kind: String,
) -> Result<(), String> {
    let path = error_log_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let timestamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let operation = approved_operation(&operation);
    let error_kind = approved_error_kind(&error_kind);
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(
        file,
        "{timestamp}\t{}\t{operation}\t{error_kind}",
        env!("CARGO_PKG_VERSION")
    )
    .map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildInfo {
    version: &'static str,
    commit: &'static str,
}

#[tauri::command]
fn build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CARGO_PKG_VERSION"),
        commit: option_env!("SILLY_EASYCHAR_GIT_COMMIT").unwrap_or("development"),
    }
}

#[tauri::command]
fn open_repository() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args([
                "url.dll,FileProtocolHandler",
                "https://github.com/mccrypt1/Silly_EasyChar",
            ])
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Browser konnte nicht geöffnet werden: {error}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Der Repository-Link wird derzeit nur unter Windows unterstützt.".into())
    }
}

fn safe_base_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');
    let parsed =
        reqwest::Url::parse(trimmed).map_err(|_| "Ungültige Ollama-Adresse.".to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if parsed.scheme() != "http" || !(host == "localhost" || host == "127.0.0.1" || host == "::1") {
        return Err(
            "Aus Sicherheitsgründen sind nur lokale Ollama-Adressen per HTTP erlaubt.".into(),
        );
    }
    Ok(trimmed.to_string())
}

const OLLAMA_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_CARD_BYTES: u64 = 64 * 1024 * 1024;

fn exceeds_card_limit(len: u64) -> bool {
    len > MAX_CARD_BYTES
}

fn ollama_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .build()
        .map_err(|error| format!("Ollama-Client konnte nicht erstellt werden: {error}"))
}

fn ollama_transport_error(error: reqwest::Error, fallback: &str) -> String {
    if error.is_timeout() {
        return "Ollama-Timeout: Die lokale Anfrage wurde abgebrochen.".into();
    }
    if error.is_redirect() {
        return "Die Ollama-Antwort wurde abgelehnt, weil der lokale Server eine Weiterleitung versucht hat.".into();
    }
    format!("{fallback}: {error}")
}

#[tauri::command]
async fn ollama_models(base_url: String) -> Result<Vec<String>, String> {
    let base = safe_base_url(&base_url)?;
    let result = ollama_client(OLLAMA_TIMEOUT)?
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map_err(|error| ollama_transport_error(error, "Ollama nicht erreichbar"))?;
    if !result.status().is_success() {
        return Err(format!("Ollama antwortet mit HTTP {}.", result.status()));
    }
    let tags: TagsResponse = result
        .json()
        .await
        .map_err(|e| format!("Ungültige Ollama-Antwort: {e}"))?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
async fn ollama_chat(
    base_url: String,
    model: String,
    system: String,
    prompt: String,
) -> Result<String, String> {
    let base = safe_base_url(&base_url)?;
    if model.trim().is_empty() {
        return Err("Kein Modell ausgewählt.".into());
    }
    let body = ChatRequest {
        model: &model,
        stream: false,
        format: "json",
        messages: vec![
            Message {
                role: "system",
                content: &system,
            },
            Message {
                role: "user",
                content: &prompt,
            },
        ],
        options: ChatOptions {
            num_predict: 6144,
            temperature: 0.65,
        },
    };
    let result = ollama_client(OLLAMA_TIMEOUT)?
        .post(format!("{base}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|error| ollama_transport_error(error, "Ollama-Anfrage fehlgeschlagen"))?;
    if !result.status().is_success() {
        let status = result.status();
        let text = result.text().await.unwrap_or_default();
        return Err(format!("Ollama HTTP {status}: {text}"));
    }
    let chat: ChatResponse = result
        .json()
        .await
        .map_err(|e| format!("Ungültige Ollama-Antwort: {e}"))?;
    Ok(chat.message.content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            build_info,
            open_repository,
            open_marinara_repository,
            error_log_location,
            write_error_log,
            export_character_file,
            ollama_models,
            ollama_chat,
            choose_character_folder,
            scan_character_folder,
            read_character_file,
            read_character_file_with_fingerprint,
            save_character_file,
            add_character_file,
            duplicate_character_file,
            create_card_backup,
            remove_character_file,
            list_recovery_cards,
            read_recovery_card,
            restore_removed_card,
            delete_removed_card,
            list_card_versions,
            read_card_version,
            rename_card_version,
            restore_card_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Silly EasyChar");
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryCard {
    path: String,
    file_name: String,
    name: String,
    modified: u64,
    size: u64,
    format: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionInfo {
    id: String,
    created: u64,
    size: u64,
    manual: bool,
    label: Option<String>,
    content_hash: String,
}

#[tauri::command]
fn open_marinara_repository() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args([
                "url.dll,FileProtocolHandler",
                "https://github.com/Pasta-Devs/Marinara-Engine",
            ])
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Browser konnte nicht geöffnet werden: {error}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Der Repository-Link wird derzeit nur unter Windows unterstützt.".into())
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileFingerprint {
    modified: u64,
    size: u64,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadCardResult {
    bytes: Vec<u8>,
    fingerprint: FileFingerprint,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveCardResult {
    fingerprint: FileFingerprint,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryManifest {
    id: String,
    archived_file: String,
    original_path: String,
    card_name: String,
    format: String,
    removed_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryEntry {
    id: String,
    card_name: String,
    file_name: String,
    original_path: Option<String>,
    format: String,
    removed_at: u64,
    size: u64,
    legacy: bool,
}

fn valid_version_id(id: &str) -> bool {
    Path::new(id).components().count() == 1 && parse_version_filename(id).is_some()
}

fn parse_version_filename(name: &str) -> Option<(u64, bool)> {
    let stem = name.split('.').next()?;
    let manual = stem.starts_with("manual-");
    let created = stem
        .strip_prefix("manual-")
        .unwrap_or(stem)
        .parse::<u128>()
        .ok()? as u64;
    Some((created, manual))
}

fn read_version_labels(dir: &Path) -> HashMap<String, String> {
    fs::read(dir.join("labels.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_version_labels(dir: &Path, labels: &HashMap<String, String>) -> Result<(), String> {
    let target = dir.join("labels.json");
    if labels.is_empty() {
        if target.exists() {
            fs::remove_file(target).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    fs::write(
        target,
        serde_json::to_vec_pretty(labels).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn set_version_label(dir: &Path, id: &str, label: &str) -> Result<(), String> {
    if !valid_version_id(id) {
        return Err("Ungültige Versions-ID.".into());
    }
    if !dir.join(id).is_file() {
        return Err("Version nicht gefunden.".into());
    }
    let clean = label.trim();
    if clean.chars().count() > 80 || clean.chars().any(char::is_control) {
        return Err("Der Versionsname darf höchstens 80 Zeichen enthalten.".into());
    }
    let mut labels = read_version_labels(dir);
    if clean.is_empty() {
        labels.remove(id);
    } else {
        labels.insert(id.to_string(), clean.to_string());
    }
    write_version_labels(dir, &labels)
}

fn read_u32(data: &[u8], offset: usize) -> Option<usize> {
    Some(u32::from_be_bytes(data.get(offset..offset + 4)?.try_into().ok()?) as usize)
}

fn png_card_json(data: &[u8]) -> Option<serde_json::Value> {
    if data.get(..8)? != [137, 80, 78, 71, 13, 10, 26, 10] {
        return None;
    }
    let mut offset = 8usize;
    let mut v2 = None;
    let mut v3 = None;
    while offset + 12 <= data.len() {
        let len = read_u32(data, offset)?;
        if offset + len + 12 > data.len() {
            break;
        }
        let kind = &data[offset + 4..offset + 8];
        let body = &data[offset + 8..offset + 8 + len];
        if kind == b"tEXt" {
            if let Some(zero) = body.iter().position(|b| *b == 0) {
                let key = &body[..zero];
                if key == b"chara" || key == b"ccv3" {
                    let text = String::from_utf8_lossy(&body[zero + 1..]);
                    let decoded = base64::engine::general_purpose::STANDARD
                        .decode(text.trim().as_bytes())
                        .ok()
                        .and_then(|value| serde_json::from_slice(&value).ok())
                        .or_else(|| serde_json::from_str(&text).ok());
                    if key == b"ccv3" {
                        v3 = decoded;
                    } else {
                        v2 = decoded;
                    }
                }
            }
        }
        offset += len + 12;
    }
    v3.or(v2)
}

fn card_name(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let json: serde_json::Value = if path
        .extension()?
        .to_string_lossy()
        .eq_ignore_ascii_case("png")
    {
        png_card_json(&bytes)?
    } else {
        serde_json::from_slice(&bytes).ok()?
    };
    json.get("data")
        .and_then(|value| value.get("name"))
        .or_else(|| json.get("name"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
}

fn allowed_card_path(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("png") || value.eq_ignore_ascii_case("json"))
            .unwrap_or(false)
}

fn linked_folder_record(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("linked-folder.txt"))
}

fn stored_linked_folder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let text = fs::read_to_string(linked_folder_record(app)?)
        .map_err(|_| "Bitte den SillyTavern-Ordner erneut koppeln.".to_string())?;
    let path = PathBuf::from(text.trim());
    if path.as_os_str().is_empty() {
        return Err("Bitte den SillyTavern-Ordner erneut koppeln.".into());
    }
    Ok(path)
}

fn linked_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let stored = stored_linked_folder(app)?;
    let root = fs::canonicalize(&stored)
        .map_err(|_| "Der gekoppelte Ordner existiert nicht mehr.".to_string())?;
    if !root.is_dir() {
        return Err("Der gekoppelte Ordner existiert nicht mehr.".into());
    }
    Ok(root)
}

fn store_linked_folder(app: &tauri::AppHandle, folder: &Path) -> Result<(), String> {
    let root = fs::canonicalize(folder)
        .map_err(|error| format!("Ordner konnte nicht gespeichert werden: {error}"))?;
    if !root.is_dir() {
        return Err("Der gewählte Pfad ist kein Ordner.".into());
    }
    let record = linked_folder_record(app)?;
    if let Some(parent) = record.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(record, folder.to_string_lossy().as_bytes()).map_err(|error| error.to_string())
}

fn canonical_inside_root(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Die Datei liegt außerhalb des gekoppelten SillyTavern-Ordners.".into());
    }
    Ok(canonical)
}

fn require_linked_directory(app: &tauri::AppHandle, folder: &Path) -> Result<PathBuf, String> {
    let root = linked_root(app)?;
    let requested = fs::canonicalize(folder)
        .map_err(|_| "Bitte den SillyTavern-Ordner erneut koppeln.".to_string())?;
    if requested != root {
        return Err("Bitte den SillyTavern-Ordner erneut koppeln.".into());
    }
    stored_linked_folder(app)
}

fn require_linked_card(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf, String> {
    let root = linked_root(app)?;
    if !allowed_card_path(path) {
        return Err("Nur vorhandene PNG- und JSON-Karten dürfen geöffnet werden.".into());
    }
    canonical_inside_root(&root, path)?;
    let len = fs::metadata(path).map_err(|error| error.to_string())?.len();
    if exceeds_card_limit(len) {
        return Err("Die Karte ist größer als 64 MB.".into());
    }
    Ok(path.to_path_buf())
}

fn directory_inside_root(root: &Path, directory: &Path) -> Result<(), String> {
    let mut existing = directory.to_path_buf();
    while !existing.exists() {
        let Some(name) = existing.file_name() else {
            return Err("Ungültiger Zielordner.".into());
        };
        if name == "." || name == ".." {
            return Err("Ungültiger Zielordner.".into());
        }
        existing = existing
            .parent()
            .ok_or_else(|| "Ungültiger Zielordner.".to_string())?
            .to_path_buf();
    }
    let canonical = fs::canonicalize(&existing).map_err(|error| error.to_string())?;
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    if canonical != root && !canonical.starts_with(&root) {
        return Err(
            "Die Wiederherstellung ist nur im gekoppelten SillyTavern-Ordner erlaubt.".into(),
        );
    }
    Ok(())
}

fn card_destination_inside_root(root: &Path, destination: &Path) -> Result<(), String> {
    let Some(name) = destination.file_name() else {
        return Err("Ungültiger Kartenpfad.".into());
    };
    if name == "." || name == ".." || Path::new(name).components().count() != 1 {
        return Err("Ungültiger Kartenpfad.".into());
    }
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "Ungültiger Kartenpfad.".to_string())?;
    directory_inside_root(root, parent)
}

fn recovery_file_name(id: &str) -> Result<&str, String> {
    let name = id.split_once('-').map(|(_, name)| name).unwrap_or(id);
    if Path::new(name).components().count() != 1 {
        return Err("Ungültiger Dateiname.".into());
    }
    Ok(name)
}

fn recovery_destination(
    root: &Path,
    stored_folder: &Path,
    original_path: Option<&Path>,
    file_name: &str,
) -> Result<PathBuf, String> {
    if let Some(original) = original_path {
        if card_destination_inside_root(root, original).is_ok() {
            return Ok(original.to_path_buf());
        }
    }
    let fallback = stored_folder.join(file_name);
    card_destination_inside_root(root, &fallback)?;
    Ok(fallback)
}

fn collect_cards(dir: &Path, output: &mut Vec<LibraryCard>) {
    let Ok(root) = fs::canonicalize(dir) else {
        return;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        if !allowed_card_path(&path) {
            continue;
        }
        if canonical_inside_root(&root, &path).is_err() {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if exceeds_card_limit(meta.len()) {
            continue;
        }
        let Some(name) = card_name(&path) else {
            continue;
        };
        output.push(LibraryCard {
            path: path.to_string_lossy().into_owned(),
            file_name: entry.file_name().to_string_lossy().into_owned(),
            name,
            modified: meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0),
            size: meta.len(),
            format: path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_ascii_uppercase(),
        });
    }
}

fn version_dir(app: &tauri::AppHandle, card_path: &Path) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("versions");
    let hash = format!(
        "{:x}",
        Sha256::digest(card_path.to_string_lossy().as_bytes())
    );
    Ok(root.join(hash))
}

fn prune_versions(dir: &Path, keep: usize) -> Result<(), String> {
    let mut items: Vec<_> = fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            parse_version_filename(&name).is_some_and(|(_, manual)| !manual)
        })
        .collect();
    items.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
    for old in items.into_iter().skip(keep) {
        fs::remove_file(old.path()).map_err(|error| error.to_string())?;
    }
    let mut labels = read_version_labels(dir);
    labels.retain(|id, _| dir.join(id).is_file());
    write_version_labels(dir, &labels)?;
    Ok(())
}

fn file_fingerprint(path: &Path) -> Result<FileFingerprint, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let meta = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileFingerprint {
        modified,
        size: meta.len(),
        sha256: format!("{:x}", Sha256::digest(&bytes)),
    })
}

fn newest_identical_automatic_version(
    dir: &Path,
    content_hash: &str,
) -> Result<Option<String>, String> {
    let newest = fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter(|entry| {
            parse_version_filename(&entry.file_name().to_string_lossy())
                .is_some_and(|(_, is_manual)| !is_manual)
        })
        .max_by_key(|entry| entry.file_name());
    Ok(newest.and_then(|entry| {
        (file_fingerprint(&entry.path()).ok()?.sha256 == content_hash)
            .then(|| entry.file_name().to_string_lossy().into_owned())
    }))
}

fn copy_card_version(
    app: &tauri::AppHandle,
    card_path: &Path,
    manual: bool,
    keep: usize,
) -> Result<String, String> {
    if !card_path.exists() {
        return Err("Die Karte existiert nicht mehr.".into());
    }
    let dir = version_dir(app, card_path)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let extension = card_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");
    let id = if manual {
        format!("manual-{stamp}.{extension}")
    } else {
        format!("{stamp}.{extension}")
    };
    if !manual {
        let current_hash = file_fingerprint(card_path)?.sha256;
        if let Some(existing) = newest_identical_automatic_version(&dir, &current_hash)? {
            prune_versions(&dir, keep.clamp(1, 100))?;
            return Ok(existing);
        }
    }
    fs::copy(card_path, dir.join(&id))
        .map_err(|error| format!("Version konnte nicht angelegt werden: {error}"))?;
    if !manual {
        prune_versions(&dir, keep.clamp(1, 100))?;
    }
    Ok(id)
}

fn make_backup(app: &tauri::AppHandle, card_path: &Path, keep: usize) -> Result<(), String> {
    if !card_path.exists() {
        return Ok(());
    }
    copy_card_version(app, card_path, false, keep)?;
    Ok(())
}

fn archive_card(card_path: &Path, recovery_dir: &Path) -> Result<PathBuf, String> {
    if !allowed_card_path(card_path) {
        return Err("Nur vorhandene PNG- und JSON-Karten dürfen entfernt werden.".into());
    }
    fs::create_dir_all(recovery_dir).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as u64;
    let file_name = card_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Ungültiger Kartenpfad.".to_string())?;
    let target = recovery_dir.join(format!("{stamp}-{file_name}"));
    fs::copy(card_path, &target).map_err(|error| {
        format!("Wiederherstellungskopie konnte nicht erstellt werden: {error}")
    })?;
    let manifest = RecoveryManifest {
        id: target
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        archived_file: target
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        original_path: card_path.to_string_lossy().into_owned(),
        card_name: card_name(card_path).unwrap_or_else(|| file_name.to_string()),
        format: card_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_ascii_uppercase(),
        removed_at: stamp,
    };
    let manifest_path = recovery_dir.join(format!("{stamp}.recovery.json"));
    if let Err(error) = fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    ) {
        let _ = fs::remove_file(&target);
        return Err(format!(
            "Wiederherstellungsmanifest konnte nicht erstellt werden: {error}"
        ));
    }
    fs::remove_file(card_path)
        .map_err(|error| format!("Karte konnte nicht aus SillyTavern entfernt werden: {error}"))?;
    Ok(target)
}

fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("removed-cards"))
}

fn safe_recovery_file(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if Path::new(id).components().count() != 1 || id.ends_with(".recovery.json") {
        return Err("Ungültige Papierkorb-ID.".into());
    }
    let file = dir.join(id);
    if !allowed_card_path(&file) {
        return Err("Papierkorb-Eintrag nicht gefunden.".into());
    }
    Ok(file)
}

fn unique_target(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().unwrap_or(Path::new("."));
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let extension = path.extension().unwrap_or_default().to_string_lossy();
    for index in 2..10_000 {
        let candidate = parent.join(format!("{stem} ({index}).{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem}-wiederhergestellt.{extension}"))
}

#[tauri::command]
async fn choose_character_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(handle) = rfd::AsyncFileDialog::new()
        .set_title("SillyTavern-Character-Ordner auswählen")
        .pick_folder()
        .await
    else {
        return Ok(None);
    };
    let folder = handle.path().to_path_buf();
    store_linked_folder(&app, &folder)?;
    Ok(Some(folder.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn export_character_file(
    file_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    if exceeds_card_limit(bytes.len() as u64) {
        return Err("Die Karte ist größer als 64 MB.".into());
    }
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Ungültiger Dateiname.".to_string())?
        .to_string();
    let extension = Path::new(&safe_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Die Exportdatei benötigt die Endung .json oder .png.".to_string())?;
    if extension != "json" && extension != "png" {
        return Err("Nur JSON- und PNG-Karten dürfen exportiert werden.".into());
    }
    let Some(handle) = rfd::AsyncFileDialog::new()
        .set_title("Character Card exportieren")
        .set_file_name(&safe_name)
        .add_filter("Character Card", &[extension.as_str()])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    fs::write(handle.path(), bytes)
        .map_err(|error| format!("Export konnte nicht gespeichert werden: {error}"))?;
    Ok(Some(handle.path().to_string_lossy().into_owned()))
}

#[tauri::command]
fn scan_character_folder(app: tauri::AppHandle, path: String) -> Result<Vec<LibraryCard>, String> {
    let dir = require_linked_directory(&app, Path::new(&path))?;
    let mut cards = Vec::new();
    collect_cards(&dir, &mut cards);
    cards.sort_by_key(|card| std::cmp::Reverse(card.modified));
    Ok(cards)
}

#[tauri::command]
fn read_character_file(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    fs::read(require_linked_card(&app, Path::new(&path))?).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_character_file_with_fingerprint(
    app: tauri::AppHandle,
    path: String,
) -> Result<ReadCardResult, String> {
    let bytes = read_character_file(app, path.clone())?;
    Ok(ReadCardResult {
        bytes,
        fingerprint: file_fingerprint(Path::new(&path))?,
    })
}

#[tauri::command]
fn save_character_file(
    app: tauri::AppHandle,
    path: String,
    bytes: Vec<u8>,
    expected_fingerprint: Option<FileFingerprint>,
    force: Option<bool>,
    backup_keep: Option<usize>,
) -> Result<SaveCardResult, String> {
    let file = require_linked_card(&app, Path::new(&path))?;
    if exceeds_card_limit(bytes.len() as u64) {
        return Err("Die Karte ist größer als 64 MB.".into());
    }
    let current = file_fingerprint(&file)?;
    if !force.unwrap_or(false) && expected_fingerprint.is_some_and(|expected| expected != current) {
        return Err(format!(
            "FILE_CONFLICT|{}|{}|{}",
            current.modified, current.size, current.sha256
        ));
    }
    make_backup(&app, &file, backup_keep.unwrap_or(10))?;
    fs::write(file, bytes)
        .map_err(|error| format!("Karte konnte nicht gespeichert werden: {error}"))?;
    Ok(SaveCardResult {
        fingerprint: file_fingerprint(Path::new(&path))?,
    })
}

#[tauri::command]
fn add_character_file(
    app: tauri::AppHandle,
    folder: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if exceeds_card_limit(bytes.len() as u64) {
        return Err("Die Karte ist größer als 64 MB.".into());
    }
    let dir = require_linked_directory(&app, Path::new(&folder))?;
    let safe: String = file_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric()
                || character == ' '
                || character == '-'
                || character == '_'
                || character == '.'
            {
                character
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty()
        || safe == "."
        || safe == ".."
        || Path::new(&safe)
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("Ungültiger Dateiname.".into());
    }
    let target = dir.join(if safe.to_ascii_lowercase().ends_with(".png") {
        safe
    } else {
        format!("{safe}.png")
    });
    card_destination_inside_root(&linked_root(&app)?, &target)?;
    if target.exists() {
        return Err("Eine Karte mit diesem Dateinamen existiert bereits.".into());
    }
    fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn duplicate_character_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let source = require_linked_card(&app, Path::new(&path))?;
    let parent = source
        .parent()
        .ok_or_else(|| "Ungültiger Kartenpfad.".to_string())?;
    let stem = source.file_stem().unwrap_or_default().to_string_lossy();
    let extension = source.extension().unwrap_or_default().to_string_lossy();
    let target = unique_target(parent.join(format!("{stem} - Experiment.{extension}")));
    card_destination_inside_root(&linked_root(&app)?, &target)?;
    fs::copy(&source, &target)
        .map_err(|error| format!("Experimentkopie konnte nicht erstellt werden: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn create_card_backup(
    app: tauri::AppHandle,
    path: String,
    label: String,
) -> Result<String, String> {
    let file = require_linked_card(&app, Path::new(&path))?;
    let id = copy_card_version(&app, &file, true, 10)?;
    let dir = version_dir(&app, &file)?;
    set_version_label(&dir, &id, &label)?;
    Ok(id)
}

#[tauri::command]
fn remove_character_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let file = require_linked_card(&app, Path::new(&path))?;
    archive_card(&file, &recovery_dir(&app)?).map(|target| target.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_recovery_cards(app: tauri::AppHandle) -> Result<Vec<RecoveryEntry>, String> {
    let dir = recovery_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut output = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let path = entry.path();
        if !allowed_card_path(&path)
            || entry
                .file_name()
                .to_string_lossy()
                .ends_with(".recovery.json")
        {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        let prefix = id
            .split('-')
            .next()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        let manifest_path = dir.join(format!("{prefix}.recovery.json"));
        let manifest: Option<RecoveryManifest> = fs::read(manifest_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        let meta = entry.metadata().map_err(|error| error.to_string())?;
        output.push(RecoveryEntry {
            id: id.clone(),
            card_name: manifest
                .as_ref()
                .map(|value| value.card_name.clone())
                .or_else(|| card_name(&path))
                .unwrap_or_else(|| id.clone()),
            file_name: id
                .split_once('-')
                .map(|(_, name)| name)
                .unwrap_or(&id)
                .to_string(),
            original_path: manifest.as_ref().map(|value| value.original_path.clone()),
            format: path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_ascii_uppercase(),
            removed_at: manifest
                .as_ref()
                .map(|value| value.removed_at)
                .unwrap_or(prefix),
            size: meta.len(),
            legacy: manifest.is_none(),
        });
    }
    output.sort_by_key(|entry| std::cmp::Reverse(entry.removed_at));
    Ok(output)
}

#[tauri::command]
fn read_recovery_card(app: tauri::AppHandle, id: String) -> Result<Vec<u8>, String> {
    fs::read(safe_recovery_file(&recovery_dir(&app)?, &id)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn restore_removed_card(
    app: tauri::AppHandle,
    id: String,
    fallback_folder: Option<String>,
) -> Result<String, String> {
    let dir = recovery_dir(&app)?;
    let archived = safe_recovery_file(&dir, &id)?;
    let prefix = id
        .split('-')
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let manifest_path = dir.join(format!("{prefix}.recovery.json"));
    let manifest: Option<RecoveryManifest> = fs::read(&manifest_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok());
    let root = linked_root(&app)?;
    let stored = stored_linked_folder(&app)?;
    if let Some(folder) = fallback_folder.as_deref() {
        if !folder.is_empty() {
            require_linked_directory(&app, Path::new(folder))?;
        }
    }
    let destination = recovery_destination(
        &root,
        &stored,
        manifest
            .as_ref()
            .map(|value| PathBuf::from(&value.original_path))
            .as_deref(),
        recovery_file_name(&id)?,
    )?;
    let target = unique_target(destination);
    card_destination_inside_root(&root, &target)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(&archived, &target)
        .map_err(|error| format!("Karte konnte nicht wiederhergestellt werden: {error}"))?;
    fs::remove_file(&archived).map_err(|error| error.to_string())?;
    if manifest_path.exists() {
        fs::remove_file(manifest_path).map_err(|error| error.to_string())?;
    }
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_removed_card(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = recovery_dir(&app)?;
    let archived = safe_recovery_file(&dir, &id)?;
    let prefix = id
        .split('-')
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    fs::remove_file(archived).map_err(|error| error.to_string())?;
    let manifest = dir.join(format!("{prefix}.recovery.json"));
    if manifest.exists() {
        fs::remove_file(manifest).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn list_card_versions(app: tauri::AppHandle, path: String) -> Result<Vec<VersionInfo>, String> {
    let file = require_linked_card(&app, Path::new(&path))?;
    let dir = version_dir(&app, &file)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let labels = read_version_labels(&dir);
    let mut items: Vec<_> = fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let (created, manual) = parse_version_filename(&name)?;
            Some(VersionInfo {
                label: labels.get(&name).cloned(),
                id: name,
                created,
                size: meta.len(),
                manual,
                content_hash: file_fingerprint(&entry.path()).ok()?.sha256,
            })
        })
        .collect();
    items.sort_by_key(|version| std::cmp::Reverse(version.created));
    Ok(items)
}

#[tauri::command]
fn read_card_version(app: tauri::AppHandle, path: String, id: String) -> Result<Vec<u8>, String> {
    if !valid_version_id(&id) {
        return Err("Ungültige Versions-ID.".into());
    }
    let file = require_linked_card(&app, Path::new(&path))?;
    fs::read(version_dir(&app, &file)?.join(id)).map_err(|_| "Version nicht gefunden.".to_string())
}

#[tauri::command]
fn rename_card_version(
    app: tauri::AppHandle,
    path: String,
    id: String,
    label: String,
) -> Result<(), String> {
    let file = require_linked_card(&app, Path::new(&path))?;
    let dir = version_dir(&app, &file)?;
    set_version_label(&dir, &id, &label)
}

#[tauri::command]
fn restore_card_version(app: tauri::AppHandle, path: String, id: String) -> Result<(), String> {
    if !valid_version_id(&id) {
        return Err("Ungültige Versions-ID.".into());
    }
    let target = require_linked_card(&app, Path::new(&path))?;
    let source = version_dir(&app, &target)?.join(id);
    let bytes = fs::read(&source).map_err(|_| "Version nicht gefunden.".to_string())?;
    make_backup(&app, &target, 10)?;
    fs::write(target, bytes).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn extracts_character_name_from_png_text_chunk() {
        let json = r#"{"spec":"chara_card_v2","data":{"name":"Lila ✨"}}"#;
        let encoded = base64::engine::general_purpose::STANDARD.encode(json.as_bytes());
        let mut body = b"chara\0".to_vec();
        body.extend_from_slice(encoded.as_bytes());
        let mut png = vec![137, 80, 78, 71, 13, 10, 26, 10];
        png.extend_from_slice(&(body.len() as u32).to_be_bytes());
        png.extend_from_slice(b"tEXt");
        png.extend_from_slice(&body);
        png.extend_from_slice(&[0, 0, 0, 0]);
        let parsed = png_card_json(&png).expect("card metadata");
        assert_eq!(parsed["data"]["name"], "Lila ✨");
    }

    #[test]
    fn ollama_url_is_restricted_to_local_machine() {
        assert!(safe_base_url("http://127.0.0.1:11434").is_ok());
        assert!(safe_base_url("http://localhost:11434/").is_ok());
        assert!(safe_base_url("https://example.com").is_err());
        assert!(safe_base_url("http://192.168.1.5:11434").is_err());
    }

    fn serve_once(response: &'static [u8]) -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 2048];
            let _ = stream.read(&mut buffer);
            let _ = stream.write_all(response);
        });
        port
    }

    #[test]
    fn ollama_client_rejects_local_redirects() {
        let port = serve_once(b"HTTP/1.1 307 Temporary Redirect\r\nLocation: http://example.com/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let client = ollama_client(Duration::from_secs(2)).unwrap();
        let result = tauri::async_runtime::block_on(async move {
            client
                .get(format!("http://127.0.0.1:{port}/api/tags"))
                .send()
                .await
        });
        match result {
            Ok(response) => {
                assert!(response.status().is_redirection(), "{}", response.status());
                assert_eq!(response.url().host_str(), Some("127.0.0.1"));
            }
            Err(error) => {
                let message = error.to_string().to_lowercase();
                assert!(
                    error.is_redirect() || message.contains("redirect"),
                    "{error}"
                );
            }
        }
    }

    #[test]
    fn ollama_client_times_out_when_the_local_server_never_answers() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            std::thread::sleep(Duration::from_secs(3));
            let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        });
        let client = ollama_client(Duration::from_millis(200)).unwrap();
        let error = tauri::async_runtime::block_on(async move {
            client
                .get(format!("http://127.0.0.1:{port}/api/tags"))
                .send()
                .await
        })
        .expect_err("hung local request must time out");
        assert!(error.is_timeout(), "{error}");
    }

    #[test]
    fn version_rotation_keeps_only_three_newest_files() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("silly-easychar-test-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        for stamp in [100, 200, 300, 400, 500] {
            fs::write(dir.join(format!("{stamp}.png")), stamp.to_string()).unwrap();
        }
        fs::write(dir.join("manual-50.png"), "protected").unwrap();
        prune_versions(&dir, 3).unwrap();
        let mut names: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["300.png", "400.png", "500.png", "manual-50.png"]
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn identical_latest_automatic_version_is_detected_for_deduplication() {
        let dir =
            std::env::temp_dir().join(format!("silly-easychar-dedupe-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("100.json"), "old").unwrap();
        fs::write(dir.join("200.json"), "same").unwrap();
        fs::write(dir.join("manual-300.json"), "same").unwrap();
        let hash = format!("{:x}", Sha256::digest(b"same"));
        assert_eq!(
            newest_identical_automatic_version(&dir, &hash)
                .unwrap()
                .as_deref(),
            Some("200.json")
        );
        fs::write(dir.join("400.json"), "different").unwrap();
        assert!(newest_identical_automatic_version(&dir, &hash)
            .unwrap()
            .is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn version_labels_can_be_changed_and_removed_without_renaming_snapshot_files() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("silly-easychar-label-test-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manual-100.png"), "card").unwrap();
        set_version_label(&dir, "manual-100.png", "Vor großem Experiment").unwrap();
        assert_eq!(
            read_version_labels(&dir)["manual-100.png"],
            "Vor großem Experiment"
        );
        set_version_label(&dir, "manual-100.png", "").unwrap();
        assert!(read_version_labels(&dir).is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn removed_card_is_copied_to_recovery_before_source_is_deleted() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("silly-easychar-remove-test-{unique}"));
        let recovery = dir.join("recovery");
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("character.json");
        fs::write(
            &source,
            r#"{"spec":"chara_card_v3","data":{"name":"Safe"}}"#,
        )
        .unwrap();
        let archived = archive_card(&source, &recovery).unwrap();
        assert!(!source.exists());
        assert!(archived.exists());
        assert_eq!(
            fs::read_to_string(archived).unwrap(),
            r#"{"spec":"chara_card_v3","data":{"name":"Safe"}}"#
        );
        let manifests: Vec<_> = fs::read_dir(&recovery)
            .unwrap()
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".recovery.json")
            })
            .collect();
        assert_eq!(manifests.len(), 1);
        let manifest: RecoveryManifest =
            serde_json::from_slice(&fs::read(manifests[0].path()).unwrap()).unwrap();
        assert_eq!(manifest.card_name, "Safe");
        assert_eq!(manifest.original_path, source.to_string_lossy());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn fingerprints_detect_content_changes() {
        let dir =
            std::env::temp_dir().join(format!("silly-easychar-fingerprint-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("card.json");
        fs::write(&file, "first").unwrap();
        let first = file_fingerprint(&file).unwrap();
        fs::write(&file, "second value").unwrap();
        let second = file_fingerprint(&file).unwrap();
        assert_ne!(first.sha256, second.sha256);
        assert_ne!(first.size, second.size);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn unique_targets_never_overwrite_existing_cards() {
        let dir =
            std::env::temp_dir().join(format!("silly-easychar-collision-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let original = dir.join("card.json");
        fs::write(&original, "existing").unwrap();
        assert_eq!(unique_target(original), dir.join("card (2).json"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn character_scan_ignores_cards_in_subfolders() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("silly-easychar-scan-test-{unique}"));
        let backup_dir = dir.join("backups");
        fs::create_dir_all(&backup_dir).unwrap();
        fs::write(
            dir.join("visible.json"),
            r#"{"spec":"chara_card_v2","data":{"name":"Visible"}}"#,
        )
        .unwrap();
        fs::write(
            backup_dir.join("hidden.json"),
            r#"{"spec":"chara_card_v2","data":{"name":"Hidden"}}"#,
        )
        .unwrap();
        let mut cards = Vec::new();
        collect_cards(&dir, &mut cards);
        assert_eq!(
            cards
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Visible"]
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn technical_log_values_are_restricted_to_fixed_allowlists() {
        assert_eq!(approved_operation("ai_edit"), "ai_edit");
        assert_eq!(
            approved_error_kind("MODEL_JSON_INVALID"),
            "MODEL_JSON_INVALID"
        );
        assert_eq!(approved_operation("ai_selection"), "ai_selection");
        assert_eq!(
            approved_operation("greeting_library_title"),
            "greeting_library_title"
        );
        assert_eq!(
            approved_operation("greeting_library_improve"),
            "greeting_library_improve"
        );
        assert_eq!(
            approved_operation("private notes: hello"),
            "UNKNOWN_OPERATION"
        );
        assert_eq!(approved_error_kind("private notes: hello"), "UNKNOWN_ERROR");
    }

    #[test]
    fn version_ids_reject_label_files_and_path_segments() {
        assert!(valid_version_id("100.png"));
        assert!(valid_version_id("manual-50.json"));
        assert!(!valid_version_id("labels.json"));
        assert!(!valid_version_id("../100.png"));
        assert!(!exceeds_card_limit(MAX_CARD_BYTES));
        assert!(exceeds_card_limit(MAX_CARD_BYTES + 1));
    }

    #[test]
    fn recovery_destination_stays_inside_the_coupled_folder() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("silly-easychar-root-{unique}"));
        let outside = std::env::temp_dir().join(format!("silly-easychar-outside-{unique}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let canonical = fs::canonicalize(&root).unwrap();
        let inside = recovery_destination(
            &canonical,
            &root,
            Some(&root.join("card.json")),
            "card.json",
        )
        .unwrap();
        assert_eq!(inside, root.join("card.json"));
        let relocated = recovery_destination(
            &canonical,
            &root,
            Some(&outside.join("card.json")),
            "moved.json",
        )
        .unwrap();
        assert_eq!(relocated, root.join("moved.json"));
        assert!(card_destination_inside_root(&canonical, &outside.join("card.json")).is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn character_scan_skips_symlinks_that_leave_the_folder() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("silly-easychar-link-test-{unique}"));
        let outside = std::env::temp_dir().join(format!("silly-easychar-link-outside-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(
            dir.join("visible.json"),
            r#"{"spec":"chara_card_v2","data":{"name":"Visible"}}"#,
        )
        .unwrap();
        fs::write(
            outside.join("secret.json"),
            r#"{"spec":"chara_card_v2","data":{"name":"Secret"}}"#,
        )
        .unwrap();
        std::os::unix::fs::symlink(outside.join("secret.json"), dir.join("escape.json")).unwrap();
        let mut cards = Vec::new();
        collect_cards(&dir, &mut cards);
        assert_eq!(
            cards
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Visible"]
        );
        fs::remove_dir_all(dir).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
}
