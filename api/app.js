const express = require('express');
const cors = require('cors');
const HEROES = require('./heroes');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const {
  hashPassword,
  verifyPassword,
  dummyHash,
  generateToken,
  hashToken,
  tokenExpiry,
  readBearer,
} = require('./auth');

const VALID_TIERS = ['D', 'C', 'B', 'A', 'S', 'Z'];
const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,20}$/;
const SEARCH_PATTERN = /^[a-zA-Z0-9]{1,20}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const TIER_AVERAGE_SQL = `AVG(CASE tier
            WHEN 'D' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3
            WHEN 'A' THEN 4 WHEN 'S' THEN 5 WHEN 'Z' THEN 6
          END)`;

// "YYYY-MM-DD" -> the same string if it is a real calendar day, otherwise null.
function parseDay(value) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function createApp({ pool, redisClient }) {
  function createLimiter({ windowMs, max, prefix }) {
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "too many requests, slow down" },
      ...(redisClient && {
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
          prefix,
        }),
      })
    })
  }

  const submitCharacterLimiter = createLimiter({ windowMs: 60_000, max: 10, prefix: 'rl:submit-character:' });
  const submitListLimiter = createLimiter({ windowMs: 60_000, max: 3, prefix: 'rl:submit-list:' });
  const getCharacterLimiter = createLimiter({ windowMs: 60_000, max: 60, prefix: 'rl:get-character:' });
  const averageListLimiter = createLimiter({ windowMs: 60_000, max: 30, prefix: 'rl:average-list:' });
  const registerLimiter = createLimiter({ windowMs: 60 * 60_000, max: 5, prefix: 'rl:auth-register:' });
  const loginLimiter = createLimiter({ windowMs: 15 * 60_000, max: 10, prefix: 'rl:auth-login:' });
  const logoutLimiter = createLimiter({ windowMs: 60_000, max: 30, prefix: 'rl:auth-logout:' });
  const meLimiter = createLimiter({ windowMs: 60_000, max: 60, prefix: 'rl:auth-me:' });
  const userSearchLimiter = createLimiter({ windowMs: 60_000, max: 60, prefix: 'rl:user-search:' });
  const userRankingsLimiter = createLimiter({ windowMs: 60_000, max: 60, prefix: 'rl:user-rankings:' });

  // Resolves "Authorization: Bearer <token>" to a live session, or answers 401.
  async function requireAuth(req, res, next) {
    const token = readBearer(req.get('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'sign in required' });
    }

    const tokenHash = hashToken(token);
    try {
      const result = await pool.query(
        `SELECT u.id, u.username, t.expires_at
        FROM refresh_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()`,
        [tokenHash]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'session expired or invalid, sign in again' });
      }
      const { id, username, expires_at } = result.rows[0];
      req.user = { id, username };
      req.session = { tokenHash, expires_at };
      next();
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  }

  const app = express();

  app.set('trust proxy', 1);

  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // ── auth ──────────────────────────────────────────────────────────────

  app.post('/auth/register', registerLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters' });
    }
    if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: `password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters` });
    }

    const token = generateToken();
    try {
      const passwordHash = await hashPassword(password);
      // One statement, so the account and its first session are created together.
      const result = await pool.query(
        `WITH new_user AS (
          INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username
        ), new_token AS (
          INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
          SELECT id, $3, $4 FROM new_user RETURNING expires_at
        )
        SELECT new_user.id, new_user.username, new_token.expires_at FROM new_user, new_token`,
        [username, passwordHash, hashToken(token), tokenExpiry()]
      );
      const { id, expires_at } = result.rows[0];
      return res.status(201).json({ token, expires_at, user: { id, username: result.rows[0].username } });
    }
    catch (err) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'username is already taken' });
      }
      return res.status(500).json({ error: 'query failed' });
    }
  });

  app.post('/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters' });
    }
    if (typeof password !== 'string' || password.length === 0 || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: `password must be 1-${PASSWORD_MAX} characters` });
    }

    try {
      const found = await pool.query(
        'SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)',
        [username]
      );
      const account = found.rows[0];

      // Always run scrypt, even for unknown users, so timing does not leak which names exist.
      const valid = await verifyPassword(password, account?.password_hash ?? await dummyHash());
      if (!account || !account.password_hash || !valid) {
        return res.status(401).json({ error: 'invalid username or password' });
      }

      const token = generateToken();
      const created = await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING expires_at',
        [account.id, hashToken(token), tokenExpiry()]
      );
      return res.json({
        token,
        expires_at: created.rows[0].expires_at,
        user: { id: account.id, username: account.username },
      });
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  app.post('/auth/logout', logoutLimiter, requireAuth, async (req, res) => {
    try {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [req.session.tokenHash]
      );
      return res.status(204).end();
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  app.get('/auth/me', meLimiter, requireAuth, (req, res) => {
    res.json({ user: req.user, expires_at: req.session.expires_at });
  });

  // ── submissions (signed in) ───────────────────────────────────────────

  app.post('/submit_character', submitCharacterLimiter, requireAuth, async (req, res) => {
    const { character, tier } = req.body ?? {};

    if (!HEROES.includes(character)) {
      return res.status(400).json({ error: 'character must be one of the 44 valid Deadlock heroes' });
    }
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: 'tier must be one of D, C, B, A, S, Z' });
    }

    try {
      let result = await pool.query(
        'INSERT INTO deadlock ("user", user_id, character, tier) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.username, req.user.id, character, tier]
      );

      res.status(201).json(result.rows[0]);
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  app.post('/submit_list', submitListLimiter, requireAuth, async (req, res) => {
    const { rankings } = req.body ?? {};

    if (!Array.isArray(rankings) || rankings.length === 0) {
      return res.status(400).json({ error: 'rankings must be a non-empty array' });
    }
    if (rankings.length > HEROES.length) {
      return res.status(400).json({ error: `rankings can have at most ${HEROES.length} entries` });
    }

    const seen = new Set();
    for (const entry of rankings) {
      const { character, tier } = entry ?? {};
      if (!HEROES.includes(character)) {
        return res.status(400).json({ error: `invalid character: ${character}` });
      }
      if (!VALID_TIERS.includes(tier)) {
        return res.status(400).json({ error: `invalid tier for ${character}: ${tier}` });
      }
      if (seen.has(character)) {
        return res.status(400).json({ error: `duplicate character: ${character}` });
      }
      seen.add(character);
    }

    const { username, id } = req.user;
    const values = [];
    const placeholders = rankings.map(({ character, tier }, i) => {
      values.push(username, id, character, tier);
      return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`;
    });

    try {
      const result = await pool.query(
        `INSERT INTO deadlock ("user", user_id, character, tier) VALUES ${placeholders.join(', ')} RETURNING *`,
        values
      );
      res.status(201).json(result.rows);
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  // ── community averages ────────────────────────────────────────────────

  app.get('/get_character/:character', getCharacterLimiter, async (req, res) => {
    const { character } = req.params;

    if (!HEROES.includes(character)) {
      return res.status(400).json({ error: 'character must be one of the 44 valid Deadlock heroes' });
    }

    try {
      let result = await pool.query(
        `SELECT
          COUNT(*) AS count,
          ${TIER_AVERAGE_SQL} AS average_tier
        FROM deadlock
        WHERE character = $1`,
        [character]
      );

      if (result.rows[0].count === '0') {
        return res.status(404).json({ error: "No rankings found for specific hero" });
      }

      res.json({ character, average_tier: result.rows[0].average_tier, count: result.rows[0].count });
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  app.get('/average_list', averageListLimiter, async (req, res) => {
    const { from: rawFrom, to: rawTo } = req.query;

    const from = rawFrom === undefined ? null : parseDay(rawFrom);
    const to = rawTo === undefined ? null : parseDay(rawTo);
    if (rawFrom !== undefined && !from) {
      return res.status(400).json({ error: 'from must be a valid date in YYYY-MM-DD format' });
    }
    if (rawTo !== undefined && !to) {
      return res.status(400).json({ error: 'to must be a valid date in YYYY-MM-DD format' });
    }
    if (from && to && from > to) {
      return res.status(400).json({ error: 'from must be on or before to' });
    }

    try {
      const default_list = new Map(HEROES.map(character => [character, {character, average_tier: null, count: '0'}]));

      // Days are whole UTC days; `to` is inclusive.
      let result = await pool.query(
        `SELECT
          character,
          COUNT(*) AS count,
          ${TIER_AVERAGE_SQL} AS average_tier
        FROM deadlock
        WHERE ($1::date IS NULL OR date >= ($1::date)::timestamp AT TIME ZONE 'UTC')
          AND ($2::date IS NULL OR date < ($2::date + 1)::timestamp AT TIME ZONE 'UTC')
        GROUP BY character
        ORDER BY character;`,
        [from, to]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No characters have been ranked" });
      }

      for (const row of result.rows) {
        default_list.set(row.character, row);
      }

      return res.json([...default_list.values()]);
    }
    catch {
      return res.status(500).json({ error: "Query failed" });
    }
  });

  // ── other users ───────────────────────────────────────────────────────

  app.get('/users/search', userSearchLimiter, async (req, res) => {
    const { q } = req.query;

    // Letters and digits only, so the value can never carry LIKE wildcards.
    if (typeof q !== 'string' || !SEARCH_PATTERN.test(q)) {
      return res.status(400).json({ error: 'q must be 1-20 alphanumeric characters' });
    }

    try {
      const result = await pool.query(
        `SELECT
          u.username,
          u.created_at,
          COUNT(DISTINCT d.character) AS heroes_ranked,
          MAX(d.date) AS last_submitted
        FROM users u
        LEFT JOIN deadlock d ON d.user_id = u.id
        WHERE lower(u.username) LIKE '%' || lower($1) || '%'
        GROUP BY u.id
        ORDER BY
          lower(u.username) = lower($1) DESC,
          lower(u.username) LIKE lower($1) || '%' DESC,
          lower(u.username)
        LIMIT 20`,
        [q]
      );
      return res.json(result.rows);
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  app.get('/users/:username/rankings', userRankingsLimiter, async (req, res) => {
    const { username } = req.params;

    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters' });
    }

    try {
      // Each hero's most recent tier from this user.
      const result = await pool.query(
        `SELECT u.username, r.character, r.tier, r.date
        FROM users u
        LEFT JOIN LATERAL (
          SELECT DISTINCT ON (d.character) d.character, d.tier, d.date
          FROM deadlock d
          WHERE d.user_id = u.id
          ORDER BY d.character, d.date DESC
        ) r ON true
        WHERE lower(u.username) = lower($1)
        ORDER BY r.character`,
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'user not found' });
      }

      const rankings = result.rows
        .filter((row) => row.character !== null)
        .map(({ character, tier, date }) => ({ character, tier, date }));
      const lastUpdated = rankings.reduce(
        (latest, { date }) => (latest === null || new Date(date) > new Date(latest) ? date : latest),
        null
      );

      return res.json({ username: result.rows[0].username, last_updated: lastUpdated, rankings });
    }
    catch {
      return res.status(500).json({ error: 'query failed' });
    }
  });

  return app;
}

module.exports = createApp;
