/**
 * WildEars — Main Application Controller
 * Wires together the recorder, identifier, species DB, and storage modules.
 * Manages UI state, navigation, and user interactions.
 */
const App = (() => {
  // ── State ─────────────────────────────────────────────────────────────────
  let currentTab = 'listen';
  let isRecording = false;
  let recordingTimer = null;
  let recordingStartTime = 0;
  let lastDetections = [];

  // ── DOM references (populated in init) ────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ── Initialization ────────────────────────────────────────────────────────
  function init() {
    setupTabs();
    setupRecordButton();
    setupUploadButton();
    setupLogControls();
    renderLog();
    updateLogBadge();

    // Initialize the BirdNET model
    Identifier.init({
      onProgress: handleModelProgress,
      onReady: handleModelReady,
      onError: handleError,
      onResults: handleResults
    });
  }

  // ── Tab Navigation ────────────────────────────────────────────────────────
  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'panel-' + tab);
    });
  }

  // ── Model Loading ─────────────────────────────────────────────────────────
  function handleModelProgress(progress, status) {
    const bar = $('model-progress-bar');
    const text = $('model-status-text');
    const container = $('model-loading');

    if (bar) bar.style.width = progress + '%';
    if (text) text.textContent = status || 'Loading...';
    if (container) container.classList.remove('hidden');
  }

  function handleModelReady(speciesCount) {
    const container = $('model-loading');
    const ready = $('model-ready');
    const recordBtn = $('record-btn');
    const uploadArea = $('upload-area');

    if (container) container.classList.add('hidden');
    if (ready) {
      ready.classList.remove('hidden');
      ready.textContent = 'Ready! Can identify ' + speciesCount.toLocaleString() + ' species';
    }
    if (recordBtn) recordBtn.disabled = false;
    if (uploadArea) uploadArea.classList.remove('disabled');
  }

  function handleError(message) {
    showNotification(message, 'error');
    console.error('WildEars:', message);
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function setupRecordButton() {
    const btn = $('record-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  async function startRecording() {
    const btn = $('record-btn');
    const timer = $('recording-timer');
    const wave = $('recording-wave');

    try {
      await Recorder.startRecording();
      isRecording = true;
      recordingStartTime = Date.now();

      btn.classList.add('recording');
      btn.querySelector('.btn-text').textContent = 'Stop';
      if (timer) timer.classList.remove('hidden');
      if (wave) wave.classList.remove('hidden');

      // Update timer display
      recordingTimer = setInterval(() => {
        const elapsed = ((Date.now() - recordingStartTime) / 1000).toFixed(1);
        if (timer) timer.textContent = elapsed + 's / 3.0s';

        // Auto-stop after 3 seconds
        if (elapsed >= 3.0) {
          stopRecording();
        }
      }, 100);

    } catch (err) {
      handleError(err.message);
    }
  }

  function stopRecording() {
    if (!isRecording) return;

    clearInterval(recordingTimer);
    isRecording = false;

    const btn = $('record-btn');
    const timer = $('recording-timer');
    const wave = $('recording-wave');

    btn.classList.remove('recording');
    btn.querySelector('.btn-text').textContent = 'Record';
    if (timer) timer.classList.add('hidden');
    if (wave) wave.classList.add('hidden');

    const audioData = Recorder.stopRecording();
    if (audioData) {
      showAnalyzing();
      Identifier.identify(audioData);
    }
  }

  // ── File Upload ───────────────────────────────────────────────────────────
  function setupUploadButton() {
    const area = $('upload-area');
    const input = $('file-input');

    if (!area || !input) return;

    // Click to upload
    area.addEventListener('click', () => {
      if (!area.classList.contains('disabled')) {
        input.click();
      }
    });

    // Drag and drop
    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.classList.add('drag-over');
    });

    area.addEventListener('dragleave', () => {
      area.classList.remove('drag-over');
    });

    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    // File input change
    input.addEventListener('change', () => {
      if (input.files.length > 0) {
        handleFile(input.files[0]);
        input.value = ''; // Reset for re-upload
      }
    });
  }

  async function handleFile(file) {
    // Validate file type
    const validTypes = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3',
                        'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/webm',
                        'audio/mp4', 'audio/aac'];
    const validExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.webm', '.m4a', '.aac'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      handleError('Please upload an audio file (WAV, MP3, OGG, FLAC, or WebM)');
      return;
    }

    try {
      showAnalyzing();
      const { samples, duration } = await Recorder.processFile(file);
      $('upload-file-name').textContent = file.name + ' (' + duration.toFixed(1) + 's)';
      $('upload-file-name').classList.remove('hidden');
      Identifier.identify(samples);
    } catch (err) {
      handleError(err.message);
      hideAnalyzing();
    }
  }

  // ── Results Display ───────────────────────────────────────────────────────
  function showAnalyzing() {
    const results = $('results-section');
    const analyzing = $('analyzing-indicator');
    const list = $('results-list');
    const noResults = $('no-results');

    if (results) results.classList.remove('hidden');
    if (analyzing) analyzing.classList.remove('hidden');
    if (list) list.innerHTML = '';
    if (noResults) noResults.classList.add('hidden');
  }

  function hideAnalyzing() {
    const analyzing = $('analyzing-indicator');
    if (analyzing) analyzing.classList.add('hidden');
  }

  function handleResults(detections) {
    hideAnalyzing();
    lastDetections = detections;

    const list = $('results-list');
    const noResults = $('no-results');
    const results = $('results-section');

    if (results) results.classList.remove('hidden');

    if (!detections || detections.length === 0) {
      if (list) list.innerHTML = '';
      if (noResults) noResults.classList.remove('hidden');
      return;
    }

    if (noResults) noResults.classList.add('hidden');
    if (list) {
      list.innerHTML = detections.map((d, i) => createResultCard(d, i)).join('');
      // Attach save button listeners
      list.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(btn.dataset.index);
          saveSighting(detections[idx]);
          btn.textContent = 'Saved!';
          btn.disabled = true;
          btn.classList.add('saved');
        });
      });
      // Attach info toggle listeners
      list.querySelectorAll('.info-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.result-card');
          const info = card.querySelector('.species-info-expanded');
          if (info) {
            info.classList.toggle('hidden');
            btn.textContent = info.classList.contains('hidden') ? 'More info' : 'Less info';
          }
        });
      });
    }
  }

  function createResultCard(detection, index) {
    const confidence = (detection.confidence * 100).toFixed(1);
    const confClass = detection.confidence >= 0.7 ? 'high' :
                      detection.confidence >= 0.4 ? 'medium' : 'low';

    // Look up species info from our local database
    const info = SpeciesDB.getInfo(detection.commonName);
    const statusLabel = info ? SpeciesDB.getStatusLabel(info.status) : null;

    let infoSection = '';
    if (info) {
      infoSection = `
        <div class="species-info-expanded hidden">
          <div class="species-info-grid">
            ${info.photo ? `<img class="species-photo" src="${info.photo}" alt="${info.commonName}" loading="lazy">` : ''}
            <div class="species-details">
              <p class="species-desc">${info.description}</p>
              <p class="species-habitat"><strong>Habitat:</strong> ${info.habitat}</p>
              ${info.funFact ? `<p class="species-fun"><strong>Fun fact:</strong> ${info.funFact}</p>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="result-card" data-index="${index}">
        <div class="result-header">
          <div class="result-rank">#${index + 1}</div>
          <div class="result-names">
            <span class="common-name">${detection.commonName}</span>
            <span class="scientific-name">${detection.scientificName}</span>
          </div>
          ${statusLabel ? `<span class="status-badge ${statusLabel.class}">${statusLabel.text}</span>` : ''}
        </div>
        <div class="confidence-row">
          <div class="confidence-bar-container">
            <div class="confidence-bar ${confClass}" style="width: ${confidence}%"></div>
          </div>
          <span class="confidence-value">${confidence}%</span>
        </div>
        <div class="result-actions">
          ${info ? `<button class="info-toggle">More info</button>` : ''}
          <button class="save-btn" data-index="${index}">Save to log</button>
        </div>
        ${infoSection}
      </div>
    `;
  }

  // ── Sighting Log ──────────────────────────────────────────────────────────
  function saveSighting(detection) {
    Storage.saveSighting(detection);
    updateLogBadge();
    showNotification(detection.commonName + ' saved to your log!', 'success');
  }

  function setupLogControls() {
    const exportBtn = $('export-btn');
    const clearBtn = $('clear-log-btn');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const success = Storage.downloadCSV();
        if (!success) {
          showNotification('No sightings to export yet', 'info');
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all sightings? This cannot be undone.')) {
          Storage.clearAll();
          renderLog();
          updateLogBadge();
          showNotification('All sightings cleared', 'info');
        }
      });
    }
  }

  function renderLog() {
    const container = $('log-list');
    const empty = $('log-empty');
    const stats = $('log-stats');

    if (!container) return;

    const sightings = Storage.getSightings();
    const sightingStats = Storage.getStats();

    if (sightings.length === 0) {
      container.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      if (stats) stats.classList.add('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    if (stats) {
      stats.classList.remove('hidden');
      stats.innerHTML = `
        <span><strong>${sightingStats.totalSightings}</strong> sightings</span>
        <span><strong>${sightingStats.uniqueSpecies}</strong> unique species</span>
      `;
    }

    container.innerHTML = sightings.map(s => {
      const d = new Date(s.date);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const conf = (s.confidence * 100).toFixed(0);
      const info = SpeciesDB.getInfo(s.commonName);
      const statusLabel = info ? SpeciesDB.getStatusLabel(info.status) : null;

      return `
        <div class="log-entry">
          <div class="log-entry-main">
            <div class="log-species">
              <span class="log-common-name">${s.commonName}</span>
              ${statusLabel ? `<span class="status-badge small ${statusLabel.class}">${statusLabel.text}</span>` : ''}
            </div>
            <div class="log-meta">
              <span class="log-date">${dateStr} ${timeStr}</span>
              <span class="log-confidence">${conf}% confidence</span>
            </div>
          </div>
          <button class="log-delete-btn" data-id="${s.id}" title="Delete sighting">&times;</button>
        </div>
      `;
    }).join('');

    // Attach delete listeners
    container.querySelectorAll('.log-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.deleteSighting(btn.dataset.id);
        renderLog();
        updateLogBadge();
      });
    });
  }

  function updateLogBadge() {
    const badge = $('log-badge');
    const stats = Storage.getStats();
    if (badge) {
      badge.textContent = stats.uniqueSpecies;
      badge.classList.toggle('hidden', stats.uniqueSpecies === 0);
    }
    // Also update the log tab when switching to it
    if (currentTab === 'log') {
      renderLog();
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  function showNotification(message, type) {
    const container = $('notifications');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'notification ' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => el.classList.add('show'));

    // Remove after 3 seconds
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ── Tab switching hook to refresh log ──────────────────────────────────────
  const origSwitchTab = switchTab;

  // Override to refresh log when switching to log tab
  function setupTabRefresh() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'log') {
          renderLog();
        }
      });
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return { init };
})();

// Start the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
