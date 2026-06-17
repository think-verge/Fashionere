import axios from "axios";
import { env } from "../config/env.js";

const agent = axios.create({ baseURL: env.AGENT_URL, timeout: 120_000 });

export interface AgentJobResponse {
  job_id: string;
  status: string;
}

export interface AgentJobStatus {
  status: "pending" | "running" | "done" | "error";
  moodboard?: Record<string, unknown>;
  error?: string;
}

export async function createMoodboardFromQuery(query: string): Promise<AgentJobResponse> {
  const res = await agent.post<AgentJobResponse>("/api/moodboard/from-query", { query });
  return res.data;
}

export async function createMoodboardFromCatalogue(catalogueItemId: string): Promise<AgentJobResponse> {
  const res = await agent.post<AgentJobResponse>("/api/moodboard/from-catalogue", {
    catalogue_item_id: catalogueItemId,
  });
  return res.data;
}

export async function createMoodboardFromImage(imageUrl: string): Promise<AgentJobResponse> {
  const res = await agent.post<AgentJobResponse>("/api/moodboard/from-image", {
    image_url: imageUrl,
  });
  return res.data;
}

export async function getAgentJobStatus(jobId: string): Promise<AgentJobStatus> {
  const res = await agent.get<AgentJobStatus>(`/api/moodboard/jobs/${jobId}`);
  return res.data;
}

export async function getCatalogueItems(): Promise<unknown[]> {
  const res = await agent.get<unknown[]>("/api/catalogue");
  return res.data;
}
