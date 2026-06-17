import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";

const app = createApp();

connectDB()
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`Centoire backend running on http://localhost:${env.PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
