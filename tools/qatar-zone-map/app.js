(function () {
  'use strict';

  // ---------- Municipality group palette ----------
  var GROUP_ORDER = [
    'Doha', 'Al Rayyan', 'Al Wakrah', 'Umm Salal', 'Al Daayen',
    'Al Khor and Al Thakhira', 'Al Shamal', 'Al Shahaniya', 'Unassigned / not verified'
  ];
  var GROUP_COLORS = {
    'Doha': '#b5443b',
    'Al Rayyan': '#2f6690',
    'Al Wakrah': '#3c8c6d',
    'Umm Salal': '#c9942f',
    'Al Daayen': '#6f5499',
    'Al Khor and Al Thakhira': '#2f8fa0',
    'Al Shamal': '#825837',
    'Al Shahaniya': '#a86a83',
    'Unassigned / not verified': '#8b939c'
  };

  // ---------- Accident severity (2020–2024, Qatar MOI) ----------
  var ACCIDENT_METRICS = {
    total: { label: 'Total accidents', field: 'total', kind: 'count' },
    serious: { label: 'Serious accidents (heavy + death)', field: 'serious', kind: 'count' },
    injury_rate: { label: 'Injury rate (%)', field: 'injury_rate_pct', kind: 'pct' },
    serious_rate: { label: 'Serious rate (%)', field: 'serious_rate_pct', kind: 'pct' }
  };
  var ACCIDENT_SCALE = ['#fbeaee', '#f0b7c2', '#df7f92', '#b8425a', '#7a0f28'];
  var ACCIDENT_NO_DATA_COLOR = '#c7ccd1';

  function fmtNum(n) {
    if (n === undefined || n === null) return '\u2014';
    return Number(n).toLocaleString('en-US');
  }

  function metricValue(props, metricKey) {
    var m = ACCIDENT_METRICS[metricKey];
    if (!props || !props.accidents) return 0;
    var v = props.accidents[m.field];
    return typeof v === 'number' ? v : 0;
  }

  function computeBreaks(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    function pct(p) {
      if (!sorted.length) return 0;
      var idx = (sorted.length - 1) * p;
      var lo = Math.floor(idx), hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo];
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }
    return [pct(0.2), pct(0.4), pct(0.6), pct(0.8)];
  }

  function accidentColorFor(value, breaks) {
    if (value <= breaks[0]) return ACCIDENT_SCALE[0];
    if (value <= breaks[1]) return ACCIDENT_SCALE[1];
    if (value <= breaks[2]) return ACCIDENT_SCALE[2];
    if (value <= breaks[3]) return ACCIDENT_SCALE[3];
    return ACCIDENT_SCALE[4];
  }

  function formatMetric(value, metricKey) {
    var m = ACCIDENT_METRICS[metricKey];
    if (m.kind === 'pct') return (Math.round(value * 100) / 100) + '%';
    return fmtNum(Math.round(value));
  }

  function normGroup(m) {
    if (!m) return 'Unassigned / not verified';
    if (m.indexOf('Doha') === 0) return 'Doha';
    if (m.indexOf('Unassigned') === 0) return 'Unassigned / not verified';
    return m;
  }

  function classifyStatus(status) {
    if (!status) return 'unverified';
    var s = status.toLowerCase();
    if (s.indexOf('verified') === 0 || s.indexOf('verified /') === 0 || s.indexOf('verified/') === 0) return 'verified';
    if (s.indexOf('legacy') !== -1) return 'legacy';
    return 'unverified';
  }

  function statusLabel(cls) {
    return cls === 'verified' ? 'Verified' : cls === 'legacy' ? 'Legacy' : 'Unverified';
  }

  // ---------- State ----------
  var state = {
    theme: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    hiddenGroups: {},
    editMode: false,
    activeZone: null,
    allZones: [],       // full 1-98 lookup rows from spreadsheet
    geoFeatures: {},    // zone -> geojson feature (for zones with real boundaries)
    zoneLayers: {},     // zone -> leaflet layer
    viewMode: 'municipality',   // 'municipality' | 'accidents'
    accidentMetric: 'total',
    accidentBreaks: [0, 0, 0, 0]
  };

  document.documentElement.setAttribute('data-theme', state.theme);

  // ---------- Map setup ----------
  var QATAR_BOUNDS = L.latLngBounds([24.35, 50.5], [26.3, 51.9]);

  var map = L.map('map', {
    center: [25.35, 51.22],
    zoom: 9,
    minZoom: 8,
    maxZoom: 16,
    maxBoundsViscosity: 0.6,
    zoomControl: true
  });
  map.setMaxBounds(QATAR_BOUNDS.pad(0.15));

  var esriAttr = '&copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, FAO, NOAA, USGS';
  var tileLight = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: esriAttr,
    maxZoom: 16
  });
  var refLight = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16, pane: 'overlayPane'
  });
  var tileDark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: esriAttr,
    maxZoom: 16
  });
  var refDark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16, pane: 'overlayPane'
  });
  (state.theme === 'dark' ? tileDark : tileLight).addTo(map);
  (state.theme === 'dark' ? refDark : refLight).addTo(map);

  var zonesLayerGroup = L.featureGroup().addTo(map);
  var labelsLayerGroup = L.layerGroup().addTo(map);

  var LABEL_MIN_ZOOM = 11;
  function updateLabelVisibility() {
    var show = map.getZoom() >= LABEL_MIN_ZOOM;
    var container = labelsLayerGroup.getPane ? null : null;
    labelsLayerGroup.eachLayer(function (m) {
      var el = m.getElement && m.getElement();
      if (el) el.style.visibility = show ? '' : 'hidden';
    });
  }
  map.on('zoomend', updateLabelVisibility);

  // ---------- Geometry helpers ----------
  function ringCentroid(ring) {
    // Area-weighted centroid (shoelace) for a single ring [ [lng,lat], ... ]
    var x = 0, y = 0, area = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var x0 = ring[i][0], y0 = ring[i][1];
      var x1 = ring[i + 1][0], y1 = ring[i + 1][1];
      var cross = x0 * y1 - x1 * y0;
      area += cross;
      x += (x0 + x1) * cross;
      y += (y0 + y1) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-12) {
      // fallback: simple average
      var sx = 0, sy = 0;
      ring.forEach(function (p) { sx += p[0]; sy += p[1]; });
      return [sy / ring.length, sx / ring.length];
    }
    x /= (6 * area);
    y /= (6 * area);
    return [y, x]; // [lat, lng]
  }

  function polygonCentroid(geometry) {
    var ring = geometry.type === 'Polygon' ? geometry.coordinates[0] :
      geometry.coordinates.reduce(function (a, poly) { return poly[0].length > a.length ? poly[0] : a; }, []);
    return ringCentroid(ring);
  }

  // ---------- Toast ----------
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2600);
  }

  // ---------- Popup content ----------
  function popupHTML(p) {
    var cls = classifyStatus(p.status);
    var html = '' +
      '<div class="popup-title"><span>Zone ' + p.zone + '</span>' +
      '<span class="popup-status-badge ' + (cls === 'unverified' ? 'legacy' : cls) + '">' + statusLabel(cls) + '</span></div>' +
      '<div class="popup-row"><span class="k">Municipality</span><span class="v">' + p.municipality + '</span></div>' +
      '<div class="popup-row"><span class="k">District / area</span><span class="v">' + (p.district || '—') + '</span></div>' +
      '<div class="popup-row"><span class="k">Confidence</span><span class="v">' + (p.confidence || '—') + '</span></div>';
    if (p.accidents && p.accidents.total) {
      html += '' +
        '<div class="popup-divider"></div>' +
        '<div class="popup-row"><span class="k">Accidents (2020–24)</span><span class="v accent">' + fmtNum(p.accidents.total) + '</span></div>' +
        '<div class="popup-row"><span class="k">Serious (heavy+death)</span><span class="v">' + fmtNum(p.accidents.serious) + '</span></div>' +
        '<div class="popup-row"><span class="k">Injury rate</span><span class="v">' + p.accidents.injury_rate_pct + '%</span></div>' +
        '<div class="popup-row"><span class="k">Serious rate</span><span class="v">' + p.accidents.serious_rate_pct + '%</span></div>';
    }
    return html;
  }

  // ---------- Render zone polygons ----------
  function zoneStyle(props, isActive) {
    var group = normGroup(props.municipality);
    var hidden = !!state.hiddenGroups[group];
    var fillColor;
    var lineColor;

    if (state.viewMode === 'accidents') {
      var hasData = props.accidents && props.accidents.total !== undefined;
      fillColor = hasData ? accidentColorFor(metricValue(props, state.accidentMetric), state.accidentBreaks) : ACCIDENT_NO_DATA_COLOR;
      lineColor = isActive ? '#1b1f24' : '#8a1538';
    } else {
      fillColor = GROUP_COLORS[group] || GROUP_COLORS['Unassigned / not verified'];
      lineColor = isActive ? '#1b1f24' : fillColor;
    }

    var baseOpacity = state.viewMode === 'accidents' ? 0.68 : 0.38;
    var activeOpacity = state.viewMode === 'accidents' ? 0.85 : 0.55;

    return {
      color: lineColor,
      weight: isActive ? 3 : 1.3,
      fillColor: fillColor,
      fillOpacity: hidden ? 0 : (isActive ? activeOpacity : baseOpacity),
      opacity: hidden ? 0 : 1,
      interactive: !hidden
    };
  }

  function refreshStyles() {
    Object.keys(state.zoneLayers).forEach(function (zone) {
      var layer = state.zoneLayers[zone];
      var props = layer.feature.properties;
      layer.setStyle(zoneStyle(props, state.activeZone === Number(zone)));
    });
    labelsLayerGroup.eachLayer(function (marker) {
      var group = normGroup(marker._zoneMuni);
      var hidden = !!state.hiddenGroups[group];
      var el = marker.getElement && marker.getElement();
      if (el) el.style.display = hidden ? 'none' : '';
    });
  }

  function buildZoneLayer(feature) {
    var props = feature.properties;
    var layer = L.geoJSON(feature, { style: zoneStyle(props, false) }).getLayers()[0];
    layer.feature = feature;
    layer.on('click', function () {
      if (state.editMode) return;
      setActiveZone(props.zone, true);
    });
    layer.on('mouseover', function () {
      if (state.editMode) return;
      if (state.activeZone !== props.zone) layer.setStyle({ weight: 2.4 });
    });
    layer.on('mouseout', function () {
      if (state.editMode) return;
      if (state.activeZone !== props.zone) layer.setStyle(zoneStyle(props, false));
    });
    layer.bindPopup(popupHTML(props), { closeButton: true, maxWidth: 260 });
    layer.addTo(zonesLayerGroup);
    state.zoneLayers[props.zone] = layer;
    state.geoFeatures[props.zone] = feature;

    var centroid = polygonCentroid(feature.geometry);
    var label = L.marker(centroid, {
      icon: L.divIcon({ className: 'zone-label', html: String(props.zone), iconSize: [22, 14] }),
      interactive: false,
      keyboard: false
    });
    label._zoneMuni = props.municipality;
    label.addTo(labelsLayerGroup);
  }

  // ---------- Sidebar: legend ----------
  var legendListEl = document.getElementById('legend-list');
  var zoneCountsByGroup = {};

  function buildLegend() {
    legendListEl.innerHTML = '';
    var areaSummary = window.QATAR_AREA_ACCIDENT_SUMMARY || {};
    var metric = ACCIDENT_METRICS[state.accidentMetric];

    GROUP_ORDER.forEach(function (group) {
      if (!zoneCountsByGroup[group]) return;
      var displayValue;
      if (state.viewMode === 'accidents') {
        var summary = areaSummary[group];
        var raw = summary ? summary[metric.field] : 0;
        displayValue = formatMetric(raw, state.accidentMetric);
      } else {
        displayValue = zoneCountsByGroup[group];
      }
      var btn = document.createElement('button');
      btn.className = 'legend-item';
      btn.setAttribute('data-testid', 'button-legend-' + group.replace(/\s+/g, '-').toLowerCase());
      btn.innerHTML =
        '<span class="legend-swatch" style="background:' + GROUP_COLORS[group] + '"></span>' +
        '<span class="legend-label">' + group + '</span>' +
        '<span class="legend-count">' + displayValue + '</span>';
      btn.addEventListener('click', function () {
        state.hiddenGroups[group] = !state.hiddenGroups[group];
        btn.classList.toggle('is-off', !!state.hiddenGroups[group]);
        refreshStyles();
        renderZoneList(document.getElementById('zone-search').value);
      });
      legendListEl.appendChild(btn);
    });
  }

  // ---------- Sidebar: accident color scale ----------
  var accidentScaleEl = document.getElementById('accident-scale');
  function buildAccidentScale() {
    var breaks = state.accidentBreaks;
    var metric = ACCIDENT_METRICS[state.accidentMetric];
    var edges = [0, breaks[0], breaks[1], breaks[2], breaks[3]];
    var rows = ACCIDENT_SCALE.map(function (color, i) {
      var lo = formatMetric(edges[i], state.accidentMetric);
      var hiVal = i < 4 ? breaks[i] : null;
      var label = i === 4 ? (formatMetric(breaks[3], state.accidentMetric) + '+') : (lo + '–' + formatMetric(breaks[i], state.accidentMetric));
      return '<div class="accident-scale-row"><span class="accident-scale-swatch" style="background:' + color + '"></span><span class="accident-scale-range">' + label + '</span></div>';
    }).join('');
    rows += '<div class="accident-scale-row"><span class="accident-scale-swatch" style="background:' + ACCIDENT_NO_DATA_COLOR + '"></span><span class="accident-scale-range">No boundary / no data</span></div>';
    accidentScaleEl.innerHTML = rows;
  }

  function recomputeAccidentBreaks() {
    var values = [];
    Object.keys(state.geoFeatures).forEach(function (zone) {
      var props = state.geoFeatures[zone].properties;
      if (props.accidents) values.push(metricValue(props, state.accidentMetric));
    });
    state.accidentBreaks = computeBreaks(values.length ? values : [0]);
  }

  // ---------- Sidebar: zone list ----------
  var zoneListEl = document.getElementById('zone-list');
  function renderZoneList(filter) {
    filter = (filter || '').trim().toLowerCase();
    zoneListEl.innerHTML = '';
    var grouped = {};
    state.allZones.forEach(function (z) {
      var g = normGroup(z.municipality);
      grouped[g] = grouped[g] || [];
      grouped[g].push(z);
    });
    GROUP_ORDER.forEach(function (group) {
      var zones = grouped[group];
      if (!zones) return;
      if (state.hiddenGroups[group]) return;
      var visibleRows = zones.filter(function (z) {
        if (!filter) return true;
        return String(z.zone).indexOf(filter) !== -1 ||
          (z.district || '').toLowerCase().indexOf(filter) !== -1 ||
          (z.municipality || '').toLowerCase().indexOf(filter) !== -1;
      });
      if (!visibleRows.length) return;

      var label = document.createElement('div');
      label.className = 'zone-group-label';
      label.textContent = group + ' (' + zones.length + ')';
      zoneListEl.appendChild(label);

      visibleRows.forEach(function (z) {
        var hasGeom = !!state.geoFeatures[z.zone];
        var cls = classifyStatus(z.status);
        var row = document.createElement('button');
        row.className = 'zone-row';
        row.setAttribute('data-testid', 'row-zone-' + z.zone);
        var accidentTotal = (z.accidents && typeof z.accidents.total === 'number') ? fmtNum(z.accidents.total) : '\u2014';
        row.innerHTML =
          '<span class="zone-badge" style="background:' + GROUP_COLORS[group] + (hasGeom ? '' : ';opacity:.45') + '">' + z.zone + '</span>' +
          '<span class="zone-info">' +
          '<div class="zone-district">' + (z.district || 'No district verified') + '</div>' +
          '<div class="zone-muni">' + z.municipality + '</div>' +
          '</span>' +
          '<span class="zone-accident-badge" title="Accidents 2020\u201324">' + accidentTotal + '</span>' +
          '<span class="status-dot ' + cls + '" title="' + statusLabel(cls) + '"></span>';
        row.addEventListener('click', function () { setActiveZone(z.zone, true); });
        zoneListEl.appendChild(row);
      });
    });
  }

  function setActiveZone(zoneNum, flyTo) {
    state.activeZone = zoneNum;
    refreshStyles();
    document.querySelectorAll('.zone-row').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-testid') === 'row-zone-' + zoneNum);
    });
    var layer = state.zoneLayers[zoneNum];
    if (layer) {
      if (flyTo) map.flyToBounds(layer.getBounds(), { maxZoom: 14, duration: 0.6 });
      layer.openPopup();
    } else if (flyTo) {
      var z = state.allZones.find(function (r) { return r.zone === zoneNum; });
      toast('Zone ' + zoneNum + ' has no current official boundary (' + (z ? z.status : 'unverified') + ').');
    }
  }

  // ---------- Search ----------
  document.getElementById('zone-search').addEventListener('input', function (e) {
    renderZoneList(e.target.value);
  });

  // ---------- Legacy banner ----------
  document.getElementById('legacy-banner-head').addEventListener('click', function () {
    document.getElementById('legacy-banner').classList.toggle('is-collapsed');
  });

  // ---------- View mode: Municipality vs Accidents ----------
  var tabMunicipality = document.getElementById('tab-municipality');
  var tabAccidents = document.getElementById('tab-accidents');
  var accidentMetricRow = document.getElementById('accident-metric-row');
  var accidentMetricSelect = document.getElementById('accident-metric');
  var legendHeading = document.getElementById('legend-heading');
  var accidentFootnote = document.getElementById('accident-footnote');

  function applyViewMode() {
    var isAccidents = state.viewMode === 'accidents';
    tabMunicipality.classList.toggle('is-active', !isAccidents);
    tabAccidents.classList.toggle('is-active', isAccidents);
    accidentMetricRow.style.display = isAccidents ? '' : 'none';
    accidentScaleEl.style.display = isAccidents ? '' : 'none';
    accidentFootnote.style.display = isAccidents ? '' : 'none';
    legendHeading.textContent = isAccidents ? 'Accidents by area' : 'Municipality groups';
    if (isAccidents) {
      recomputeAccidentBreaks();
      buildAccidentScale();
    }
    buildLegend();
    refreshStyles();
  }

  tabMunicipality.addEventListener('click', function () {
    if (state.viewMode === 'municipality') return;
    state.viewMode = 'municipality';
    applyViewMode();
  });
  tabAccidents.addEventListener('click', function () {
    if (state.viewMode === 'accidents') return;
    state.viewMode = 'accidents';
    applyViewMode();
  });
  accidentMetricSelect.addEventListener('change', function (e) {
    state.accidentMetric = e.target.value;
    applyViewMode();
  });

  // ---------- Theme toggle ----------
  document.getElementById('btn-theme').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    if (state.theme === 'dark') {
      map.removeLayer(tileLight); map.removeLayer(refLight);
      tileDark.addTo(map); refDark.addTo(map);
    } else {
      map.removeLayer(tileDark); map.removeLayer(refDark);
      tileLight.addTo(map); refLight.addTo(map);
    }
  });

  // ---------- Edit mode (Leaflet-Geoman) ----------
  var editHint = document.getElementById('edit-hint');
  var btnEdit = document.getElementById('btn-edit');
  var nextNewZoneId = 9000;

  map.pm.setGlobalOptions({ snappable: true, snapDistance: 14 });

  document.getElementById('btn-export').addEventListener('click', exportGeoJSON);

  btnEdit.addEventListener('click', function () {
    state.editMode = !state.editMode;
    btnEdit.classList.toggle('btn-active', state.editMode);
    editHint.classList.toggle('is-visible', state.editMode);

    if (state.editMode) {
      map.pm.addControls({
        position: 'topleft',
        drawMarker: false, drawCircleMarker: false, drawPolyline: false,
        drawRectangle: false, drawCircle: false, drawText: false,
        drawPolygon: true, editMode: true, dragMode: true,
        cutPolygon: false, removalMode: true, rotateMode: false
      });
      Object.keys(state.zoneLayers).forEach(function (z) { state.zoneLayers[z].pm.enable({ allowSelfIntersection: false }); });
    } else {
      map.pm.removeControls();
      Object.keys(state.zoneLayers).forEach(function (z) { state.zoneLayers[z].pm.disable(); });
    }
  });

  map.on('pm:create', function (e) {
    var layer = e.layer;
    var zoneNum = nextNewZoneId++;
    var props = { zone: zoneNum, municipality: 'Unassigned / not verified', district: 'Custom drawn zone', status: 'User-added', confidence: 'N/A' };
    layer.feature = { type: 'Feature', properties: props, geometry: layer.toGeoJSON().geometry };
    layer.setStyle(zoneStyle(props, false));
    layer.bindPopup(popupHTML(props));
    layer.pm.enable();
    state.zoneLayers[zoneNum] = layer;
    state.geoFeatures[zoneNum] = layer.feature;
    state.allZones.push({ zone: zoneNum, municipality: props.municipality, district: props.district, status: props.status, confidence: props.confidence });
    layer.on('click', function () { if (!state.editMode) setActiveZone(zoneNum, true); });
    toast('New zone added — assign details after exporting, or edit the popup.');
    renderZoneList(document.getElementById('zone-search').value);
  });

  map.on('pm:remove', function (e) {
    var layer = e.layer;
    if (layer.feature) {
      var zoneNum = layer.feature.properties.zone;
      delete state.zoneLayers[zoneNum];
      delete state.geoFeatures[zoneNum];
      toast('Zone ' + zoneNum + ' boundary removed from this session.');
      renderZoneList(document.getElementById('zone-search').value);
    }
  });

  function exportGeoJSON() {
    var features = Object.keys(state.zoneLayers).map(function (zone) {
      var layer = state.zoneLayers[zone];
      var geo = layer.toGeoJSON();
      return { type: 'Feature', geometry: geo.geometry, properties: layer.feature.properties };
    });
    var fc = { type: 'FeatureCollection', features: features };
    var blob = new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'qatar_zones_edited.geojson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Exported ' + features.length + ' zone boundaries as GeoJSON.');
  }

  // ---------- Load data ----------
  // Data is embedded inline via data/qatar_zones_data.js (window.QATAR_ZONES_GEOJSON /
  // window.QATAR_ALL_ZONES) so the map also works when the folder is opened directly
  // from disk (file://) with no local server and no fetch()/CORS requirement.
  try {
    var geo = window.QATAR_ZONES_GEOJSON;
    var allZones = window.QATAR_ALL_ZONES;
    if (!geo || !allZones) throw new Error('Zone data script did not load.');
    state.allZones = allZones;

    geo.features.forEach(buildZoneLayer);

    allZones.forEach(function (z) {
      var g = normGroup(z.municipality);
      zoneCountsByGroup[g] = (zoneCountsByGroup[g] || 0) + 1;
    });
    buildLegend();
    renderZoneList('');

    if (zonesLayerGroup.getLayers().length) {
      map.fitBounds(zonesLayerGroup.getBounds(), { padding: [20, 20] });
    }
    updateLabelVisibility();
  } catch (err) {
    console.error(err);
    toast('Could not load zone data.');
  }

})();
