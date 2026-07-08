import './Docs.css';

function Docs() {
  return (
    <div className="docs">
      <h1>API Documentation</h1>
      <p>
        Base URL: <code>https://community-tierlist-api.onrender.com</code>
      </p>

      <section>
        <h2>
          <span className="method post">POST</span> /submit_character
        </h2>
        <p>Inserts a hero ranking submitted by a user.</p>

        <h3>Request body</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>user</td>
              <td>string</td>
              <td>Name of the user submitting the ranking</td>
            </tr>
            <tr>
              <td>character</td>
              <td>string</td>
              <td>One of the 38 valid Deadlock heroes</td>
            </tr>
            <tr>
              <td>tier</td>
              <td>string</td>
              <td>One of: Z, S, A, B, C, D</td>
            </tr>
          </tbody>
        </table>

        <h3>Example</h3>
        <pre>{`fetch('https://community-tierlist-api.onrender.com/submit_character', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user: 'nathan', character: 'Seven', tier: 'Z' }),
});`}</pre>
        <pre>{`curl -X POST https://community-tierlist-api.onrender.com/submit_character \\
  -H "Content-Type: application/json" \\
  -d '{"user": "nathan", "character": "Seven", "tier": "Z"}'`}</pre>

        <h3>Response body</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>id</td>
              <td>integer</td>
              <td>Auto-generated row ID</td>
            </tr>
            <tr>
              <td>user</td>
              <td>string</td>
              <td>Name of the user who submitted the ranking</td>
            </tr>
            <tr>
              <td>character</td>
              <td>string</td>
              <td>One of the 38 valid Deadlock heroes</td>
            </tr>
            <tr>
              <td>tier</td>
              <td>string</td>
              <td>One of: Z, S, A, B, C, D</td>
            </tr>
            <tr>
              <td>date</td>
              <td>string</td>
              <td>Timestamp the row was inserted</td>
            </tr>
          </tbody>
        </table>

        <h3>Responses</h3>
        <ul>
          <li><code>201</code> — returns the inserted row</li>
          <li><code>400</code> — invalid user, character, or tier</li>
          <li><code>500</code> — query failed</li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="method post">POST</span> /submit_list
        </h2>
        <p>Inserts a full tier list of hero rankings submitted by a user in a single request.</p>

        <h3>Request body</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>user</td>
              <td>string</td>
              <td>Name of the user submitting the rankings</td>
            </tr>
            <tr>
              <td>rankings</td>
              <td>array</td>
              <td>Non-empty array of ranking objects</td>
            </tr>
            <tr>
              <td>rankings[].character</td>
              <td>string</td>
              <td>One of the 38 valid Deadlock heroes</td>
            </tr>
            <tr>
              <td>rankings[].tier</td>
              <td>string</td>
              <td>One of: Z, S, A, B, C, D</td>
            </tr>
          </tbody>
        </table>

        <h3>Example</h3>
        <pre>{`fetch('https://community-tierlist-api.onrender.com/submit_list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user: 'nathan',
    rankings: [
      { character: 'Seven', tier: 'Z' },
      { character: 'Haze', tier: 'S' },
    ],
  }),
});`}</pre>
        <pre>{`curl -X POST https://community-tierlist-api.onrender.com/submit_list \\
  -H "Content-Type: application/json" \\
  -d '{
    "user": "nathan",
    "rankings": [
      { "character": "Seven", "tier": "Z" },
      { "character": "Haze", "tier": "S" }
    ]
  }'`}</pre>

        <h3>Response body</h3>
        <p>Array of inserted rows, each with the following fields:</p>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>id</td>
              <td>integer</td>
              <td>Auto-generated row ID</td>
            </tr>
            <tr>
              <td>user</td>
              <td>string</td>
              <td>Name of the user who submitted the rankings</td>
            </tr>
            <tr>
              <td>character</td>
              <td>string</td>
              <td>One of the 38 valid Deadlock heroes</td>
            </tr>
            <tr>
              <td>tier</td>
              <td>string</td>
              <td>One of: Z, S, A, B, C, D</td>
            </tr>
            <tr>
              <td>date</td>
              <td>string</td>
              <td>Timestamp the row was inserted</td>
            </tr>
          </tbody>
        </table>

        <h3>Responses</h3>
        <ul>
          <li><code>201</code> — returns an array of all inserted rows</li>
          <li><code>400</code> — invalid user, character, or tier</li>
          <li><code>500</code> — query failed</li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="method get">GET</span> /get_character/:character
        </h2>
        <p>Returns the average tier ranking for a specific hero.</p>

        <h3>Path parameter</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>character</td>
              <td>string</td>
              <td>One of the 38 valid Deadlock heroes</td>
            </tr>
          </tbody>
        </table>

        <h3>Example</h3>
        <pre>{`fetch('https://community-tierlist-api.onrender.com/get_character/Seven');`}</pre>
        <pre>{`curl https://community-tierlist-api.onrender.com/get_character/Seven`}</pre>

        <h3>Response body</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>character</td>
              <td>string</td>
              <td>The requested hero</td>
            </tr>
            <tr>
              <td>average_tier</td>
              <td>string</td>
              <td>Average tier value (1–6) across all submissions</td>
            </tr>
            <tr>
              <td>count</td>
              <td>string</td>
              <td>Number of submissions for this hero</td>
            </tr>
          </tbody>
        </table>

        <h3>Response</h3>
        <pre>{`{
  "character": "Seven",
  "average_tier": "6.0000000000000000",
  "count": "1"
}`}</pre>

        <h3>Responses</h3>
        <ul>
          <li><code>200</code> — average tier and submission count</li>
          <li><code>400</code> — invalid character</li>
          <li><code>404</code> — no rankings found for this character</li>
          <li><code>500</code> — query failed</li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="method get">GET</span> /average_list
        </h2>
        <p>Returns the average tier ranking for every hero. Heroes with no submissions are still included, with a <code>null</code> average.</p>

        <h3>Example</h3>
        <pre>{`fetch('https://community-tierlist-api.onrender.com/average_list');`}</pre>
        <pre>{`curl https://community-tierlist-api.onrender.com/average_list`}</pre>

        <h3>Response body</h3>
        <p>Array of one entry per hero (38 total):</p>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>character</td>
              <td>string</td>
              <td>Hero name</td>
            </tr>
            <tr>
              <td>average_tier</td>
              <td>string | null</td>
              <td>Average tier value (1–6); <code>null</code> if the hero has no submissions</td>
            </tr>
            <tr>
              <td>count</td>
              <td>string</td>
              <td>Number of submissions for this hero; <code>"0"</code> if the hero has no submissions</td>
            </tr>
          </tbody>
        </table>

        <h3>Response</h3>
        <pre>{`[
  { "character": "Abrams", "average_tier": null, "count": "0" },
  { "character": "Haze", "average_tier": "5.2000000000000000", "count": "5" },
  { "character": "Seven", "average_tier": "6.0000000000000000", "count": "1" }
]`}</pre>

        <h3>Responses</h3>
        <ul>
          <li><code>200</code> — average tier and submission count for all heroes</li>
          <li><code>404</code> — no characters have been ranked</li>
          <li><code>500</code> — query failed</li>
        </ul>
      </section>
    </div>
  );
}

export default Docs;
