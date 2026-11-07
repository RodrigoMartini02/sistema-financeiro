// Cria as categorias padrão de empresa para perfis PJ que já existiam antes
// da correção do modelo padrão-vs-custom (commit 14cea16) e nunca as
// receberam. Idempotente via ensureDefaultCategories (ON CONFLICT DO NOTHING).
// A partir de apps/finance/api, com DOTENV_CONFIG_PATH explícito quando necessário:
// npx tsx scripts/backfill-empresa-categories.ts
import { loadEnvironment } from '../src/config/environment';

async function run() {
  loadEnvironment();
  const [{ pool }, { ensureDefaultCategories }] = await Promise.all([
    import('../src/db/client.js'),
    import('../src/services/defaultCategories.js'),
  ]);
  try {
    const { rows } = await pool.query<{ usuario_id: number }>(`
      SELECT DISTINCT p.usuario_id
      FROM perfis p
      WHERE p.tipo = 'empresa' AND p.ativo = true
        AND NOT EXISTS (
          SELECT 1 FROM categorias c
          WHERE c.usuario_id = p.usuario_id AND c.tipo = 'empresa'
        )
    `);

    console.log(`${rows.length} usuário(s) com perfil PJ ativo sem categorias padrão de empresa.`);

    for (const { usuario_id: userId } of rows) {
      await ensureDefaultCategories(userId, 'empresa');
      console.log(`  usuario_id=${userId}: categorias padrão de empresa criadas.`);
    }

    console.log('Concluído.');
  } finally {
    await pool.end();
  }
}

run()
  .catch((err) => {
    console.error('Falha no backfill:', err);
    process.exitCode = 1;
  });
