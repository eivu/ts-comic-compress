import chalk from 'chalk';

export class Logger {
  error(message: string): void {
    console.error(chalk.red(`❌ ${message}`));
  }

  info(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }

  success(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
  }

  warn(message: string): void {
    console.warn(chalk.yellow(`⚠️  ${message}`));
  }

  log(message: string): void {
    console.log(message);
  }
}

