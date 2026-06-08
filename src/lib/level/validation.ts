import type {
  DiagramPuzzleJSON,
  DiagramPuzzleStep,
  LabyrinthLevelJSON,
  LevelChallenge,
} from "./types";
import {
  collectPermanentBarrierCellKeys,
  deriveEndingDoorBarriers,
  endingDoorBarrierId,
} from "./barriers";

type ValidationContext = {
  errors: string[];
};

export function validateLevel(level: LabyrinthLevelJSON): string[] {
  const ctx: ValidationContext = { errors: [] };

  validateMap(level, ctx);
  validateRooms(level, ctx);
  validateGates(level, ctx);
  validateChallenges(level, ctx);
  validateEndings(level, ctx);
  validateRoutes(level, ctx);
  validateBarriers(level, ctx);
  validateCoinPickups(level, ctx);
  validateReachability(level, ctx);

  return ctx.errors;
}

function validateRooms(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const rooms = level.labyrinth.rooms ?? [];
  const links = level.labyrinth.links ?? [];
  const roomIds = new Set<string>();
  const gateIds = new Set(level.gates.map((gate) => gate.id));
  const endingIds = new Set(level.endings.map((ending) => ending.id));

  rooms.forEach((room) => {
    if (roomIds.has(room.id)) {
      ctx.errors.push(`${level.id}: duplicate room id "${room.id}".`);
    }
    roomIds.add(room.id);

    if (room.width <= 0 || room.height <= 0) {
      ctx.errors.push(`${level.id}: room "${room.id}" must have positive size.`);
    }

    if (
      room.x < 0 ||
      room.y < 0 ||
      room.x + room.width > level.labyrinth.width ||
      room.y + room.height > level.labyrinth.height
    ) {
      ctx.errors.push(`${level.id}: room "${room.id}" is outside the map.`);
    }

    if (room.gateId && !gateIds.has(room.gateId)) {
      ctx.errors.push(
        `${level.id}: room "${room.id}" references missing gate "${room.gateId}".`,
      );
    }

    if (room.endingId && !endingIds.has(room.endingId)) {
      ctx.errors.push(
        `${level.id}: room "${room.id}" references missing ending "${room.endingId}".`,
      );
    }
  });

  links.forEach((link) => {
    if (!roomIds.has(link.fromRoomId)) {
      ctx.errors.push(
        `${level.id}: room link "${link.id}" references missing room "${link.fromRoomId}".`,
      );
    }
    if (!roomIds.has(link.toRoomId)) {
      ctx.errors.push(
        `${level.id}: room link "${link.id}" references missing room "${link.toRoomId}".`,
      );
    }
  });
}

function validateMap(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const { width, height, start, map } = level.labyrinth;
  if (map.length !== height) {
    ctx.errors.push(
      `${level.id}: map height ${map.length} does not match ${height}.`,
    );
  }

  map.forEach((row, index) => {
    if (row.length !== width) {
      ctx.errors.push(
        `${level.id}: row ${index} has width ${row.length}, expected ${width}.`,
      );
    }
  });

  if (!isWalkable(level, start.x, start.y)) {
    ctx.errors.push(`${level.id}: start tile is not walkable.`);
  }
}

function validateGates(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const challengeIds = new Set(level.challenges.map((challenge) => challenge.id));
  const gateIds = new Set<string>();

  level.gates.forEach((gate) => {
    if (gateIds.has(gate.id)) {
      ctx.errors.push(`${level.id}: duplicate gate id "${gate.id}".`);
    }
    gateIds.add(gate.id);

    if (!isWalkable(level, gate.x, gate.y)) {
      ctx.errors.push(`${level.id}: gate "${gate.id}" is placed on a wall.`);
    }

    if (gate.challengeId && !challengeIds.has(gate.challengeId)) {
      ctx.errors.push(
        `${level.id}: gate "${gate.id}" references missing challenge "${gate.challengeId}".`,
      );
    }

    gate.appendNodes.forEach((node, index) => {
      if (!node.shape) {
        ctx.errors.push(
          `${level.id}: gate "${gate.id}" append node ${index} is missing a shape.`,
        );
      }
    });
  });
}

function validateChallenges(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const challengeIds = new Set<string>();
  level.challenges.forEach((challenge) => {
    if (challengeIds.has(challenge.id)) {
      ctx.errors.push(`${level.id}: duplicate challenge id "${challenge.id}".`);
    }
    challengeIds.add(challenge.id);

    if (challenge.kind === "diagram") {
      validatePuzzle(level.id, challenge.puzzle, ctx);
    }

    if (challenge.kind === "parkour") {
      if (challenge.map.length !== challenge.height) {
        ctx.errors.push(
          `${level.id}: parkour challenge "${challenge.id}" height mismatch.`,
        );
      }

      challenge.map.forEach((row, index) => {
        if (row.length !== challenge.width) {
          ctx.errors.push(
            `${level.id}: parkour challenge "${challenge.id}" row ${index} width mismatch.`,
          );
        }
      });
    }
  });
}

function validateEndings(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const completing = level.endings.filter((ending) => ending.completesLevel);
  if (completing.length === 0) {
    ctx.errors.push(`${level.id}: level must have at least one completing ending.`);
  }

  const initiallyUnlocked = level.endings.filter((ending) => ending.initiallyUnlocked);
  if (initiallyUnlocked.length < 2 || initiallyUnlocked.length > 3) {
    ctx.errors.push(
      `${level.id}: level must declare 2 or 3 initially unlocked endings.`,
    );
  }

  const endingIds = new Set(level.endings.map((ending) => ending.id));

  level.endings.forEach((ending) => {
    if (!isWalkable(level, ending.x, ending.y)) {
      ctx.errors.push(`${level.id}: ending "${ending.id}" is placed on a wall.`);
    }

    ending.unlocksEndingIds.forEach((unlockedEndingId) => {
      if (!endingIds.has(unlockedEndingId)) {
        ctx.errors.push(
          `${level.id}: ending "${ending.id}" unlocks missing ending "${unlockedEndingId}".`,
        );
      }
    });
  });
}

function validateRoutes(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const gateIds = new Set(level.gates.map((gate) => gate.id));
  const endingIds = new Set(level.endings.map((ending) => ending.id));
  const routeIds = new Set<string>();

  if (level.routes.length === 0) {
    ctx.errors.push(`${level.id}: level must declare at least one route.`);
  }

  if (!level.routes.some((route) => route.recommended)) {
    ctx.errors.push(`${level.id}: level must declare a recommended route.`);
  }

  level.routes.forEach((route) => {
    if (routeIds.has(route.id)) {
      ctx.errors.push(`${level.id}: duplicate route id "${route.id}".`);
    }
    routeIds.add(route.id);

    if (route.gateIds.length === 0) {
      ctx.errors.push(`${level.id}: route "${route.id}" has no gate path.`);
    }

    route.gateIds.forEach((gateId) => {
      if (!gateIds.has(gateId)) {
        ctx.errors.push(
          `${level.id}: route "${route.id}" references missing gate "${gateId}".`,
        );
      }
    });

    if (!endingIds.has(route.endingId)) {
      ctx.errors.push(
        `${level.id}: route "${route.id}" references missing ending "${route.endingId}".`,
      );
    }
  });
}

function validateBarriers(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const barrierIds = new Set<string>();
  const endingIds = new Set(level.endings.map((ending) => ending.id));
  const labyrinthBarriers = level.labyrinth.barriers ?? [];

  labyrinthBarriers.forEach((barrier) => {
    if (barrierIds.has(barrier.id)) {
      ctx.errors.push(`${level.id}: duplicate barrier id "${barrier.id}".`);
    }
    barrierIds.add(barrier.id);

    if (barrier.cells.length === 0) {
      ctx.errors.push(`${level.id}: barrier "${barrier.id}" must have at least one cell.`);
    }

    if (
      barrier.opensWhenEndingUnlocked &&
      !endingIds.has(barrier.opensWhenEndingUnlocked)
    ) {
      ctx.errors.push(
        `${level.id}: barrier "${barrier.id}" references missing ending "${barrier.opensWhenEndingUnlocked}".`,
      );
    }

    barrier.cells.forEach((cell) => {
      if (
        cell.x < 0 ||
        cell.y < 0 ||
        cell.x >= level.labyrinth.width ||
        cell.y >= level.labyrinth.height
      ) {
        ctx.errors.push(
          `${level.id}: barrier "${barrier.id}" has an out-of-bounds cell at ${cell.x},${cell.y}.`,
        );
        return;
      }

      if (!isWalkable(level, cell.x, cell.y)) {
        ctx.errors.push(
          `${level.id}: barrier "${barrier.id}" is placed on a wall at ${cell.x},${cell.y}.`,
        );
      }
    });
  });

  const derived = deriveEndingDoorBarriers(
    level.labyrinth.rooms,
    level.labyrinth.links,
  );
  derived.errors.forEach((error) => {
    ctx.errors.push(`${level.id}: ${error}`);
  });
  derived.barriers.forEach((barrier) => {
    if (!barrierIds.has(endingDoorBarrierId(barrier.opensWhenEndingUnlocked!))) {
      ctx.errors.push(
        `${level.id}: missing derived ending entry-path barrier "${barrier.id}".`,
      );
    }
  });
}

function validateCoinPickups(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const coinIds = new Set<string>();
  const reserved = new Set<string>();

  reserved.add(key(level.labyrinth.start.x, level.labyrinth.start.y));
  level.gates.forEach((gate) => reserved.add(key(gate.x, gate.y)));
  level.endings.forEach((ending) => reserved.add(key(ending.x, ending.y)));

  level.coinPickups.forEach((coin) => {
    if (coinIds.has(coin.id)) {
      ctx.errors.push(`${level.id}: duplicate coin pickup id "${coin.id}".`);
    }
    coinIds.add(coin.id);

    if (!Number.isInteger(coin.value) || coin.value <= 0) {
      ctx.errors.push(`${level.id}: coin "${coin.id}" must have a positive value.`);
    }

    if (!isWalkable(level, coin.x, coin.y)) {
      ctx.errors.push(`${level.id}: coin "${coin.id}" is placed on a wall.`);
    }

    if (reserved.has(key(coin.x, coin.y))) {
      ctx.errors.push(
        `${level.id}: coin "${coin.id}" overlaps a start, gate, or ending tile.`,
      );
    }

    if (level.labyrinth.rooms?.some((room) => inRoom(coin.x, coin.y, room))) {
      ctx.errors.push(`${level.id}: coin "${coin.id}" is inside a room.`);
    }
  });
}

function validateReachability(level: LabyrinthLevelJSON, ctx: ValidationContext) {
  const visited = floodFill(
    level,
    level.labyrinth.start.x,
    level.labyrinth.start.y,
    collectPermanentBarrierCellKeys(level.labyrinth.barriers),
  );

  level.gates.forEach((gate) => {
    if (!visited.has(key(gate.x, gate.y))) {
      ctx.errors.push(`${level.id}: gate "${gate.id}" is unreachable from start.`);
    }
  });

  level.endings.forEach((ending) => {
    if (!visited.has(key(ending.x, ending.y))) {
      ctx.errors.push(`${level.id}: ending "${ending.id}" is unreachable from start.`);
    }
  });

  const mastery = [...level.endings].sort((a, b) => a.rank - b.rank)[0];
  if (mastery && !visited.has(key(mastery.x, mastery.y))) {
    ctx.errors.push(`${level.id}: best-ranked ending "${mastery.id}" is unreachable.`);
  }
}

function validatePuzzle(
  levelId: string,
  puzzle: DiagramPuzzleJSON,
  ctx: ValidationContext,
) {
  const ids = new Set<string>();

  puzzle.steps.forEach((step) => {
    if (ids.has(step.id)) {
      ctx.errors.push(`${levelId}: puzzle "${puzzle.id}" has duplicate step "${step.id}".`);
    }
    ids.add(step.id);
  });

  if (!ids.has(puzzle.rootStepId)) {
    ctx.errors.push(
      `${levelId}: puzzle "${puzzle.id}" root step "${puzzle.rootStepId}" is missing.`,
    );
  }

  puzzle.steps.forEach((step) => validatePuzzleStep(levelId, puzzle, step, ids, ctx));
}

function validatePuzzleStep(
  levelId: string,
  puzzle: DiagramPuzzleJSON,
  step: DiagramPuzzleStep,
  ids: Set<string>,
  ctx: ValidationContext,
) {
  if (step.kind === "place" && step.nextStepId && !ids.has(step.nextStepId)) {
    ctx.errors.push(
      `${levelId}: puzzle "${puzzle.id}" step "${step.id}" points to missing next step "${step.nextStepId}".`,
    );
  }

  if (step.kind === "decision") {
    step.branches.forEach((branch) => {
      if (!ids.has(branch.nextStepId)) {
        ctx.errors.push(
          `${levelId}: puzzle "${puzzle.id}" branch "${branch.guardLabel}" points to missing step "${branch.nextStepId}".`,
        );
      }
    });
  }
}

function isWalkable(
  level: LabyrinthLevelJSON,
  x: number,
  y: number,
  blockedCells?: Set<string>,
): boolean {
  const row = level.labyrinth.map[y];
  if (!row) return false;
  const tile = row[x];
  return tile !== undefined && tile !== "#" && !blockedCells?.has(key(x, y));
}

function floodFill(
  level: LabyrinthLevelJSON,
  startX: number,
  startY: number,
  blockedCells?: Set<string>,
): Set<string> {
  const queue: Array<[number, number]> = [[startX, startY]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const id = key(x, y);
    if (visited.has(id) || !isWalkable(level, x, y, blockedCells)) continue;
    visited.add(id);

    queue.push([x + 1, y]);
    queue.push([x - 1, y]);
    queue.push([x, y + 1]);
    queue.push([x, y - 1]);
  }

  return visited;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function inRoom(
  x: number,
  y: number,
  room: NonNullable<LabyrinthLevelJSON["labyrinth"]["rooms"]>[number],
): boolean {
  return (
    x >= room.x &&
    x < room.x + room.width &&
    y >= room.y &&
    y < room.y + room.height
  );
}

export function getChallengeById(
  level: LabyrinthLevelJSON,
  id: string,
): LevelChallenge | null {
  return level.challenges.find((challenge) => challenge.id === id) ?? null;
}
