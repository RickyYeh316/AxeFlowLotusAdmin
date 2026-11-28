'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriverTripStatus } from '../types';
import { db } from '../firebase/config';
import { collection, onSnapshot } from '../lib/loggedFirestore';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import DutyMapOverlay from './DutyMapOverlay';
import { mapStyles, mapStyleLabels, type DutyMapStyle } from '../data/mapStyles';
import { readMapCamera, readMapStyle, saveMapCamera, saveMapStyle, type MapCamera } from '../data/dutyMapPreferences';
import DriverDutyBadge from './DriverDutyBadge';
import { dutyLabel, readDriverDuty } from '../lib/driverDuty';
import DriverMapMarker, { type MapDriver } from './DriverMapMarker';
import DriverMapCluster, { groupMapDrivers, projectMapPosition, type DriverMapGroup } from './DriverMapCluster';
import DriverAvatar from './DriverAvatar';
import { TrafficCone, Layers } from 'lucide-react';
import { MockMap } from './MockMap';

interface DispatchMapProps {
  apiKey: string;
  active?: boolean;
}

const dutyScopes = [
  { value: 'online', label: '上線', tone: 'serving' },
  { value: 'offline', label: '下線', tone: 'all' },
  { value: 'all', label: '全部', tone: 'all' }
] as const;
type DutyScope = typeof dutyScopes[number]['value'];

function CopyableMapValue({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  return (
    <span className={`driver-map-copy ${className}`}>
      <span aria-hidden="true">{value}</span>
      <input readOnly value={value} aria-label={label} />
    </span>
  );
}

// Map Controller for panning and zoom
const MapController: React.FC<{
  focusPosition: google.maps.LatLngLiteral | null;
  zoomToDriver: boolean;
  showTraffic: boolean;
  active: boolean;
}> = ({ focusPosition, zoomToDriver, showTraffic, active }) => {
  const map = useMap();
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map || !active) return;
    let pending: MapCamera | null = null;
    const capture = map.addListener('bounds_changed', () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (center && zoom !== undefined) pending = { center: center.toJSON(), zoom };
    });
    function flush() {
      if (pending) saveMapCamera('google', pending);
      pending = null;
    }
    const idle = map.addListener('idle', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      capture.remove();
      idle.remove();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [map, active]);

  useEffect(() => {
    if (!map || !focusPosition) return;
    map.panTo(focusPosition);
    if (zoomToDriver && (map.getZoom() || 13) < 15) {
      map.setZoom(15);
    }
  }, [map, focusPosition, zoomToDriver]);

  useEffect(() => {
    if (!map) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else {
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    }
    return () => {
      if (trafficLayerRef.current) trafficLayerRef.current.setMap(null);
    };
  }, [map, showTraffic]);

  return null;
};

export default function DispatchMap({ apiKey, active = true }: DispatchMapProps) {
  const [drivers, setDrivers] = useState<MapDriver[]>([]);
  const [selection, setSelection] = useState<{ email: string; position: google.maps.LatLngLiteral; zoomToDriver: boolean } | null>(null);
  const [scope, setScope] = useState<DutyScope>('all');
  const visibleDrivers = useMemo(() => scope === 'all' ? drivers : drivers.filter(driver => driver.connection === scope), [drivers, scope]);
  const selectedDriver = visibleDrivers.find(driver => driver.email === selection?.email) ?? null;
  const focusPosition = selectedDriver ? selection?.position ?? null : null;
  const counts = {
    all: drivers.length,
    online: drivers.filter(driver => driver.connection === 'online').length,
    offline: drivers.filter(driver => driver.connection === 'offline').length
  };

  const [initialCamera] = useState(() => readMapCamera('google') ?? { center: { lat: 25.0412, lng: 121.5645 }, zoom: 13 });
  const [mapZoom, setMapZoom] = useState(initialCamera.zoom);
  const [previewGroup, setPreviewGroup] = useState<string | null>(null);
  const groups = useMemo(() => groupMapDrivers(visibleDrivers, pos => projectMapPosition(pos, mapZoom)), [visibleDrivers, mapZoom]);
  const [mapHeading, setMapHeading] = useState(0);
  const [mapStyle, setMapStyle] = useState(readMapStyle);
  const [showTraffic, setShowTraffic] = useState(false);
  const [loading, setLoading] = useState(true);

  function containsSelection(group: DriverMapGroup) {
    return group.members.some(driver => driver.email === selectedDriver?.email);
  }

  function isGroupExpanded(group: DriverMapGroup) {
    return group.id === previewGroup || containsSelection(group);
  }

  function toggleGroup(group: DriverMapGroup) {
    if (containsSelection(group)) {
      setSelection(null);
      setPreviewGroup(null);
    } else {
      setPreviewGroup(current => current === group.id ? null : group.id);
    }
  }

  function selectDriver(driver: MapDriver, toggle = false) {
    setPreviewGroup(null);
    const { lat, lng } = driver.currentLocation;
    setSelection(current => {
      if (toggle && current?.email === driver.email) return null;
      return { email: driver.email, position: { lat, lng }, zoomToDriver: true };
    });
  }

  // Firestore live stream subscription for drivers with a reported location
  useEffect(() => {
    if (!active) return;
    let listening = true;
    let previousLiveDrivers: MapDriver[] | undefined;
    const unsub = onSnapshot(collection(db, 'drivers'), { includeMetadataChanges: true }, (snapshot) => {
      if (!listening) return;
      const list: MapDriver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const location = data.currentLocation;
        if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return;
        const plateNumber = data.carPlate || data.plateNumber || '未填寫車牌';
        const duty = readDriverDuty(data.tripStatus, data.status, data.presenceStatus);
        const offline = duty.tripStatus === DriverTripStatus.OFFLINE || data.presenceStatus === 'DISCONNECTED';
        const online = data.presenceStatus === 'CONNECTED' || duty.tripStatus !== 'UNKNOWN';
        list.push({
          email: doc.id,
          name: data.name || '未命名司機',
          plateNumber,
          avatar: data.avatar,
          ...duty,
          connection: offline ? 'offline' : online ? 'online' : 'unknown',
          currentLocation: {
            lat: location.lat,
            lng: location.lng,
            bearing: location.bearing || 0,
            speed: location.speed || 0,
            updatedAt: location.updatedAt
          }
        });
      });

      // A cached or first snapshot can refresh markers without moving the saved camera.
      if (!snapshot.metadata.fromCache) {
        const previous = previousLiveDrivers;
        previousLiveDrivers = list;
        setSelection(current => {
          if (!current) return null;
          const driver = list.find(item => item.email === current.email);
          if (!driver) return null;
          const last = previous?.find(item => item.email === current.email)?.currentLocation;
          const { lat, lng } = driver.currentLocation;
          if (last && (last.lat !== lat || last.lng !== lng)) return { email: current.email, position: { lat, lng }, zoomToDriver: false };
          return current;
        });
      }
      setDrivers(list);
      setLoading(false);
    }, (error) => {
      if (!listening) return;
      setDrivers([]);
      setSelection(null);
      console.error("Error subscribing to drivers locations:", error);
      setLoading(false);
    });

    return () => {
      listening = false;
      unsub();
    };
  }, [active]);

  const hasValidKey = apiKey && apiKey.startsWith('AIzaSy');

  return (
    <div className="map-page-container" inert={!active}>
      {/* 1. Map Renderer (Google Map or Mock SVG Map) */}
      {hasValidKey ? (
        <APIProvider apiKey={apiKey}>
          <div className="full-map">
            <Map
              defaultCenter={initialCamera.center}
              defaultZoom={initialCamera.zoom}
              gestureHandling={'greedy'}
              disableDefaultUI={true}
              styles={mapStyles[mapStyle]}
              onZoomChanged={event => setMapZoom(event.detail.zoom)}
              onHeadingChanged={event => setMapHeading(event.detail.heading)}
            >
              {groups.map(group => {
                const { id, members, position } = group;
                if (members.length > 1) {
                  const expanded = isGroupExpanded(group);
                  return (
                    <DutyMapOverlay key={id} position={position} cluster zIndex={expanded ? 3 : 2}>
                      <DriverMapCluster members={members} selectedEmail={selectedDriver?.email} mapHeading={mapHeading}
                        expanded={expanded} onToggle={() => toggleGroup(group)} onSelect={selectDriver} />
                    </DutyMapOverlay>
                  );
                }
                const driver = members[0];
                const isSelected = selectedDriver?.email === driver.email;
                const loc = driver.currentLocation;
                return (
                  <DutyMapOverlay key={driver.email} position={loc} zIndex={isSelected ? 1 : 0}>
                    <button type="button" className="duty-map-pin" aria-pressed={isSelected}
                      title={`${driver.name} · ${driver.plateNumber} · ${dutyLabel(driver)}`}
                      onClick={() => selectDriver(driver)}>
                      <DriverMapMarker driver={driver} selected={isSelected} mapHeading={mapHeading} />
                    </button>
                  </DutyMapOverlay>
                );
              })}

              <MapController focusPosition={focusPosition} zoomToDriver={selection?.zoomToDriver ?? false}
                active={active} showTraffic={active && showTraffic} />
            </Map>
          </div>
        </APIProvider>
      ) : (
        <MockMap
          locations={visibleDrivers}
          selectedLocation={selectedDriver}
          focusPosition={focusPosition}
          zoomToDriver={selection?.zoomToDriver ?? false}
          isGroupExpanded={isGroupExpanded}
          onToggleGroup={toggleGroup}
          onSelectLocation={selectDriver}
          mapStyle={mapStyle}
        />
      )}

      {/* 2. Floating Map Settings Bar */}
      <div className="glass" style={{
        position: 'absolute',
        top: 24,
        left: 24,
        zIndex: 100,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16
      }}>
        {/* Style Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={14} className="text-cyan" />
          <select aria-label="底圖樣式"
            value={mapStyle}
            onChange={(e) => {
              const style = e.target.value as DutyMapStyle;
              setMapStyle(style);
              saveMapStyle(style);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {Object.entries(mapStyleLabels).map(([key, label]) => (
              <option key={key} value={key} style={{ background: '#0c0d14' }}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-color)' }}></div>

        {/* Traffic Toggle (only for real Google Map) */}
        {hasValidKey && (
          <button
            onClick={() => setShowTraffic(!showTraffic)}
            style={{
              background: 'transparent',
              border: 'none',
              color: showTraffic ? '#16e098' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <TrafficCone size={14} />
            <span>即時路況: {showTraffic ? '開啟' : '關閉'}</span>
          </button>
        )}
      </div>

      {/* 3. Floating Map Overlay Driver Info Panel */}
      <div className="map-overlay-panel animate-fade-in">
        <div className="duty-map-filters" role="group" aria-label="勤務連線狀態">
          {dutyScopes.map(({ value, label, tone }) => (
            <button key={value} type="button" aria-pressed={scope === value}
              className={`category-pill order-filter order-tone-${tone}${scope === value ? ' active' : ''}`}
              onClick={() => { setScope(value); setPreviewGroup(null); }}>
              {label} ({counts[value]})
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)' }}>載入車隊中...</div>
        ) : visibleDrivers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {scope === 'all' ? '目前沒有可定位的司機' : scope === 'online' ? '目前沒有上線司機可顯示' : '目前沒有下線司機可顯示'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleDrivers.map((driver) => {
              const isSelected = selectedDriver?.email === driver.email;

              return (
                <div key={driver.email} className={`driver-map-item ${isSelected ? 'selected' : ''}`}>
                  <button type="button" className="driver-map-pick" aria-pressed={isSelected}
                    aria-label={`${driver.name} · ${driver.plateNumber} · ${dutyLabel(driver)}`}
                    onClick={() => selectDriver(driver, true)} />
                  <DriverAvatar avatar={driver.avatar} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  <span style={{ flexGrow: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{driver.name}</span>
                      <DriverDutyBadge driver={driver} />
                    </span>
                    <span className="driver-map-meta">
                      <CopyableMapValue label="車牌" value={driver.plateNumber} />
                      <span>{driver.currentLocation.speed ? `${Math.round(driver.currentLocation.speed * 3.6)} km/h` : '靜止'}</span>
                    </span>
                    <CopyableMapValue label="經緯度" className="driver-map-coordinates"
                      value={`${driver.currentLocation.lat.toFixed(6)}, ${driver.currentLocation.lng.toFixed(6)}`} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
