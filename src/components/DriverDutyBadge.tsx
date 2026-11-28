import { dutyBadges, type DriverRow } from '../lib/driverDuty';

export default function DriverDutyBadge({ driver }: { driver: Pick<DriverRow, 'tripStatus' | 'disconnectedDuringOrder'> }) {
  const badge = dutyBadges[driver.tripStatus];
  return (
    <span className="driver-duty-badges">
      <span className={`status-pill driver-duty ${badge.tone}`}>{badge.label}</span>
      {driver.disconnectedDuringOrder && <span className="status-pill driver-duty order-tone-all">斷線</span>}
    </span>
  );
}
