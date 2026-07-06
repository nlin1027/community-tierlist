const express = require('express');
const cors = require('cors');
const pool = require('./db');
const HEROES = require('./heroes');

const VALID_TIERS = ['D', 'C', 'B', 'A', 'S', 'Z'];
const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,20}$/;

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/submit_character', async (req, res) => {
  const { user, character, tier } = req.body;

  if (typeof user !== 'string' || !USERNAME_PATTERN.test(user)) {
    return res.status(400).json({ error: 'user must be 3-20 alphanumeric characters' });
  }
  if (!HEROES.includes(character)) {
    return res.status(400).json({ error: 'character must be one of the 38 valid Deadlock heroes' });
  }
  if (!VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'tier must be one of D, C, B, A, S, Z' });
  }

  try {
    let result = await pool.query(
      'INSERT INTO deadlock ("user", character, tier) VALUES ($1, $2, $3) RETURNING *',
      [user, character, tier]
    );

    res.status(201).json(result.rows[0]);
  }
  catch {
    return res.status(500).json({ error: 'query failed' });
  }
});

app.post('/submit_list', async (req, res) => {
  const { user, rankings } = req.body;

  if (typeof user !== 'string' || !USERNAME_PATTERN.test(user)) {
    return res.status(400).json({ error: 'user must be 3-20 alphanumeric characters' });
  }
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return res.status(400).json({ error: 'rankings must be a non-empty array' });
  }

  for (const { character, tier } of rankings) {
    if (!HEROES.includes(character)) {
      return res.status(400).json({ error: `invalid character: ${character}` });
    }
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: `invalid tier for ${character}: ${tier}` });
    }
  }

  const values = [];
  const placeholders = rankings.map(({ character, tier }, i) => {
    values.push(user, character, tier);
    return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`;
  });

  try {
    const result = await pool.query(
      `INSERT INTO deadlock ("user", character, tier) VALUES ${placeholders.join(', ')} RETURNING *`,
      values
    );
    res.status(201).json(result.rows);
  }
  catch {
    return res.status(500).json({ error: 'query failed' });
  }
});

app.get('/:character', async (req, res) => {
  const { character } = req.params;

  if (!HEROES.includes(character)) {
    return res.status(400).json({ error: 'character must be one of the 38 valid Deadlock heroes' });
  }

  try {
    let result = await pool.query(
      `SELECT
        COUNT(*) AS count,
        AVG(CASE tier
          WHEN 'D' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3
          WHEN 'A' THEN 4 WHEN 'S' THEN 5 WHEN 'Z' THEN 6
        END) AS average_tier
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

module.exports = app;
