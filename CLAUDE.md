# CLAUDE.md

## Stack

Pure static web app — HTML/CSS/JS served from `public/`. No build tools, no npm, no backend.

## Data pipeline

FARS 2001–2023 pedestrian fatalities → packed Float32 binary blob.

```bash
# Using locally downloaded data
python scripts/build_binary.py --data-dir data/raw --years 2001-2023

# Using the pedestrian-safety-mapper's existing data
python scripts/build_binary.py --data-dir ../pedestrian-safety-mapper/data/raw --years 2023
```

Output: `public/incidents.bin` — 8 bytes per incident (float32 lat, float32 lon, little-endian). Committed to repo.

## Running locally

```bash
cd public && python3 -m http.server 8080
# http://localhost:8080
```

## Running in Docker (home server, port 5004)

```bash
sg docker -c "docker-compose up -d"
# http://<server-ip>:5004
```

After rebuilding incidents.bin, rebuild the image:
```bash
sg docker -c "docker-compose up -d --build"
```

HTTPS is required for geolocation and DeviceOrientationEvent on real phones. For phone testing use ngrok or the home server behind a reverse proxy with a cert.

## Architecture

```
scripts/build_binary.py    FARS zips → public/incidents.bin
public/
  index.html               single page shell
  app.js                   data loader, scoring engine, GPS, compass, sound
  style.css                full-screen layout, color transitions
  incidents.bin            generated — committed to repo
data/raw/                  FARS zips — gitignored, never committed
docs/shaping/              shaping doc and slices
```

## Slices

- V1: Shell + data pipeline (loading overlay, binary fetch, incident count)
- V2: Score + display (hardcoded location, color field, numeric reading)
- V3: Live GPS (watchPosition, geolocation permission prompt)
- V4: Sound (click engine, tone engine, mode toggle, mute/audio unlock)
- V5: Directional (DeviceOrientationEvent, directional weight in scoring engine)

## Phone testing notes

- Web Audio requires a user gesture before playing — the mute button unlocks it on first tap
- iOS 13+ requires `DeviceOrientationEvent.requestPermission()` called from a user gesture
- Geolocation is HTTPS-only on most mobile browsers
