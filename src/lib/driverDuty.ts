import { DriverTripStatus, type Driver } from '../types';

type DutyStatus = DriverTripStatus | 'UNKNOWN';
type DutyDisplay = { tripStatus: DutyStatus; disconnectedDuringOrder: boolean };
export type DriverRow = Omit<Driver, 'tripStatus'> & DutyDisplay;

export const dutyBadges: Record<DutyStatus, { label: string; tone: string }> = {
  OFFLINE: { label: '下線', tone: 'order-tone-all' },
  IDLE: { label: '空車', tone: 'duty-tone-vacant' },
  IN_QUEUE: { label: '排班中', tone: 'duty-tone-vacant' },
  BUSY: { label: '私人忙碌', tone: 'duty-tone-private' },
  DISPATCHED: { label: '收到派單', tone: 'order-tone-waiting' },
  EN_ROUTE: { label: '前往上車地點', tone: 'order-tone-serving' },
  ARRIVED: { label: '已抵達', tone: 'order-tone-serving' },
  IN_SERVICE: { label: '載客中', tone: 'order-tone-serving' },
  UNKNOWN: { label: '未知', tone: 'order-tone-unknown' }
};

function parseTripStatus(tripStatus: unknown, legacyStatus: unknown): DutyStatus {
  const raw = tripStatus ?? legacyStatus;
  if (raw === 0 || raw === '0') return DriverTripStatus.OFFLINE;
  if (raw === 1 || raw === '1') return DriverTripStatus.IDLE;
  if (raw === 2 || raw === '2') return DriverTripStatus.IN_SERVICE;
  if (tripStatus == null && (raw === 'SUSPENDED' || raw === 'WAIT_APPROVAL')) return DriverTripStatus.OFFLINE;
  return Object.values(DriverTripStatus).find(status => status === raw) ?? 'UNKNOWN';
}

export function readDriverDuty(tripStatus: unknown, legacyStatus: unknown, presenceStatus: unknown): DutyDisplay {
  const duty = parseTripStatus(tripStatus, legacyStatus);
  if (presenceStatus === 'DISCONNECTED') {
    switch (duty) {
      case DriverTripStatus.IDLE:
      case DriverTripStatus.BUSY:
      case DriverTripStatus.IN_QUEUE:
        return { tripStatus: DriverTripStatus.OFFLINE, disconnectedDuringOrder: false };
      case DriverTripStatus.DISPATCHED:
      case DriverTripStatus.EN_ROUTE:
      case DriverTripStatus.ARRIVED:
      case DriverTripStatus.IN_SERVICE:
        return { tripStatus: duty, disconnectedDuringOrder: true };
    }
  }
  return { tripStatus: duty, disconnectedDuringOrder: false };
}

export function dutyLabel(driver: DutyDisplay) {
  const label = dutyBadges[driver.tripStatus].label;
  return driver.disconnectedDuringOrder ? label + ' · 斷線' : label;
}
