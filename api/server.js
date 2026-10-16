require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const createApp = require('./app');
const pool = require('./db');
const redisClient = require('./redis');

redisClient.connect().catch((err) => console.error('redis conect failed', err));

const app = createApp({ pool, redisClient });
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
