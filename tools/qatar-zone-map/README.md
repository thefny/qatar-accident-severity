# Qatar Zones Map (1–98)

An interactive, editable map of Qatar's 98 census/administrative zones, grouped and color-coded by municipality. Built as a lightweight static web app — no backend, no build step, no API key required.

**Live demo:** https://www.perplexity.ai/computer/a/qatar-zones-map-WdtxswH2Q8Wi8Pjaj88lUw

## Features

- **90 of 98 zones rendered with real official boundaries**, sourced from Qatar's CGIS Census Zone service and cross-validated against the municipality/district lookup table. The remaining 8 zones (8, 9, 10, 11, 59, 87, 88, 89) are listed with their metadata but have no current official boundary in the live GIS domain — this matches the source data's own legacy/unverified flags, not a rendering gap.
- **Color-grouped by municipality**: Doha, Al Rayyan, Al Wakrah, Umm Salal, Al Daayen, Al Khor and Al Thakhira, Al Shamal, Al Shahaniya, plus an "Unassigned / not verified" group — toggleable via the legend.
- **Editable geometry**: draw, reshape, or delete zone polygons using an integrated drawing toolbar (Leaflet-Geoman).
- **GeoJSON export**: download your current (including edited) zone boundaries as a standalone `.geojson` file at any time.
- **Search and sidebar list** covering all 98 zones with municipality, district, and verification status.
- **Accident severity overlay**: switch the "Accidents" tab to color zones by total accidents, serious accidents, injury rate, or serious rate (2020–2024, Qatar MOI data, N = 837,616), with a matching choropleth scale and area-level (9 municipality group) totals. Click any zone to see its full accident breakdown (simple / light injury / heavy injury / death).
- **Light/dark theme toggle.**
- **Works fully offline** — all zone data is embedded directly in the page (`data/qatar_zones_data.js`), so the site works whether it's served from a web server, GitHub Pages, or opened directly from disk (`file://`) with no server at all.

## Data sources

- Zone boundaries: [Qatar CGIS Census Zone 2020 FeatureServer](https://services.gisqatar.org.qa/server/rest/services/Vector/Census_Zone/FeatureServer/0)
- Zone domain reference: [Ashghal/CGIS DRAIN MapServer](https://services.gisqatar.org.qa/server/rest/services/Vector/DRAIN/MapServer/1?f=pjson)
- Municipality/district lookup and zone status: user-provided lookup table (zones 1–98), cross-referencing [Zones of Qatar — Wikipedia](https://en.wikipedia.org/wiki/Zones_of_Qatar)
- Accident severity by zone and area: Qatar Ministry of Interior national accident registry via the Qatar Open Data Portal (CC BY 4.0), restricted to 2020–2024, N = 837,616 accidents across four severity levels (simple, light injury, heavy injury, death)
- Base map tiles: [Esri World Light/Dark Gray Base](https://www.esri.com/)

## Usage

No installation needed.

- **Open directly:** double-click `index.html`, or
- **Serve locally:** `python3 -m http.server 8000` from this folder, then visit `http://localhost:8000`, or
- **GitHub Pages:** enable Pages on this repository (Settings → Pages → deploy from branch) and it will be live at your `github.io` URL with no extra configuration.

## Project structure

```
qatar-zones-map/
├── index.html                  # Page structure (sidebar, header, map)
├── style.css                   # Design system (light/dark themes, municipality colors)
├── base.css                    # CSS reset
├── app.js                      # Map logic, editing, search, export
└── data/
    └── qatar_zones_data.js     # Embedded zone geometry + full 98-zone lookup table
```

## Known limitations

Zones 8, 9, 10, 11, 59, 87, 88, and 89 have no current official boundary in Qatar's live GIS zone domain. They are included in the sidebar and export data with their municipality/district/status metadata, but are not drawn on the map. If more current boundaries for these become available, they can be added to `data/qatar_zones_data.js` and will render automatically.

## License

MIT — see [LICENSE](LICENSE).
