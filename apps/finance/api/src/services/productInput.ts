// Leitura e validação dos pedidos do cadastro de produto e da movimentação
// manual de estoque. Sem acesso ao banco — é o que a rota confere antes de
// gravar, e por isso pode ser testado isoladamente. Os campos do pedido seguem
// o padrão em português do módulo do catálogo (`nome`, `conta_id`...).
import { RequestInputError, readAmount, readOptionalText, readRecord, readRequiredId } from '../utils/requestInput';
import { readProductDiscount, type ProductDiscount } from './productPricing';

const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_CATEGORY_LENGTH = 60;
const MAX_REASON_LENGTH = 255;
/** Maior quantidade que cabe em numeric(12,3). */
const MAX_QUANTITY = 999_999_999.999;

export const STOCK_MOVEMENT_TYPES = ['entrada', 'saida'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface ProductInput {
  name: string;
  description: string | null;
  price: number;
  discount: ProductDiscount | null;
  category: string | null;
  tracksStock: boolean;
  /** Só ao ligar o controle num produto sem movimentação; 0 quando não informada. */
  initialQuantity: number;
  /** Nulo: sem alerta de estoque baixo. */
  minimumStock: number | null;
  /** Só a edição muda; ausente mantém como está. */
  active: boolean | undefined;
}

export interface StockMovementInput {
  type: StockMovementType;
  quantity: number;
  reason: string | null;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Quantidade de estoque opcional: zero vale; vazio volta null. */
function readOptionalQuantity(value: unknown, message: string): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_QUANTITY) {
    throw new RequestInputError(message);
  }
  return roundQuantity(value);
}

function readOptionalBoolean(value: unknown, message: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new RequestInputError(message);
  }
  return value;
}

/** Corpo do POST e do PUT de /catalogo/produtos. */
export function readProductInput(body: unknown): ProductInput {
  const record = readRecord(body, 'Pedido inválido');

  const name = readOptionalText(record['nome'], 'Nome', MAX_NAME_LENGTH);
  if (name === null) {
    throw new RequestInputError('Informe o nome do produto');
  }
  const price = readAmount(record['valor'], 'Informe o valor do produto');
  const tracksStock = readOptionalBoolean(record['controla_estoque'], 'Controle de estoque inválido') ?? false;
  const initialQuantity = readOptionalQuantity(record['quantidade_inicial'], 'Quantidade inicial inválida') ?? 0;
  if (initialQuantity > 0 && !tracksStock) {
    throw new RequestInputError('Ligue o controle de estoque para informar a quantidade inicial');
  }

  return {
    name,
    description: readOptionalText(record['descricao'], 'Descrição', MAX_DESCRIPTION_LENGTH),
    price,
    discount: readProductDiscount(record['desconto_tipo'], record['desconto_valor'], price),
    category: readOptionalText(record['categoria'], 'Categoria', MAX_CATEGORY_LENGTH),
    tracksStock,
    initialQuantity,
    minimumStock: readOptionalQuantity(record['estoque_minimo'], 'Estoque mínimo inválido'),
    active: readOptionalBoolean(record['ativo'], 'Situação do produto inválida'),
  };
}

/** Conta PJ do produto novo; na edição a conta não muda e não é lida. */
export function readProductAccountId(body: unknown): number {
  const record = readRecord(body, 'Pedido inválido');
  return readRequiredId(record['conta_id'], 'Informe a conta do produto');
}

/** Corpo do POST /catalogo/produtos/:id/estoque (entrada ou saída manual). */
export function readStockMovementInput(body: unknown): StockMovementInput {
  const record = readRecord(body, 'Pedido inválido');
  const type = record['tipo'];
  if (!STOCK_MOVEMENT_TYPES.includes(type as StockMovementType)) {
    throw new RequestInputError('Tipo deve ser entrada ou saida');
  }
  const quantity = readOptionalQuantity(record['quantidade'], 'Quantidade deve ser maior que zero');
  if (quantity === null || quantity <= 0) {
    throw new RequestInputError('Quantidade deve ser maior que zero');
  }
  return {
    type: type as StockMovementType,
    quantity,
    reason: readOptionalText(record['motivo'], 'Motivo', MAX_REASON_LENGTH),
  };
}
