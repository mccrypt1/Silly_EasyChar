export interface LibraryEntry {
  path: string;
  fileName: string;
  name: string;
  modified: number;
  size: number;
  format: "PNG" | "JSON";
}

export interface VersionInfo {
  id: string;
  created: number;
  size: number;
  manual: boolean;
  label?: string;
  contentHash: string;
}

export interface FileFingerprint { modified: number; size: number; sha256: string }
export interface RecoveryEntry { id: string; cardName: string; fileName: string; originalPath?: string; format: "PNG"|"JSON"; removedAt: number; size: number; legacy: boolean }

const invoke = <T>(command: string, args?: Record<string, unknown>) =>
  window.__TAURI__!.core.invoke<T>(command, args);

export function parseFavoritePaths(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export class CardLibrary {
  folder = localStorage.getItem("characterFolder") || "";
  cards: LibraryEntry[] = [];
  favorites = new Set<string>(parseFavoritePaths(localStorage.getItem("favorites")));
  private host: HTMLElement | null = null;
  private query = "";
  private favoritesOnly = false;

  constructor(private onOpen: (bytes: Uint8Array, entry: LibraryEntry, fingerprint: FileFingerprint) => Promise<void>) {}

  mount(host: HTMLElement) {
    this.host = host;
    this.render();
    if (this.folder) void this.refresh();
  }

  async connect() {
    try {
      const folder = await invoke<string | null>("choose_character_folder");
      if (!folder) return;
      this.folder = folder;
      localStorage.setItem("characterFolder", folder);
      await this.refresh();
      window.dispatchEvent(new Event("library-folder-changed"));
    } catch (error) {
      this.cards = [];
      this.render(error instanceof Error ? error.message : String(error));
    }
  }

  async refresh() {
    if (!this.folder) { this.render(); return; }
    try {
      this.cards = await invoke<LibraryEntry[]>("scan_character_folder", { path: this.folder });
      this.render();
    } catch (error) {
      this.cards = [];
      this.render(String(error));
    }
  }

  async open(entry: LibraryEntry) {
    const data = await this.read(entry.path);
    await this.onOpen(Uint8Array.from(data.bytes), entry, data.fingerprint);
  }
  read(path: string) { return invoke<{ bytes: number[]; fingerprint: FileFingerprint }>("read_character_file_with_fingerprint", { path }); }

  async save(path: string, bytes: Uint8Array, fingerprint: FileFingerprint | null, force = false, backupKeep = 10) {
    const result = await invoke<{ fingerprint: FileFingerprint }>("save_character_file", { path, bytes: Array.from(bytes), expectedFingerprint: fingerprint, force, backupKeep });
    await this.refresh();
    return result.fingerprint;
  }

  async add(name: string, bytes: Uint8Array): Promise<string> {
    if (!this.folder) throw new Error("Bitte zuerst einen SillyTavern-Ordner koppeln.");
    const path = await invoke<string>("add_character_file", { folder: this.folder, fileName: name, bytes: Array.from(bytes) });
    await this.refresh();
    return path;
  }

  versions(path: string) {
    return invoke<VersionInfo[]>("list_card_versions", { path });
  }

  async restore(path: string, id: string) {
    await invoke("restore_card_version", { path, id });
    await this.refresh();
    const entry = this.cards.find(card => card.path === path);
    if (entry) await this.open(entry);
  }

  readVersion(path: string, id: string) { return invoke<number[]>("read_card_version", { path, id }); }

  async backup(path: string, label: string) {
    await invoke("create_card_backup", { path, label });
  }

  async renameVersion(path: string, id: string, label: string) {
    await invoke("rename_card_version", { path, id, label });
  }

  async remove(path: string): Promise<string> {
    const recoveryPath = await invoke<string>("remove_character_file", { path });
    this.favorites.delete(path);
    localStorage.setItem("favorites", JSON.stringify([...this.favorites]));
    await this.refresh();
    return recoveryPath;
  }

  recovery() { return invoke<RecoveryEntry[]>("list_recovery_cards"); }
  readRecovery(id: string) { return invoke<number[]>("read_recovery_card", { id }); }
  async restoreRemoved(id: string) {
    const path = await invoke<string>("restore_removed_card", { id, fallbackFolder: this.folder || null });
    await this.refresh();
    return path;
  }
  async deleteRemoved(id: string) { await invoke("delete_removed_card", { id }); }
  async duplicate(path: string, open = true) {
    const duplicate = await invoke<string>("duplicate_character_file", { path });
    await this.refresh();
    const entry = this.cards.find(card => card.path === duplicate);
    if (open && entry) await this.open(entry);
    return duplicate;
  }

  private toggleFavorite(path: string) {
    this.favorites.has(path) ? this.favorites.delete(path) : this.favorites.add(path);
    localStorage.setItem("favorites", JSON.stringify([...this.favorites]));
    this.render();
  }

  private render(error = "") {
    if (!this.host) return;
    const visible = this.cards.filter(card => {
      const matches = (card.name + " " + card.fileName).toLocaleLowerCase().includes(this.query.toLocaleLowerCase());
      return matches && (!this.favoritesOnly || this.favorites.has(card.path));
    });
    const folderName = this.folder ? (this.folder.split(/[\\/]/).pop() || this.folder) : "Kein Ordner gekoppelt";
    const items = visible.map((card, index) =>
      '<div class="library-item" data-open-card="' + index + '"><button data-favorite-card="' + index + '" class="' +
      (this.favorites.has(card.path) ? "favorite" : "") + '">★</button><span><b>' + escapeHtml(card.name) +
      '</b><small>' + card.format + " · " + formatSize(card.size) + '</small></span></div>'
    ).join("");
    this.host.innerHTML =
      '<div class="library-head"><div><b>SillyTavern-Bibliothek</b><small title="' + escapeHtml(this.folder) + '">' +
      escapeHtml(folderName) + '</small></div><button data-library="refresh" title="Neu einlesen">↻</button></div>' +
      '<button data-library="connect" class="wide ghost">' + (this.folder ? "Ordner wechseln" : "Ordner koppeln") + '</button>' +
      (this.folder ? '<div class="library-filter"><input data-library-search placeholder="Karten suchen …" value="' +
      escapeHtml(this.query) + '"/><button data-library-favorites class="' + (this.favoritesOnly ? "active" : "") +
      '" title="Nur Favoriten">★</button></div>' : "") +
      (error ? '<p class="library-error">' + escapeHtml(error) + '</p>' : "") +
      '<div class="library-list">' + (items || (this.folder ? '<p class="muted">Keine passenden Character Cards gefunden.</p>' : "")) + '</div>';
    this.host.querySelector<HTMLButtonElement>('[data-library="connect"]')!.onclick = () => void this.connect();
    this.host.querySelector<HTMLButtonElement>('[data-library="refresh"]')!.onclick = () => void this.refresh();
    this.host.querySelector<HTMLInputElement>("[data-library-search]")?.addEventListener("input", event => {
      this.query = (event.target as HTMLInputElement).value;
      this.render();
      const input = this.host!.querySelector<HTMLInputElement>("[data-library-search]");
      input?.focus();
      input?.setSelectionRange(this.query.length, this.query.length);
    });
    this.host.querySelector<HTMLButtonElement>("[data-library-favorites]")?.addEventListener("click", () => {
      this.favoritesOnly = !this.favoritesOnly;
      this.render();
    });
    const current = visible;
    this.host.querySelectorAll<HTMLElement>("[data-open-card]").forEach(element => element.onclick = event => {
      if ((event.target as HTMLElement).closest("[data-favorite-card]")) return;
      void this.open(current[Number(element.dataset.openCard)]);
    });
    this.host.querySelectorAll<HTMLButtonElement>("[data-favorite-card]").forEach(button => button.onclick = () =>
      this.toggleFavorite(current[Number(button.dataset.favoriteCard)].path)
    );
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]!)
);
const formatSize = (size: number) => size < 1024 * 1024
  ? Math.max(1, Math.round(size / 1024)) + " KB"
  : (size / 1024 / 1024).toFixed(1) + " MB";
