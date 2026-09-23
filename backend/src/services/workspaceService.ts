import { v4 as uuidv4 } from "uuid";
import { Workspace } from "../models/Workspace.js";
import { ApiError } from "../utils/api-error.js";
import type { IWorkspaceElement } from "../models/Workspace.js";

export async function listWorkspaces(userId: string, projectId?: string) {
  const filter: Record<string, unknown> = { user_id: userId };
  if (projectId) filter.project_id = projectId;
  return Workspace.find(filter).sort({ updatedAt: -1 }).lean();
}

export async function getWorkspace(id: string, userId: string) {
  const ws = await Workspace.findOne({ _id: id, user_id: userId }).lean();
  if (!ws) throw new ApiError(404, "Workspace not found");
  return ws;
}

export async function createWorkspace(userId: string, projectId: string, name: string) {
  return Workspace.create({ name, project_id: projectId, user_id: userId, elements: [] });
}

export async function renameWorkspace(id: string, userId: string, name: string) {
  const ws = await Workspace.findOneAndUpdate(
    { _id: id, user_id: userId },
    { name: name.trim() },
    { new: true },
  ).lean();
  if (!ws) throw new ApiError(404, "Workspace not found");
  return ws;
}

export async function appendElement(id: string, userId: string, element: Partial<IWorkspaceElement>) {
  const ws = await Workspace.findOne({ _id: id, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");
  const el: IWorkspaceElement = {
    element_id: element.element_id ?? uuidv4(),
    look_id: element.look_id!,
    garment_id: element.garment_id!,
    garment_type: element.garment_type!,
    element_type: element.element_type!,
    data: element.data ?? {},
    source_brand: element.source_brand ?? "",
    canvas_position: element.canvas_position ?? { x: 0, y: 0 },
    row: element.row ?? element.garment_type ?? "",
    canvas_row: element.canvas_row ?? null,
  };
  ws.elements.push(el);
  await ws.save();
  return ws.toObject();
}

export async function replaceElements(id: string, userId: string, elements: IWorkspaceElement[]) {
  const ws = await Workspace.findOneAndUpdate(
    { _id: id, user_id: userId },
    { elements, updatedAt: new Date() },
    { new: true },
  ).lean();
  if (!ws) throw new ApiError(404, "Workspace not found");
  return ws;
}

export async function removeElement(id: string, userId: string, elementId: string) {
  const ws = await Workspace.findOne({ _id: id, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");
  ws.elements = ws.elements.filter((e) => e.element_id !== elementId);
  await ws.save();
  return ws.toObject();
}

export async function setGenerating(id: string, userId: string) {
  const ws = await Workspace.findOneAndUpdate(
    { _id: id, user_id: userId },
    { status: "generating" },
    { new: true },
  ).lean();
  if (!ws) throw new ApiError(404, "Workspace not found");
  return ws;
}

export async function deleteWorkspace(id: string, userId: string) {
  const ws = await Workspace.findOneAndDelete({ _id: id, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");
}

export async function uploadElement(
  id: string,
  userId: string,
  elementType: string,
  file: Express.Multer.File,
  label?: string,
  garmentType?: string,
) {
  const ws = await Workspace.findOne({ _id: id, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");

  const fileUrl = `/uploads/workspace-elements/${id}/${file.filename}`;
  const name = label || file.originalname.replace(/\.[^.]+$/, "");

  const data: Record<string, unknown> =
    elementType === "silhouette" ? { flat_url: fileUrl } :
    elementType === "fabric"    ? { fabric: { name, image_url: fileUrl } } :
    elementType === "pattern"   ? { pattern: name, image_url: fileUrl } :
    {};

  ws.elements.push({
    element_id: uuidv4(),
    look_id: "",
    garment_id: "",
    garment_type: garmentType || "custom",
    element_type: elementType as IWorkspaceElement["element_type"],
    data,
    source_brand: "custom",
    canvas_position: { x: 0, y: 0 },
    row: garmentType || "custom",
    canvas_row: null,
    is_custom: true,
  });
  await ws.save();
  return ws.toObject();
}
