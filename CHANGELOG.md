# Changelog

All notable changes to Silly EasyChar are documented here. Each release lists English notes first, followed by the German translation.

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

