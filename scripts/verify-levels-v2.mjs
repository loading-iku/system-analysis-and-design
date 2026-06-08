#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const levelsDir = path.join(repoRoot, "src", "data", "levels");

const LAYOUT_PATHS = [
  ["labyrinth", "map"],
  ["labyrinth", "layout"],
  ["labyrinth", "rows"],
  ["labyrinth", "grid"],
];

const COMPLETING_ENDING_MARKERS = new Set([
  "success",
  "best",
  "recovery",
  "standard",
  "mastery",
  "bonus",
]);

const NON_COMPLETING_ENDING_MARKERS = new Set([
  "failure",
  "easy",
  "secret",
  "pending",
]);

const OPTIONAL_ROUTE_MARKERS = new Set(["optional"]);
const BEST_ROUTE_MARKERS = new Set(["best", "mastery"]);

main();

function main() {
  const files = resolveInputFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.log("No level JSON files found.");
    return;
  }

  const results = [];
  const skipped = [];

  for (const filePath of files) {
    const parsed = readJson(filePath);
    if (!parsed.ok) {
      results.push({
        filePath,
        levelId: path.basename(filePath),
        errors: [parsed.error],
        warnings: [],
        summary: null,
      });
      continue;
    }

    const level = parsed.value;
    if (level?.schemaVersion !== 2) {
      skipped.push({
        filePath,
        levelId: level?.id ?? path.basename(filePath),
        schemaVersion:
          typeof level?.schemaVersion === "number" ? level.schemaVersion : null,
      });
      continue;
    }

    results.push(validateLevel(level, filePath));
  }

  printResults(results, skipped, files.length);

  if (results.some((result) => result.errors.length > 0)) {
    process.exitCode = 1;
  }
}

function validateLevel(level, filePath) {
  const ctx = createContext(level, filePath);

  validateMap(ctx);
  normalizeGates(ctx);
  normalizeEndings(ctx);
  validateRoomGraph(ctx);
  normalizeChallenges(ctx);
  normalizeRoutes(ctx);
  validateEndingProgression(ctx);
  validateBarriers(ctx);
  validateCoinPickups(ctx);
  determineStartGates(ctx);
  determineBestEnding(ctx);
  validateRouteReferences(ctx);
  validateChallengeReferences(ctx);
  validateRewardConsistency(ctx);
  validateSpatialReachability(ctx);
  validateRootStepGraph(ctx);
  buildNarrativeGraph(ctx);
  validateNarrativeReachability(ctx);
  validateOptionalFallbacks(ctx);

  return {
    filePath,
    levelId: ctx.levelId,
    errors: ctx.errors,
    warnings: ctx.warnings,
    summary: {
      gates: ctx.gates.size,
      endings: ctx.endings.size,
      routes: ctx.routes.length,
      challenges: ctx.challenges.size,
      completingEndings: ctx.completingEndingIds.length,
    },
  };
}

function createContext(level, filePath) {
  return {
    level,
    filePath,
    levelId: typeof level.id === "string" && level.id.length > 0
      ? level.id
      : path.basename(filePath, ".json"),
    errors: [],
    warnings: [],
    map: {
      width: null,
      height: null,
      layoutRows: [],
      start: null,
      walkable: new Set(),
    },
    roomGraph: {
      rooms: [],
      links: [],
    },
    gates: new Map(),
    endings: new Map(),
    challenges: new Map(),
    challengeOutcomes: new Map(),
    routes: [],
    edges: [],
    startGateIds: [],
    bestEndingId: null,
    completingEndingIds: [],
    physicallyReachableTiles: new Set(),
    physicallyReachableEndings: new Set(),
    permanentlyBlockedTiles: new Set(),
    narrativeReachableGates: new Set(),
    narrativeReachableEndings: new Set(),
    stepReachableEndings: new Set(),
  };
}

function validateMap(ctx) {
  const width = ctx.level?.labyrinth?.width;
  const height = ctx.level?.labyrinth?.height;

  if (!isPositiveInteger(width)) {
    ctx.errors.push("labyrinth.width must be a positive integer.");
  } else {
    ctx.map.width = width;
  }

  if (!isPositiveInteger(height)) {
    ctx.errors.push("labyrinth.height must be a positive integer.");
  } else {
    ctx.map.height = height;
  }

  const layouts = [];
  for (const layoutPath of LAYOUT_PATHS) {
    const value = getByPath(ctx.level, layoutPath);
    if (value !== undefined) {
      layouts.push({
        path: formatPath(layoutPath),
        value,
      });
    }
  }

  if (layouts.length === 0) {
    ctx.errors.push("labyrinth must declare map rows via labyrinth.map, labyrinth.rows, or labyrinth.grid.");
  }

  let canonicalRows = null;
  for (const layout of layouts) {
    if (!Array.isArray(layout.value)) {
      ctx.errors.push(`${layout.path} must be an array of strings.`);
      continue;
    }

    const rows = [];
    for (let index = 0; index < layout.value.length; index += 1) {
      const row = layout.value[index];
      if (typeof row !== "string") {
        ctx.errors.push(`${layout.path}[${index}] must be a string.`);
        continue;
      }
      rows.push(row);
    }

    if (ctx.map.height !== null && rows.length !== ctx.map.height) {
      ctx.errors.push(
        `${layout.path} has ${rows.length} row(s), expected ${ctx.map.height}.`,
      );
    }

    rows.forEach((row, index) => {
      if (ctx.map.width !== null && row.length !== ctx.map.width) {
        ctx.errors.push(
          `${layout.path}[${index}] has width ${row.length}, expected ${ctx.map.width}.`,
        );
      }
    });

    if (canonicalRows === null) {
      canonicalRows = rows;
      ctx.map.layoutRows = rows;
    } else if (!arraysEqual(canonicalRows, rows)) {
      ctx.errors.push(`${layout.path} does not match the canonical labyrinth layout.`);
    }
  }

  const start = parseCoord(ctx.level?.labyrinth?.start);
  if (!start) {
    ctx.errors.push("labyrinth.start must be a coordinate tuple or object.");
  } else {
    ctx.map.start = start;
    validateCoordInBounds(ctx, start, "labyrinth.start");
  }

  if (ctx.map.layoutRows.length > 0) {
    ctx.map.walkable = buildWalkableSet(ctx.level, ctx.map.layoutRows);
    if (ctx.map.start && !isWalkableCoord(ctx, ctx.map.start)) {
      ctx.errors.push("labyrinth.start must point to a walkable tile.");
    }
  }
}

function normalizeGates(ctx) {
  const gateCollection = Array.isArray(ctx.level.gates)
    ? ctx.level.gates
    : Array.isArray(ctx.level?.labyrinth?.gates)
      ? ctx.level.labyrinth.gates
      : null;

  if (!gateCollection) {
    ctx.errors.push("schemaVersion 2 levels must declare a gates array.");
    return;
  }

  for (let index = 0; index < gateCollection.length; index += 1) {
    const gate = gateCollection[index];
    const pathLabel = `gates[${index}]`;

    if (!isPlainObject(gate)) {
      ctx.errors.push(`${pathLabel} must be an object.`);
      continue;
    }

    if (typeof gate.id !== "string" || gate.id.length === 0) {
      ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
      continue;
    }

    if (ctx.gates.has(gate.id)) {
      ctx.errors.push(`${pathLabel} duplicates gate id "${gate.id}".`);
      continue;
    }

    const coord = parseCoord(gate.coord) ?? parseCoord({ x: gate.x, y: gate.y });
    if (!coord) {
      ctx.errors.push(`${pathLabel} must declare a gate coordinate.`);
    } else {
      validateCoordInBounds(ctx, coord, `${pathLabel}.coord`);
      if (ctx.map.layoutRows.length > 0 && !isWalkableCoord(ctx, coord)) {
        ctx.errors.push(`${pathLabel} is placed on a non-walkable tile.`);
      }
    }

    validateRewardBundle(ctx, gate.rewards ?? gate.reward, `${pathLabel}.rewards`);

    ctx.gates.set(gate.id, {
      id: gate.id,
      path: pathLabel,
      coord,
      kind: asLowerString(gate.kind),
      optional: gate.optional === true || asLowerString(gate.kind) === "optional",
      raw: gate,
    });
  }
}

function normalizeEndings(ctx) {
  const endingCollection = Array.isArray(ctx.level.endings)
    ? ctx.level.endings
    : Array.isArray(ctx.level?.labyrinth?.endings)
      ? ctx.level.labyrinth.endings
      : null;

  if (!endingCollection) {
    ctx.errors.push("schemaVersion 2 levels must declare an endings array.");
    return;
  }

  for (let index = 0; index < endingCollection.length; index += 1) {
    const ending = endingCollection[index];
    const pathLabel = `endings[${index}]`;

    if (!isPlainObject(ending)) {
      ctx.errors.push(`${pathLabel} must be an object.`);
      continue;
    }

    if (typeof ending.id !== "string" || ending.id.length === 0) {
      ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
      continue;
    }

    if (ctx.endings.has(ending.id)) {
      ctx.errors.push(`${pathLabel} duplicates ending id "${ending.id}".`);
      continue;
    }

    const coord = parseCoord(ending.coord) ?? parseCoord({ x: ending.x, y: ending.y });
    if (coord) {
      validateCoordInBounds(ctx, coord, `${pathLabel}.coord`);
      if (ctx.map.layoutRows.length > 0 && !isWalkableCoord(ctx, coord)) {
        ctx.errors.push(`${pathLabel} is placed on a non-walkable tile.`);
      }
    }

    validateRewardBundle(ctx, ending.rewards ?? ending.reward, `${pathLabel}.rewards`);

    const endingInfo = {
      id: ending.id,
      path: pathLabel,
      coord,
      raw: ending,
      kind: asLowerString(ending.kind) || asLowerString(ending.tier),
      rank: typeof ending.rank === "number" ? ending.rank : null,
      completesLevel: inferCompletesLevel(ending),
      initiallyUnlocked: ending.initiallyUnlocked === true,
      unlocksEndingIds: Array.isArray(ending.unlocksEndingIds)
        ? ending.unlocksEndingIds.filter((entry) => typeof entry === "string")
        : [],
    };

    ctx.endings.set(ending.id, endingInfo);
    if (endingInfo.completesLevel) {
      ctx.completingEndingIds.push(ending.id);
    }
  }

  if (ctx.completingEndingIds.length === 0) {
    ctx.errors.push("At least one ending must be completing.");
  }
}

function validateRoomGraph(ctx) {
  const rooms = ctx.level?.labyrinth?.rooms;
  if (rooms === undefined) {
    return;
  }

  if (!Array.isArray(rooms)) {
    ctx.errors.push("labyrinth.rooms must be an array when declared.");
    return;
  }

  const roomRecords = new Map();
  rooms.forEach((room, index) => {
    const pathLabel = `labyrinth.rooms[${index}]`;
    if (!isPlainObject(room)) {
      ctx.errors.push(`${pathLabel} must be an object.`);
      return;
    }

    if (typeof room.id !== "string" || room.id.length === 0) {
      ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
      return;
    }

    if (roomRecords.has(room.id)) {
      ctx.errors.push(`${pathLabel} duplicates room id "${room.id}".`);
      return;
    }

    if (typeof room.label !== "string" || room.label.length === 0) {
      ctx.errors.push(`${pathLabel}.label must be a non-empty string.`);
    }

    for (const field of ["x", "y", "width", "height"]) {
      if (!isPositiveInteger(room[field]) && !(field === "x" || field === "y") ) {
        ctx.errors.push(`${pathLabel}.${field} must be a positive integer.`);
      } else if ((field === "x" || field === "y") && (!Number.isInteger(room[field]) || room[field] < 0)) {
        ctx.errors.push(`${pathLabel}.${field} must be a non-negative integer.`);
      }
    }

    if (
      Number.isInteger(room.x) &&
      Number.isInteger(room.y) &&
      Number.isInteger(room.width) &&
      Number.isInteger(room.height) &&
      ctx.map.width !== null &&
      ctx.map.height !== null
    ) {
      if (
        room.x < 0 ||
        room.y < 0 ||
        room.x + room.width > ctx.map.width ||
        room.y + room.height > ctx.map.height
      ) {
        ctx.errors.push(`${pathLabel} extends outside the labyrinth bounds.`);
      }
    }

    if (typeof room.gateId === "string") {
      const gate = ctx.gates.get(room.gateId);
      if (!gate) {
        ctx.errors.push(`${pathLabel}.gateId references unknown gate "${room.gateId}".`);
      } else if (gate.coord) {
        const center = roomCenter(room);
        if (gate.coord.x !== center.x || gate.coord.y !== center.y) {
          ctx.errors.push(
            `${pathLabel}.gateId expects gate "${room.gateId}" at room center ${center.x},${center.y}.`,
          );
        }
      }
    }

    if (typeof room.endingId === "string") {
      const ending = ctx.endings.get(room.endingId);
      if (!ending) {
        ctx.errors.push(`${pathLabel}.endingId references unknown ending "${room.endingId}".`);
      } else if (ending.coord) {
        const center = roomCenter(room);
        if (ending.coord.x !== center.x || ending.coord.y !== center.y) {
          ctx.errors.push(
            `${pathLabel}.endingId expects ending "${room.endingId}" at room center ${center.x},${center.y}.`,
          );
        }
      }
    }

    roomRecords.set(room.id, {
      ...room,
      path: pathLabel,
    });
  });

  const links = ctx.level?.labyrinth?.links;
  if (!Array.isArray(links)) {
    ctx.errors.push("labyrinth.links must be an array when labyrinth.rooms is declared.");
    return;
  }

  const normalizedLinks = [];
  links.forEach((link, index) => {
    const pathLabel = `labyrinth.links[${index}]`;
    if (!isPlainObject(link)) {
      ctx.errors.push(`${pathLabel} must be an object.`);
      return;
    }

    const fromRoomId = typeof link.fromRoomId === "string" ? link.fromRoomId : link.from;
    const toRoomId = typeof link.toRoomId === "string" ? link.toRoomId : link.to;

    if (typeof fromRoomId !== "string" || !roomRecords.has(fromRoomId)) {
      ctx.errors.push(`${pathLabel}.fromRoomId references an unknown room.`);
      return;
    }

    if (typeof toRoomId !== "string" || !roomRecords.has(toRoomId)) {
      ctx.errors.push(`${pathLabel}.toRoomId references an unknown room.`);
      return;
    }

    const points = [];
    if (link.points !== undefined) {
      if (!Array.isArray(link.points)) {
        ctx.errors.push(`${pathLabel}.points must be an array when declared.`);
        return;
      }
      link.points.forEach((point, pointIndex) => {
        const coord = parseCoord(point);
        if (!coord) {
          ctx.errors.push(`${pathLabel}.points[${pointIndex}] must be a coordinate.`);
          return;
        }
        validateCoordInBounds(ctx, coord, `${pathLabel}.points[${pointIndex}]`);
        points.push(coord);
      });
    }

    normalizedLinks.push({
      fromRoomId,
      toRoomId,
      points,
    });
  });

  ctx.roomGraph = {
    rooms: [...roomRecords.values()],
    links: normalizedLinks,
  };

  if (ctx.map.width === null || ctx.map.height === null || ctx.map.layoutRows.length === 0) {
    return;
  }

  const compiledRows = compileRoomRows(
    ctx.map.width,
    ctx.map.height,
    [...roomRecords.values()],
    normalizedLinks,
  );

  if (!arraysEqual(compiledRows, ctx.map.layoutRows)) {
    ctx.errors.push("labyrinth.rooms/links do not compile to the declared labyrinth rows.");
  }
}

function normalizeChallenges(ctx) {
  if (Array.isArray(ctx.level.diagramChallenges)) {
    for (let index = 0; index < ctx.level.diagramChallenges.length; index += 1) {
      const challenge = ctx.level.diagramChallenges[index];
      const pathLabel = `diagramChallenges[${index}]`;
      registerStructuredChallenge(ctx, challenge, pathLabel, "diagram");
    }
  }

  if (Array.isArray(ctx.level.challenges)) {
    for (let index = 0; index < ctx.level.challenges.length; index += 1) {
      const challenge = ctx.level.challenges[index];
      const pathLabel = `challenges[${index}]`;
      registerStructuredChallenge(
        ctx,
        challenge,
        pathLabel,
        typeof challenge?.kind === "string" ? challenge.kind : "challenge",
      );
    }
  }

  if (Array.isArray(ctx.level.obstacles)) {
    for (let index = 0; index < ctx.level.obstacles.length; index += 1) {
      const obstacle = ctx.level.obstacles[index];
      const pathLabel = `obstacles[${index}]`;

      if (!isPlainObject(obstacle)) {
        ctx.errors.push(`${pathLabel} must be an object.`);
        continue;
      }

      if (typeof obstacle.id !== "string" || obstacle.id.length === 0) {
        ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
        continue;
      }

      if (ctx.challenges.has(obstacle.id)) {
        ctx.errors.push(`${pathLabel} duplicates challenge/obstacle id "${obstacle.id}".`);
        continue;
      }

      validateRewardBundle(ctx, obstacle.rewards ?? obstacle.reward, `${pathLabel}.rewards`);

      const challengeRecord = {
        id: obstacle.id,
        path: pathLabel,
        kind: typeof obstacle.type === "string" ? obstacle.type : "obstacle",
        optional: obstacle.optional === true,
        entryGateId: typeof obstacle.gateId === "string" ? obstacle.gateId : null,
        outcomes: [],
        raw: obstacle,
      };

      if (Array.isArray(obstacle.checkpoints)) {
        obstacle.checkpoints.forEach((checkpoint, checkpointIndex) => {
          const coord = parseCoord(checkpoint?.coord);
          if (!coord) {
            ctx.errors.push(
              `${pathLabel}.checkpoints[${checkpointIndex}].coord must be a coordinate.`,
            );
            return;
          }
          validateCoordInBounds(
            ctx,
            coord,
            `${pathLabel}.checkpoints[${checkpointIndex}].coord`,
          );
          if (ctx.map.layoutRows.length > 0 && !isWalkableCoord(ctx, coord)) {
            ctx.errors.push(
              `${pathLabel}.checkpoints[${checkpointIndex}] is placed on a non-walkable tile.`,
            );
          }
        });
      }

      if (typeof obstacle.successGateId === "string") {
        challengeRecord.outcomes.push({
          id: `${obstacle.id}:success`,
          path: `${pathLabel}.successGateId`,
          toGateId: obstacle.successGateId,
          toEndingId: null,
        });
      }

      if (typeof obstacle.failureEndingId === "string") {
        challengeRecord.outcomes.push({
          id: `${obstacle.id}:failure`,
          path: `${pathLabel}.failureEndingId`,
          toGateId: null,
          toEndingId: obstacle.failureEndingId,
        });
      }

      if (typeof obstacle.secretGateId === "string") {
        challengeRecord.outcomes.push({
          id: `${obstacle.id}:secret`,
          path: `${pathLabel}.secretGateId`,
          toGateId: obstacle.secretGateId,
          toEndingId: null,
        });
      }

      ctx.challenges.set(obstacle.id, challengeRecord);
      for (const outcome of challengeRecord.outcomes) {
        ctx.challengeOutcomes.set(outcome.id, {
          challengeId: obstacle.id,
          path: outcome.path,
          toGateId: outcome.toGateId,
          toEndingId: outcome.toEndingId,
        });
      }
    }
  }
}

function registerStructuredChallenge(ctx, challenge, pathLabel, fallbackKind) {
  if (!isPlainObject(challenge)) {
    ctx.errors.push(`${pathLabel} must be an object.`);
    return;
  }

  if (typeof challenge.id !== "string" || challenge.id.length === 0) {
    ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
    return;
  }

  if (ctx.challenges.has(challenge.id)) {
    ctx.errors.push(`${pathLabel} duplicates challenge id "${challenge.id}".`);
    return;
  }

  validateRewardBundle(ctx, challenge.rewards ?? challenge.reward, `${pathLabel}.rewards`);

  const kind = typeof challenge.kind === "string" ? challenge.kind : fallbackKind;
  const record = {
    id: challenge.id,
    path: pathLabel,
    kind,
    optional: challenge.optional === true,
    entryGateId:
      typeof challenge.gateId === "string"
        ? challenge.gateId
        : typeof challenge.entryGateId === "string"
          ? challenge.entryGateId
          : null,
    outcomes: [],
    raw: challenge,
  };

  if (kind === "diagram" || Array.isArray(challenge.steps) || isPlainObject(challenge.puzzle)) {
    validatePuzzle(
      ctx,
      challenge.puzzle ?? {
        id: challenge.id,
        rootStepId: challenge.rootStepId,
        steps: challenge.steps,
      },
      `${pathLabel}.puzzle`,
    );
  }

  if (kind === "parkour" && Array.isArray(challenge.map)) {
    validateLocalMap(
      ctx,
      challenge.map,
      challenge.width,
      challenge.height,
      `${pathLabel}.map`,
    );

    const localStart = parseCoord(challenge.start);
    if (!localStart) {
      ctx.errors.push(`${pathLabel}.start must be a coordinate.`);
    } else {
      validateLocalCoord(
        ctx,
        localStart,
        challenge.width,
        challenge.height,
        `${pathLabel}.start`,
      );
    }

    const localGoal = parseCoord(challenge.goal);
    if (!localGoal) {
      ctx.errors.push(`${pathLabel}.goal must be a coordinate.`);
    } else {
      validateLocalCoord(
        ctx,
        localGoal,
        challenge.width,
        challenge.height,
        `${pathLabel}.goal`,
      );
    }
  }

  if (Array.isArray(challenge.outcomes)) {
    for (let index = 0; index < challenge.outcomes.length; index += 1) {
      const outcome = challenge.outcomes[index];
      const outcomePath = `${pathLabel}.outcomes[${index}]`;

      if (!isPlainObject(outcome)) {
        ctx.errors.push(`${outcomePath} must be an object.`);
        continue;
      }

      if (typeof outcome.id !== "string" || outcome.id.length === 0) {
        ctx.errors.push(`${outcomePath}.id must be a non-empty string.`);
        continue;
      }

      if (ctx.challengeOutcomes.has(outcome.id)) {
        ctx.errors.push(`${outcomePath} duplicates challenge outcome id "${outcome.id}".`);
        continue;
      }

      const normalizedOutcome = {
        id: outcome.id,
        path: outcomePath,
        toGateId: typeof outcome.toGateId === "string" ? outcome.toGateId : null,
        toEndingId:
          typeof outcome.toEndingId === "string"
            ? outcome.toEndingId
            : typeof outcome.endingId === "string"
              ? outcome.endingId
              : null,
      };

      if (!normalizedOutcome.toGateId && !normalizedOutcome.toEndingId) {
        ctx.errors.push(`${outcomePath} must reference a gate or ending target.`);
      }

      record.outcomes.push(normalizedOutcome);
      ctx.challengeOutcomes.set(outcome.id, {
        challengeId: challenge.id,
        path: outcomePath,
        toGateId: normalizedOutcome.toGateId,
        toEndingId: normalizedOutcome.toEndingId,
      });
    }
  }

  if (typeof challenge.bestOutcomeId === "string" && !ctx.challengeOutcomes.has(challenge.bestOutcomeId)) {
    ctx.errors.push(
      `${pathLabel}.bestOutcomeId references missing outcome "${challenge.bestOutcomeId}".`,
    );
  }

  ctx.challenges.set(challenge.id, record);
}

function normalizeRoutes(ctx) {
  if (Array.isArray(ctx.level.routes)) {
    for (let index = 0; index < ctx.level.routes.length; index += 1) {
      const route = ctx.level.routes[index];
      const pathLabel = `routes[${index}]`;

      if (!isPlainObject(route)) {
        ctx.errors.push(`${pathLabel} must be an object.`);
        continue;
      }

      if (typeof route.id !== "string" || route.id.length === 0) {
        ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
        continue;
      }

      const routeType = asLowerString(route.routeType) || asLowerString(route.classification);
      const optional = route.optional === true || OPTIONAL_ROUTE_MARKERS.has(routeType);

      if (typeof route.fromGateId === "string") {
        ctx.routes.push({
          id: route.id,
          path: pathLabel,
          kind: "edge",
          routeType,
          optional,
          fromGateId: route.fromGateId,
          toGateId: typeof route.toGateId === "string" ? route.toGateId : null,
          toEndingId:
            typeof route.toEndingId === "string"
              ? route.toEndingId
              : typeof route.endingId === "string"
                ? route.endingId
                : null,
          gateIds: null,
          endingId: null,
          challengeId:
            typeof route.requiresChallengeId === "string"
              ? route.requiresChallengeId
              : typeof route.challengeId === "string"
                ? route.challengeId
                : null,
          challengeOutcomeId:
            typeof route.challengeOutcomeId === "string"
              ? route.challengeOutcomeId
              : null,
        });
        continue;
      }

      if (Array.isArray(route.gateIds)) {
        ctx.routes.push({
          id: route.id,
          path: pathLabel,
          kind: "path",
          routeType,
          optional,
          fromGateId: null,
          toGateId: null,
          toEndingId: null,
          gateIds: route.gateIds,
          endingId:
            typeof route.endingId === "string"
              ? route.endingId
              : typeof route.toEndingId === "string"
                ? route.toEndingId
                : null,
          challengeId: null,
          challengeOutcomeId: null,
        });
        continue;
      }

      if (
        (typeof route.endingId === "string" || typeof route.toEndingId === "string") &&
        route.fromGateId === undefined
      ) {
        ctx.routes.push({
          id: route.id,
          path: pathLabel,
          kind: "summary",
          routeType,
          optional,
          fromGateId: null,
          toGateId: null,
          toEndingId: null,
          gateIds: null,
          endingId:
            typeof route.endingId === "string"
              ? route.endingId
              : typeof route.toEndingId === "string"
                ? route.toEndingId
                : null,
          challengeId: null,
          challengeOutcomeId: null,
        });
        continue;
      }

      ctx.errors.push(
        `${pathLabel} must define either fromGateId/toGateId or gateIds/endingId.`,
      );
    }
  }

  if (isPlainObject(ctx.level.bestPath) && Array.isArray(ctx.level.bestPath.gateIds)) {
    ctx.routes.push({
      id: "__bestPath__",
      path: "bestPath",
      kind: "path",
      routeType: "best",
      optional: false,
      fromGateId: null,
      toGateId: null,
      toEndingId: null,
      gateIds: ctx.level.bestPath.gateIds,
      endingId:
        typeof ctx.level.bestPath.endingId === "string"
          ? ctx.level.bestPath.endingId
          : null,
      challengeId: null,
      challengeOutcomeId: null,
      synthetic: true,
    });
  }
}

function validateEndingProgression(ctx) {
  const initiallyUnlocked = [...ctx.endings.values()].filter(
    (ending) => ending.initiallyUnlocked,
  );
  if (initiallyUnlocked.length < 2 || initiallyUnlocked.length > 3) {
    ctx.errors.push("Levels must declare 2 or 3 initially unlocked endings.");
  }

  const endingIds = new Set(ctx.endings.keys());
  for (const ending of ctx.endings.values()) {
    if (
      ending.raw.unlocksEndingIds !== undefined &&
      !Array.isArray(ending.raw.unlocksEndingIds)
    ) {
      ctx.errors.push(`${ending.path}.unlocksEndingIds must be an array when declared.`);
      continue;
    }

    ending.unlocksEndingIds.forEach((unlockedEndingId, index) => {
      if (!endingIds.has(unlockedEndingId)) {
        ctx.errors.push(
          `${ending.path}.unlocksEndingIds[${index}] references unknown ending "${unlockedEndingId}".`,
        );
      }
    });
  }
}

function validateBarriers(ctx) {
  const barriers = ctx.level?.labyrinth?.barriers;
  const barrierIds = new Set();
  const endingIds = new Set(ctx.endings.keys());

  if (barriers !== undefined && !Array.isArray(barriers)) {
    ctx.errors.push("labyrinth.barriers must be an array when declared.");
    return;
  }

  if (Array.isArray(barriers)) {
    barriers.forEach((barrier, index) => {
      const pathLabel = `labyrinth.barriers[${index}]`;
      if (!isPlainObject(barrier)) {
        ctx.errors.push(`${pathLabel} must be an object.`);
        return;
      }

      if (typeof barrier.id !== "string" || barrier.id.length === 0) {
        ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
        return;
      }

      if (barrierIds.has(barrier.id)) {
        ctx.errors.push(`${pathLabel} duplicates barrier id "${barrier.id}".`);
      }
      barrierIds.add(barrier.id);

      if (!Array.isArray(barrier.cells) || barrier.cells.length === 0) {
        ctx.errors.push(`${pathLabel}.cells must be a non-empty array.`);
        return;
      }

      if (
        barrier.opensWhenEndingUnlocked !== undefined &&
        (typeof barrier.opensWhenEndingUnlocked !== "string" ||
          !endingIds.has(barrier.opensWhenEndingUnlocked))
      ) {
        ctx.errors.push(
          `${pathLabel}.opensWhenEndingUnlocked references unknown ending "${barrier.opensWhenEndingUnlocked}".`,
        );
      }

      barrier.cells.forEach((cell, cellIndex) => {
        const coord = parseCoord(cell);
        if (!coord) {
          ctx.errors.push(`${pathLabel}.cells[${cellIndex}] must be a coordinate.`);
          return;
        }

        validateCoordInBounds(ctx, coord, `${pathLabel}.cells[${cellIndex}]`);
        if (ctx.map.layoutRows.length > 0 && !isWalkableCoord(ctx, coord)) {
          ctx.errors.push(
            `${pathLabel}.cells[${cellIndex}] is placed on a non-walkable tile.`,
          );
        }

        if (barrier.opensWhenEndingUnlocked === undefined) {
          ctx.permanentlyBlockedTiles.add(coordKey(coord));
        }
      });
    });
  }

  deriveEndingDoorBarrierErrors(ctx).forEach((error) => {
    ctx.errors.push(error);
  });
}

function validateCoinPickups(ctx) {
  if (ctx.level.coinPickups === undefined) {
    return;
  }

  if (!Array.isArray(ctx.level.coinPickups)) {
    ctx.errors.push("coinPickups must be an array when declared.");
    return;
  }

  const seen = new Set();
  const reserved = new Set();
  if (ctx.map.start) {
    reserved.add(coordKey(ctx.map.start));
  }
  for (const gate of ctx.gates.values()) {
    if (gate.coord) reserved.add(coordKey(gate.coord));
  }
  for (const ending of ctx.endings.values()) {
    if (ending.coord) reserved.add(coordKey(ending.coord));
  }

  ctx.level.coinPickups.forEach((coin, index) => {
    const pathLabel = `coinPickups[${index}]`;
    if (!isPlainObject(coin)) {
      ctx.errors.push(`${pathLabel} must be an object.`);
      return;
    }

    if (typeof coin.id !== "string" || coin.id.length === 0) {
      ctx.errors.push(`${pathLabel}.id must be a non-empty string.`);
      return;
    }

    if (seen.has(coin.id)) {
      ctx.errors.push(`${pathLabel} duplicates coin pickup id "${coin.id}".`);
    }
    seen.add(coin.id);

    const coord = parseCoord(coin.coord) ?? parseCoord({ x: coin.x, y: coin.y });
    if (!coord) {
      ctx.errors.push(`${pathLabel} must declare a coordinate.`);
      return;
    }

    validateCoordInBounds(ctx, coord, `${pathLabel}.coord`);
    if (ctx.map.layoutRows.length > 0 && !isWalkableCoord(ctx, coord)) {
      ctx.errors.push(`${pathLabel} is placed on a non-walkable tile.`);
    }

    if (reserved.has(coordKey(coord))) {
      ctx.errors.push(`${pathLabel} overlaps a start, gate, or ending tile.`);
    }

    if (Array.isArray(ctx.level?.labyrinth?.rooms)) {
      const insideRoom = ctx.level.labyrinth.rooms.some(
        (room) =>
          isPlainObject(room) &&
          Number.isInteger(room.x) &&
          Number.isInteger(room.y) &&
          Number.isInteger(room.width) &&
          Number.isInteger(room.height) &&
          coord.x >= room.x &&
          coord.x < room.x + room.width &&
          coord.y >= room.y &&
          coord.y < room.y + room.height,
      );
      if (insideRoom) {
        ctx.errors.push(`${pathLabel} must be on a corridor, not inside a room.`);
      }
    }

    if (!Number.isInteger(coin.value) || coin.value <= 0) {
      ctx.errors.push(`${pathLabel}.value must be a positive integer.`);
    }

    if (coin.routeId !== undefined && !ctx.routes.some((route) => route.id === coin.routeId)) {
      ctx.errors.push(`${pathLabel}.routeId references unknown route "${coin.routeId}".`);
    }
  });
}

function determineStartGates(ctx) {
  const gatesAtStart = [];
  if (ctx.map.start) {
    for (const gate of ctx.gates.values()) {
      if (gate.coord && gate.coord.x === ctx.map.start.x && gate.coord.y === ctx.map.start.y) {
        gatesAtStart.push(gate.id);
      }
    }
  }

  if (gatesAtStart.length === 1) {
    ctx.startGateIds = gatesAtStart;
    return;
  }

  if (gatesAtStart.length > 1) {
    ctx.errors.push(
      `Multiple gates share the labyrinth start tile (${gatesAtStart.join(", ")}).`,
    );
    ctx.startGateIds = gatesAtStart;
    return;
  }

  const startKindGates = [];
  for (const gate of ctx.gates.values()) {
    if (gate.kind === "start" || gate.kind === "entry") {
      startKindGates.push(gate.id);
    }
  }

  if (startKindGates.length === 1) {
    ctx.startGateIds = startKindGates;
    return;
  }

  if (startKindGates.length > 1) {
    ctx.errors.push(
      `Multiple gates are marked as start/entry (${startKindGates.join(", ")}).`,
    );
    ctx.startGateIds = startKindGates;
    return;
  }

  if (typeof ctx.level.rootStepId === "string") {
    const gatesAtRootStep = [];
    for (const gate of ctx.gates.values()) {
      if (gate.raw?.stepId === ctx.level.rootStepId) {
        gatesAtRootStep.push(gate.id);
      }
    }

    if (gatesAtRootStep.length === 1) {
      ctx.startGateIds = gatesAtRootStep;
      return;
    }

    if (gatesAtRootStep.length > 1) {
      ctx.errors.push(
        `Multiple gates point at rootStepId "${ctx.level.rootStepId}" (${gatesAtRootStep.join(", ")}).`,
      );
      ctx.startGateIds = gatesAtRootStep;
      return;
    }

    const gatesFromStepTraversal = inferStartGatesFromSteps(ctx.level);
    if (gatesFromStepTraversal.length === 1 && ctx.gates.has(gatesFromStepTraversal[0])) {
      ctx.startGateIds = gatesFromStepTraversal;
      return;
    }

    if (gatesFromStepTraversal.length > 1) {
      const knownGateIds = gatesFromStepTraversal.filter((gateId) => ctx.gates.has(gateId));
      if (knownGateIds.length > 0) {
        ctx.startGateIds = knownGateIds;
        ctx.warnings.push(
          `Multiple step-derived entry gates were found (${knownGateIds.join(", ")}); using them as start candidates.`,
        );
        return;
      }
    }
  }

  if (isPlainObject(ctx.level.bestPath) && Array.isArray(ctx.level.bestPath.gateIds)) {
    const firstGateId = ctx.level.bestPath.gateIds[0];
    if (typeof firstGateId === "string" && ctx.gates.has(firstGateId)) {
      ctx.startGateIds = [firstGateId];
      return;
    }
  }

  const entryCandidates = inferGraphEntryGates(ctx);
  if (entryCandidates.length === 1) {
    ctx.startGateIds = entryCandidates;
    return;
  }

  if (entryCandidates.length > 1) {
    ctx.warnings.push(
      `Multiple entry-like gates were inferred (${entryCandidates.join(", ")}); using them all as start candidates.`,
    );
    ctx.startGateIds = entryCandidates;
    return;
  }

  ctx.errors.push("Unable to determine the start gate for the narrative graph.");
}

function determineBestEnding(ctx) {
  const explicitRecommendedEnding =
    typeof ctx.level.recommendedEndingId === "string"
      ? ctx.level.recommendedEndingId
      : typeof ctx.level.bestEndingId === "string"
        ? ctx.level.bestEndingId
        : typeof ctx.level.bestPath?.endingId === "string"
          ? ctx.level.bestPath.endingId
          : null;

  if (explicitRecommendedEnding) {
    ctx.bestEndingId = explicitRecommendedEnding;
  }

  if (!ctx.bestEndingId && typeof ctx.level.recommendedRouteId === "string") {
    const route = ctx.routes.find((entry) => entry.id === ctx.level.recommendedRouteId);
    if (route?.endingId) {
      ctx.bestEndingId = route.endingId;
    }
  }

  if (!ctx.bestEndingId) {
    const bestRoute = ctx.routes.find((route) =>
      route.endingId && BEST_ROUTE_MARKERS.has(route.routeType)
    );
    if (bestRoute?.endingId) {
      ctx.bestEndingId = bestRoute.endingId;
    }
  }

  if (!ctx.bestEndingId) {
    const explicitBestEnding = [...ctx.endings.values()].find((ending) =>
      ending.kind === "best" || ending.kind === "mastery"
    );
    if (explicitBestEnding) {
      ctx.bestEndingId = explicitBestEnding.id;
    }
  }

  if (!ctx.bestEndingId) {
    const ranked = [...ctx.endings.values()]
      .filter((ending) => ending.rank !== null)
      .sort((left, right) => left.rank - right.rank);
    if (ranked.length > 0) {
      ctx.bestEndingId = ranked[0].id;
    }
  }

  if (!ctx.bestEndingId) {
    ctx.errors.push("Unable to determine the best ending for the level.");
    return;
  }

  if (!ctx.endings.has(ctx.bestEndingId)) {
    ctx.errors.push(`Best ending "${ctx.bestEndingId}" is not declared in endings.`);
  }
}

function validateRouteReferences(ctx) {
  const seenRouteIds = new Set();

  for (const route of ctx.routes) {
    if (seenRouteIds.has(route.id) && !route.synthetic) {
      ctx.errors.push(`${route.path} duplicates route id "${route.id}".`);
    }
    seenRouteIds.add(route.id);

    if (route.kind === "edge") {
      if (!ctx.gates.has(route.fromGateId)) {
        ctx.errors.push(`${route.path}.fromGateId references unknown gate "${route.fromGateId}".`);
      }

      if (!route.toGateId && !route.toEndingId) {
        ctx.errors.push(`${route.path} must point to a gate or ending.`);
      }

      if (route.toGateId && !ctx.gates.has(route.toGateId)) {
        ctx.errors.push(`${route.path}.toGateId references unknown gate "${route.toGateId}".`);
      }

      if (route.toEndingId && !ctx.endings.has(route.toEndingId)) {
        ctx.errors.push(
          `${route.path}.toEndingId references unknown ending "${route.toEndingId}".`,
        );
      }

      if (route.challengeId && !ctx.challenges.has(route.challengeId)) {
        ctx.errors.push(
          `${route.path}.requiresChallengeId references unknown challenge "${route.challengeId}".`,
        );
      }

      if (route.challengeOutcomeId) {
        const outcome = ctx.challengeOutcomes.get(route.challengeOutcomeId);
        if (!outcome) {
          ctx.errors.push(
            `${route.path}.challengeOutcomeId references unknown outcome "${route.challengeOutcomeId}".`,
          );
        } else if (route.challengeId && outcome.challengeId !== route.challengeId) {
          ctx.errors.push(
            `${route.path}.challengeOutcomeId does not belong to challenge "${route.challengeId}".`,
          );
        } else {
          if (route.toGateId && outcome.toGateId && route.toGateId !== outcome.toGateId) {
            ctx.errors.push(
              `${route.path} targets gate "${route.toGateId}" but outcome "${route.challengeOutcomeId}" leads to "${outcome.toGateId}".`,
            );
          }
          if (
            route.toEndingId &&
            outcome.toEndingId &&
            route.toEndingId !== outcome.toEndingId
          ) {
            ctx.errors.push(
              `${route.path} targets ending "${route.toEndingId}" but outcome "${route.challengeOutcomeId}" leads to "${outcome.toEndingId}".`,
            );
          }
        }
      }
    }

    if (route.kind === "path") {
      if (!route.endingId) {
        ctx.errors.push(`${route.path}.endingId must be a non-empty string.`);
      } else if (!ctx.endings.has(route.endingId)) {
        ctx.errors.push(`${route.path}.endingId references unknown ending "${route.endingId}".`);
      }

      if (!Array.isArray(route.gateIds) || route.gateIds.length === 0) {
        ctx.errors.push(`${route.path}.gateIds must be a non-empty array.`);
        continue;
      }

      route.gateIds.forEach((gateId, index) => {
        if (typeof gateId !== "string" || gateId.length === 0) {
          ctx.errors.push(`${route.path}.gateIds[${index}] must be a non-empty string.`);
        } else if (!ctx.gates.has(gateId)) {
          ctx.errors.push(`${route.path}.gateIds[${index}] references unknown gate "${gateId}".`);
        }
      });
    }

    if (route.kind === "summary") {
      if (!route.endingId) {
        ctx.errors.push(`${route.path}.endingId must be a non-empty string.`);
      } else if (!ctx.endings.has(route.endingId)) {
        ctx.errors.push(`${route.path}.endingId references unknown ending "${route.endingId}".`);
      }
    }
  }
}

function validateChallengeReferences(ctx) {
  for (const challenge of ctx.challenges.values()) {
    if (challenge.entryGateId && !ctx.gates.has(challenge.entryGateId)) {
      ctx.errors.push(
        `${challenge.path} references unknown entry gate "${challenge.entryGateId}".`,
      );
    }

    for (const outcome of challenge.outcomes) {
      if (outcome.toGateId && !ctx.gates.has(outcome.toGateId)) {
        ctx.errors.push(
          `${outcome.path} references unknown gate "${outcome.toGateId}".`,
        );
      }
      if (outcome.toEndingId && !ctx.endings.has(outcome.toEndingId)) {
        ctx.errors.push(
          `${outcome.path} references unknown ending "${outcome.toEndingId}".`,
        );
      }
    }
  }
}

function validateRewardConsistency(ctx) {
  const gateRewards = [];
  for (const gate of ctx.gates.values()) {
    const reward = gate.raw.rewards ?? gate.raw.reward;
    if (reward !== undefined) {
      gateRewards.push({
        owner: gate.path,
        reward,
      });
    }
  }

  const challengeRewards = [];
  for (const challenge of ctx.challenges.values()) {
    const reward = challenge.raw?.rewards ?? challenge.raw?.reward;
    if (reward !== undefined) {
      challengeRewards.push({
        owner: challenge.path,
        reward,
      });
    }
  }

  const endingRewards = [];
  for (const ending of ctx.endings.values()) {
    const reward = ending.raw.rewards ?? ending.raw.reward;
    if (reward !== undefined) {
      endingRewards.push({
        owner: ending.path,
        endingId: ending.id,
        completesLevel: ending.completesLevel,
        reward,
      });
    }
  }

  if (gateRewards.length > 0 && gateRewards.length !== ctx.gates.size) {
    ctx.errors.push("Gate rewards are inconsistent: either every gate should declare rewards or none should.");
  }

  if (challengeRewards.length > 0 && challengeRewards.length !== ctx.challenges.size) {
    ctx.errors.push("Challenge rewards are inconsistent: either every challenge should declare rewards or none should.");
  }

  const completingEndingRewards = endingRewards.filter((entry) => entry.completesLevel);
  if (
    completingEndingRewards.length > 0 &&
    completingEndingRewards.length !== ctx.completingEndingIds.length
  ) {
    ctx.errors.push(
      "Completing ending rewards are inconsistent: either every completing ending should declare rewards or none should.",
    );
  }

  if (ctx.level.scoring !== undefined) {
    validateNumericTree(ctx, ctx.level.scoring, "scoring");
  }

  if (!ctx.bestEndingId) {
    return;
  }

  const bestEnding = ctx.endings.get(ctx.bestEndingId);
  if (!bestEnding) {
    return;
  }

  const bestReward = bestEnding.raw.rewards ?? bestEnding.raw.reward;
  if (!isPlainObject(bestReward)) {
    return;
  }

  const bestLeaves = collectNumericLeaves(bestReward);
  for (const endingId of ctx.completingEndingIds) {
    if (endingId === bestEnding.id) {
      continue;
    }
    const ending = ctx.endings.get(endingId);
    const reward = ending?.raw.rewards ?? ending?.raw.reward;
    if (!isPlainObject(reward)) {
      continue;
    }
    for (const [leafPath, value] of collectNumericLeaves(reward)) {
      const bestValue = bestLeaves.get(leafPath) ?? 0;
      if (bestValue < value) {
        ctx.errors.push(
          `Best ending "${bestEnding.id}" under-rewards "${leafPath}" compared with completing ending "${endingId}".`,
        );
      }
    }
  }
}

function validateSpatialReachability(ctx) {
  if (!ctx.map.start || ctx.map.layoutRows.length === 0) {
    return;
  }

  ctx.physicallyReachableTiles = floodFill(
    ctx,
    ctx.map.start,
    ctx.permanentlyBlockedTiles,
  );

  for (const gate of ctx.gates.values()) {
    if (!gate.coord) {
      continue;
    }
    if (!ctx.physicallyReachableTiles.has(coordKey(gate.coord))) {
      ctx.errors.push(`Gate "${gate.id}" is unreachable from labyrinth.start.`);
    }
  }

  for (const ending of ctx.endings.values()) {
    if (!ending.coord) {
      continue;
    }
    if (!ctx.physicallyReachableTiles.has(coordKey(ending.coord))) {
      ctx.errors.push(`Ending "${ending.id}" is unreachable from labyrinth.start.`);
    } else {
      ctx.physicallyReachableEndings.add(ending.id);
    }
  }
}

function validateRootStepGraph(ctx) {
  if (!Array.isArray(ctx.level.steps) || typeof ctx.level.rootStepId !== "string") {
    return;
  }

  const steps = new Map();
  ctx.level.steps.forEach((step, index) => {
    const stepPath = `steps[${index}]`;
    if (!isPlainObject(step)) {
      ctx.errors.push(`${stepPath} must be an object.`);
      return;
    }

    if (typeof step.id !== "string" || step.id.length === 0) {
      ctx.errors.push(`${stepPath}.id must be a non-empty string.`);
      return;
    }

    if (steps.has(step.id)) {
      ctx.errors.push(`${stepPath} duplicates step id "${step.id}".`);
      return;
    }

    steps.set(step.id, {
      value: step,
      path: stepPath,
    });
  });

  if (!steps.has(ctx.level.rootStepId)) {
    ctx.errors.push(`rootStepId references missing step "${ctx.level.rootStepId}".`);
    return;
  }

  const queue = [ctx.level.rootStepId];
  const seen = new Set();

  while (queue.length > 0) {
    const stepId = queue.shift();
    if (seen.has(stepId)) {
      continue;
    }
    seen.add(stepId);

    const record = steps.get(stepId);
    if (!record) {
      continue;
    }

    const step = record.value;
    if (typeof step.endingId === "string") {
      if (!ctx.endings.has(step.endingId)) {
        ctx.errors.push(`${record.path}.endingId references unknown ending "${step.endingId}".`);
      } else {
        ctx.stepReachableEndings.add(step.endingId);
      }
    }

    if (step.kind === "place" && step.nextStepId !== undefined) {
      if (!steps.has(step.nextStepId)) {
        ctx.errors.push(
          `${record.path}.nextStepId references missing step "${step.nextStepId}".`,
        );
      } else {
        queue.push(step.nextStepId);
      }
    }

    if (step.kind === "decision") {
      if (!Array.isArray(step.branches) || step.branches.length === 0) {
        ctx.errors.push(`${record.path}.branches must be a non-empty array.`);
        continue;
      }

      step.branches.forEach((branch, index) => {
        if (typeof branch?.nextStepId !== "string" || !steps.has(branch.nextStepId)) {
          ctx.errors.push(
            `${record.path}.branches[${index}].nextStepId references missing step "${branch?.nextStepId}".`,
          );
          return;
        }
        queue.push(branch.nextStepId);
      });
    }
  }
}

function buildNarrativeGraph(ctx) {
  const edgeIds = new Set();
  ctx.edges = [];

  for (const route of ctx.routes) {
    if (route.kind === "edge") {
      const target = route.toGateId
        ? { kind: "gate", id: route.toGateId }
        : route.toEndingId
          ? { kind: "ending", id: route.toEndingId }
          : null;

      if (!target) {
        continue;
      }

      const edgeId = `${route.id}:edge`;
      if (edgeIds.has(edgeId)) {
        continue;
      }
      edgeIds.add(edgeId);

      ctx.edges.push({
        id: edgeId,
        path: route.path,
        fromGateId: route.fromGateId,
        to: target,
        routeId: route.id,
        optional: route.optional,
        challengeId: route.challengeId,
      });
      continue;
    }

    if (route.kind === "path" && Array.isArray(route.gateIds) && route.gateIds.length > 0) {
      for (let index = 0; index < route.gateIds.length - 1; index += 1) {
        const edgeId = `${route.id}:segment:${index}`;
        if (edgeIds.has(edgeId)) {
          continue;
        }
        edgeIds.add(edgeId);

        ctx.edges.push({
          id: edgeId,
          path: `${route.path}.gateIds[${index}]`,
          fromGateId: route.gateIds[index],
          to: {
            kind: "gate",
            id: route.gateIds[index + 1],
          },
          routeId: route.id,
          optional: route.optional,
          challengeId: null,
        });
      }

      if (route.endingId) {
        const edgeId = `${route.id}:ending`;
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          ctx.edges.push({
            id: edgeId,
            path: `${route.path}.endingId`,
            fromGateId: route.gateIds[route.gateIds.length - 1],
            to: {
              kind: "ending",
              id: route.endingId,
            },
            routeId: route.id,
            optional: route.optional,
            challengeId: null,
          });
        }
      }
    }
  }

  for (const challenge of ctx.challenges.values()) {
    if (!challenge.entryGateId) {
      continue;
    }
    challenge.outcomes.forEach((outcome, index) => {
      const target = outcome.toGateId
        ? { kind: "gate", id: outcome.toGateId }
        : outcome.toEndingId
          ? { kind: "ending", id: outcome.toEndingId }
          : null;
      if (!target) {
        return;
      }
      const edgeId = `challenge:${challenge.id}:${index}`;
      if (edgeIds.has(edgeId)) {
        return;
      }
      edgeIds.add(edgeId);

      ctx.edges.push({
        id: edgeId,
        path: outcome.path,
        fromGateId: challenge.entryGateId,
        to: target,
        routeId: null,
        optional: challenge.optional,
        challengeId: challenge.id,
      });
    });
  }
}

function validateNarrativeReachability(ctx) {
  if (ctx.startGateIds.length === 0) {
    return;
  }

  if (ctx.edges.length === 0) {
    for (const gateId of ctx.startGateIds) {
      ctx.narrativeReachableGates.add(gateId);
    }
    for (const endingId of ctx.physicallyReachableEndings) {
      ctx.narrativeReachableEndings.add(endingId);
    }
  } else {
    const adjacency = new Map();
    for (const edge of ctx.edges) {
      if (!adjacency.has(edge.fromGateId)) {
        adjacency.set(edge.fromGateId, []);
      }
      adjacency.get(edge.fromGateId).push(edge);
    }

    const queue = [...ctx.startGateIds];
    while (queue.length > 0) {
      const gateId = queue.shift();
      if (ctx.narrativeReachableGates.has(gateId)) {
        continue;
      }
      ctx.narrativeReachableGates.add(gateId);

      for (const edge of adjacency.get(gateId) ?? []) {
        if (edge.to.kind === "gate") {
          if (!ctx.narrativeReachableGates.has(edge.to.id)) {
            queue.push(edge.to.id);
          }
        } else {
          ctx.narrativeReachableEndings.add(edge.to.id);
        }
      }
    }
  }

  for (const endingId of ctx.stepReachableEndings) {
    ctx.narrativeReachableEndings.add(endingId);
  }

  for (const endingId of ctx.endings.keys()) {
    if (!ctx.narrativeReachableEndings.has(endingId)) {
      ctx.errors.push(`Declared ending "${endingId}" is not narratively reachable.`);
    }
  }

  if (ctx.bestEndingId && !ctx.narrativeReachableEndings.has(ctx.bestEndingId)) {
    ctx.errors.push(`Best ending "${ctx.bestEndingId}" is not narratively reachable.`);
  }

  const reachableCompleting = ctx.completingEndingIds.filter((endingId) =>
    ctx.narrativeReachableEndings.has(endingId)
  );
  if (reachableCompleting.length === 0) {
    ctx.errors.push("No completing ending is narratively reachable.");
  }
}

function validateOptionalFallbacks(ctx) {
  for (const route of ctx.routes) {
    if (!route.optional) {
      continue;
    }

    const sourceGateId =
      route.kind === "edge"
        ? route.fromGateId
        : Array.isArray(route.gateIds) && route.gateIds.length > 0
          ? route.gateIds[0]
          : null;

    if (!sourceGateId || !ctx.gates.has(sourceGateId)) {
      continue;
    }

    if (!isReachableFromStartWithoutOptional(ctx, sourceGateId)) {
      continue;
    }

    const bannedEdgeIds = new Set(
      ctx.edges
        .filter((edge) => edge.routeId === route.id)
        .map((edge) => edge.id),
    );

    const hasAlternativeSibling = ctx.edges.some(
      (edge) =>
        edge.fromGateId === sourceGateId &&
        !bannedEdgeIds.has(edge.id) &&
        edge.optional === false,
    );

    if (!hasAlternativeSibling) {
      continue;
    }

    if (!canReachCompletingEnding(ctx, sourceGateId, bannedEdgeIds)) {
      ctx.errors.push(
        `${route.path} fails the optional fallback check: skipping this optional route leaves no path to a completing ending.`,
      );
    }
  }

  for (const challenge of ctx.challenges.values()) {
    if (!challenge.optional || !challenge.entryGateId || !ctx.gates.has(challenge.entryGateId)) {
      continue;
    }

    const bannedEdgeIds = new Set(
      ctx.edges
        .filter((edge) => edge.challengeId === challenge.id)
        .map((edge) => edge.id),
    );

    if (!canReachCompletingEnding(ctx, challenge.entryGateId, bannedEdgeIds)) {
      ctx.errors.push(
        `${challenge.path} fails the optional fallback check: skipping this optional challenge leaves no path to a completing ending.`,
      );
    }
  }
}

function canReachCompletingEnding(ctx, startGateId, bannedEdgeIds) {
  const adjacency = new Map();
  for (const edge of ctx.edges) {
    if (bannedEdgeIds.has(edge.id)) {
      continue;
    }
    if (!adjacency.has(edge.fromGateId)) {
      adjacency.set(edge.fromGateId, []);
    }
    adjacency.get(edge.fromGateId).push(edge);
  }

  const queue = [startGateId];
  const seenGates = new Set();

  while (queue.length > 0) {
    const gateId = queue.shift();
    if (seenGates.has(gateId)) {
      continue;
    }
    seenGates.add(gateId);

    for (const edge of adjacency.get(gateId) ?? []) {
      if (edge.to.kind === "ending") {
        if (ctx.completingEndingIds.includes(edge.to.id)) {
          return true;
        }
      } else if (!seenGates.has(edge.to.id)) {
        queue.push(edge.to.id);
      }
    }
  }

  return false;
}

function isReachableFromStartWithoutOptional(ctx, targetGateId) {
  if (ctx.startGateIds.includes(targetGateId)) {
    return true;
  }

  const adjacency = new Map();
  for (const edge of ctx.edges) {
    if (edge.optional) {
      continue;
    }
    if (!adjacency.has(edge.fromGateId)) {
      adjacency.set(edge.fromGateId, []);
    }
    adjacency.get(edge.fromGateId).push(edge);
  }

  const queue = [...ctx.startGateIds];
  const seen = new Set();

  while (queue.length > 0) {
    const gateId = queue.shift();
    if (seen.has(gateId)) {
      continue;
    }
    seen.add(gateId);
    if (gateId === targetGateId) {
      return true;
    }
    for (const edge of adjacency.get(gateId) ?? []) {
      if (edge.to.kind === "gate" && !seen.has(edge.to.id)) {
        queue.push(edge.to.id);
      }
    }
  }

  return false;
}

function inferGraphEntryGates(ctx) {
  const outgoing = new Set();
  const incoming = new Set();

  for (const route of ctx.routes) {
    if (route.kind === "edge") {
      if (typeof route.fromGateId === "string") {
        outgoing.add(route.fromGateId);
      }
      if (typeof route.toGateId === "string") {
        incoming.add(route.toGateId);
      }
      continue;
    }

    if (route.kind === "path" && Array.isArray(route.gateIds) && route.gateIds.length > 0) {
      outgoing.add(route.gateIds[0]);
      for (let index = 1; index < route.gateIds.length; index += 1) {
        incoming.add(route.gateIds[index]);
      }
    }
  }

  for (const challenge of ctx.challenges.values()) {
    if (challenge.entryGateId) {
      outgoing.add(challenge.entryGateId);
    }
    for (const outcome of challenge.outcomes) {
      if (typeof outcome.toGateId === "string") {
        incoming.add(outcome.toGateId);
      }
    }
  }

  return [...outgoing].filter((gateId) => !incoming.has(gateId));
}

function inferStartGatesFromSteps(level) {
  if (!Array.isArray(level.steps) || typeof level.rootStepId !== "string") {
    return [];
  }

  const steps = new Map();
  for (const step of level.steps) {
    if (isPlainObject(step) && typeof step.id === "string") {
      steps.set(step.id, step);
    }
  }

  if (!steps.has(level.rootStepId)) {
    return [];
  }

  const queue = [{ stepId: level.rootStepId, depth: 0 }];
  const seen = new Set();
  let targetDepth = null;
  const foundGateIds = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current.stepId)) {
      continue;
    }
    seen.add(current.stepId);

    if (targetDepth !== null && current.depth > targetDepth) {
      break;
    }

    const step = steps.get(current.stepId);
    if (!step) {
      continue;
    }

    if (typeof step.gateId === "string" && step.gateId.length > 0) {
      targetDepth = current.depth;
      foundGateIds.add(step.gateId);
      continue;
    }

    if (step.kind === "place" && typeof step.nextStepId === "string") {
      queue.push({ stepId: step.nextStepId, depth: current.depth + 1 });
    }

    if (step.kind === "decision" && Array.isArray(step.branches)) {
      for (const branch of step.branches) {
        if (typeof branch?.nextStepId === "string") {
          queue.push({ stepId: branch.nextStepId, depth: current.depth + 1 });
        }
      }
    }
  }

  return [...foundGateIds];
}

function validatePuzzle(ctx, puzzle, pathLabel) {
  if (!isPlainObject(puzzle)) {
    ctx.errors.push(`${pathLabel} must be an object.`);
    return;
  }

  if (!Array.isArray(puzzle.steps)) {
    ctx.errors.push(`${pathLabel}.steps must be an array.`);
    return;
  }

  if (typeof puzzle.rootStepId !== "string" || puzzle.rootStepId.length === 0) {
    ctx.errors.push(`${pathLabel}.rootStepId must be a non-empty string.`);
    return;
  }

  const stepIds = new Set();

  puzzle.steps.forEach((step, index) => {
    const stepPath = `${pathLabel}.steps[${index}]`;
    if (!isPlainObject(step)) {
      ctx.errors.push(`${stepPath} must be an object.`);
      return;
    }

    if (typeof step.id !== "string" || step.id.length === 0) {
      ctx.errors.push(`${stepPath}.id must be a non-empty string.`);
      return;
    }

    if (stepIds.has(step.id)) {
      ctx.errors.push(`${stepPath} duplicates puzzle step id "${step.id}".`);
      return;
    }

    stepIds.add(step.id);
  });

  if (!stepIds.has(puzzle.rootStepId)) {
    ctx.errors.push(`${pathLabel}.rootStepId references missing step "${puzzle.rootStepId}".`);
  }

  puzzle.steps.forEach((step, index) => {
    if (!isPlainObject(step) || typeof step.id !== "string") {
      return;
    }

    const stepPath = `${pathLabel}.steps[${index}]`;

    if (step.kind === "place" && step.nextStepId !== undefined) {
      if (typeof step.nextStepId !== "string" || !stepIds.has(step.nextStepId)) {
        ctx.errors.push(
          `${stepPath}.nextStepId references missing step "${step.nextStepId}".`,
        );
      }
    }

    if (step.kind === "decision") {
      if (!Array.isArray(step.branches) || step.branches.length === 0) {
        ctx.errors.push(`${stepPath}.branches must be a non-empty array.`);
        return;
      }

      step.branches.forEach((branch, branchIndex) => {
        if (
          typeof branch?.nextStepId !== "string" ||
          !stepIds.has(branch.nextStepId)
        ) {
          ctx.errors.push(
            `${stepPath}.branches[${branchIndex}].nextStepId references missing step "${branch?.nextStepId}".`,
          );
        }
      });
    }
  });
}

function validateLocalMap(ctx, rows, width, height, pathLabel) {
  if (!isPositiveInteger(width)) {
    ctx.errors.push(`${pathLabel.replace(/\.map$/, ".width")} must be a positive integer.`);
  }
  if (!isPositiveInteger(height)) {
    ctx.errors.push(`${pathLabel.replace(/\.map$/, ".height")} must be a positive integer.`);
  }

  if (isPositiveInteger(height) && rows.length !== height) {
    ctx.errors.push(`${pathLabel} has ${rows.length} row(s), expected ${height}.`);
  }

  rows.forEach((row, index) => {
    if (typeof row !== "string") {
      ctx.errors.push(`${pathLabel}[${index}] must be a string.`);
      return;
    }
    if (isPositiveInteger(width) && row.length !== width) {
      ctx.errors.push(`${pathLabel}[${index}] has width ${row.length}, expected ${width}.`);
    }
  });
}

function validateLocalCoord(ctx, coord, width, height, label) {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    return;
  }
  if (coord.x < 0 || coord.x >= width || coord.y < 0 || coord.y >= height) {
    ctx.errors.push(`${label} must be inside the local challenge bounds.`);
  }
}

function validateCoordInBounds(ctx, coord, label) {
  if (ctx.map.width !== null && (coord.x < 0 || coord.x >= ctx.map.width)) {
    ctx.errors.push(`${label} has x=${coord.x} outside the labyrinth width.`);
  }
  if (ctx.map.height !== null && (coord.y < 0 || coord.y >= ctx.map.height)) {
    ctx.errors.push(`${label} has y=${coord.y} outside the labyrinth height.`);
  }
}

function validateRewardBundle(ctx, reward, label) {
  if (reward === undefined) {
    return;
  }
  if (!isPlainObject(reward)) {
    ctx.errors.push(`${label} must be an object when rewards are declared.`);
    return;
  }
  validateNumericTree(ctx, reward, label);
}

function validateNumericTree(ctx, value, label) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      validateNumericTree(ctx, entry, `${label}[${index}]`);
    });
    return;
  }

  if (!isPlainObject(value)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      ctx.errors.push(`${label} must contain only finite non-negative numbers.`);
    }
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    validateNumericTree(ctx, entry, `${label}.${key}`);
  }
}

function inferCompletesLevel(ending) {
  if (typeof ending.completesLevel === "boolean") {
    return ending.completesLevel;
  }

  const marker =
    asLowerString(ending.tier) ||
    asLowerString(ending.kind) ||
    asLowerString(ending.outcome);

  if (COMPLETING_ENDING_MARKERS.has(marker)) {
    return true;
  }
  if (NON_COMPLETING_ENDING_MARKERS.has(marker)) {
    return false;
  }

  return false;
}

function compileRoomRows(width, height, rooms, links) {
  const grid = Array.from({ length: height }, () => Array(width).fill("#"));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const carve = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[y][x] = ".";
    }
  };

  rooms.forEach((room) => {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        carve(x, y);
      }
    }
  });

  links.forEach((link) => {
    const from = roomById.get(link.fromRoomId);
    const to = roomById.get(link.toRoomId);
    if (!from || !to) {
      return;
    }

    const points = [roomCenter(from), ...(link.points ?? []), roomCenter(to)];
    for (let index = 0; index < points.length - 1; index += 1) {
      carveSegment(points[index], points[index + 1], carve);
    }
  });

  return grid.map((row) => row.join(""));
}

function carveSegment(from, to, carve) {
  let x = from.x;
  let y = from.y;
  carve(x, y);

  while (x !== to.x) {
    x += Math.sign(to.x - x);
    carve(x, y);
  }

  while (y !== to.y) {
    y += Math.sign(to.y - y);
    carve(x, y);
  }
}

function roomCenter(room) {
  return {
    x: room.x + Math.floor(room.width / 2),
    y: room.y + Math.floor(room.height / 2),
  };
}

function deriveEndingDoorBarrierErrors(ctx) {
  const rooms = ctx.roomGraph.rooms ?? [];
  const links = ctx.roomGraph.links ?? [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const errors = [];

  rooms
    .filter((room) => typeof room.endingId === "string" && room.endingId.length > 0)
    .forEach((room) => {
      const incomingLinks = links.filter((link) => link.toRoomId === room.id);
      if (incomingLinks.length !== 1) {
        errors.push(
          `Ending room "${room.endingId}" must have exactly one incoming room link to derive an entry-path barrier.`,
        );
        return;
      }

      const link = incomingLinks[0];
      const fromRoom = roomById.get(link.fromRoomId);
      if (!fromRoom) {
        errors.push(
          `Ending room "${room.endingId}" entry-path barrier references missing room "${link.fromRoomId}".`,
        );
        return;
      }

      const path = [roomCenter(fromRoom), ...(link.points ?? []), roomCenter(room)];
      const sourcePoint = path[0];
      const nextPoint = findNextDistinctPoint(path, sourcePoint);
      const doorway = deriveDepartureCell(fromRoom, sourcePoint, nextPoint);

      if (!doorway) {
        errors.push(
          `Ending room "${room.endingId}" could not derive an entry-path barrier from its incoming room link.`,
        );
      }
    });

  return errors;
}

function deriveDepartureCell(room, sourcePoint, nextPoint) {
  if (!nextPoint) {
    return null;
  }

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

function findNextDistinctPoint(path, sourcePoint) {
  for (let index = 1; index < path.length; index += 1) {
    const point = path[index];
    if (point.x !== sourcePoint.x || point.y !== sourcePoint.y) {
      return point;
    }
  }

  return undefined;
}

function buildWalkableSet(level, rows) {
  const walkable = new Set();
  const legend = isPlainObject(level?.labyrinth?.legend) ? level.labyrinth.legend : null;

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const legendEntry = legend?.[tile];
      const walkableByLegend =
        isPlainObject(legendEntry) && typeof legendEntry.walkable === "boolean"
          ? legendEntry.walkable
          : null;
      const isWalkable = walkableByLegend ?? tile !== "#";
      if (isWalkable) {
        walkable.add(coordKey({ x, y }));
      }
    }
  });

  return walkable;
}

function floodFill(ctx, start, blockedTiles = new Set()) {
  const queue = [start];
  const visited = new Set();

  while (queue.length > 0) {
    const coord = queue.shift();
    const key = coordKey(coord);
    if (visited.has(key) || blockedTiles.has(key) || !ctx.map.walkable.has(key)) {
      continue;
    }
    visited.add(key);
    queue.push({ x: coord.x + 1, y: coord.y });
    queue.push({ x: coord.x - 1, y: coord.y });
    queue.push({ x: coord.x, y: coord.y + 1 });
    queue.push({ x: coord.x, y: coord.y - 1 });
  }

  return visited;
}

function isWalkableCoord(ctx, coord) {
  return ctx.map.walkable.has(coordKey(coord));
}

function collectNumericLeaves(value, prefix = "$") {
  const leaves = new Map();
  collectNumericLeavesInto(value, prefix, leaves);
  return leaves;
}

function collectNumericLeavesInto(value, prefix, leaves) {
  if (typeof value === "number" && Number.isFinite(value)) {
    leaves.set(prefix, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectNumericLeavesInto(entry, `${prefix}[${index}]`, leaves);
    });
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectNumericLeavesInto(entry, `${prefix}.${key}`, leaves);
    }
  }
}

function resolveInputFiles(args) {
  if (args.length > 0) {
    return args.map((entry) => path.resolve(process.cwd(), entry));
  }

  if (!fs.existsSync(levelsDir)) {
    return [];
  }

  return fs
    .readdirSync(levelsDir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => path.join(levelsDir, name));
}

function readJson(filePath) {
  try {
    return {
      ok: true,
      value: JSON.parse(fs.readFileSync(filePath, "utf8")),
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getByPath(root, pathParts) {
  let current = root;
  for (const pathPart of pathParts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[pathPart];
  }
  return current;
}

function formatPath(pathParts) {
  return pathParts.join(".");
}

function parseCoord(value) {
  if (Array.isArray(value) && value.length === 2) {
    const [x, y] = value;
    if (Number.isInteger(x) && Number.isInteger(y)) {
      return { x, y };
    }
  }

  if (isPlainObject(value) && Number.isInteger(value.x) && Number.isInteger(value.y)) {
    return {
      x: value.x,
      y: value.y,
    };
  }

  return null;
}

function coordKey(coord) {
  return `${coord.x},${coord.y}`;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function asLowerString(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printResults(results, skipped, scannedCount) {
  console.log(`Scanned ${scannedCount} level file(s).`);

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} non-v2 file(s):`);
    for (const entry of skipped) {
      const schemaLabel =
        entry.schemaVersion === null
          ? "schemaVersion missing"
          : `schemaVersion ${entry.schemaVersion}`;
      console.log(`- ${entry.levelId}: ${schemaLabel}`);
    }
  }

  if (results.length === 0) {
    console.log("No schemaVersion 2 levels found.");
    return;
  }

  for (const result of results) {
    const status = result.errors.length > 0 ? "FAIL" : "PASS";
    console.log(`${status} ${result.levelId} (${path.relative(repoRoot, result.filePath)})`);
    if (result.summary) {
      console.log(
        `  gates=${result.summary.gates}, endings=${result.summary.endings}, routes=${result.summary.routes}, challenges=${result.summary.challenges}, completing=${result.summary.completingEndings}`,
      );
    }
    for (const error of result.errors) {
      console.log(`  error: ${error}`);
    }
    for (const warning of result.warnings) {
      console.log(`  warning: ${warning}`);
    }
  }

  const errorCount = results.reduce((sum, result) => sum + result.errors.length, 0);
  const warningCount = results.reduce((sum, result) => sum + result.warnings.length, 0);
  console.log(`Finished with ${errorCount} error(s) and ${warningCount} warning(s).`);
}
