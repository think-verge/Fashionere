import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { ApiError } from "../utils/api-error.js";

function signToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: "7d" });
}

function serializeUser(user: InstanceType<typeof User>) {
  return {
    id: user.id as string,
    email: user.email,
    name: user.name,
    role: user.role,
    sources: user.sources,
    garment_interests: user.garment_interests,
    onboarding_complete: user.onboarding_complete,
  };
}

function serializeProject(project: InstanceType<typeof Project>) {
  return {
    id: project.id as string,
    name: project.name,
    is_default: (project as unknown as { is_default: boolean }).is_default ?? true,
  };
}

export async function signup(
  email: string,
  password: string,
  name: string,
  role: "designer" | "retail_chain" = "designer",
  sources: string[] = [],
  garment_interests: string[] = [],
) {
  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, "Email already in use");

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    email,
    password: hashed,
    name,
    role,
    sources,
    garment_interests,
    onboarding_complete: true,
  });

  const project = await Project.create({
    userId: user._id,
    name: "Default Project",
    description: "",
    is_default: true,
    moodboardIds: [],
    tags: [],
  });

  const token = signToken(user.id, user.email);
  return { token, user: serializeUser(user), project: serializeProject(project) };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(401, "Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new ApiError(401, "Invalid credentials");

  const project = await Project.findOne({ userId: user._id });

  const token = signToken(user.id, user.email);
  return {
    token,
    user: serializeUser(user),
    project: project ? serializeProject(project) : null,
  };
}

export async function getMe(userId: string) {
  const user = await User.findById(userId).select("-password");
  if (!user) throw new ApiError(404, "User not found");
  return serializeUser(user);
}

export async function updateProfile(userId: string, name: string) {
  const user = await User.findByIdAndUpdate(userId, { name }, { new: true, select: "-password" });
  if (!user) throw new ApiError(404, "User not found");
  return serializeUser(user);
}
