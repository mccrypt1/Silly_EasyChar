import "./style.css";
import { emptyCard, localScore, normalizeCard, normalizeLoreEntry } from "./card";
import { embedCard, extractCard, imageAsPng } from "./png";
import { models, runAi } from "./ai";
import type { AiResult, CharacterCard, EditableField, ScoreResult } from "./types";

const textFields: { key: EditableField; label: string; rows: number; hint: string }[] = [
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
let activeField: EditableField = "description";
let selected = new Set<EditableField>(["description", "personality", "scenario", "first_mes"]);
let score: ScoreResult = localScore(card);
let aiBusy = false;
let statusTimer = 0;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><div class="brand-mark">S</div><div><strong>Silly EasyChar</strong><small>Offline Character Studio</small></div></div>
    <div class="top-actions">
      <button id="newBtn" class="ghost">＋ Neu</button><button id="importBtn" class="ghost">↥ Import</button>
      <button id="jsonBtn" class="ghost">JSON exportieren</button><button id="pngBtn" class="primary">PNG exportieren</button>
    </div>
  </header>
  <main class="workspace">
    <aside class="left-panel">
      <section class="portrait-card">
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
      <nav class="tabs"><button data-tab="fields" class="active">Charakter</button><button data-tab="extras">Extras</button><button data-tab="lore">Lorebook</button><span id="saveState">Lokal gespeichert</span></nav>
      <div id="tab-fields" class="tab-page active"><div id="fields" class="fields"></div></div>
      <div id="tab-extras" class="tab-page"><div class="extras-grid">
        <label>Tags (durch Komma getrennt)<input id="tags" /></label><label>Creator<input id="creator" /></label><label>Version<input id="version" /></label>
        <div class="full"><div class="field-head"><label>Alternative Begrüßungen</label><button id="addGreeting" class="mini">＋ Hinzufügen</button></div><div id="greetings"></div></div>
      </div></div>
      <div id="tab-lore" class="tab-page"><div class="lore-head"><div><h2>Character Lorebook</h2><p>Schlüsselwortgesteuerte Details für Orte, Figuren, Regeln und Gegenstände.</p></div><button id="addLore" class="ghost">＋ Eintrag</button></div><div id="loreEntries"></div></div>
    </section>
    <aside class="ai-panel">
      <div class="ai-head"><div class="ai-avatar">✦</div><div><strong>Lokaler Schreibassistent</strong><small>Ollama · Daten bleiben auf deinem PC</small></div></div>
      <div class="quick-actions"><button data-ai="suggest">Ideen</button><button data-ai="grade">Bewerten</button><button data-ai="translate">Übersetzen</button><button data-ai="lorebook">Lorebook</button></div>
      <div class="selection"><div class="field-head"><b>Felder für Bearbeitung</b><button id="allFields" class="link">alle</button></div><div id="fieldChecks"></div></div>
      <label class="instruction-label">Was soll geändert werden?</label>
      <textarea id="instruction" rows="8" placeholder="z. B. Informationen auf passende Felder verteilen, auf Deutsch übersetzen und die Stimme natürlicher machen …"></textarea>
      <button id="editAi" class="primary wide">✦ Ausgewählte Felder bearbeiten</button>
      <div id="aiOutput" class="ai-output"><div class="empty-state"><span>✦</span><p>Wähle Felder und beschreibe deine Änderung – oder nutze eine Schnellaktion.</p></div></div>
    </aside>
  </main>
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
    el.addEventListener("focus", () => { activeField = el.dataset.field as EditableField; document.querySelectorAll(".field").forEach(n => n.classList.toggle("focused", (n as HTMLElement).dataset.key === activeField)); });
    el.addEventListener("input", () => { card.data[el.dataset.field as EditableField] = el.value; el.closest(".field")!.querySelector("span")!.textContent = `${el.value.length} Zeichen`; changed(); });
  });
}
function renderChecks() {
  $("#fieldChecks").innerHTML = textFields.slice(0, 6).map(f => `<label class="check"><input type="checkbox" data-check="${f.key}" ${selected.has(f.key) ? "checked" : ""}/><span>${f.label}</span></label>`).join("");
  document.querySelectorAll<HTMLInputElement>("[data-check]").forEach(c => c.onchange = () => { const k = c.dataset.check as EditableField; c.checked ? selected.add(k) : selected.delete(k); });
}
function renderExtras() {
  ($("#tags") as HTMLInputElement).value = card.data.tags.join(", "); ($("#creator") as HTMLInputElement).value = card.data.creator; ($("#version") as HTMLInputElement).value = card.data.character_version;
  $("#greetings").innerHTML = card.data.alternate_greetings.map((g, i) => `<div class="repeat"><textarea rows="5" data-greeting="${i}">${escapeHtml(g)}</textarea><button data-remove-greeting="${i}">×</button></div>`).join("") || `<p class="muted">Noch keine alternativen Begrüßungen.</p>`;
  document.querySelectorAll<HTMLTextAreaElement>("[data-greeting]").forEach(el => el.oninput = () => { card.data.alternate_greetings[Number(el.dataset.greeting)] = el.value; changed(); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-greeting]").forEach(el => el.onclick = () => { card.data.alternate_greetings.splice(Number(el.dataset.removeGreeting), 1); renderExtras(); changed(); });
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
function download(blob: Blob, name: string) { const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name.replace(/[\\/:*?"<>|]/g,"_"); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
async function importFile(file: File) {
  if (file.name.toLowerCase().endsWith(".json")) { card=normalizeCard(JSON.parse(await file.text())); }
  else { const buffer=await file.arrayBuffer(); const found=extractCard(buffer); if (!found) throw new Error("Dieses PNG enthält keine Character-Card-Metadaten."); card=found; imageBuffer=buffer; if(imageUrl)URL.revokeObjectURL(imageUrl); imageUrl=URL.createObjectURL(file); }
  score=localScore(card); renderAll(); saveDraft(); toast(`${card.data.name} importiert.`);
}
async function ai(action: "edit"|"translate"|"suggest"|"grade"|"lorebook") {
  if(aiBusy)return; aiBusy=true; document.body.classList.add("busy"); $("#aiOutput").innerHTML=`<div class="thinking"><i></i><p>Ollama arbeitet lokal …</p></div>`;
  try {
    const result=await runAi({ baseUrl: $("#ollamaUrl") instanceof HTMLInputElement ? ($("#ollamaUrl") as HTMLInputElement).value : "", model: ($("#model") as HTMLSelectElement).value, action, card, selected:[...selected], instruction:($(`#instruction`) as HTMLTextAreaElement).value, language:($(`#language`) as HTMLSelectElement).value, nsfw:($(`#nsfw`) as HTMLInputElement).checked });
    applyAiResult(result, action);
  } catch(e){ $("#aiOutput").innerHTML=`<div class="error"><b>Ollama-Fehler</b><p>${escapeHtml(e instanceof Error?e.message:String(e))}</p><small>Läuft Ollama und ist ein Modell installiert?</small></div>`; toast("KI-Aktion fehlgeschlagen.",true); }
  finally { aiBusy=false; document.body.classList.remove("busy"); }
}
function applyAiResult(r: AiResult, action: string) {
  if(r.fields){ for(const [k,v] of Object.entries(r.fields)) if(typeof v==="string" && selected.has(k as EditableField)) (card.data as any)[k]=v; renderFields(); changed(); }
  if(r.score){ score=r.score; renderScore(r.score); }
  if(r.lorebook?.entries){ const list=Object.entries(r.lorebook.entries).sort(([a],[b])=>Number(a)-Number(b)).map(([,e],i)=>normalizeLoreEntry(e,i)); card.data.character_book={name:`${card.data.name} Lorebook`,description:"Mit Silly EasyChar und Ollama erstellt",entries:list}; renderLore(); changed(); }
  const items=r.suggestions?.map(x=>`<li>${escapeHtml(x)}</li>`).join("")||"";
  $("#aiOutput").innerHTML=`<div class="result"><b>✓ ${action==="grade"?"Bewertung abgeschlossen":"Ergebnis übernommen"}</b>${r.explanation?`<p>${escapeHtml(r.explanation)}</p>`:""}${items?`<ol>${items}</ol>`:""}${r.score?`<p class="big-result">${r.score.total}<small>/100</small></p>`:""}${r.lorebook?`<p>${Object.keys(r.lorebook.entries).length} Lorebook-Einträge erstellt.</p>`:""}</div>`;
}

$("#newBtn").onclick=()=>{if(!confirm("Aktuelle Karte durch eine neue ersetzen? Der letzte Stand bleibt nur im lokalen Entwurf."))return; card=emptyCard(); imageBuffer=null;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl="";score=localScore(card);renderAll();changed();};
$("#importBtn").onclick=()=>$("#fileInput").click(); $("#fileInput").onchange=async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)try{await importFile(f);}catch(err){toast(err instanceof Error?err.message:String(err),true);}};
$("#imageBtn").onclick=()=>$("#imageInput").click(); $("#portrait").onclick=()=>$("#imageInput").click(); $("#imageInput").onchange=async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;imageBuffer=await imageAsPng(f);if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(new Blob([imageBuffer],{type:"image/png"}));renderPortrait();toast("Portrait übernommen.");};
$("#jsonBtn").onclick=()=>download(new Blob([JSON.stringify(card,null,2)],{type:"application/json"}),`${card.data.name||"character"}.json`);
$("#pngBtn").onclick=()=>{if(!imageBuffer){toast("Bitte zuerst ein Portrait wählen.",true);return;}download(embedCard(imageBuffer,card),`${card.data.name||"character"}.png`);toast("Character-Card-PNG erstellt.");};
$("#refreshModels").onclick=async()=>{const url=($(`#ollamaUrl`) as HTMLInputElement).value;localStorage.setItem("ollamaUrl",url);const sel=$(`#model`) as HTMLSelectElement;sel.innerHTML=`<option>Lädt …</option>`;try{const list=await models(url);sel.innerHTML=list.map(m=>`<option>${escapeHtml(m)}</option>`).join("")||`<option value="">Keine Modelle gefunden</option>`;const last=localStorage.getItem("model");if(last&&list.includes(last))sel.value=last;toast(`${list.length} Ollama-Modelle gefunden.`);}catch(e){sel.innerHTML=`<option value="">Ollama nicht erreichbar</option>`;toast(e instanceof Error?e.message:String(e),true);}};
$("#model").onchange=e=>localStorage.setItem("model",(e.target as HTMLSelectElement).value); $("#allFields").onclick=()=>{selected=new Set(textFields.slice(0,6).map(x=>x.key));renderChecks();};
$("#editAi").onclick=()=>ai("edit"); document.querySelectorAll<HTMLButtonElement>("[data-ai]").forEach(b=>b.onclick=()=>ai(b.dataset.ai as any));
$("#addGreeting").onclick=()=>{card.data.alternate_greetings.push("");renderExtras();changed();};
$("#addLore").onclick=()=>{if(!card.data.character_book)card.data.character_book={name:`${card.data.name} Lorebook`,entries:[]};const i=card.data.character_book.entries.length;card.data.character_book.entries.push(normalizeLoreEntry({},i));renderLore();changed();};
[$("#tags"),$("#creator"),$("#version")].forEach(el=>el.addEventListener("input",()=>{card.data.tags=($(`#tags`) as HTMLInputElement).value.split(",").map(x=>x.trim()).filter(Boolean);card.data.creator=($(`#creator`) as HTMLInputElement).value;card.data.character_version=($(`#version`) as HTMLInputElement).value;changed();}));
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tab-page").forEach(x=>x.classList.toggle("active",x.id===`tab-${b.dataset.tab}`));});
window.addEventListener("dragover",e=>e.preventDefault());window.addEventListener("drop",async e=>{e.preventDefault();const f=e.dataTransfer?.files[0];if(f)try{await importFile(f);}catch(err){toast(err instanceof Error?err.message:String(err),true);}});
renderAll(); setTimeout(()=>$("#refreshModels").click(),150);
