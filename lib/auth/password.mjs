// Password hashing — argon2id (OWASP-recommended). Uses @node-rs/argon2
// (prebuilt native binaries; no node-gyp build, Vercel-friendly).
// app_user.password_hash stores the encoded argon2id string; NULL for OAuth-only
// accounts. Verify parses parameters from the encoded hash.
import { hash, verify, Algorithm } from "@node-rs/argon2";

// OWASP "second recommended" argon2id parameters: 19 MiB, t=2, p=1.
const HASH_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(plain) {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return hash(plain, HASH_OPTS);
}

export async function verifyPassword(encodedHash, plain) {
  if (!encodedHash || typeof plain !== "string" || plain.length === 0) return false;
  try {
    return await verify(encodedHash, plain);
  } catch {
    return false;
  }
}
