import dotenv from 'dotenv';
dotenv.config();

const rawOwner = (process.env.OWNER_NUMBER || '6281234567890').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
const formattedOwner = (rawOwner.startsWith('08') ? '62' + rawOwner.slice(1) : rawOwner) + '@s.whatsapp.net';

export const config = {
  // Informasi Dasar Bot
  botName: process.env.BOT_NAME || 'StickerCraft Bot',
  ownerNumber: formattedOwner,
  prefix: process.env.PREFIX || '.', // Prefix command, e.g. ., !, /, or #

  // Konfigurasi Metadata Stiker (EXIF)
  sticker: {
    packname: process.env.STICKER_PACKNAME || 'StickerCraft',
    author: process.env.STICKER_AUTHOR || 'Created with Baileys',
    categories: ['🎨', '🤖'],
    quality: 60, // Kualitas stiker (1-100)
    maxVideoDuration: 9, // Maksimal durasi video (detik) untuk stiker bergerak (< 1MB)
    maxFileSizeMB: 10, // Maksimal ukuran file sumber (MB)
  },

  // Pengaturan Anti-Banned & Humanisasi
  antiBan: {
    // 1. Jeda Waktu Acak (Randomized Delay) dalam milidetik
    minDelayMs: parseInt(process.env.MIN_DELAY_MS || '1500', 10), // Minimal 1.5 detik
    maxDelayMs: parseInt(process.env.MAX_DELAY_MS || '3500', 10), // Maksimal 3.5 detik
    
    // 2. Simulasi Waktu Mengetik (Composing State)
    simulateTyping: true,
    minTypingMs: 1000,
    maxTypingMs: 2500,

    // 3. Simulasi Read Receipt (Centang Biru) Alami
    autoReadMessages: true,
    readDelayMinMs: 800,
    readDelayMaxMs: 1800,

    // 4. Rate Limiting & Cooldown per Pengguna
    userCooldownSec: parseInt(process.env.USER_COOLDOWN_SEC || '6', 10), // Jeda antar perintah per orang
    dailyLimitPerUser: parseInt(process.env.DAILY_LIMIT || '40', 10),   // Batas stiker gratis harian
    burstLimit: {
      maxRequests: 4,      // Maksimal request dalam window
      windowSec: 15,       // Window waktu 15 detik
      banDurationMin: 5    // Soft-ban 5 menit jika spamming terdeteksi
    },

    // 5. Emulasi User-Agent Browser WhatsApp Web
    browserName: 'Chrome (Ubuntu)',
    browserClient: ['Ubuntu', 'Chrome', '124.0.215.34'],
  },

  // Konfigurasi Web Dashboard & Keep-Alive
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    selfPingUrl: process.env.SELF_PING_URL || '', // URL Render/Railway untuk auto-ping
    selfPingIntervalMin: 10, // Ping setiap 10 menit
  },

  // Path Penyimpanan Sesi
  sessionDir: process.env.SESSION_DIR || './auth_info',
};

export default config;
