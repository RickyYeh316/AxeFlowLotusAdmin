import DriverMapMarker, { type MapDriver } from './DriverMapMarker';

type Point = { x: number; y: number };
type Position = { lat: number; lng: number };

export type DriverMapGroup = { id: string; members: MapDriver[]; position: Position };

export function projectMapPosition({ lat, lng }: Position, zoom: number): Point {
  const world = 256 * 2 ** zoom;
  const sin = Math.sin(Math.max(-85.051129, Math.min(85.051129, lat)) * Math.PI / 180);
  return { x: world * (lng + 180) / 360, y: world * (0.5 - Math.atanh(sin) / (2 * Math.PI)) };
}

// Search adjacent screen-space cells so proximity works across cell boundaries, too.
export function groupMapDrivers(drivers: MapDriver[], project: (position: Position) => Point) {
  const radius = 52;
  const points = drivers.map(driver => project(driver.currentLocation));
  const cells = new Map<string, number[]>();
  const cellKey = (x: number, y: number) => `${x},${y}`;
  points.forEach(({ x, y }, i) => {
    const key = cellKey(Math.floor(x / radius), Math.floor(y / radius));
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(i);
  });

  const visited = new Set<number>();
  const groups: DriverMapGroup[] = [];
  for (let i = 0; i < drivers.length; i++) {
    if (visited.has(i)) continue;
    const queue = [i];
    visited.add(i);
    for (let j = 0; j < queue.length; j++) {
      const { x, y } = points[queue[j]];
      const col = Math.floor(x / radius), row = Math.floor(y / radius);
      for (let a = col - 1; a <= col + 1; a++) {
        for (let b = row - 1; b <= row + 1; b++) {
          for (const index of cells.get(cellKey(a, b)) ?? []) {
            if (visited.has(index) || Math.hypot(points[index].x - x, points[index].y - y) > radius) continue;
            visited.add(index);
            queue.push(index);
          }
        }
      }
    }
    const members = queue.map(index => drivers[index]).sort((a, b) => a.email.localeCompare(b.email));
    const sum = members.reduce((p, driver) => ({
      lat: p.lat + driver.currentLocation.lat, lng: p.lng + driver.currentLocation.lng
    }), { lat: 0, lng: 0 });
    groups.push({ id: JSON.stringify(members.map(d => d.email)), members,
      position: { lat: sum.lat / members.length, lng: sum.lng / members.length } });
  }
  return groups;
}

export default function DriverMapCluster({ members, expanded, selectedEmail, mapHeading = 0, onToggle, onSelect }: {
  members: MapDriver[];
  expanded: boolean;
  selectedEmail?: string;
  mapHeading?: number;
  onToggle: () => void;
  onSelect: (driver: MapDriver) => void;
}) {
  return (
    <div className="duty-cluster" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {expanded && members.map((driver, i) => {
        // Two staggered fans leave a full label width between neighboring vehicles.
        const side = i % 2 === 0 ? -1 : 1;
        const rows = side < 0 ? Math.ceil(members.length / 2) : Math.floor(members.length / 2);
        const row = Math.floor(i / 2) - (rows - 1) / 2;
        const y = row * 84;
        const x = side * (110 + 16 / (1 + Math.abs(row)));
        return (
          <div key={driver.email} className="duty-cluster-branch">
            <span aria-hidden="true" className="duty-cluster-line" style={{
              width: Math.hypot(x, y), transform: `rotate(${Math.atan2(y, x)}rad)`
            }} />
            <button type="button" className="duty-cluster-member" style={{ left: x, top: y }}
              onClick={() => onSelect(driver)} aria-pressed={driver.email === selectedEmail}>
              <DriverMapMarker driver={driver} selected={driver.email === selectedEmail} mapHeading={mapHeading} />
            </button>
          </div>
        );
      })}
      <button type="button" className="duty-cluster-count"
        onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? '收合' : '展開'} ${members.length} 台車`}>
        {members.length}
      </button>
    </div>
  );
}
