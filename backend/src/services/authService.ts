import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/api-error.js";

export async function signup(email: string, password: string, name: string) {
  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, "Email already in use");

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({ email, password: hashed, name });

  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(401, "Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new ApiError(401, "Invalid credentials");

  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

export async function getMe(userId: string) {
  const user = await User.findById(userId).select("-password");
  if (!user) throw new ApiError(404, "User not found");
  return { id: user.id, email: user.email, name: user.name };
}

export async function updateProfile(userId: string, name: string) {
  const user = await User.findByIdAndUpdate(
    userId,
    { name },
    { new: true, select: "-password" },
  );
  if (!user) throw new ApiError(404, "User not found");
  return { id: user.id, email: user.email, name: user.name };
}
