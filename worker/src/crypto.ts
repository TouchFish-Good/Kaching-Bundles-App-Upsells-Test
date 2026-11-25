const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function importEncryptionKey(value: string): Promise<CryptoKey> {
  const keyBytes = fromBase64Url(value);
  if (![16, 24, 32].includes(keyBytes.byteLength)) throw new Error('Invalid token encryption key');
  return crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function hmacHex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacBase64(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function timingSafeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

export async function encryptToken(key: string, handle: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(handle) },
    await importEncryptionKey(key),
    encoder.encode(token),
  ));

  return `v1.${toBase64Url(iv)}.${toBase64Url(encrypted)}`;
}

export async function decryptToken(key: string, handle: string, ciphertext: string): Promise<string> {
  try {
    const [version, encodedIv, encodedCiphertext, extra] = ciphertext.split('.');
    if (version !== 'v1' || !encodedIv || !encodedCiphertext || extra) throw new Error('Invalid token payload');
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(fromBase64Url(encodedIv)), additionalData: encoder.encode(handle) },
      await importEncryptionKey(key),
      toArrayBuffer(fromBase64Url(encodedCiphertext)),
    );
    return decoder.decode(decrypted);
  } catch {
    throw new Error('Token decryption failed');
  }
}
