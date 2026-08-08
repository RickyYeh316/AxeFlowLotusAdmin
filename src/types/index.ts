import { Timestamp } from 'firebase/firestore';

export type VehicleType = 'standard' | 'suv' | 'luxury';

export enum OrderStatus {
  PENDING = "PENDING", // 用戶送出叫車 (即時/預約)
  MATCHING = "MATCHING", // 系統開始派車
  ACCEPTED = "ACCEPTED", // 司機接單
  ARRIVED = "ARRIVED", // 司機抵達
  IN_PROGRESS = "IN_PROGRESS", // 搭乘中
  COMPLETED = "COMPLETED", // 行程結束
  CANCELLED_BY_USER = "CANCELLED_BY_USER", // 用戶取消
  DRIVER_CANCELLED = "DRIVER_CANCELLED", // 司機接單後取消，等待用戶決定重派或取消
  NO_SHOW = "NO_SHOW", // 司機標記用戶棄單
  FAILED_MATCH = "FAILED_MATCH", // 媒合失敗 (無人接單)
}

export enum DriverTripStatus {
  OFFLINE = "OFFLINE", // 未上線/未報班
  IDLE = "IDLE", // 上線空車中
  IN_QUEUE = "IN_QUEUE", // 排班熱區等待中
  DISPATCHED = "DISPATCHED", // 收到派單/媒合中
  EN_ROUTE = "EN_ROUTE", // 確認接單前往中
  ARRIVED = "ARRIVED", // 抵達上車點
  IN_SERVICE = "IN_SERVICE", // 載客中
}

export enum DriverAccountStatus {
  PENDING = "PENDING",     // 新司機，等待開通
  ACTIVE = "ACTIVE",       // 帳號正常開通
  SUSPENDED = "SUSPENDED", // 帳號停權
}

export enum UserTripStatus {
  IDLE = "IDLE", // 正常狀態可叫車
  REQUESTING = "REQUESTING", // 叫車媒合中
  IN_TRIP = "IN_TRIP", // 行程進行中
}

export enum UserAccountStatus {
  ACTIVE = "ACTIVE", // 帳號正常開通
  BANNED = "BANNED", // 帳號停權
}

export interface LocationData {
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  updatedAt: Timestamp;
}

export interface Driver {
  email: string; // document id / UID
  id?: string; // UID
  name: string;
  plateNumber: string; // Negotiated 車牌
  carPlate?: string; // Compatibility alias
  tripStatus: DriverTripStatus;
  accountStatus: DriverAccountStatus;
  isNPC?: boolean;
  avatar?: string; // UI avatar
  phone?: string; // UI phone
  carColor?: string; // Optional metadata
  carMaker?: string; // Optional metadata
  carModel?: string; // Optional metadata
  currentLocation?: LocationData;
  targetLocation?: {
    lat: number;
    lng: number;
  };
  currentOrderId?: string;
  queueId?: string;
  blockedUserIds?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Compatibility helpers
  working?: boolean;
  isWorking?: boolean;
  loginCount?: number;
}

export interface User {
  id?: string; // UID / LINE UID
  userId: string; // document id (usually LINE userId)
  name: string; // Negotiated name
  displayName?: string; // Compatibility alias
  tripStatus: UserTripStatus;
  accountStatus: UserAccountStatus;
  isNPC?: boolean;
  phoneNumber?: string;
  currentOrderId?: string;
  noShowCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Compatibility helpers
  pictureUrl?: string;
  statusMessage?: string;
  role?: string;
  lastLoginAt?: Timestamp;
}

export interface Order {
  id: string; // document id
  readableId?: string; // 人類可讀短編號
  userId: string; // passenger UID
  passengerId?: string; // Compatibility alias
  driverId?: string;
  status: OrderStatus;
  isNPC?: boolean;
  pickupLocation: {
    lat: number;
    lng: number;
    address?: string;
  };
  destination?: {
    lat: number;
    lng: number;
    address?: string;
  };
  isElderlyCare: boolean;
  isScheduled: boolean;
  scheduledTime?: Timestamp;
  couponId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // UI joins / Compatibility helpers
  passengerName?: string;
  passengerAvatar?: string;
  driverName?: string;
  carPlate?: string;
  startAddress?: string;
  endAddress?: string;
  statusText?: string;
  fare?: number;
}

export interface Coupon {
  couponCode: string; // document id
  title: string;
  description: string;
  discountAmount: number;
  minOrderAmount: number;
  expiryDate: any;
  status: 'active' | 'inactive';
  createdAt?: any;
  updatedAt?: any;
}

export interface Admin {
  email: string; // document id
  name?: string;
  createdAt?: any;
}
