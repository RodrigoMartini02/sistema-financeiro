import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { assistantFlows } from '../db/schema';
import { AssistantFlowEngine } from './assistantFlowEngine';
import { DEFAULT_FLOW_DEFINITION } from './assistantFlowDefault';
import { parseFlowDefinition, type FlowDefinition } from './assistantFlowSchema';

/**
 * Carrega o fluxo ativo e o entrega como motor pronto para uso.
 *
 * Tres protecoes, porque este caminho fica entre o usuario e a conversa:
 * - tabela ausente (migration nao aplicada) cai no fluxo padrao
 * - definicao corrompida cai no fluxo padrao, com o erro no log
 * - resultado em cache, para nao consultar o banco a cada pergunta
 *
 * Em nenhuma hipotese uma falha aqui pode deixar o assistente sem responder:
 * o padrao e sempre melhor que um erro na cara do usuario.
 */

const FLOW_NAME_PADRAO = 'Fluxo padrão';

function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
}

interface CachedFlow {
  engine: AssistantFlowEngine;
  versao: number;
  id: number | null;
}

let cache: CachedFlow | null = null;

/** Chamado apos gravar: a proxima pergunta ja usa o fluxo novo. */
export function invalidateFlowCache(): void {
  cache = null;
}

function defaultEngine(): CachedFlow {
  return { engine: new AssistantFlowEngine(DEFAULT_FLOW_DEFINITION), versao: 0, id: null };
}

/**
 * Insere o fluxo padrao na primeira vez que alguem pede o fluxo ativo.
 *
 * Semear aqui, e nao na migration, evita manter o mesmo JSON em dois lugares:
 * assistantFlowDefault.ts continua sendo a unica definicao do padrao.
 */
async function seedDefaultFlow(): Promise<CachedFlow> {
  try {
    const [criado] = await db
      .insert(assistantFlows)
      .values({
        nome: FLOW_NAME_PADRAO,
        definicao: DEFAULT_FLOW_DEFINITION,
        ativo: true,
        versao: 1,
      })
      .returning({ id: assistantFlows.id, versao: assistantFlows.versao });

    return {
      engine: new AssistantFlowEngine(DEFAULT_FLOW_DEFINITION),
      versao: criado?.versao ?? 1,
      id: criado?.id ?? null,
    };
  } catch (error) {
    if (isMissingTableError(error)) return defaultEngine();
    console.error('Falha ao semear o fluxo padrão do assistente:', (error as Error).message);
    return defaultEngine();
  }
}

async function loadActiveFlowRow(): Promise<CachedFlow> {
  try {
    const [row] = await db
      .select({
        id: assistantFlows.id,
        definicao: assistantFlows.definicao,
        versao: assistantFlows.versao,
      })
      .from(assistantFlows)
      .where(eq(assistantFlows.ativo, true))
      .orderBy(desc(assistantFlows.dataAtualizacao))
      .limit(1);

    if (!row) return seedDefaultFlow();

    try {
      const definicao = parseFlowDefinition(row.definicao);
      return { engine: new AssistantFlowEngine(definicao), versao: row.versao, id: row.id };
    } catch (error) {
      // Fluxo gravado invalido nao pode travar a conversa — o log diz o que
      // aconteceu e o assistente segue com o padrao.
      console.error('Fluxo do assistente inválido, usando o padrão:', (error as Error).message);
      return defaultEngine();
    }
  } catch (error) {
    if (isMissingTableError(error)) return defaultEngine();
    console.error('Falha ao carregar o fluxo do assistente:', (error as Error).message);
    return defaultEngine();
  }
}

export async function getActiveFlowEngine(): Promise<AssistantFlowEngine> {
  if (cache) return cache.engine;
  cache = await loadActiveFlowRow();
  return cache.engine;
}

/** Fluxo ativo cru, para a tela de edicao. */
export async function getActiveFlowForEditing(): Promise<{
  id: number | null;
  nome: string;
  definicao: FlowDefinition;
  versao: number;
}> {
  try {
    const [row] = await db
      .select()
      .from(assistantFlows)
      .where(eq(assistantFlows.ativo, true))
      .orderBy(desc(assistantFlows.dataAtualizacao))
      .limit(1);

    if (row) {
      try {
        return {
          id: row.id,
          nome: row.nome,
          definicao: parseFlowDefinition(row.definicao),
          versao: row.versao,
        };
      } catch {
        // Gravado invalido: a tela abre no padrao para o usuario reconstruir.
        return { id: row.id, nome: row.nome, definicao: DEFAULT_FLOW_DEFINITION, versao: row.versao };
      }
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error('Falha ao ler o fluxo para edição:', (error as Error).message);
    }
  }

  return { id: null, nome: FLOW_NAME_PADRAO, definicao: DEFAULT_FLOW_DEFINITION, versao: 0 };
}

/** Grava o fluxo editado. A definicao ja deve ter passado por parseFlowDefinition. */
export async function saveActiveFlow(definicao: FlowDefinition, nome = FLOW_NAME_PADRAO): Promise<{ id: number; versao: number }> {
  const atual = await getActiveFlowForEditing();

  if (atual.id === null) {
    const [criado] = await db
      .insert(assistantFlows)
      .values({ nome, definicao, ativo: true, versao: 1 })
      .returning({ id: assistantFlows.id, versao: assistantFlows.versao });
    invalidateFlowCache();
    return { id: criado!.id, versao: criado!.versao };
  }

  const [atualizado] = await db
    .update(assistantFlows)
    .set({
      nome,
      definicao,
      versao: atual.versao + 1,
      dataAtualizacao: new Date(),
    })
    .where(eq(assistantFlows.id, atual.id))
    .returning({ id: assistantFlows.id, versao: assistantFlows.versao });

  invalidateFlowCache();
  return { id: atualizado!.id, versao: atualizado!.versao };
}

/** Volta ao fluxo original — a saida quando uma edicao quebra a conversa. */
export async function restoreDefaultFlow(): Promise<{ id: number; versao: number }> {
  return saveActiveFlow(DEFAULT_FLOW_DEFINITION, FLOW_NAME_PADRAO);
}
