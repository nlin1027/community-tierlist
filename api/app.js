const express = require('express');
const cors = require('cors');
const pool = require('./db');
const HEROES = require('./heroes');

const VALID_TIERS = ['D', 'C', 'B', 'A', 'S', 'Z'];

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/submit_character', async (req, res) => {
  const { user, character, tier } = req.body;

  if (typeof user !== 'string' || !user.trim()) {
    return res.status(400).json({ error: 'user is required' });
  }
  if (!HEROES.includes(character)) {
    return res.status(400).json({ error: 'character must be one of the 38 valid Deadlock heroes' });
  }
  if (!VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'tier must be one of D, C, B, A, S, Z' });
  }

  const result = await pool.query(
    'INSERT INTO deadlock ("user", character, tier) VALUES ($1, $2, $3) RETURNING *',
    [user, character, tier]
  );

  res.status(201).json(result.rows[0]);
});

app.get('/:character', async (req, res) => {
  const { character } = req.params;

  if (!HEROES.includes(character)) {
    return res.status(400).json({ error: 'character must be one of the 38 valid Deadlock heroes' });
  }

  const tierValues = { D: 1, C: 2, B: 3, A: 4, S: 5, Z: 6 };

  const result = await pool.query(
    'SELECT tier FROM deadlock WHERE character = $1',
    [character]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'no rankings found for this character' });
  }

  const average =
    result.rows.reduce((sum, row) => sum + tierValues[row.tier], 0) / result.rows.length;

  res.json({ character, average_tier: average, count: result.rows.length });
});

module.exports = app;
