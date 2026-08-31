import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import looksRoutes from "./routes/looks.js";
import workspaceRoutes from "./routes/workspace.js";
import projectsRoutes from "./routes/projects.js";
import inventoryRoutes from "./routes/inventory.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/looks", looksRoutes);
app.use("/api/v1/workspace", workspaceRoutes);
app.use("/api/v1/projects", projectsRoutes);
app.use("/api/v1/inventory", inventoryRoutes);

app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Fashionare API listening on :${PORT}`));
});

export default app;
