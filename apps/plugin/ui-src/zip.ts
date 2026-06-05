import { HtmlZipFile } from "types";

const textEncoder = new TextEncoder();

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (value: number) => {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
};

const writeUint32 = (value: number) => {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
};

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const getDosDateTime = (date: Date) => {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

export const createZipBlob = async (
  files: HtmlZipFile[],
  onProgress?: (current: number, total: number, label: string) => void,
) => {
  const now = new Date();
  const { dosDate, dosTime } = getDosDateTime(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length, `Compressing ${file.path}`);
    if (index % 4 === 0) {
      await nextFrame();
    }

    const nameBytes = textEncoder.encode(file.path);
    const contentBytes =
      file.encoding === "base64"
        ? base64ToBytes(file.content)
        : textEncoder.encode(file.content);
    const checksum = crc32(contentBytes);

    const localHeader = concatBytes([
      writeUint32(0x04034b50),
      writeUint16(20),
      writeUint16(0x0800),
      writeUint16(0),
      writeUint16(dosTime),
      writeUint16(dosDate),
      writeUint32(checksum),
      writeUint32(contentBytes.length),
      writeUint32(contentBytes.length),
      writeUint16(nameBytes.length),
      writeUint16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, contentBytes);

    centralParts.push(
      concatBytes([
        writeUint32(0x02014b50),
        writeUint16(20),
        writeUint16(20),
        writeUint16(0x0800),
        writeUint16(0),
        writeUint16(dosTime),
        writeUint16(dosDate),
        writeUint32(checksum),
        writeUint32(contentBytes.length),
        writeUint32(contentBytes.length),
        writeUint16(nameBytes.length),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint32(0),
        writeUint32(offset),
        nameBytes,
      ]),
    );

    offset += localHeader.length + contentBytes.length;
  }

  onProgress?.(files.length, files.length, "Finalizing zip");
  await nextFrame();

  const centralDirectory = concatBytes(centralParts);
  const endOfCentralDirectory = concatBytes([
    writeUint32(0x06054b50),
    writeUint16(0),
    writeUint16(0),
    writeUint16(files.length),
    writeUint16(files.length),
    writeUint32(centralDirectory.length),
    writeUint32(offset),
    writeUint16(0),
  ]);

  return new Blob(
    [concatBytes([...localParts, centralDirectory, endOfCentralDirectory])],
    {
      type: "application/zip",
    },
  );
};
