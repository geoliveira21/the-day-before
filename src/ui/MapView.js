/** Shared north-up cartography for the local minimap and the field overview. */
export function drawMapLayout(g, layout, scale) {
  const tx = (x) => (x - layout.bounds.minX) * scale;
  const tz = (z) => (z - layout.bounds.minZ) * scale;
  for (const region of layout.regions) {
    g.fillStyle = region.color;
    g.fillRect(0, tz(region.minZ), layout.width * scale, (region.maxZ - region.minZ) * scale);
  }
  g.fillStyle = '#657057';
  for (const p of layout.scenery) {
    if (p.type === 'tree') g.fillRect(tx(p.x) - 2, tz(p.z) - 2, 4, 4);
  }
  g.lineCap = 'round';
  for (const s of layout.streets) {
    g.strokeStyle = s.route === 'main' ? '#9a9680' : '#777a73';
    g.lineWidth = s.width * scale;
    g.beginPath();
    g.moveTo(tx(s.x1), tz(s.z1));
    g.lineTo(tx(s.x2), tz(s.z2));
    g.stroke();
  }
  g.fillStyle = '#65635b';
  for (const b of layout.blocks) g.fillRect(tx(b.minX), tz(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
  for (const b of layout.buildings) {
    g.fillStyle = b.ruined ? '#806d58' : b.industrial ? '#9b9683' : '#999c91';
    g.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), b.w * scale, b.d * scale);
  }
}
