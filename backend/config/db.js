const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "car_dealership",
  password: "root1234", // your password
  port: 5432,
});

module.exports = pool;