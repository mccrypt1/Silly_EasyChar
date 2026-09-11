# Changelog

All notable changes to Silly EasyChar are documented here. Each release lists English notes first, followed by the German translation.

## v0.3.6

### English

- Changed isolated Ollama greeting improvements into editable proposals: the original remains untouched until acceptance, the generated draft can be reset, and the original can be restored before saving.
- Added protected, named manual card backups that are excluded from the three-item automatic-version rotation.
- Added safe removal of linked cards from the SillyTavern folder after confirmation. The original file is copied to the app recovery folder before removal, while the open card remains available as a local draft.
- Added editable names for previous automatic versions and manual backups while retaining their timestamp, size, and type.
- Replaced immediate token minimization with a two-step wizard for field selection and optimization strength; the existing before/after review still controls final application.

### Deutsch

- Isolierte Ollama-Verbesserungen für Begrüßungen erscheinen nun als bearbeitbare Vorschläge: Das Original bleibt bis zur Übernahme unverändert, der KI-Entwurf kann zurückgesetzt und der ursprüngliche Text vor dem Speichern wiederhergestellt werden.
- Geschützte, benennbare manuelle Kartensicherungen ergänzt; sie sind von der Rotation der drei automatischen Versionen ausgenommen.
- Verknüpfte Karten können nach einer Sicherheitsabfrage sicher aus dem SillyTavern-Ordner entfernt werden. Vor dem Entfernen wird die Originaldatei in den Wiederherstellungsordner der App kopiert, während die geöffnete Karte als lokaler Entwurf erhalten bleibt.
- Frühere automatische Versionen und manuelle Sicherungen können frei benannt werden; Zeitpunkt, Größe und Typ bleiben weiterhin sichtbar.
- Die sofortige Token-Minimierung wurde durch einen zweistufigen Wizard für Feldauswahl und Kürzungsstärke ersetzt; die endgültige Übernahme bleibt durch den bestehenden Vorher/Nachher-Vergleich kontrolliert.


## v0.3.5

### English

- Reordered both the Character editor and AI field selection to show Alternate Greetings, Message Examples, Creator Notes, System Prompt, and Post-History Instructions in that order.
- Split Message Examples into independent `<START>` editors and AI selections while preserving the standard combined `mes_example` field in imported and exported character cards.
- Added an isolated Ollama title suggestion to the greeting-library editor. It receives only the greeting text, describes the scene without source-card references, and is hard-limited to 10 words.

### Deutsch

- Character-Editor und KI-Feldauswahl zeigen nun Alternative Begrüßungen, Dialogbeispiele, Creator Notes, System Prompt und Post-History Instructions in dieser Reihenfolge.
- Dialogbeispiele werden als unabhängige `<START>`-Editoren und KI-Auswahlen dargestellt; beim Import und Export bleibt das standardkonforme zusammengefasste Feld `mes_example` erhalten.
- Der Editor der Begrüßungsbibliothek besitzt nun einen isolierten Ollama-Titelvorschlag. An Ollama wird ausschließlich der Begrüßungstext übermittelt; der Titel beschreibt die Szene ohne Rückschluss auf die Quellkarte und ist fest auf zehn Wörter begrenzt.


## v0.3.4

### English

- Reordered the Character editor so Alternate Greetings now appear directly after Message Examples and before Creator Notes, System Prompt, and Post-History Instructions.

### Deutsch

- Die Reihenfolge im Character-Editor lautet nun: Dialogbeispiele, Alternative Begrüßungen, Creator Notes, System Prompt und Post-History Instructions.


## v0.3.3

### English

- Added a confirmation screen for card-to-library greeting imports so individual greetings can be selected and titled before import.
- Stopped using source character names as automatically imported greeting titles.
- Added a full library-entry editor for reading and changing both title and greeting text.
- Added actions in the entry editor to save, delete, or add the currently edited greeting to the open card.
- Added isolated Ollama improvement for library greetings; only the selected greeting and its local instruction are sent, with no character-card context.

### Deutsch

- Beim Kartenimport in die Begrüßungsbibliothek erscheint nun eine Auswahl, in der einzelne Begrüßungen bestätigt und vor dem Import benannt werden können.
- Namen der Quellcharaktere werden nicht mehr automatisch als Begrüßungstitel übernommen.
- Bibliothekseinträge lassen sich in einer vollständigen Ansicht lesen sowie in Titel und Text bearbeiten.
- Im Editor kann die bearbeitete Begrüßung gespeichert, gelöscht oder zur geöffneten Karte hinzugefügt werden.
- Die Ollama-Verbesserung für Bibliotheksbegrüßungen arbeitet isoliert: Übermittelt werden ausschließlich die gewählte Begrüßung und ihre lokale Anweisung, keinerlei Character-Card-Kontext.


## v0.3.2

### English

- Added direct JSON/PNG character-card import inside the alternate-greeting library.
- Imported greetings are stored persistently in the offline library, labeled with their source card, and deduplicated without changing the currently open card.

### Deutsch

- Die Bibliothek für alternative Begrüßungen kann Begrüßungen jetzt direkt aus JSON- und PNG-Character-Cards importieren.
- Importierte Begrüßungen werden dauerhaft offline gespeichert, mit ihrer Quellkarte beschriftet und ohne Duplikate übernommen; die aktuell geöffnete Karte bleibt dabei unverändert.


## v0.3.1

### English

- Added an expandable, searchable offline library for reusable alternate greetings, with manual entries and capture from the current card.
- Added one-click import of alternate greetings from another JSON or PNG character card.
- Added selective component import for text fields, alternate greetings, tags, creator metadata, talkativeness, and Lorebook entries.
- Added configurable gentle, balanced, and strong token-reduction profiles based on field-specific compactness targets.
- Enforced a hard 650-character System Prompt limit with an automatic compaction retry, plus a 350-character Post-History limit.
- Tightened Lorebook generation to concise, standalone entries that are normally 1–3 sentences or roughly 20–60 tokens.
- Added a persistent default creator setting for newly created cards.
- Added clear highlighted borders around every field currently selected for Ollama editing.
- Fixed stale dynamic greeting selections that could create or edit a nonexistent example after importing another card.
- Added explicit Wizard modes for creating a new card or reviewing the currently loaded card step by step with its existing content prefilled.

### Deutsch

- Alternative Begrüßungen lassen sich jetzt mit einem Klick aus einer anderen JSON- oder PNG-Character-Card importieren.
- Eine erweiterbare, durchsuchbare Offline-Bibliothek speichert wiederverwendbare alternative Begrüßungen manuell oder direkt aus der aktuellen Karte.
- Kartenbestandteile wie Textfelder, alternative Begrüßungen, Tags, Creator-Metadaten, Talkativeness und Lorebook-Einträge können gezielt importiert werden.
- Für die Token-Reduzierung gibt es nun die einstellbaren Stärken sanft, ausgewogen und stark mit feldspezifischen Zielgrößen.
- System Prompts sind fest auf 650 Zeichen begrenzt und werden bei Überschreitung automatisch erneut komprimiert; Post-History Instructions sind auf 350 Zeichen begrenzt.
- Lorebook-Einträge werden kompakt und eigenständig erzeugt, normalerweise mit 1–3 Sätzen beziehungsweise ungefähr 20–60 Tokens.
- In den Einstellungen kann ein dauerhafter Standard-Creator für neue Karten festgelegt werden.
- Alle zur Ollama-Bearbeitung ausgewählten Felder werden jetzt mit einem deutlichen Rahmen hervorgehoben.
- Veraltete dynamische Begrüßungsauswahlen werden bereinigt, damit nach einem Kartenimport keine nicht vorhandenen Beispiele erzeugt oder bearbeitet werden.
- Der Wizard bietet nun ausdrücklich die Modi „Neue Karte“ und „Vorhandene Karte prüfen“; vorhandene Inhalte werden beim schrittweisen Prüfen vorausgefüllt.

## v0.3.0

### English

- Added persistent helper cards below every structured Wizard input so examples remain visible while typing.
- Changed “Use notes” to collect structured Wizard details into the large notes field before applying them.
- Added a bordered settings button between the brand and watermark, with prepared UI language selection, a persistent NSFW switch, and integrated help.
- Added privacy-preserving technical error logs containing only timestamps, app versions, operation names, and sanitized error categories.
- Hardened imported-card and Ollama response normalization against missing, null, or incorrectly shaped fields.
- Added token optimization for individual fields and multiple selected fields, always using the existing review dialog before applying changes.
- Added field-specific compaction rules for descriptions, personalities, scenarios, example messages, system prompts, post-history instructions, greetings, and first messages.
- Reduced Ollama context for field-level editing, translation, and optimization by sending the full target field plus a bounded consistency context instead of the entire card.

### Deutsch

- Unter jeder strukturierten Wizard-Eingabe bleibt nun eine Hinweiskarte sichtbar, sodass Beispiele beim Tippen nicht verschwinden.
- „Notizen übernehmen“ sammelt strukturierte Wizard-Angaben jetzt zuerst im großen Notizenfeld und übernimmt sie anschließend.
- Zwischen Marke und Wasserzeichen befindet sich ein umrandeter Einstellungsbutton mit vorbereiteter Oberflächensprache, gespeichertem NSFW-Schalter und integrierter Hilfe.
- Datenschutzfreundliche technische Fehlerlogs enthalten ausschließlich Zeitpunkt, Programmversion, Vorgangsname und bereinigte Fehlerkategorie.
- Importierte Karten und Ollama-Antworten werden robuster gegen fehlende, leere oder falsch geformte Felder normalisiert.
- Token-Optimierung ist für einzelne Felder und mehrere ausgewählte Felder verfügbar; vor der Übernahme erscheint immer das bestehende Prüffenster.
- Feldspezifische Kürzungsregeln gelten für Beschreibung, Persönlichkeit, Szenario, Dialogbeispiele, System Prompt, Post-History Instructions, Begrüßungen und erste Nachrichten.
- Für feldweise Bearbeitung, Übersetzung und Optimierung erhält Ollama das vollständige Zielfeld plus begrenzten Konsistenzkontext statt der gesamten Karte.

## v0.2.9

### English

- Moved the guided Character Card wizard into the full-width central workspace and added three structured idea fields to every step.
- Enlarged the primary card editor and typography for more comfortable long-form editing.
- Replaced the small sidebar loading indicator with a larger centered progress card while retaining the timer and rotating loading messages.
- Expanded Lorebook editing with named SillyTavern positions, secondary keys, activation probability, chat depth, selective activation, and recursion controls.
- Tuned Lorebook generation so Ollama chooses position, order, activation, probability, and recursion settings according to each entry instead of applying generic defaults.
- Preserved the expanded Lorebook settings in V3 JSON and PNG exports.

### Deutsch

- Der geführte Character-Card-Wizard befindet sich nun in der breiten mittleren Arbeitsfläche und bietet pro Schritt drei strukturierte Ideenfelder.
- Der zentrale Karteneditor und seine Schrift wurden für längere Texte vergrößert.
- Die kleine Ladeanzeige in der Seitenleiste wurde durch ein größeres zentriertes Fortschrittsfenster ersetzt; Stoppuhr und wechselnde Ladesprüche bleiben erhalten.
- Der Lorebook-Editor enthält jetzt benannte SillyTavern-Positionen, Sekundärschlüssel, Aktivierungswahrscheinlichkeit, Chat-Tiefe, selektive Aktivierung und Rekursionssteuerung.
- Die Lorebook-Generierung wählt Position, Reihenfolge, Aktivierung, Wahrscheinlichkeit und Rekursion nun passend je Eintrag statt mit pauschalen Standardwerten.
- Die erweiterten Lorebook-Einstellungen bleiben beim V3-JSON- und PNG-Export erhalten.

## v0.2.8

### English

- Moved the red version and commit line below the Offline Character Studio subtitle.
- Shifted the complete brand block, including its logo, two pixels upward to preserve comfortable spacing in the header.

### Deutsch

- Die rote Versions- und Commit-Zeile unter den Untertitel Offline Character Studio verschoben.
- Den gesamten Markenblock einschließlich Logo um zwei Pixel nach oben versetzt, damit im Kopfbereich angenehme Abstände erhalten bleiben.

## v0.2.7

### English

- Embedded the default portrait directly in the application and decoded it without a WebView fetch, fixing failed PNG exports when no custom portrait is selected.
- Increased the mccrypt1 watermark and version/commit text by one pixel while keeping both visibly smaller than the application title.

### Deutsch

- Das Standardportrait ist nun direkt in die Anwendung eingebettet und wird ohne WebView-Fetch dekodiert; dadurch funktionieren PNG-Exporte wieder, wenn kein eigenes Portrait ausgewählt wurde.
- Das mccrypt1-Wasserzeichen und der Version-/Commit-Text wurden um jeweils einen Pixel vergrößert, bleiben aber sichtbar kleiner als der Anwendungstitel.

## v0.2.6

### English

- Persisted the current card portrait in the local app database and restored it with the last editing draft after restarting; the default portrait is now used only when no portrait exists.
- Kept NSFW-aware Ollama processing permanently enabled while hiding the toggle from the interface.
- Changed long-running Ollama timers to minutes and seconds after 180 seconds.
- Added twenty ironic loading hallucinations to both AI progress indicators, rotating randomly every 20–35 seconds without interrupting the spinner.

### Deutsch

- Das Portrait der aktuellen Karte wird in der lokalen App-Datenbank gespeichert und nach einem Neustart zusammen mit dem letzten Bearbeitungsentwurf wiederhergestellt; das Standardportrait erscheint nur noch, wenn kein Portrait vorhanden ist.
- Die NSFW-bewusste Ollama-Verarbeitung bleibt dauerhaft aktiviert, während der Umschalter aus der Oberfläche ausgeblendet wurde.
- Lange Ollama-Laufzeiten werden ab 180 Sekunden in Minuten und Sekunden angezeigt.
- Zwanzig ironische Ladehalluzinationen für beide KI-Fortschrittsanzeigen ergänzt; sie wechseln zufällig alle 20–35 Sekunden, ohne den Ladekreis zu unterbrechen.

## v0.2.5

### English

- Added a bundled default portrait so cards without a selected image can still be saved and exported as valid Character Card PNG files.
- Added fully local portrait cropping with a 4:5 frame, drag positioning, zoom, an original-image option, and 768 × 960 PNG output.
- Fixed loading-spinner stutter by keeping the animation element intact while its elapsed-seconds counter updates.
- Cleared the AI editing instruction and previous result whenever a new, imported, or SillyTavern-library card is opened.
- Added System Prompt and Post-History Instructions to the individually selectable Ollama editing fields.
- Added the SillyTavern Talkativeness setting as a 0–100% slider, stored in the compatible card extension field.

### Deutsch

- Ein eingebautes Standardportrait ergänzt, damit Karten ohne ausgewähltes Bild trotzdem als gültige Character-Card-PNG gespeichert und exportiert werden können.
- Vollständig lokalen Portraitzuschnitt mit 4:5-Rahmen, Verschieben, Zoom, Originalbild-Option und einer PNG-Ausgabe mit 768 × 960 Pixeln hinzugefügt.
- Ruckeln des Ladekreises behoben: Das Animationselement bleibt nun bestehen, während die verstrichenen Sekunden aktualisiert werden.
- KI-Bearbeitungsanweisung und vorheriges Ergebnis werden beim Öffnen einer neuen, importierten oder aus der SillyTavern-Bibliothek geladenen Karte geleert.
- System Prompt und Post-History Instructions zu den einzeln auswählbaren Ollama-Bearbeitungsfeldern hinzugefügt.
- Die SillyTavern-Einstellung Talkativeness als 0–100-%-Regler ergänzt und im kompatiblen Extension-Feld der Karte gespeichert.

## v0.2.4

### English

- Replaced WebView downloads with native Windows save dialogs so JSON and PNG exports are reliably written to disk.
- Made the `mccrypt1` watermark open the repository through Windows and added the app version plus associated short Git commit in red.
- Split multi-field edit and translation jobs into sequential per-field Ollama requests so every selected field is processed.
- Preserved each existing field's source language during editing unless translation is explicitly requested.
- Added animated loading indicators with live elapsed-second stopwatches to both the writing assistant and Wizard.
- Added a review window showing before/after text for every generated field, with editable suggestions and individual acceptance controls.
- Enforced SillyTavern dialogue examples as 3–5 separate `<START>` blocks using exact `{{user}}:` and `{{char}}:` prefixes.

### Deutsch

- WebView-Downloads durch native Windows-Speicherdialoge ersetzt, damit JSON- und PNG-Exporte zuverlässig auf die Festplatte geschrieben werden.
- Das `mccrypt1`-Wasserzeichen öffnet das Repository jetzt über Windows; daneben stehen App-Version und zugehöriger kurzer Git-Commit in Rot.
- Mehrfeld-Bearbeitungen und Übersetzungen werden in einzelne aufeinanderfolgende Ollama-Aufgaben zerlegt, damit jedes ausgewählte Feld bearbeitet wird.
- Bei normalen Bearbeitungen bleibt die vorhandene Sprache jedes Feldes erhalten, solange keine Übersetzung ausdrücklich verlangt wird.
- Animierte Ladeanzeigen mit sekundengenauer laufender Stoppuhr für Schreibassistent und Wizard hinzugefügt.
- Neues Prüffenster mit Vorher-/Nachher-Ansicht, bearbeitbaren Vorschlägen und einzelner Auswahl vor der endgültigen Übernahme ergänzt.
- Dialogbeispiele werden als 3–5 getrennte `<START>`-Blöcke mit den exakten Präfixen `{{user}}:` und `{{char}}:` angefordert.

## v0.2.3

### English

- Added a clickable `mccrypt1` watermark next to the Silly EasyChar title, linking to the project repository.
- Added one independently selectable AI editing field for every alternate greeting.
- Added an automatic targeted second pass whenever generated fields are too short or alternate greetings omit `{{user}}`.
- Appended `Crafted / Reforged / Translated with mccrypt1´s Silly EasyChar Studio` to Creator Notes during export and SillyTavern saves without modifying the editable source text.
- Corrected German grammar around `{{user}}` and `{{char}}` by removing articles and expanding contracted prepositions before name-like placeholders.
- Added the recommended 0–900 injection-layer architecture to AI field-placement guidance.
- Improved Character Card V3 output with required group greetings, V3 lorebook field projection, default portrait asset metadata, creation/modification dates, and a clean V2 compatibility chunk in PNG exports.

### Deutsch

- Klickbares `mccrypt1`-Wasserzeichen neben dem Silly-EasyChar-Titel hinzugefügt, das zum Projekt-Repository führt.
- Für jede alternative Begrüßung ein separat auswählbares KI-Bearbeitungsfeld hinzugefügt.
- `Crafted / Reforged / Translated with mccrypt1´s Silly EasyChar Studio` wird beim Export und Speichern in SillyTavern hinter den Creator Notes ergänzt, ohne den bearbeitbaren Ausgangstext zu verändern.
- Automatischer gezielter zweiter Durchlauf, wenn erzeugte Felder zu kurz bleiben oder alternative Begrüßungen `{{user}}` auslassen.
- Deutsche Grammatik um `{{user}}` und `{{char}}` korrigiert: Artikel werden entfernt und verschmolzene Präpositionen vor den namensartigen Platzhaltern aufgelöst.
- Die empfohlene Injection-Layer-Architektur von 0–900 wurde in die KI-Vorgaben zur Feldzuordnung aufgenommen.
- Character-Card-V3-Ausgabe um verpflichtende Gruppenbegrüßungen, V3-Lorebook-Feldzuordnung, Standard-Portraitmetadaten, Erstellungs-/Änderungsdatum und einen sauberen V2-Kompatibilitätsblock im PNG-Export erweitert.

