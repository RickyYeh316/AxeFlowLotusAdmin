import { dutyBadges, dutyLabel, type DriverRow } from '../lib/driverDuty';
import type { LocationData } from '../types';
import DriverAvatar from './DriverAvatar';

export type MapDriver = Pick<DriverRow,
  'email' | 'name' | 'plateNumber' | 'avatar' | 'tripStatus' | 'disconnectedDuringOrder'
> & { currentLocation: LocationData; connection: 'online' | 'offline' | 'unknown' };

export default function DriverMapMarker({ driver, selected, mapHeading = 0 }: {
  driver: MapDriver;
  selected: boolean;
  mapHeading?: number;
}) {
  const badge = dutyBadges[driver.tripStatus];
  const angle = (driver.currentLocation.bearing ?? 0) - mapHeading;
  return (
    <span className={`duty-map-marker ${badge.tone}${driver.connection === 'offline' ? ' offline' : ''}${selected ? ' selected' : ''}`}>
      <span className="duty-marker-face">
        <DriverAvatar avatar={driver.avatar} />
        <span aria-hidden="true" className="duty-marker-ring" style={{ transform: `rotate(${angle}deg)` }} />
      </span>
      <span className="duty-marker-label">{driver.plateNumber} · {dutyLabel(driver)}</span>
    </span>
  );
}
