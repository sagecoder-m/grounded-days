/**
 * Shrinks a picked photo before it goes anywhere.
 *
 * A phone photo is routinely 4000px and several megabytes; a vision model
 * reads a syllabus just as well from 1600px, and the difference is the gap
 * between an upload that takes a second and one that stalls on a weak
 * connection, plus a meaningfully smaller base64 payload on the free-tier
 * model call that actually reads it (see ai-chat's MAX_IMAGE_BYTES).
 *
 * Falls back to the original file on any failure — an iPhone photo can
 * arrive as HEIC, and canvas decoding it is not guaranteed everywhere. An
 * uncompressed image that still uploads beats a hard failure over a codec
 * this function does not control.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1600, quality = 0.82 }: { maxDimension?: number; quality?: number } = {},
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
