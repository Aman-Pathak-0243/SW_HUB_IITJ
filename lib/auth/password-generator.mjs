// Secure random-password GENERATOR for the admin-mediated reset flow (M0, DL-058).
// SERVER-ONLY (imports node:crypto). Produces a password that satisfies
// PASSWORD_POLICY using a CSPRNG. `randomFn` (n→Buffer of n bytes) is injectable so
// a test can make it deterministic. Guarantees at least one lowercase, one
// uppercase and one digit, then fills + shuffles to `length`. Excludes visually
// ambiguous characters (0/O, 1/l/I) so the password survives being typed from email.
import { randomBytes } from "node:crypto";
import { PASSWORD_POLICY } from "./password-policy.mjs";

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const DIGITS = "23456789"; // no 0, 1
const ALL = LOWER + UPPER + DIGITS;

// Uniform index in [0, n) from a CSPRNG byte, rejecting the biased tail so the
// distribution is even (rejection sampling).
function pick(chars, randomFn) {
  const n = chars.length;
  const limit = 256 - (256 % n);
  let b;
  do {
    b = randomFn(1)[0];
  } while (b >= limit);
  return chars[b % n];
}

export function generatePassword({ length = 16, randomFn = randomBytes } = {}) {
  const len = Math.max(PASSWORD_POLICY.minLength, Math.min(PASSWORD_POLICY.maxLength, length | 0));
  // one guaranteed char from each required class
  const out = [pick(LOWER, randomFn), pick(UPPER, randomFn), pick(DIGITS, randomFn)];
  while (out.length < len) out.push(pick(ALL, randomFn));
  // Fisher–Yates shuffle so the guaranteed chars aren't always in the first slots
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomFn(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}
