require('dotenv').config();

const Pool = require('pg').Pool;

// const pool = new Pool({
//   user: process.env.PGUSER,
//   password: process.env.PGPASSWORD,
//   host: process.env.PGHOST,
//   port: process.env.PGPORT,
//   database: process.env.PGDATABASE,
// });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

module.exports = pool;
