import type { DB } from '../db/connection.js';

export interface PathResult {
  found: boolean;
  hops: number;
  intermediates: number[]; // system IDs between src and dst (exclusive of both endpoints)
}

/**
 * BFS up to 3 hops between sourceId and destId using system_adjacency.
 * Returns the shortest path found, or found=false if distance exceeds 3 hops.
 */
export function findPath(db: DB, sourceId: number, destId: number): PathResult {
  if (sourceId === destId) return { found: true, hops: 0, intermediates: [] };

  const getNeighbors = db.prepare(
    'SELECT neighbor_id FROM system_adjacency WHERE system_id = ?'
  );

  type Entry = { id: number; path: number[] };
  const queue: Entry[] = [{ id: sourceId, path: [sourceId] }];
  const visited = new Set<number>([sourceId]);

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    if (path.length >= 4) continue; // already at 3 hops from source, can't go further
    const neighbors = (
      getNeighbors.all(id) as { neighbor_id: number }[]
    ).map((r) => r.neighbor_id);
    for (const neighbor of neighbors) {
      if (neighbor === destId) {
        const fullPath = [...path, destId];
        return {
          found: true,
          hops: fullPath.length - 1,
          intermediates: fullPath.slice(1, -1),
        };
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return { found: false, hops: -1, intermediates: [] };
}

/**
 * Returns all system IDs reachable from sourceId within maxHops hops (default 3),
 * excluding the source itself. Used to populate the destination dropdown.
 */
export function reachableSystems(
  db: DB,
  sourceId: number,
  maxHops: number = 3
): number[] {
  const getNeighbors = db.prepare(
    'SELECT neighbor_id FROM system_adjacency WHERE system_id = ?'
  );

  const visited = new Set<number>([sourceId]);
  let frontier = [sourceId];

  for (let hop = 0; hop < maxHops; hop++) {
    const next: number[] = [];
    for (const id of frontier) {
      const neighbors = (
        getNeighbors.all(id) as { neighbor_id: number }[]
      ).map((r) => r.neighbor_id);
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }

  visited.delete(sourceId);
  return Array.from(visited);
}
