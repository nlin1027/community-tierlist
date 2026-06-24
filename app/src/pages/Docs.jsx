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
        <pre>{`curl -X POST https://community-tierlist-api.onrender.com/submit_character \\
  -H "Content-Type: application/json" \\
  -d '{"user":"nathan","character":"Seven","tier":"Z"}'`}</pre>

        <h3>Responses</h3>
        <ul>
          <li><code>201</code> — returns the inserted row</li>
          <li><code>400</code> — invalid user, character, or tier</li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="method get">GET</span> /:character
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
        <pre>{`curl https://community-tierlist-api.onrender.com/Seven`}</pre>

        <h3>Response</h3>
        <pre>{`{
  "character": "Seven",
  "average_tier": 6,
  "count": 1
}`}</pre>

        <h3>Responses</h3>
        <ul>
          <li><code>200</code> — average tier and submission count</li>
          <li><code>400</code> — invalid character</li>
          <li><code>404</code> — no rankings found for this character</li>
        </ul>
      </section>
    </div>
  );
}

export default Docs;
