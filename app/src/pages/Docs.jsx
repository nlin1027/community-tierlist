import './Docs.css';

const BASE = 'https://api--community-tierlist--xgjq82288nbr.code.run';

const TIER_DESC = 'One of: Z, S, A, B, C, D';
const HERO_DESC = 'One of the 44 valid Deadlock heroes';
const AUTH_HEADER = 'Authorization: Bearer <token>';

const SESSION_FIELDS = [
  ['token', 'string', 'Session token. Send it as a Bearer token on signed-in endpoints.'],
  ['expires_at', 'string', 'When the token stops working (one week after it was issued)'],
  ['user.id', 'string', 'Account ID (UUID)'],
  ['user.username', 'string', 'Account username'],
];

const ROW_FIELDS = [
  ['id', 'integer', 'Auto-generated row ID'],
  ['user', 'string', 'Username of the account that submitted the ranking'],
  ['user_id', 'string', 'Account ID (UUID) that submitted the ranking'],
  ['character', 'string', HERO_DESC],
  ['tier', 'string', TIER_DESC],
  ['date', 'string', 'Timestamp the row was inserted'],
];

const GROUPS = [
  {
    title: 'Accounts',
    endpoints: [
      {
        method: 'POST',
        path: '/auth/register',
        description: 'Creates an account and signs it in.',
        tables: [{
          title: 'Request body',
          rows: [
            ['username', 'string', '3-20 letters and numbers. Unique, ignoring case.'],
            ['password', 'string', '8-128 characters'],
          ],
        }, { title: 'Response body', rows: SESSION_FIELDS }],
        examples: [`curl -X POST ${BASE}/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"username": "nathan", "password": "correct horse"}'`],
        responses: [
          ['201', 'account created; returns a session'],
          ['400', 'invalid username or password'],
          ['409', 'username is already taken'],
          ['429', 'more than 5 registrations per hour'],
          ['500', 'query failed'],
        ],
      },
      {
        method: 'POST',
        path: '/auth/login',
        description: 'Signs in to an existing account and issues a new one-week token.',
        tables: [{
          title: 'Request body',
          rows: [
            ['username', 'string', 'Account username (case-insensitive)'],
            ['password', 'string', 'Account password'],
          ],
        }, { title: 'Response body', rows: SESSION_FIELDS }],
        examples: [`curl -X POST ${BASE}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username": "nathan", "password": "correct horse"}'`],
        response: `{
  "token": "q8Z0b2...",
  "expires_at": "2026-12-04T16:00:00.000Z",
  "user": { "id": "8f1c...", "username": "nathan" }
}`,
        responses: [
          ['200', 'signed in; returns a session'],
          ['400', 'missing or malformed username/password'],
          ['401', 'invalid username or password'],
          ['429', 'more than 10 attempts per 15 minutes'],
          ['500', 'query failed'],
        ],
      },
      {
        method: 'GET',
        path: '/auth/me',
        auth: true,
        description: 'Returns the account behind a token. Useful for checking a stored token is still valid.',
        examples: [`curl ${BASE}/auth/me -H "${AUTH_HEADER}"`],
        response: `{
  "user": { "id": "8f1c...", "username": "nathan" },
  "expires_at": "2026-12-04T16:00:00.000Z"
}`,
        responses: [
          ['200', 'the signed-in account'],
          ['401', 'missing, expired or revoked token'],
        ],
      },
      {
        method: 'POST',
        path: '/auth/logout',
        auth: true,
        description: 'Revokes the token used to make the request.',
        examples: [`curl -X POST ${BASE}/auth/logout -H "${AUTH_HEADER}"`],
        responses: [
          ['204', 'token revoked'],
          ['401', 'missing, expired or revoked token'],
          ['500', 'query failed'],
        ],
      },
    ],
  },
  {
    title: 'Submitting rankings',
    endpoints: [
      {
        method: 'POST',
        path: '/submit_list',
        auth: true,
        description: 'Submits a full tier list in a single request.',
        tables: [{
          title: 'Request body',
          rows: [
            ['rankings', 'array', 'Non-empty array, at most one entry per hero'],
            ['rankings[].character', 'string', HERO_DESC],
            ['rankings[].tier', 'string', TIER_DESC],
          ],
        }, { title: 'Response body (array of rows)', rows: ROW_FIELDS }],
        examples: [
          `fetch('${BASE}/submit_list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: \`Bearer \${token}\`,
  },
  body: JSON.stringify({
    rankings: [
      { character: 'Seven', tier: 'Z' },
      { character: 'Haze', tier: 'S' },
    ],
  }),
});`,
        ],
        responses: [
          ['201', 'returns every inserted row'],
          ['400', 'invalid, duplicate or too many entries'],
          ['401', 'missing, expired or revoked token'],
          ['429', 'more than 3 lists per minute'],
          ['500', 'query failed'],
        ],
      },
      {
        method: 'POST',
        path: '/submit_character',
        auth: true,
        description: 'Submits a ranking for a single hero.',
        tables: [{
          title: 'Request body',
          rows: [
            ['character', 'string', HERO_DESC],
            ['tier', 'string', TIER_DESC],
          ],
        }, { title: 'Response body', rows: ROW_FIELDS }],
        examples: [`curl -X POST ${BASE}/submit_character \\
  -H "Content-Type: application/json" \\
  -H "${AUTH_HEADER}" \\
  -d '{"character": "Seven", "tier": "Z"}'`],
        responses: [
          ['201', 'returns the inserted row'],
          ['400', 'invalid character or tier'],
          ['401', 'missing, expired or revoked token'],
          ['429', 'more than 10 per minute'],
          ['500', 'query failed'],
        ],
      },
    ],
  },
  {
    title: 'Community averages',
    endpoints: [
      {
        method: 'GET',
        path: '/average_list',
        description: 'Average tier for every hero. Heroes with no rankings in the period are included with a null average.',
        tables: [{
          title: 'Query parameters (optional)',
          rows: [
            ['from', 'YYYY-MM-DD', 'Only count rankings on or after this day (UTC). Omit for the beginning.'],
            ['to', 'YYYY-MM-DD', 'Only count rankings on or before this day (UTC). Omit for today.'],
          ],
        }, {
          title: 'Response body (one entry per hero)',
          rows: [
            ['character', 'string', 'Hero name'],
            ['average_tier', 'string | null', 'Average tier value (1-6); null if unranked in the period'],
            ['count', 'string', 'Number of rankings counted'],
          ],
        }],
        examples: [
          `curl ${BASE}/average_list`,
          `curl "${BASE}/average_list?from=2026-07-15&to=2026-09-30"`,
        ],
        response: `[
  { "character": "Abrams", "average_tier": null, "count": "0" },
  { "character": "Haze", "average_tier": "5.2000000000000000", "count": "5" }
]`,
        responses: [
          ['200', 'averages for all heroes'],
          ['400', 'invalid date, or from is after to'],
          ['404', 'no rankings in the period'],
          ['500', 'query failed'],
        ],
      },
      {
        method: 'GET',
        path: '/get_character/:character',
        description: 'Average tier for one hero across all time.',
        tables: [{ title: 'Path parameter', rows: [['character', 'string', HERO_DESC]] }],
        examples: [`curl ${BASE}/get_character/Seven`],
        response: `{ "character": "Seven", "average_tier": "6.0000000000000000", "count": "1" }`,
        responses: [
          ['200', 'average tier and ranking count'],
          ['400', 'invalid character'],
          ['404', 'no rankings for this hero'],
          ['500', 'query failed'],
        ],
      },
    ],
  },
  {
    title: 'Players',
    endpoints: [
      {
        method: 'GET',
        path: '/users/search',
        description: 'Finds players whose username contains the search text (case-insensitive). Exact and prefix matches come first; at most 20 results.',
        tables: [{
          title: 'Query parameters',
          rows: [['q', 'string', '1-20 letters and numbers']],
        }, {
          title: 'Response body (array)',
          rows: [
            ['username', 'string', 'Player username'],
            ['created_at', 'string', 'When the account was created'],
            ['heroes_ranked', 'string', 'Number of distinct heroes the player has ranked'],
            ['last_submitted', 'string | null', 'Most recent submission, or null'],
          ],
        }],
        examples: [`curl "${BASE}/users/search?q=nat"`],
        responses: [
          ['200', 'matching players (possibly an empty array)'],
          ['400', 'invalid q'],
          ['500', 'query failed'],
        ],
      },
      {
        method: 'GET',
        path: '/users/:username/rankings',
        description: 'A player’s latest tier for each hero they have ranked.',
        tables: [{
          title: 'Response body',
          rows: [
            ['username', 'string', 'Player username'],
            ['last_updated', 'string | null', 'Most recent ranking, or null if none'],
            ['rankings[].character', 'string', HERO_DESC],
            ['rankings[].tier', 'string', TIER_DESC],
            ['rankings[].date', 'string', 'When this ranking was submitted'],
          ],
        }],
        examples: [`curl ${BASE}/users/nathan/rankings`],
        response: `{
  "username": "nathan",
  "last_updated": "2026-11-20T18:04:11.000Z",
  "rankings": [
    { "character": "Haze", "tier": "S", "date": "2026-11-20T18:04:11.000Z" }
  ]
}`,
        responses: [
          ['200', 'the player’s rankings (possibly empty)'],
          ['400', 'invalid username'],
          ['404', 'no such player'],
          ['500', 'query failed'],
        ],
      },
    ],
  },
];


function Endpoint({ method, path, auth, description, tables = [], examples = [], response, responses }) {
  return (
    <section>
      <h2>
        <span className={`method ${method.toLowerCase()}`}>{method}</span> {path}
      </h2>
      <p>
        {description}
        {auth && <> Requires sign-in: send <code>{AUTH_HEADER}</code>.</>}
      </p>

      {tables.map(({ title, rows }) => (
        <div key={title}>
          <h3>{title}</h3>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([field, type, desc]) => (
                <tr key={field}>
                  <td>{field}</td>
                  <td>{type}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {examples.length > 0 && <h3>Example</h3>}
      {examples.map((code) => <pre key={code}>{code}</pre>)}

      {response && (
        <>
          <h3>Example response</h3>
          <pre>{response}</pre>
        </>
      )}

      <h3>Responses</h3>
      <ul>
        {responses.map(([code, desc]) => (
          <li key={code}><code>{code}</code> — {desc}</li>
        ))}
      </ul>
    </section>
  );
}

function Docs() {
  return (
    <div className="docs">
      <h1>API Documentation</h1>
      <p>
        Base URL: <code>{BASE}</code>
      </p>
      <p>
        Endpoints marked as requiring sign-in need an <code>{AUTH_HEADER}</code> header, using the
        token returned by <code>/auth/login</code> or <code>/auth/register</code>.
      </p>

      {GROUPS.flatMap((group) => group.endpoints).map((ep) => <Endpoint key={ep.path} {...ep} />)}
    </div>
  );
}

export default Docs;
