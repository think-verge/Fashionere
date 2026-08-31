import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import Workspace from "../models/Workspace.js";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function serialize(ws) {
  return {
    id: ws._id.toString(),
    name: ws.name,
    project_id: ws.project_id.toString(),
    user_id: ws.user_id.toString(),
    status: ws.status,
    elements: ws.elements || [],
    canvas_meta: ws.canvas_meta || {},
    created_at: ws.created_at,
    updated_at: ws.updated_at,
  };
}

// GET /workspace?projectId=xxx
router.get("/", async (req, res, next) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const project = await Project.findOne({ _id: projectId, user_id: req.user.id });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const workspaces = await Workspace.find({ project_id: projectId, user_id: req.user.id }).sort({ updated_at: -1 });
    res.json(workspaces.map(serialize));
  } catch (err) {
    next(err);
  }
});

// POST /workspace
router.post("/", async (req, res, next) => {
  try {
    const { name, project_id } = req.body;
    if (!name || !project_id) return res.status(400).json({ error: "name and project_id are required" });

    const project = await Project.findOne({ _id: project_id, user_id: req.user.id });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const ws = await Workspace.create({ name, project_id, user_id: req.user.id });
    res.status(201).json(serialize(ws));
  } catch (err) {
    next(err);
  }
});

// GET /workspace/:id
router.get("/:id", async (req, res, next) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    res.json(serialize(ws));
  } catch (err) {
    next(err);
  }
});

// DELETE /workspace/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await Workspace.deleteOne({ _id: req.params.id, user_id: req.user.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /workspace/:id/elements  — append single element
router.post("/:id/elements", async (req, res, next) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    const element = { element_id: uuidv4(), row: req.body.garment_type, ...req.body };
    ws.elements.push(element);
    await ws.save();
    res.json(serialize(ws));
  } catch (err) {
    next(err);
  }
});

// PUT /workspace/:id/elements  — full canvas replace
router.put("/:id/elements", async (req, res, next) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    const { elements, canvas_meta } = req.body;
    if (elements) ws.elements = elements;
    if (canvas_meta !== undefined) ws.canvas_meta = canvas_meta;
    await ws.save();
    res.json(serialize(ws));
  } catch (err) {
    next(err);
  }
});

// DELETE /workspace/:id/elements/:elementId
router.delete("/:id/elements/:elementId", async (req, res, next) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    ws.elements = ws.elements.filter((e) => e.element_id !== req.params.elementId);
    await ws.save();
    res.json(serialize(ws));
  } catch (err) {
    next(err);
  }
});

// POST /workspace/:id/generate  — stub
router.post("/:id/generate", async (req, res, next) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    if (ws.elements.length === 0) return res.status(400).json({ error: "Workspace has no elements" });

    ws.status = "generating";
    await ws.save();

    // TODO: call Python AI engine with workspace payload
    // agentService.generateMoodboard({ workspace_id: ws._id, elements: ws.elements })

    res.status(202).json({ job_id: ws._id.toString(), status: "generating" });
  } catch (err) {
    next(err);
  }
});

export default router;
