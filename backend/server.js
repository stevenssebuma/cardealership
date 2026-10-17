import dotenv from "dotenv";
import app from "./app.js";
import { createIndexes, verifyIndexes } from "./config/indexes.js";

dotenv.config();
const port = process.env.PORT || 5000;

async function initializeDatabase() {
  try {
    await createIndexes();
    await verifyIndexes();
  } catch (error) {
    console.error("Database initialization error:", error.message);
  }
}

app.listen(port, async () => {
  console.log(`Panda Motors API listening on port ${port}`);
  await initializeDatabase();
});
