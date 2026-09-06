import "./style.css";
import { emptyCard, localScore, normalizeCard, normalizeLoreEntry, normalizePlaceholders, prepareCardForExport, toV3Card } from "./card";
import { embedCard, extractCard, imageAsPng } from "./png";
import { models, runAi } from "./ai";
import { CardLibrary } from "./library";
import type { LibraryEntry } from "./library";
import type { AiResult, CharacterCard, CoreEditableField, EditableField, ScoreResult } from "./types";

const textFields: { key: CoreEditableField; label: string; rows: number; hint: string }[] = [
  { key: "name", label: "Name", rows: 1, hint: "Name der Figur" },
  { key: "description", label: "Beschreibung", rows: 9, hint: "Aussehen, Identität, Hintergrund, Fähigkeiten …" },
  { key: "personality", label: "Persönlichkeit", rows: 6, hint: "Eigenschaften, Ziele, Ängste, Verhalten …" },
  { key: "scenario", label: "Szenario", rows: 6, hint: "Ausgangslage, Ort und Konflikt …" },
  { key: "first_mes", label: "Erste Nachricht", rows: 9, hint: "Starker Einstieg: Ort, Handlung, Gesprächsanlass …" },
  { key: "mes_example", label: "Dialogbeispiele", rows: 9, hint: "<START>\n{{user}}: …\n{{char}}: …" },
  { key: "creator_notes", label: "Creator Notes", rows: 4, hint: "Hinweise für Nutzer der Karte …" },
  { key: "system_prompt", label: "System Prompt", rows: 4, hint: "Optional: übergeordnete Rollenspielregeln …" },
  { key: "post_history_instructions", label: "Post-History Instructions", rows: 4, hint: "Optional: spät injizierte Anweisungen …" }
];

let card = loadDraft();
let imageBuffer: ArrayBuffer | null = null;
let imageUrl = "";
let activeField: CoreEditableField = "description";
let selected = new Set<EditableField>(["description", "personality", "scenario", "first_mes"]);
let score: ScoreResult = localScore(card);
let aiBusy = false;
let statusTimer = 0;
let linkedPath: string | null = null;
let linkedFormat: "PNG" | "JSON" | null = null;
let wizardStep = 0;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><div class="brand-mark">S</div><div><strong>Silly EasyChar</strong><small>Offline Character Studio</small></div><button id="repoLink" class="brand-watermark" title="Silly EasyChar auf GitHub öffnen">mccrypt1</button><span id="buildInfo" class="build-info">v… · …</span></div>
    <div class="top-actions">
      <button id="newBtn" class="ghost">＋ Neu</button><button id="importBtn" class="ghost">↥ Import</button>
      <button id="saveLinkedBtn" class="primary hidden">In SillyTavern speichern</button><button id="addFolderBtn" class="ghost hidden">Zum ST-Ordner</button>
      <button id="versionsBtn" class="ghost hidden">Versionen</button><button id="jsonBtn" class="ghost">JSON exportieren</button>
      <button id="pngBtn" class="primary">PNG exportieren</button>
    </div>
  </header>
  <main class="workspace">
    <aside class="left-panel">
      <section class="portrait-card">
      <section class="library-card" id="libraryHost"></section>
        <div id="portrait" class="portrait"><span>Bild hinzufügen</span></div>
        <input id="imageInput" type="file" accept="image/*" hidden />
        <button id="imageBtn" class="wide ghost">Portrait wählen</button>
        <p>Keine Bildbearbeitung. Das Originalbild wird als Character-Card-PNG verpackt.</p>
      </section>
      <section class="settings-card">
        <div class="section-title">OLLAMA</div>
        <label>Adresse<input id="ollamaUrl" value="${escapeAttr(localStorage.getItem("ollamaUrl") || "http://127.0.0.1:11434")}" /></label>
        <label>Modell<div class="inline"><select id="model"><option value="">Modelle laden …</option></select><button id="refreshModels" title="Modelle neu laden">↻</button></div></label>
        <label>Ausgabesprache<select id="language"><option>Deutsch</option><option>English</option><option>Spanish</option><option>French</option><option>Italian</option></select></label>
        <label class="toggle-row"><span><b>NSFW-Modus</b><small>Explizite Inhalte erwachsener Figuren erhalten</small></span><input id="nsfw" type="checkbox" /><i></i></label>
      </section>
      <section class="score-card" id="scoreCard"></section>
    </aside>
    <section class="editor-panel">
      <nav class="tabs"><button data-tab="fields" class="active">Charakter</button><button data-tab="wizard">Wizard</button><button data-tab="extras">Extras</button><button data-tab="lore">Lorebook</button><span id="saveState">Lokal gespeichert</span></nav>
      <div id="tab-fields" class="tab-page active"><div id="fields" class="fields"></div>
        <section class="field greeting-editor" style="max-width:900px;margin:0 auto 13px"><div class="field-head"><label>Alternative Begrüßungen</label><button id="addGreeting" class="mini">＋ Begrüßung hinzufügen</button></div><p class="muted">Zusätzliche Einstiege, die in SillyTavern neben der ersten Nachricht auswählbar sind.</p><div id="greetings"></div></section>
      </div>
      <div id="tab-extras" class="tab-page"><div class="extras-grid">
        <label>Tags (durch Komma getrennt)<input id="tags" /></label><label>Creator<input id="creator" /></label><label>Version<input id="version" /></label>
      </div></div>
      <div id="tab-lore" class="tab-page"><div class="lore-head"><div><h2>Character Lorebook</h2><p>Schlüsselwortgesteuerte Details für Orte, Figuren, Regeln und Gegenstände.</p></div><button id="addLore" class="ghost">＋ Eintrag</button></div><div id="loreEntries"></div></div>
    </section>
    <aside class="ai-panel">
      <div id="tab-wizard" class="tab-page">
        <div class="wizard">
          <div class="wizard-progress"><span id="wizardCount"></span><i><b id="wizardBar"></b></i></div>
          <div class="wizard-card">
            <small>SCHRITT-FÜR-SCHRITT-CARD</small><h2 id="wizardTitle"></h2><p id="wizardHelp"></p>
            <label>Deine Stichpunkte, Ideen oder ein fertiger Text</label>
            <textarea id="wizardNotes" rows="9"></textarea>
            <div class="wizard-preview"><span>Aktueller Feldinhalt</span><p id="wizardCurrent"></p></div>
            <div class="wizard-actions"><button id="wizardBack" class="ghost">← Zurück</button><button id="wizardUse" class="ghost">Notizen übernehmen</button><button id="wizardAi" class="primary">✦ Mit Ollama ausarbeiten</button><button id="wizardNext" class="ghost">Weiter →</button></div>
            <div id="wizardThinking" class="hidden"></div>
          </div>
          <div class="wizard-done hidden" id="wizardDone"><span>✓</span><h2>Grundkarte vollständig</h2><p>Alle Inhalte wurden in die passenden Character-Card-Felder übernommen. Du kannst sie nun im normalen Editor verfeinern.</p><button id="wizardFinish" class="primary">Zum Character Editor</button></div>
        </div>
      </div>
      <div class="ai-head"><div class="ai-avatar">✦</div><div><strong>Lokaler Schreibassistent</strong><small>Ollama · Daten bleiben auf deinem PC</small></div></div>
      <div class="quick-actions"><button data-ai="suggest">Ideen</button><button data-ai="grade">Bewerten</button><button data-ai="translate">Übersetzen</button><button data-ai="lorebook">Lorebook</button></div>
      <div class="selection"><div class="field-head"><b>Felder für Bearbeitung</b><button id="allFields" class="link">alle</button></div><div id="fieldChecks"></div></div>
      <label class="instruction-label">Was soll geändert werden?</label>
      <textarea id="instruction" rows="8" placeholder="z. B. Informationen auf passende Felder verteilen, auf Deutsch übersetzen und die Stimme natürlicher machen …"></textarea>
      <button id="editAi" class="primary wide">✦ Ausgewählte Felder bearbeiten</button>
      <div id="aiOutput" class="ai-output"><div class="empty-state"><span>✦</span><p>Wähle Felder und beschreibe deine Änderung – oder nutze eine Schnellaktion.</p></div></div>
    </aside>
  </main>
  <div id="versionModal" class="modal hidden"><div class="modal-card"><div class="field-head"><h3>Letzte Kartenversionen</h3><button id="closeVersions">×</button></div><p>Vor jedem Speichern wird automatisch eine Version angelegt. Maximal drei werden behalten.</p><div id="versionList"></div></div></div>
  <div id="reviewModal" class="modal review-modal hidden"><div class="review-card"><div class="field-head"><h3>Änderungen prüfen</h3><button id="closeReview">×</button></div><div class="review-request"><span>DEINE ANWEISUNG</span><p id="reviewRequest"></p></div><div class="review-actions"><button id="acceptAllReview" class="primary">✓ Alle übernehmen</button><button id="rejectReview" class="ghost">✕ Alle ablehnen</button></div><div id="reviewFields"></div><div class="review-footer"><button id="applyReview" class="primary">Ausgewählte Änderungen übernehmen</button></div></div></div>
  <div id="toast"></div><input id="fileInput" type="file" accept=".json,.png,application/json,image/png" hidden />`;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
function escapeAttr(v: string) { return v.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }
function escapeHtml(v: string) { return escapeAttr(v).replace(/'/g, "&#39;"); }
function loadDraft(): CharacterCard { try { return normalizeCard(JSON.parse(localStorage.getItem("draft") || "null")); } catch { return emptyCard(); } }
function saveDraft() { localStorage.setItem("draft", JSON.stringify(card)); $("#saveState").textContent = "Lokal gespeichert"; }
function changed() { $("#saveState").textContent = "Speichert …"; score = localScore(card); renderScore(); window.clearTimeout(statusTimer); statusTimer = window.setTimeout(saveDraft, 350); }

function renderFields() {
  $("#fields").innerHTML = textFields.map(f => `<article class="field ${activeField === f.key ? "focused" : ""}" data-key="${f.key}"><div class="field-head"><label>${f.label}</label><span>${card.data[f.key].length} Zeichen</span></div>${f.rows === 1 ? `<input data-field="${f.key}" value="${escapeAttr(card.data[f.key])}" placeholder="${escapeAttr(f.hint)}" />` : `<textarea data-field="${f.key}" rows="${f.rows}" placeholder="${escapeAttr(f.hint)}">${escapeHtml(card.data[f.key])}</textarea>`}</article>`).join("");
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field]").forEach(el => {
    el.addEventListener("focus", () => { activeField = el.dataset.field as CoreEditableField; document.querySelectorAll(".field").forEach(n => n.classList.toggle("focused", (n as HTMLElement).dataset.key === activeField)); });
    el.addEventListener("input", () => { card.data[el.dataset.field as CoreEditableField] = el.value; el.closest(".field")!.querySelector("span")!.textContent = `${el.value.length} Zeichen`; changed(); });
    el.addEventListener("change", () => { const value = normalizePlaceholders(el.value); if (value !== el.value) { el.value = value; card.data[el.dataset.field as CoreEditableField] = value; changed(); } });
  });
}
function greetingField(index: number): EditableField { return `alternate_greeting:${index}`; }
function renderChecks() {
  const core = textFields.slice(0, 6).map(f => `<label class="check"><input type="checkbox" data-check="${f.key}" ${selected.has(f.key) ? "checked" : ""}/><span>${f.label}</span></label>`).join("");
  const greetings = card.data.alternate_greetings.map((_, index) => { const key = greetingField(index); return `<label class="check"><input type="checkbox" data-check="${key}" ${selected.has(key) ? "checked" : ""}/><span>Alternative Begrüßung ${index + 1}</span></label>`; }).join("");
  $("#fieldChecks").innerHTML = core + greetings;
  document.querySelectorAll<HTMLInputElement>("[data-check]").forEach(c => c.onchange = () => { const k = c.dataset.check as EditableField; c.checked ? selected.add(k) : selected.delete(k); });
}
function removeGreeting(index: number) {
  const next = new Set<EditableField>();
  for (const key of selected) {
    if (!key.startsWith("alternate_greeting:")) next.add(key);
    else { const oldIndex = Number(key.split(":")[1]); if (oldIndex < index) next.add(key); else if (oldIndex > index) next.add(greetingField(oldIndex - 1)); }
  }
  selected = next;
  card.data.alternate_greetings.splice(index, 1);
  renderExtras(); renderChecks(); changed();
}
function renderExtras() {
  ($("#tags") as HTMLInputElement).value = card.data.tags.join(", "); ($("#creator") as HTMLInputElement).value = card.data.creator; ($("#version") as HTMLInputElement).value = card.data.character_version;
  $("#greetings").innerHTML = card.data.alternate_greetings.map((g, i) => `<div class="repeat"><textarea rows="5" data-greeting="${i}" placeholder="Alternative Begrüßung ${i + 1}">${escapeHtml(g)}</textarea><button data-remove-greeting="${i}">×</button></div>`).join("") || `<p class="muted">Noch keine alternativen Begrüßungen.</p>`;
  document.querySelectorAll<HTMLTextAreaElement>("[data-greeting]").forEach(el => {
    el.oninput = () => { card.data.alternate_greetings[Number(el.dataset.greeting)] = el.value; changed(); };
    el.onchange = () => { const index = Number(el.dataset.greeting); const value = normalizePlaceholders(el.value); if (value !== el.value) { el.value = value; card.data.alternate_greetings[index] = value; changed(); } };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-greeting]").forEach(el => el.onclick = () => removeGreeting(Number(el.dataset.removeGreeting)));
}
function renderLore() {
  const entries = card.data.character_book?.entries ?? [];
  $("#loreEntries").innerHTML = entries.map((e, i) => `<article class="lore-entry"><div class="field-head"><b>${escapeHtml(e.comment || `Eintrag ${i + 1}`)}</b><button data-remove-lore="${i}" class="danger-link">Entfernen</button></div><div class="lore-grid"><label>Titel<input data-lore="comment" data-i="${i}" value="${escapeAttr(e.comment)}" /></label><label>Schlüsselwörter<input data-lore="key" data-i="${i}" value="${escapeAttr(e.key.join(", "))}" /></label><label class="full">Inhalt<textarea rows="5" data-lore="content" data-i="${i}">${escapeHtml(e.content)}</textarea></label><label>Position<select data-lore="position" data-i="${i}">${[0,1,2,3,4].map(n => `<option ${e.position===n?"selected":""}>${n}</option>`).join("")}</select></label><label>Priorität<input type="number" data-lore="order" data-i="${i}" value="${e.order}" /></label><label class="check"><input type="checkbox" data-lore="constant" data-i="${i}" ${e.constant?"checked":""}/><span>Immer aktiv</span></label><label class="check"><input type="checkbox" data-lore="preventRecursion" data-i="${i}" ${e.preventRecursion?"checked":""}/><span>Rekursion stoppen</span></label></div></article>`).join("") || `<div class="empty-lore"><span>⌁</span><h3>Noch kein Lorebook</h3><p>Füge Einträge manuell hinzu oder lasse Ollama passende Einträge erzeugen.</p></div>`;
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-lore]").forEach(el => el.oninput = () => { const e = entries[Number(el.dataset.i)]; const key = el.dataset.lore!; if (key === "key") e.key = el.value.split(",").map(x=>x.trim()).filter(Boolean); else if (key === "constant" || key === "preventRecursion") (e as any)[key] = (el as HTMLInputElement).checked; else if (key === "position" || key === "order") (e as any)[key] = Number(el.value); else (e as any)[key] = el.value; changed(); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-lore]").forEach(b => b.onclick = () => { entries.splice(Number(b.dataset.removeLore), 1); entries.forEach((e,i)=>e.uid=i); renderLore(); changed(); });
}
function renderScore(s = score) {
  $("#scoreCard").innerHTML = `<div class="score-top"><div><span>KARTEN-SCORE</span><strong>${s.total}</strong><small>/ 100</small></div><button id="rescore">Lokal prüfen</button></div><div class="score-bars">${[["Struktur",s.structure],["Kohärenz",s.coherence],["Rollenspiel",s.roleplay],["Kreativität",s.creativity],["Politur",s.polish]].map(([n,v])=>`<label><span>${n}</span><i><b style="width:${Number(v)*5}%"></b></i><em>${v}/20</em></label>`).join("")}</div>${s.findings.length ? `<ul>${s.findings.slice(0,3).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p class="good">Keine offensichtlichen lokalen Probleme.</p>`}`;
  $("#rescore").onclick = () => { score = localScore(card); renderScore(); };
}
function renderPortrait() { const p=$("#portrait"); p.innerHTML = imageUrl ? `<img src="${imageUrl}" alt="Character portrait" />` : `<div class="placeholder-letter">${escapeHtml(card.data.name[0] || "?")}</div><span>Bild hinzufügen</span>`; }
function renderAll() { renderFields(); renderChecks(); renderExtras(); renderLore(); renderScore(); renderPortrait(); }

function toast(message: string, bad=false) { const t=$("#toast"); t.textContent=message; t.className=bad?"show bad":"show"; setTimeout(()=>t.className="",3000); }

function fieldValue(key: EditableField): string {
  if (key.startsWith("alternate_greeting:")) return card.data.alternate_greetings[Number(key.split(":")[1])] ?? "";
  return card.data[key as CoreEditableField];
}
function fieldTitle(key: EditableField): string {
  if (key.startsWith("alternate_greeting:")) return "Alternative Begrüßung " + (Number(key.split(":")[1]) + 1);
  return textFields.find(field => field.key === key)?.label ?? key;
}
function startThinking(host: HTMLElement, label: string, hideWhenDone = false) {
  const started = Date.now();
  let detail = label;
  let stopped = false;
  host.classList.remove("hidden");
  const render = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    host.innerHTML = `<div class="thinking"><i></i><p>${escapeHtml(detail)} <strong>${seconds} s</strong></p></div>`;
  };
  render();
  const interval = window.setInterval(render, 250);
  return {
    update(value: string) { detail = value; render(); },
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(interval);
      host.innerHTML = "";
      if (hideWhenDone) host.classList.add("hidden");
    }
  };
}
async function reviewFieldChanges(fields: AiResult["fields"], request: string): Promise<AiResult["fields"] | null> {
  const entries = Object.entries(fields ?? {}).filter((entry): entry is [EditableField, string] => typeof entry[1] === "string");
  if (!entries.length) return fields;
  const modal = $("#reviewModal");
  $("#reviewRequest").textContent = request || "Allgemeine Verbesserung der ausgewählten Felder";
  $("#reviewFields").innerHTML = entries.map(([key, after]) => `
    <article class="review-field">
      <div class="review-field-title"><label><input type="checkbox" data-review-check="${escapeAttr(key)}" checked /> ${escapeHtml(fieldTitle(key))}</label><span>✎ Geändert</span></div>
      <div class="review-columns">
        <label><small>VORHER</small><textarea readonly>${escapeHtml(fieldValue(key))}</textarea></label>
        <b>→</b>
        <label><small>NACHHER · BEARBEITBAR</small><textarea data-review-after="${escapeAttr(key)}">${escapeHtml(after)}</textarea></label>
      </div>
    </article>`).join("");
  modal.classList.remove("hidden");
  return new Promise(resolve => {
    const finish = (value: AiResult["fields"] | null) => { modal.classList.add("hidden"); resolve(value); };
    const collect = (all: boolean) => {
      const accepted: AiResult["fields"] = {};
      for (const [key] of entries) {
        const checkbox = document.querySelector<HTMLInputElement>(`[data-review-check="${key}"]`);
        if (all || checkbox?.checked) accepted[key] = document.querySelector<HTMLTextAreaElement>(`[data-review-after="${key}"]`)?.value ?? "";
      }
      return accepted;
    };
    $("#acceptAllReview").onclick = () => finish(collect(true));
    $("#applyReview").onclick = () => finish(collect(false));
    $("#rejectReview").onclick = () => finish(null);
    $("#closeReview").onclick = () => finish(null);
    modal.onclick = event => { if (event.target === modal) finish(null); };
  });
}
async function download(blob: Blob, name: string): Promise<boolean> {
  const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
  if (window.__TAURI__) {
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const saved = await window.__TAURI__.core.invoke<string | null>("export_character_file", { fileName: safeName, bytes });
    return saved !== null;
  }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=safeName; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  return true;
}
async function loadBuildInfo() {
  try {
    const info = await window.__TAURI__?.core.invoke<{ version: string; commit: string }>("build_info");
    if (info) $("#buildInfo").textContent = `v${info.version} · ${info.commit}`;
  } catch { $("#buildInfo").textContent = "v0.2.4 · development"; }
}
async function importFile(file: File) {
  if (file.name.toLowerCase().endsWith(".json")) { card=normalizeCard(JSON.parse(await file.text())); imageBuffer=null; if(imageUrl)URL.revokeObjectURL(imageUrl); imageUrl=""; }
  else { const buffer=await file.arrayBuffer(); const found=extractCard(buffer); if (!found) throw new Error("Dieses PNG enthält keine Character-Card-Metadaten."); card=found; imageBuffer=buffer; if(imageUrl)URL.revokeObjectURL(imageUrl); imageUrl=URL.createObjectURL(file); }
  score=localScore(card); renderAll(); saveDraft(); toast(`${card.data.name} importiert.`);
}
async function ai(action: "edit"|"translate"|"suggest"|"grade"|"lorebook") {
  if(aiBusy)return;
  aiBusy=true;
  document.body.classList.add("busy");
  const timer = startThinking($("#aiOutput"), "Ollama arbeitet lokal …");
  const baseUrl = ($("#ollamaUrl") as HTMLInputElement).value;
  const model = ($("#model") as HTMLSelectElement).value;
  const instruction = ($("#instruction") as HTMLTextAreaElement).value;
  const language = ($("#language") as HTMLSelectElement).value;
  const nsfw = ($("#nsfw") as HTMLInputElement).checked;
  const selectedFields = [...selected];
  try {
    let result: AiResult;
    if (action === "edit" || action === "translate") {
      if (!selectedFields.length) throw new Error("Bitte mindestens ein Feld auswählen.");
      const combinedFields: NonNullable<AiResult["fields"]> = {};
      const explanations: string[] = [];
      for (let index = 0; index < selectedFields.length; index++) {
        const field = selectedFields[index];
        timer.update(`Ollama bearbeitet ${fieldTitle(field)} · ${index + 1}/${selectedFields.length} …`);
        const partial = await runAi({ baseUrl, model, action, card, selected: [field], instruction, language, nsfw });
        Object.assign(combinedFields, partial.fields);
        if (partial.explanation) explanations.push(partial.explanation);
      }
      result = { fields: combinedFields, explanation: explanations.join("\n") };
    } else {
      result = await runAi({ baseUrl, model, action, card, selected: selectedFields, instruction, language, nsfw });
    }
    timer.stop();
    if ((action === "edit" || action === "translate") && result.fields) {
      const reviewRequest = action === "translate" ? `Übersetzen nach ${language}` : instruction;
      const reviewed = await reviewFieldChanges(result.fields, reviewRequest);
      if (!reviewed) {
        $("#aiOutput").innerHTML = `<div class="result"><b>Änderungen verworfen</b><p>Die Karte wurde nicht verändert.</p></div>`;
        return;
      }
      result.fields = reviewed;
    }
    applyAiResult(result, action);
  } catch(e){
    timer.stop();
    $("#aiOutput").innerHTML=`<div class="error"><b>Ollama-Fehler</b><p>${escapeHtml(e instanceof Error?e.message:String(e))}</p><small>Läuft Ollama und ist ein Modell installiert?</small></div>`;
    toast("KI-Aktion fehlgeschlagen.",true);
  } finally {
    timer.stop();
    aiBusy=false;
    document.body.classList.remove("busy");
  }
}
function applyAiResult(r: AiResult, action: string) {
  if(r.fields){
    for(const [key,value] of Object.entries(r.fields)){
      if(typeof value!=="string" || !selected.has(key as EditableField)) continue;
      if(key.startsWith("alternate_greeting:")){
        const index=Number(key.split(":")[1]);
        if(Number.isInteger(index) && index>=0 && index<card.data.alternate_greetings.length) card.data.alternate_greetings[index]=value;
      } else {
        card.data[key as CoreEditableField]=value;
      }
    }
    renderFields(); renderExtras(); renderChecks(); changed();
  }
  if(r.score){ score=r.score; renderScore(r.score); }
  if(action==="grade" && r.score?.findings.length){
    const instruction = $("#instruction") as HTMLTextAreaElement;
    instruction.value = r.score.findings.map((finding, index) => `${index + 1}. ${finding}`).join("\n");
    instruction.focus();
    toast("Verbesserungsvorschläge wurden ins Bearbeitungsfeld übernommen.");
  }
  if(r.lorebook?.entries){ const list=Object.entries(r.lorebook.entries).sort(([a],[b])=>Number(a)-Number(b)).map(([,e],i)=>normalizeLoreEntry(e,i)); card.data.character_book={name:`${card.data.name} Lorebook`,description:"Mit Silly EasyChar und Ollama erstellt",entries:list}; renderLore(); changed(); }
  const items=r.suggestions?.map(x=>`<li>${escapeHtml(x)}</li>`).join("")||"";
  $("#aiOutput").innerHTML=`<div class="result"><b>✓ ${action==="grade"?"Bewertung abgeschlossen":"Ergebnis übernommen"}</b>${r.explanation?`<p>${escapeHtml(r.explanation)}</p>`:""}${items?`<ol>${items}</ol>`:""}${r.score?`<p class="big-result">${r.score.total}<small>/100</small></p>`:""}${r.lorebook?`<p>${Object.keys(r.lorebook.entries).length} Lorebook-Einträge erstellt.</p>`:""}</div>`;
}

$("#newBtn").onclick=()=>{if(!confirm("Aktuelle Karte durch eine neue ersetzen? Der letzte Stand bleibt nur im lokalen Entwurf."))return; card=emptyCard(); imageBuffer=null;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl="";linkedPath=null;linkedFormat=null;wizardStep=0;score=localScore(card);renderAll();syncLinkedButtons();changed();};
$("#importBtn").onclick=()=>$("#fileInput").click(); $("#fileInput").onchange=async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)try{linkedPath=null;linkedFormat=null;await importFile(f);syncLinkedButtons();}catch(err){toast(err instanceof Error?err.message:String(err),true);}};
$("#imageBtn").onclick=()=>$("#imageInput").click(); $("#portrait").onclick=()=>$("#imageInput").click(); $("#imageInput").onchange=async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;imageBuffer=await imageAsPng(f);if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(new Blob([imageBuffer],{type:"image/png"}));renderPortrait();toast("Portrait übernommen.");};
$("#jsonBtn").onclick=async()=>{
  try {
    const output=toV3Card(prepareCardForExport(card));
    const saved=await download(new Blob([JSON.stringify(output,null,2)],{type:"application/json"}),`${card.data.name||"character"}.json`);
    if(saved) toast("Character-Card-JSON gespeichert.");
  } catch(error) { toast(error instanceof Error ? error.message : String(error), true); }
};
$("#pngBtn").onclick=async()=>{
  if(!imageBuffer){toast("Bitte zuerst ein Portrait wählen.",true);return;}
  try {
    const output=prepareCardForExport(card);
    const saved=await download(embedCard(imageBuffer,output),`${card.data.name||"character"}.png`);
    if(saved) toast("Character-Card-PNG gespeichert.");
  } catch(error) { toast(error instanceof Error ? error.message : String(error), true); }
};
$("#refreshModels").onclick=async()=>{const url=($(`#ollamaUrl`) as HTMLInputElement).value;localStorage.setItem("ollamaUrl",url);const sel=$(`#model`) as HTMLSelectElement;sel.innerHTML=`<option>Lädt …</option>`;try{const list=await models(url);sel.innerHTML=list.map(m=>`<option>${escapeHtml(m)}</option>`).join("")||`<option value="">Keine Modelle gefunden</option>`;const last=localStorage.getItem("model");if(last&&list.includes(last))sel.value=last;toast(`${list.length} Ollama-Modelle gefunden.`);}catch(e){sel.innerHTML=`<option value="">Ollama nicht erreichbar</option>`;toast(e instanceof Error?e.message:String(e),true);}};
$("#model").onchange=e=>localStorage.setItem("model",(e.target as HTMLSelectElement).value); $("#allFields").onclick=()=>{selected=new Set<EditableField>([...textFields.slice(0,6).map(x=>x.key),...card.data.alternate_greetings.map((_,index)=>greetingField(index))]);renderChecks();};
$("#editAi").onclick=()=>ai("edit"); document.querySelectorAll<HTMLButtonElement>("[data-ai]").forEach(b=>b.onclick=()=>ai(b.dataset.ai as any));
$("#addGreeting").onclick=()=>{const index=card.data.alternate_greetings.push("")-1;selected.add(greetingField(index));renderExtras();renderChecks();changed();};
$("#addLore").onclick=()=>{if(!card.data.character_book)card.data.character_book={name:`${card.data.name} Lorebook`,entries:[]};const i=card.data.character_book.entries.length;card.data.character_book.entries.push(normalizeLoreEntry({},i));renderLore();changed();};
[$("#tags"),$("#creator"),$("#version")].forEach(el=>el.addEventListener("input",()=>{card.data.tags=($(`#tags`) as HTMLInputElement).value.split(",").map(x=>x.trim()).filter(Boolean);card.data.creator=($(`#creator`) as HTMLInputElement).value;card.data.character_version=($(`#version`) as HTMLInputElement).value;changed();}));
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(b=>b.onclick=()=>selectTab(b.dataset.tab!));
window.addEventListener("dragover",e=>e.preventDefault());window.addEventListener("drop",async e=>{e.preventDefault();const f=e.dataTransfer?.files[0];if(f)try{await importFile(f);}catch(err){toast(err instanceof Error?err.message:String(err),true);}});
renderAll(); setTimeout(()=>$("#refreshModels").click(),150);

const wizardSteps: { field: CoreEditableField; title: string; help: string; instruction: string }[] = [
  { field: "name", title: "Name und Identität", help: "Trage einen Namen, einen Arbeitstitel oder nur eine Namensidee ein.", instruction: "Entwickle einen passenden, einprägsamen Charakternamen aus den Notizen. Gib ausschließlich den Namen im Namensfeld zurück." },
  { field: "description", title: "Konzept, Aussehen und Hintergrund", help: "Stichpunkte reichen: Rolle, Alter, Erscheinung, Herkunft, Fähigkeiten, Eigenheiten oder lose Ideen.", instruction: "Erstelle eine klar strukturierte Character-Card-Beschreibung aus den Notizen. Behalte Persönlichkeit, Szenario und Rollenspielregeln aus diesem Feld heraus." },
  { field: "personality", title: "Persönlichkeit und Motivation", help: "Wie denkt und fühlt die Figur? Ziele, Ängste, Widersprüche, Grenzen und typische Reaktionen.", instruction: "Entwickle aus den Notizen eine nuancierte, spielbare Persönlichkeit mit Motivationen, Schwächen und konsistentem Verhalten." },
  { field: "scenario", title: "Szenario und Ausgangslage", help: "Wo beginnt das Rollenspiel, was ist gerade passiert und warum interagieren {{char}} und {{user}}?", instruction: "Forme die Notizen zu einem offenen Rollenspielszenario. Lege {{user}} keine Handlungen, Gefühle oder Identität fest." },
  { field: "first_mes", title: "Erste Nachricht", help: "Skizziere Atmosphäre, Handlung oder einen Gesprächsaufhänger. Ein einzelner Satz oder eine Idee genügt.", instruction: "Schreibe einen fesselnden ersten Beitrag mit Atmosphäre, sichtbarer Handlung und Gesprächsanlass. Sprich niemals für {{user}}." },
  { field: "mes_example", title: "Dialogbeispiele", help: "Nenne gewünschte Stimme, Redewendungen oder Situationen. Ollama erzeugt daraus abwechslungsreiche Beispiele.", instruction: "Erstelle 3 bis 5 kontrastreiche Dialogwechsel im SillyTavern-Format mit <START>, {{user}}: und {{char}}:. Zeige Stimme und emotionale Bandbreite." },
  { field: "system_prompt", title: "Rollenspielregeln", help: "Optional: Regeln zu Perspektive, Initiative, Erzählstil, Grenzen und Verhalten.", instruction: "Formuliere kurze, robuste Rollenspielregeln. Bewahre Charaktertreue und verbiete das Sprechen oder Entscheiden für {{user}}." }
];
const wizardDrafts: Partial<Record<CoreEditableField, string>> = {};

async function openLibraryCard(bytes: Uint8Array, entry: LibraryEntry) {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  if (entry.format === "PNG") {
    const parsed = extractCard(buffer);
    if (!parsed) throw new Error("Die PNG-Datei enthält keine lesbare Character Card.");
    card = parsed;
    imageBuffer = buffer;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(new Blob([buffer], { type: "image/png" }));
  } else {
    card = normalizeCard(JSON.parse(new TextDecoder().decode(bytes)));
    imageBuffer = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
  }
  linkedPath = entry.path;
  linkedFormat = entry.format;
  score = localScore(card);
  renderAll();
  syncLinkedButtons();
  saveDraft();
  toast(card.data.name + " aus SillyTavern geöffnet.");
}

async function currentBytes(format: "PNG" | "JSON"): Promise<Uint8Array> {
  const output = prepareCardForExport(card);
  if (format === "JSON") return new TextEncoder().encode(JSON.stringify(toV3Card(output), null, 2));
  if (!imageBuffer) throw new Error("Für eine PNG-Karte wird ein Portrait benötigt.");
  return new Uint8Array(await embedCard(imageBuffer, output).arrayBuffer());
}

function syncLinkedButtons() {
  $("#saveLinkedBtn").classList.toggle("hidden", !linkedPath);
  $("#versionsBtn").classList.toggle("hidden", !linkedPath);
  $("#addFolderBtn").classList.toggle("hidden", !!linkedPath || !library.folder);
  $("#saveState").textContent = linkedPath ? "Mit ST verknüpft" : "Lokal gespeichert";
}

async function saveLinkedCard() {
  if (!linkedPath || !linkedFormat) return;
  try {
    await library.save(linkedPath, await currentBytes(linkedFormat));
    toast("In SillyTavern gespeichert · vorherige Version gesichert.");
  } catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
}

async function addCurrentToFolder() {
  try {
    const bytes = await currentBytes("PNG");
    linkedPath = await library.add(card.data.name || "character", bytes);
    linkedFormat = "PNG";
    syncLinkedButtons();
    toast("Karte zum gekoppelten SillyTavern-Ordner hinzugefügt.");
  } catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
}

async function showVersions() {
  if (!linkedPath) return;
  try {
    const versions = await library.versions(linkedPath);
    $("#versionList").innerHTML = versions.map(version => {
      const date = new Date(version.created).toLocaleString();
      const size = Math.max(1, Math.round(version.size / 1024));
      return '<div class="version-item"><span><b>' + escapeHtml(date) + '</b><small>' + size + ' KB</small></span><button class="ghost" data-restore="' + escapeAttr(version.id) + '">Wiederherstellen</button></div>';
    }).join("") || '<p class="muted">Noch keine frühere Version vorhanden. Sie entsteht beim ersten Speichern.</p>';
    $("#versionModal").classList.remove("hidden");
    document.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach(button => button.onclick = async () => {
      if (!linkedPath || !confirm("Diese Version wiederherstellen? Der aktuelle Stand wird vorher ebenfalls gesichert.")) return;
      await library.restore(linkedPath, button.dataset.restore!);
      $("#versionModal").classList.add("hidden");
      toast("Version wiederhergestellt.");
    });
  } catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
}

function renderWizard() {
  const done = wizardStep >= wizardSteps.length;
  $(".wizard-card").classList.toggle("hidden", done);
  $("#wizardDone").classList.toggle("hidden", !done);
  if (done) return;
  const step = wizardSteps[wizardStep];
  $("#wizardCount").textContent = "Schritt " + (wizardStep + 1) + " von " + wizardSteps.length;
  ($("#wizardBar") as HTMLElement).style.width = ((wizardStep + 1) / wizardSteps.length * 100) + "%";
  $("#wizardTitle").textContent = step.title;
  $("#wizardHelp").textContent = step.help;
  ($("#wizardNotes") as HTMLTextAreaElement).value = wizardDrafts[step.field] ?? "";
  $("#wizardCurrent").textContent = card.data[step.field] || "Noch leer";
  ($("#wizardBack") as HTMLButtonElement).disabled = wizardStep === 0;
  $("#wizardNext").textContent = wizardStep === wizardSteps.length - 1 ? "Abschließen →" : "Weiter →";
}

function useWizardNotes() {
  const step = wizardSteps[wizardStep];
  const notes = ($("#wizardNotes") as HTMLTextAreaElement).value.trim();
  wizardDrafts[step.field] = notes;
  if (notes) card.data[step.field] = notes;
  renderAll();
  renderWizard();
  changed();
  toast("Notizen in " + step.title + " übernommen.");
}

async function expandWizardStep() {
  const step = wizardSteps[wizardStep];
  const notes = ($("#wizardNotes") as HTMLTextAreaElement).value.trim();
  wizardDrafts[step.field] = notes;
  const temp = structuredClone(card);
  if (notes) temp.data[step.field] = notes;
  const instruction = step.instruction + (notes ? " Verwende diese Nutzernotizen als verbindliche Grundlage: " + notes : "");
  ($("#wizardAi") as HTMLButtonElement).disabled = true;
  const timer = startThinking($("#wizardThinking"), "Ollama arbeitet an " + step.title + " …", true);
  try {
    const result = await runAi({
      baseUrl: ($("#ollamaUrl") as HTMLInputElement).value,
      model: ($("#model") as HTMLSelectElement).value,
      action: "edit",
      card: temp,
      selected: [step.field],
      instruction,
      language: ($("#language") as HTMLSelectElement).value,
      nsfw: ($("#nsfw") as HTMLInputElement).checked
    });
    const value = result.fields?.[step.field];
    if (!value) throw new Error("Ollama hat für dieses Feld keinen Text zurückgegeben.");
    timer.stop();
    const reviewed = await reviewFieldChanges({ [step.field]: value }, instruction);
    const approved = reviewed?.[step.field];
    if (typeof approved !== "string") {
      toast("Änderung verworfen; das Feld blieb unverändert.");
      return;
    }
    card.data[step.field] = approved;
    renderAll();
    renderWizard();
    changed();
    toast(step.title + " wurde übernommen.");
  } catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
  finally {
    timer.stop();
    ($("#wizardAi") as HTMLButtonElement).disabled = false;
  }
}

function selectTab(name: string) {
  document.querySelectorAll("[data-tab]").forEach(element => element.classList.toggle("active", (element as HTMLElement).dataset.tab === name));
  document.querySelectorAll(".tab-page").forEach(element => element.classList.toggle("active", element.id === "tab-" + name));
  if (name === "wizard") renderWizard();
}

const library = new CardLibrary(openLibraryCard);
library.mount($("#libraryHost"));
window.addEventListener("library-folder-changed", syncLinkedButtons);
syncLinkedButtons();
renderWizard();
$("#saveLinkedBtn").onclick = () => void saveLinkedCard();
$("#addFolderBtn").onclick = () => void addCurrentToFolder();
$("#versionsBtn").onclick = () => void showVersions();
$("#closeVersions").onclick = () => $("#versionModal").classList.add("hidden");
$("#versionModal").addEventListener("click", event => { if (event.target === $("#versionModal")) $("#versionModal").classList.add("hidden"); });
$("#wizardBack").onclick = () => { if (wizardStep > 0) wizardStep--; renderWizard(); };
$("#wizardNext").onclick = () => {
  const step = wizardSteps[wizardStep];
  const notes = ($("#wizardNotes") as HTMLTextAreaElement).value.trim();
  wizardDrafts[step.field] = notes;
  if (notes && !card.data[step.field]) card.data[step.field] = notes;
  wizardStep++;
  renderAll();
  renderWizard();
  changed();
};
$("#wizardUse").onclick = useWizardNotes;
$("#wizardAi").onclick = () => void expandWizardStep();
$("#wizardFinish").onclick = () => selectTab("fields");
$("#repoLink").onclick = async () => {
  try { await window.__TAURI__?.core.invoke("open_repository"); }
  catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
};
void loadBuildInfo();
