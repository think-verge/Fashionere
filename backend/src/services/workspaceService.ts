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

  // Mock background generation process
  setTimeout(async () => {
    try {
      await Workspace.updateOne({ _id: id, user_id: userId }, { status: "ready" });
    } catch (err) {
      console.error("Failed to mock generation completion", err);
    }
  }, 3000);

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

const STAGE2_VARIANTS = [
  { id: "1", imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=600", title: "High-leg maillot", materials: "Coral · crinkle seersucker" },
  { id: "2", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=600", title: "Wrap sarong dress", materials: "Bleached sand · tropical botanical" },
  { id: "3", imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=600", title: "Pleated midi skirt", materials: "Terracotta · washed linen" },
  { id: "4", imageUrl: "https://images.unsplash.com/photo-1503342394128-c104d54dba01?auto=format&fit=crop&q=80&w=600", title: "Wide leg trouser", materials: "Bleached sand · linen" },
  
  { id: "5", imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=601", title: "Bikini top", materials: "Terracotta · crinkle" },
  { id: "6", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=601", title: "Cover-up tunic", materials: "Coral bloom · cotton silk" },
  { id: "7", imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=601", title: "Maxi slip dress", materials: "Bleached sand · silk satin" },
  { id: "8", imageUrl: "https://images.unsplash.com/photo-1503342394128-c104d54dba01?auto=format&fit=crop&q=80&w=601", title: "Knit halter top", materials: "Coral bloom · ribbed knit" },

  { id: "9", imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=602", title: "Wrap mini skirt", materials: "Bleached sand · tropical botanical" },
  { id: "10", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=602", title: "Pleated shorts", materials: "Terracotta · washed linen" },
  { id: "11", imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=602", title: "Wide leg crop", materials: "Bleached sand · linen" },
  { id: "12", imageUrl: "https://images.unsplash.com/photo-1503342394128-c104d54dba01?auto=format&fit=crop&q=80&w=602", title: "Bandeau top", materials: "Terracotta · crinkle" },
];

const STAGE3_VARIANTS = [
  { id: "1", imageUrl: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&q=80&w=600", title: "High-leg maillot", materials: "Coral · crinkle seersucker" },
  { id: "2", imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600", title: "Wrap sarong dress", materials: "Bleached sand · tropical botanical" },
  { id: "3", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600", title: "Pleated midi skirt", materials: "Terracotta · washed linen" },
  { id: "4", imageUrl: "https://images.unsplash.com/photo-1618244972963-dbee1a7edc95?auto=format&fit=crop&q=80&w=600", title: "Wide leg trouser", materials: "Bleached sand · linen" },
  
  { id: "5", imageUrl: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&q=80&w=601", title: "Bikini top", materials: "Terracotta · crinkle" },
  { id: "6", imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=601", title: "Cover-up tunic", materials: "Coral bloom · cotton silk" },
  { id: "7", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=601", title: "Maxi slip dress", materials: "Bleached sand · silk satin" },
  { id: "8", imageUrl: "https://images.unsplash.com/photo-1618244972963-dbee1a7edc95?auto=format&fit=crop&q=80&w=601", title: "Knit halter top", materials: "Coral bloom · ribbed knit" },

  { id: "9", imageUrl: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&q=80&w=602", title: "Wrap mini skirt", materials: "Bleached sand · tropical botanical" },
  { id: "10", imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=602", title: "Pleated shorts", materials: "Terracotta · washed linen" },
  { id: "11", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=602", title: "Wide leg crop", materials: "Bleached sand · linen" },
  { id: "12", imageUrl: "https://images.unsplash.com/photo-1618244972963-dbee1a7edc95?auto=format&fit=crop&q=80&w=602", title: "Bandeau top", materials: "Terracotta · crinkle" },
];

export async function getVariants(id: string, userId: string, stage?: string) {
  const ws = await Workspace.findOne({ _id: id, user_id: userId }).lean();
  if (!ws) throw new ApiError(404, "Workspace not found");
  await new Promise(r => setTimeout(r, 1500));
  return stage === "3" ? STAGE3_VARIANTS : STAGE2_VARIANTS;
}

export async function editVariant(id: string, userId: string, variantId: string, instructions: string) {
  await new Promise(r => setTimeout(r, 1500));
  const variant = STAGE2_VARIANTS.find(v => v.id === variantId) || STAGE2_VARIANTS[0];
  return { ...variant, imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600" }; 
}

export async function attachInventory(id: string, userId: string, variantId: string, inventoryIds: string[]) {
  await new Promise(r => setTimeout(r, 1500));
  const variant = STAGE2_VARIANTS.find(v => v.id === variantId) || STAGE2_VARIANTS[0];
  return { ...variant, imageUrl: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&q=80&w=600" }; 
}
