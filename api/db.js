const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Supabase's cert chain isn't in Node's trust store. Download the root cert
// (Dashboard -> Database settings -> SSL) to api/certs/supabase-ca.crt.
const caPath = path.join(__dirname, 'certs', 'supabase-ca.crt');
const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf8') : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca },
});

module.exports = pool;
