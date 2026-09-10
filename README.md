# FTU Schedule Sync

A completely free, client-side browser extension to synchronize FTU class schedules with Google Calendar without relying on third-party servers.

## Installation

1. Download or clone repository as a `.zip` file.
2. Open your Chromium-based browser (Chrome, Edge, Brave, etc.).
3. Navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
4. Enable **Developer Mode**.
5. Click **Load unpacked** and select the directory containing this project (the root directory where `manifest.json` is located).
6. Contact the owner (aka me) so I can approve your email as a tester

## Features

- **Direct API Sync**: Connects directly to `qldt.hcmc.ftu.edu.vn` to fetch the schedule. No intermediaries.
- **Universal OAuth2**: Uses standard `launchWebAuthFlow` to support Edge, Brave, and other Chromium forks.
- **Auto-Login**: Gracefully heals expired sessions by running a headless login routine in an offscreen document.
- **Offline Fallback**: Drag and drop `Export_TKB.xlsx` to generate standard `.ics` calendar files.
- **Theme Support & Localization**: English/Vietnamese toggles and Dark/Light mode support.

## Development

Run tests:
```bash
npm install
npm run test:ui
```

Bump version:
```bash
npm run bump
```
