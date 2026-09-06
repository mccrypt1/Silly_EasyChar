# Changelog

All notable changes to Silly EasyChar are documented here. Each release lists English notes first, followed by the German translation.

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

