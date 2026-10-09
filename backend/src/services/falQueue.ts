import axios from "axios";
import mongoose from "mongoose";
import { env } from "../config/env.js";

// FLUX.2 [pro] edit: chosen for garment-pack shots after a model comparison — it kept details
// faithful across runs where Seedream v4 invented hardware. Priced ~$0.03 for the first megapixel.
export const FLUX2_EDIT_MODEL = "fal-ai/flux-2-pro/edit";
export const COST_FLUX2_EDIT = 0.03;

// Never log raw axios errors: their config carries the FAL Authorization header.
export function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    return `HTTP ${err.response?.status ?? "?"} ${err.config?.url ?? ""} — ${typeof detail === "string" ? detail : JSON.stringify(detail ?? err.message)}`;
  }
  return err instanceof Error ? err.stack ?? err.message : String(err);
}

export function falHeaders() {
  return {
    Authorization: `Key ${env.FAL_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface FalQueueJob {
  request_id: string;
  status_url: string;
  response_url: string;
}

export async function submitFlux2Edit(imageUris: string[], prompt: string): Promise<FalQueueJob> {
  const { data } = await axios.post(
    `https://queue.fal.run/${FLUX2_EDIT_MODEL}`,
    { image_urls: imageUris, prompt, output_format: "jpeg" },
    { headers: falHeaders() },
  );
  return { request_id: data.request_id, status_url: data.status_url, response_url: data.response_url };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls a queued FAL job until it yields an image. Throws on failure or timeout. */
export async function waitForFalImage(
  job: FalQueueJob,
  { intervalMs = 4000, maxAttempts = 75 } = {},
): Promise<{ imageUrl: string; inferenceTime: number }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs);
    const status = await axios.get(job.status_url, { headers: falHeaders(), validateStatus: () => true });
    if (status.status !== 200 || status.data.status !== "COMPLETED") continue;

    const result = await axios.get(job.response_url, { headers: falHeaders(), validateStatus: () => true });
    const imageUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url;
    if (result.status !== 200 || !imageUrl) {
      throw new Error(`FAL job ${job.request_id} finished without an image: HTTP ${result.status} ${JSON.stringify(result.data?.detail ?? result.data).slice(0, 300)}`);
    }
    return { imageUrl, inferenceTime: result.data?.metrics?.inference_time ?? status.data.metrics?.inference_time ?? 0 };
  }
  throw new Error(`FAL job ${job.request_id} timed out after ${(intervalMs * maxAttempts) / 1000}s`);
}

export async function readGridFSBuffer(bucketName: string, id: mongoose.Types.ObjectId | string): Promise<Buffer> {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName });
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(new mongoose.Types.ObjectId(String(id)))) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Downloads a generated image (retrying FAL CDN 5xx/network errors) and stores it in GridFS. */
export async function storeRemoteImage(
  imageUrl: string,
  bucketName: string,
  filename: string,
): Promise<{ gridfsId: mongoose.Types.ObjectId; buffer: Buffer }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const resp = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30_000 });
      const buffer = Buffer.from(resp.data);
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName });
      const gridfsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
        const upload = bucket.openUploadStream(filename, { contentType: "image/jpeg" });
        upload.on("error", reject);
        upload.on("finish", () => resolve(upload.id as mongoose.Types.ObjectId));
        upload.end(buffer);
      });
      return { gridfsId, buffer };
    } catch (err) {
      lastError = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status && status < 500) throw err;
      if (attempt < 4) await sleep(2000 * attempt);
    }
  }
  throw lastError;
}
