import { getCatalogueItems } from "./agentService.js";

export async function listCatalogue() {
  return getCatalogueItems();
}
