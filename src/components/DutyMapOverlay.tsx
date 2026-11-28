import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from '@vis.gl/react-google-maps';

// A DOM overlay keeps the interactive duty markers on a road map with local JSON styles.
export default function DutyMapOverlay({ position, cluster = false, zIndex, children }: {
  position: google.maps.LatLngLiteral;
  cluster?: boolean;
  zIndex: number;
  children: ReactNode;
}) {
  const map = useMap();
  const [host] = useState(() => document.createElement('div'));
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const location = useRef(position);

  useLayoutEffect(() => {
    location.current = { lat: position.lat, lng: position.lng };
    host.style.zIndex = String(zIndex);
    host.style.transform = cluster ? 'translate(-50%, -50%)' : 'translate(-50%, -22px)';
    overlay.current?.draw();
  }, [host, position.lat, position.lng, cluster, zIndex]);

  useLayoutEffect(() => {
    if (!map) return;
    host.className = 'duty-map-overlay';
    const view = new google.maps.OverlayView();
    view.onAdd = () => {
      view.getPanes()?.overlayMouseTarget.append(host);
    };
    view.draw = () => {
      const pixel = view.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(location.current));
      if (!pixel) return;
      host.style.left = `${pixel.x}px`;
      host.style.top = `${pixel.y}px`;
    };
    view.onRemove = () => host.remove();
    google.maps.OverlayView.preventMapHitsFrom(host);
    overlay.current = view;
    view.setMap(map);
    return () => {
      overlay.current = null;
      view.setMap(null);
    };
  }, [map, host]);

  return createPortal(children, host);
}
