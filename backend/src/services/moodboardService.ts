import multer from "multer";
import { Moodboard } from "../models/Moodboard.js";
import { ApiError } from "../utils/api-error.js";
import {
  createMoodboardFromQuery,
  createMoodboardFromCatalogue,
  createMoodboardFromImage,
  getAgentJobStatus,
} from "./agentService.js";

export async function createFromQuery(userId: string, query: string) {
  const { job_id } = await createMoodboardFromQuery(query);
  const doc = await Moodboard.create({
    userId,
    jobId: job_id,
    status: "pending",
    inputMode: "query",
    inputPayload: { query },
    name: query.slice(0, 60),
  });
  return doc;
}

export async function createFromCatalogue(userId: string, catalogueItemId: string) {
  const { job_id } = await createMoodboardFromCatalogue(catalogueItemId);
  const doc = await Moodboard.create({
    userId,
    jobId: job_id,
    status: "pending",
    inputMode: "catalogue",
    inputPayload: { catalogue_item_id: catalogueItemId },
    name: catalogueItemId,
  });
  return doc;
}

export async function createFromImage(userId: string, imageUrl: string) {
  const { job_id } = await createMoodboardFromImage(imageUrl);
  const doc = await Moodboard.create({
    userId,
    jobId: job_id,
    status: "pending",
    inputMode: "image",
    inputPayload: { image_url: imageUrl },
    name: "Image upload",
  });
  return doc;
}

export async function getById(userId: string, moodboardId: string) {
  const doc = await Moodboard.findOne({ _id: moodboardId, userId });
  if (!doc) throw new ApiError(404, "Moodboard not found");

  if (doc.status === "pending" || doc.status === "running") {
    const agentStatus = await getAgentJobStatus(doc.jobId);
    doc.status = agentStatus.status as typeof doc.status;
    if (agentStatus.status === "done" && agentStatus.moodboard) {
      doc.moodboard = agentStatus.moodboard;
    }
    if (agentStatus.status === "error") {
      doc.error = agentStatus.error ?? "Agent error";
    }
    await doc.save();
  }

  return doc;
}

export async function listByUser(userId: string) {
  return Moodboard.find({ userId }).sort({ createdAt: -1 }).select("-moodboard");
}

export async function deleteById(userId: string, moodboardId: string) {
  const doc = await Moodboard.findOneAndDelete({ _id: moodboardId, userId });
  if (!doc) throw new ApiError(404, "Moodboard not found");
}

export async function updateName(userId: string, moodboardId: string, name: string) {
  const doc = await Moodboard.findOneAndUpdate(
    { _id: moodboardId, userId },
    { name },
    { new: true },
  );
  if (!doc) throw new ApiError(404, "Moodboard not found");
  return doc;
}
