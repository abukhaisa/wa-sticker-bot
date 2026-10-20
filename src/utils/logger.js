/**
 * Formatted Logger with timestamp and color codes
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const getTimestamp = () => {
  return new Date().toLocaleTimeString('id-ID', { hour12: false });
};

export const logger = {
  info: (msg, ...args) => {
    console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.green}[INFO]${colors.reset} ${msg}`, ...args);
  },
  warn: (msg, ...args) => {
    console.warn(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${msg}`, ...args);
  },
  error: (msg, ...args) => {
    console.error(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${msg}`, ...args);
  },
  antiBan: (msg, ...args) => {
    console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.magenta}[ANTI-BAN]${colors.reset} ${msg}`, ...args);
  },
  sticker: (msg, ...args) => {
    console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.cyan}[STICKER]${colors.reset} ${msg}`, ...args);
  },
};

export default logger;
