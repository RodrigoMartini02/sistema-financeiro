// Cria as categorias padrão de empresa para perfis PJ que já existiam antes
// da correção do modelo padrão-vs-custom (commit 14cea16) e nunca as
// receberam. Idempotente via ensureDefaultCategories (ON CONFLICT DO NOTHING).
// Rode: npx tsx backend/scripts/backfill-empresa-categories.ts
import { pool } from '../src/db/client';
import { ensureDefaultCategories } from '../src/services/defaultCategories';

async function run() {
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
}

run()
  .catch((err) => {
    console.error('Falha no backfill:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
