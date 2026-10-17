import type { Types } from "mongoose";
import { Folder, CHILD_KINDS, type ChildKind, type IFolder } from "../models/Folder.js";
import { Workspace } from "../models/Workspace.js";
import { ApiError } from "../utils/api-error.js";
import {
  CHILD_FOLDER_NAMES, childKindForElement, dateFolderName, todayString,
} from "./folderLayout.js";
import type { IWorkspaceElement } from "../models/Workspace.js";

type Id = string | Types.ObjectId;

async function requireWorkspace(workspaceId: string, userId: string) {
  const ws = await Workspace.findOne({ _id: workspaceId, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");
  return ws;
}

export async function ensureLooksRoot(workspaceId: Id, userId: Id): Promise<IFolder> {
  return Folder.findOneAndUpdate(
    { workspace_id: workspaceId, kind: "looks_root" },
    { $setOnInsert: { workspace_id: workspaceId, user_id: userId, parent_id: null, name: "Looks", kind: "looks_root", system: true } },
    { upsert: true, new: true },
  ) as unknown as IFolder;
}

/** Create (idempotently) the five element folders under a date/custom folder. */
export async function ensureChildren(parent: IFolder): Promise<Record<ChildKind, IFolder>> {
  const entries = await Promise.all(
    CHILD_KINDS.map(async (kind) => {
      const f = await Folder.findOneAndUpdate(
        { workspace_id: parent.workspace_id, parent_id: parent._id, kind },
        { $setOnInsert: {
            workspace_id: parent.workspace_id, user_id: parent.user_id, parent_id: parent._id,
            name: CHILD_FOLDER_NAMES[kind], kind, system: true,
        } },
        { upsert: true, new: true },
      );
      return [kind, f] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as Record<ChildKind, IFolder>;
}

export async function ensureDateFolder(
  workspaceId: Id, userId: Id, workspaceName: string, date: string,
): Promise<IFolder> {
  const root = await ensureLooksRoot(workspaceId, userId);
  const folder = await Folder.findOneAndUpdate(
    { workspace_id: workspaceId, parent_id: root._id, kind: "date", date },
    { $setOnInsert: {
        workspace_id: workspaceId, user_id: userId, parent_id: root._id,
        name: dateFolderName(workspaceName, date), kind: "date", system: false, date,
    } },
    { upsert: true, new: true },
  ) as unknown as IFolder;
  await ensureChildren(folder);
  return folder;
}

export async function createFolder(workspaceId: string, userId: string, name: string) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new ApiError(400, "Folder name is required");
  const ws = await requireWorkspace(workspaceId, userId);
  const root = await ensureLooksRoot(ws._id, userId);
  const folder = await Folder.create({
    workspace_id: ws._id, user_id: ws.user_id, parent_id: root._id,
    name: trimmed, kind: "custom", system: false,
  });
  await ensureChildren(folder);
  return folder.toObject();
}

export async function renameFolder(workspaceId: string, userId: string, folderId: string, name: string) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new ApiError(400, "Folder name is required");
  const folder = await Folder.findOne({ _id: folderId, workspace_id: workspaceId, user_id: userId });
  if (!folder) throw new ApiError(404, "Folder not found");
  if (folder.system) throw new ApiError(400, "System folders can't be renamed");
  folder.name = trimmed;
  await folder.save();
  return folder.toObject();
}

export async function descendantIds(workspaceId: Id, folderId: Id): Promise<string[]> {
  const all = await Folder.find({ workspace_id: workspaceId }).select("_id parent_id").lean();
  const byParent = new Map<string, string[]>();
  for (const f of all) {
    const k = f.parent_id ? String(f.parent_id) : "";
    byParent.set(k, [...(byParent.get(k) ?? []), String(f._id)]);
  }
  const out = [String(folderId)];
  for (let i = 0; i < out.length; i++) out.push(...(byParent.get(out[i]) ?? []));
  return out;
}

export async function deleteFolder(workspaceId: string, userId: string, folderId: string) {
  const folder = await Folder.findOne({ _id: folderId, workspace_id: workspaceId, user_id: userId });
  if (!folder) throw new ApiError(404, "Folder not found");
  if (folder.system) throw new ApiError(400, "System folders can't be deleted");
  const ids = await descendantIds(workspaceId, folderId);
  const ws = await requireWorkspace(workspaceId, userId);
  const doomed = ws.elements.filter((e) => e.folder_id && ids.includes(e.folder_id));
  if (doomed.some((e) => e.canvas_row != null)) {
    throw new ApiError(409, "Remove this folder's elements from the builder canvas first");
  }
  await Workspace.updateOne(
    { _id: workspaceId },
    { $pull: { elements: { folder_id: { $in: ids } }, looks: { date_folder_id: { $in: ids } } } },
  );
  await Folder.deleteMany({ _id: { $in: ids } });
}

/** All folders of a workspace with element counts (client assembles the tree). */
export async function listFolders(workspaceId: string, userId: string) {
  const ws = await requireWorkspace(workspaceId, userId);
  const folders = await Folder.find({ workspace_id: workspaceId }).sort({ date: -1, createdAt: 1 }).lean();
  const counts = new Map<string, { count: number; in_builder: number }>();
  for (const e of ws.elements) {
    if (!e.folder_id) continue;
    const c = counts.get(e.folder_id) ?? { count: 0, in_builder: 0 };
    c.count += 1;
    if (e.element_type !== "shot" && e.in_builder !== false) c.in_builder += 1;
    counts.set(e.folder_id, c);
  }
  return {
    folders: folders.map((f) => ({
      id: String(f._id),
      parent_id: f.parent_id ? String(f.parent_id) : null,
      name: f.name,
      kind: f.kind,
      system: f.system,
      date: f.date ?? null,
      count: counts.get(String(f._id))?.count ?? 0,
      in_builder_count: counts.get(String(f._id))?.in_builder ?? 0,
    })),
    looks: ws.looks ?? [],
  };
}

/**
 * Resolve the element folder an upload / loose element should be filed in.
 * Accepts a date/custom folder (uses its matching child), a child folder
 * (uses it, or its sibling of the right kind), or nothing (today's date folder).
 */
export async function resolveElementFolder(opts: {
  workspaceId: string;
  userId: string;
  elementType: IWorkspaceElement["element_type"];
  folderId?: string;
  newFolderName?: string;
  tz?: string;
}): Promise<string> {
  const { workspaceId, userId, elementType, folderId, newFolderName, tz } = opts;
  const ws = await requireWorkspace(workspaceId, userId);
  const kind = childKindForElement(elementType);

  let parent: IFolder | null = null;
  if (newFolderName?.trim()) {
    const created = await createFolder(workspaceId, userId, newFolderName);
    parent = (await Folder.findById(created._id)) as IFolder;
  } else if (folderId) {
    const target = await Folder.findOne({ _id: folderId, workspace_id: workspaceId, user_id: userId });
    if (!target) throw new ApiError(404, "Folder not found");
    if (target.kind === "looks_root") {
      parent = await ensureDateFolder(ws._id, ws.user_id, ws.name, todayString(tz));
    } else if ((CHILD_KINDS as readonly string[]).includes(target.kind)) {
      parent = await Folder.findById(target.parent_id);
    } else {
      parent = target;
    }
  } else {
    parent = await ensureDateFolder(ws._id, ws.user_id, ws.name, todayString(tz));
  }
  if (!parent) throw new ApiError(404, "Folder not found");
  const children = await ensureChildren(parent);
  return String(children[kind]._id);
}
