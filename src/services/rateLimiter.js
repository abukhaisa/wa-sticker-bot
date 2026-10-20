import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import logger from '../utils/logger.js';
import adminManager from './adminManager.js';

const DATA_DIR = path.resolve('./data');
const BANNED_FILE = path.join(DATA_DIR, 'banned.json');

class RateLimiter {
  constructor() {
    // Map untuk menyimpan data pengguna: { [userId]: UserData }
    this.users = new Map();
    // Set pengguna yang dibanned manual: { [userId]: { reason: string, bannedAt: number, until: number } }
    this.permanentBans = new Map();
    // Daftar semua pengguna aktif untuk fitur broadcast admin
    this.activeUsers = new Set();

    this.currentDate = this.getTodayDateString();

    this.init();

    // Rutinitas reset harian otomatis setiap 1 jam untuk mengecek pergantian hari
    setInterval(() => this.checkDailyReset(), 60 * 60 * 1000);
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(BANNED_FILE)) {
        const raw = fs.readFileSync(BANNED_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const [jid, banInfo] of Object.entries(data)) {
          this.permanentBans.set(jid, banInfo);
        }
      }
    } catch (err) {
      logger.error('Gagal memuat banned.json:', err.message);
    }
  }

  saveBannedToFile() {
    try {
      const obj = {};
      for (const [k, v] of this.permanentBans.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(BANNED_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Gagal menyimpan banned.json:', err.message);
    }
  }

  getTodayDateString() {
    return new Date().toISOString().split('T')[0];
  }

  checkDailyReset() {
    const today = this.getTodayDateString();
    if (today !== this.currentDate) {
      logger.antiBan(`Resetting kuota harian untuk semua pengguna (${today})`);
      this.currentDate = today;
      for (const [userId, data] of this.users.entries()) {
        data.dailyUsage = 0;
        data.lastReset = today;
      }
    }
  }

  /**
   * Mengambil atau membuat entri data user
   */
  getUserData(userId) {
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        lastCommandTime: 0,
        recentTimestamps: [],
        dailyUsage: 0,
        customLimit: null, // Jika admin memberikan limit khusus
        lastReset: this.getTodayDateString(),
        softBannedUntil: 0,
      });
    }

    // Catat ke daftar pengguna aktif
    this.activeUsers.add(userId);

    const data = this.users.get(userId);

    // Pastikan reset harian jika tanggal berubah
    const today = this.getTodayDateString();
    if (data.lastReset !== today) {
      data.dailyUsage = 0;
      data.lastReset = today;
    }

    return data;
  }

  /**
   * Cek kelayakan pengguna untuk mengeksekusi perintah
   * @param {string} userId - WhatsApp JID
   * @param {boolean} isAdmin - Apakah pengguna adalah Admin atau Owner
   * @returns {{ allowed: boolean, reason?: string, remainingSec?: number, remainingQuota?: number, banReason?: string }}
   */
  check(userId, isAdmin = false) {
    const now = Date.now();

    // 1. Cek Permanent Ban oleh Admin
    if (this.permanentBans.has(userId)) {
      const banInfo = this.permanentBans.get(userId);
      if (!banInfo.until || banInfo.until > now) {
        return {
          allowed: false,
          reason: 'manual_banned',
          banReason: banInfo.reason || 'Melanggar aturan penggunaan bot.',
        };
      } else {
        // Masa ban habis, hapus dari daftar
        this.permanentBans.delete(userId);
        this.saveBannedToFile();
      }
    }

    // 2. ADMIN & OWNER PRIVILEGE: Bebas dari limit kuota, cooldown, dan deteksi burst
    if (isAdmin) {
      return { allowed: true, remainingQuota: 999999 };
    }

    const data = this.getUserData(userId);

    // 3. Cek Temporary Soft-Ban (Spam Burst Tripwire)
    if (data.softBannedUntil > now) {
      const remainingBanSec = Math.ceil((data.softBannedUntil - now) / 1000);
      return {
        allowed: false,
        reason: 'soft_banned',
        remainingSec: remainingBanSec,
      };
    }

    // 4. Cek Burst Rate / Spam Flooding Member
    const windowStart = now - config.antiBan.burstLimit.windowSec * 1000;
    data.recentTimestamps = data.recentTimestamps.filter((t) => t > windowStart);
    data.recentTimestamps.push(now);

    if (data.recentTimestamps.length > config.antiBan.burstLimit.maxRequests) {
      const banDurationMs = config.antiBan.burstLimit.banDurationMin * 60 * 1000;
      data.softBannedUntil = now + banDurationMs;
      logger.warn(`Member ${userId} terdeteksi spamming! Dikenakan soft-ban ${config.antiBan.burstLimit.banDurationMin} menit.`);
      return {
        allowed: false,
        reason: 'spam_detected',
        remainingSec: config.antiBan.burstLimit.banDurationMin * 60,
      };
    }

    // 5. Cek Cooldown antar perintah untuk Member
    const cooldownMs = config.antiBan.userCooldownSec * 1000;
    const timeSinceLast = now - data.lastCommandTime;
    if (timeSinceLast < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - timeSinceLast) / 1000);
      return {
        allowed: false,
        reason: 'cooldown',
        remainingSec: waitSec,
      };
    }

    // 6. Cek Kuota Harian Member (Gunakan limit khusus jika diset admin)
    const effectiveLimit = data.customLimit !== null ? data.customLimit : config.antiBan.dailyLimitPerUser;
    if (data.dailyUsage >= effectiveLimit) {
      return {
        allowed: false,
        reason: 'quota_exceeded',
        remainingQuota: 0,
      };
    }

    const remainingQuota = effectiveLimit - data.dailyUsage;
    return {
      allowed: true,
      remainingQuota,
    };
  }

  /**
   * Catat penggunaan setelah perintah berhasil dieksekusi
   */
  recordUsage(userId, isAdmin = false) {
    if (isAdmin) return;
    const now = Date.now();
    const data = this.getUserData(userId);
    data.lastCommandTime = now;
    data.dailyUsage += 1;
  }

  // ==========================================
  // FITUR KHUSUS ADMIN (MANAGEMENT PENGGUNA)
  // ==========================================

  /**
   * Admin memblokir nomor member
   */
  banUser(userId, reason = 'Diblokir oleh Admin', durationHours = 0) {
    const cleanJid = adminManager.cleanJid(userId);
    const until = durationHours > 0 ? Date.now() + durationHours * 3600 * 1000 : 0; // 0 = permanen
    this.permanentBans.set(cleanJid, {
      reason,
      bannedAt: Date.now(),
      until,
    });
    this.saveBannedToFile();
    logger.antiBan(`User ${cleanJid} diblokir manual oleh Admin. Alasan: ${reason}`);
    return true;
  }

  /**
   * Admin membuka blokir nomor member
   */
  unbanUser(userId) {
    const cleanJid = adminManager.cleanJid(userId);
    if (!this.permanentBans.has(cleanJid)) {
      return false;
    }
    this.permanentBans.delete(cleanJid);
    this.saveBannedToFile();
    logger.antiBan(`User ${cleanJid} berhasil di-unban oleh Admin.`);
    return true;
  }

  /**
   * Dapatkan daftar pengguna yang dibanned
   */
  getBannedList() {
    return Array.from(this.permanentBans.entries()).map(([jid, info]) => ({
      jid,
      formatted: adminManager.formatNumber(jid),
      reason: info.reason,
      isPermanent: info.until === 0,
      untilDate: info.until ? new Date(info.until).toLocaleString('id-ID') : 'Permanen',
    }));
  }

  /**
   * Admin mereset penggunaan kuota hari ini untuk member tertentu
   */
  resetUserUsage(userId) {
    const cleanJid = adminManager.cleanJid(userId);
    const data = this.getUserData(cleanJid);
    data.dailyUsage = 0;
    data.softBannedUntil = 0;
    return true;
  }

  /**
   * Admin mengatur limit harian khusus untuk member tertentu
   */
  setUserLimit(userId, limit) {
    const cleanJid = adminManager.cleanJid(userId);
    const data = this.getUserData(cleanJid);
    data.customLimit = parseInt(limit, 10);
    return data.customLimit;
  }

  /**
   * Ambil status kuota dan role pengguna
   */
  getStats(userId) {
    const role = adminManager.getRole(userId);
    const isAdmin = role === 'Admin' || role === 'Super Owner';

    if (isAdmin) {
      return {
        role,
        isAdmin: true,
        dailyUsage: 0,
        dailyLimit: 'Tanpa Batas (Unlimited)',
        remainingQuota: 'Tanpa Batas',
        isBanned: false,
      };
    }

    const data = this.getUserData(userId);
    const effectiveLimit = data.customLimit !== null ? data.customLimit : config.antiBan.dailyLimitPerUser;
    const isManualBanned = this.permanentBans.has(userId);

    return {
      role: 'Member',
      isAdmin: false,
      dailyUsage: data.dailyUsage,
      dailyLimit: effectiveLimit,
      remainingQuota: Math.max(0, effectiveLimit - data.dailyUsage),
      isBanned: isManualBanned || data.softBannedUntil > Date.now(),
    };
  }

  /**
   * Ambil daftar semua pengguna aktif (untuk broadcast)
   */
  getActiveUsers() {
    return Array.from(this.activeUsers);
  }
}

export const rateLimiter = new RateLimiter();
export default rateLimiter;
