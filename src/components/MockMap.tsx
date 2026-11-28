'use client';

import React, { useState, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import type { DutyMapStyle } from '../data/mapStyles';
import { readMapCamera, saveMapCamera } from '../data/dutyMapPreferences';
import DriverMapMarker, { type MapDriver } from './DriverMapMarker';
import DriverMapCluster, { groupMapDrivers, type DriverMapGroup } from './DriverMapCluster';
import { ZoomIn, ZoomOut, Info } from 'lucide-react';

interface MockMapProps {
  locations: MapDriver[];
  selectedLocation: MapDriver | null;
  focusPosition: { lat: number; lng: number } | null;
  zoomToDriver: boolean;
  isGroupExpanded: (group: DriverMapGroup) => boolean;
  onToggleGroup: (group: DriverMapGroup) => void;
  onSelectLocation: (location: MapDriver) => void;
  mapStyle: DutyMapStyle;
}

export const MockMap: React.FC<MockMapProps> = ({
  locations,
  selectedLocation,
  focusPosition,
  zoomToDriver,
  isGroupExpanded,
  onToggleGroup,
  onSelectLocation,
  mapStyle,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: -150, y: -200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const mapRef = useRef<HTMLDivElement>(null);

  // Map lat/lng coordinates to 1000x1000 SVG coordinates
  // Taipei approx bounding box: Lat 25.02 to 25.07, Lng 121.51 to 121.57
  const minLat = 25.02;
  const maxLat = 25.07;
  const minLng = 121.51;
  const maxLng = 121.57;

  const projectCoord = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * 1000;
    // Invert Y for SVG coordinates
    const y = (1 - (lat - minLat) / (maxLat - minLat)) * 1000;
    return { x, y };
  };

  const groups = groupMapDrivers(locations, ({ lat, lng }) => {
    const { x, y } = projectCoord(lat, lng);
    return { x: x * zoom, y: y * zoom };
  });
  // Paint the open group above the other SVG markers.
  groups.sort((a, b) => Number(isGroupExpanded(a)) - Number(isGroupExpanded(b)));

  const centerOnDriver = useEffectEvent((position: { lat: number; lng: number }, zoomToDriver: boolean) => {
    if (!mapRef.current) return;
    const { x, y } = projectCoord(position.lat, position.lng);
    const rect = mapRef.current.getBoundingClientRect();
    const scale = zoomToDriver ? 1.3 : zoom;
    setPan({ x: rect.width / 2 - x * scale, y: rect.height / 2 - y * scale });
    if (zoomToDriver) setZoom(scale);
    saveMapCamera('svg', { center: position, zoom: scale });
  });

  useLayoutEffect(() => {
    const camera = readMapCamera('svg');
    const rect = mapRef.current?.getBoundingClientRect();
    if (!camera || !rect) return;
    const { x, y } = projectCoord(camera.center.lat, camera.center.lng);
    setZoom(camera.zoom);
    setPan({ x: rect.width / 2 - x * camera.zoom, y: rect.height / 2 - y * camera.zoom });
  }, []);

  function saveViewport(scale: number) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (rect.width / 2 - pan.x) / scale;
    const y = (rect.height / 2 - pan.y) / scale;
    saveMapCamera('svg', {
      center: { lat: maxLat - y / 1000 * (maxLat - minLat), lng: minLng + x / 1000 * (maxLng - minLng) },
      zoom: scale
    });
  }

  useEffect(() => {
    if (focusPosition) centerOnDriver(focusPosition, zoomToDriver);
  }, [focusPosition, zoomToDriver]);

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    if (isDragging) saveViewport(zoom);
    setIsDragging(false);
  };

  const handleZoom = (factor: number) => {
    const scale = Math.max(0.5, Math.min(3, zoom * factor));
    setZoom(scale);
    saveViewport(scale);
  };

  // Styling properties based on active mapStyle
  const themes = {
    dark: {
      bg: '#0c0d14',
      grid: '#181b28',
      river: '#0f2742',
      riverGlow: '#00ccff',
      roads: '#22273d',
      label: '#4f5b84',
    },
    grayscale: {
      bg: '#eeeeee',
      grid: '#d4d4d4',
      river: '#cccccc',
      riverGlow: '#cccccc',
      roads: '#ffffff',
      label: '#666666',
    },
    standard: {
      bg: '#f1f3f4',
      grid: '#e0e0e0',
      river: '#c4e3f3',
      riverGlow: '#90caf9',
      roads: '#ffffff',
      label: '#70757a',
    }
  };

  const theme = themes[mapStyle];

  return (
    <div 
      className="map-viewport" 
      ref={mapRef}
      style={{ 
        backgroundColor: theme.bg, 
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'absolute',
        inset: 0
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Floating Demo Mode Banner */}
      <div 
        className="glass animate-fade-in"
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          padding: '12px 18px',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'auto',
          fontSize: '0.8rem',
          maxWidth: 320,
          color: mapStyle === 'dark' ? '#fff' : '#333'
        }}
      >
        <Info size={16} className="text-gold" />
        <div>
          <span style={{ fontWeight: 700, display: 'block' }}>地圖模擬模式 (無 API Key)</span>
          <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>已加載台北市區即時車輛軌跡。支援拖曳與縮放地圖。</span>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <svg
        width="100%"
        height="100%"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          overflow: 'visible',
          transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.1, 0.8, 0.25, 1)',
        }}
      >
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke={theme.grid} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1500" height="1500" fill="url(#grid)" />

        {/* Tamsui River */}
        <path
          d="M -100 1200 Q 200 1000 350 700 T 250 200 T 500 -100"
          fill="none"
          stroke={theme.river}
          strokeWidth="80"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M -100 1200 Q 200 1000 350 700 T 250 200 T 500 -100"
          fill="none"
          stroke={theme.riverGlow}
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.3"
        />

        {/* Keelung River fork */}
        <path
          d="M 330 650 Q 550 500 700 480 T 1100 350"
          fill="none"
          stroke={theme.river}
          strokeWidth="50"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Major Taipei Roads */}
        <line x1="-100" y1="350" x2="1200" y2="350" stroke={theme.roads} strokeWidth="12" />
        <line x1="-100" y1="580" x2="1200" y2="580" stroke={theme.roads} strokeWidth="16" />
        <line x1="-100" y1="780" x2="1200" y2="780" stroke={theme.roads} strokeWidth="14" />
        
        <line x1="280" y1="-100" x2="280" y2="1200" stroke={theme.roads} strokeWidth="14" />
        <line x1="550" y1="-100" x2="550" y2="1200" stroke={theme.roads} strokeWidth="16" />
        <line x1="780" y1="-100" x2="780" y2="1200" stroke={theme.roads} strokeWidth="12" />

        {/* District Labels */}
        <text x="150" y="420" fill={theme.label} fontSize="14" fontWeight="bold" opacity="0.6">萬華區</text>
        <text x="400" y="300" fill={theme.label} fontSize="14" fontWeight="bold" opacity="0.6">中山區</text>
        <text x="650" y="520" fill={theme.label} fontSize="14" fontWeight="bold" opacity="0.6">大安區</text>
        <text x="900" y="700" fill={theme.label} fontSize="14" fontWeight="bold" opacity="0.6">信義區</text>
        <text x="450" y="900" fill={theme.label} fontSize="14" fontWeight="bold" opacity="0.6">中正區</text>
        <text x="850" y="250" fill={theme.label} fontSize="14" fontWeight="bold" opacity="0.6">松山區</text>

        {/* Drivers */}
        {groups.map(group => {
          const { id, members, position } = group;
          const { x, y } = projectCoord(position.lat, position.lng);
          if (members.length > 1) {
            const expanded = isGroupExpanded(group);
            return (
              <g key={id} transform={`translate(${x} ${y}) scale(${1 / zoom})`}>
                <foreignObject x={-20} y={-20} width={40} height={40} overflow="visible">
                  <DriverMapCluster members={members} expanded={expanded} selectedEmail={selectedLocation?.email}
                    onToggle={() => onToggleGroup(group)} onSelect={onSelectLocation} />
                </foreignObject>
              </g>
            );
          }
          const driver = members[0];
          const isSelected = selectedLocation?.email === driver.email;
          return (
            <foreignObject key={driver.email} x={x - 110} y={y - 22} width={220} height={80}
              className="mock-driver-marker">
              <button type="button" onClick={() => onSelectLocation(driver)} aria-pressed={isSelected}>
                <DriverMapMarker driver={driver} selected={isSelected} />
              </button>
            </foreignObject>
          );
        })}
      </svg>

      <div 
        className="glass" 
        style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 6,
          zIndex: 100,
          pointerEvents: 'auto'
        }}
      >
        <button 
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
          onClick={() => handleZoom(1.25)}
        >
          <ZoomIn size={18} />
        </button>
        <div style={{ height: 1, backgroundColor: 'var(--border-color)' }}></div>
        <button 
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
          onClick={() => handleZoom(0.8)}
        >
          <ZoomOut size={18} />
        </button>
      </div>
    </div>
  );
};
