import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  execSync('npm run build', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}
