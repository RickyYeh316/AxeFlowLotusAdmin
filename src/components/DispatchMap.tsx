'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';
import { APIProvider, Map, useMap, AdvancedMarker } from '@vis.gl/react-google-maps';
import { mapStyles } from '../data/mapStyles';
import { Driver, Order, DriverStatus } from '../types';
import { MapPin, Compass, Info, TrafficCone, Layers, Award, Phone, Shield } from 'lucide-react';
import { MockMap } from './MockMap'; // We will create this as a separate file to keep this clean

interface DispatchMapProps {
  apiKey: string;
}

// Map Controller for panning and zoom
const MapController: React.FC<{
  selectedDriver: Driver | null;
  showTraffic: boolean;
}> = ({ selectedDriver, showTraffic }) => {
  const map = useMap();
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map || !selectedDriver || !selectedDriver.currentLocation) return;
    map.panTo({
      lat: selectedDriver.currentLocation.lat,
      lng: selectedDriver.currentLocation.lng
    });
    if ((map.getZoom() || 13) < 15) {
      map.setZoom(15);
    }
  }, [map, selectedDriver]);

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

export default function DispatchMap({ apiKey }: DispatchMapProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [mapStyle, setMapStyle] = useState<'standard' | 'dark' | 'retro' | 'cool-blue'>('dark');
  const [showTraffic, setShowTraffic] = useState(false);
  const [loading, setLoading] = useState(true);

  // Firestore live stream subscription for online drivers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const list: Driver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let driverStatus = data.status || DriverStatus.OFFLINE;
        // Robust converter for old numeric statuses
        if (driverStatus === 0 || driverStatus === '0') driverStatus = DriverStatus.OFFLINE;
        else if (driverStatus === 1 || driverStatus === '1') driverStatus = DriverStatus.IDLE;
        else if (driverStatus === 2 || driverStatus === '2') driverStatus = DriverStatus.IN_SERVICE;

        list.push({
          email: doc.id,
          id: doc.id,
          name: data.name || '未命名司機',
          phone: data.phone || '無電話',
          plateNumber: data.plateNumber || data.carPlate || '未填寫車牌',
          carPlate: data.carPlate || data.plateNumber || '未填寫車牌',
          carColor: data.carColor || '',
          carMaker: data.carMaker || '',
          carModel: data.carModel || '',
          avatar: data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          status: driverStatus as DriverStatus,
          working: driverStatus === DriverStatus.IDLE,
          isWorking: driverStatus === DriverStatus.IN_SERVICE,
          loginCount: data.loginCount || 0,
          currentLocation: data.currentLocation ? {
            lat: data.currentLocation.lat,
            lng: data.currentLocation.lng,
            bearing: data.currentLocation.bearing || 0,
            speed: data.currentLocation.speed || 0,
            updatedAt: data.currentLocation.updatedAt
          } : undefined,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });

      // Filter only drivers that have active locations on map
      const activeDrivers = list.filter(d => d.currentLocation && d.currentLocation.lat);
      setDrivers(activeDrivers);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to drivers locations:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Sync selected driver if locations change
  useEffect(() => {
    if (selectedDriver) {
      const updated = drivers.find(d => d.email === selectedDriver.email);
      if (updated) setSelectedDriver(updated);
    }
  }, [drivers, selectedDriver]);

  // Center of Taipei
  const defaultCenter = { lat: 25.0412, lng: 121.5645 };
  const defaultZoom = 13;

  const hasValidKey = apiKey && apiKey.startsWith('AIzaSy');

  const getMarkerBgColor = (driver: Driver) => {
    if (driver.status === DriverStatus.OFFLINE) return '#6b7280'; // Gray
    if (driver.status === DriverStatus.SUSPENDED) return '#eab308'; // Yellow
    if (driver.status === DriverStatus.IDLE || driver.status === DriverStatus.IN_QUEUE) return '#10b981'; // Green
    return '#ef4444'; // Red for Busy
  };

  const getVehicleLabel = (maker?: string, model?: string) => {
    if (!maker && !model) return '標準計程車';
    return `${maker || ''} ${model || ''}`.trim();
  };

  const mapStyleLabels = {
    standard: '標準地圖',
    dark: '暗黑太空',
    retro: '復古暖金',
    'cool-blue': '酷炫湛藍'
  };

  return (
    <div className="map-page-container">
      {/* 1. Map Renderer (Google Map or Mock SVG Map) */}
      {hasValidKey ? (
        <APIProvider apiKey={apiKey}>
          <div className="full-map">
            <Map
              defaultCenter={defaultCenter}
              defaultZoom={defaultZoom}
              gestureHandling={'greedy'}
              disableDefaultUI={true}
              styles={mapStyles[mapStyle]}
              mapId="LOTUS_ADMIN_MAP"
            >
              {drivers.map((driver) => {
                const isSelected = selectedDriver?.email === driver.email;
                const bgColor = getMarkerBgColor(driver);
                const loc = driver.currentLocation!;

                return (
                  <AdvancedMarker
                    key={driver.email}
                    position={{ lat: loc.lat, lng: loc.lng }}
                    onClick={() => setSelectedDriver(driver)}
                  >
                    <div style={{
                      transform: `scale(${isSelected ? 1.2 : 1})`,
                      transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}>
                      {/* Car Pointer */}
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: bgColor,
                        border: isSelected ? '3px solid #ff2a5f' : '2px solid white',
                        boxShadow: isSelected ? '0 0 15px #ff2a5f, 0 4px 10px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: `rotate(${loc.bearing || 0}deg)`,
                        transition: 'transform 0.5s ease-out',
                        fontSize: 16
                      }}>
                        🚕
                      </div>
                      
                      {/* License plate label */}
                      <div style={{
                        marginTop: 4,
                        backgroundColor: isSelected ? '#ff2a5f' : 'rgba(7, 8, 13, 0.9)',
                        color: 'white',
                        fontSize: 8,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                        whiteSpace: 'nowrap'
                      }}>
                        {driver.plateNumber}
                      </div>
                    </div>
                  </AdvancedMarker>
                );
              })}

              <MapController selectedDriver={selectedDriver} showTraffic={showTraffic} />
            </Map>
          </div>
        </APIProvider>
      ) : (
        <MockMap
          locations={drivers}
          selectedLocation={selectedDriver}
          onSelectLocation={setSelectedDriver}
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
          <select 
            value={mapStyle} 
            onChange={(e) => setMapStyle(e.target.value as any)}
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
              color: showTraffic ? 'var(--color-secondary)' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <TrafficCone size={14} className={showTraffic ? 'text-cyan' : ''} />
            <span>即時路況: {showTraffic ? '開啟' : '關閉'}</span>
          </button>
        )}
      </div>

      {/* 3. Floating Map Overlay Driver Info Panel */}
      <div className="glass map-overlay-panel animate-fade-in">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Compass size={18} className="text-cyan" />
          線上車隊監控 ({drivers.length})
        </h3>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)' }}>載入車隊中...</div>
        ) : drivers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            目前無線上服務中的司機
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {drivers.map((driver) => {
              const isSelected = selectedDriver?.email === driver.email;
              const isBusy = driver.status !== DriverStatus.IDLE && driver.status !== DriverStatus.IN_QUEUE && driver.status !== DriverStatus.OFFLINE;
              const statusText = driver.status === DriverStatus.OFFLINE ? '已下線' : isBusy ? '載客中' : '空車中';
              const statusClass = driver.status === DriverStatus.OFFLINE ? 'status-pill offline' : isBusy ? 'status-pill busy' : 'status-pill online';

              return (
                <div
                  key={driver.email}
                  onClick={() => setSelectedDriver(driver)}
                  className={`driver-map-item ${isSelected ? 'selected' : ''}`}
                >
                  <img src={driver.avatar} alt={driver.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{driver.name}</span>
                      <span className={statusClass} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{statusText}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>{driver.plateNumber}</span>
                      <span>{driver.currentLocation?.speed ? `${Math.round(driver.currentLocation.speed * 3.6)} km/h` : '靜止'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Driver Detailed Widget */}
        {selectedDriver && (
          <div style={{
            marginTop: 8,
            paddingTop: 16,
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }} className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={selectedDriver.avatar} alt={selectedDriver.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem' }}>{selectedDriver.name} 司機</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{getVehicleLabel(selectedDriver.carMaker, selectedDriver.carModel)} ({selectedDriver.carColor}色)</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 6 }}>
              <div>車牌: <strong style={{ color: 'white' }}>{selectedDriver.plateNumber}</strong></div>
              <div>聯絡: <strong style={{ color: 'white' }}>{selectedDriver.phone}</strong></div>
              <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                座標: <span style={{ color: 'var(--text-secondary)' }}>{selectedDriver.currentLocation?.lat.toFixed(5)}, {selectedDriver.currentLocation?.lng.toFixed(5)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`tel:${selectedDriver.phone}`} className="btn-secondary" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.75rem', padding: 8 }}>
                <Phone size={12} />
                撥打電話
              </a>
              <button onClick={() => setSelectedDriver(null)} className="btn-danger" style={{ padding: 8, fontSize: '0.75rem' }}>
                關閉面板
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
