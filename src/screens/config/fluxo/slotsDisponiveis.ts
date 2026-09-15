/**
 * Campos que o assistente sabe preencher, para a paleta do editor.
 *
 * São os 14 slots da união `SlotId` do backend: cada um tem coluna na tabela
 * de lançamento, parser que entende a resposta e gravação que sabe onde
 * salvar. Arrastar um campo daqui cria um nó que funciona de ponta a ponta.
 *
 * Campo fora desta lista não existe no banco — é o que a coluna `extras` vai
 * resolver, em etapa própria.
 */

export interface SlotDisponivel {
  slot: string;
  rotulo: string;
  /** Pergunta inicial do nó recém-criado, antes de o usuário editá-la. */
  perguntaPadrao: string;
  /** Só faz sentido em despesa; receita grava apenas descrição e valor. */
  somenteDespesa: boolean;
}

export const SLOTS_DISPONIVEIS: readonly SlotDisponivel[] = [
  {
    slot: 'description',
    rotulo: 'Descrição',
    perguntaPadrao: 'Como você quer descrever esse lançamento?',
    somenteDespesa: false,
  },
  {
    slot: 'amount',
    rotulo: 'Valor',
    perguntaPadrao: 'Quanto foi?',
    somenteDespesa: false,
  },
  {
    slot: 'category',
    rotulo: 'Categoria',
    perguntaPadrao: 'E a categoria?',
    somenteDespesa: true,
  },
  {
    slot: 'paymentMethod',
    rotulo: 'Forma de pagamento',
    perguntaPadrao: 'Como você pagou?',
    somenteDespesa: true,
  },
  {
    slot: 'cardId',
    rotulo: 'Cartão',
    perguntaPadrao: 'Qual cartão?',
    somenteDespesa: true,
  },
  {
    slot: 'billingType',
    rotulo: 'Tipo de cobrança',
    perguntaPadrao: 'É uma cobrança única, parcelada ou recorrente?',
    somenteDespesa: true,
  },
  {
    slot: 'installments',
    rotulo: 'Parcelas',
    perguntaPadrao: 'Em quantas vezes?',
    somenteDespesa: true,
  },
  {
    slot: 'paidInstallments',
    rotulo: 'Parcelas já pagas',
    perguntaPadrao: 'Quantas parcelas você já pagou?',
    somenteDespesa: true,
  },
  {
    slot: 'paid',
    rotulo: 'Já foi paga',
    perguntaPadrao: 'Já foi paga?',
    somenteDespesa: true,
  },
  {
    slot: 'amountPaid',
    rotulo: 'Valor pago',
    perguntaPadrao: 'Quanto você pagou?',
    somenteDespesa: true,
  },
  {
    slot: 'purchaseDate',
    rotulo: 'Data da compra',
    perguntaPadrao: 'Quando foi a compra?',
    somenteDespesa: true,
  },
  {
    slot: 'dueDate',
    rotulo: 'Vencimento',
    perguntaPadrao: 'Para quando é o vencimento?',
    somenteDespesa: true,
  },
  {
    slot: 'invoiceNumber',
    rotulo: 'Número da nota',
    perguntaPadrao: 'Tem número de nota fiscal?',
    somenteDespesa: true,
  },
  {
    slot: 'invoiceDate',
    rotulo: 'Data da nota',
    perguntaPadrao: 'Qual a data de emissão da nota?',
    somenteDespesa: true,
  },
];

/**
 * Id único para um nó novo do mesmo slot.
 *
 * Um campo pode aparecer em mais de um ponto do fluxo (o valor perguntado de
 * um jeito no crédito e de outro no Pix), então o id não pode ser o slot.
 */
export function novoIdParaSlot(slot: string, idsExistentes: Set<string>): string {
  if (!idsExistentes.has(slot)) return slot;

  let sufixo = 2;
  while (idsExistentes.has(`${slot}-${sufixo}`)) {
    sufixo += 1;
  }
  return `${slot}-${sufixo}`;
}
