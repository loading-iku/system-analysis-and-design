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

      const path = [
        roomCenter(fromRoom),
        ...(incomingLink.points ?? []),
        roomCenter(room),
      ];
      const sourcePoint = path[0];
      const nextPoint = findNextDistinctPoint(path, sourcePoint);
      const doorwayCell = deriveDepartureCell(fromRoom, sourcePoint, nextPoint);

      if (!doorwayCell) {
        errors.push(
          `ending "${endingId}" entry-path barrier could not be derived from its incoming room link.`,
        );
        return;
      }

      barriers.push({
        id: endingDoorBarrierId(endingId),
        cells: [doorwayCell],
        opensWhenEndingUnlocked: endingId,
      });
    });

  return { barriers, errors };
}

function deriveDepartureCell(
  room: LabyrinthRoom,
  sourcePoint: Coord,
  nextPoint: Coord | undefined,
): Coord | null {
  if (!nextPoint) return null;

  const firstSegmentEnd =
    sourcePoint.x !== nextPoint.x && sourcePoint.y !== nextPoint.y
      ? { x: nextPoint.x, y: sourcePoint.y }
      : nextPoint;

  if (firstSegmentEnd.y === sourcePoint.y) {
    if (firstSegmentEnd.x > sourcePoint.x) {
      return { x: room.x + room.width - 1, y: sourcePoint.y };
    }
    if (firstSegmentEnd.x < sourcePoint.x) {
      return { x: room.x, y: sourcePoint.y };
    }
  }

  if (firstSegmentEnd.x === sourcePoint.x) {
    if (firstSegmentEnd.y > sourcePoint.y) {
      return { x: sourcePoint.x, y: room.y + room.height - 1 };
    }
    if (firstSegmentEnd.y < sourcePoint.y) {
      return { x: sourcePoint.x, y: room.y };
    }
  }

  return null;
}

function findNextDistinctPoint(
  path: Coord[],
  sourcePoint: Coord,
): Coord | undefined {
  for (let index = 1; index < path.length; index += 1) {
    const point = path[index];
    if (point.x !== sourcePoint.x || point.y !== sourcePoint.y) {
      return point;
    }
  }

  return undefined;
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
