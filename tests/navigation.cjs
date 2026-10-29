const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
  const {createNavigation} = await import(pathToFileURL(path.join(__dirname, '../navigation.js')));
  const bounds = {minX: -12, maxX: 12, minZ: -12, maxZ: 12};
  let checks = 0;
  function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
  function pathIsSafe(nav, start, path) {
    let from = start;
    for (const to of path) {
      for (let i = 0; i <= 300; i++) {
        const t = i / 300;
        assert(nav.isWalkable(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t), `unsafe path at ${JSON.stringify({from, to, t})}`);
      }
      from = to;
    }
  }
  const building = {id: 'building', minX: -2, maxX: 2, minZ: -4, maxZ: 4};
  const nav = createNavigation(bounds, [building]);
  test('direct clear route retains the exact non-grid destination', () => {
    assert.deepEqual(nav.findPath({x: -9, z: -9}, {x: -5.3, z: -5.7}), [{x: -5.3, z: -5.7}]);
  });
  test('A* routes around a full building without clipping any corner', () => {
    const start = {x: -8, z: 0}, goal = {x: 8, z: 0}, route = nav.findPath(start, goal);
    assert(route.length >= 3); assert.deepEqual(route.at(-1), goal); pathIsSafe(nav, start, route);
  });
  test('blocked and out-of-bounds goals are rejected', () => {
    for (const goal of [{x: 0, z: 0}, {x: 12, z: 0}, {x: 0, z: 50}]) assert.deepEqual(nav.findPath({x: -8, z: 0}, goal), []);
  });
  test('player radius expands buildings and shrinks the map boundary', () => {
    assert(!nav.isWalkable(2.5, 0)); assert(nav.isWalkable(2.7, 0));
    assert(!nav.isWalkable(11.5, 0)); assert(nav.isWalkable(11.3, 0));
  });
  test('continuous collision stops large movement crossing through a wall', () => {
    const result = nav.move({x: -8, z: 0}, 16, 0);
    assert(result.x < -2.65 && result.x > -2.66); assert(nav.isWalkable(result.x, result.z));
  });
  test('keyboard movement slides along the wall without penetrating', () => {
    const result = nav.move({x: -3, z: -2}, 4, 3);
    assert(result.x < -2.65); assert(result.z > .9); assert(nav.isWalkable(result.x, result.z));
  });
  test('large movement cannot leave the map', () => {
    const result = nav.move({x: -8, z: -8}, -100, -100);
    assert(nav.isWalkable(result.x, result.z)); assert(result.x >= -11.35 && result.z >= -11.35);
  });
  test('unreachable region returns no path rather than cutting a wall', () => {
    const divided = createNavigation(bounds, [{minX: -1, maxX: 1, minZ: -12, maxZ: 12}]);
    assert.deepEqual(divided.findPath({x: -5, z: 0}, {x: 5, z: 0}), []);
  });
  test('diagonal touching obstacles do not permit corner cutting', () => {
    const diagonal = createNavigation(bounds, [
      {minX: -12, maxX: 0, minZ: 0, maxZ: 12},
      {minX: 0, maxX: 12, minZ: -12, maxZ: 0},
    ], 0);
    assert.deepEqual(diagonal.findPath({x: -3, z: -3}, {x: 3, z: 3}), []);
  });
  test('narrow gaps smaller than the avatar are impassable', () => {
    const gap = createNavigation(bounds, [
      {minX: -1, maxX: 1, minZ: -12, maxZ: -.5},
      {minX: -1, maxX: 1, minZ: .5, maxZ: 12},
    ]);
    assert.deepEqual(gap.findPath({x: -5, z: 0}, {x: 5, z: 0}), []);
  });
  test('non-finite input cannot poison movement or pathfinding', () => {
    assert(!nav.isWalkable(NaN, 0)); assert.deepEqual(nav.findPath({x: 0, z: NaN}, {x: 3, z: 3}), []);
    assert.deepEqual(nav.move({x: -5, z: -5}, Infinity, 0), {x: -5, z: -5});
  });
  test('zero movement and an already reached destination are safe', () => {
    assert.deepEqual(nav.move({x: -5, z: -5}, 0, 0), {x: -5, z: -5});
    assert.deepEqual(nav.findPath({x: -5, z: -5}, {x: -5, z: -5}), []);
  });
  console.log(`${checks} navigation checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
