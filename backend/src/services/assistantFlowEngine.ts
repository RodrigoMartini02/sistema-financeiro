import {
  cardsForPaymentMethod,
  type SlotCatalog,
  type SlotDraft,
  type SlotId,
  type SlotOption,
  type SlotQuestion,
} from './assistantSlotFilling';
import type { FlowCondition, FlowDefinition, FlowNode, FlowQuestionVariant } from './assistantFlowSchema';

/**
 * Executa o fluxo desenhado na tela: dado o rascunho e o catalogo da conta,
 * decide qual e a proxima pergunta.
 *
 * Substitui a ordem fixa e os ifs de buildQuestion que viviam em
 * assistantSlotFilling.ts. O comportamento tem de bater 1:1 com o de antes —
 * a suite de testes existente e o criterio.
 */

/** Campos do rascunho legiveis por condicao e template. */
function draftValue(draft: SlotDraft, campo: string, catalog: SlotCatalog): unknown {
  switch (campo) {
    case 'kind': return draft.kind;
    case 'isCompanyAccount': return catalog.isCompanyAccount;
    // Quantos cartoes servem para a forma de pagamento atual. Sai do catalogo,
    // nao do rascunho: e o que permite a pergunta de cartao unico se
    // diferenciar da lista sem um if solto no motor.
    case 'cartoesElegiveis': return cardsForPaymentMethod(catalog, draft.paymentMethod).length;
    case 'primeiroCartaoNome': return cardsForPaymentMethod(catalog, draft.paymentMethod)[0]?.name ?? null;
    case 'primeiroCartaoId': return cardsForPaymentMethod(catalog, draft.paymentMethod)[0]?.id ?? null;
    case 'description': return draft.description;
    case 'category': return draft.category;
    case 'paymentMethod': return draft.paymentMethod;
    case 'cardId': return draft.cardId;
    case 'billingType': return draft.billingType;
    case 'installments': return draft.installments;
    case 'paidInstallments': return draft.paidInstallments;
    case 'amount': return draft.amount;
    case 'paid': return draft.paid;
    case 'amountPaid': return draft.amountPaid;
    case 'date': return draft.date;
    case 'dueDate': return draft.dueDate;
    case 'invoiceNumber': return draft.invoiceNumber;
    case 'invoiceDate': return draft.invoiceDate;
    // Campo desconhecido nunca satisfaz condicao nem imprime valor: fluxo
    // com typo falha visivelmente em vez de inventar comportamento.
    default: return undefined;
  }
}

function matchesCondition(condition: FlowCondition, draft: SlotDraft, catalog: SlotCatalog): boolean {
  const atual = draftValue(draft, condition.campo, catalog);

  switch (condition.operador) {
    case 'preenchido': return atual !== null && atual !== undefined;
    case 'vazio': return atual === null || atual === undefined;
    case 'igual': return atual === condition.valor;
    case 'diferente': return atual !== condition.valor;
    case 'em': return Array.isArray(condition.valor) && condition.valor.includes(atual as never);
  }
}

function matchesAll(conditions: FlowCondition[] | undefined, draft: SlotDraft, catalog: SlotCatalog): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) => matchesCondition(condition, draft, catalog));
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Substitui {campo} pelo valor do rascunho.
 *
 * `formatarMoeda` distingue os dois usos do mesmo template: no TEXTO da
 * pergunta o valor aparece como "R$ 50,00", mas no VALOR de um chip ele tem
 * de sair cru ("50") — e o chip que volta como resposta, e o parser espera um
 * numero, nao texto formatado.
 *
 * Variavel desconhecida vira string vazia em vez de deixar "{xyz}" na tela.
 */
export function renderTemplate(
  texto: string,
  draft: SlotDraft,
  catalog: SlotCatalog,
  formatarMoeda = true,
): string {
  return texto.replace(/\{(\w+)\}/g, (_match, campo: string) => {
    const valor = draftValue(draft, campo, catalog);
    if (valor === null || valor === undefined) return '';
    if (formatarMoeda && (campo === 'amount' || campo === 'amountPaid') && typeof valor === 'number') {
      return formatCurrency(valor);
    }
    return String(valor);
  });
}

/** Primeira variante cujas condicoes batem; a ultima serve de padrao. */
function selectVariant(node: FlowNode, draft: SlotDraft, catalog: SlotCatalog): FlowQuestionVariant {
  for (const variante of node.variantes) {
    if (matchesAll(variante.quando, draft, catalog)) return variante;
  }
  return node.variantes[node.variantes.length - 1]!;
}

/**
 * Opcoes da pergunta. Categorias e cartoes vem do catalogo da conta, nunca do
 * fluxo salvo: sao dados do usuario, mudam a cada cadastro.
 */
function resolveOptions(
  variante: FlowQuestionVariant,
  draft: SlotDraft,
  catalog: SlotCatalog,
): SlotOption[] {
  switch (variante.opcoesSource) {
    case 'categorias':
      return catalog.categories.map((category) => ({ label: category.name, value: category.name }));
    case 'cartoes':
      return cardsForPaymentMethod(catalog, draft.paymentMethod)
        .map((card) => ({ label: card.name, value: String(card.id) }));
    case 'estatica':
    default:
      // Template vale no rotulo e no valor, mas so o rotulo leva formatacao de
      // moeda: o valor volta como resposta e precisa ser parseavel.
      return (variante.opcoes ?? []).map((opcao) => ({
        label: renderTemplate(opcao.label, draft, catalog),
        value: renderTemplate(opcao.value, draft, catalog, false),
      }));
  }
}

function buildQuestionFromNode(node: FlowNode, draft: SlotDraft, catalog: SlotCatalog): SlotQuestion {
  const variante = selectVariant(node, draft, catalog);
  return {
    slot: node.slot,
    question: renderTemplate(variante.texto, draft, catalog),
    options: resolveOptions(variante, draft, catalog),
    isConfirmation: variante.isConfirmation === true,
    skippable: node.skippable === true,
  };
}

function isSlotFilled(slot: SlotId, draft: SlotDraft): boolean {
  switch (slot) {
    case 'description': return draft.description !== null;
    case 'category': return draft.category !== null;
    case 'paymentMethod': return draft.paymentMethod !== null;
    case 'cardId': return draft.cardId !== null;
    case 'billingType': return draft.billingType !== null;
    case 'installments': return draft.installments !== null;
    case 'paidInstallments': return draft.paidInstallments !== null;
    case 'amount': return draft.amount !== null;
    case 'paid': return draft.paid !== null;
    case 'amountPaid': return draft.amountPaid !== null;
    case 'purchaseDate': return draft.date !== null;
    case 'dueDate': return draft.dueDate !== null;
    case 'invoiceNumber': return draft.invoiceNumber !== null;
    case 'invoiceDate': return draft.invoiceDate !== null;
  }
}

/**
 * Motor de um fluxo ja validado. Recebe a definicao no construtor para que o
 * custo de indexar os nos nao se repita a cada pergunta.
 */
export class AssistantFlowEngine {
  private readonly nodesById: Map<string, FlowNode>;

  constructor(private readonly definition: FlowDefinition) {
    this.nodesById = new Map(definition.nos.map((no) => [no.id, no]));
  }

  private orderedNodes(): FlowNode[] {
    return this.definition.ordem
      .map((id) => this.nodesById.get(id))
      .filter((no): no is FlowNode => no !== undefined);
  }

  private nodeForSlot(slot: SlotId): FlowNode | undefined {
    return this.orderedNodes().find((no) => no.slot === slot);
  }

  /** Um no entra no fluxo quando suas condicoes batem com o rascunho atual. */
  isNodeApplicable(node: FlowNode, draft: SlotDraft, catalog: SlotCatalog): boolean {
    return matchesAll(node.aplicaQuando, draft, catalog);
  }

  nextQuestion(draft: SlotDraft, catalog: SlotCatalog, skipped: SlotId[] = []): SlotQuestion | null {
    const skippedSet = new Set(skipped);

    for (const node of this.orderedNodes()) {
      if (skippedSet.has(node.slot)) continue;
      if (!this.isNodeApplicable(node, draft, catalog)) continue;
      if (isSlotFilled(node.slot, draft)) continue;
      return buildQuestionFromNode(node, draft, catalog);
    }

    return null;
  }

  /** Pergunta de um slot especifico, mesmo preenchido — usada nas confirmacoes. */
  questionFor(slot: SlotId, draft: SlotDraft, catalog: SlotCatalog): SlotQuestion | null {
    const node = this.nodeForSlot(slot);
    if (!node) return null;
    return buildQuestionFromNode(node, draft, catalog);
  }

  /** Slots preenchidos que ainda aguardam o "certo?" do usuario. */
  pendingConfirmations(draft: SlotDraft, confirmed: SlotId[]): SlotId[] {
    const confirmedSet = new Set(confirmed);
    return this.orderedNodes()
      .filter((no) => no.exigeConfirmacao === true)
      .map((no) => no.slot)
      .filter((slot) => !confirmedSet.has(slot) && isSlotFilled(slot, draft));
  }

  /**
   * Slots zerados quando `slot` e respondido.
   *
   * Hoje quem aplica a cascata ainda e `clearDependentSlots`, no parser, que
   * nao conhece o fluxo. Este metodo existe para o editor mostrar as
   * dependencias e para os testes provarem que as duas fontes concordam;
   * mover a aplicacao para ca faz parte da fase dos nos especiais.
   */
  dependentsOf(slot: SlotId): SlotId[] {
    return this.nodeForSlot(slot)?.limpaAoResponder ?? [];
  }

  missingRequiredSlots(draft: SlotDraft): SlotId[] {
    return this.definition.obrigatorios[draft.kind].filter((slot) => !isSlotFilled(slot, draft));
  }

  isDraftComplete(draft: SlotDraft, catalog: SlotCatalog, skipped: SlotId[] = []): boolean {
    return this.missingRequiredSlots(draft).length === 0
      && this.nextQuestion(draft, catalog, skipped) === null;
  }
}
