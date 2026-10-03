import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, PackagePlus, Store, Link2, ExternalLink } from 'lucide-react';
import {
  fetchProdutos, saveProduto, registrarMovimentacaoEstoque, fetchMovimentacoesEstoque,
  type Produto, type ProdutoImagem, type ProdutoFormData,
} from '../../services/catalogoService';
import { fetchStorefrontConfig, storefrontPublicUrl } from '../../services/storefrontService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, MoneyField, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle, chipStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { ToggleRow } from '../../ui/form';
import { CFG, cfgBadgeStyle, cfgDividerStyle } from '../../ui/configTokens';
import { InfoBanner } from '../../ui/InfoBanner';
import { EmptyState } from '../../ui/EmptyState';
import { formatCurrency } from '../finance/formatters';
import { useConfirm } from '../../context/ConfirmContext';
import { ProdutoImagensManager } from '../../components/ProdutoImagensManager';
import { StorefrontDialog } from './StorefrontDialog';
import {
  calculateDiscountPercent, calculateFinalPrice, productDiscountOf, validateProductDiscount,
  type ProductDiscount, type ProductDiscountType,
} from '../../utils/productPricing';

type DiscountChoice = 'sem' | ProductDiscountType;

const DISCOUNT_CHOICES: Array<{ value: DiscountChoice; label: string }> = [
  { value: 'sem', label: 'Sem desconto' },
  { value: 'valor', label: 'Em R$' },
  { value: 'percentual', label: 'Em %' },
];

const smallButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px',
  borderRadius: 999, border: `1px solid ${CFG.borderSoft}`, background: '#fff',
  fontSize: 11.5, fontWeight: 600, color: CFG.chipText, cursor: 'pointer', whiteSpace: 'nowrap',
};

const discountBadgeStyle: React.CSSProperties = {
  ...cfgBadgeStyle, background: C.successBg, color: C.success, borderColor: C.successBorder,
};

/** Corpo completo do PUT: ele grava o que recebe, então desativar reenvia o resto como está. */
function productFormData(produto: Produto): ProdutoFormData {
  return {
    nome: produto.nome,
    descricao: produto.descricao ?? '',
    valor: Number(produto.valor),
    categoria: produto.categoria ?? '',
    desconto_tipo: produto.descontoTipo,
    desconto_valor: produto.descontoValor !== null ? Number(produto.descontoValor) : null,
    controla_estoque: produto.controlaEstoque,
    estoque_minimo: produto.estoqueMinimo !== null ? Number(produto.estoqueMinimo) : null,
  };
}

function ProdutoDialog({
  open, produto, categorias, isSaving, error, onClose, onSave, onToggleActive,
}: {
  open: boolean;
  produto?: Produto;
  /** Categorias já usadas na conta, para sugerir. */
  categorias: string[];
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (data: ProdutoFormData) => void;
  onToggleActive?: () => void;
}) {
  const confirm = useConfirm();
  const [valor, setValor] = useState<number | undefined>(produto ? Number(produto.valor) : undefined);
  const [discountChoice, setDiscountChoice] = useState<DiscountChoice>(produto?.descontoTipo ?? 'sem');
  const [discountMoney, setDiscountMoney] = useState<number | undefined>(
    produto?.descontoTipo === 'valor' && produto.descontoValor !== null ? Number(produto.descontoValor) : undefined,
  );
  const [discountPercent, setDiscountPercent] = useState<string>(
    produto?.descontoTipo === 'percentual' && produto.descontoValor !== null ? String(Number(produto.descontoValor)) : '',
  );
  const [controlaEstoque, setControlaEstoque] = useState(produto?.controlaEstoque ?? false);
  const [imagens, setImagens] = useState<ProdutoImagem[]>(produto?.imagens ?? []);
  const [localError, setLocalError] = useState('');

  // Quantidade inicial só ao ligar o controle num produto que ainda não tem
  // estoque nenhum; quem já controla vê o saldo, que só muda por movimentação.
  const askInitialQuantity = controlaEstoque
    && (!produto || (!produto.controlaEstoque && Number(produto.quantidadeEstoque) === 0));

  const discount: ProductDiscount | null = discountChoice === 'sem'
    ? null
    : {
      type: discountChoice,
      value: discountChoice === 'valor' ? (discountMoney ?? 0) : Number(discountPercent.replace(',', '.')),
    };
  const discountError = validateProductDiscount(valor, discount);
  const finalPrice = valor !== undefined && valor > 0 && discount !== null && discountError === null
    ? calculateFinalPrice(valor, discount)
    : null;
  const percentBadge = valor !== undefined && finalPrice !== null ? calculateDiscountPercent(valor, discount) : null;

  const handleToggleActive = async () => {
    if (!onToggleActive || !produto) return;
    const ok = await confirm({
      title: produto.ativo ? 'Desativar produto' : 'Ativar produto',
      message: produto.ativo
        ? `Desativar "${produto.nome}"? Ele deixará de aparecer na vitrine pública.`
        : `Ativar "${produto.nome}" novamente?`,
      confirmLabel: produto.ativo ? 'Desativar' : 'Ativar',
      variant: produto.ativo ? 'danger' : 'default',
    });
    if (ok) onToggleActive();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (discountError) {
      setLocalError(discountError);
      return;
    }
    setLocalError('');
    const fd = new FormData(e.currentTarget);
    const minimoBruto = ((fd.get('estoque_minimo') as string | null) ?? '').trim();
    const inicialBruto = ((fd.get('quantidade_inicial') as string | null) ?? '').trim();
    // Com o controle desligado o campo some; o mínimo gravado continua como está.
    const estoqueMinimoAtual = produto?.estoqueMinimo != null ? Number(produto.estoqueMinimo) : null;
    onSave({
      nome: (fd.get('nome') as string).trim(),
      descricao: (fd.get('descricao') as string).trim(),
      valor: valor ?? 0,
      categoria: ((fd.get('categoria') as string | null) ?? '').trim(),
      desconto_tipo: discount?.type ?? null,
      desconto_valor: discount?.value ?? null,
      controla_estoque: controlaEstoque,
      // Vazio = produto sem alerta de estoque baixo, não zero.
      estoque_minimo: controlaEstoque ? (minimoBruto === '' ? null : Number(minimoBruto)) : estoqueMinimoAtual,
      quantidade_inicial: askInitialQuantity && inicialBruto !== '' ? Number(inicialBruto) : null,
    });
  };

  const shownError = localError || error;

  return (
    <Dialog open={open} title={produto ? 'Editar produto' : 'Novo produto'} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 440, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome do produto</span><span style={{ color: C.danger }}>*</span></label>
              <input
                name="nome"
                defaultValue={produto?.nome}
                placeholder="Ex: Camiseta, Caneca, Kit..."
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}><span>Valor</span><span style={{ color: C.danger }}>*</span></label>
              <MoneyField value={valor} onChange={setValor} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Categoria</label>
            <input
              name="categoria"
              list="catalogo-categorias"
              defaultValue={produto?.categoria ?? ''}
              placeholder="Ex: Roupas, Acessórios..."
              maxLength={60}
              style={fieldInputStyle}
            />
            <datalist id="catalogo-categorias">
              {categorias.map((categoria) => <option key={categoria} value={categoria} />)}
            </datalist>
          </div>

          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea
              name="descricao"
              defaultValue={produto?.descricao ?? ''}
              placeholder="Descreva o produto..."
              rows={3}
              style={{ ...fieldInputStyle, height: 'auto', padding: '8px 9px', resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Desconto</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {DISCOUNT_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={discountChoice === choice.value}
                  onClick={() => setDiscountChoice(choice.value)}
                  style={chipStyle(discountChoice === choice.value, { h: 30, size: 12 })}
                >
                  {choice.label}
                </button>
              ))}
              {discountChoice === 'valor' && (
                <div style={{ width: 130 }}>
                  <MoneyField value={discountMoney} onChange={setDiscountMoney} />
                </div>
              )}
              {discountChoice === 'percentual' && (
                <div style={{ position: 'relative', width: 100 }}>
                  <input
                    aria-label="Desconto em porcentagem"
                    inputMode="decimal"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value.replace(/[^\d,.]/g, ''))}
                    placeholder="0"
                    style={{ ...fieldInputStyle, paddingRight: 24 }}
                  />
                  <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: C.textFaint }}>%</span>
                </div>
              )}
            </div>
            {discount !== null && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 500, color: discountError ? C.danger : CFG.muted }}>
                {discountError ?? (finalPrice !== null
                  ? `Preço final: ${formatCurrency(finalPrice)}${percentBadge ? ` · -${percentBadge}%` : ''}`
                  : 'Informe o valor do produto')}
              </p>
            )}
          </div>

          <div style={cfgDividerStyle} />

          <ToggleRow
            label="Controlar estoque"
            description={controlaEstoque
              ? 'A venda baixa o estoque e, sem saldo, o produto aparece esgotado na vitrine.'
              : 'A venda não mexe no estoque e o produto nunca aparece esgotado.'}
            checked={controlaEstoque}
            onChange={() => setControlaEstoque((current) => !current)}
          />

          {controlaEstoque && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {askInitialQuantity ? (
                  <>
                    <label style={labelStyle}>Quantidade inicial</label>
                    <input
                      name="quantidade_inicial"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0"
                      style={fieldInputStyle}
                    />
                  </>
                ) : (
                  <>
                    <label style={labelStyle}>Em estoque</label>
                    {/* Somente leitura: o saldo só muda por entrada/saída registrada,
                        para o histórico sempre explicar como ele chegou aqui. */}
                    <div style={{ ...fieldInputStyle, display: 'flex', alignItems: 'center', background: CFG.chipBg, color: CFG.muted }}>
                      {produto ? Number(produto.quantidadeEstoque) : 0}
                    </div>
                  </>
                )}
              </div>
              <div>
                <label style={labelStyle}>Estoque mínimo</label>
                <input
                  name="estoque_minimo"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue={produto?.estoqueMinimo ?? ''}
                  placeholder="Sem alerta"
                  style={fieldInputStyle}
                />
              </div>
            </div>
          )}

          <div style={cfgDividerStyle} />

          <div>
            <label style={labelStyle}>Imagens</label>
            {produto ? (
              <ProdutoImagensManager produtoId={produto.id} imagens={imagens} onChange={setImagens} />
            ) : (
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
                Salve o produto para poder adicionar imagens.
              </p>
            )}
          </div>

          {shownError && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {shownError}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {produto && onToggleActive && (
            <button type="button" style={dangerButtonStyle} onClick={handleToggleActive}>
              {produto.ativo ? 'Desativar' : 'Ativar'}
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="submit"
              disabled={isSaving}
              style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Entrada e saida no mesmo lugar: quem abre isso ja escolheu o produto, e
 * so precisa dizer o que aconteceu com ele. Separar em dois dialogos
 * duplicaria o formulario inteiro por causa de um campo.
 */
function MovimentacaoDialog({
  open, produto, isSaving, error, onClose, onSave,
}: {
  open: boolean;
  produto?: Produto;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (data: { tipo: 'entrada' | 'saida'; quantidade: number; motivo: string }) => void;
}) {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada');

  // O historico responde "por que o saldo esta nesse numero?" — a duvida que
  // aparece justamente na hora de mexer nele.
  const historicoQ = useQuery({
    queryKey: queryKeys.movimentacoesEstoque(produto?.id ?? ''),
    queryFn: () => fetchMovimentacoesEstoque(produto!.id),
    enabled: open && !!produto,
  });
  const historico = historicoQ.data ?? [];

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      tipo,
      quantidade: Number(fd.get('quantidade')),
      motivo: (fd.get('motivo') as string ?? '').trim(),
    });
  };

  const saldoAtual = produto ? Number(produto.quantidadeEstoque) : 0;

  return (
    <Dialog open={open} title={`Estoque · ${produto?.nome ?? ''}`} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: CFG.muted }}>
            Saldo atual: <strong style={{ color: C.text }}>{saldoAtual}</strong>
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['entrada', 'saida'] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setTipo(opcao)}
                aria-pressed={tipo === opcao}
                style={{
                  flex: 1, height: 38, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${tipo === opcao ? C.primary : C.borderInput}`,
                  background: tipo === opcao ? C.primarySoft : '#fff',
                  color: tipo === opcao ? C.primaryDark : C.textMuted,
                }}
              >
                {opcao === 'entrada' ? 'Entrada' : 'Saída'}
              </button>
            ))}
          </div>

          <div>
            <label style={labelStyle}><span>Quantidade</span><span style={{ color: C.danger }}>*</span></label>
            <input
              name="quantidade"
              type="number"
              min="0.001"
              step="0.001"
              required
              autoFocus
              placeholder="0"
              style={fieldInputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Motivo</label>
            <input
              name="motivo"
              placeholder={tipo === 'entrada' ? 'Ex: compra de reposição' : 'Ex: perda, uso próprio'}
              style={fieldInputStyle}
            />
          </div>

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}

          <div style={cfgDividerStyle} />

          <div>
            <label style={labelStyle}>Últimas movimentações</label>
            {historicoQ.isLoading && (
              <p style={{ margin: 0, fontSize: 11.5, color: CFG.muted }}>Carregando...</p>
            )}
            {!historicoQ.isLoading && historico.length === 0 && (
              <p style={{ margin: 0, fontSize: 11.5, color: CFG.muted }}>Nenhuma movimentação registrada ainda.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {historico.slice(0, 10).map((mov) => (
                <div
                  key={mov.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    fontSize: 11.5, color: CFG.chipText,
                    borderBottom: `1px solid ${CFG.borderSoft}`, paddingBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 600, color: mov.tipo === 'entrada' ? C.success : C.danger }}>
                    {mov.tipo === 'entrada' ? '+' : '−'}{Number(mov.quantidade)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mov.motivo ?? '—'}
                  </span>
                  <span style={{ color: CFG.muted, whiteSpace: 'nowrap' }}>
                    {new Date(mov.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={dialogFooterStyle}>
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
              {isSaving ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function CatalogoTab() {
  const qc = useQueryClient();
  const accountId = getActiveAccountId();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Produto }>({ open: false });
  const [estoqueDialog, setEstoqueDialog] = useState<{ open: boolean; item?: Produto }>({ open: false });
  const [vitrineOpen, setVitrineOpen] = useState(false);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const produtosQ = useQuery({
    queryKey: queryKeys.catalogoProdutos(accountId),
    queryFn: () => fetchProdutos(accountId!),
    enabled: accountId !== null,
  });
  const vitrineQ = useQuery({
    queryKey: queryKeys.storefrontConfig(accountId),
    queryFn: () => fetchStorefrontConfig(accountId!),
    enabled: accountId !== null,
  });
  const todos = useMemo(() => produtosQ.data ?? [], [produtosQ.data]);
  const data = todos.filter((p) => (mostrarDesativados ? !p.ativo : p.ativo));
  // Sugestões do campo categoria: as já usadas na conta, sem repetir por maiúscula/minúscula.
  const categorias = useMemo(() => {
    const porChave = new Map<string, string>();
    for (const produto of todos) {
      const categoria = produto.categoria?.trim();
      const chave = categoria?.toLocaleLowerCase('pt-BR');
      if (categoria && chave && !porChave.has(chave)) {
        porChave.set(chave, categoria);
      }
    }
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [todos]);

  const invalidateProdutos = () => qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos(accountId) });

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: ProdutoFormData; id?: string }) => saveProduto(v, id),
    onSuccess: () => {
      void invalidateProdutos();
      setDialog({ open: false });
    },
  });

  const movimentacaoMut = useMutation({
    mutationFn: ({ produtoId, data }: { produtoId: string; data: { tipo: 'entrada' | 'saida'; quantidade: number; motivo: string } }) =>
      registrarMovimentacaoEstoque(produtoId, data),
    onSuccess: (_result, { produtoId }) => {
      void invalidateProdutos();
      void qc.invalidateQueries({ queryKey: queryKeys.movimentacoesEstoque(produtoId) });
      setEstoqueDialog({ open: false });
    },
  });

  // Soft delete: o PUT aceita `ativo`, então o produto sai da vitrine sem ser apagado.
  const toggleAtivoMut = useMutation({
    mutationFn: (p: Produto) => saveProduto({ ...productFormData(p), ativo: !p.ativo }, p.id),
    onSuccess: () => {
      void invalidateProdutos();
      setDialog({ open: false });
    },
  });

  const vitrineUrl = vitrineQ.data ? storefrontPublicUrl(vitrineQ.data.link) : null;

  const copiarLink = () => {
    if (!vitrineUrl) return;
    void navigator.clipboard.writeText(vitrineUrl).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    });
  };

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativados}
            onChange={setMostrarDesativados}
            label={`${data.length} produto${data.length === 1 ? '' : 's'} ${mostrarDesativados ? 'desativado' : 'ativo'}${data.length === 1 ? '' : 's'}`}
          />
        }
        actionLabel="Novo produto"
        onAction={() => setDialog({ open: true })}
      />

      <InfoBanner>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>
            Apenas produtos ativos aparecem na vitrine.
            {vitrineUrl && (
              <>
                {' '}Link:{' '}
                <span style={{ fontWeight: 600, wordBreak: 'break-all' }}>{vitrineUrl}</span>
              </>
            )}
          </span>
          {vitrineUrl && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" style={smallButtonStyle} onClick={() => setVitrineOpen(true)}>
                <Store size={13} /> Configurar vitrine
              </button>
              <button type="button" style={smallButtonStyle} onClick={copiarLink}>
                <Link2 size={13} /> {linkCopiado ? 'Copiado' : 'Copiar link'}
              </button>
              <a href={vitrineUrl} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, textDecoration: 'none' }}>
                <ExternalLink size={13} /> Abrir
              </a>
            </span>
          )}
        </span>
      </InfoBanner>

      {produtosQ.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}
      {produtosQ.isError && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: C.danger }}>
          {produtosQ.error.message}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((p, i) => {
          const emEstoque = Number(p.quantidadeEstoque);
          const minimo = p.estoqueMinimo != null ? Number(p.estoqueMinimo) : null;
          const estoqueBaixo = p.controlaEstoque && minimo !== null && emEstoque <= minimo;
          const temDesconto = productDiscountOf(p) !== null;
          return (
            <ConfigListRow
              key={p.id}
              index={i}
              nome={p.nome}
              dataCriacao={p.createdAt}
              onClick={() => setDialog({ open: true, item: p })}
              badges={
                <>
                  {p.categoria && <span style={cfgBadgeStyle}>{p.categoria}</span>}
                  <span style={cfgBadgeStyle} title={temDesconto ? `De ${formatCurrency(Number(p.valor))}` : undefined}>
                    {formatCurrency(p.valorFinal)}
                  </span>
                  {p.descontoPercentual !== null && <span style={discountBadgeStyle}>-{p.descontoPercentual}%</span>}
                  {p.controlaEstoque && (
                    <>
                      <span
                        style={{
                          ...cfgBadgeStyle,
                          ...(estoqueBaixo ? { background: C.dangerBg, color: C.danger, borderColor: C.dangerBorder } : {}),
                        }}
                        title={estoqueBaixo ? `Abaixo do mínimo (${minimo})` : undefined}
                      >
                        {emEstoque} em estoque
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEstoqueDialog({ open: true, item: p }); }}
                        title="Registrar entrada ou saída"
                        aria-label={`Registrar entrada ou saída de ${p.nome}`}
                        style={smallButtonStyle}
                      >
                        <PackagePlus size={13} /> Estoque
                      </button>
                    </>
                  )}
                </>
              }
            />
          );
        })}
        {data.length === 0 && !produtosQ.isLoading && !produtosQ.isError && (
          <EmptyState
            icon={ShoppingBag}
            title={mostrarDesativados ? 'Nenhum produto desativado' : 'Nenhum produto cadastrado'}
            description={mostrarDesativados ? undefined : 'Crie produtos para exibir na sua vitrine pública.'}
          />
        )}
      </div>

      <ProdutoDialog
        key={dialog.item?.id ?? 'new'}
        open={dialog.open}
        produto={dialog.item}
        categorias={categorias}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => {
          if (accountId === null) return;
          saveMut.mutate({
            // Produto novo nasce na conta ativa; na edição a conta não muda.
            v: dialog.item ? v : { ...v, conta_id: accountId },
            id: dialog.item?.id,
          });
        }}
        onToggleActive={dialog.item ? () => toggleAtivoMut.mutate(dialog.item as Produto) : undefined}
      />

      <MovimentacaoDialog
        key={estoqueDialog.item?.id ?? 'sem-produto'}
        open={estoqueDialog.open}
        produto={estoqueDialog.item}
        isSaving={movimentacaoMut.isPending}
        error={movimentacaoMut.error?.message}
        onClose={() => setEstoqueDialog({ open: false })}
        onSave={(data) => {
          if (!estoqueDialog.item) return;
          movimentacaoMut.mutate({ produtoId: estoqueDialog.item.id, data });
        }}
      />

      {vitrineQ.data && accountId !== null && (
        <StorefrontDialog
          key={vitrineOpen ? `vitrine-${vitrineQ.data.id}` : 'vitrine-fechada'}
          open={vitrineOpen}
          accountId={accountId}
          config={vitrineQ.data}
          onClose={() => setVitrineOpen(false)}
        />
      )}
    </div>
  );
}
