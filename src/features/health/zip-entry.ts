/**
 * Streams one file out of a .zip chosen in the browser, without loading the
 * whole archive into memory (Apple Health exports can be gigabytes). Handles
 * stored and deflated entries, and zip64 archives.
 */

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function view(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

export type ZipEntry = { name: string; stream: ReadableStream<Uint8Array>; compressedSize: number };

export class ZipError extends Error {}

/** Passes bytes through, reporting how many have gone by (for progress). */
export function countBytes(onBytes: (n: number) => void) {
  let n = 0;
  return new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, c) { n += chunk.byteLength; onBytes(n); c.enqueue(chunk); } });
}

export async function openZipEntry(file: Blob, match: (name: string) => boolean, onBytes: (n: number) => void = () => {}): Promise<ZipEntry | null> {
  // End of central directory: in the last 22 bytes + up to 64 KB of comment.
  const tailStart = Math.max(0, file.size - 22 - 65_535);
  const tail = await view(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ZipError("This isn't a readable .zip file.");
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new ZipError("This .zip file is damaged.");
    const z64At = u64(tail, loc + 8);
    const z64 = await view(file, z64At, z64At + 56);
    if (u32(z64, 0) !== 0x06064b50) throw new ZipError("This .zip file is damaged.");
    cdSize = u64(z64, 40);
    cdOffset = u64(z64, 48);
  }
  const cd = await view(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  for (let p = 0; p + 46 <= cd.byteLength && u32(cd, p) === 0x02014b50;) {
    const method = u16(cd, p + 10);
    let compSize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let local = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    if (match(name)) {
      // Zip64 sizes live in extra field 0x0001, in a fixed order, only for fields set to 0xffffffff.
      const uncomp32 = u32(cd, p + 24);
      for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen;) {
        const id = u16(cd, e);
        const size = u16(cd, e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncomp32 === 0xffffffff) q += 8;
          if (compSize === 0xffffffff) { compSize = u64(cd, q); q += 8; }
          if (local === 0xffffffff) local = u64(cd, q);
        }
        e += 4 + size;
      }
      const lh = await view(file, local, local + 30);
      if (u32(lh, 0) !== 0x04034b50) throw new ZipError("This .zip file is damaged.");
      const dataStart = local + 30 + u16(lh, 26) + u16(lh, 28);
      const raw = (file.slice(dataStart, dataStart + compSize).stream() as ReadableStream<Uint8Array>).pipeThrough(countBytes(onBytes));
      if (method === 0) return { name, stream: raw, compressedSize: compSize };
      if (method === 8) return { name, stream: raw.pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>), compressedSize: compSize };
      throw new ZipError("This .zip uses a compression method the browser can't read. Unzip it and choose export.xml instead.");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
