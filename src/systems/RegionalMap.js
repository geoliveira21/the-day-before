// North is -Z in world space and at the top of the field map.
export function createRoad(x1, z1, x2, z2, width, district, route = 'local') {
  const length = Math.hypot(x2 - x1, z2 - z1);
  return { x1, z1, x2, z2, x: (x1 + x2) / 2, z: (z1 + z2) / 2, length, width,
    angle: Math.atan2(x2 - x1, z2 - z1), district, route };
}

export function roadPoint(road, t, offset = 0) {
  const dx = (road.x2 - road.x1) / road.length;
  const dz = (road.z2 - road.z1) / road.length;
  return { x: road.x1 + (road.x2 - road.x1) * t + dz * offset,
    z: road.z1 + (road.z2 - road.z1) * t - dx * offset, dir: road.angle };
}

export function closestRoadPoint(road, x, z) {
  const t = Math.max(0, Math.min(1, ((x - road.x1) * (road.x2 - road.x1) + (z - road.z1) * (road.z2 - road.z1)) / road.length ** 2));
  const point = roadPoint(road, t);
  return { ...point, t, distance: Math.hypot(x - point.x, z - point.z) };
}

export function createRegionalPlan(config) {
  const B = config.BLOCK_SIZE;
  const S = config.STREET_WIDTH;
  const pitch = B + S;
  const width = config.BLOCKS_X * pitch + S;
  const depth = config.BLOCKS_Z * pitch + S;
  const ox = -width / 2;
  const oz = -depth / 2;
  const cityRow = Math.floor(config.BLOCKS_Z * 0.6);
  const ruralRows = Math.max(1, Math.floor(config.BLOCKS_Z * 0.3));
  const cityZ = oz + S / 2 + cityRow * pitch;
  const ruralZ = oz + S / 2 + ruralRows * pitch;
  const endZ = depth / 2 - S / 2;
  const avenueX = ox + S / 2 + Math.floor(config.BLOCKS_X * 0.65) * pitch;
  const streets = [];
  const blocks = [];
  const road = (x1, z1, x2, z2, w, district, route) => streets.push(createRoad(x1, z1, x2, z2, w, district, route));
  const regions = [
    { id: 'countryside', name: 'North Ridge', minZ: oz, maxZ: ruralZ, color: '#344638' },
    { id: 'midlands', name: 'Midlands / Industry & Services', minZ: ruralZ, maxZ: cityZ, color: '#4b5040' },
    { id: 'city', name: 'West End / Downtown', minZ: cityZ, maxZ: depth / 2, color: '#54544d' },
  ];

  // The continuous avenue is the spine shared by all three regions.
  road(avenueX, ruralZ, avenueX, cityZ, S, 'midlands', 'main');
  road(avenueX, cityZ, avenueX, endZ, S, 'city', 'main');
  for (let i = 0; i <= config.BLOCKS_X; i++) {
    const x = ox + S / 2 + i * pitch;
    if (x !== avenueX) road(x, cityZ, x, endZ, S, 'city');
  }
  for (let j = cityRow; j <= config.BLOCKS_Z; j++) {
    const z = oz + S / 2 + j * pitch;
    road(ox + S / 2, z, width / 2 - S / 2, z, S, 'city');
  }
  const diagonal = createRoad(ox + S / 2, cityZ + pitch, width / 2 - S / 2, endZ - pitch, S, 'city', 'diagonal');
  streets.push(diagonal);

  // Two quieter cross streets lead to warehouses, housing and civic services.
  for (let j = ruralRows; j < cityRow; j++) {
    const z = oz + S / 2 + j * pitch;
    road(ox + S / 2 + pitch, z, width / 2 - S / 2, z, S * 0.7, 'midlands');
  }
  for (const column of [1, config.BLOCKS_X - 1]) {
    const x = ox + S / 2 + column * pitch;
    road(x, ruralZ, x, cityZ, S * 0.7, 'midlands');
  }

  // Sampled smooth bends form a narrower rural road rather than another grid.
  const ruralEnd = oz + S;
  const bends = 24;
  const ruralPoints = [];
  for (let i = 0; i <= bends; i++) {
    const t = i / bends;
    ruralPoints.push({ x: avenueX + Math.sin(t * Math.PI * 3) * width * 0.12,
      z: ruralZ + (ruralEnd - ruralZ) * t });
  }
  ruralPoints.slice(1).forEach((p, i) => road(ruralPoints[i].x, ruralPoints[i].z, p.x, p.z, S * 0.55, 'countryside', 'main'));
  const last = ruralPoints.at(-1);
  road(last.x, last.z, last.x - pitch, last.z + pitch * 0.4, S * 0.45, 'countryside');

  for (let bx = 0; bx < config.BLOCKS_X; bx++) {
    for (let bz = ruralRows; bz < config.BLOCKS_Z; bz++) {
      const district = bz >= cityRow ? 'city' : 'midlands';
      if (district === 'midlands' && (bx === 0 || (bx + bz) % 3 === 0)) continue;
      const minX = ox + S + bx * pitch;
      const minZ = oz + S + bz * pitch;
      const block = { minX, maxX: minX + B, minZ, maxZ: minZ + B, district,
        industrial: district === 'midlands' && bx < Math.floor(config.BLOCKS_X / 2),
        residential: district === 'midlands' && bx >= Math.floor(config.BLOCKS_X / 2) };
      // Leave a clear diagonal corridor, including its verges and sidewalks.
      if (district === 'city' && closestRoadPoint(diagonal, minX + B / 2, minZ + B / 2).distance < B * Math.SQRT1_2 + S / 2 + 1) continue;
      blocks.push(block);
    }
  }
  return { width, depth, regions, streets, blocks, avenueX, ruralZ, cityZ,
    playerSpawn: { x: avenueX, z: cityZ + pitch } };
}
