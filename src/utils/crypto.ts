const ALGO = "AES-GCM";
const KEY_NAME = "prostatclub-encryption-key";

/**
 * Utilitaire de chiffrement pour les paramètres sensibles (settings.json)
 */

async function getOrDeriveKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(KEY_NAME);
  let rawKey: Uint8Array;
  
  if (stored) {
    rawKey = new Uint8Array(JSON.parse(stored));
  } else {
    rawKey = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(KEY_NAME, JSON.stringify(Array.from(rawKey)));
  }

  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    ALGO,
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSettings(json: string): Promise<string> {
  try {
    const key = await getOrDeriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(json);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      key,
      encoded
    );

    const result = {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    };
    
    return JSON.stringify(result);
  } catch (e) {
    console.error("Encryption failed", e);
    return json;
  }
}

export async function decryptSettings(encryptedJson: string): Promise<string> {
  try {
    const parsed = JSON.parse(encryptedJson);
    if (!parsed.iv || !parsed.data) return encryptedJson;

    const key = await getOrDeriveKey();
    const iv = new Uint8Array(parsed.iv);
    const data = new Uint8Array(parsed.data);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGO, iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.warn("Decryption failed (maybe file is not encrypted)", e);
    return encryptedJson;
  }
}
