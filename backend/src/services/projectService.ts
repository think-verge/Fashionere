import { Project } from "../models/Project.js";
import { ApiError } from "../utils/api-error.js";

export async function listProjects(userId: string) {
  return Project.find({ userId }).sort({ createdAt: -1 });
}

export async function createProject(
  userId: string,
  name: string,
  description: string,
  tags: string[],
) {
  return Project.create({ userId, name, description, tags });
}

export async function getProject(userId: string, projectId: string) {
  const doc = await Project.findOne({ _id: projectId, userId }).populate("moodboardIds");
  if (!doc) throw new ApiError(404, "Project not found");
  return doc;
}

export async function updateProject(
  userId: string,
  projectId: string,
  updates: { name?: string; description?: string; tags?: string[] },
) {
  const doc = await Project.findOneAndUpdate({ _id: projectId, userId }, updates, {
    new: true,
  });
  if (!doc) throw new ApiError(404, "Project not found");
  return doc;
}

export async function deleteProject(userId: string, projectId: string) {
  const doc = await Project.findOneAndDelete({ _id: projectId, userId });
  if (!doc) throw new ApiError(404, "Project not found");
}

export async function addMoodboardToProject(
  userId: string,
  projectId: string,
  moodboardId: string,
) {
  const doc = await Project.findOneAndUpdate(
    { _id: projectId, userId },
    { $addToSet: { moodboardIds: moodboardId } },
    { new: true },
  );
  if (!doc) throw new ApiError(404, "Project not found");
  return doc;
}
