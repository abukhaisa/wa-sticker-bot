import config from '../../config.js';
import logger from '../utils/logger.js';

export class Humanizer {
  /**
   * Tidur / jeda asinkron
   * @param {number} ms 
   */
  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Menghasilkan angka acak antara min dan max
   * @param {number} min 
   * @param {number} max 
   */
  static randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Simulasi jeda membaca (Read Receipt / Centang Biru)
   * Memberikan jeda alami sebelum menandai pesan telah dibaca
   * @param {import('@whiskeysockets/baileys').WASocket} sock 
   * @param {any} messageKey 
   */
  static async simulateReadReceipt(sock, messageKey) {
    if (!config.antiBan.autoReadMessages) return;

    try {
      const delay = this.randomBetween(
        config.antiBan.readDelayMinMs,
        config.antiBan.readDelayMaxMs
      );
      await this.sleep(delay);
      await sock.readMessages([messageKey]);
    } catch (err) {
      // Abaikan error read receipt jika terjadi disconnect
    }
  }

  /**
   * Simulasi mengetik (composing presence) seperti manusia
   * Menghindari pengiriman pesan instan yang memicu deteksi bot
   * @param {import('@whiskeysockets/baileys').WASocket} sock 
   * @param {string} jid 
   * @param {number} customDurationMs 
   */
  static async simulateTyping(sock, jid, customDurationMs = null) {
    if (!config.antiBan.simulateTyping) return;

    try {
      const typingDuration = customDurationMs || this.randomBetween(
        config.antiBan.minTypingMs,
        config.antiBan.maxTypingMs
      );

      // Mulai status mengetik
      await sock.sendPresenceUpdate('composing', jid);
      logger.antiBan(`Simulasi mengetik di ${jid} selama ${typingDuration}ms...`);
      await this.sleep(typingDuration);

      // Kembalikan ke status paused/available
      await sock.sendPresenceUpdate('paused', jid);
    } catch (err) {
      // Tangani error jika koneksi sedang tidak stabil
    }
  }

  /**
   * Jeda acak pra-eksekusi (Randomized processing delay)
   */
  static async applyProcessingDelay() {
    const delay = this.randomBetween(
      config.antiBan.minDelayMs,
      config.antiBan.maxDelayMs
    );
    logger.antiBan(`Menerapkan jeda acak: ${delay}ms`);
    await this.sleep(delay);
    return delay;
  }
}

export default Humanizer;
