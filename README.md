# SENATI TaskHub PWA

Progressive Web App built with Angular 19 for managing student tasks and instructor observations, including offline-first local storage.

## Requirements

- Node.js compatible with Angular 19
- npm

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200/`. Use the profile control in the header to switch between the student and instructor views. The browser connection state switches the application between online and local modes.

## Production build

```bash
npm run build
```

The production build generates the Angular service worker and its precache configuration. Serve the output over HTTPS (or localhost) to enable PWA and offline features.

## Offline behavior

- Tasks are loaded from `src/assets/data/tareas.json` and cached by the Angular service worker.
- Pending submissions and instructor observations are stored in IndexedDB (`senatiTaskDB`, `entregas_pendientes`).
- Online submission currently shows the requested success state; connect a Campus Virtual API endpoint to transmit submissions to a server.
