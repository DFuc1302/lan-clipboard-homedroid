# Chuyền — LAN Clipboard + QR Transfer

Transfer text and files between laptops, phones, and tablets on the same LAN. Data travels through the HomeDroid phone without using a cloud service.

## Features

- Shared clipboard with up to 30 items and 8,000 characters per item.
- Upload and download files up to 25 MB, with drag and drop on desktop.
- Pair devices using a QR code or a random 96-bit key.
- The API requires a Bearer token; the server stores only the SHA-256 hash of the pairing key.
- Rotate the key to disconnect all previously paired devices.
- Data is stored outside the Git checkout, so auto-deploy does not delete it.

## Run locally

```bash
npm install
npm test
npm start
```

Open `http://localhost:4175`. On the first device, select **Set up securely**, then use the QR code to pair other devices.

## Deploy with HomeDroid

| Field | Value |
| --- | --- |
| Repository | HTTPS URL of this repository |
| Branch | `main` |
| Port | `4175` |
| Runtime | `Node.js` or `Auto` |
| Build command | leave blank |
| Start command | leave blank (`npm start`) |

HomeDroid passes `$PORT` and `$HOST` to the server. By default, data is stored beside the checkout at `/srv/<deployment>-data`.

## Security

Use only on trusted Wi‑Fi or through Tailscale. Do not expose port `4175` directly to the Internet. Anyone with the pairing key can read, send, and delete all content in this space.
