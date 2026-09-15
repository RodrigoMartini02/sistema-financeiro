import { apiRequest } from './apiClient';

/**
 * Fluxo de conversa do assistente. Espelha os tipos do backend em
 * services/assistantFlowSchema.ts — mudou la, mude aqui.
 */

export type FlowOptionSource = 'estatica' | 'categorias' | 'cartoes';

export interface FlowCondition {
  campo: string;
  operador: 'igual' | 'diferente' | 'em' | 'preenchido' | 'vazio';
  valor?: string | number | boolean | Array<string | number | boolean>;
}

export interface FlowOption {
  label: string;
  value: string;
  /** Posição do bloco da resposta no canvas; só o editor usa. */
  posicao?: { x: number; y: number };
}

export interface FlowQuestionVariant {
  quando?: FlowCondition[];
  texto: string;
  opcoesSource?: FlowOptionSource;
  opcoes?: FlowOption[];
  isConfirmation?: boolean;
}

/** Valor curinga: vale quando nenhum `quando` específico bateu. */
export const TRANSICAO_QUALQUER = '*';

/** Para onde uma resposta leva. Ausente = varredura da ordem. */
export interface FlowTransicao {
  quando: string;
  destino: string | null;
}

export interface FlowNode {
  id: string;
  slot: string;
  variantes: FlowQuestionVariant[];
  aplicaQuando?: FlowCondition[];
  skippable?: boolean;
  limpaAoResponder?: string[];
  exigeConfirmacao?: boolean;
  transicoes?: FlowTransicao[];
  posicao?: { x: number; y: number };
}

export type FlowIntent = 'register_expense' | 'register_income' | 'ask';

export interface FlowIntentOption {
  intent: FlowIntent;
  label: string;
  /** Fala do assistente logo após a escolha. */
  abertura: string;
}

export interface FlowAbertura {
  /** Primeira vez, e fallback quando as demais não existem. */
  saudacao: string;
  /** Voltou no mesmo dia. */
  saudacaoRetorno?: string;
  /** Voltou dias depois. */
  saudacaoRetornoLongo?: string;
  opcoes: FlowIntentOption[];
  /** Posição no canvas; só o editor usa. */
  posicao?: { x: number; y: number };
}

export interface FlowDefinition {
  versaoFormato: 1 | 2;
  ordem: string[];
  nos: FlowNode[];
  obrigatorios: { income: string[]; expense: string[] };
  abertura?: FlowAbertura;
}

export interface AssistantFlow {
  id: number | null;
  nome: string;
  definicao: FlowDefinition;
  versao: number;
}

export async function fetchActiveFlow(): Promise<AssistantFlow> {
  return apiRequest<AssistantFlow>('/assistant-flows/active');
}

/** Saudação e chips iniciais. Disponível a qualquer usuário do assistente. */
export async function fetchAbertura(): Promise<FlowAbertura> {
  return apiRequest<FlowAbertura>('/assistant-flows/abertura');
}

export async function saveActiveFlow(definicao: FlowDefinition, nome?: string): Promise<{ id: number; versao: number }> {
  return apiRequest('/assistant-flows/active', {
    method: 'PUT',
    body: JSON.stringify({ definicao, nome }),
  });
}

export async function restoreDefaultFlow(): Promise<{ id: number; versao: number }> {
  return apiRequest('/assistant-flows/restore', { method: 'POST' });
}
