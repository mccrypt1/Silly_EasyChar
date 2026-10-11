# Silly EasyChar

Silly EasyChar is a private-first Windows desktop studio for creating and improving SillyTavern character cards. It runs locally, talks only to a local Ollama instance, and exports real Character Card V2/V3-compatible PNG files.

## Features

- Structured editor for the core Character Card V3 fields with V2 PNG compatibility
- JSON and PNG import/export (synchronized `chara` and `ccv3` PNG chunks)
- Explicit **JSON without image** export that retains compatible V3 asset metadata but never embeds portrait bytes
- Original portrait attachment without image processing
- Field-aware rewriting and translation through local Ollama
- NSFW switch that preserves consensual fictional adult content instead of silently sanitizing it
- Local and Ollama-assisted card grading
- Suggestions, alternate greetings, tags, metadata and embedded character lorebooks
- Automatic local draft saving; no cloud account or telemetry
- Field-by-field version comparison and selective restore, protected named backups, configurable deduplicated rotation, and session undo/redo
- External-file conflict detection, safe experiment copies, and a local recovery bin for removed SillyTavern cards
- Advanced offline V3 JSON editor that preserves unknown extension fields
- Editable token-saving previews with local token estimates and selected-text-only Ollama editing

## Requirements

- Windows 10/11 with WebView2
- [Ollama](https://ollama.com/) for AI features; editing and import/export work without it
- Node.js 20+ and Rust for development

## Development

```powershell
npm install
npm run desktop
```

Run tests and build the Windows installers:

```powershell
npm test
npm run package
```

Ollama defaults to `http://127.0.0.1:11434`. Install at least one capable instruct model, for example a recent Qwen, Mistral, or Gemma model that fits your hardware.

## Data and privacy

Character data is saved as a local WebView draft. AI requests are accepted only for `localhost`, `127.0.0.1`, or `::1`; the Rust backend rejects remote URLs. Exported files are created directly in the UI and no card data is uploaded.

Automatic and manual versions live below the application's local data directory in `versions`. Safely removed cards and their recovery manifests live in `removed-cards`. They are never sent to Ollama. The technical log contains only fixed operation/error codes, never prompts or card text.

## Format notes

PNG export embeds a clean V2 compatibility card in the standard `chara` text chunk and the preferred Character Card V3 object in `ccv3`. **JSON without image** exports V3 text only; standard asset declarations such as `ccdefault:` remain for importer compatibility, but no PNG or base64 image data is included. Import normalizes V1-style, V2, and V3 data into the V3 editor model while preserving known and unknown V3 properties.

## SillyTavern folder library

Use **Ordner koppeln** and choose the active SillyTavern character directory, commonly
`SillyTavern/data/<user>/characters`. Cards can be searched, favorited and opened without
starting SillyTavern. Changes are written back only after pressing **In SillyTavern speichern**.
Immediately before every overwrite, Silly EasyChar stores a private local backup. Identical states
are deduplicated; the configurable default keeps ten automatic versions, while named manual
backups are protected from rotation. **Versionen** compares every changed field and can restore
individual greetings, dialogue examples, metadata, lorebooks, portraits, extension data, or the
complete file.

If another program changes an opened file, saving stops and offers reload, comparison, an
experiment copy, or a deliberate overwrite. Deliberate overwrite first backs up the external
version. **Experimentkopie** always creates a uniquely named sibling file. **Aus ST entfernen**
places the card and a recovery manifest in the local bin; restoration never silently overwrites an
existing card.

Imported PNG/JSON cards and newly created cards remain independent until **Zum ST-Ordner** is used.

## Guided wizard

The Wizard tab covers name, description, personality, scenario, greeting, dialogue examples and
roleplay rules. Every step accepts rough ideas or bullet points; **Mit Ollama ausarbeiten** expands
them and still opens the editable before/after review before applying anything.

Token minimization starts with field and strength selection. The review shows estimated before and
after token counts plus typical usage (`Dauerhaft`, `Nur beim Start`, or `Bedingt`). These are
transparent model-independent estimates; the exact count depends on the Ollama model tokenizer.

## Undo, selected text, and raw V3 data

Use the toolbar arrows or `Ctrl+Z` / `Ctrl+Y` for up to 100 card states in the current session.
Selecting text in a character field and choosing **Nur markierten Text bearbeiten** sends only that
passage plus limited field context to Ollama. The editable proposal is applied only if the original
field has not changed in the meantime.

**Rohdaten** opens the bundled offline CodeMirror editor with JSON highlighting, search,
formatting, and validation. Invalid JSON cannot be applied. Unknown V3 properties at card, data,
lorebook, and lore-entry level survive normal editing and export.

## Credits and independence

Silly EasyChar is maintained by [mccrypt1](https://github.com/mccrypt1/Silly_EasyChar). Its safer
proposal-review and version-comparison workflow was independently implemented with inspiration
from [Marinara Engine by Pasta-Devs](https://github.com/Pasta-Devs/Marinara-Engine). Silly EasyChar
is an independent project and is not official, endorsed, certified, or supported by Pasta-Devs.
No Marinara Engine source code is included. See [CREDITS.md](CREDITS.md) for dependencies and
attribution.

## License

Copyright (c) 2026 mccrypt1

Silly EasyChar is free to use, modify and redistribute. When redistributing the project or
substantial portions of it, keep the copyright notice and this permission statement. Third-party
dependencies and separately credited projects retain their own licenses; see [CREDITS.md](CREDITS.md).

The complete project notice is also available in [LICENSE](LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests. By contributing,
you agree that your contribution may be used, modified and redistributed under the same project
terms unless you state otherwise in the contribution.
