import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import config from '../../config.js';
import logger from '../utils/logger.js';

import { execSync } from 'child_process';

// Setup path FFmpeg (otomatis deteksi sistem di Termux/Linux atau fallback ke package installer)
let resolvedFfmpeg = null;

try {
  // 1. Cek apakah ffmpeg sudah terpasang di sistem (seperti di Termux: pkg install ffmpeg)
  execSync('ffmpeg -version', { stdio: 'ignore' });
  resolvedFfmpeg = 'ffmpeg';
  logger.info('FFmpeg sistem terdeteksi di PATH.');
} catch (e) {
  // 2. Jika tidak ada di PATH, gunakan @ffmpeg-installer
  try {
    const binaryPath = process.env.SYSTEM_FFMPEG || ffmpegInstaller.path;
    if (binaryPath) {
      if (process.platform === 'linux' && fs.existsSync(binaryPath)) {
        try { fs.chmodSync(binaryPath, 0o755); } catch (err) {}
      }
      resolvedFfmpeg = binaryPath;
    }
  } catch (err) {}
}

if (resolvedFfmpeg) {
  ffmpeg.setFfmpegPath(resolvedFfmpeg);
  process.env.FFMPEG_PATH = resolvedFfmpeg;
  logger.info(`FFmpeg diinisialisasi pada: ${resolvedFfmpeg}`);
} else {
  logger.warn('FFmpeg tidak ditemukan! Pastikan FFmpeg terinstall di sistem.');
}

export class StickerService {
  /**
   * Membuat stiker statis atau bergerak dari buffer media
   * @param {Buffer} mediaBuffer - Buffer gambar atau video
   * @param {'image' | 'video'} mediaType - Tipe media
   * @param {object} options - Opsi stiker (packname, author, type)
   * @returns {Promise<Buffer>} - Buffer WebP stiker dengan EXIF
   */
  static async createSticker(mediaBuffer, mediaType, options = {}) {
    const packname = options.packname || config.sticker.packname;
    const author = options.author || config.sticker.author;
    const cropType = options.crop ? StickerTypes.CROPPED : StickerTypes.FULL;

    logger.sticker(`Memproses pembuatan stiker [Tipe: ${mediaType}, Mode: ${cropType}]...`);

    if (mediaType === 'image') {
      return await this.processImage(mediaBuffer, {
        packname,
        author,
        cropType,
        quality: options.quality || config.sticker.quality,
      });
    } else if (mediaType === 'video') {
      return await this.processVideo(mediaBuffer, {
        packname,
        author,
        cropType,
        quality: options.quality || 45, // Kualitas lebih rendah untuk video agar < 1MB
      });
    } else {
      throw new Error(`Tipe media '${mediaType}' tidak didukung untuk stiker.`);
    }
  }

  /**
   * Proses gambar menjadi stiker WebP dengan EXIF
   */
  static async processImage(buffer, { packname, author, cropType, quality }) {
    try {
      const sticker = new Sticker(buffer, {
        pack: packname,
        author: author,
        type: cropType,
        categories: config.sticker.categories,
        id: `sticker_${Date.now()}`,
        quality: quality || config.sticker.quality,
        background: 'transparent',
      });

      return await sticker.toBuffer();
    } catch (err) {
      logger.error('Gagal membuat stiker gambar:', err.message);
      throw new Error(`Gagal mengonversi gambar ke stiker: ${err.message}`);
    }
  }

  /**
   * Proses video/GIF menjadi stiker bergerak (Animated WebP)
   * Dilengkapi kompresi FFmpeg dan pemotongan durasi otomatis agar ukuran file < 1MB
   */
  static async processVideo(buffer, { packname, author, cropType, quality }) {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.webp`);

    try {
      // Simpan buffer video sementara
      await fs.promises.writeFile(inputPath, buffer);

      // Konversi video ke animated webp menggunakan FFmpeg
      // Ukuran 512x512 dengan padding transparan, fps 12-15, durasi maks 8 detik
      const maxDuration = config.sticker.maxVideoDuration;
      await new Promise((resolve, reject) => {
        const ff = ffmpeg(inputPath)
          .inputOptions(['-y'])
          .outputOptions([
            `-t ${maxDuration}`, // Batasi durasi video maksimal
            '-vcodec libwebp',
            '-filter:v',
            cropType === StickerTypes.CROPPED
              ? 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=12'
              : 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=12',
            '-lossless 0',
            `-q:v ${quality || 40}`,
            '-preset default',
            '-loop 0',
            '-an',
            '-s 512:512',
          ])
          .toFormat('webp')
          .save(outputPath);

        ff.on('end', () => resolve(true));
        ff.on('error', (err) => reject(err));
      });

      const rawWebpBuffer = await fs.promises.readFile(outputPath);

      // Sisipkan EXIF metadata (Packname & Author) ke file WebP hasil FFmpeg
      const sticker = new Sticker(rawWebpBuffer, {
        pack: packname,
        author: author,
        type: StickerTypes.DEFAULT,
        categories: config.sticker.categories,
        id: `asticker_${Date.now()}`,
        quality: 50,
      });

      const finalStickerBuffer = await sticker.toBuffer();

      // Cek batas ukuran WhatsApp (1024 KB / 1 MB)
      if (finalStickerBuffer.length > 1024 * 1024) {
        logger.warn(`Ukuran stiker bergerak (${(finalStickerBuffer.length / 1024).toFixed(1)} KB) melebihi batas 1MB WhatsApp.`);
      }

      return finalStickerBuffer;
    } catch (err) {
      logger.error('Gagal mengonversi video ke stiker bergerak:', err.message);
      // Fallback menggunakan wa-sticker-formatter langsung jika FFmpeg custom pipeline gagal
      try {
        logger.info('Mencoba fallback langsung via Sticker formatter...');
        const fallbackSticker = new Sticker(buffer, {
          pack: packname,
          author: author,
          type: cropType,
          quality: 35,
        });
        return await fallbackSticker.toBuffer();
      } catch (fallbackErr) {
        throw new Error(`Konversi video gagal: ${err.message}`);
      }
    } finally {
      // Bersihkan file sementara
      try {
        if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
        if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
      } catch (e) {
        // Abaikan error cleanup
      }
    }
  }
}

export default StickerService;
