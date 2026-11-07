import * as dotenv from 'dotenv';

export function loadEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const path = env['DOTENV_CONFIG_PATH']?.trim();
  if (!path) return;
  const target: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) target[key] = value;
  }
  const result = dotenv.config({ path, processEnv: target });
  if (result.error) {
    throw new Error('Não foi possível carregar o arquivo indicado em DOTENV_CONFIG_PATH.');
  }
  for (const [key, value] of Object.entries(target)) {
    if (env[key] === undefined) env[key] = value;
  }
}
