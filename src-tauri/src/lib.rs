use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
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
            ollama_models,
            ollama_chat,
            choose_character_folder,
            scan_character_folder,
            read_character_file,
            save_character_file,
            add_character_file,
            list_card_versions,
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
        .collect();
    items.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
    for old in items.into_iter().skip(keep) {
        fs::remove_file(old.path()).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn make_backup(app: &tauri::AppHandle, card_path: &Path) -> Result<(), String> {
    if !card_path.exists() {
        return Ok(());
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
    fs::copy(card_path, dir.join(format!("{stamp}.{extension}")))
        .map_err(|error| format!("Version konnte nicht angelegt werden: {error}"))?;
    prune_versions(&dir, 3)?;
    Ok(())
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
fn list_card_versions(app: tauri::AppHandle, path: String) -> Result<Vec<VersionInfo>, String> {
    let dir = version_dir(&app, Path::new(&path))?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut items: Vec<_> = fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let created = name.split('.').next()?.parse::<u128>().ok()? as u64;
            Some(VersionInfo {
                id: name,
                created,
                size: meta.len(),
            })
        })
        .collect();
    items.sort_by_key(|version| std::cmp::Reverse(version.created));
    Ok(items)
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
        prune_versions(&dir, 3).unwrap();
        let mut names: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, vec!["300.png", "400.png", "500.png"]);
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
}
