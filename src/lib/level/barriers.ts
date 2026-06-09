import type {
  Coord,
  LabyrinthBarrier,
  LabyrinthLink,
  LabyrinthRoom,
} from "./types";

export function endingDoorBarrierId(endingId: string): string {
  return `ending-door-${endingId}`;
}

export function isBarrierOpen(
  barrier: LabyrinthBarrier,
  unlockedEndingIds: Set<string>,
): boolean {
  return Boolean(
    barrier.opensWhenEndingUnlocked &&
      unlockedEndingIds.has(barrier.opensWhenEndingUnlocked),
  );
}

export function collectClosedBarrierCellKeys(
  barriers: LabyrinthBarrier[] | undefined,
  unlockedEndingIds: Set<string>,
): Set<string> {
  const blocked = new Set<string>();

  barriers?.forEach((barrier) => {
    if (isBarrierOpen(barrier, unlockedEndingIds)) return;
    barrier.cells.forEach((cell) => blocked.add(cellKey(cell.x, cell.y)));
  });

  return blocked;
}

export function collectPermanentBarrierCellKeys(
  barriers: LabyrinthBarrier[] | undefined,
): Set<string> {
  const blocked = new Set<string>();

  barriers
    ?.filter((barrier) => !barrier.opensWhenEndingUnlocked)
    .forEach((barrier) => {
      barrier.cells.forEach((cell) => blocked.add(cellKey(cell.x, cell.y)));
    });

  return blocked;
}

export function deriveEndingDoorBarriers(
  rooms: LabyrinthRoom[] | undefined,
  links: LabyrinthLink[] | undefined,
): { barriers: LabyrinthBarrier[]; errors: string[] } {
  if (!rooms || !links) {
    return { barriers: [], errors: [] };
  }

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const barriers: LabyrinthBarrier[] = [];
  const errors: string[] = [];

  // Carved cells for every link, so we can tell which cells are shared with
  // other corridors (a lock must never sit on a cell another route needs).
  const linkCells = links.map((link) => ({
    link,
    cells: linkPathCells(
      roomById.get(link.fromRoomId),
      roomById.get(link.toRoomId),
      link.points,
    ),
  }));

  rooms
    .filter((room) => room.endingId)
    .forEach((room) => {
      const endingId = room.endingId!;
      const incomingLinks = links.filter((link) => link.toRoomId === room.id);
      if (incomingLinks.length !== 1) {
        errors.push(
          `ending "${endingId}" must have exactly one incoming room link to derive an entry-path barrier.`,
        );
        return;
      }

      const incomingLink = incomingLinks[0];
      const fromRoom = roomById.get(incomingLink.fromRoomId);
      if (!fromRoom) {
        errors.push(
          `ending "${endingId}" entry-path barrier references missing room "${incomingLink.fromRoomId}".`,
        );
        return;
      }

      const path = linkPathCells(fromRoom, room, incomingLink.points);

      // Cells used by any OTHER link — locking one of these would block an
      // unrelated flow, so they are off limits.
      const sharedCells = new Set<string>();
      linkCells.forEach((entry) => {
        if (entry.link === incomingLink) return;
        entry.cells.forEach((cell) => sharedCells.add(cellKey(cell.x, cell.y)));
      });

      const lockCell = pickEntryPathCell(path, room, rooms, sharedCells);
      if (!lockCell) {
        errors.push(
          `ending "${endingId}" entry-path barrier could not be derived from its incoming room link.`,
        );
        return;
      }

      barriers.push({
        id: endingDoorBarrierId(endingId),
        cells: [lockCell],
        opensWhenEndingUnlocked: endingId,
      });
    });

  return { barriers, errors };
}

/**
 * Choose the cell to bar for an ending, scanning its approach corridor from the
 * source room toward the ending. Prefers the first private corridor cell (the
 * "first path that leads to the ending"); falls back to a private doorway tile
 * inside the ending room when it hangs directly off a shared trunk.
 */
function pickEntryPathCell(
  path: Coord[],
  endingRoom: LabyrinthRoom,
  rooms: LabyrinthRoom[],
  sharedCells: Set<string>,
): Coord | null {
  const center = roomCenter(endingRoom);
  const centerKey = cellKey(center.x, center.y);

  // 1. First private corridor cell (outside every room, not shared).
  for (const cell of path) {
    if (
      !isInsideAnyRoom(cell, rooms) &&
      !sharedCells.has(cellKey(cell.x, cell.y))
    ) {
      return cell;
    }
  }

  // 2. First private doorway tile inside the ending room (not shared, not the
  //    marker tile) — used when the room opens straight off a shared trunk.
  for (const cell of path) {
    const key = cellKey(cell.x, cell.y);
    if (
      isInsideRoom(cell, endingRoom) &&
      !sharedCells.has(key) &&
      key !== centerKey
    ) {
      return cell;
    }
  }

  // 3. Fallback: first corridor cell even if shared. Only reached for endings
  //    with no private cell, whose bar is effectively always open.
  for (const cell of path) {
    if (!isInsideAnyRoom(cell, rooms)) {
      return cell;
    }
  }

  // 4. Last resort: first non-marker cell on the path.
  for (const cell of path) {
    if (cellKey(cell.x, cell.y) !== centerKey) {
      return cell;
    }
  }

  return null;
}

/**
 * Cells a room link carves, in order from the source room center to the target
 * room center. Mirrors compileRoomMap's horizontal-then-vertical carve so the
 * derived cells line up with the real corridor.
 */
function linkPathCells(
  from: LabyrinthRoom | undefined,
  to: LabyrinthRoom | undefined,
  points: Coord[] | undefined,
): Coord[] {
  if (!from || !to) return [];

  const waypoints = [roomCenter(from), ...(points ?? []), roomCenter(to)];
  const cells: Coord[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const key = cellKey(x, y);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    let { x, y } = waypoints[index];
    const target = waypoints[index + 1];
    push(x, y);
    while (x !== target.x) {
      x += Math.sign(target.x - x);
      push(x, y);
    }
    while (y !== target.y) {
      y += Math.sign(target.y - y);
      push(x, y);
    }
  }

  return cells;
}

function isInsideRoom(cell: Coord, room: LabyrinthRoom): boolean {
  return (
    cell.x >= room.x &&
    cell.x < room.x + room.width &&
    cell.y >= room.y &&
    cell.y < room.y + room.height
  );
}

function isInsideAnyRoom(cell: Coord, rooms: LabyrinthRoom[]): boolean {
  return rooms.some((room) => isInsideRoom(cell, room));
}

function roomCenter(room: LabyrinthRoom): Coord {
  return {
    x: room.x + Math.floor(room.width / 2),
    y: room.y + Math.floor(room.height / 2),
  };
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
