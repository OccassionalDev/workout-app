# Lift Log

A Strong-style workout tracker as an installable web app (PWA). No accounts, no backend, no build step. All data stays on your device.

## Features
- **Unlimited templates**: create, edit, duplicate, delete.
- **Create templates with Claude**: open Templates → *Import from Claude*, copy the prompt into a Claude chat, describe the workout you want, and paste the JSON reply back.
- Workout logging: weight/reps per set, warm-up sets (tap the set number), notes, previous-session values as hints (tapping ✓ on a blank set copies them), add/remove sets and exercises. An unfinished workout and the rest timer survive closing the app.
- Custom exercises: create, rename (renames it in history and templates too) and delete.
- Rest timer with vibration.
- **Exercise history**: every session, PR badges, heaviest weight, estimated 1RM, best set, best session volume.
- **Progress charts** per exercise: est. 1RM, weight, volume or reps over time.
- Workout history grouped by month, with duration and volume. Repeat a workout or save it as a template.
- Body weight / body fat tracking with a chart.
- Plate calculator, kg/lb (switching can convert saved weights), CSV export, JSON backup and restore.

## Template JSON format
```json
{"templates":[{"name":"Push Day","exercises":[{"name":"Bench Press (Barbell)","sets":4,"reps":"6-8","note":"optional"}]}]}
```

The importer also accepts a single template object, a bare array of templates, and Claude's whole reply (text around a ```json block is ignored).

## Run
Open `index.html`, or serve the folder (`python3 -m http.server`). To install it on Android, host it over HTTPS (for example GitHub Pages: Settings → Pages → deploy from branch), open the URL in Chrome and choose *Add to Home screen*.

When you change any app file, bump `CACHE` in `sw.js` so installed copies drop the old offline cache.

Data is stored in the browser's localStorage. Use **Settings → Export backup** regularly.
