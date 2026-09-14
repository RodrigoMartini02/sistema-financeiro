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
}

export interface FlowQuestionVariant {
  quando?: FlowCondition[];
  texto: string;
  opcoesSource?: FlowOptionSource;
  opcoes?: FlowOption[];
  isConfirmation?: boolean;
}

export interface FlowNode {
  id: string;
  slot: string;
  variantes: FlowQuestionVariant[];
  aplicaQuando?: FlowCondition[];
  skippable?: boolean;
  limpaAoResponder?: string[];
  exigeConfirmacao?: boolean;
  posicao?: { x: number; y: number };
}

export interface FlowDefinition {
  versaoFormato: 1;
  ordem: string[];
  nos: FlowNode[];
  obrigatorios: { income: string[]; expense: string[] };
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

export async function saveActiveFlow(definicao: FlowDefinition, nome?: string): Promise<{ id: number; versao: number }> {
  return apiRequest('/assistant-flows/active', {
    method: 'PUT',
    body: JSON.stringify({ definicao, nome }),
  });
}

export async function restoreDefaultFlow(): Promise<{ id: number; versao: number }> {
  return apiRequest('/assistant-flows/restore', { method: 'POST' });
}
