import { downloadMediaMessage } from '@whiskeysockets/baileys';
import config from '../../config.js';
import logger from '../utils/logger.js';
import Humanizer from '../services/humanizer.js';
import rateLimiter from '../services/rateLimiter.js';
import adminManager from '../services/adminManager.js';
import StickerService from '../services/stickerService.js';
import { incrementStickerCount } from '../keepAlive.js';

export class MessageHandler {
  /**
   * Menangani event pesan masuk
   * @param {import('@whiskeysockets/baileys').WASocket} sock 
   * @param {import('@whiskeysockets/baileys').WAMessage} m 
   */
  static async handle(sock, m) {
    if (!m.message) return;

    const from = m.key.remoteJid;
    // Ekstrak teks pesan
    const body = this.extractMessageText(m);
    if (!body) return;

    // Cek apakah pesan menggunakan prefix yang ditentukan
    const prefix = config.prefix;
    const isCommand = body.startsWith(prefix);
    if (!isCommand) return;

    // Abaikan status broadcast atau saluran (newsletter)
    if (from === 'status@broadcast') return;
    if (from.endsWith('@newsletter')) return;

    // Normalisasi ID pengirim (khusus grup vs private chat vs self-chat)
    let rawSender = from;
    if (from.endsWith('@g.us')) {
      rawSender = m.key.participant || from;
    } else if (m.key.fromMe) {
      rawSender = sock.user?.id || config.ownerNumber;
    }

    const sender = adminManager.cleanJid(rawSender);
    const isOwner = adminManager.isOwner(sender);
    const isAdmin = adminManager.isAdmin(sender);
    const userRole = adminManager.getRole(sender);

    // 1. SIMULASI ANTI-BANNED: Simulasi Centang Biru (Membaca pesan) secara alami
    await Humanizer.simulateReadReceipt(sock, m.key);

    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = (args.shift() || '').toLowerCase();
    const query = args.join(' ');

    logger.info(`[${userRole.toUpperCase()}] Perintah: [${prefix}${command}] dari ${adminManager.formatNumber(sender)}`);

    // Route Perintah
    switch (command) {
      // ==========================================
      // FITUR UMUM (MEMBER & ADMIN)
      // ==========================================
      case 's':
      case 'stiker':
      case 'sticker':
      case 'sc':
      case 'stickercrop': {
        const isCrop = command === 'sc' || command === 'stickercrop';
        await this.handleStickerCommand(sock, m, from, sender, isAdmin, query, isCrop);
        break;
      }

      case 'menu':
      case 'help': {
        await this.handleMenuCommand(sock, m, from, sender, isAdmin, isOwner, userRole);
        break;
      }

      case 'limit':
      case 'kuota': {
        await this.handleLimitCommand(sock, m, from, sender, userRole);
        break;
      }

      case 'ping': {
        const start = Date.now();
        await Humanizer.simulateTyping(sock, from, 800);
        const latency = Date.now() - start;
        await sock.sendMessage(from, { text: `🏓 Pong! Latensi bot: *${latency}ms*` }, { quoted: m });
        break;
      }

      // ==========================================
      // FITUR KHUSUS ADMIN & OWNER
      // ==========================================
      case 'addadmin': {
        await this.handleAddAdmin(sock, m, from, sender, isOwner, args);
        break;
      }

      case 'deladmin': {
        await this.handleDelAdmin(sock, m, from, sender, isOwner, args);
        break;
      }

      case 'listadmin':
      case 'adminlist': {
        await this.handleListAdmin(sock, m, from, sender, isAdmin);
        break;
      }

      case 'ban': {
        await this.handleBanUser(sock, m, from, sender, isAdmin, args);
        break;
      }

      case 'unban': {
        await this.handleUnbanUser(sock, m, from, sender, isAdmin, args);
        break;
      }

      case 'listban':
      case 'banlist': {
        await this.handleListBan(sock, m, from, sender, isAdmin);
        break;
      }

      case 'resetlimit': {
        await this.handleResetLimit(sock, m, from, sender, isAdmin, args);
        break;
      }

      case 'setlimit': {
        await this.handleSetLimit(sock, m, from, sender, isAdmin, args);
        break;
      }

      case 'setpack': {
        await this.handleSetPack(sock, m, from, sender, isAdmin, query);
        break;
      }

      case 'setauthor': {
        await this.handleSetAuthor(sock, m, from, sender, isAdmin, query);
        break;
      }

      case 'broadcast':
      case 'bc': {
        await this.handleBroadcast(sock, m, from, sender, isAdmin, query);
        break;
      }

      case 'stats':
      case 'botstatus': {
        await this.handleStats(sock, m, from, sender, isAdmin);
        break;
      }

      default:
        // Jangan merespon perintah asing untuk efisiensi
        break;
    }
  }

  /**
   * Ekstrak teks atau caption dari berbagai tipe pesan WhatsApp
   */
  static extractMessageText(m) {
    const msg = m.message;
    if (!msg) return '';

    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;

    return '';
  }

  /**
   * Ekstrak target nomor dari argumen teks atau dari pesan yang di-reply (quoted message)
   */
  static extractTargetJid(m, args) {
    // 1. Cek dari quoted message jika admin me-reply pesan target
    const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedParticipant) {
      return adminManager.cleanJid(quotedParticipant);
    }

    // 2. Cek dari argumen pertama (misal: .ban 6281234567890)
    if (args && args.length > 0 && args[0]) {
      const rawNum = args[0].replace(/[^0-9]/g, '');
      if (rawNum.length >= 8) {
        return adminManager.cleanJid(rawNum);
      }
    }

    return null;
  }

  // ==========================================
  // HANDLERS FITUR STIKER & UMUM
  // ==========================================

  static async handleStickerCommand(sock, m, from, sender, isAdmin, query, isCrop = false) {
    // Cek Rate Limit & Status Ban (Admin otomatis lolos)
    const check = rateLimiter.check(sender, isAdmin);
    if (!check.allowed) {
      if (check.reason === 'manual_banned') {
        return await sock.sendMessage(from, {
          text: `🚫 *Akses Diblokir!*\nNomor Anda telah diblokir oleh Admin bot.\n*Alasan:* _${check.banReason}_`
        }, { quoted: m });
      } else if (check.reason === 'cooldown') {
        return await sock.sendMessage(from, {
          text: `⏳ *Cooldown Anti-Spam (Member)*\nSilakan tunggu *${check.remainingSec} detik* lagi sebelum membuat stiker berikutnya.`
        }, { quoted: m });
      } else if (check.reason === 'quota_exceeded') {
        return await sock.sendMessage(from, {
          text: `❌ *Batas Kuota Harian Habis!*\nAnda telah menghabiskan jatah stiker gratis hari ini (${config.antiBan.dailyLimitPerUser} stiker/hari).\nKuota akan direset otomatis pukul 00:00 WIB.`
        }, { quoted: m });
      } else if (check.reason === 'spam_detected' || check.reason === 'soft_banned') {
        return await sock.sendMessage(from, {
          text: `⚠️ *Peringatan Spam!*\nAktivitas berlebih terdeteksi. Akun Anda dibatasi sementara selama *${Math.ceil(check.remainingSec / 60)} menit*.`
        }, { quoted: m });
      }
      return;
    }

    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = !!m.message?.imageMessage || !!quotedMsg?.imageMessage;
    const isVideo = !!m.message?.videoMessage || !!quotedMsg?.videoMessage;

    if (!isImage && !isVideo) {
      const customHint = isAdmin
        ? `\n\n_Kustomisasi Pack & Author (Khusus Admin):_\n*${config.prefix}s NamaPack | NamaPembuat*`
        : '';
      return await sock.sendMessage(from, {
        text: `📌 *Panduan Pembuatan Stiker:*\n\n1. Kirim foto/video dengan caption *${config.prefix}s*\n2. Atau *balas (reply)* foto/video yang ada dengan *${config.prefix}s*${customHint}\n\n_Untuk stiker crop persegi penuh:_ \n*${config.prefix}sc*`
      }, { quoted: m });
    }

    const videoMsg = m.message?.videoMessage || quotedMsg?.videoMessage;
    if (isVideo && videoMsg?.seconds && videoMsg.seconds > config.sticker.maxVideoDuration) {
      return await sock.sendMessage(from, {
        text: `⚠️ Durasi video terlalu panjang (${videoMsg.seconds}s)! Maksimal durasi stiker animasi adalah *${config.sticker.maxVideoDuration} detik*.`
      }, { quoted: m });
    }

    // Default metadata dari konfigurasi
    let packname = config.sticker.packname;
    let author = config.sticker.author;

    // HANYA ADMIN & OWNER YANG DIIZINKAN MENGUBAH PACKNAME & AUTHOR
    if (isAdmin && query) {
      if (query.includes('|')) {
        const parts = query.split('|').map(s => s.trim());
        if (parts[0]) packname = parts[0];
        if (parts[1]) author = parts[1];
      } else {
        packname = query.trim();
      }
    }

    try {
      // Jeda humanized delay
      await Humanizer.applyProcessingDelay();
      await Humanizer.simulateTyping(sock, from, 1500);

      logger.sticker(`Mengunduh media dari ${sender}...`);
      const targetMessage = quotedMsg ? { message: quotedMsg } : m;

      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: { level: 'silent' } }
      );

      if (!mediaBuffer || mediaBuffer.length === 0) {
        throw new Error('Gagal mengunduh buffer media.');
      }

      const mediaType = isImage ? 'image' : 'video';
      const stickerBuffer = await StickerService.createSticker(mediaBuffer, mediaType, {
        packname,
        author,
        crop: isCrop,
      });

      await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });

      rateLimiter.recordUsage(sender, isAdmin);
      incrementStickerCount();

      const userStats = rateLimiter.getStats(sender);
      logger.sticker(`Stiker terkirim ke ${sender}. Role: ${userStats.role}, Sisa kuota: ${userStats.remainingQuota}`);
    } catch (err) {
      logger.error('Error saat membuat stiker:', err);
      await sock.sendMessage(from, {
        text: `❌ Gagal memproses stiker: ${err.message || 'Terjadi kesalahan sistem.'}`
      }, { quoted: m });
    }
  }

  static async handleMenuCommand(sock, m, from, sender, isAdmin, isOwner, userRole) {
    await Humanizer.simulateTyping(sock, from, 1000);

    const stats = rateLimiter.getStats(sender);
    const roleBadge = isOwner ? '👑 Super Owner' : isAdmin ? '🛡️ Admin' : '👤 Member';

    let menuText = `✨ *${config.botName}* ✨\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Status Pengguna:*\n` +
      `• Nomor: *${adminManager.formatNumber(sender)}*\n` +
      `• Role: *${roleBadge}*\n` +
      `• Sisa Kuota: *${stats.remainingQuota}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Menu Member (Umum):*\n` +
      `• *${config.prefix}s* : Buat stiker dari foto/video (rasio asli)\n` +
      `• *${config.prefix}sc* : Buat stiker mode crop persegi 512x512\n` +
      `• *${config.prefix}limit* : Cek sisa kuota harian & jeda cooldown\n` +
      `• *${config.prefix}ping* : Periksa latensi server bot\n` +
      `• *${config.prefix}menu* : Menampilkan menu perintah ini\n`;

    // Jika pengguna adalah Admin atau Owner, tampilkan Menu Khusus Admin
    if (isAdmin) {
      menuText += `\n👑 *Panel Khusus Admin:*\n` +
        `• *${config.prefix}s Pack | Author* : Buat stiker dengan pack & author kustom\n` +
        `• *${config.prefix}ban <nomor/reply> [alasan]* : Blokir pengguna dari bot\n` +
        `• *${config.prefix}unban <nomor/reply>* : Buka blokir pengguna\n` +
        `• *${config.prefix}listban* : Lihat daftar pengguna yang diblokir\n` +
        `• *${config.prefix}resetlimit <nomor/reply>* : Reset kuota pengguna ke 0\n` +
        `• *${config.prefix}setlimit <nomor/reply> <jumlah>* : Beri kuota khusus\n` +
        `• *${config.prefix}setpack <nama>* : Ganti nama default pack stiker\n` +
        `• *${config.prefix}setauthor <nama>* : Ganti nama default author stiker\n` +
        `• *${config.prefix}broadcast <teks>* : Kirim pengumuman ke semua pengguna\n` +
        `• *${config.prefix}stats* : Informasi statistik sistem bot\n` +
        `• *${config.prefix}listadmin* : Daftar admin bot terdaftar\n`;

      if (isOwner) {
        menuText += `\n⭐ *Menu Super Owner:*\n` +
          `• *${config.prefix}addadmin <nomor>* : Tambah admin baru\n` +
          `• *${config.prefix}deladmin <nomor>* : Hapus admin yang ada\n`;
      }
    }

    menuText += `\n_Catatan: Kirim atau reply foto/video (maks. 9 detik) dengan perintah di atas._`;

    await sock.sendMessage(from, { text: menuText }, { quoted: m });
  }

  static async handleLimitCommand(sock, m, from, sender, userRole) {
    await Humanizer.simulateTyping(sock, from, 800);

    const stats = rateLimiter.getStats(sender);
    const roleBadge = stats.isAdmin ? `👑 ${userRole} (Bebas Batasan)` : `👤 Member`;

    const text = `📊 *Informasi Kuota Akun Anda*\n━━━━━━━━━━━━━━━━━━━━\n` +
      `• Nomor: *${adminManager.formatNumber(sender)}*\n` +
      `• Tingkat Akun: *${roleBadge}*\n` +
      `• Kuota Terpakai Hari Ini: *${stats.dailyUsage}*\n` +
      `• Sisa Kuota Stiker: *${stats.remainingQuota}*\n` +
      `• Jeda Anti-Spam (Cooldown): *${stats.isAdmin ? 'Tidak Ada' : `${config.antiBan.userCooldownSec} detik`}*\n` +
      `• Reset Kuota: *Setiap 00:00 WIB*\n━━━━━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(from, { text }, { quoted: m });
  }

  // ==========================================
  // HANDLERS PERINTAH KHUSUS ADMIN & OWNER
  // ==========================================

  static async handleAddAdmin(sock, m, from, sender, isOwner, args) {
    if (!isOwner) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Hanya Super Owner yang dapat menambah Admin baru!' }, { quoted: m });
    }

    const targetJid = this.extractTargetJid(m, args);
    if (!targetJid) {
      return await sock.sendMessage(from, { text: `⚠️ Format salah! Contoh penggunaan:\n*${config.prefix}addadmin 6281234567890*\natau balas (reply) pesan target dengan *${config.prefix}addadmin*` }, { quoted: m });
    }

    const result = adminManager.addAdmin(targetJid);
    await sock.sendMessage(from, { text: `${result.success ? '✅' : '❌'} ${result.message}` }, { quoted: m });
  }

  static async handleDelAdmin(sock, m, from, sender, isOwner, args) {
    if (!isOwner) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Hanya Super Owner yang dapat menghapus Admin!' }, { quoted: m });
    }

    const targetJid = this.extractTargetJid(m, args);
    if (!targetJid) {
      return await sock.sendMessage(from, { text: `⚠️ Format salah! Contoh penggunaan:\n*${config.prefix}deladmin 6281234567890*` }, { quoted: m });
    }

    const result = adminManager.removeAdmin(targetJid);
    await sock.sendMessage(from, { text: `${result.success ? '✅' : '❌'} ${result.message}` }, { quoted: m });
  }

  static async handleListAdmin(sock, m, from, sender, isAdmin) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const admins = adminManager.getAdminList();
    let text = `👑 *Daftar Admin & Owner Bot (${admins.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
    admins.forEach((adm, idx) => {
      text += `${idx + 1}. ${adm.role}: *${adm.formatted}*\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(from, { text }, { quoted: m });
  }

  static async handleBanUser(sock, m, from, sender, isAdmin, args) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const targetJid = this.extractTargetJid(m, args);
    if (!targetJid) {
      return await sock.sendMessage(from, { text: `⚠️ Format salah! Masukkan nomor atau balas pesan target:\n*${config.prefix}ban 6281234567890 Alasan spam*` }, { quoted: m });
    }

    if (adminManager.isAdmin(targetJid)) {
      return await sock.sendMessage(from, { text: '❌ Anda tidak dapat memblokir sesama Admin atau Owner!' }, { quoted: m });
    }

    // Ambil alasan dari sisa argumen jika ada
    const reason = args.slice(1).join(' ') || 'Melanggar aturan penggunaan bot.';
    rateLimiter.banUser(targetJid, reason);

    await sock.sendMessage(from, {
      text: `🚫 *Pengguna Berhasil Diblokir!*\n• Nomor: *${adminManager.formatNumber(targetJid)}*\n• Alasan: _${reason}_\n• Pelaksana: *${adminManager.formatNumber(sender)}*`
    }, { quoted: m });
  }

  static async handleUnbanUser(sock, m, from, sender, isAdmin, args) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const targetJid = this.extractTargetJid(m, args);
    if (!targetJid) {
      return await sock.sendMessage(from, { text: `⚠️ Format salah! Contoh: *${config.prefix}unban 6281234567890*` }, { quoted: m });
    }

    const success = rateLimiter.unbanUser(targetJid);
    if (success) {
      await sock.sendMessage(from, { text: `✅ Berhasil membuka blokir untuk pengguna *${adminManager.formatNumber(targetJid)}*.` }, { quoted: m });
    } else {
      await sock.sendMessage(from, { text: `⚠️ Nomor *${adminManager.formatNumber(targetJid)}* tidak ditemukan dalam daftar blokir.` }, { quoted: m });
    }
  }

  static async handleListBan(sock, m, from, sender, isAdmin) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const list = rateLimiter.getBannedList();
    if (list.length === 0) {
      return await sock.sendMessage(from, { text: 'ℹ️ Tidak ada pengguna yang sedang diblokir saat ini.' }, { quoted: m });
    }

    let text = `🚫 *Daftar Pengguna Diblokir (${list.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
    list.forEach((b, idx) => {
      text += `${idx + 1}. *${b.formatted}*\n   Alasan: _${b.reason}_\n   Batas: ${b.untilDate}\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(from, { text }, { quoted: m });
  }

  static async handleResetLimit(sock, m, from, sender, isAdmin, args) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const targetJid = this.extractTargetJid(m, args);
    if (!targetJid) {
      return await sock.sendMessage(from, { text: `⚠️ Format salah! Contoh: *${config.prefix}resetlimit 6281234567890*` }, { quoted: m });
    }

    rateLimiter.resetUserUsage(targetJid);
    await sock.sendMessage(from, { text: `✅ Berhasil mereset penggunaan kuota stiker untuk *${adminManager.formatNumber(targetJid)}* ke 0.` }, { quoted: m });
  }

  static async handleSetLimit(sock, m, from, sender, isAdmin, args) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const targetJid = this.extractTargetJid(m, args);
    // Cari nilai limit numerik dalam argumen
    const limitArg = args.find(a => /^[0-9]+$/.test(a) && a !== targetJid.replace(/[^0-9]/g, ''));

    if (!targetJid || !limitArg) {
      return await sock.sendMessage(from, { text: `⚠️ Format salah! Contoh:\n*${config.prefix}setlimit 6281234567890 100*\natau balas pesan pengguna dengan *${config.prefix}setlimit 100*` }, { quoted: m });
    }

    const newLimit = rateLimiter.setUserLimit(targetJid, limitArg);
    await sock.sendMessage(from, { text: `✅ Berhasil mengatur kuota harian *${adminManager.formatNumber(targetJid)}* menjadi *${newLimit} stiker/hari*.` }, { quoted: m });
  }

  static async handleSetPack(sock, m, from, sender, isAdmin, query) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    if (!query) {
      return await sock.sendMessage(from, { text: `⚠️ Masukkan nama pack baru! Contoh: *${config.prefix}setpack StikerKeren*` }, { quoted: m });
    }

    config.sticker.packname = query.trim();
    await sock.sendMessage(from, { text: `✅ Nama default sticker pack berhasil diubah menjadi: *"${config.sticker.packname}"*` }, { quoted: m });
  }

  static async handleSetAuthor(sock, m, from, sender, isAdmin, query) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    if (!query) {
      return await sock.sendMessage(from, { text: `⚠️ Masukkan nama pembuat baru! Contoh: *${config.prefix}setauthor Bot WhatsApp*` }, { quoted: m });
    }

    config.sticker.author = query.trim();
    await sock.sendMessage(from, { text: `✅ Nama default sticker author berhasil diubah menjadi: *"${config.sticker.author}"*` }, { quoted: m });
  }

  static async handleBroadcast(sock, m, from, sender, isAdmin, query) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    if (!query) {
      return await sock.sendMessage(from, { text: `⚠️ Masukkan pesan pengumuman! Contoh:\n*${config.prefix}bc Halo semua, server bot telah diperbarui.*` }, { quoted: m });
    }

    const activeUsers = rateLimiter.getActiveUsers();
    if (activeUsers.length === 0) {
      return await sock.sendMessage(from, { text: '⚠️ Belum ada riwayat nomor pengguna aktif yang tercatat.' }, { quoted: m });
    }

    await sock.sendMessage(from, { text: `📢 Memulai broadcast pengumuman ke *${activeUsers.length} pengguna aktif*...` }, { quoted: m });

    let sent = 0;
    let failed = 0;

    for (const targetJid of activeUsers) {
      try {
        // Terapkan jeda alami acak 1.5 - 2.5 detik per pesan agar WhatsApp tidak memblokir akun saat broadcast
        await Humanizer.sleep(Humanizer.randomBetween(1500, 2500));
        await sock.sendMessage(targetJid, {
          text: `📢 *PENGUMUMAN RESMI BOT*\n━━━━━━━━━━━━━━━━━━━━\n${query}\n━━━━━━━━━━━━━━━━━━━━\n_Dikirim oleh Admin: ${adminManager.formatNumber(sender)}_`
        });
        sent++;
      } catch (e) {
        failed++;
      }
    }

    await sock.sendMessage(from, { text: `✅ Broadcast Selesai!\n• Terkirim: *${sent}*\n• Gagal: *${failed}*` }, { quoted: m });
  }

  static async handleStats(sock, m, from, sender, isAdmin) {
    if (!isAdmin) {
      return await sock.sendMessage(from, { text: '❌ Akses Ditolak: Perintah ini hanya untuk Admin/Owner bot.' }, { quoted: m });
    }

    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const memUsageMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    const admins = adminManager.getAdminList();
    const banned = rateLimiter.getBannedList();
    const activeUsers = rateLimiter.getActiveUsers();

    const text = `📊 *STATISTIK SISTEM BOT*\n━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱️ *Masa Aktif (Uptime):* ${hours}j ${minutes}m ${seconds}d\n` +
      `💾 *Konsumsi RAM:* ${memUsageMB} MB\n` +
      `👑 *Total Admin:* ${admins.length} orang\n` +
      `👥 *Pengguna Aktif Tercatat:* ${activeUsers.length} nomor\n` +
      `🚫 *Pengguna Diblokir:* ${banned.length} nomor\n` +
      `🛡️ *Jeda Cooldown Member:* ${config.antiBan.userCooldownSec} detik\n` +
      `📦 *Kuota Default Member:* ${config.antiBan.dailyLimitPerUser} stiker/hari\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(from, { text }, { quoted: m });
  }
}

export default MessageHandler;
