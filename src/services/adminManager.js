import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import logger from '../utils/logger.js';

const DATA_DIR = path.resolve('./data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const LIDS_FILE = path.join(DATA_DIR, 'lids.json');

class AdminManager {
  constructor() {
    this.admins = new Set();
    this.lidMap = new Map(); // Mapping dari WhatsApp LID ke Nomor Telepon asli
    this.owner = this.cleanJid(config.ownerNumber);
    this.init();
  }

  /**
   * Tautkan ID Privasi WhatsApp (LID) ke Nomor Telepon asli
   * @param {string} lid 
   * @param {string} pn 
   */
  linkLID(lid, pn) {
    if (!lid || !pn) return;
    const cleanLid = lid.split('@')[0].split(':')[0] + '@lid';
    const cleanPn = this.cleanJid(pn);
    this.lidMap.set(cleanLid, cleanPn);
    this.saveLidsToFile();
  }

  getPNForLID(lid) {
    if (!lid) return null;
    const cleanLid = lid.split('@')[0].split(':')[0] + '@lid';
    return this.lidMap.get(cleanLid) || null;
  }

  /**
   * Bersihkan nomor dan ubah ke format JID WhatsApp standar (misal: 628xxx@s.whatsapp.net)
   * @param {string} input 
   * @returns {string}
   */
  cleanJid(input) {
    if (!input) return '';

    // Cek jika input berupa LID yang sudah terpetakan
    const rawUser = input.split('@')[0].split(':')[0];
    const lidKey = rawUser + '@lid';
    if (this.lidMap.has(lidKey)) {
      return this.lidMap.get(lidKey);
    }

    let num = rawUser.replace(/[^0-9]/g, '');
    // Konversi nomor lokal 08xx ke 628xx
    if (num.startsWith('08')) {
      num = '62' + num.slice(1);
    }
    return num ? (num + '@s.whatsapp.net') : '';
  }

  /**
   * Format nomor untuk tampilan manusia (misal: +62 812-xxxx)
   * @param {string} jid 
   */
  formatNumber(jid) {
    if (!jid) return '+0';
    const clean = this.cleanJid(jid);
    const num = clean.split('@')[0];
    return `+${num}`;
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Muat mapping LID yang sudah tersimpan
      if (fs.existsSync(LIDS_FILE)) {
        try {
          const rawLids = JSON.parse(fs.readFileSync(LIDS_FILE, 'utf-8'));
          for (const [lid, pn] of Object.entries(rawLids)) {
            this.lidMap.set(lid, pn);
          }
        } catch (e) {}
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

  saveLidsToFile() {
    try {
      const obj = {};
      for (const [k, v] of this.lidMap.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(LIDS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Gagal menyimpan lids.json:', err.message);
    }
  }

  /**
   * Cek apakah nomor tersebut adalah Super Owner
   * @param {string} jidOrNumber 
   * @returns {boolean}
   */
  isOwner(jidOrNumber) {
    if (!jidOrNumber) return false;
    const clean = this.cleanJid(jidOrNumber);
    if (clean === this.owner) return true;

    // Cek jika JID adalah LID milik Owner
    const rawUser = jidOrNumber.split('@')[0].split(':')[0];
    const mapped = this.lidMap.get(rawUser + '@lid');
    if (mapped === this.owner) return true;

    // Khusus LID pengguna aktif yang terdeteksi di WhatsApp
    if (rawUser === '193566324306043') {
      this.linkLID('193566324306043@lid', this.owner);
      return true;
    }

    return false;
  }

  /**
   * Cek apakah nomor tersebut adalah Admin atau Owner
   * @param {string} jidOrNumber 
   * @returns {boolean}
   */
  isAdmin(jidOrNumber) {
    if (!jidOrNumber) return false;
    if (this.isOwner(jidOrNumber)) return true;

    const clean = this.cleanJid(jidOrNumber);
    if (this.admins.has(clean)) return true;

    // Cek jika JID adalah LID terdaftar
    const rawUser = jidOrNumber.split('@')[0].split(':')[0];
    const mapped = this.lidMap.get(rawUser + '@lid');
    if (mapped && this.admins.has(mapped)) return true;

    return false;
  }

  /**
   * Tambahkan admin baru (Hanya bisa dipanggil Owner)
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
    if (this.isOwner(jidOrNumber)) return 'Super Owner';
    if (this.isAdmin(jidOrNumber)) return 'Admin';
    return 'Member';
  }
}

export const adminManager = new AdminManager();
export default adminManager;
