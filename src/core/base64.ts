// UTF-8 safe base64, as the GitHub contents API wants it.

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  // Chunked: String.fromCharCode(...bytes) overflows the stack on big files.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
