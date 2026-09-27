import { pool } from '../db/client';
import { podeAcessarCarteiraDeOutros } from './carteiraAcesso';

/**
 * Resolve quais usuários um solicitante pode enxergar numa conta.
 *
 * Regra, igual em conta pessoal e conta empresa: o dono e as pessoas
 * vinculadas (membros da família ou colaboradores) PODEM compartilhar a mesma
 * carteira. O dono sempre pode; quem não é dono precisa da permissão
 * `acesso_lancamentos_familia`. Em ambos os casos a visão só amplia quando o
 * solicitante pede explicitamente (parâmetro `expandir`) — por padrão cada um
 * vê apenas o que cadastrou; a permissão habilita o pedido, não liga a
 * expansão sozinha.
 *
 * Retorna sempre uma lista que contém pelo menos o próprio solicitante — em
 * nenhum caminho de erro ela volta vazia ou aberta, para que uma falha aqui
 * restrinja o acesso em vez de ampliá-lo.
 */
/**
 * Colunas de `membro_permissoes` que ampliam a visibilidade dentro da conta.
 * Tipadas para que o nome nunca chegue como texto livre ate a query.
 */
export type FamilyScope = 'acesso_lancamentos_familia' | 'acesso_cartoes_familia';

/**
 * Base compartilhada: valida conta, vinculo e permissao, e devolve os usuarios
 * visiveis. Recebe qual permissao consultar em vez de existir uma copia por
 * recurso — duplicar isso seria duplicar codigo de seguranca.
 *
 * `expandir` e a intencao explicita do solicitante (ex.: selecionou "Familia"
 * na tela). Sem ela, a resposta e sempre so o proprio usuario — ter a
 * permissao nao basta para ampliar sozinho a visibilidade por padrao, so
 * habilita o solicitante a pedir a ampliacao quando quiser.
 */
async function resolveByScope(
  requesterId: number,
  accountId: number | null,
  scope: FamilyScope,
  expandir: boolean,
): Promise<number[]> {
  const sozinho = [requesterId];
  if (!expandir) return sozinho;
  if (!accountId) return sozinho;

  const conta = await pool.query(
    `SELECT usuario_id FROM contas WHERE id = $1`,
    [accountId],
  );
  const row = conta.rows[0] as { usuario_id: number } | undefined;
  if (!row) return sozinho;

  // O solicitante precisa pertencer à conta: ou é o dono, ou tem vínculo
  // ativo. Sem esta checagem, informar um conta_id alheio abriria a carteira
  // de outro usuário. Quem não é dono depende da permissão liberada pelo dono.
  const dono = row.usuario_id;
  const ehDono = requesterId === dono;
  let vinculoAtivo = false;
  let permissaoLiberada = false;
  if (!ehDono) {
    const vinculo = await pool.query(
      `SELECT 1 FROM conta_membros
        WHERE conta_id = $1 AND usuario_id = $2 AND status = 'ativo' LIMIT 1`,
      [accountId, requesterId],
    );
    vinculoAtivo = vinculo.rows.length > 0;

    if (vinculoAtivo) {
      // O nome da coluna vem do tipo FamilyScope, nunca de entrada do usuario.
      const perm = await pool.query(
        `SELECT ${scope} AS liberado FROM membro_permissoes WHERE usuario_id = $1`,
        [requesterId],
      );
      permissaoLiberada = (perm.rows[0] as { liberado: boolean } | undefined)?.liberado === true;
    }
  }

  if (!podeAcessarCarteiraDeOutros({ ehDono, vinculoAtivo, permissaoLiberada })) return sozinho;

  const membros = await pool.query(
    `SELECT usuario_id FROM conta_membros WHERE conta_id = $1 AND status = 'ativo'`,
    [accountId],
  );
  const ids = new Set<number>([dono, requesterId]);
  for (const m of membros.rows as { usuario_id: number }[]) ids.add(m.usuario_id);
  return [...ids];
}

/**
 * Usuarios cujos LANCAMENTOS o solicitante pode ver.
 *
 * `expandir` (default `false`) e quem decide se a familia inteira entra na
 * resposta — sem ela, mesmo com a permissao liberada, volta so o proprio
 * solicitante. Isso e o que faz a visao "so eu" ser sempre o padrao das
 * telas, e a visao "familia" uma escolha explicita do usuario.
 */
export function resolveVisibleUserIds(
  requesterId: number,
  accountId: number | null,
  expandir = false,
): Promise<number[]> {
  return resolveByScope(requesterId, accountId, 'acesso_lancamentos_familia', expandir);
}

/**
 * Dono de uma conta PESSOAL, para dados de CATALOGO da conta (categorias,
 * cartoes, etc.) — nunca copiados por membro, sempre gravados sob o
 * usuario_id do dono. Diferente de resolveVisibleUserIds: aqui nao ha
 * permissao nenhuma envolvida, porque nao expoe lancamentos de ninguem, so
 * diz a quem pertence o catalogo que a conta inteira compartilha. Um membro
 * sem nenhuma permissao de familia ainda precisa disto para categorizar e
 * ver o grafico dos proprios lancamentos.
 *
 * Retorna o proprio requesterId quando ele nao esta vinculado a conta
 * nenhuma (e dono de si mesmo) ou quando a conta e do tipo empresa (sem
 * compartilhamento de catalogo entre colaboradores).
 */
export async function resolveAccountOwnerId(requesterId: number, accountId: number | null): Promise<number> {
  if (!accountId) return requesterId;

  const conta = await pool.query(
    `SELECT tipo, usuario_id FROM contas WHERE id = $1`,
    [accountId],
  );
  const row = conta.rows[0] as { tipo: string; usuario_id: number } | undefined;
  if (!row || row.tipo !== 'pessoal') return requesterId;

  if (requesterId === row.usuario_id) return requesterId;

  const vinculo = await pool.query(
    `SELECT 1 FROM conta_membros
      WHERE conta_id = $1 AND usuario_id = $2 AND status = 'ativo' LIMIT 1`,
    [accountId, requesterId],
  );
  return vinculo.rows.length > 0 ? row.usuario_id : requesterId;
}

/**
 * Usuarios cujos CARTOES o solicitante pode ver e usar ao lancar.
 *
 * Permissao separada da de lancamentos: cartao e pessoal por natureza, e ver o
 * cartao de outro membro nao decorre de ver os lancamentos dele.
 *
 * Mesma regra de `expandir` de resolveVisibleUserIds: default `false`, so
 * amplia quando o solicitante pede explicitamente.
 */
export function resolveVisibleCardOwnerIds(
  requesterId: number,
  accountId: number | null,
  expandir = false,
): Promise<number[]> {
  return resolveByScope(requesterId, accountId, 'acesso_cartoes_familia', expandir);
}

/**
 * Diz se o solicitante pode alterar ou excluir um lançamento de outra pessoa
 * na mesma conta (pessoal ou empresa). O próprio autor sempre pode mexer no
 * que é dele — isso é verificado por quem chama, comparando o `usuario_id` do
 * registro.
 */
export async function canEditOthersEntries(requesterId: number, accountId: number | null): Promise<boolean> {
  if (!accountId) return false;

  const conta = await pool.query(`SELECT usuario_id FROM contas WHERE id = $1`, [accountId]);
  const row = conta.rows[0] as { usuario_id: number } | undefined;
  if (!row) return false;

  const ehDono = requesterId === row.usuario_id;
  let vinculoAtivo = false;
  let permissaoLiberada = false;
  if (!ehDono) {
    const vinculo = await pool.query(
      `SELECT 1 FROM conta_membros
        WHERE conta_id = $1 AND usuario_id = $2 AND status = 'ativo' LIMIT 1`,
      [accountId, requesterId],
    );
    vinculoAtivo = vinculo.rows.length > 0;

    if (vinculoAtivo) {
      const perm = await pool.query(
        `SELECT editar_lancamentos_familia FROM membro_permissoes WHERE usuario_id = $1`,
        [requesterId],
      );
      permissaoLiberada = (perm.rows[0] as { editar_lancamentos_familia: boolean } | undefined)
        ?.editar_lancamentos_familia === true;
    }
  }

  return podeAcessarCarteiraDeOutros({ ehDono, vinculoAtivo, permissaoLiberada });
}

/**
 * Guard para as rotas de escrita: diz se o solicitante pode alterar o registro.
 *
 * Retorna o id do dono quando permitido, ou null quando o registro nao existe
 * ou o solicitante nao pode toca-lo. As queries de escrita continuam filtrando
 * por `usuario_id` — aqui apenas se resolve QUAL usuario usar nesse filtro,
 * para nao reescrever as sete rotas de update/delete existentes.
 */
export async function resolveOwnerForWrite(
  tabela: 'despesas' | 'receitas',
  registroId: number,
  requesterId: number,
): Promise<number | null> {
  const reg = await pool.query(
    `SELECT usuario_id, conta_id FROM ${tabela} WHERE id = $1`,
    [registroId],
  );
  const row = reg.rows[0] as { usuario_id: number; conta_id: number | null } | undefined;
  if (!row) return null;

  // Caso comum: o registro e do proprio solicitante.
  if (row.usuario_id === requesterId) return requesterId;

  // Registro de outra pessoa: so passa com a permissao de editar a carteira
  // compartilhada, e apenas dentro da mesma conta.
  const pode = await canEditOthersEntries(requesterId, row.conta_id);
  return pode ? row.usuario_id : null;
}

/**
 * Diz se o usuario e membro vinculado ativo da conta pessoal de outra
 * pessoa (`conta_membros`). Um membro nunca deve ganhar conta ou catalogo
 * proprios — ele opera inteiramente dentro da conta do gestor ao qual esta
 * vinculado. Usado para impedir que rotinas como criacao automatica de
 * conta padrao ou reset de dados recriem uma conta "Pessoal" e categorias
 * soltas para quem ja e membro de outra conta.
 */
export async function isActiveFamilyMember(userId: number): Promise<boolean> {
  const vinculo = await pool.query(
    `SELECT 1 FROM conta_membros WHERE usuario_id = $1 AND status = 'ativo' LIMIT 1`,
    [userId],
  );
  return vinculo.rows.length > 0;
}

/**
 * Papel do usuario dentro da conta a que esta vinculado como membro ativo:
 * "member" em conta pessoal (familia), "collaborator" em conta empresa.
 * null quando nao e membro de ninguem (titular ou usuario independente).
 *
 * So para exibicao/rotulo (vai no JWT como conveniencia) — nunca usado para
 * decidir acesso a dado, que continua sempre validado contra o banco em
 * resolveByScope/canEditOthersEntries.
 */
export async function resolveMemberRole(userId: number): Promise<'member' | 'collaborator' | null> {
  const result = await pool.query(
    `SELECT c.tipo FROM conta_membros m
     JOIN contas c ON c.id = m.conta_id
     WHERE m.usuario_id = $1 AND m.status = 'ativo'
     LIMIT 1`,
    [userId],
  );
  const tipo = (result.rows[0] as { tipo: string } | undefined)?.tipo;
  if (!tipo) return null;
  return tipo === 'empresa' ? 'collaborator' : 'member';
}
