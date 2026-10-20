# Gunakan image Node.js LTS berbasis Debian Slim
FROM node:20-bullseye-slim

# Install dependensi sistem: FFmpeg, WebP tools, dan Git
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    webp \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Tentukan direktori kerja aplikasi
WORKDIR /app

# Salin package.json dan install dependensi npm
COPY package*.json ./
RUN npm ci --omit=dev

# Salin seluruh kode proyek
COPY . .

# Set environment variable produksi
ENV NODE_ENV=production
ENV SYSTEM_FFMPEG=/usr/bin/ffmpeg
ENV PORT=3000

# Expose port web dashboard keep-alive
EXPOSE 3000

# Jalankan bot
CMD ["npm", "start"]
