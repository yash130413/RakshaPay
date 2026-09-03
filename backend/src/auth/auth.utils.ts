import crypto from "node:crypto";

export function hashPassword(password: string): string {
  const salt = "rakshapay_secret_salt_2026";
  return crypto.createHash("sha256").update(`${password}:${salt}`).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
