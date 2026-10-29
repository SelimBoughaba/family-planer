// Dateien vom Gerät direkt in den privaten Speicher laden

/** Fotos verkleinern (längste Seite 1800 px, JPEG), damit Upload und Erkennung schnell bleiben */
export async function prepareFile(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file;
  if (!file.type.startsWith("image/")) throw new Error("Nur Fotos und PDFs.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPEG oder PNG.");
  }
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verarbeitet werden."))), "image/jpeg", 0.85));
}

export async function uploadFile(blob: Blob, kind: "recipe" | "board"): Promise<string> {
  const type = blob.type || "image/jpeg";
  const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, contentType: type, size: blob.size }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.message ?? "Hochladen gerade nicht möglich.");
  const put = await fetch(r.uploadUrl, { method: "PUT", headers: { "content-type": type, "x-upsert": "false" }, body: blob });
  if (!put.ok) throw new Error("Hochladen hat nicht geklappt.");
  return r.path as string;
}

/** Adresse zum Anzeigen; der Server leitet auf einen kurzlebigen Link um */
export const fileUrl = (path: string) => `/api/files/${path}`;
