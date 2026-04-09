import { get, set } from "idb-keyval";

export interface DeletedPark {
  id: number;
  name: string;
  area: number;
  tags: string[];
}

let deletedParkIds: Map<number, DeletedPark> = new Map();

export async function loadDeletedParks() {
  const cached = await get("deleted_parks");
  if (cached) {
    deletedParkIds = new Map(cached);
  }
}

async function persistDeletedParks() {
  await set("deleted_parks", Array.from(deletedParkIds.entries()));
}

export async function deletePark(park: DeletedPark) {
  deletedParkIds.set(park.id, park);
  await persistDeletedParks();
}

export async function restorePark(id: number) {
  deletedParkIds.delete(id);
  await persistDeletedParks();
}

export function isDeleted(id: number): boolean {
  return deletedParkIds.has(id);
}

export function getDeletedParks(): DeletedPark[] {
  return Array.from(deletedParkIds.values());
}

// Called by forceReload in mapData.ts to wipe everything together
export async function clearDeletedParks() {
  deletedParkIds.clear();
  await persistDeletedParks();
}