const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const createApp = require('../app');
const HEROES = require('../heroes');
const { hashPassword, hashToken, TOKEN_TTL_MS } = require('../auth');

// A token the fake pool recognises as a live session for SESSION_USER.
const TOKEN = 'test-token-0123456789abcdefghijklmnop';
const SESSION_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'nathan' };
const SESSION_EXPIRES = '2026-12-04T00:00:00.000Z';
const AUTH = { authorization: `Bearer ${TOKEN}` };

const isSessionLookup = (sql) => /FROM refresh_tokens t\s+JOIN users u/.test(sql);

// Builds a fresh app on a random port, wired to a fake pool instead of Postgres
// and with no Redis client, so rate limiting uses express-rate-limit's in-memory
// store. A new app per test means every test starts with empty rate-limit counters.
// The session lookup done by requireAuth is answered here; every other query goes
// to `query`, so tests only see the queries their endpoint makes.
async function startApp(t, query = async () => ({ rows: [] }), { sessionDown = false } = {}) {
  const pool = {
    query: mock.fn(async (sql, params) => {
      if (isSessionLookup(sql)) {
        if (sessionDown) throw new Error('db down');
        return params[0] === hashToken(TOKEN)
          ? { rows: [{ ...SESSION_USER, expires_at: SESSION_EXPIRES }] }
          : { rows: [] };
      }
      return query(sql, params);
    }),
  };
  const server = createApp({ pool }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return { pool, base };
}

async function request(base, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
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

const dataCalls = (pool) => pool.query.mock.calls.filter((call) => !isSessionLookup(call.arguments[0]));
const queryCount = (pool) => dataCalls(pool).length;
const lastQuery = (pool) => {
  const [sql, params] = dataCalls(pool).at(-1).arguments;
  return { sql, params };
};

// Shared checks for endpoints behind requireAuth.
function itRequiresAuth(send) {
  it('returns 401 without a token and never queries the database', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await send(base, {});
    assert.equal(status, 401);
    assert.equal(json.error, 'sign in required');
    assert.equal(pool.query.mock.callCount(), 0);
  });

  it('returns 401 for a malformed Authorization header', async (t) => {
    const { pool, base } = await startApp(t);
    const { status } = await send(base, { authorization: `Token ${TOKEN}` });
    assert.equal(status, 401);
    assert.equal(pool.query.mock.callCount(), 0);
  });

  it('returns 401 for an unknown, expired or revoked token', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await send(base, { authorization: 'Bearer some-other-token-abcdefghijklmnop' });
    assert.equal(status, 401);
    assert.match(json.error, /session expired or invalid/);
    assert.equal(queryCount(pool), 0);
  });

  it('only accepts sessions that are unrevoked and unexpired', async (t) => {
    const { pool, base } = await startApp(t);
    await send(base, AUTH);
    const [sql, params] = pool.query.mock.calls[0].arguments;
    assert.match(sql, /revoked_at IS NULL/);
    assert.match(sql, /expires_at > now\(\)/);
    assert.deepEqual(params, [hashToken(TOKEN)]);
  });

  it('returns 500 when the session lookup fails', async (t) => {
    const { base } = await startApp(t, undefined, { sessionDown: true });
    const { status, json } = await send(base, AUTH);
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
}

describe('GET /health', () => {
  it('returns ok without touching the database', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await request(base, '/health');
    assert.equal(status, 200);
    assert.deepEqual(json, { status: 'ok' });
    assert.equal(pool.query.mock.callCount(), 0);
  });

  it('sends CORS headers', async (t) => {
    const { base } = await startApp(t);
    const { headers } = await request(base, '/health');
    assert.equal(headers.get('access-control-allow-origin'), '*');
  });
});

describe('POST /auth/register', () => {
  const valid = { username: 'nathan', password: 'correct horse' };
  const send = (base, body) => request(base, '/auth/register', { method: 'POST', body });

  const badInputs = [
    ['username too short', { ...valid, username: 'ab' }, /^username /],
    ['username too long', { ...valid, username: 'a'.repeat(21) }, /^username /],
    ['username with symbols', { ...valid, username: 'nathan!' }, /^username /],
    ['username not a string', { ...valid, username: 123 }, /^username /],
    ['username missing', { password: valid.password }, /^username /],
    ['password too short', { ...valid, password: 'short' }, /^password /],
    ['password too long', { ...valid, password: 'x'.repeat(129) }, /^password /],
    ['password not a string', { ...valid, password: 12345678 }, /^password /],
    ['password missing', { username: 'nathan' }, /^password /],
  ];

  for (const [name, body, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await send(base, body);
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(pool.query.mock.callCount(), 0);
    });
  }

  it('creates the account and a one-week session in one query, returning 201', async (t) => {
    const expires = '2026-12-04T12:00:00.000Z';
    const { pool, base } = await startApp(t, async () => ({
      rows: [{ id: SESSION_USER.id, username: 'nathan', expires_at: expires }],
    }));
    const before = Date.now();
    const { status, json } = await send(base, valid);
    assert.equal(status, 201);
    assert.deepEqual(json.user, { id: SESSION_USER.id, username: 'nathan' });
    assert.equal(json.expires_at, expires);
    assert.match(json.token, /^[A-Za-z0-9_-]{40,}$/);

    assert.equal(queryCount(pool), 1);
    const { sql, params } = lastQuery(pool);
    assert.match(sql, /INSERT INTO users/);
    assert.match(sql, /INSERT INTO refresh_tokens/);
    assert.equal(params[0], 'nathan');
    assert.match(params[1], /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/, 'stores a scrypt hash, never the password');
    assert.notEqual(params[1], valid.password);
    assert.equal(params[2], hashToken(json.token), 'stores the token hash, never the token');
    const ttl = params[3].getTime() - before;
    assert.ok(ttl >= TOKEN_TTL_MS - 1000 && ttl <= TOKEN_TTL_MS + 5000, 'token lasts one week');
  });

  it('returns 409 when the username is taken', async (t) => {
    const { base } = await startApp(t, async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
    const { status, json } = await send(base, valid);
    assert.equal(status, 409);
    assert.deepEqual(json, { error: 'username is already taken' });
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await send(base, valid);
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('POST /auth/login', () => {
  const valid = { username: 'Nathan', password: 'correct horse' };
  const send = (base, body) => request(base, '/auth/login', { method: 'POST', body });

  // Real scrypt hash of valid.password, computed once.
  const storedHash = hashPassword(valid.password);
  const accountQuery = (overrides = {}) => async (sql) => {
    if (/FROM users WHERE/.test(sql)) {
      return { rows: [{ ...SESSION_USER, password_hash: await storedHash, ...overrides }] };
    }
    return { rows: [{ expires_at: SESSION_EXPIRES }] };
  };

  const badInputs = [
    ['username with symbols', { ...valid, username: 'nathan!' }, /^username /],
    ['username missing', { password: valid.password }, /^username /],
    ['password empty', { ...valid, password: '' }, /^password /],
    ['password too long', { ...valid, password: 'x'.repeat(129) }, /^password /],
    ['password missing', { username: 'nathan' }, /^password /],
  ];

  for (const [name, body, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await send(base, body);
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(pool.query.mock.callCount(), 0);
    });
  }

  it('signs in with the right password and issues a one-week token', async (t) => {
    const { pool, base } = await startApp(t, accountQuery());
    const before = Date.now();
    const { status, json } = await send(base, valid);
    assert.equal(status, 200);
    assert.deepEqual(json.user, SESSION_USER);
    assert.equal(json.expires_at, SESSION_EXPIRES);

    const [lookup, insert] = dataCalls(pool).map((call) => call.arguments);
    assert.match(lookup[0], /lower\(username\) = lower\(\$1\)/, 'usernames are case-insensitive');
    assert.deepEqual(lookup[1], ['Nathan']);
    assert.match(insert[0], /^INSERT INTO refresh_tokens/);
    assert.equal(insert[1][0], SESSION_USER.id);
    assert.equal(insert[1][1], hashToken(json.token));
    const ttl = insert[1][2].getTime() - before;
    assert.ok(ttl >= TOKEN_TTL_MS - 1000 && ttl <= TOKEN_TTL_MS + 5000, 'token lasts one week');
  });

  it('returns 401 for a wrong password without creating a session', async (t) => {
    const { pool, base } = await startApp(t, accountQuery());
    const { status, json } = await send(base, { ...valid, password: 'wrong password' });
    assert.equal(status, 401);
    assert.deepEqual(json, { error: 'invalid username or password' });
    assert.equal(queryCount(pool), 1);
  });

  it('returns the same 401 for an unknown username', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [] }));
    const { status, json } = await send(base, valid);
    assert.equal(status, 401);
    assert.deepEqual(json, { error: 'invalid username or password' });
    assert.equal(queryCount(pool), 1);
  });

  it('returns 401 for an account with no password', async (t) => {
    const { base } = await startApp(t, accountQuery({ password_hash: null }));
    const { status } = await send(base, valid);
    assert.equal(status, 401);
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await send(base, valid);
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('POST /auth/logout', () => {
  const send = (base, headers) => request(base, '/auth/logout', { method: 'POST', headers });

  itRequiresAuth(send);

  it('revokes the current session and returns 204', async (t) => {
    const { pool, base } = await startApp(t);
    const { status } = await send(base, AUTH);
    assert.equal(status, 204);
    const { sql, params } = lastQuery(pool);
    assert.match(sql, /^UPDATE refresh_tokens SET revoked_at = now\(\)/);
    assert.deepEqual(params, [hashToken(TOKEN)]);
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await send(base, AUTH);
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('GET /auth/me', () => {
  const send = (base, headers) => request(base, '/auth/me', { headers });

  itRequiresAuth(send);

  it('returns the signed-in user and when the session expires', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await send(base, AUTH);
    assert.equal(status, 200);
    assert.deepEqual(json, { user: SESSION_USER, expires_at: SESSION_EXPIRES });
    assert.equal(queryCount(pool), 0);
  });
});

describe('POST /submit_character', () => {
  const valid = { character: 'Abrams', tier: 'S' };
  const send = (base, headers, body = valid) =>
    request(base, '/submit_character', { method: 'POST', body, headers });

  itRequiresAuth((base, headers) => send(base, headers));

  const badInputs = [
    ['lowercase hero name', { ...valid, character: 'abrams' }, /^character /],
    ['unknown hero', { ...valid, character: 'Nobody' }, /^character /],
    ['hero missing', { tier: 'S' }, /^character /],
    ['tier not in the list', { ...valid, tier: 'X' }, /^tier /],
    ['lowercase tier', { ...valid, tier: 's' }, /^tier /],
    ['tier missing', { character: 'Abrams' }, /^tier /],
  ];

  for (const [name, body, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await send(base, AUTH, body);
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(queryCount(pool), 0);
    });
  }

  it('inserts under the signed-in account and returns 201 with the new row', async (t) => {
    const row = { id: 1, user: 'nathan', user_id: SESSION_USER.id, ...valid, date: '2026-10-16T00:00:00.000Z' };
    const { pool, base } = await startApp(t, async () => ({ rows: [row] }));
    const { status, json } = await send(base, AUTH);
    assert.equal(status, 201);
    assert.deepEqual(json, row);
    assert.equal(queryCount(pool), 1);
    const { sql, params } = lastQuery(pool);
    assert.match(sql, /^INSERT INTO deadlock \("user", user_id, character, tier\)/);
    assert.deepEqual(params, ['nathan', SESSION_USER.id, 'Abrams', 'S']);
  });

  it('ignores a user name sent in the body', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [{}] }));
    await send(base, AUTH, { ...valid, user: 'someoneelse' });
    assert.equal(lastQuery(pool).params[0], 'nathan');
  });

  it('accepts every valid tier', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [{}] }));
    for (const tier of ['D', 'C', 'B', 'A', 'S', 'Z']) {
      const { status } = await send(base, AUTH, { ...valid, tier });
      assert.equal(status, 201, `tier ${tier} should be accepted`);
    }
    assert.equal(queryCount(pool), 6);
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await send(base, AUTH);
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('POST /submit_list', () => {
  const rankings = [
    { character: 'Abrams', tier: 'S' },
    { character: 'Apollo', tier: 'A' },
  ];
  const valid = { rankings };
  const send = (base, headers, body = valid) =>
    request(base, '/submit_list', { method: 'POST', body, headers });

  itRequiresAuth((base, headers) => send(base, headers));

  const badInputs = [
    ['rankings missing', {}, /^rankings /],
    ['rankings not an array', { rankings: 'Abrams' }, /^rankings /],
    ['rankings empty', { rankings: [] }, /^rankings /],
    ['more rankings than heroes', { rankings: new Array(HEROES.length + 1).fill(rankings[0]) }, /^rankings /],
  ];

  for (const [name, body, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await send(base, AUTH, body);
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(queryCount(pool), 0);
    });
  }

  it('names the invalid hero in the error', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await send(base, AUTH, { rankings: [{ character: 'abrams', tier: 'S' }] });
    assert.equal(status, 400);
    assert.equal(json.error, 'invalid character: abrams');
    assert.equal(queryCount(pool), 0);
  });

  it('names the hero and tier when a tier is invalid', async (t) => {
    const { pool, base } = await startApp(t);
    const { status, json } = await send(base, AUTH, { rankings: [{ character: 'Abrams', tier: 'X' }] });
    assert.equal(status, 400);
    assert.equal(json.error, 'invalid tier for Abrams: X');
    assert.equal(queryCount(pool), 0);
  });

  it('rejects a hero listed twice', async (t) => {
    const { pool, base } = await startApp(t);
    const body = { rankings: [...rankings, { character: 'Abrams', tier: 'D' }] };
    const { status, json } = await send(base, AUTH, body);
    assert.equal(status, 400);
    assert.equal(json.error, 'duplicate character: Abrams');
    assert.equal(queryCount(pool), 0);
  });

  it('rejects the whole list when only one entry is invalid', async (t) => {
    const { pool, base } = await startApp(t);
    const body = { rankings: [...rankings, { character: 'Nobody', tier: 'S' }] };
    const { status } = await send(base, AUTH, body);
    assert.equal(status, 400);
    assert.equal(queryCount(pool), 0);
  });

  it('inserts every entry under the signed-in account in one query', async (t) => {
    const rows = rankings.map((r, i) => ({ id: i + 1, user: 'nathan', user_id: SESSION_USER.id, ...r }));
    const { pool, base } = await startApp(t, async () => ({ rows }));
    const { status, json } = await send(base, AUTH);
    assert.equal(status, 201);
    assert.deepEqual(json, rows);
    assert.equal(queryCount(pool), 1);
    const { sql, params } = lastQuery(pool);
    assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4\), \(\$5, \$6, \$7, \$8\) RETURNING/);
    assert.deepEqual(params, [
      'nathan', SESSION_USER.id, 'Abrams', 'S',
      'nathan', SESSION_USER.id, 'Apollo', 'A',
    ]);
  });

  it('accepts a ranking for every hero', async (t) => {
    const full = HEROES.map((character) => ({ character, tier: 'S' }));
    const { pool, base } = await startApp(t, async () => ({ rows: [] }));
    const { status } = await send(base, AUTH, { rankings: full });
    assert.equal(status, 201);
    const { sql, params } = lastQuery(pool);
    assert.equal(params.length, HEROES.length * 4);
    const n = params.length;
    assert.ok(sql.includes(`($${n - 3}, $${n - 2}, $${n - 1}, $${n})`));
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await send(base, AUTH);
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
  const badInputs = [
    ['from in the wrong format', '?from=06/01/2026', /^from /],
    ['from not a real day', '?from=2026-02-30', /^from /],
    ['from empty', '?from=', /^from /],
    ['from given twice', '?from=2026-06-01&from=2026-07-01', /^from /],
    ['to in the wrong format', '?to=2026-6-1', /^to /],
    ['to not a real day', '?to=2026-13-01', /^to /],
    ['from after to', '?from=2026-09-30&to=2026-07-15', /^from must be on or before to/],
  ];

  for (const [name, query, errorPattern] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await request(base, `/average_list${query}`);
      assert.equal(status, 400);
      assert.match(json.error, errorPattern);
      assert.equal(queryCount(pool), 0);
    });
  }

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

  it('averages all time when no range is given', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [] }));
    await request(base, '/average_list');
    assert.deepEqual(lastQuery(pool).params, [null, null]);
  });

  it('passes a full date range through to the query', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [{ character: 'Abrams', count: '1', average_tier: '5' }] }));
    const { status } = await request(base, '/average_list?from=2026-07-15&to=2026-09-30');
    assert.equal(status, 200);
    const { sql, params } = lastQuery(pool);
    assert.deepEqual(params, ['2026-07-15', '2026-09-30']);
    assert.match(sql, /date >= \(\$1::date\)/);
    assert.match(sql, /date < \(\$2::date \+ 1\)/, 'the end day is inclusive');
  });

  it('accepts an open-ended range on either side', async (t) => {
    const { pool, base } = await startApp(t, async () => ({ rows: [] }));
    await request(base, '/average_list?from=2026-06-01');
    assert.deepEqual(lastQuery(pool).params, ['2026-06-01', null]);
    await request(base, '/average_list?to=2026-08-31');
    assert.deepEqual(lastQuery(pool).params, [null, '2026-08-31']);
  });

  it('accepts a single-day range', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [{ character: 'Abrams', count: '1', average_tier: '5' }] }));
    const { status } = await request(base, '/average_list?from=2026-07-15&to=2026-07-15');
    assert.equal(status, 200);
  });

  it('returns 404 when nothing was ranked in the range', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [] }));
    const { status } = await request(base, '/average_list?from=2020-01-01&to=2020-01-31');
    assert.equal(status, 404);
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/average_list');
    assert.equal(status, 500);
    assert.match(json.error, /query failed/i);
  });
});

describe('GET /users/search', () => {
  const badInputs = [
    ['q missing', ''],
    ['q empty', '?q='],
    ['q too long', `?q=${'a'.repeat(21)}`],
    ['q with a LIKE wildcard', '?q=na%25'],
    ['q with an underscore', '?q=na_th'],
    ['q given twice', '?q=nat&q=han'],
  ];

  for (const [name, query] of badInputs) {
    it(`rejects ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await request(base, `/users/search${query}`);
      assert.equal(status, 400);
      assert.match(json.error, /^q /);
      assert.equal(queryCount(pool), 0);
    });
  }

  it('returns matching users with their ranking summary', async (t) => {
    const rows = [
      { username: 'nathan', created_at: '2026-11-01T00:00:00.000Z', heroes_ranked: '44', last_submitted: '2026-11-20T00:00:00.000Z' },
      { username: 'jonathan', created_at: '2026-11-02T00:00:00.000Z', heroes_ranked: '0', last_submitted: null },
    ];
    const { pool, base } = await startApp(t, async () => ({ rows }));
    const { status, json } = await request(base, '/users/search?q=Nathan');
    assert.equal(status, 200);
    assert.deepEqual(json, rows);
    const { sql, params } = lastQuery(pool);
    assert.deepEqual(params, ['Nathan']);
    assert.match(sql, /lower\(u\.username\) LIKE '%' \|\| lower\(\$1\) \|\| '%'/);
    assert.match(sql, /LIMIT 20/);
  });

  it('returns an empty list when nobody matches', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [] }));
    const { status, json } = await request(base, '/users/search?q=zzz');
    assert.equal(status, 200);
    assert.deepEqual(json, []);
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/users/search?q=nathan');
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
  });
});

describe('GET /users/:username/rankings', () => {
  const badNames = [
    ['too short', 'ab'],
    ['too long', 'a'.repeat(21)],
    ['with symbols', 'nathan!'],
  ];

  for (const [name, username] of badNames) {
    it(`rejects a username ${name} with 400 and never queries the database`, async (t) => {
      const { pool, base } = await startApp(t);
      const { status, json } = await request(base, `/users/${encodeURIComponent(username)}/rankings`);
      assert.equal(status, 400);
      assert.match(json.error, /^username /);
      assert.equal(queryCount(pool), 0);
    });
  }

  it("returns the user's latest tier for each hero", async (t) => {
    const rows = [
      { username: 'Nathan', character: 'Abrams', tier: 'S', date: '2026-11-01T00:00:00.000Z' },
      { username: 'Nathan', character: 'Haze', tier: 'Z', date: '2026-11-20T00:00:00.000Z' },
    ];
    const { pool, base } = await startApp(t, async () => ({ rows }));
    const { status, json } = await request(base, '/users/nathan/rankings');
    assert.equal(status, 200);
    assert.deepEqual(json, {
      username: 'Nathan',
      last_updated: '2026-11-20T00:00:00.000Z',
      rankings: rows.map(({ character, tier, date }) => ({ character, tier, date })),
    });
    const { sql, params } = lastQuery(pool);
    assert.deepEqual(params, ['nathan']);
    assert.match(sql, /DISTINCT ON \(d\.character\)/);
    assert.match(sql, /ORDER BY d\.character, d\.date DESC/);
  });

  it('returns an empty list for a user who has not ranked yet', async (t) => {
    const { base } = await startApp(t, async () => ({
      rows: [{ username: 'nathan', character: null, tier: null, date: null }],
    }));
    const { status, json } = await request(base, '/users/nathan/rankings');
    assert.equal(status, 200);
    assert.deepEqual(json, { username: 'nathan', last_updated: null, rankings: [] });
  });

  it('returns 404 when the user does not exist', async (t) => {
    const { base } = await startApp(t, async () => ({ rows: [] }));
    const { status, json } = await request(base, '/users/nobody/rankings');
    assert.equal(status, 404);
    assert.deepEqual(json, { error: 'user not found' });
  });

  it('returns 500 when the database fails', async (t) => {
    const { base } = await startApp(t, dbDown);
    const { status, json } = await request(base, '/users/nathan/rankings');
    assert.equal(status, 500);
    assert.deepEqual(json, { error: 'query failed' });
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
      headers: { 'content-type': 'application/json', ...AUTH },
      body: '{"character": ',
    });
    assert.equal(res.status, 400);
    assert.equal(pool.query.mock.callCount(), 0);
  });
});

describe('rate limiting', () => {
  const okRows = {
    rows: [{
      id: 1, user: 'nathan', username: 'nathan', character: 'Abrams', tier: 'S',
      count: '1', average_tier: '3', expires_at: SESSION_EXPIRES, date: SESSION_EXPIRES,
    }],
  };
  const character = { character: 'Abrams', tier: 'S' };
  const list = { rankings: [{ character: 'Abrams', tier: 'S' }] };
  const register = { username: 'nathan', password: 'correct horse' };

  const endpoints = [
    { name: 'POST /submit_character', max: 10, send: (base) => request(base, '/submit_character', { method: 'POST', body: character, headers: AUTH }) },
    { name: 'POST /submit_list', max: 3, send: (base) => request(base, '/submit_list', { method: 'POST', body: list, headers: AUTH }) },
    { name: 'GET /get_character/:character', max: 60, send: (base) => request(base, '/get_character/Abrams') },
    { name: 'GET /average_list', max: 30, send: (base) => request(base, '/average_list') },
    { name: 'POST /auth/register', max: 5, send: (base) => request(base, '/auth/register', { method: 'POST', body: register }) },
    // Unknown user -> 401, which still counts toward the limit; the 11th attempt is 429.
    { name: 'POST /auth/login', max: 10, okStatus: 401, send: (base) => request(base, '/auth/login', { method: 'POST', body: register }) },
    { name: 'POST /auth/logout', max: 30, send: (base) => request(base, '/auth/logout', { method: 'POST', headers: AUTH }) },
    { name: 'GET /auth/me', max: 60, send: (base) => request(base, '/auth/me', { headers: AUTH }) },
    { name: 'GET /users/search', max: 60, send: (base) => request(base, '/users/search?q=nat') },
    { name: 'GET /users/:username/rankings', max: 60, send: (base) => request(base, '/users/nathan/rankings') },
  ];

  for (const { name, max, send, okStatus } of endpoints) {
    it(`${name} allows ${max} requests, then returns 429`, async (t) => {
      const query = okStatus === 401 ? async () => ({ rows: [] }) : async () => okRows;
      const { base } = await startApp(t, query);
      for (let i = 1; i <= max; i++) {
        const { status } = await send(base);
        if (okStatus) {
          assert.equal(status, okStatus, `request ${i} of ${max} should not be limited (got ${status})`);
        } else {
          assert.ok(status < 300, `request ${i} of ${max} should not be limited (got ${status})`);
        }
      }
      const { status, json } = await send(base);
      assert.equal(status, 429);
      assert.deepEqual(json, { error: 'too many requests, slow down' });
    });
  }

  it('keeps a separate counter for each endpoint', async (t) => {
    const { base } = await startApp(t, async () => okRows);
    for (let i = 0; i < 4; i++) {
      await request(base, '/submit_list', { method: 'POST', body: list, headers: AUTH });
    }
    const limited = await request(base, '/submit_list', { method: 'POST', body: list, headers: AUTH });
    assert.equal(limited.status, 429);

    const other = await request(base, '/submit_character', { method: 'POST', body: character, headers: AUTH });
    assert.equal(other.status, 201);
  });

  it('counts rejected requests toward the limit', async (t) => {
    const { base } = await startApp(t, async () => okRows);
    const bad = { rankings: [] };
    for (let i = 0; i < 3; i++) {
      const { status } = await request(base, '/submit_list', { method: 'POST', body: bad, headers: AUTH });
      assert.equal(status, 400);
    }
    const { status } = await request(base, '/submit_list', { method: 'POST', body: list, headers: AUTH });
    assert.equal(status, 429);
  });

  it('counts unauthenticated requests toward the limit', async (t) => {
    const { base } = await startApp(t, async () => okRows);
    for (let i = 0; i < 3; i++) {
      const { status } = await request(base, '/submit_list', { method: 'POST', body: list });
      assert.equal(status, 401);
    }
    const { status } = await request(base, '/submit_list', { method: 'POST', body: list, headers: AUTH });
    assert.equal(status, 429);
  });
});
