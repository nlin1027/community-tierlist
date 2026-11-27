const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

// Sessions last one week. The raw token only ever lives in the client; the
// database stores its SHA-256 hash (refresh_tokens.token_hash).
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCRYPT_KEYLEN = 64;

// Stored as "scrypt$<salt hex>$<hash hex>" so the scheme can change later.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Hash computed once so a login for an unknown username still pays the scrypt
// cost, which keeps response time from revealing whether the account exists.
let dummyHashPromise;
function dummyHash() {
  dummyHashPromise ??= hashPassword('not-a-real-password');
  return dummyHashPromise;
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function tokenExpiry(now = Date.now()) {
  return new Date(now + TOKEN_TTL_MS);
}

// "Authorization: Bearer <token>" -> token, or null when absent/malformed.
function readBearer(header) {
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header ?? '');
  return match ? match[1] : null;
}

module.exports = {
  TOKEN_TTL_MS,
  hashPassword,
  verifyPassword,
  dummyHash,
  generateToken,
  hashToken,
  tokenExpiry,
  readBearer,
};
