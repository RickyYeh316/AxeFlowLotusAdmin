export type VehicleType = 'standard' | 'suv' | 'luxury';

export interface LocationData {
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  gpsSeq?: number;
  updatedAt?: any;
}

export interface Driver {
  email: string; // document id
  name: string;
  phone: string;
  carPlate: string;
  carColor: string;
  carMaker: string;
  carModel: string;
  avatar: string;
  status: number; // 1 = online/working, 2 = busy, 0 = offline
  working: boolean;
  isWorking: boolean;
  loginCount: number;
  currentLocation?: LocationData;
  createdAt?: any;
  updatedAt?: any;
}

export interface User {
  userId: string; // document id (usually LINE userId)
  displayName: string;
  pictureUrl: string;
  statusMessage: string;
  role: string; // 'passenger' | 'admin' etc
  lastLoginAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface Order {
  id: string; // document id
  passengerId: string;
  passengerName: string;
  passengerAvatar: string;
  driverId: string;
  driverName: string;
  carPlate: string;
  startAddress: string;
  endAddress: string;
  status: number; // 1 = dispatched/pending, 2 = completed, etc.
  statusText: string;
  fare?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface Coupon {
  couponCode: string; // document id
  title: string;
  description: string;
  discountAmount: number;
  minOrderAmount: number;
  expiryDate: any; // timestamp or date
  status: 'active' | 'inactive';
  createdAt?: any;
  updatedAt?: any;
}

export interface Admin {
  email: string; // document id
  name?: string;
  createdAt?: any;
}
