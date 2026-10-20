# 🤖 WhatsApp Sticker Generator Bot (Baileys)

Bot WhatsApp canggih berbasis **Node.js** dan library **@whiskeysockets/baileys** terbaru, dirancang khusus untuk membuat **Stiker Statis** (dari gambar) dan **Stiker Bergerak / Animasi** (dari video/GIF) dengan metadata EXIF kustom.

Bot ini telah dilengkapi arsitektur **Anti-Banned Tingkat Lanjut (Humanized Behavior)** serta server **Keep-Alive 24 Jam Non-Stop** dengan dashboard web status dan scanner QR browser.

---

## 🌟 Fitur Utama

### 1. Generator Stiker Fleksibel
- **Gambar ke Stiker (Statis):** Mengubah format JPG/PNG/WebP menjadi stiker rasio penuh tanpa terpotong (full transparent padding) atau mode crop (`.sc`).
- **Video/GIF ke Stiker Bergerak (Animated):** Otomatis mengonversi video (MP4/WebM/GIF) menjadi stiker animasi WebP 512x512 dengan kompresi FFmpeg cerdas agar ukuran file tetap **di bawah 1MB** (batas mutlak WhatsApp).
- **Kustomisasi EXIF Metadata:** Pengguna dapat menentukan nama *Packname* dan *Author* langsung via pesan (misal: `.s MyPack | MyAuthor`).
- **Mendukung Direct & Quoted Media:** Bisa langsung kirim media dengan caption `.s` atau me-reply media yang sudah dikirim sebelumnya.

### 2. Sistem Anti-Banned Tingkat Lanjut
WhatsApp sangat ketat mendeteksi bot melalui kecepatan respon yang tidak wajar dan pola aktivitas mesin. Bot ini menerapkan beberapa lapis proteksi:
1. **Jeda Waktu Acak (Randomized Delay):** Respon bot sengaja ditunda secara acak (*1.5 - 3.5 detik* ditambah variasi pemrosesan) agar tidak memicu deteksi pola otomasi instan WhatsApp.
2. **Simulasi Aktivitas Manusiawi (Humanizer Engine):**
   - **Simulasi Centang Biru (Read Receipt):** Pesan tidak langsung ditandai terbaca dalam 0 milidetik, melainkan diberi jeda seperti manusia membuka chat.
   - **Simulasi Mengetik (Composing State):** Bot mengirimkan status `typing...` ke chat selama durasi alami sebelum stiker dikirimkan.
   - **Emulasi User-Agent Resmi:** Menggunakan identifikasi browser desktop resmi (`Ubuntu / Chrome`) bukan identifikasi default Baileys yang mudah difilter WhatsApp.
3. **Rate Limiting & Anti-Spam Cooldown:**
   - **Jeda Antar Perintah (Cooldown):** Setiap pengguna wajib menunggu jeda waktu (default: *6 detik*) sebelum bisa memicu stiker berikutnya.
   - **Burst Flood Protection:** Jika pengguna mengirim lebih dari 4 perintah dalam 15 detik, bot akan memberlakukan soft-ban otomatis selama 5 menit.
   - **Pembatasan Kuota Harian (Daily Quota):** Membatasi kuota stiker gratis per pengguna (default: *40 stiker/hari*), direset otomatis setiap pukul 00:00 WIB. Pemilik (Owner) bebas kuota.

### 3. Keep-Alive & Cloud 24/7 Ready
- **Express Web Dashboard:** Menampilkan metrik bot secara real-time (Uptime, RAM, Total Stiker Dibuat, Status Online).
- **Web QR Scanner (`/qr`):** Menampilkan QR Code langsung di browser, mempermudah deployment di platform cloud (Railway/Render) tanpa masalah terminal yang terpotong.
- **Health Check Endpoint (`/health`):** Siap dihubungkan ke Uptime monitoring (UptimeRobot, BetterUptime) atau cron untuk mencegah server sleep.

---

## 📁 Struktur Direktori

```text
wa-sticker-bot/
├── config.js                 # Konfigurasi bot (prefix, anti-ban, kuota, delay)
├── .env.example              # Template variabel lingkungan
├── Dockerfile                # Dockerfile produksi (FFmpeg & WebP)
├── docker-compose.yml        # Docker compose dengan volume sesi
├── Procfile                  # Untuk PaaS (Heroku/Railway/Render)
├── package.json              # Konfigurasi dependensi npm
└── src/
    ├── index.js              # Entry point bot & koneksi Baileys
    ├── keepAlive.js          # Web server status, QR viewer & health check
    ├── handlers/
    │   └── messageHandler.js # Router pesan, validasi perintah & eksekusi stiker
    ├── services/
    │   ├── stickerService.js # Pipeline konversi FFmpeg & injeksi EXIF
    │   ├── humanizer.js      # Delay acak, simulasi mengetik & read receipt
    │   └── rateLimiter.js    # Cooldown, anti-burst & kuota harian
    └── utils/
        └── logger.js         # Logging konsol berwarna
```

---

## 🚀 Panduan Menjalankan di Komputer Lokal

### Prasyarat
- **Node.js:** Versi 20 atau yang lebih baru.
- **Git** (opsional).

### Langkah-langkah
1. Buka terminal di folder proyek:
   ```bash
   cd wa-sticker-bot
   ```
2. Instal seluruh dependensi:
   ```bash
   npm install
   ```
3. Salin file konfigurasi lingkungan:
   ```bash
   cp .env.example .env
   ```
   *(Di Windows PowerShell: `copy .env.example .env`)*
4. Buka file `.env` dan sesuaikan nomor `OWNER_NUMBER` dengan nomor WhatsApp Anda (format: `628xxxxxxxxxx`).
5. Jalankan bot:
   ```bash
   npm start
   ```
6. Pindai kode QR yang muncul di terminal menggunakan aplikasi WhatsApp Anda (**Perangkat Tertaut > Tautkan Perangkat**).
7. Anda juga dapat membuka dashboard dan memindai QR melalui browser di: `http://localhost:3000/qr`.

---

## 🌐 Panduan Deployment ke VPS (Ubuntu / Debian)

VPS adalah solusi terbaik agar bot aktif 24 jam non-stop dengan performa stabil dan tidak terkena sleep.

### 1. Persiapan Server VPS
Hubungkan ke VPS via SSH, lalu perbarui repositori dan instal dependensi sistem:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ffmpeg webp
```

### 2. Instal Node.js 20 LTS & PM2
```bash
# Instal Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instal PM2 (Process Manager) secara global
sudo npm install -g pm2
```

### 3. Unggah / Clone Proyek ke VPS
```bash
git clone <URL_REPOSITORY_ANDA> /var/www/wa-sticker-bot
cd /var/www/wa-sticker-bot
npm install --omit=dev
cp .env.example .env
nano .env   # Sesuaikan OWNER_NUMBER dan konfigurasi lainnya
```

### 4. Menjalankan Bot dengan PM2 (Auto Restart & Keep-Alive)
```bash
# Jalankan bot dengan PM2
pm2 start src/index.js --name "wa-sticker-bot"

# Konfigurasikan auto-start saat VPS di-reboot
pm2 startup
# (Jalankan perintah sudo yang muncul di layar terminal jika ada)
pm2 save
```

### 5. Memindai QR Code
Untuk melihat QR Code di terminal VPS:
```bash
pm2 logs wa-sticker-bot --lines 100
```
Atau akses melalui browser:
```
http://IP_VPS_ANDA:3000/qr
```

---

## ☁️ Panduan Deployment ke Cloud (Railway / Render)

### A. Deployment di Railway (Sangat Direkomendasikan)
Railway otomatis mendeteksi `Dockerfile` yang ada di proyek ini.

1. Buka [Railway.app](https://railway.app/) dan login dengan GitHub.
2. Klik **New Project** > **Deploy from GitHub repo** > Pilih repositori bot Anda.
3. Di tab **Variables**, tambahkan variabel dari `.env`:
   - `BOT_NAME` = `StickerCraft Bot`
   - `OWNER_NUMBER` = `628xxxxxxxxxx`
   - `PORT` = `3000`
4. **PENTING (Persistensi Sesi):** Di menu **Volumes**, buat volume baru dan pasang (*mount*) ke path `/app/auth_info`. Ini memastikan Anda tidak perlu scan QR ulang setiap kali container dideploy ulang!
5. Buka domain publik yang diberikan oleh Railway (contoh: `https://wa-bot-production.up.railway.app/qr`) untuk memindai QR Code.

---

### B. Deployment di Render

1. Buka [Render.com](https://render.com/) dan buat **New Web Service**.
2. Hubungkan ke repositori GitHub bot Anda.
3. Pilih **Environment: Docker**.
4. Tambahkan Environment Variable (`OWNER_NUMBER`, `BOT_NAME`, `PORT`).
5. Klik **Create Web Service**.

#### Mencegah Sleep di Render Free Tier (Keep-Alive 24 Jam):
Render free tier akan tertidur (*spin down*) jika tidak ada trafik HTTP selama 15 menit. Untuk mengatasinya:
1. Salin URL publik Render bot Anda (misal `https://wa-sticker-bot.onrender.com`).
2. Masukkan ke file `.env` atau Render Environment Variables:
   ```env
   SELF_PING_URL="https://wa-sticker-bot.onrender.com"
   ```
   Bot akan otomatis melakukan self-ping ke endpoint `/health` setiap 10 menit!
3. Atau daftarkan URL `https://wa-sticker-bot.onrender.com/health` di layanan gratis seperti [UptimeRobot](https://uptimerobot.com/) atau [Cron-Job.org](https://cron-job.org/) dengan interval 5 - 10 menit.

---

## 📖 Daftar Perintah Bot

### 👤 Perintah Khusus Member (Umum)
| Perintah | Deskripsi |
| :--- | :--- |
| `.s` / `.sticker` | Mengubah foto atau video menjadi stiker (rasio asli dengan padding transparan). |
| `.sc` / `.stickercrop` | Mengubah foto menjadi stiker mode crop persegi 512x512. |
| `.s Pack \| Author` | Membuat stiker dengan nama pack dan author kustom. |
| `.limit` / `.kuota` | Mengecek sisa kuota stiker gratis hari ini dan status cooldown. |
| `.ping` | Mengecek latensi dan responsivitas server bot. |
| `.help` / `.menu` | Menampilkan panduan dan menu perintah member. |

### 👑 Perintah Khusus Admin & Super Owner
| Perintah | Otoritas | Deskripsi |
| :--- | :--- | :--- |
| `.addadmin <nomor>` | Super Owner | Menambahkan admin baru berdasarkan nomor WhatsApp. |
| `.deladmin <nomor>` | Super Owner | Menghapus admin dari daftar. |
| `.listadmin` | Admin & Owner | Menampilkan daftar seluruh admin terdaftar. |
| `.ban <nomor/reply> [alasan]` | Admin & Owner | Memblokir nomor pengguna dari akses bot. |
| `.unban <nomor/reply>` | Admin & Owner | Membuka blokir nomor pengguna. |
| `.listban` | Admin & Owner | Menampilkan daftar seluruh pengguna yang diblokir. |
| `.resetlimit <nomor/reply>` | Admin & Owner | Mereset penggunaan kuota stiker harian pengguna ke 0. |
| `.setlimit <nomor/reply> <qty>` | Admin & Owner | Memberikan kuota harian khusus kepada nomor tertentu. |
| `.setpack <nama>` | Admin & Owner | Mengganti nama default pack stiker secara dinamis. |
| `.setauthor <nama>` | Admin & Owner | Mengganti nama default pembuat/author stiker secara dinamis. |
| `.broadcast` / `.bc <teks>` | Admin & Owner | Mengirim pesan pengumuman ke seluruh pengguna aktif (dengan anti-spam delay). |
| `.stats` / `.botstatus` | Admin & Owner | Melihat statistik server, RAM, uptime, dan pengguna aktif. |

---

## 🔒 Tips Tambahan Menghindari Pemblokiran WhatsApp
1. **Gunakan Nomor Cadangan:** Jangan pernah menggunakan nomor pribadi utama saat pertama kali mengoperasikan bot.
2. **Nomor yang Sudah Aktif:** Hindari menggunakan nomor kartu perdana baru yang belum pernah memiliki riwayat chat alami. Nomor dengan usia akun > 1-2 bulan jauh lebih tahan terhadap sistem anti-spam.
3. **Jangan Ubah Jeda Terlalu Ekstrem:** Jeda acak 1.5 - 3.5 detik yang telah disediakan dalam `config.js` adalah ambang batas aman untuk menghindari deteksi instan sistem proteksi WhatsApp.
