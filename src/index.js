import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import fs from 'fs';
import config from '../config.js';
import logger from './utils/logger.js';
import { MessageHandler } from './handlers/messageHandler.js';
import {
  startKeepAliveServer,
  setBotStatus,
  setLatestQR,
} from './keepAlive.js';

// Inisialisasi HTTP Keep-Alive Server
startKeepAliveServer();

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function startBot() {
  try {
    // Siapkan folder sesi autentikasi multi-file
    if (!fs.existsSync(config.sessionDir)) {
      fs.mkdirSync(config.sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Menggunakan Baileys versi v${version.join('.')}${isLatest ? ' (Terbaru)' : ''}`);

    // Inisialisasi Socket Baileys dengan konfigurasi Humanized & Anti-Banned
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }), // Heningkan log internal agar konsol bersih
      auth: state,
      printQRInTerminal: false, // Ditangani manual di bawah untuk terminal & web
      // Emulasi browser Linux Chrome yang realistis
      browser: config.antiBan.browserClient,
      markOnlineOnConnect: true,
      syncFullHistory: false, // Jangan download riwayat lama agar hemat resource & aman dari ban
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    // Event perubahan status koneksi & QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Tangani QR Code baru
      if (qr) {
        setBotStatus('Menunggu Pemindaian QR');
        setLatestQR(qr);
        logger.info('Kode QR WhatsApp terdeteksi. Silakan pindai di konsol atau via browser:');
        logger.info(`Buka di browser: http://localhost:${config.server.port}/qr`);
        qrcodeTerminal.generate(qr, { small: true });
      }

      // Koneksi ditutup (disconnect)
      if (connection === 'close') {
        setBotStatus('Koneksi Terputus');
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn(`Koneksi terputus. Kode status: ${statusCode || 'Unknown'}. Alasan: ${lastDisconnect?.error?.message || 'None'}`);

        if (shouldReconnect) {
          reconnectAttempts++;
          if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(5000 * reconnectAttempts, 30000);
            logger.info(`Menyambung kembali dalam ${delay / 1000} detik (Percobaan ke-${reconnectAttempts})...`);
            setTimeout(() => startBot(), delay);
          } else {
            logger.error(`Batas percobaan reconnect (${MAX_RECONNECT_ATTEMPTS}x) tercapai. Silakan periksa koneksi internet Anda.`);
          }
        } else {
          logger.error('Sesi telah Logout dari perangkat ponsel! Menghapus folder auth...');
          try {
            fs.rmSync(config.sessionDir, { recursive: true, force: true });
          } catch (e) {
            // Abaikan error rm
          }
          logger.info('Silakan jalankan ulang bot untuk memindai QR code baru.');
        }
      }

      // Koneksi berhasil terhubung
      if (connection === 'open') {
        reconnectAttempts = 0;
        setBotStatus('Terhubung (Online)');
        setLatestQR(null);
        logger.info('=============================================');
        logger.info(`🎉 ${config.botName} BERHASIL TERHUBUNG KE WHATSAPP!`);
        logger.info(`Nomor Bot: ${sock.user?.id?.split(':')[0] || 'Unknown'}`);
        logger.info(`Prefix Aktif: "${config.prefix}"`);
        logger.info(`Dashboard 24/7: http://localhost:${config.server.port}`);
        logger.info('=============================================');
      }
    });

    // Simpan kredensial sesi setiap kali diperbarui
    sock.ev.on('creds.update', saveCreds);

    // Event pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const m of messages) {
        try {
          await MessageHandler.handle(sock, m);
        } catch (err) {
          logger.error('Error saat memproses pesan:', err);
        }
      }
    });

  } catch (err) {
    logger.error('Fatal Error saat inisialisasi bot:', err);
    setTimeout(() => startBot(), 5000);
  }
}

// Tangani penutupan proses secara anggun (Graceful shutdown)
process.on('SIGINT', () => {
  logger.info('Menghentikan bot secara aman (SIGINT)...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Menghentikan bot secara aman (SIGTERM)...');
  process.exit(0);
});

// Mulai bot
startBot();
