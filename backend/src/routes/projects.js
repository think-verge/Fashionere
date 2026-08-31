import { Router } from "express";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function serialize(p) {
  return {
    id: p._id.toString(),
    name: p.name,
    user_id: p.user_id.toString(),
    is_default: p.is_default,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

// GET /projects
router.get("/", async (req, res, next) => {
  try {
    const projects = await Project.find({ user_id: req.user.id }).sort({ created_at: 1 });
    res.json(projects.map(serialize));
  } catch (err) {
    next(err);
  }
});

// POST /projects
router.post("/", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const project = await Project.create({ name, user_id: req.user.id });
    res.status(201).json(serialize(project));
  } catch (err) {
    next(err);
  }
});

export default router;
