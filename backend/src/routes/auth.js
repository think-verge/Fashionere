import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Project from "../models/Project.js";

const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function serializeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    sources: user.sources,
    garment_interests: user.garment_interests,
    onboarding_complete: user.onboarding_complete,
  };
}

// POST /auth/signup
router.post("/signup", async (req, res, next) => {
  try {
    const { name, email, password, role, sources = [], garment_interests = [] } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password and role are required" });
    }
    if (!["designer", "retail_chain"].includes(role)) {
      return res.status(400).json({ error: "role must be designer or retail_chain" });
    }
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const password_hash = await User.hashPassword(password);
    const user = await User.create({
      name, email, password_hash, role, sources, garment_interests, onboarding_complete: true,
    });

    const project = await Project.create({
      name: "Default Project",
      user_id: user._id,
      is_default: true,
    });

    res.status(201).json({
      token: signToken(user),
      user: serializeUser(user),
      project: {
        id: project._id.toString(),
        name: project.name,
        user_id: user._id.toString(),
        is_default: project.is_default,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const project = await Project.findOne({ user_id: user._id, is_default: true });

    res.json({
      token: signToken(user),
      user: serializeUser(user),
      project: project
        ? {
            id: project._id.toString(),
            name: project.name,
            user_id: user._id.toString(),
            is_default: project.is_default,
            created_at: project.created_at,
            updated_at: project.updated_at,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
