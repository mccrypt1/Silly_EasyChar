import { normalizeCard, toV3Card } from "./card";
import type { CharacterCard } from "./types";

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const u32 = (d: Uint8Array, o: number) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const bytes32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (const b of d) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

interface Chunk { type: string; data: Uint8Array; raw: Uint8Array }
function chunks(data: Uint8Array): Chunk[] {
  if (!signature.every((b, i) => data[i] === b)) throw new Error("Keine gültige PNG-Datei.");
  const result: Chunk[] = [];
  for (let o = 8; o + 12 <= data.length;) {
    const len = u32(data, o); if (o + len + 12 > data.length) throw new Error("Beschädigte PNG-Datei.");
    const type = new TextDecoder("latin1").decode(data.slice(o + 4, o + 8));
    result.push({ type, data: data.slice(o + 8, o + 8 + len), raw: data.slice(o, o + 12 + len) });
    o += 12 + len;
  }
  return result;
}

function decode64(text: string): string {
  const binary = atob(text.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}
function encode64(text: string): string {
  const bytes = new TextEncoder().encode(text); let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function extractCard(buffer: ArrayBuffer): CharacterCard | null {
  const found: Record<string, any> = {};
  for (const c of chunks(new Uint8Array(buffer))) {
    if (c.type !== "tEXt" && c.type !== "iTXt") continue;
    const zero = c.data.indexOf(0); if (zero < 0) continue;
    const key = new TextDecoder("latin1").decode(c.data.slice(0, zero));
    if (key !== "chara" && key !== "ccv3") continue;
    let payload = c.data.slice(zero + 1);
    if (c.type === "iTXt") { let pos = zero + 3; for (let i = 0; i < 2; i++) pos = c.data.indexOf(0, pos) + 1; payload = c.data.slice(pos); }
    const text = new TextDecoder().decode(payload);
    try { found[key] = JSON.parse(decode64(text)); } catch { try { found[key] = JSON.parse(text); } catch { /* invalid */ } }
  }
  return found.ccv3 || found.chara ? normalizeCard(found.ccv3 ?? found.chara) : null;
}

function textChunk(key: string, text: string): Uint8Array {
  const type = new TextEncoder().encode("tEXt");
  const body = concat([new TextEncoder().encode(key), new Uint8Array([0]), new TextEncoder().encode(text)]);
  return concat([bytes32(body.length), type, body, bytes32(crc32(concat([type, body])))]);
}

export function embedCard(buffer: ArrayBuffer, card: CharacterCard): Blob {
  const source = chunks(new Uint8Array(buffer));
  const v2card = structuredClone(card) as any;
  v2card.spec = "chara_card_v2";
  v2card.spec_version = "2.0";
  delete v2card.data.assets;
  delete v2card.data.nickname;
  delete v2card.data.creator_notes_multilingual;
  delete v2card.data.source;
  delete v2card.data.group_only_greetings;
  delete v2card.data.creation_date;
  delete v2card.data.modification_date;
  const v2 = textChunk("chara", encode64(JSON.stringify(v2card)));
  const v3card = toV3Card(card);
  const v3 = textChunk("ccv3", encode64(JSON.stringify(v3card)));
  const output: Uint8Array[] = [signature];
  for (const c of source) {
    const zero = c.data.indexOf(0); const key = zero >= 0 ? new TextDecoder("latin1").decode(c.data.slice(0, zero)) : "";
    if ((c.type === "tEXt" || c.type === "iTXt") && (key === "chara" || key === "ccv3")) continue;
    if (c.type === "IEND") output.push(v2, v3);
    output.push(c.raw);
  }
  return new Blob([concat(output) as BlobPart], { type: "image/png" });
}

export async function imageAsPng(file: File): Promise<ArrayBuffer> {
  if (file.type === "image/png") return file.arrayBuffer();
  const bitmap = await createImageBitmap(file); const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")!.drawImage(bitmap, 0, 0); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("Bildkonvertierung fehlgeschlagen")), "image/png"));
}
