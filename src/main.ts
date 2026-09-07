import "./style.css";
import { emptyCard, localScore, normalizeCard, normalizeLoreEntry, normalizePlaceholders, prepareCardForExport, toV3Card } from "./card";
import defaultPortraitUrl from "./assets/default-portrait.jpg?inline";
import { embedCard, extractCard, imageAsPng } from "./png";
import { loadDraftPortrait, saveDraftPortrait } from "./draft-image";
import { formatElapsed, hallucinationDelay, LOADING_HALLUCINATIONS } from "./loading";
import { models, runAi } from "./ai";
import { CardLibrary } from "./library";
import { importCardParts, importPartLabels } from "./component-import";
import type { ImportPart } from "./component-import";
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

const aiFields = textFields.filter(field => field.key !== "creator_notes");
let card = loadDraft();
let imageBuffer: ArrayBuffer | null = null;
let imageUrl = "";
let activeField: CoreEditableField = "description";
let selected = new Set<EditableField>(["description", "personality", "scenario", "first_mes"]);
let nsfwEnabled = localStorage.getItem("nsfwEnabled") !== "false";
let optimizeStrength = (localStorage.getItem("optimizeStrength") as "gentle"|"balanced"|"strong") || "balanced";
let componentSource: CharacterCard | null = null;
let componentImportMode: "greetings" | "parts" = "parts";
let wizardMode: "new" | "review" | null = null;
let score: ScoreResult = localScore(card);
type GreetingLibraryEntry = { id: string; title: string; text: string; createdAt: string };
let greetingLibrary: GreetingLibraryEntry[] = loadGreetingLibrary();
let aiBusy = false;
let statusTimer = 0;
let linkedPath: string | null = null;
let linkedFormat: "PNG" | "JSON" | null = null;
let wizardStep = 0;
let defaultImagePromise: Promise<ArrayBuffer> | null = null;
let cropBitmap: ImageBitmap | null = null;
let cropCandidate: ArrayBuffer | null = null;
let cropBaseScale = 1;
let cropScale = 1;
let cropOffsetX = 0;
let cropOffsetY = 0;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><div class="brand-mark">S</div><div class="brand-copy"><strong>Silly EasyChar</strong><small>Offline Character Studio</small><span id="buildInfo" class="build-info">v… · …</span></div><button id="settingsBtn" class="settings-button" title="Einstellungen öffnen" aria-label="Einstellungen">⚙</button><button id="repoLink" class="brand-watermark" title="Silly EasyChar auf GitHub öffnen">mccrypt1</button></div>
    <div class="top-actions">
      <button id="newBtn" class="ghost">＋ Neu</button><button id="importBtn" class="ghost">↥ Import</button><button id="partsImportBtn" class="ghost">Teile importieren</button>
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
        <button id="imageBtn" class="wide ghost">Portrait wählen</button><button id="cropImageBtn" class="wide ghost hidden">Portrait zuschneiden</button>
        <p>Portraits können lokal im Format 4:5 zugeschnitten werden. Ohne eigenes Bild wird das eingebaute Standardportrait verwendet.</p>
      </section>
      <section class="settings-card">
        <div class="section-title">OLLAMA</div>
        <label>Adresse<input id="ollamaUrl" value="${escapeAttr(localStorage.getItem("ollamaUrl") || "http://127.0.0.1:11434")}" /></label>
        <label>Modell<div class="inline"><select id="model"><option value="">Modelle laden …</option></select><button id="refreshModels" title="Modelle neu laden">↻</button></div></label>
        <label>Ausgabesprache<select id="language"><option>Deutsch</option><option>English</option><option>Spanish</option><option>French</option><option>Italian</option></select></label>
      </section>
      <section class="score-card" id="scoreCard"></section>
    </aside>
    <section class="editor-panel">
      <nav class="tabs"><button data-tab="fields" class="active">Charakter</button><button data-tab="wizard">Wizard</button><button data-tab="extras">Extras</button><button data-tab="lore">Lorebook</button><span id="saveState">Lokal gespeichert</span></nav>
      <div id="tab-fields" class="tab-page active"><div id="fields" class="fields"></div>
        <section class="field greeting-editor" style="max-width:900px;margin:0 auto 13px"><div class="field-head"><label>Alternative Begrüßungen</label><div><button id="greetingLibraryBtn" class="mini">Begrüßungsbibliothek</button><button id="importGreetings" class="mini">Aus Karte importieren</button><button id="addGreeting" class="mini">＋ Begrüßung hinzufügen</button></div></div><p class="muted">Zusätzliche Einstiege, die in SillyTavern neben der ersten Nachricht auswählbar sind.</p><div id="greetings"></div></section>
      </div>
      <div id="tab-extras" class="tab-page"><div class="extras-grid">
        <label>Tags (durch Komma getrennt)<input id="tags" /></label><label>Creator<input id="creator" /></label><label>Version<input id="version" /></label>
        <label class="full talkativeness">Talkativeness · Gruppenchat-Antwortchance <output id="talkativenessValue">50%</output><input id="talkativeness" type="range" min="0" max="100" step="1" value="50" /><small>0% = sehr zurückhaltend · 50% = normal · 100% = sehr gesprächig</small></label>
      </div></div>
      <div id="tab-lore" class="tab-page"><div class="lore-head"><div><h2>Character Lorebook</h2><p>Schlüsselwortgesteuerte Details für Orte, Figuren, Regeln und Gegenstände.</p></div><button id="addLore" class="ghost">＋ Eintrag</button></div><div id="loreEntries"></div></div>
      <div id="tab-wizard" class="tab-page">
        <div class="wizard">
          <div class="wizard-progress"><span id="wizardCount"></span><i><b id="wizardBar"></b></i><button id="wizardModeBtn" class="mini">Modus wechseln</button></div>
          <div class="wizard-card">
            <small>SCHRITT-FÜR-SCHRITT-CARD</small><h2 id="wizardTitle"></h2><p id="wizardHelp"></p>
            <div id="wizardDetails" class="wizard-detail-grid"></div>
            <label>Weitere Stichpunkte, Ideen oder ein fertiger Text</label>
            <textarea id="wizardNotes" rows="7"></textarea>
            <div class="wizard-preview"><span>AKTUELLER FELDINHALT</span><p id="wizardCurrent"></p></div>
            <div class="wizard-actions"><button id="wizardBack" class="ghost">← Zurück</button><button id="wizardUse" class="ghost">Notizen übernehmen</button><button id="wizardAi" class="primary">✦ Mit Ollama ausarbeiten</button><button id="wizardNext" class="ghost">Weiter →</button></div>
            <div id="wizardThinking" class="hidden"></div>
          </div>
          <div class="wizard-done hidden" id="wizardDone"><span>✓</span><h2>Grundkarte vollständig</h2><p>Alle Inhalte wurden in die passenden Character-Card-Felder übernommen. Du kannst sie nun im normalen Editor verfeinern.</p><button id="wizardFinish" class="primary">Zum Character Editor</button></div>
        </div>
      </div>
    </section>
    <aside class="ai-panel">
      <div class="ai-head"><div class="ai-avatar">✦</div><div><strong>Lokaler Schreibassistent</strong><small>Ollama · Daten bleiben auf deinem PC</small></div></div>
      <div class="quick-actions"><button data-ai="suggest">Ideen</button><button data-ai="grade">Bewerten</button><button data-ai="translate">Übersetzen</button><button data-ai="lorebook">Lorebook</button><button data-ai="optimize" class="token-action">Token minimieren</button></div>
      <div class="selection"><div class="field-head"><b>Felder für Bearbeitung</b><button id="allFields" class="link">alle</button></div><div id="fieldChecks"></div></div>
      <label class="instruction-label">Was soll geändert werden?</label>
      <textarea id="instruction" rows="8" placeholder="z. B. Informationen auf passende Felder verteilen, auf Deutsch übersetzen und die Stimme natürlicher machen …"></textarea>
      <button id="editAi" class="primary wide">✦ Ausgewählte Felder bearbeiten</button>
      <div id="aiOutput" class="ai-output"><div class="empty-state"><span>✦</span><p>Wähle Felder und beschreibe deine Änderung – oder nutze eine Schnellaktion.</p></div></div>
    </aside>
  </main>
  <div id="settingsModal" class="modal hidden"><div class="modal-card settings-modal"><div class="field-head"><h3>Einstellungen</h3><button id="closeSettings">×</button></div>
    <label>Oberflächensprache<select id="uiLanguage"><option value="de">Deutsch</option><option value="en" disabled>English · folgt zum öffentlichen Release</option></select></label>
    <label>Standard-Creator<input id="defaultCreator" placeholder="Wird bei neuen Karten eingetragen" /></label>
    <label>Stärke der Token-Kürzung<select id="optimizeStrength"><option value="gentle">Behutsam · mehr Details behalten</option><option value="balanced">Ausgewogen</option><option value="strong">Stark · maximal kompakt</option></select></label>
    <label class="settings-toggle"><span><b>NSFW-Verarbeitung</b><small>Erwachsene fiktionale Inhalte bei lokalen Ollama-Aktionen erhalten.</small></span><input id="nsfwSetting" type="checkbox" /><i></i></label>
    <details><summary>Hilfe</summary><div class="settings-help"><p><b>Token minimieren</b> kürzt einzelne oder alle ausgewählten Felder. Jede Änderung erscheint vor der Übernahme im Prüffenster.</p><p><b>Fehlerprotokoll</b> enthält nur Zeitpunkt, Programmversion, Vorgang und technischen Fehlercode – niemals Kartenfelder, Prompts oder Notizen.</p><p>Protokoll: <code id="errorLogPath">Wird ermittelt …</code></p></div></details>
  </div></div>
  <div id="componentModal" class="modal hidden"><div class="modal-card component-modal"><div class="field-head"><h3>Kartenbestandteile importieren</h3><button id="closeComponentImport">×</button></div><p id="componentSourceName"></p><p>Textfelder ersetzen den aktuellen Inhalt. Begrüßungen und Lorebook-Einträge werden hinzugefügt, Tags werden zusammengeführt.</p><div id="componentChecks" class="component-checks"></div><button id="applyComponentImport" class="primary wide">Ausgewählte Bestandteile importieren</button></div></div>
  <div id="wizardModeModal" class="modal hidden"><div class="modal-card wizard-mode-modal"><div class="field-head"><h3>Wizard starten</h3><button id="closeWizardMode">×</button></div><p>Wie möchtest du den Schritt-für-Schritt-Wizard verwenden?</p><div class="wizard-mode-actions"><button id="wizardReviewMode" class="primary"><b>Vorhandene Karte prüfen</b><small>Aktuelle Inhalte laden und Feld für Feld überarbeiten.</small></button><button id="wizardNewMode" class="ghost"><b>Neue Karte erstellen</b><small>Aktuelle Karte verwerfen und mit einem leeren Wizard beginnen.</small></button></div></div></div>
  <div id="versionModal" class="modal hidden"><div class="modal-card"><div class="field-head"><h3>Letzte Kartenversionen</h3><button id="closeVersions">×</button></div><p>Vor jedem Speichern wird automatisch eine Version angelegt. Maximal drei werden behalten.</p><div id="versionList"></div></div></div>
  <div id="greetingLibraryModal" class="modal hidden"><div class="modal-card greeting-library-modal"><div class="field-head"><h3>Alternative-Begrüßungen-Bibliothek</h3><button id="closeGreetingLibrary">×</button></div>
    <p>Diese Bibliothek wird nur lokal auf deinem PC gespeichert. Einträge werden erst nach einem Klick zur geöffneten Karte hinzugefügt.</p>
    <input id="greetingLibrarySearch" placeholder="Bibliothek durchsuchen …" />
    <div class="greeting-library-create"><input id="greetingLibraryTitle" placeholder="Titel, z. B. Café am Morgen" /><textarea id="greetingLibraryText" rows="5" placeholder="Vollständige alternative Begrüßung …"></textarea><button id="saveGreetingTemplate" class="primary">In Bibliothek speichern</button><button id="captureCardGreetings" class="ghost">Alle Begrüßungen der Karte übernehmen</button></div>
    <div id="greetingLibraryList" class="greeting-library-list"></div>
  </div></div>
  <div id="reviewModal" class="modal review-modal hidden"><div class="review-card"><div class="field-head"><h3>Änderungen prüfen</h3><button id="closeReview">×</button></div><div class="review-request"><span>DEINE ANWEISUNG</span><p id="reviewRequest"></p></div><div class="review-actions"><button id="acceptAllReview" class="primary">✓ Alle übernehmen</button><button id="rejectReview" class="ghost">✕ Alle ablehnen</button></div><div id="reviewFields"></div><div class="review-footer"><button id="applyReview" class="primary">Ausgewählte Änderungen übernehmen</button></div></div></div>
  <div id="cropModal" class="modal crop-modal hidden"><div class="crop-card"><div class="field-head"><h3>Portrait zuschneiden</h3><button id="closeCrop">×</button></div><p>Bild verschieben und mit dem Regler zoomen. Der Export wird als 4:5-PNG mit 768 × 960 Pixeln gespeichert.</p><canvas id="cropCanvas" width="768" height="960"></canvas><label>Zoom<input id="cropZoom" type="range" min="1" max="3" step="0.01" value="1" /></label><div class="crop-actions"><button id="cropOriginal" class="ghost">Original verwenden</button><button id="applyCrop" class="primary">Zuschnitt übernehmen</button></div></div></div>
  <div id="toast"></div><input id="fileInput" type="file" accept=".json,.png,application/json,image/png" hidden /><input id="componentFileInput" type="file" accept=".json,.png,application/json,image/png" hidden />`;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
function escapeAttr(v: string) { return v.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }
function escapeHtml(v: string) { return escapeAttr(v).replace(/'/g, "&#39;"); }
function loadDraft(): CharacterCard { try { return normalizeCard(JSON.parse(localStorage.getItem("draft") || "null")); } catch { return emptyCard(); } }
function saveDraft() { localStorage.setItem("draft", JSON.stringify(card)); $("#saveState").textContent = "Lokal gespeichert"; }
function changed() { $("#saveState").textContent = "Speichert …"; score = localScore(card); renderScore(); window.clearTimeout(statusTimer); statusTimer = window.setTimeout(saveDraft, 350); }
function newCardWithDefaults() {
  const next = emptyCard();
  next.data.creator = localStorage.getItem("defaultCreator") || "";
  return next;
}
function loadGreetingLibrary(): GreetingLibraryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("greetingLibrary") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && typeof entry.id === "string" && typeof entry.title === "string" && typeof entry.text === "string" && entry.text.trim());
  } catch { return []; }
}
function saveGreetingLibrary() { localStorage.setItem("greetingLibrary", JSON.stringify(greetingLibrary)); }
function greetingEntry(title: string, text: string): GreetingLibraryEntry {
  return { id: crypto.randomUUID(), title: title.trim() || "Unbenannte Begrüßung", text: normalizePlaceholders(text.trim()), createdAt: new Date().toISOString() };
}
function addGreetingFromLibrary(text: string) {
  const index = card.data.alternate_greetings.push(text) - 1;
  selected.add(greetingField(index)); renderExtras(); renderChecks(); changed();
  toast("Begrüßung zur Karte hinzugefügt.");
}
function reconcileSelectedFields() {
  selected = new Set([...selected].filter(key => {
    if (!key.startsWith("alternate_greeting:")) return aiFields.some(field => field.key === key);
    const index = Number(key.split(":")[1]);
    return Number.isInteger(index) && index >= 0 && index < card.data.alternate_greetings.length;
  }));
}
function syncSelectionHighlights() {
  document.querySelectorAll<HTMLElement>("[data-selection-key]").forEach(element => {
    element.classList.toggle("selected-field", selected.has(element.dataset.selectionKey as EditableField));
  });
}
function resetWizardState() {
  wizardMode = null;
  wizardStep = 0;
  for (const key of Object.keys(wizardDrafts)) delete wizardDrafts[key as CoreEditableField];
  for (const key of Object.keys(wizardDetails)) delete wizardDetails[key as CoreEditableField];
}

function renderFields() {
  $("#fields").innerHTML = textFields.map(f => {
    const value = typeof card.data[f.key] === "string" ? card.data[f.key] : "";
    const optimize = f.key === "creator_notes" ? "" : `<button class="field-optimize" data-optimize-one="${f.key}" title="Nur dieses Feld kompakter machen">Token sparen</button>`;
    return `<article class="field ${activeField === f.key ? "focused" : ""} ${selected.has(f.key) ? "selected-field" : ""}" data-key="${f.key}" data-selection-key="${f.key}"><div class="field-head"><label>${f.label}</label><div>${optimize}<span>${value.length} Zeichen</span></div></div>${f.rows === 1 ? `<input data-field="${f.key}" value="${escapeAttr(value)}" placeholder="${escapeAttr(f.hint)}" />` : `<textarea data-field="${f.key}" rows="${f.rows}" placeholder="${escapeAttr(f.hint)}">${escapeHtml(value)}</textarea>`}</article>`;
  }).join("");
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field]").forEach(el => {
    el.addEventListener("focus", () => { activeField = el.dataset.field as CoreEditableField; document.querySelectorAll(".field").forEach(n => n.classList.toggle("focused", (n as HTMLElement).dataset.key === activeField)); });
    el.addEventListener("input", () => { card.data[el.dataset.field as CoreEditableField] = el.value; el.closest(".field")!.querySelector("span")!.textContent = `${el.value.length} Zeichen`; changed(); });
    el.addEventListener("change", () => { const value = normalizePlaceholders(el.value); if (value !== el.value) { el.value = value; card.data[el.dataset.field as CoreEditableField] = value; changed(); } });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-optimize-one]").forEach(button => button.onclick = () => void ai("optimize", [button.dataset.optimizeOne as CoreEditableField]));
}
function greetingField(index: number): EditableField { return `alternate_greeting:${index}`; }
function renderChecks() {
  const core = aiFields.map(f => `<label class="check"><input type="checkbox" data-check="${f.key}" ${selected.has(f.key) ? "checked" : ""}/><span>${f.label}</span></label>`).join("");
  const greetings = card.data.alternate_greetings.map((_, index) => { const key = greetingField(index); return `<label class="check"><input type="checkbox" data-check="${key}" ${selected.has(key) ? "checked" : ""}/><span>Alternative Begrüßung ${index + 1}</span></label>`; }).join("");
  $("#fieldChecks").innerHTML = core + greetings;
  document.querySelectorAll<HTMLInputElement>("[data-check]").forEach(c => c.onchange = () => { const k = c.dataset.check as EditableField; c.checked ? selected.add(k) : selected.delete(k); syncSelectionHighlights(); });
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
function talkativenessPercent(): number {
  const raw = Number(card.data.extensions.talkativeness ?? 0.5);
  return Math.round(Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw)));
}
function renderExtras() {
  ($("#tags") as HTMLInputElement).value = card.data.tags.join(", "); ($("#creator") as HTMLInputElement).value = card.data.creator; ($("#version") as HTMLInputElement).value = card.data.character_version;
  const talkativeness = talkativenessPercent();
  ($("#talkativeness") as HTMLInputElement).value = String(talkativeness);
  $("#talkativenessValue").textContent = talkativeness + "%";
  ($("#talkativeness") as HTMLInputElement).oninput = event => {
    const percent = Number((event.target as HTMLInputElement).value);
    card.data.extensions.talkativeness = (percent / 100).toFixed(2);
    $("#talkativenessValue").textContent = percent + "%";
    changed();
  };
  $("#greetings").innerHTML = card.data.alternate_greetings.map((g, i) => `<div class="repeat ${selected.has(greetingField(i)) ? "selected-field" : ""}" data-selection-key="${greetingField(i)}"><textarea rows="5" data-greeting="${i}" placeholder="Alternative Begrüßung ${i + 1}">${escapeHtml(g)}</textarea><button data-remove-greeting="${i}">×</button></div>`).join("") || `<p class="muted">Noch keine alternativen Begrüßungen.</p>`;
  document.querySelectorAll<HTMLTextAreaElement>("[data-greeting]").forEach(el => {
    el.oninput = () => { card.data.alternate_greetings[Number(el.dataset.greeting)] = el.value; changed(); };
    el.onchange = () => { const index = Number(el.dataset.greeting); const value = normalizePlaceholders(el.value); if (value !== el.value) { el.value = value; card.data.alternate_greetings[index] = value; changed(); } };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-greeting]").forEach(el => el.onclick = () => removeGreeting(Number(el.dataset.removeGreeting)));
}
function renderGreetingLibrary() {
  const query = ($("#greetingLibrarySearch") as HTMLInputElement).value.trim().toLocaleLowerCase();
  const visible = greetingLibrary.filter(entry => !query || (entry.title + "\n" + entry.text).toLocaleLowerCase().includes(query));
  $("#greetingLibraryList").innerHTML = visible.map(entry => `<article class="greeting-library-item"><div><b>${escapeHtml(entry.title)}</b><small>${escapeHtml(entry.text)}</small></div><button class="primary" data-use-greeting="${escapeAttr(entry.id)}">Zur Karte</button><button class="danger-link" data-delete-greeting="${escapeAttr(entry.id)}">Löschen</button></article>`).join("") || `<p class="muted">Keine passenden Begrüßungen gespeichert.</p>`;
  document.querySelectorAll<HTMLButtonElement>("[data-use-greeting]").forEach(button => button.onclick = () => {
    const entry = greetingLibrary.find(item => item.id === button.dataset.useGreeting);
    if (entry) addGreetingFromLibrary(entry.text);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-delete-greeting]").forEach(button => button.onclick = () => {
    greetingLibrary = greetingLibrary.filter(item => item.id !== button.dataset.deleteGreeting);
    saveGreetingLibrary(); renderGreetingLibrary();
  });
}
function openGreetingLibrary() {
  ($("#greetingLibrarySearch") as HTMLInputElement).value = "";
  ($("#greetingLibraryTitle") as HTMLInputElement).value = "";
  ($("#greetingLibraryText") as HTMLTextAreaElement).value = "";
  renderGreetingLibrary();
  $("#greetingLibraryModal").classList.remove("hidden");
}
function closeGreetingLibrary() { $("#greetingLibraryModal").classList.add("hidden"); }

function renderLore() {
  const entries = card.data.character_book?.entries ?? [];
  const positions = [[0,"Vor Character Definition"],[1,"Nach Character Definition"],[5,"Vor Dialogbeispielen"],[6,"Nach Dialogbeispielen"],[2,"Oben in Author's Note"],[3,"Unten in Author's Note"],[4,"Im Chat bei Tiefe"]] as const;
  $("#loreEntries").innerHTML = entries.map((e, i) => `<article class="lore-entry"><div class="field-head"><b>${escapeHtml(e.comment || `Eintrag ${i + 1}`)}</b><button data-remove-lore="${i}" class="danger-link">Entfernen</button></div><div class="lore-grid"><label>Titel<input data-lore="comment" data-i="${i}" value="${escapeAttr(e.comment)}" /></label><label>Primäre Schlüsselwörter<input data-lore="key" data-i="${i}" value="${escapeAttr(e.key.join(", "))}" /></label><label>Sekundäre Schlüsselwörter<input data-lore="keysecondary" data-i="${i}" value="${escapeAttr(e.keysecondary.join(", "))}" placeholder="Optional zur Eingrenzung" /></label><label class="full">Inhalt<textarea rows="6" data-lore="content" data-i="${i}">${escapeHtml(e.content)}</textarea></label><label class="lore-position">Position<select data-lore="position" data-i="${i}">${positions.map(([n,label]) => `<option value="${n}" ${e.position===n?"selected":""}>${label}</option>`).join("")}</select></label><label>Priorität / Reihenfolge<input type="number" data-lore="order" data-i="${i}" value="${e.order}" /></label><label>Wahrscheinlichkeit<input type="number" min="0" max="100" data-lore="probability" data-i="${i}" value="${e.probability}" /></label><label>Tiefe (nur „Im Chat“)<input type="number" min="0" data-lore="depth" data-i="${i}" value="${e.depth}" /></label><label class="check"><input type="checkbox" data-lore="constant" data-i="${i}" ${e.constant?"checked":""}/><span>Immer aktiv</span></label><label class="check"><input type="checkbox" data-lore="selective" data-i="${i}" ${e.selective?"checked":""}/><span>Sekundärschlüssel verlangen</span></label><label class="check"><input type="checkbox" data-lore="excludeRecursion" data-i="${i}" ${e.excludeRecursion?"checked":""}/><span>Nicht rekursiv aktivieren</span></label><label class="check"><input type="checkbox" data-lore="preventRecursion" data-i="${i}" ${e.preventRecursion?"checked":""}/><span>Weitere Rekursion stoppen</span></label></div></article>`).join("") || `<div class="empty-lore"><span>⌁</span><h3>Noch kein Lorebook</h3><p>Füge Einträge manuell hinzu oder lasse Ollama passende Einträge erzeugen.</p></div>`;
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-lore]").forEach(el => el.oninput = () => { const e = entries[Number(el.dataset.i)]; const key = el.dataset.lore!; if (key === "key" || key === "keysecondary") (e as any)[key] = el.value.split(",").map(x=>x.trim()).filter(Boolean); else if (["constant","selective","excludeRecursion","preventRecursion"].includes(key)) (e as any)[key] = (el as HTMLInputElement).checked; else if (["position","order","probability","depth"].includes(key)) (e as any)[key] = Number(el.value); else (e as any)[key] = el.value; changed(); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-lore]").forEach(b => b.onclick = () => { entries.splice(Number(b.dataset.removeLore), 1); entries.forEach((e,i)=>e.uid=i); renderLore(); changed(); });
}
function renderScore(s = score) {
  $("#scoreCard").innerHTML = `<div class="score-top"><div><span>KARTEN-SCORE</span><strong>${s.total}</strong><small>/ 100</small></div><button id="rescore">Lokal prüfen</button></div><div class="score-bars">${[["Struktur",s.structure],["Kohärenz",s.coherence],["Rollenspiel",s.roleplay],["Kreativität",s.creativity],["Politur",s.polish]].map(([n,v])=>`<label><span>${n}</span><i><b style="width:${Number(v)*5}%"></b></i><em>${v}/20</em></label>`).join("")}</div>${s.findings.length ? `<ul>${s.findings.slice(0,3).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p class="good">Keine offensichtlichen lokalen Probleme.</p>`}`;
  $("#rescore").onclick = () => { score = localScore(card); renderScore(); };
}
function renderPortrait() {
  const p=$("#portrait"); p.innerHTML = `<img src="${imageUrl || defaultPortraitUrl}" alt="Character portrait" />${imageUrl ? "" : "<span>Standardportrait</span>"}`;
  $("#cropImageBtn").classList.toggle("hidden", !imageBuffer);
}
function renderAll() { reconcileSelectedFields(); renderFields(); renderChecks(); renderExtras(); renderLore(); renderScore(); renderPortrait(); syncSelectionHighlights(); }

function toast(message: string, bad=false) { const t=$("#toast"); t.textContent=message; t.className=bad?"show bad":"show"; setTimeout(()=>t.className="",3000); }
function resetAiInstruction() {
  ($("#instruction") as HTMLTextAreaElement).value = "";
  $("#aiOutput").innerHTML = `<div class="empty-state"><span>✦</span><p>Wähle Felder und beschreibe deine Änderung – oder nutze eine Schnellaktion.</p></div>`;
}
async function defaultPortraitBuffer(): Promise<ArrayBuffer> {
  defaultImagePromise ??= Promise.resolve().then(() => {
    const separator = defaultPortraitUrl.indexOf(",");
    const header = defaultPortraitUrl.slice(0, separator);
    if (separator < 0 || !header.includes(";base64")) {
      throw new Error("Das eingebaute Standardportrait ist ungültig.");
    }
    const binary = atob(defaultPortraitUrl.slice(separator + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(header)?.[1] || "image/jpeg";
    return imageAsPng(new File([bytes.buffer], "default-portrait.jpg", { type: mime }));
  });
  return defaultImagePromise;
}
function commitPortrait(buffer: ArrayBuffer, persist = true) {
  imageBuffer = buffer;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(new Blob([buffer], { type: "image/png" }));
  renderPortrait();
  if (persist) void saveDraftPortrait(buffer).catch(() => undefined);
}
function clearPortrait() {
  imageBuffer = null;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = "";
  void saveDraftPortrait(null).catch(() => undefined);
}
async function restoreDraftPortrait() {
  try {
    const stored = await loadDraftPortrait();
    if (stored && !imageBuffer) commitPortrait(stored, false);
  } catch {
    // IndexedDB may be unavailable in restricted WebViews; the card still uses the default portrait.
  }
}
function closeCrop() {
  $("#cropModal").classList.add("hidden");
  cropBitmap?.close();
  cropBitmap = null;
  cropCandidate = null;
}
function drawCrop() {
  if (!cropBitmap) return;
  const canvas = $("#cropCanvas") as HTMLCanvasElement;
  const context = canvas.getContext("2d")!;
  const width = cropBitmap.width * cropScale;
  const height = cropBitmap.height * cropScale;
  cropOffsetX = Math.max(Math.min(0, canvas.width - width), Math.min(0, cropOffsetX));
  cropOffsetY = Math.max(Math.min(0, canvas.height - height), Math.min(0, cropOffsetY));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(cropBitmap, cropOffsetX, cropOffsetY, width, height);
}
async function openCrop(buffer: ArrayBuffer) {
  cropBitmap?.close();
  cropCandidate = buffer;
  cropBitmap = await createImageBitmap(new Blob([buffer], { type: "image/png" }));
  const canvas = $("#cropCanvas") as HTMLCanvasElement;
  cropBaseScale = Math.max(canvas.width / cropBitmap.width, canvas.height / cropBitmap.height);
  cropScale = cropBaseScale;
  cropOffsetX = (canvas.width - cropBitmap.width * cropScale) / 2;
  cropOffsetY = (canvas.height - cropBitmap.height * cropScale) / 2;
  ($("#cropZoom") as HTMLInputElement).value = "1";
  drawCrop();
  $("#cropModal").classList.remove("hidden");
}

function fieldValue(key: EditableField): string {
  if (key.startsWith("alternate_greeting:")) return card.data.alternate_greetings[Number(key.split(":")[1])] ?? "";
  const value = card.data[key as CoreEditableField]; return typeof value === "string" ? value : "";
}
function fieldTitle(key: EditableField): string {
  if (key.startsWith("alternate_greeting:")) return "Alternative Begrüßung " + (Number(key.split(":")[1]) + 1);
  return textFields.find(field => field.key === key)?.label ?? key;
}
function startThinking(host: HTMLElement, label: string, hideWhenDone = false) {
  const started = Date.now();
  let stopped = false;
  host.classList.remove("hidden");
  host.innerHTML = `<div class="thinking"><i></i><p><span data-thinking-label></span><strong data-thinking-seconds>0 s</strong><small data-thinking-hallucination></small></p></div>`;
  const labelNode = host.querySelector<HTMLElement>("[data-thinking-label]")!;
  const secondsNode = host.querySelector<HTMLElement>("[data-thinking-seconds]")!;
  const hallucinationNode = host.querySelector<HTMLElement>("[data-thinking-hallucination]")!;
  let hallucinationIndex = -1;
  let nextHallucination = Date.now() + hallucinationDelay();
  const showHallucination = () => {
    let next = Math.floor(Math.random() * LOADING_HALLUCINATIONS.length);
    if (next === hallucinationIndex) next = (next + 1) % LOADING_HALLUCINATIONS.length;
    hallucinationIndex = next;
    hallucinationNode.textContent = LOADING_HALLUCINATIONS[next];
  };
  labelNode.textContent = label;
  showHallucination();
  const tick = () => {
    const now = Date.now();
    secondsNode.textContent = formatElapsed((now - started) / 1000);
    if (now >= nextHallucination) {
      showHallucination();
      nextHallucination = now + hallucinationDelay();
    }
  };
  const interval = window.setInterval(tick, 250);
  return {
    update(value: string) { labelNode.textContent = value; },
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
  } catch { $("#buildInfo").textContent = "v0.3.1 · development"; }
}
function technicalErrorKind(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("json")) return "MODEL_JSON_INVALID";
  if (message.includes("failed to fetch") || message.includes("nicht erreichbar") || message.includes("request")) return "OLLAMA_NETWORK";
  if (message.includes("timeout") || message.includes("timed out")) return "OLLAMA_TIMEOUT";
  if (message.includes("undefined") || message.includes("null")) return "CLIENT_RESPONSE_SHAPE";
  if (message.includes("http")) return "OLLAMA_HTTP";
  return error instanceof Error && error.name ? error.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 48) : "UNKNOWN";
}
function recordTechnicalError(operation: string, error: unknown) {
  if (!window.__TAURI__) return;
  void window.__TAURI__.core.invoke("write_error_log", {
    operation,
    errorKind: technicalErrorKind(error)
  }).catch(() => undefined);
}
async function importFile(file: File) {
  resetWizardState();
  if (file.name.toLowerCase().endsWith(".json")) { card=normalizeCard(JSON.parse(await file.text())); clearPortrait(); }
  else { const buffer=await file.arrayBuffer(); const found=extractCard(buffer); if (!found) throw new Error("Dieses PNG enthält keine Character-Card-Metadaten."); card=found; commitPortrait(buffer); }
  resetAiInstruction();
  score=localScore(card); renderAll(); saveDraft(); toast(`${card.data.name} importiert.`);
}
async function readCardOnly(file: File): Promise<CharacterCard> {
  if (file.name.toLowerCase().endsWith(".json")) return normalizeCard(JSON.parse(await file.text()));
  const parsed = extractCard(await file.arrayBuffer());
  if (!parsed) throw new Error("Dieses PNG enthält keine lesbare Character Card.");
  return parsed;
}
function importPartAvailable(source: CharacterCard, part: ImportPart): boolean {
  if (part === "alternate_greetings") return source.data.alternate_greetings.length > 0;
  if (part === "tags") return source.data.tags.length > 0;
  if (part === "character_book") return !!source.data.character_book?.entries.length;
  if (part === "talkativeness") return source.data.extensions.talkativeness != null;
  return Boolean(source.data[part as CoreEditableField]?.toString().trim());
}
function showComponentImport(source: CharacterCard) {
  componentSource = source;
  $("#componentSourceName").textContent = "Quelle: " + (source.data.name || "Unbenannte Karte");
  $("#componentChecks").innerHTML = importPartLabels.map(([part,label]) => {
    const available = importPartAvailable(source, part);
    return `<label class="check ${available ? "" : "unavailable"}"><input type="checkbox" data-import-part="${part}" ${available ? "" : "disabled"} /><span>${escapeHtml(label)}${available ? "" : " · nicht vorhanden"}</span></label>`;
  }).join("");
  $("#componentModal").classList.remove("hidden");
}
async function handleComponentFile(file: File) {
  const source = await readCardOnly(file);
  if (componentImportMode === "greetings") {
    if (!source.data.alternate_greetings.length) throw new Error("Die gewählte Karte enthält keine alternativen Begrüßungen.");
    const count = source.data.alternate_greetings.length;
    card = importCardParts(card, source, ["alternate_greetings"]);
    reconcileSelectedFields();
    renderAll();
    changed();
    toast(count + " alternative Begrüßung" + (count === 1 ? "" : "en") + " hinzugefügt.");
    return;
  }
  showComponentImport(source);
}
function openComponentPicker(mode: "greetings" | "parts") {
  componentImportMode = mode;
  const input = $("#componentFileInput") as HTMLInputElement;
  input.value = "";
  input.click();
}
function applySelectedComponents() {
  if (!componentSource) return;
  const parts = [...document.querySelectorAll<HTMLInputElement>("[data-import-part]:checked")].map(input => input.dataset.importPart as ImportPart);
  if (!parts.length) { toast("Bitte mindestens einen Kartenbestandteil auswählen.", true); return; }
  card = importCardParts(card, componentSource, parts);
  componentSource = null;
  $("#componentModal").classList.add("hidden");
  reconcileSelectedFields();
  score = localScore(card);
  renderAll();
  changed();
  toast(parts.length + " Kartenbestandteil" + (parts.length === 1 ? "" : "e") + " importiert.");
}
async function ai(action: "edit"|"translate"|"suggest"|"grade"|"lorebook"|"optimize", fieldOverride?: EditableField[]) {
  if(aiBusy)return;
  aiBusy=true;
  document.body.classList.add("busy");
  const timer = startThinking($("#aiOutput"), "Ollama arbeitet lokal …");
  const baseUrl = ($("#ollamaUrl") as HTMLInputElement).value;
  const model = ($("#model") as HTMLSelectElement).value;
  const instruction = ($("#instruction") as HTMLTextAreaElement).value;
  const language = ($("#language") as HTMLSelectElement).value;
  const nsfw = nsfwEnabled;
  const selectedFields = fieldOverride ?? [...selected];
  try {
    let result: AiResult;
    if (action === "edit" || action === "translate" || action === "optimize") {
      if (!selectedFields.length) throw new Error("Bitte mindestens ein Feld auswählen.");
      const combinedFields: NonNullable<AiResult["fields"]> = {};
      const explanations: string[] = [];
      for (let index = 0; index < selectedFields.length; index++) {
        const field = selectedFields[index];
        timer.update(`Ollama bearbeitet ${fieldTitle(field)} · ${index + 1}/${selectedFields.length} …`);
        const partial = await runAi({ baseUrl, model, action, card, selected: [field], instruction, language, nsfw, optimizationStrength: optimizeStrength });
        Object.assign(combinedFields, partial.fields);
        if (partial.explanation) explanations.push(partial.explanation);
      }
      result = { fields: combinedFields, explanation: explanations.join("\n") };
    } else {
      result = await runAi({ baseUrl, model, action, card, selected: selectedFields, instruction, language, nsfw, optimizationStrength: optimizeStrength });
    }
    timer.stop();
    if ((action === "edit" || action === "translate" || action === "optimize") && result.fields) {
      const reviewRequest = action === "translate" ? `Übersetzen nach ${language}` : action === "optimize" ? "Tokenverbrauch reduzieren, ohne wichtige Informationen zu verlieren" : instruction;
      const reviewed = await reviewFieldChanges(result.fields, reviewRequest);
      if (!reviewed) {
        $("#aiOutput").innerHTML = `<div class="result"><b>Änderungen verworfen</b><p>Die Karte wurde nicht verändert.</p></div>`;
        return;
      }
      result.fields = reviewed;
    }
    applyAiResult(result, action, new Set(selectedFields));
  } catch(e){
    recordTechnicalError("ai_" + action, e);
    timer.stop();
    $("#aiOutput").innerHTML=`<div class="error"><b>Ollama-Fehler</b><p>${escapeHtml(e instanceof Error?e.message:String(e))}</p><small>Läuft Ollama und ist ein Modell installiert?</small></div>`;
    toast("KI-Aktion fehlgeschlagen.",true);
  } finally {
    timer.stop();
    aiBusy=false;
    document.body.classList.remove("busy");
  }
}
function applyAiResult(r: AiResult, action: string, allowedFields = selected) {
  if(r.fields){
    for(const [key,value] of Object.entries(r.fields)){
      if(typeof value!=="string" || !allowedFields.has(key as EditableField)) continue;
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
  if(action==="grade" && Array.isArray(r.score?.findings) && r.score.findings.length){
    const instruction = $("#instruction") as HTMLTextAreaElement;
    instruction.value = r.score.findings.map((finding, index) => `${index + 1}. ${finding}`).join("\n");
    instruction.focus();
    toast("Verbesserungsvorschläge wurden ins Bearbeitungsfeld übernommen.");
  }
  if(r.lorebook?.entries){ const list=Object.entries(r.lorebook.entries).sort(([a],[b])=>Number(a)-Number(b)).map(([,e],i)=>normalizeLoreEntry(e,i)); card.data.character_book={name:`${card.data.name} Lorebook`,description:"Mit Silly EasyChar und Ollama erstellt",entries:list}; renderLore(); changed(); }
  const items=r.suggestions?.map(x=>`<li>${escapeHtml(x)}</li>`).join("")||"";
  $("#aiOutput").innerHTML=`<div class="result"><b>✓ ${action==="grade"?"Bewertung abgeschlossen":"Ergebnis übernommen"}</b>${r.explanation?`<p>${escapeHtml(r.explanation)}</p>`:""}${items?`<ol>${items}</ol>`:""}${r.score?`<p class="big-result">${r.score.total}<small>/100</small></p>`:""}${r.lorebook?`<p>${Object.keys(r.lorebook.entries).length} Lorebook-Einträge erstellt.</p>`:""}</div>`;
}

$("#newBtn").onclick=()=>{if(!confirm("Aktuelle Karte durch eine neue ersetzen? Der letzte Stand bleibt nur im lokalen Entwurf."))return; card=newCardWithDefaults();clearPortrait();linkedPath=null;linkedFormat=null;resetWizardState();resetAiInstruction();score=localScore(card);renderAll();syncLinkedButtons();changed();};
$("#importBtn").onclick=()=>$("#fileInput").click(); $("#fileInput").onchange=async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)try{linkedPath=null;linkedFormat=null;await importFile(f);syncLinkedButtons();}catch(err){toast(err instanceof Error?err.message:String(err),true);}};
$("#imageBtn").onclick=()=>$("#imageInput").click(); $("#portrait").onclick=()=>$("#imageInput").click(); $("#imageInput").onchange=async e=>{const input=e.target as HTMLInputElement;const f=input.files?.[0];if(!f)return;try{await openCrop(await imageAsPng(f));}catch(error){toast(error instanceof Error?error.message:String(error),true);}finally{input.value="";}};
$("#cropImageBtn").onclick=()=>{if(imageBuffer)void openCrop(imageBuffer);};
$("#closeCrop").onclick=closeCrop;
$("#cropModal").addEventListener("click",event=>{if(event.target===$("#cropModal"))closeCrop();});
const cropCanvas=$("#cropCanvas") as HTMLCanvasElement;
let cropDragging=false;
let cropPointerX=0;
let cropPointerY=0;
cropCanvas.onpointerdown=event=>{cropDragging=true;cropPointerX=event.clientX;cropPointerY=event.clientY;cropCanvas.setPointerCapture(event.pointerId);};
cropCanvas.onpointermove=event=>{if(!cropDragging)return;const factor=cropCanvas.width/cropCanvas.clientWidth;cropOffsetX+=(event.clientX-cropPointerX)*factor;cropOffsetY+=(event.clientY-cropPointerY)*factor;cropPointerX=event.clientX;cropPointerY=event.clientY;drawCrop();};
cropCanvas.onpointerup=event=>{cropDragging=false;if(cropCanvas.hasPointerCapture(event.pointerId))cropCanvas.releasePointerCapture(event.pointerId);};
cropCanvas.onpointercancel=()=>{cropDragging=false;};
$("#cropZoom").oninput=event=>{const nextScale=cropBaseScale*Number((event.target as HTMLInputElement).value);const ratio=nextScale/cropScale;cropOffsetX=cropCanvas.width/2-(cropCanvas.width/2-cropOffsetX)*ratio;cropOffsetY=cropCanvas.height/2-(cropCanvas.height/2-cropOffsetY)*ratio;cropScale=nextScale;drawCrop();};
$("#cropOriginal").onclick=()=>{if(cropCandidate)commitPortrait(cropCandidate);closeCrop();toast("Originalportrait \u00fcbernommen.");};
$("#applyCrop").onclick=async()=>{try{const blob=await new Promise<Blob>((resolve,reject)=>cropCanvas.toBlob(value=>value?resolve(value):reject(new Error("Der Portraitzuschnitt konnte nicht erstellt werden.")),"image/png"));commitPortrait(await blob.arrayBuffer());closeCrop();toast("Portraitzuschnitt \u00fcbernommen.");}catch(error){toast(error instanceof Error?error.message:String(error),true);}};
$("#jsonBtn").onclick=async()=>{
  try {
    const output=toV3Card(prepareCardForExport(card));
    const saved=await download(new Blob([JSON.stringify(output,null,2)],{type:"application/json"}),`${card.data.name||"character"}.json`);
    if(saved) toast("Character-Card-JSON gespeichert.");
  } catch(error) { toast(error instanceof Error ? error.message : String(error), true); }
};
$("#pngBtn").onclick=async()=>{
  try {
    const output=prepareCardForExport(card);
    const portrait=imageBuffer ?? await defaultPortraitBuffer();
    const saved=await download(embedCard(portrait,output),`${card.data.name||"character"}.png`);
    if(saved) toast("Character-Card-PNG gespeichert.");
  } catch(error) { toast(error instanceof Error ? error.message : String(error), true); }
};
$("#refreshModels").onclick=async()=>{const url=($(`#ollamaUrl`) as HTMLInputElement).value;localStorage.setItem("ollamaUrl",url);const sel=$(`#model`) as HTMLSelectElement;sel.innerHTML=`<option>Lädt …</option>`;try{const list=await models(url);sel.innerHTML=list.map(m=>`<option>${escapeHtml(m)}</option>`).join("")||`<option value="">Keine Modelle gefunden</option>`;const last=localStorage.getItem("model");if(last&&list.includes(last))sel.value=last;toast(`${list.length} Ollama-Modelle gefunden.`);}catch(e){sel.innerHTML=`<option value="">Ollama nicht erreichbar</option>`;toast(e instanceof Error?e.message:String(e),true);}};
$("#model").onchange=e=>localStorage.setItem("model",(e.target as HTMLSelectElement).value); $("#allFields").onclick=()=>{selected=new Set<EditableField>([...aiFields.map(x=>x.key),...card.data.alternate_greetings.map((_,index)=>greetingField(index))]);renderChecks();syncSelectionHighlights();};
$("#editAi").onclick=()=>ai("edit"); document.querySelectorAll<HTMLButtonElement>("[data-ai]").forEach(b=>b.onclick=()=>ai(b.dataset.ai as any));
$("#addGreeting").onclick=()=>{const index=card.data.alternate_greetings.push("")-1;selected.add(greetingField(index));renderExtras();renderChecks();changed();};
$("#importGreetings").onclick=()=>openComponentPicker("greetings");
$("#partsImportBtn").onclick=()=>openComponentPicker("parts");
$("#componentFileInput").onchange=async event=>{const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file)try{await handleComponentFile(file);}catch(error){toast(error instanceof Error?error.message:String(error),true);}finally{input.value="";}};
$("#applyComponentImport").onclick=applySelectedComponents;
$("#closeComponentImport").onclick=()=>{$("#componentModal").classList.add("hidden");componentSource=null;};
$("#componentModal").addEventListener("click",event=>{if(event.target===$("#componentModal")){$("#componentModal").classList.add("hidden");componentSource=null;}});
$("#greetingLibraryBtn").onclick=openGreetingLibrary;
$("#closeGreetingLibrary").onclick=closeGreetingLibrary;
$("#greetingLibraryModal").addEventListener("click",event=>{if(event.target===$("#greetingLibraryModal"))closeGreetingLibrary();});
$("#greetingLibrarySearch").oninput=renderGreetingLibrary;
$("#saveGreetingTemplate").onclick=()=>{
  const title=($("#greetingLibraryTitle") as HTMLInputElement).value;
  const text=($("#greetingLibraryText") as HTMLTextAreaElement).value;
  if(!text.trim()){toast("Bitte zuerst eine Begrüßung eingeben.",true);return;}
  greetingLibrary.unshift(greetingEntry(title,text));saveGreetingLibrary();renderGreetingLibrary();
  ($("#greetingLibraryTitle") as HTMLInputElement).value="";($("#greetingLibraryText") as HTMLTextAreaElement).value="";
  toast("Begrüßung lokal gespeichert.");
};
$("#captureCardGreetings").onclick=()=>{
  const existing=new Set(greetingLibrary.map(entry=>entry.text.trim()));
  const additions=card.data.alternate_greetings.filter(text=>text.trim()&&!existing.has(text.trim()));
  additions.forEach((text,index)=>greetingLibrary.unshift(greetingEntry((card.data.name||"Karte")+" · Begrüßung "+(index+1),text)));
  saveGreetingLibrary();renderGreetingLibrary();
  toast(additions.length?additions.length+" Begrüßung(en) übernommen.":"Alle Begrüßungen sind bereits gespeichert.");
};
$("#addLore").onclick=()=>{if(!card.data.character_book)card.data.character_book={name:`${card.data.name} Lorebook`,entries:[]};const i=card.data.character_book.entries.length;card.data.character_book.entries.push(normalizeLoreEntry({},i));renderLore();changed();};
[$("#tags"),$("#creator"),$("#version")].forEach(el=>el.addEventListener("input",()=>{card.data.tags=($(`#tags`) as HTMLInputElement).value.split(",").map(x=>x.trim()).filter(Boolean);card.data.creator=($(`#creator`) as HTMLInputElement).value;card.data.character_version=($(`#version`) as HTMLInputElement).value;changed();}));
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(b=>b.onclick=()=>selectTab(b.dataset.tab!));
window.addEventListener("dragover",e=>e.preventDefault());window.addEventListener("drop",async e=>{e.preventDefault();const f=e.dataTransfer?.files[0];if(f)try{await importFile(f);}catch(err){toast(err instanceof Error?err.message:String(err),true);}});
renderAll(); void restoreDraftPortrait(); setTimeout(()=>$("#refreshModels").click(),150);

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
const wizardPrompts: Record<CoreEditableField, [string,string][]> = {
  name: [["Rolle oder Arbeitstitel","z. B. Ermittlerin, Hexe, Lieferfahrerin"],["Herkunft oder Kultur","Region, Epoche, Spezies oder Milieu"],["Namensstil","modern, elegant, ungewöhnlich, Spitzname …"]],
  description: [["Identität","Alter, Spezies, Beruf, Rolle"],["Aussehen und Kleidung","Körperbau, Merkmale, Stil"],["Hintergrund und Fähigkeiten","Herkunft, Geschichte, Können"]],
  personality: [["Kerneigenschaften","Stärken, Schwächen, Widersprüche"],["Ziele und Ängste","Wünsche, Bedürfnisse, Konflikte"],["Eigenheiten und Grenzen","Gewohnheiten, Vorlieben, Tabus"]],
  scenario: [["Ort und Zeit","Wo und wann beginnt die Szene?"],["Beziehung zu {{user}}","Wie kennen sie sich oder begegnen sie sich?"],["Auslöser und Konflikt","Was passiert gerade, was steht auf dem Spiel?"]],
  first_mes: [["Atmosphäre","Stimmung, Umgebung, Sinneseindrücke"],["Handlung von {{char}}","Was tut die Figur sichtbar?"],["Gesprächsaufhänger","Frage, Problem, Angebot oder Konflikt"]],
  mes_example: [["Stimme und Wortwahl","Ton, Dialekt, Satzlänge, Redewendungen"],["Situationen und Emotionen","Welche Kontraste sollen vorkommen?"],["Vermeiden","Unpassende Floskeln, Stilbrüche, Slop"]],
  system_prompt: [["Perspektive und Format","Ich-/Er-Perspektive, Handlung, Dialog"],["Initiative und Tempo","Wie aktiv und ausführlich soll {{char}} sein?"],["Grenzen und Anti-Slop","Was darf das Modell nie tun?"]],
  creator_notes: [], post_history_instructions: []
};
const wizardDetails: Partial<Record<CoreEditableField, string[]>> = {};

async function openLibraryCard(bytes: Uint8Array, entry: LibraryEntry) {
  resetWizardState();
  const buffer = bytes.slice().buffer as ArrayBuffer;
  if (entry.format === "PNG") {
    const parsed = extractCard(buffer);
    if (!parsed) throw new Error("Die PNG-Datei enthält keine lesbare Character Card.");
    card = parsed;
    commitPortrait(buffer);
  } else {
    card = normalizeCard(JSON.parse(new TextDecoder().decode(bytes)));
    clearPortrait();
  }
  linkedPath = entry.path;
  linkedFormat = entry.format;
  score = localScore(card);
  resetAiInstruction();
  renderAll();
  syncLinkedButtons();
  saveDraft();
  toast(card.data.name + " aus SillyTavern geöffnet.");
}

async function currentBytes(format: "PNG" | "JSON"): Promise<Uint8Array> {
  const output = prepareCardForExport(card);
  if (format === "JSON") return new TextEncoder().encode(JSON.stringify(toV3Card(output), null, 2));
  const portrait = imageBuffer ?? await defaultPortraitBuffer();
  return new Uint8Array(await embedCard(portrait, output).arrayBuffer());
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
  if (!wizardMode) return;
  const done = wizardStep >= wizardSteps.length;
  $(".wizard-card").classList.toggle("hidden", done);
  $("#wizardDone").classList.toggle("hidden", !done);
  if (done) return;
  const step = wizardSteps[wizardStep];
  $("#wizardCount").textContent = "Schritt " + (wizardStep + 1) + " von " + wizardSteps.length;
  ($("#wizardBar") as HTMLElement).style.width = ((wizardStep + 1) / wizardSteps.length * 100) + "%";
  $("#wizardTitle").textContent = step.title;
  $("#wizardHelp").textContent = step.help;
  const prompts = wizardPrompts[step.field];
  const values = wizardDetails[step.field] ?? prompts.map(() => "");
  wizardDetails[step.field] = values;
  $("#wizardDetails").innerHTML = prompts.map(([label,placeholder], index) => `<label>${escapeHtml(label)}<textarea rows="3" data-wizard-detail="${index}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(values[index] ?? "")}</textarea><small class="wizard-prompt-hint">${escapeHtml(placeholder)}</small></label>`).join("");
  document.querySelectorAll<HTMLTextAreaElement>("[data-wizard-detail]").forEach(el => el.oninput = () => { values[Number(el.dataset.wizardDetail)] = el.value; });
  ($("#wizardNotes") as HTMLTextAreaElement).value = wizardDrafts[step.field] ?? "";
  $("#wizardCurrent").textContent = card.data[step.field] || "Noch leer";
  ($("#wizardBack") as HTMLButtonElement).disabled = wizardStep === 0;
  $("#wizardNext").textContent = wizardStep === wizardSteps.length - 1 ? "Abschließen →" : "Weiter →";
}

function wizardNotesForStep() {
  const step = wizardSteps[wizardStep];
  const prompts = wizardPrompts[step.field];
  const details = (wizardDetails[step.field] ?? []).map((value,index) => value.trim() ? prompts[index][0] + ": " + value.trim() : "").filter(Boolean);
  const free = ($("#wizardNotes") as HTMLTextAreaElement).value.trim();
  return [...details, free].filter(Boolean).join("\n");
}

function useWizardNotes() {
  const step = wizardSteps[wizardStep];
  const notes = wizardNotesForStep();
  wizardDrafts[step.field] = notes;
  if (notes) card.data[step.field] = notes;
  renderAll();
  renderWizard();
  changed();
  toast("Notizen in " + step.title + " übernommen.");
}

async function expandWizardStep() {
  const step = wizardSteps[wizardStep];
  const notes = wizardNotesForStep();
  wizardDrafts[step.field] = notes;
  wizardDetails[step.field] = wizardPrompts[step.field].map(() => "");
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
      nsfw: true,
      optimizationStrength: optimizeStrength
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
  } catch (error) { recordTechnicalError("wizard_" + step.field, error); toast(error instanceof Error ? error.message : String(error), true); }
  finally {
    timer.stop();
    ($("#wizardAi") as HTMLButtonElement).disabled = false;
  }
}

function selectTab(name: string) {
  document.querySelectorAll("[data-tab]").forEach(element => element.classList.toggle("active", (element as HTMLElement).dataset.tab === name));
  document.querySelectorAll(".tab-page").forEach(element => element.classList.toggle("active", element.id === "tab-" + name));
  if (name === "wizard") {
    if (!wizardMode) $("#wizardModeModal").classList.remove("hidden");
    else renderWizard();
  }
}

function chooseWizardMode(mode: "new" | "review") {
  if (mode === "new" && !confirm("Die aktuelle Karte wirklich durch eine neue Wizard-Karte ersetzen?")) return;
  resetWizardState();
  wizardMode = mode;
  if (mode === "new") {
    card = newCardWithDefaults();
    clearPortrait();
    linkedPath = null;
    linkedFormat = null;
    selected = new Set<EditableField>(["description", "personality", "scenario", "first_mes"]);
    resetAiInstruction();
    changed();
  } else {
    for (const step of wizardSteps) wizardDrafts[step.field] = card.data[step.field] || "";
  }
  $("#wizardModeModal").classList.add("hidden");
  score = localScore(card);
  renderAll();
  syncLinkedButtons();
  renderWizard();
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
  const notes = wizardNotesForStep();
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
$("#wizardModeBtn").onclick = () => $("#wizardModeModal").classList.remove("hidden");
$("#wizardReviewMode").onclick = () => chooseWizardMode("review");
$("#wizardNewMode").onclick = () => chooseWizardMode("new");
$("#closeWizardMode").onclick = () => { $("#wizardModeModal").classList.add("hidden"); if (!wizardMode) selectTab("fields"); };
$("#wizardModeModal").addEventListener("click", event => {
  if (event.target === $("#wizardModeModal")) { $("#wizardModeModal").classList.add("hidden"); if (!wizardMode) selectTab("fields"); }
});
$("#repoLink").onclick = async () => {
  try { await window.__TAURI__?.core.invoke("open_repository"); }
  catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
};
$("#uiLanguage").onchange = event => localStorage.setItem("uiLanguage", (event.target as HTMLSelectElement).value);
$("#defaultCreator").oninput = event => localStorage.setItem("defaultCreator", (event.target as HTMLInputElement).value);
$("#optimizeStrength").onchange = event => {
  optimizeStrength = (event.target as HTMLSelectElement).value as "gentle"|"balanced"|"strong";
  localStorage.setItem("optimizeStrength", optimizeStrength);
};
void loadBuildInfo();
window.addEventListener("error", event => recordTechnicalError("window_error", event.error));
window.addEventListener("unhandledrejection", event => recordTechnicalError("unhandled_promise", event.reason));
$("#settingsBtn").onclick = async () => {
  ($("#nsfwSetting") as HTMLInputElement).checked = nsfwEnabled;
  ($("#uiLanguage") as HTMLSelectElement).value = localStorage.getItem("uiLanguage") || "de";
  ($("#defaultCreator") as HTMLInputElement).value = localStorage.getItem("defaultCreator") || "";
  ($("#optimizeStrength") as HTMLSelectElement).value = optimizeStrength;
  $("#settingsModal").classList.remove("hidden");
  try { $("#errorLogPath").textContent = await window.__TAURI__?.core.invoke<string>("error_log_location") ?? "Nur in der Desktop-App verfügbar"; }
  catch { $("#errorLogPath").textContent = "Pfad konnte nicht ermittelt werden"; }
};
$("#closeSettings").onclick = () => $("#settingsModal").classList.add("hidden");
$("#settingsModal").addEventListener("click", event => { if (event.target === $("#settingsModal")) $("#settingsModal").classList.add("hidden"); });
$("#nsfwSetting").onchange = event => {
  nsfwEnabled = (event.target as HTMLInputElement).checked;
  localStorage.setItem("nsfwEnabled", String(nsfwEnabled));
};
