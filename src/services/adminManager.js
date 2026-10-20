import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import logger from '../utils/logger.js';

const DATA_DIR = path.resolve('./data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');

class AdminManager {
  constructor() {
    this.admins = new Set();
    this.owner = this.cleanJid(config.ownerNumber);
    this.init();
  }

  /**
   * Bersihkan nomor dan ubah ke format JID WhatsApp standar (misal: 628xxx@s.whatsapp.net)
   * @param {string} input 
   * @returns {string}
   */
  cleanJid(input) {
    if (!input) return '';
    let num = input.replace(/[^0-9]/g, '');
    // Konversi nomor lokal 08xx ke 628xx
    if (num.startsWith('08')) {
      num = '62' + num.slice(1);
    }
    return num + '@s.whatsapp.net';
  }

  /**
   * Format nomor untuk tampilan manusia (misal: +62 812-xxxx)
   * @param {string} jid 
   */
  formatNumber(jid) {
    const num = jid.split('@')[0];
    return `+${num}`;
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Pastikan owner selalu ada di daftar admin
      this.admins.add(this.owner);

      // Muat admin tambahan dari environment variable jika ada (pisahkan dengan koma)
      const envAdmins = process.env.ADMIN_NUMBERS || '';
      if (envAdmins) {
        envAdmins.split(',').forEach((num) => {
          const clean = this.cleanJid(num.trim());
          if (clean) this.admins.add(clean);
        });
      }

      // Muat dari file persistent jika sudah ada
      if (fs.existsSync(ADMINS_FILE)) {
        const fileContent = fs.readFileSync(ADMINS_FILE, 'utf-8');
        const savedAdmins = JSON.parse(fileContent);
        if (Array.isArray(savedAdmins)) {
          savedAdmins.forEach((jid) => this.admins.add(this.cleanJid(jid)));
        }
      }

      this.saveToFile();
      logger.info(`AdminManager aktif. Terdaftar ${this.admins.size} admin/owner.`);
    } catch (err) {
      logger.error('Gagal menginisialisasi AdminManager:', err.message);
    }
  }

  saveToFile() {
    try {
      const list = Array.from(this.admins);
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Gagal menyimpan file admins.json:', err.message);
    }
  }

  /**
   * Cek apakah nomor tersebut adalah Super Owner
   * @param {string} jidOrNumber 
   * @returns {boolean}
   */
  isOwner(jidOrNumber) {
    const clean = this.cleanJid(jidOrNumber);
    return clean === this.owner;
  }

  /**
   * Cek apakah nomor tersebut adalah Admin atau Owner
   * @param {string} jidOrNumber 
   * @returns {boolean}
   */
  isAdmin(jidOrNumber) {
    const clean = this.cleanJid(jidOrNumber);
    return this.isOwner(clean) || this.admins.has(clean);
  }

  /**
   * Tambahkan admin baru (Hanya bisa dipanggil Owner)
   * @param {string} numberStr 
   * @returns {{ success: boolean, message: string, jid?: string }}
   */
  addAdmin(numberStr) {
    const clean = this.cleanJid(numberStr);
    const numOnly = clean.replace(/[^0-9]/g, '');

    if (numOnly.length < 9 || numOnly.length > 16) {
      return { success: false, message: 'Format nomor tidak valid! Pastikan diawali 628 atau 08.' };
    }

    if (this.admins.has(clean)) {
      return { success: false, message: `Nomor ${this.formatNumber(clean)} sudah menjadi Admin sebelumnya.` };
    }

    this.admins.add(clean);
    this.saveToFile();
    logger.antiBan(`Admin baru ditambahkan: ${clean}`);
    return { success: true, message: `Berhasil menambahkan ${this.formatNumber(clean)} sebagai Admin bot.`, jid: clean };
  }

  /**
   * Hapus admin (Hanya bisa dipanggil Owner)
   * @param {string} numberStr 
   * @returns {{ success: boolean, message: string }}
   */
  removeAdmin(numberStr) {
    const clean = this.cleanJid(numberStr);

    if (clean === this.owner) {
      return { success: false, message: 'Nomor Super Owner utama tidak dapat dihapus!' };
    }

    if (!this.admins.has(clean)) {
      return { success: false, message: `Nomor ${this.formatNumber(clean)} bukan merupakan Admin.` };
    }

    this.admins.delete(clean);
    this.saveToFile();
    logger.antiBan(`Admin dihapus: ${clean}`);
    return { success: true, message: `Berhasil menghapus ${this.formatNumber(clean)} dari daftar Admin.` };
  }

  /**
   * Mengambil daftar semua admin terdaftar
   * @returns {Array<{ jid: string, formatted: string, role: string }>}
   */
  getAdminList() {
    return Array.from(this.admins).map((jid) => ({
      jid,
      formatted: this.formatNumber(jid),
      role: jid === this.owner ? '👑 Super Owner' : '🛡️ Admin',
    }));
  }

  /**
   * Dapatkan nama role pengguna
   * @param {string} jidOrNumber 
   * @returns {'Super Owner' | 'Admin' | 'Member'}
   */
  getRole(jidOrNumber) {
    const clean = this.cleanJid(jidOrNumber);
    if (clean === this.owner) return 'Super Owner';
    if (this.admins.has(clean)) return 'Admin';
    return 'Member';
  }
}

export const adminManager = new AdminManager();
export default adminManager;
