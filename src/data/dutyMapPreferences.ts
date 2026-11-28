import { mapStyleLabels, type DutyMapStyle } from './mapStyles';

export type MapCamera = { center: google.maps.LatLngLiteral; zoom: number };
type Renderer = 'google' | 'svg';
const prefix = 'lotus.dutyMap.';

function readPreference(key: string) {
  try {
    return window.localStorage.getItem(prefix + key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(prefix + key, value);
  } catch {
    // The map also works when browser storage is unavailable.
  }
}

export function readMapStyle(): DutyMapStyle {
  const style = readPreference('theme');
  return style && Object.prototype.hasOwnProperty.call(mapStyleLabels, style) ? style as DutyMapStyle : 'grayscale';
}

export function saveMapStyle(style: DutyMapStyle) {
  writePreference('theme', style);
}

function validCamera(camera: MapCamera | null, renderer: Renderer) {
  const { lat, lng } = camera?.center ?? {};
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
      typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180 ||
      !camera || !Number.isFinite(camera.zoom)) return false;
  return renderer === 'svg' ? camera.zoom >= 0.5 && camera.zoom <= 3 : camera.zoom >= 0 && camera.zoom <= 30;
}

export function readMapCamera(renderer: Renderer): MapCamera | null {
  try {
    const camera = JSON.parse(readPreference(renderer + '.camera') ?? 'null');
    return validCamera(camera, renderer) ? camera : null;
  } catch {
    return null;
  }
}

export function saveMapCamera(renderer: Renderer, camera: MapCamera) {
  if (validCamera(camera, renderer)) writePreference(renderer + '.camera', JSON.stringify(camera));
}
