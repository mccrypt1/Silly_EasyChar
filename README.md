# Silly EasyChar

Silly EasyChar is a private-first Windows desktop studio for creating and improving SillyTavern character cards. It runs locally, talks only to a local Ollama instance, and exports real Character Card V2/V3-compatible PNG files.

## Features

- Structured editor for the core Character Card V3 fields with V2 PNG compatibility
- JSON and PNG import/export (synchronized `chara` and `ccv3` PNG chunks)
- Original portrait attachment without image processing
- Field-aware rewriting and translation through local Ollama
- NSFW switch that preserves consensual fictional adult content instead of silently sanitizing it
- Local and Ollama-assisted card grading
- Suggestions, alternate greetings, tags, metadata and embedded character lorebooks
- Automatic local draft saving; no cloud account or telemetry

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

## Format notes

PNG export embeds a clean V2 compatibility card in the standard `chara` text chunk and the preferred Character Card V3 object in `ccv3`. JSON export uses V3. Import normalizes V1-style, V2, and V3 data into the V3 editor model while preserving supported fields.

## Roadmap

- Named local library with versions and comparison view
- Undo/redo for individual AI changes
- Guided multi-step character and lorebook wizards
- Portable Windows build and optional application updates
- More granular lorebook and extension-field editing


## SillyTavern folder library

Use **Ordner koppeln** and choose the active SillyTavern character directory, commonly
`SillyTavern/data/<user>/characters`. Cards can be searched, favorited and opened without
starting SillyTavern. Changes are written back only after pressing **In SillyTavern speichern**.
Immediately before every overwrite, Silly EasyChar stores a private local backup and retains the
three newest versions for that card.

Imported PNG/JSON cards and newly created cards remain independent until **Zum ST-Ordner** is used.

## Guided wizard

The Wizard tab covers name, description, personality, scenario, greeting, dialogue examples and
roleplay rules. Every step accepts rough ideas or bullet points; **Mit Ollama ausarbeiten** expands
