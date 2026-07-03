CREATE TABLE IF NOT EXISTS deadlock (
  id SERIAL PRIMARY KEY,
  "user" TEXT NOT NULL,
  character TEXT NOT NULL,
  tier CHAR(1) NOT NULL CHECK (tier IN ('D', 'C', 'B', 'A', 'S', 'Z')),
  date TIMESTAMP DEFAULT NOW()
);

--@block
SELECT * FROM deadlock;

--@block
DROP TABLE IF EXISTS deadlock;