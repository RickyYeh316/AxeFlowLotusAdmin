export const mapStyleLabels = {
  grayscale: '簡約灰階',
  standard: '標準地圖',
  dark: '深色地圖'
};

export type DutyMapStyle = keyof typeof mapStyleLabels;

export const mapStyles: Record<DutyMapStyle, google.maps.MapTypeStyle[]> = {
  standard: [],
  // Match the shared order and queue maps in public/passenger-order/shared/order-map.js.
  grayscale: [
    {elementType: "geometry", stylers: [{color: "#eeeeee"}]},
    {elementType: "labels.text.fill", stylers: [{color: "#666666"}]},
    {elementType: "labels.text.stroke", stylers: [{color: "#ffffff"}]},
    {featureType: "poi", stylers: [{visibility: "off"}]},
    {featureType: "transit", stylers: [{visibility: "off"}]},
    {featureType: "road", elementType: "geometry", stylers: [{color: "#ffffff"}]},
    {featureType: "road", elementType: "geometry.stroke", stylers: [{color: "#d4d4d4"}]},
    {featureType: "water", elementType: "geometry", stylers: [{color: "#cccccc"}]},
  ],

  dark: [
    { elementType: "geometry", stylers: [{ color: "#1d1f2b" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1d1f2b" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#c9d1d9" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8b949e" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#18232c" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#586069" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#2d3142" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#1d1f2b" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8b949e" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#3c435e" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#1d1f2b" }],
    },
    {
      featureType: "road.highway",
      elementType: "labels.text.fill",
      stylers: [{ color: "#c9d1d9" }],
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#24292e" }],
    },
    {
      featureType: "transit",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8b949e" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#0d0e15" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#586069" }],
    },
  ],
};
