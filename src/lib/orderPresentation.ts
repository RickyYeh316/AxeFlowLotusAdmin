import { Order, OrderStatus } from '../types';

export type OrderGroup = 'serving' | 'waiting' | 'closed' | 'unknown';
export type OrderFilter = Exclude<OrderGroup, 'unknown'> | 'all';

// 管理端依整張訂單分類；司機退出後仍可能等待乘客重派。
export function orderGroup(order: Pick<Order, 'status' | 'reservationState'>): OrderGroup {
  const status = String(order.status);
  if (['COMPLETED', 'CANCELLED_BY_USER'].includes(status)) return 'closed';
  if (['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(status)
    || status === 'SCHEDULED' && ['CLAIMED', 'CONFIRMED'].includes(order.reservationState || '')) return 'serving';
  if (['SCHEDULED', 'PENDING', 'MATCHING', 'FAILED_MATCH', 'DRIVER_CANCELLED', 'NO_SHOW'].includes(status)) return 'waiting';
  return 'unknown';
}

export function orderStatusText(order: Pick<Order, 'status' | 'reservationState'>): string {
  if (String(order.status) === 'SCHEDULED') {
    return ({ OPEN: '預約待承接', CLAIMED: '預約已承接', CONFIRMED: '預約已確認' } as Record<string, string>)[order.reservationState || ''] || '預約狀態待確認';
  }
  return ({ PENDING: '等待派車', MATCHING: '媒合中', ACCEPTED: '前往上車地點', ARRIVED: '已抵達',
    IN_PROGRESS: '載客中', COMPLETED: '已完成', CANCELLED_BY_USER: '乘客已取消',
    DRIVER_CANCELLED: '司機中止服務／待乘客決定', NO_SHOW: '乘客未出現／待乘客決定',
    FAILED_MATCH: '媒合失敗／待乘客決定' } as Record<string, string>)[String(order.status)] || '訂單狀態待確認';
}

// 僅供列表篩選的 key，不寫入訂單或改變後端狀態。
export function orderSubcategory(order: Pick<Order, 'status' | 'reservationState'>): string {
  if (order.status === OrderStatus.SCHEDULED) {
    return ['OPEN', 'CLAIMED', 'CONFIRMED'].includes(order.reservationState || '')
      ? `SCHEDULED.${order.reservationState}` : 'SCHEDULED.UNKNOWN';
  }
  return Object.values(OrderStatus).includes(order.status) ? order.status : 'UNKNOWN';
}

const subcategorySamples: Pick<Order, 'status' | 'reservationState'>[] = [
  ...['CLAIMED', 'CONFIRMED'].map(reservationState => ({ status: OrderStatus.SCHEDULED, reservationState })),
  ...[OrderStatus.ACCEPTED, OrderStatus.ARRIVED, OrderStatus.IN_PROGRESS].map(status => ({ status })),
  { status: OrderStatus.SCHEDULED, reservationState: 'OPEN' },
  ...[OrderStatus.PENDING, OrderStatus.MATCHING, OrderStatus.FAILED_MATCH, OrderStatus.DRIVER_CANCELLED,
    OrderStatus.NO_SHOW, OrderStatus.COMPLETED, OrderStatus.CANCELLED_BY_USER].map(status => ({ status })),
  { status: OrderStatus.SCHEDULED },
];
export const orderSubcategories = [
  ...subcategorySamples.map(order => ({ value: orderSubcategory(order), label: orderStatusText(order), group: orderGroup(order) })),
  { value: 'UNKNOWN', label: '訂單狀態待確認', group: 'unknown' as const },
];
