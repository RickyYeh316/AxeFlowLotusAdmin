// Google Maps Custom Styles JSON Configuration

export const mapStyles: any = {
  standard: [], // Default Google Map style
  
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

  retro: [
    { elementType: "geometry", stylers: [{ color: "#f5f2e9" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f5f2e9" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#706d64" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#54524c" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#706d64" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#d9edd6" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#6b8067" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#ffffff" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#e3dfd3" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#706d64" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#fee1b9" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#e3dfd3" }],
    },
    {
      featureType: "road.highway",
      elementType: "labels.text.fill",
      stylers: [{ color: "#54524c" }],
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#ebd9c8" }],
    },
    {
      featureType: "transit",
      elementType: "labels.text.fill",
      stylers: [{ color: "#706d64" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#c8dfeb" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#60727d" }],
    },
  ],

  "cool-blue": [
    { elementType: "geometry", stylers: [{ color: "#0b1528" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0b1528" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#4f6a9c" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8fa9d8" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#4f6a9c" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#0d2238" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#36577a" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#162544" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#0b1528" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#4f6a9c" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#253a66" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#0b1528" }],
    },
    {
      featureType: "road.highway",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8fa9d8" }],
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#182a4d" }],
    },
    {
      featureType: "transit",
      elementType: "labels.text.fill",
      stylers: [{ color: "#4f6a9c" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#040b18" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#36577a" }],
    },
  ],
};
