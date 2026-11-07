import { config } from 'dotenv';

export function loadEnvironment(): void {
  const envFile = process.env.DOTENV_CONFIG_PATH;
  if (envFile) {
    const result = config({ path: envFile });
    if (result.error) {
      throw new Error('Could not load the explicitly selected environment file');
    }
  }
}
