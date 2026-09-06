use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct TagsResponse { models: Vec<Model> }
#[derive(Deserialize)]
struct Model { name: String }
#[derive(Serialize)]
struct ChatRequest<'a> { model: &'a str, stream: bool, messages: Vec<Message<'a>>, format: &'a str }
#[derive(Serialize)]
struct Message<'a> { role: &'a str, content: &'a str }
#[derive(Deserialize)]
struct ChatResponse { message: ChatMessage }
#[derive(Deserialize)]
struct ChatMessage { content: String }

fn safe_base_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(trimmed).map_err(|_| "Ungültige Ollama-Adresse.".to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if parsed.scheme() != "http" || !(host == "localhost" || host == "127.0.0.1" || host == "::1") {
        return Err("Aus Sicherheitsgründen sind nur lokale Ollama-Adressen per HTTP erlaubt.".into());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
async fn ollama_models(base_url: String) -> Result<Vec<String>, String> {
    let base = safe_base_url(&base_url)?;
    let result = reqwest::Client::new().get(format!("{base}/api/tags")).send().await.map_err(|e| format!("Ollama nicht erreichbar: {e}"))?;
    if !result.status().is_success() { return Err(format!("Ollama antwortet mit HTTP {}.", result.status())); }
    let tags: TagsResponse = result.json().await.map_err(|e| format!("Ungültige Ollama-Antwort: {e}"))?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
async fn ollama_chat(base_url: String, model: String, system: String, prompt: String) -> Result<String, String> {
    let base = safe_base_url(&base_url)?;
    if model.trim().is_empty() { return Err("Kein Modell ausgewählt.".into()); }
    let body = ChatRequest { model: &model, stream: false, format: "json", messages: vec![Message { role: "system", content: &system }, Message { role: "user", content: &prompt }] };
    let result = reqwest::Client::new().post(format!("{base}/api/chat")).json(&body).send().await.map_err(|e| format!("Ollama-Anfrage fehlgeschlagen: {e}"))?;
    if !result.status().is_success() { let status = result.status(); let text = result.text().await.unwrap_or_default(); return Err(format!("Ollama HTTP {status}: {text}")); }
    let chat: ChatResponse = result.json().await.map_err(|e| format!("Ungültige Ollama-Antwort: {e}"))?;
    Ok(chat.message.content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![ollama_models, ollama_chat]).run(tauri::generate_context!()).expect("error while running Silly EasyChar");
}
