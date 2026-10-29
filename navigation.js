// Collision and A* navigation shared by every map. Coordinates are ground-plane X/Z.
// Obstacles are conservatively expanded by the avatar radius, so its shoulders
// cannot pass through a corner even though the visual avatar is not a cylinder.
const EPSILON = 1e-7;
const SEPARATION = 1e-4;

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const items = this.items;
    let index = items.length;
    items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].f <= item.f) break;
      items[index] = items[parent]; index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.items, result = items[0], last = items.pop();
    if (!items.length) return result;
    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= items.length) break;
      if (child + 1 < items.length && items[child + 1].f < items[child].f) child++;
      if (items[child].f >= last.f) break;
      items[index] = items[child]; index = child;
    }
    items[index] = last;
    return result;
  }
  get size() { return this.items.length; }
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

// First contact with a closed box along a finite segment; touching is a collision.
function intersectBox(x, z, dx, dz, box) {
  let enter = -Infinity, exit = Infinity, blockX = false, blockZ = false;
  for (const [start, delta, min, max, axis] of [
    [x, dx, box.minX, box.maxX, 'x'], [z, dz, box.minZ, box.maxZ, 'z'],
  ]) {
    if (Math.abs(delta) < EPSILON) {
      if (start < min || start > max) return null;
      continue;
    }
    let near = (min - start) / delta, far = (max - start) / delta;
    if (near > far) [near, far] = [far, near];
    if (near > enter + EPSILON) {
      enter = near; blockX = axis === 'x'; blockZ = axis === 'z';
    } else if (Math.abs(near - enter) <= EPSILON) {
      blockX ||= axis === 'x'; blockZ ||= axis === 'z';
    }
    exit = Math.min(exit, far);
    if (enter > exit + EPSILON) return null;
  }
  if (exit < 0 || enter > 1 || enter < -EPSILON) return null;
  return {t: Math.max(0, enter), blockX, blockZ};
}

export function createNavigation(bounds, colliders, radius = .65) {
  if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds[key])) ||
      !Number.isFinite(radius) || radius < 0 ||
      bounds.minX + radius >= bounds.maxX - radius || bounds.minZ + radius >= bounds.maxZ - radius) {
    throw new RangeError('Navigation requires finite bounds wider than the player diameter.');
  }
  const area = {
    minX: bounds.minX + radius, maxX: bounds.maxX - radius,
    minZ: bounds.minZ + radius, maxZ: bounds.maxZ - radius,
  };
  const obstacles = colliders.map(box => {
    if (!box || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(box[key])) ||
        box.minX > box.maxX || box.minZ > box.maxZ) throw new TypeError('Invalid collision box.');
    return {minX: box.minX - radius, maxX: box.maxX + radius,
      minZ: box.minZ - radius, maxZ: box.maxZ + radius};
  });
  function isWalkable(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) ||
        x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ) return false;
    return !obstacles.some(box => x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ);
  }
  function segmentClear(start, end) {
    if (!isWalkable(start.x, start.z) || !isWalkable(end.x, end.z)) return false;
    const dx = end.x - start.x, dz = end.z - start.z;
    return !obstacles.some(box => intersectBox(start.x, start.z, dx, dz, box));
  }

  // Static walkability is computed once when a map becomes active, not each frame.
  const cell = 1;
  const columns = Math.floor((area.maxX - area.minX) / cell) + 1;
  const rows = Math.floor((area.maxZ - area.minZ) / cell) + 1;
  const count = columns * rows;
  if (count > 1_000_000) throw new RangeError('Navigation map is too large.');
  const walkable = new Uint8Array(count);
  function pointAt(id) { return {x: area.minX + id % columns * cell, z: area.minZ + Math.floor(id / columns) * cell}; }
  for (let id = 0; id < count; id++) {
    const p = pointAt(id); walkable[id] = Number(isWalkable(p.x, p.z));
  }
  function connectors(point) {
    const result = [];
    const cx = Math.round((point.x - area.minX) / cell), cz = Math.round((point.z - area.minZ) / cell);
    for (let z = Math.max(0, cz - 3); z <= Math.min(rows - 1, cz + 3); z++) {
      for (let x = Math.max(0, cx - 3); x <= Math.min(columns - 1, cx + 3); x++) {
        const id = z * columns + x;
        if (!walkable[id]) continue;
        const p = pointAt(id);
        if (segmentClear(point, p)) result.push({id, cost: Math.hypot(p.x - point.x, p.z - point.z)});
      }
    }
    return result;
  }
  function findPath(start, goal) {
    if (!finitePoint(start) || !finitePoint(goal) || !isWalkable(start.x, start.z) || !isWalkable(goal.x, goal.z)) return [];
    if (Math.hypot(goal.x - start.x, goal.z - start.z) <= EPSILON) return [];
    if (segmentClear(start, goal)) return [{x: goal.x, z: goal.z}];
    const starts = connectors(start), goals = new Map(connectors(goal).map(entry => [entry.id, entry.cost]));
    if (!starts.length || !goals.size) return [];
    const costs = new Float64Array(count + 1).fill(Infinity);
    const parent = new Int32Array(count + 1).fill(-1);
    const open = new MinHeap();
    for (const entry of starts) {
      costs[entry.id] = entry.cost;
      const p = pointAt(entry.id);
      open.push({id: entry.id, g: entry.cost, f: entry.cost + Math.hypot(p.x - goal.x, p.z - goal.z)});
    }
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    while (open.size) {
      const current = open.pop();
      if (current.g > costs[current.id] + EPSILON) continue;
      if (current.id === count) {
        const path = [{x: goal.x, z: goal.z}];
        for (let id = parent[count]; id !== -1; id = parent[id]) path.push(pointAt(id));
        path.reverse();
        // Remove unnecessary waypoints only when the complete segment is safe.
        const smoothed = [];
        let anchor = start, index = 0;
        while (index < path.length) {
          let next = path.length - 1;
          while (next > index && !segmentClear(anchor, path[next])) next--;
          if (Math.hypot(path[next].x - anchor.x, path[next].z - anchor.z) > EPSILON) smoothed.push(path[next]);
          anchor = path[next]; index = next + 1;
        }
        return smoothed;
      }
      const from = pointAt(current.id);
      if (goals.has(current.id)) {
        const g = current.g + goals.get(current.id);
        if (g < costs[count]) {
          costs[count] = g; parent[count] = current.id; open.push({id: count, g, f: g});
        }
      }
      const cx = current.id % columns, cz = Math.floor(current.id / columns);
      for (const [dx, dz] of directions) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || x >= columns || z < 0 || z >= rows) continue;
        const id = z * columns + x;
        if (!walkable[id] || (dx && dz && (!walkable[cz * columns + x] || !walkable[z * columns + cx]))) continue;
        const g = current.g + Math.hypot(dx, dz) * cell;
        if (g >= costs[id] - EPSILON) continue;
        const point = pointAt(id);
        if (!segmentClear(from, point)) continue;
        costs[id] = g; parent[id] = current.id;
        open.push({id, g, f: g + Math.hypot(point.x - goal.x, point.z - goal.z)});
      }
    }
    return [];
  }

  function move(position, dx, dz) {
    if (!finitePoint(position)) return {x: (area.minX + area.maxX) / 2, z: (area.minZ + area.maxZ) / 2};
    const result = {x: position.x, z: position.z};
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || !isWalkable(result.x, result.z)) return result;
    // Swept tests prevent large time steps or keyboard movement tunneling through walls.
    for (let pass = 0; pass < 3 && Math.hypot(dx, dz) > EPSILON; pass++) {
      let hit = {t: 1, blockX: false, blockZ: false}, collided = false;
      function consider(candidate) {
        if (!candidate || candidate.t < -EPSILON || candidate.t > 1) return;
        if (!collided || candidate.t < hit.t - EPSILON) { hit = candidate; collided = true; }
        else if (Math.abs(candidate.t - hit.t) <= EPSILON) {
          hit.blockX ||= candidate.blockX; hit.blockZ ||= candidate.blockZ;
        }
      }
      if (dx > 0 && result.x + dx > area.maxX) consider({t: (area.maxX - result.x) / dx, blockX: true, blockZ: false});
      if (dx < 0 && result.x + dx < area.minX) consider({t: (area.minX - result.x) / dx, blockX: true, blockZ: false});
      if (dz > 0 && result.z + dz > area.maxZ) consider({t: (area.maxZ - result.z) / dz, blockX: false, blockZ: true});
      if (dz < 0 && result.z + dz < area.minZ) consider({t: (area.minZ - result.z) / dz, blockX: false, blockZ: true});
      for (const box of obstacles) consider(intersectBox(result.x, result.z, dx, dz, box));
      const fraction = collided ? Math.max(0, hit.t - SEPARATION / Math.hypot(dx, dz)) : 1;
      result.x += dx * fraction; result.z += dz * fraction;
      if (!collided) break;
      const remaining = 1 - fraction;
      dx = hit.blockX ? 0 : dx * remaining;
      dz = hit.blockZ ? 0 : dz * remaining;
    }
    return result;
  }
  return {isWalkable, findPath, move};
}
