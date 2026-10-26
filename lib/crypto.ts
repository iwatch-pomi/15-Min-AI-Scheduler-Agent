import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// リフレッシュトークンを DB に保存する前に AES-256-GCM で暗号化する。
// 形式: base64(iv[12] | tag[16] | ciphertext)

function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY;
  const buf = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (buf.length !== 32) throw new Error("TOKEN_ENC_KEY は32バイトを base64 にした値を設定してください");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
