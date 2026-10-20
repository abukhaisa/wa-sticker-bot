import express from 'express';
import QRCode from 'qrcode';
import config from '../config.js';
import logger from './utils/logger.js';

let botStatus = 'Memulai...';
let latestQR = null;
let stickerCounter = 0;
const startTime = Date.now();

export function setBotStatus(status) {
  botStatus = status;
}

export function setLatestQR(qr) {
  latestQR = qr;
}

export function incrementStickerCount() {
  stickerCounter++;
}

export function startKeepAliveServer() {
  const app = express();
  const port = config.server.port;

  // Endpoint Health Check untuk Monitoring (UptimeRobot, Render, Railway)
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      botStatus,
      uptimeSec: Math.floor(process.uptime()),
      totalStickers: stickerCounter,
      timestamp: new Date().toISOString(),
    });
  });

  // Endpoint QR Code via Web Browser (Sangat berguna saat deploy di Cloud)
  app.get('/qr', async (req, res) => {
    if (botStatus === 'Terhubung (Online)') {
      return res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <title>WhatsApp Bot - Status</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #f8fafc; margin: 0; }
            .card { background: #1e293b; padding: 2rem; border-radius: 1rem; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
            .badge { display: inline-block; background: #10b981; color: white; padding: 0.4rem 1rem; border-radius: 9999px; font-weight: bold; margin-bottom: 1rem; }
            a { color: #38bdf8; text-decoration: none; font-weight: 500; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">ONLINE</div>
            <h2>Bot Sudah Terhubung!</h2>
            <p>WhatsApp session sudah aktif. Anda tidak perlu memindai QR code lagi.</p>
            <p><a href="/">Kembali ke Dashboard</a></p>
          </div>
        </body>
        </html>
      `);
    }

    if (!latestQR) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="3">
          <title>Menunggu QR Code...</title>
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #cbd5e1; }
          </style>
        </head>
        <body>
          <p>Sedang membuat QR Code WhatsApp... Halaman akan me-refresh otomatis setiap 3 detik.</p>
        </body>
        </html>
      `);
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(latestQR, { scale: 8 });
      res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="20">
          <title>Scan WhatsApp QR Code</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #0b132b; color: #ffffff; margin: 0; padding: 1rem; }
            .container { background: #1c2541; padding: 2rem; border-radius: 1.25rem; text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.5); max-width: 420px; border: 1px solid #3a506b; }
            img { background: white; padding: 1rem; border-radius: 0.75rem; max-width: 100%; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #6fffe9; }
            p { font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; }
            .timer { font-size: 0.8rem; color: #94a3b8; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Pindai QR Code</h1>
            <p>Buka WhatsApp di ponsel Anda > Perangkat Tertaut > Tautkan Perangkat</p>
            <img src="${qrDataUrl}" alt="WhatsApp QR Code" />
            <p class="timer">QR otomatis diperbarui. Jika kedaluwarsa, halaman akan refresh secara berkala.</p>
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send('Gagal membuat gambar QR: ' + err.message);
    }
  });

  // Dashboard Utama
  app.get('/', (req, res) => {
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const uptimeString = `${hours}j ${minutes}m ${seconds}d`;

    const memUsageMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

    res.send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${config.botName} - Status Dashboard</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0f1d; color: #f1f5f9; padding: 2rem; display: flex; justify-content: center; }
          .wrapper { max-width: 650px; width: 100%; }
          .header { text-align: center; margin-bottom: 2rem; }
          .header h1 { font-size: 1.8rem; color: #38bdf8; margin-bottom: 0.5rem; }
          .header p { color: #94a3b8; font-size: 0.95rem; }
          .card { background: #131c31; border: 1px solid #1e293b; border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
          .stat-box { background: #1c2744; border-radius: 0.75rem; padding: 1rem; border: 1px solid #2d3d63; }
          .stat-box .label { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
          .stat-box .value { font-size: 1.3rem; font-weight: bold; color: #f8fafc; margin-top: 0.25rem; }
          .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; }
          .status-online { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
          .status-offline { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
          .feature-list { list-style: none; font-size: 0.9rem; line-height: 1.8; color: #cbd5e1; }
          .feature-list li::before { content: "✓ "; color: #38bdf8; font-weight: bold; }
          .btn { display: block; text-align: center; background: #0284c7; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; transition: background 0.2s; }
          .btn:hover { background: #0369a1; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>🤖 ${config.botName}</h1>
            <p>WhatsApp Sticker Generator & Anti-Banned Core 24/7</p>
          </div>

          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <span style="font-weight: 600;">Status Koneksi</span>
              <span class="status-badge ${botStatus.includes('Online') ? 'status-online' : 'status-offline'}">${botStatus}</span>
            </div>

            <div class="grid">
              <div class="stat-box">
                <div class="label">Masa Aktif (Uptime)</div>
                <div class="value">${uptimeString}</div>
              </div>
              <div class="stat-box">
                <div class="label">Total Stiker Dibuat</div>
                <div class="value">${stickerCounter}</div>
              </div>
              <div class="stat-box">
                <div class="label">Konsumsi RAM</div>
                <div class="value">${memUsageMB} MB</div>
              </div>
              <div class="stat-box">
                <div class="label">Jeda Anti-Banned</div>
                <div class="value">${config.antiBan.minDelayMs / 1000}s - ${config.antiBan.maxDelayMs / 1000}s</div>
              </div>
            </div>

            ${!botStatus.includes('Online') ? '<a href="/qr" class="btn">📱 Pindai QR Code WhatsApp</a>' : ''}
          </div>

          <div class="card">
            <h3 style="color: #6fffe9; font-size: 1.1rem; margin-bottom: 0.75rem;">Proteksi Anti-Banned Aktif</h3>
            <ul class="feature-list">
              <li><b>Jeda Waktu Acak:</b> Menunda eksekusi ${config.antiBan.minDelayMs}-${config.antiBan.maxDelayMs}ms menyerupai manusia.</li>
              <li><b>Simulasi Mengetik (Composing Presence):</b> Menampilkan status mengetik sebelum mengirim.</li>
              <li><b>Simulasi Read Receipt:</b> Menandai centang biru setelah jeda membaca alami.</li>
              <li><b>Emulasi User-Agent:</b> ${config.antiBan.browserName}</li>
              <li><b>Rate Limiting & Anti-Spam:</b> Cooldown ${config.antiBan.userCooldownSec}s & kuota ${config.antiBan.dailyLimitPerUser}/hari.</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  app.listen(port, () => {
    logger.info(`Keep-Alive Web Server aktif di port ${port}`);
    logger.info(`Dashboard status: http://localhost:${port}`);
    logger.info(`Pindai QR Web: http://localhost:${port}/qr`);
  });

  // Fitur Self-Ping Otomatis untuk mencegah platform seperti Render sleep
  if (config.server.selfPingUrl) {
    logger.info(`Mengaktifkan Auto Self-Ping ke: ${config.server.selfPingUrl}`);
    setInterval(async () => {
      try {
        const pingUrl = config.server.selfPingUrl.replace(/\/$/, '') + '/health';
        await fetch(pingUrl);
        logger.info(`Self-ping berhasil ke ${pingUrl}`);
      } catch (err) {
        logger.warn(`Gagal melakukan self-ping: ${err.message}`);
      }
    }, config.server.selfPingIntervalMin * 60 * 1000);
  }
}

export default startKeepAliveServer;
