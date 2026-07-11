/**
 * Map — Interactive sighting map using Leaflet.js + OpenStreetMap.
 * Shows pins for each saved sighting with species info popups.
 */
const SightingMap = (() => {
  let map = null;
  let markers = [];
  let isInitialized = false;

  function init(containerId) {
    if (isInitialized) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    // Default to Sacramento area
    map = L.map(containerId).setView([38.58, -121.49], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    isInitialized = true;
  }

  function refresh() {
    if (!map) return;

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const sightings = Storage.getSightingsWithLocation();
    if (sightings.length === 0) return;

    const bounds = [];

    sightings.forEach(s => {
      const info = SpeciesDB.getInfo(s.commonName);
      const statusLabel = info ? SpeciesDB.getStatusLabel(info.status) : null;
      const conf = (s.confidence * 100).toFixed(0);
      const d = new Date(s.date);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Color marker by status
      let markerColor = '#2d6a4f'; // default green
      if (info) {
        if (info.status === 'invasive') markerColor = '#dc3545';
        else if (info.status === 'rare') markerColor = '#0d6efd';
        else if (info.status === 'uncommon') markerColor = '#ffc107';
      }

      const icon = L.divIcon({
        className: 'map-marker-custom',
        html: `<div style="background:${markerColor};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = L.marker([s.location.lat, s.location.lng], { icon }).addTo(map);

      let popupHtml = `
        <div style="min-width:160px;">
          <strong>${s.commonName}</strong>
          ${statusLabel ? `<span style="font-size:0.7rem;padding:1px 5px;border-radius:8px;margin-left:4px;background:${markerColor};color:white;">${statusLabel.text}</span>` : ''}
          <br><em style="font-size:0.8em;color:#666;">${s.scientificName}</em>
          <br><span style="font-size:0.8em;color:#888;">${dateStr} &middot; ${conf}%</span>
        </div>
      `;
      marker.bindPopup(popupHtml);
      markers.push(marker);
      bounds.push([s.location.lat, s.location.lng]);
    });

    // Fit map to show all markers
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }

  function invalidateSize() {
    if (map) {
      setTimeout(() => map.invalidateSize(), 100);
    }
  }

  return { init, refresh, invalidateSize };
})();
