const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const createApp = require('../app');
const HEROES = require('../heroes');

// Builds a fresh app on a random port, wired to a fake pool instead of Postgres
// and with no Redis client, so rate limiting uses express-rate-limit's in-memory
// store. A new app per test means every test starts with empty rate-limit counters.
async function startApp(t, query = async () => ({ rows: [] })) {
  const pool = { query: mock.fn(query) };
  const server = createApp({ pool }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return { pool, base };
}

async function request(base, path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, headers: res.headers };
}

const dbDown = async () => {
  throw new Error('db down');
};

const queryCount = (pool) => pool.query.mock.callCount();
const lastQuery = (pool) => {
  const [sql, params] = pool.query.mock.calls.at(-1).arguments;
  return { sql, params };
};

describe('GET /health', () => {
  it('returns ok without touching the database', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await request(base, '/health');
    assert.equal(status, 200);
    assert.deepEqual(json, { status: 'ok' });
    assert.equal(queryCount(pool), 0);
  });

  it('sends CORS headers', async (t) => {
    const { base } = await startApp(t);
    const { headers } = await request(base, '/health');
    assert.equal(headers.get('access-control-allow-origin'), '*');
  });
});

describe('POST /submit_character', () => {
  const valid = { user: 'nathan', character: 'Abrams', tier: 'S' };

  const badInputs = [
    ['username too short', { ...valid, user: 'ab' }, /^user /],
    ['username too long', { ...valid, user: 'a'.repeat(21) }, /^user /],
    ['username with symbols', { ...valid, user: 'nathan!' }, /^user /],
    ['username not a string', { ...valid, user: 123 }, /^user /],
    ['username missing', { character: 'Abrams', tier: 'S' }, /^user /],
    ['lowercase hero name', { ...valid, character: 'abrams' }, /^character /],
    ['unknown hero', { ...valid, character: 'Nobody' }, /^character /],
    ['hero missing', { user: 'nathan', tier: 'S' }, /^character /],
    ['tier not in the list', { ...valid, tier: 'X' }, /^tier /],
    ['lowercase tier', { ...valid, tier: 's' }, /^tier /],
    ['tier missing', { user: 'nathan', character: 'Abrams' }, /^tier /],
  ];

  for (const [name, body, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await request(base, '/submit_character', { method: 'POST', body });
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(queryCount(pool), 0);
    });
  }

  it('inserts a valid submission and returns 201 with the new row', async (t) => {
    const row = { id: 1, ...valid, date: '2026-10-16T00:00:00.000Z' };
    const { pool, base } = await startApp(t, async () => ({ rows: [row] }));
    const { status, json } = await request(base, '/submit_character', { method: 'POST', body: valid });
    assert.equal(status, 201);
    assert.deepEqual(json, row);
    assert.equal(queryCount(pool), 1);
    const { sql, params } = lastQuery(pool);
    assert.match(sql, /^INSERT INTO deadlock/);
    assert.deepEqual(params, ['nathan', 'Abrams', 'S']);
  });

  it('accepts every valid tier', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [{}] }));
    for (const tier of ['D', 'C', 'B', 'A', 'S', 'Z']) {
      const { status } = await request(base, '/submit_character', { method: 'POST', body: { ...valid, tier } });
      assert.equal(status, 201, `tier ${tier} should be accepted`);
    }
    assert.equal(queryCount(pool), 6);
  });

  it('accepts usernames at the 3 and 20 character limits', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [{}] }));
    for (const user of ['abc', 'a'.repeat(20)]) {
      const { status } = await request(base, '/submit_character', { method: 'POST', body: { ...valid, user } });
      assert.equal(status, 201, `username of length ${user.length} should be accepted`);
    }
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/submit_character', { method: 'POST', body: valid });
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('POST /submit_list', () => {
  const rankings = [
    { character: 'Abrams', tier: 'S' },
    { character: 'Apollo', tier: 'A' },
  ];
  const valid = { user: 'nathan', rankings };

  const badInputs = [
    ['username too short', { ...valid, user: 'ab' }, /^user /],
    ['username with symbols', { ...valid, user: 'nathan!' }, /^user /],
    ['username missing', { rankings }, /^user /],
    ['rankings missing', { user: 'nathan' }, /^rankings /],
    ['rankings not an array', { user: 'nathan', rankings: 'Abrams' }, /^rankings /],
    ['rankings empty', { user: 'nathan', rankings: [] }, /^rankings /],
  ];

  for (const [name, body, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await request(base, '/submit_list', { method: 'POST', body });
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(queryCount(pool), 0);
    });
  }

  it('names the invalid hero in the error', async (t) => {
    const { pool, base } = await startApp(t);
    const body = { user: 'nathan', rankings: [{ character: 'abrams', tier: 'S' }] };
    const { status, json } = await request(base, '/submit_list', { method: 'POST', body });
    assert.equal(status, 400);
    assert.equal(json.error, 'invalid character: abrams');
    assert.equal(queryCount(pool), 0);
  });

  it('names the hero and tier when a tier is invalid', async (t) => {
    const { pool, base } = await startApp(t);
    const body = { user: 'nathan', rankings: [{ character: 'Abrams', tier: 'X' }] };
    const { status, json } = await request(base, '/submit_list', { method: 'POST', body });
    assert.equal(status, 400);
    assert.equal(json.error, 'invalid tier for Abrams: X');
    assert.equal(queryCount(pool), 0);
  });

  it('rejects the whole list when only one entry is invalid', async (t) => {
    const { pool, base } = await startApp(t);
    const body = { user: 'nathan', rankings: [...rankings, { character: 'Nobody', tier: 'S' }] };
    const { status } = await request(base, '/submit_list', { method: 'POST', body });
    assert.equal(status, 400);
    assert.equal(queryCount(pool), 0);
  });

  it('inserts every entry in one query and returns 201 with the rows', async (t) => {
    const rows = rankings.map((r, i) => ({ id: i + 1, user: 'nathan', ...r }));
    const { pool, base } = await startApp(t, async () => ({ rows }));
    const { status, json } = await request(base, '/submit_list', { method: 'POST', body: valid });
    assert.equal(status, 201);
    assert.deepEqual(json, rows);
    assert.equal(queryCount(pool), 1);
    const { sql, params } = lastQuery(pool);
    assert.match(sql, /VALUES \(\$1, \$2, \$3\), \(\$4, \$5, \$6\) RETURNING/);
    assert.deepEqual(params, ['nathan', 'Abrams', 'S', 'nathan', 'Apollo', 'A']);
  });

  it('accepts a ranking for every hero', async (t) => {
    const full = HEROES.map((character) => ({ character, tier: 'S' }));
    const { pool, base } = await startApp(t, async () => ({ rows: [] }));
    const { status } = await request(base, '/submit_list', { method: 'POST', body: { user: 'nathan', rankings: full } });
    assert.equal(status, 201);
    const { sql, params } = lastQuery(pool);
    assert.equal(params.length, HEROES.length * 3);
    assert.ok(sql.includes(`($${params.length - 2}, $${params.length - 1}, $${params.length})`));
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/submit_list', { method: 'POST', body: valid });
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('GET /get_character/:character', () => {
  it('rejects an unknown hero with 400 and never queries the database', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await request(base, '/get_character/abrams');
    assert.equal(status, 400);
    assert.match(json.error, /^character /);
    assert.equal(queryCount(pool), 0);
  });

  it('returns 404 when the hero has no rankings', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [{ count: '0', average_tier: null }] }));
    const { status, json } = await request(base, '/get_character/Abrams');
    assert.equal(status, 404);
    assert.deepEqual(json, { error: 'No rankings found for specific hero' });
  });

  it('returns the count and average tier for a ranked hero', async (t) => {
    const { pool, base } = await startApp(t, async () => ({
      rows: [{ count: '6', average_tier: '3.1666666666666667' }],
    }));
    const { status, json } = await request(base, '/get_character/Abrams');
    assert.equal(status, 200);
    assert.deepEqual(json, { character: 'Abrams', average_tier: '3.1666666666666667', count: '6' });
    assert.deepEqual(lastQuery(pool).params, ['Abrams']);
  });

  for (const hero of HEROES.filter((name) => /[^A-Za-z]/.test(name))) {
    it(`handles the multi-word hero "${hero}"`, async (t) => {
      const { pool, base } = await startApp(t, async () => ({ rows: [{ count: '1', average_tier: '4' }] }));
      const { status, json } = await request(base, `/get_character/${encodeURIComponent(hero)}`);
      assert.equal(status, 200);
      assert.equal(json.character, hero);
      assert.deepEqual(lastQuery(pool).params, [hero]);
    });
  }

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/get_character/Abrams');
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('GET /average_list', () => {
  it('returns 404 when nothing has been ranked', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [] }));
    const { status, json } = await request(base, '/average_list');
    assert.equal(status, 404);
    assert.deepEqual(json, { error: 'No characters have been ranked' });
  });

  it('returns every hero, filling unranked ones with a null average', async (t) => {
    const abrams = { character: 'Abrams', count: '6', average_tier: '3.1666666666666667' };
    const wraith = { character: 'Wraith', count: '2', average_tier: '5.0000000000000000' };
    const { base } = await startApp(t, async () => ({ rows: [abrams, wraith] }));
    const { status, json } = await request(base, '/average_list');
    assert.equal(status, 200);
    assert.equal(json.length, HEROES.length);
    assert.deepEqual(json.map((entry) => entry.character), HEROES);
    assert.deepEqual(json.find((entry) => entry.character === 'Abrams'), abrams);
    assert.deepEqual(json.find((entry) => entry.character === 'Wraith'), wraith);
    assert.deepEqual(json.find((entry) => entry.character === 'Apollo'), {
      character: 'Apollo',
      average_tier: null,
      count: '0',
    });
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/average_list');
    assert.equal(status, 500);
    assert.match(json.error, /query failed/i);
  });
});

describe('request handling', () => {
  it('returns 404 for an unknown route', async (t) => {
    const { base } = await startApp(t);
    const { status } = await request(base, '/nope');
    assert.equal(status, 404);
  });

  it('returns 400 for malformed JSON', async (t) => {
    const { pool, base } = await startApp(t);
    const res = await fetch(`${base}/submit_character`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"user": ',
    });
    assert.equal(res.status, 400);
    assert.equal(queryCount(pool), 0);
  });
});

describe('rate limiting', () => {
  const okRows = { rows: [{ id: 1, user: 'nathan', character: 'Abrams', tier: 'S', count: '1', average_tier: '3' }] };
  const character = { user: 'nathan', character: 'Abrams', tier: 'S' };
  const list = { user: 'nathan', rankings: [{ character: 'Abrams', tier: 'S' }] };

  const endpoints = [
    { name: 'POST /submit_character', max: 10, send: (base) => request(base, '/submit_character', { method: 'POST', body: character }) },
    { name: 'POST /submit_list', max: 3, send: (base) => request(base, '/submit_list', { method: 'POST', body: list }) },
    { name: 'GET /get_character/:character', max: 60, send: (base) => request(base, '/get_character/Abrams') },
    { name: 'GET /average_list', max: 30, send: (base) => request(base, '/average_list') },
  ];

  for (const { name, max, send } of endpoints) {
    it(`${name} allows ${max} requests per minute, then returns 429`, async (t) => {
      const { base } = await startApp(t, async () => okRows);
      for (let i = 1; i <= max; i++) {
        const { status } = await send(base);
        assert.ok(status < 300, `request ${i} of ${max} should not be limited (got ${status})`);
      }
      const { status, json } = await send(base);
      assert.equal(status, 429);
      assert.deepEqual(json, { error: 'too many requests, slow down' });
    });
  }

  it('keeps a separate counter for each endpoint', async (t) => {
    const { base } = await startApp(t, async () => okRows);
    for (let i = 0; i < 4; i++) {
      await request(base, '/submit_list', { method: 'POST', body: list });
    }
    const limited = await request(base, '/submit_list', { method: 'POST', body: list });
    assert.equal(limited.status, 429);

    const other = await request(base, '/submit_character', { method: 'POST', body: character });
    assert.equal(other.status, 201);
  });

  it('counts rejected requests toward the limit', async (t) => {
    const { base } = await startApp(t, async () => okRows);
    const bad = { user: 'ab', rankings: [] };
    for (let i = 0; i < 3; i++) {
      const { status } = await request(base, '/submit_list', { method: 'POST', body: bad });
      assert.equal(status, 400);
    }
    const { status } = await request(base, '/submit_list', { method: 'POST', body: list });
    assert.equal(status, 429);
  });
});
