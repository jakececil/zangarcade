const SAVE_SIZE = 32768;
const BANK_SIZE = 16384;
const HEADER_SIZE = 32;
const PAYLOAD_SIZE = 13928;
const WORLD_SIZE = 6960;

function checksum(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readBank(bytes, bankOffset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + bankOffset, BANK_SIZE);
  const magic = String.fromCharCode(...bytes.subarray(bankOffset, bankOffset + 4));
  if (magic !== "KFA1" || view.getUint32(4, true) !== 3 || view.getUint32(8, true) !== PAYLOAD_SIZE) return null;

  const payload = bytes.subarray(bankOffset + HEADER_SIZE, bankOffset + HEADER_SIZE + PAYLOAD_SIZE);
  if (checksum(payload) !== view.getUint32(16, true)) return null;

  return {
    bankOffset,
    generation: view.getUint32(12, true),
    catches: view.getUint16(HEADER_SIZE + 14, true),
    mode: view.getUint8(HEADER_SIZE + 25) === 0 ? "curated" : "survival",
    parkedCatches: view.getUint16(HEADER_SIZE + WORLD_SIZE + 14, true),
    parkedMode: view.getUint8(HEADER_SIZE + WORLD_SIZE + 25) === 0 ? "curated" : "survival"
  };
}

function bankIsWriting(bytes, bankOffset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + bankOffset, BANK_SIZE);
  return view.getUint32(0, true) === 0 && view.getUint32(4, true) === 3 && view.getUint32(8, true) === PAYLOAD_SIZE;
}

/** Read the genuine landed-fish counter from an unmodified Kingfisher V10 SRAM save. */
export function parseKingfisherSave(buffer) {
  let bytes;
  if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
  else if (ArrayBuffer.isView(buffer)) bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  else return { valid: false };
  if (bytes.byteLength !== SAVE_SIZE) return { valid: false };

  const first = readBank(bytes, 0);
  const second = readBank(bytes, BANK_SIZE);
  const writing = bankIsWriting(bytes, 0) || bankIsWriting(bytes, BANK_SIZE);
  if (!first && !second) return { valid: false, writing };

  // Match the ROM's signed generation comparison, including uint32 wraparound.
  let bank = first || second;
  if (first && second && ((second.generation - first.generation) | 0) > 0) bank = second;
  return { valid: true, writing, ...bank };
}
