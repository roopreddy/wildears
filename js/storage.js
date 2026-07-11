/**
 * Storage — LocalStorage-based sighting log for "Species Heard Here" list.
 * Saves date, time, species, confidence, and optional location.
 */
const Storage = (() => {
  const STORAGE_KEY = 'wildears_sightings';

  function getSightings() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveSighting(detection, location) {
    const sightings = getSightings();
    const sighting = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      commonName: detection.commonName,
      scientificName: detection.scientificName,
      confidence: detection.confidence,
      date: new Date().toISOString(),
      timestamp: Date.now(),
      location: location || detection.location || null
    };
    sightings.unshift(sighting); // newest first
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sightings));
    return sighting;
  }

  function getSightingsWithLocation() {
    return getSightings().filter(s => s.location && s.location.lat && s.location.lng);
  }

  function deleteSighting(id) {
    const sightings = getSightings().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sightings));
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getStats() {
    const sightings = getSightings();
    const uniqueSpecies = new Set(sightings.map(s => s.commonName));
    return {
      totalSightings: sightings.length,
      uniqueSpecies: uniqueSpecies.size,
      speciesList: [...uniqueSpecies].sort()
    };
  }

  function exportCSV() {
    const sightings = getSightings();
    if (sightings.length === 0) return null;

    const header = 'Date,Time,Common Name,Scientific Name,Confidence,Latitude,Longitude\n';
    const rows = sightings.map(s => {
      const d = new Date(s.date);
      const date = d.toLocaleDateString();
      const time = d.toLocaleTimeString();
      const lat = s.location?.lat || '';
      const lng = s.location?.lng || '';
      const conf = (s.confidence * 100).toFixed(1) + '%';
      return `"${date}","${time}","${s.commonName}","${s.scientificName}","${conf}","${lat}","${lng}"`;
    }).join('\n');

    return header + rows;
  }

  function downloadCSV() {
    const csv = exportCSV();
    if (!csv) return false;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wildears-sightings-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  return { getSightings, getSightingsWithLocation, saveSighting, deleteSighting, clearAll, getStats, exportCSV, downloadCSV };
})();
