use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
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

#[tauri::command]
async fn ollama_models(base_url: String) -> Result<Vec<String>, String> {
    let base = safe_base_url(&base_url)?;
    let result = reqwest::Client::new()
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map_err(|e| format!("Ollama nicht erreichbar: {e}"))?;
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
    let result = reqwest::Client::new()
        .post(format!("{base}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama-Anfrage fehlgeschlagen: {e}"))?;
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
            error_log_location,
            write_error_log,
            export_character_file,
            ollama_models,
            ollama_chat,
            choose_character_folder,
            scan_character_folder,
            read_character_file,
            save_character_file,
            add_character_file,
            create_card_backup,
            remove_character_file,
            list_card_versions,
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
    if Path::new(id).components().count() != 1 || parse_version_filename(id).is_none() {
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

fn collect_cards(dir: &Path, output: &mut Vec<LibraryCard>) {
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
        let Ok(meta) = entry.metadata() else {
            continue;
        };
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

fn copy_card_version(
    app: &tauri::AppHandle,
    card_path: &Path,
    manual: bool,
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
    fs::copy(card_path, dir.join(&id))
        .map_err(|error| format!("Version konnte nicht angelegt werden: {error}"))?;
    if !manual {
        prune_versions(&dir, 3)?;
    }
    Ok(id)
}

fn make_backup(app: &tauri::AppHandle, card_path: &Path) -> Result<(), String> {
    if !card_path.exists() {
        return Ok(());
    }
    copy_card_version(app, card_path, false)?;
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
        .as_millis();
    let file_name = card_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Ungültiger Kartenpfad.".to_string())?;
    let target = recovery_dir.join(format!("{stamp}-{file_name}"));
    fs::copy(card_path, &target)
        .map_err(|error| format!("Wiederherstellungskopie konnte nicht erstellt werden: {error}"))?;
    fs::remove_file(card_path)
        .map_err(|error| format!("Karte konnte nicht aus SillyTavern entfernt werden: {error}"))?;
    Ok(target)
}

#[tauri::command]
async fn choose_character_folder() -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title("SillyTavern-Character-Ordner auswählen")
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().into_owned())
}

#[tauri::command]
async fn export_character_file(
    file_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    if bytes.len() > 64 * 1024 * 1024 {
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
fn scan_character_folder(path: String) -> Result<Vec<LibraryCard>, String> {
    let dir = PathBuf::from(path);
    if !dir.is_dir() {
        return Err("Der gekoppelte Ordner existiert nicht mehr.".into());
    }
    let mut cards = Vec::new();
    collect_cards(&dir, &mut cards);
    cards.sort_by(|left, right| right.modified.cmp(&left.modified));
    Ok(cards)
}

#[tauri::command]
fn read_character_file(path: String) -> Result<Vec<u8>, String> {
    let file = PathBuf::from(path);
    if !allowed_card_path(&file) {
        return Err("Nur vorhandene PNG- und JSON-Karten dürfen geöffnet werden.".into());
    }
    let meta = fs::metadata(&file).map_err(|error| error.to_string())?;
    if meta.len() > 64 * 1024 * 1024 {
        return Err("Die Karte ist größer als 64 MB.".into());
    }
    fs::read(file).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_character_file(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    let file = PathBuf::from(path);
    if !allowed_card_path(&file) {
        return Err("Die Zieldatei muss eine vorhandene PNG- oder JSON-Karte sein.".into());
    }
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Die Karte ist größer als 64 MB.".into());
    }
    make_backup(&app, &file)?;
    fs::write(file, bytes)
        .map_err(|error| format!("Karte konnte nicht gespeichert werden: {error}"))
}

#[tauri::command]
fn add_character_file(folder: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = fs::canonicalize(folder).map_err(|error| error.to_string())?;
    if !dir.is_dir() {
        return Err("Der gekoppelte Ordner existiert nicht.".into());
    }
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
    if safe.is_empty() || Path::new(&safe).components().count() != 1 {
        return Err("Ungültiger Dateiname.".into());
    }
    let target = dir.join(if safe.to_ascii_lowercase().ends_with(".png") {
        safe
    } else {
        format!("{safe}.png")
    });
    if target.exists() {
        return Err("Eine Karte mit diesem Dateinamen existiert bereits.".into());
    }
    fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn create_card_backup(app: tauri::AppHandle, path: String, label: String) -> Result<String, String> {
    let file = PathBuf::from(path);
    if !allowed_card_path(&file) {
        return Err("Nur vorhandene PNG- und JSON-Karten können gesichert werden.".into());
    }
    let id = copy_card_version(&app, &file, true)?;
    let dir = version_dir(&app, &file)?;
    set_version_label(&dir, &id, &label)?;
    Ok(id)
}

#[tauri::command]
fn remove_character_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let file = PathBuf::from(path);
    let recovery_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("removed-cards");
    archive_card(&file, &recovery_dir).map(|target| target.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_card_versions(app: tauri::AppHandle, path: String) -> Result<Vec<VersionInfo>, String> {
    let dir = version_dir(&app, Path::new(&path))?;
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
            })
        })
        .collect();
    items.sort_by_key(|version| std::cmp::Reverse(version.created));
    Ok(items)
}

#[tauri::command]
fn rename_card_version(
    app: tauri::AppHandle,
    path: String,
    id: String,
    label: String,
) -> Result<(), String> {
    let dir = version_dir(&app, Path::new(&path))?;
    set_version_label(&dir, &id, &label)
}

#[tauri::command]
fn restore_card_version(app: tauri::AppHandle, path: String, id: String) -> Result<(), String> {
    if Path::new(&id).components().count() != 1 {
        return Err("Ungültige Versions-ID.".into());
    }
    let target = PathBuf::from(&path);
    if !allowed_card_path(&target) {
        return Err("Zielkarte nicht gefunden.".into());
    }
    let source = version_dir(&app, &target)?.join(id);
    let bytes = fs::read(&source).map_err(|_| "Version nicht gefunden.".to_string())?;
    make_backup(&app, &target)?;
    fs::write(target, bytes).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(names, vec!["300.png", "400.png", "500.png", "manual-50.png"]);
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
        assert_eq!(read_version_labels(&dir)["manual-100.png"], "Vor großem Experiment");
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
        fs::write(&source, r#"{"spec":"chara_card_v3","data":{"name":"Safe"}}"#).unwrap();
        let archived = archive_card(&source, &recovery).unwrap();
        assert!(!source.exists());
        assert!(archived.exists());
        assert_eq!(fs::read_to_string(archived).unwrap(), r#"{"spec":"chara_card_v3","data":{"name":"Safe"}}"#);
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
        assert_eq!(
            approved_operation("private notes: hello"),
            "UNKNOWN_OPERATION"
        );
        assert_eq!(approved_error_kind("private notes: hello"), "UNKNOWN_ERROR");
    }
}
