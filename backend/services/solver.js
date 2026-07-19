// Constraint-based layout proposal engine
// SRS §3.3: Greedy placement algorithm with collision detection
// This is NOT AI — it's spatial constraint solving

// Check if two machines overlap in 2D (x-z plane)
function machinesOverlap(a, b) {
  const aHalfW =
    (a.clearance.left + a.clearance.right + a.footprint.width) / 2;
  const aHalfD =
    (a.clearance.front + a.clearance.back + a.footprint.length) / 2;
  const bHalfW =
    (b.clearance.left + b.clearance.right + b.footprint.width) / 2;
  const bHalfD =
    (b.clearance.front + b.clearance.back + b.footprint.length) / 2;

  const overlapX = Math.abs(a.x - b.x) < aHalfW + bHalfW;
  const overlapZ = Math.abs(a.z - b.z) < aHalfD + bHalfD;

  return overlapX && overlapZ;
}

// Check if a machine is within the floor boundary
function isWithinBounds(machine, boundary) {
  const halfW = (machine.clearance.left + machine.clearance.right + machine.footprint.width) / 2;
  const halfD = (machine.clearance.front + machine.clearance.back + machine.footprint.length) / 2;

  return (
    machine.x - halfW >= boundary.minX &&
    machine.x + halfW <= boundary.maxX &&
    machine.z - halfD >= boundary.minZ &&
    machine.z + halfD <= boundary.maxZ
  );
}

// Check if a machine is too close to a structural obstruction
function isTooCloseToObstruction(machine, obstructions, minDistance = 0.3) {
  for (const obs of obstructions) {
    const dx = Math.abs(machine.x - obs.x);
    const dz = Math.abs(machine.z - obs.z);
    const dist = Math.sqrt(dx * dx + dz * dz);
    const machineRadius =
      Math.max(
        machine.clearance.left + machine.clearance.right + machine.footprint.width,
        machine.clearance.front + machine.clearance.back + machine.footprint.length
      ) / 2;
    if (dist < machineRadius + minDistance) {
      return true;
    }
  }
  return false;
}

// Find the nearest utility drop point for a machine
function nearestUtilityDistance(machine, utilities) {
  if (!utilities || utilities.length === 0) return Infinity;
  let minDist = Infinity;
  for (const util of utilities) {
    const dx = machine.x - util.x;
    const dz = machine.z - util.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

// Try to place a machine at a position, resolving collisions
function tryPlaceMachine(machine, placed, boundary, obstructions, utilities) {
  const step = 0.5;
  let maxAttempts = 200;

  // Try original position first
  let candidate = { ...machine };
  if (
    isWithinBounds(candidate, boundary) &&
    !isTooCloseToObstruction(candidate, obstructions) &&
    placed.every((p) => !machinesOverlap(candidate, p))
  ) {
    return { ...candidate, utilityDist: nearestUtilityDistance(candidate, utilities) };
  }

  // Spiral outward from original position
  for (let ring = 1; ring <= 10; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;

        candidate = {
          ...machine,
          x: machine.x + dx * step,
          z: machine.z + dz * step,
        };

        if (maxAttempts <= 0) break;

        if (
          isWithinBounds(candidate, boundary) &&
          !isTooCloseToObstruction(candidate, obstructions) &&
          placed.every((p) => !machinesOverlap(candidate, p))
        ) {
          return {
            ...candidate,
            utilityDist: nearestUtilityDistance(candidate, utilities),
          };
        }
        maxAttempts--;
      }
    }
    if (maxAttempts <= 0) break;
  }

  return null; // Could not place
}

// Main layout proposal function
export function proposeLayout({
  machines,
  boundary,
  obstructions = [],
  utilities = [],
  processSequence = [],
}) {
  const placed = [];
  const unplaced = [];

  // Sort machines by process sequence if available
  let sortedMachines = [...machines];
  if (processSequence.length > 0) {
    const sequenceOrder = {};
    processSequence.forEach((machineId, index) => {
      sequenceOrder[machineId] = index;
    });
    sortedMachines.sort((a, b) => {
      const orderA = sequenceOrder[a.id] ?? Infinity;
      const orderB = sequenceOrder[b.id] ?? Infinity;
      return orderA - orderB;
    });
  }

  // Place machines one by one
  for (const machine of sortedMachines) {
    const result = tryPlaceMachine(
      {
        ...machine,
        x: machine.position?.[0] ?? 0,
        z: machine.position?.[2] ?? 0,
      },
      placed,
      boundary,
      obstructions,
      utilities
    );

    if (result) {
      placed.push({
        machineId: machine.id,
        x: result.x,
        y: 0,
        z: result.z,
        rotation: 0,
        confidence: "inferred",
      });
    } else {
      unplaced.push({
        machineId: machine.id,
        reason: "Could not find valid placement within constraints",
        originalPosition: machine.position,
      });
    }
  }

  return {
    placements: placed,
    unplaced,
    summary: {
      total: machines.length,
      placed: placed.length,
      unplaced: unplaced.length,
    },
  };
}
