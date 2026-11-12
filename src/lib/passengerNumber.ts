// 外顯乘客編號保留前導零及歷代位數；缺值不回退到內碼。
export const passengerNumber = (value: unknown): string =>
  typeof value === 'string' && /^[0-9]{6,8}$/.test(value) ? value : '';
