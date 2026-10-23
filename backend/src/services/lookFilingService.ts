import { Workspace } from "../models/Workspace.js";
import { Folder, type IFolder } from "../models/Folder.js";
import { ApiError } from "../utils/api-error.js";
import { getLook, getGarments } from "./looksService.js";
import {
  ensureChildren, ensureDateFolder, descendantIds,
} from "./folderService.js";
import {
  buildLookElements, childKindForElement, elementKey, todayString,
} from "./folderLayout.js";

/**
 * Add a whole look to a workspace: its already-deconstructed data is filed into
 * the dated folder (shots / silhouettes / color palettes / fabrics / patterns).
 * Nothing goes to the AI builder until the user moves it there.
 */
export async function addLookToWorkspace(
  workspaceId: string,
  userId: string,
  lookId: string,
  opts: { tz?: string; folderId?: string; tenantId?: string | null; role?: string | null } = {},
) {
  const ws = await Workspace.findOne({ _id: workspaceId, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");

  // Same tenant/role visibility as the Looks pages: private looks of other tenants 404.
  const [look, garments] = await Promise.all([
    getLook(lookId, opts.tenantId, opts.role),
    getGarments(lookId, opts.tenantId, opts.role),
  ]);
  // Shopify looks that haven't been deconstructed yet only have variant stubs (no flat/colours/fabrics).
  const hasContent = garments.some((g) => g.flat_url || g.colors?.length || g.fabrics?.length || g.patterns?.length);
  if (!hasContent && !look.analysis) {
    throw new ApiError(422, "This look hasn't been deconstructed yet");
  }

  const existingLook = (ws.looks ?? []).find((l) => l.look_id === lookId);
  if (existingLook) {
    const folder = await Folder.findById(existingLook.date_folder_id).lean();
    return {
      workspace: ws.toObject(),
      added: 0,
      skipped: 0,
      already_in_workspace: true,
      folder_id: existingLook.date_folder_id,
      folder_name: folder?.name ?? "",
    };
  }

  let dateFolder: IFolder;
  if (opts.folderId) {
    const target = await Folder.findOne({ _id: opts.folderId, workspace_id: workspaceId, user_id: userId });
    if (!target || (target.kind !== "date" && target.kind !== "custom")) {
      throw new ApiError(400, "Pick a date or custom folder");
    }
    dateFolder = target;
  } else {
    dateFolder = await ensureDateFolder(ws._id, ws.user_id, ws.name, todayString(opts.tz));
  }
  const children = await ensureChildren(dateFolder);

  const have = new Set(ws.elements.map(elementKey));
  const now = new Date();
  const fresh = buildLookElements(look, garments)
    .filter((e) => !have.has(elementKey(e)))
    .map((e) => ({
      ...e,
      folder_id: String(children[childKindForElement(e.element_type)]._id),
      in_builder: false,
      added_at: now,
    }));

  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $push: {
        elements: { $each: fresh },
        looks: {
          look_id: lookId,
          date_folder_id: String(dateFolder._id),
          added_at: now,
          thumbnail: look.images[0] ?? null,
          brand: look.brand,
          title: look.name,
        },
      },
    },
  );

  const updated = await Workspace.findById(workspaceId).lean();
  return {
    workspace: updated,
    added: fresh.length,
    skipped: buildLookElements(look, garments).length - fresh.length,
    already_in_workspace: false,
    folder_id: String(dateFolder._id),
    folder_name: dateFolder.name,
  };
}

export interface MoveSelector {
  look_id?: string;
  folder_id?: string;
  element_ids?: string[];
}

/** Flag elements as in / out of the AI builder. Shots are never moved. Idempotent. */
export async function setInBuilder(
  workspaceId: string,
  userId: string,
  sel: MoveSelector,
  inBuilder: boolean,
) {
  const ws = await Workspace.findOne({ _id: workspaceId, user_id: userId });
  if (!ws) throw new ApiError(404, "Workspace not found");
  if (!sel.look_id && !sel.folder_id && !sel.element_ids?.length) {
    throw new ApiError(400, "Provide look_id, folder_id or element_ids");
  }

  let folderSet: Set<string> | null = null;
  if (sel.folder_id) {
    const folder = await Folder.findOne({ _id: sel.folder_id, workspace_id: workspaceId });
    if (!folder) throw new ApiError(404, "Folder not found");
    folderSet = new Set(await descendantIds(workspaceId, sel.folder_id));
  }
  const idSet = sel.element_ids?.length ? new Set(sel.element_ids) : null;

  const targets = ws.elements.filter((e) =>
    e.element_type !== "shot"
    && (!sel.look_id || e.look_id === sel.look_id)
    && (!folderSet || (e.folder_id != null && folderSet.has(e.folder_id)))
    && (!idSet || idSet.has(e.element_id)));

  const ids = targets.map((e) => e.element_id);
  if (ids.length) {
    await Workspace.updateOne(
      { _id: workspaceId },
      inBuilder
        ? { $set: { "elements.$[e].in_builder": true } }
        // taking an element out of the builder also takes it off the canvas
        : { $set: { "elements.$[e].in_builder": false, "elements.$[e].canvas_row": null } },
      { arrayFilters: [{ "e.element_id": { $in: ids } }] },
    );
  }

  const updated = await Workspace.findById(workspaceId).lean();
  return { workspace: updated, changed: ids.length };
}
