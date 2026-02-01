import winston from 'winston';
import chalk from 'chalk';

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  const icons: Record<string, string> = {
    error: '❌',
    warn: '⚠️',
    info: '✅',
    debug: '🔍',
  };
  const icon = icons[level] || '';
  return `${icon} ${message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Convenience methods with chalk colors
export const log = {
  info: (msg: string) => console.log(chalk.blue(msg)),
  success: (msg: string) => console.log(chalk.green(`✅ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  error: (msg: string) => console.error(chalk.red(`❌ ${msg}`)),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.log(chalk.gray(`🔍 ${msg}`));
  },
  step: (msg: string) => console.log(chalk.cyan(`→ ${msg}`)),
  dim: (msg: string) => console.log(chalk.gray(msg)),
};
