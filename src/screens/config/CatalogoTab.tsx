import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, PackagePlus } from 'lucide-react';
import {
  fetchProdutos, saveProduto, fetchCatalogoConta, registrarMovimentacaoEstoque, fetchMovimentacoesEstoque,
  type Produto, type ProdutoImagem, type ProdutoFormData,
} from '../../services/catalogoService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, MoneyField, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { CFG, cfgBadgeStyle, cfgDividerStyle } from '../../ui/configTokens';
import { InfoBanner } from '../../ui/InfoBanner';
import { EmptyState } from '../../ui/EmptyState';
import { formatCurrency } from '../finance/formatters';
import { useConfirm } from '../../context/ConfirmContext';
import { ProdutoImagensManager } from '../../components/ProdutoImagensManager';

function ProdutoDialog({
  open, produto, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean;
  produto?: Produto;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (data: { nome: string; descricao: string; valor: number; estoque_minimo: number | null }) => void;
  onDelete?: () => void;
}) {
  const confirm = useConfirm();
  const [valor, setValor] = useState<number | undefined>(produto ? Number(produto.valor) : undefined);
  const [imagens, setImagens] = useState<ProdutoImagem[]>(produto?.imagens ?? []);

  const handleDelete = async () => {
    if (!onDelete) return;
    const ativo = produto?.ativo ?? true;
    const ok = await confirm({
      title: ativo ? 'Desativar produto' : 'Ativar produto',
      message: ativo
        ? `Desativar "${produto?.nome}"? Ele deixará de aparecer na vitrine pública.`
        : `Ativar "${produto?.nome}" novamente?`,
      confirmLabel: ativo ? 'Desativar' : 'Ativar',
      variant: ativo ? 'danger' : 'default',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const minimoBruto = (fd.get('estoque_minimo') as string ?? '').trim();
    onSave({
      nome: (fd.get('nome') as string).trim(),
      descricao: (fd.get('descricao') as string).trim(),
      valor: valor ?? 0,
      // Vazio = produto sem alerta de estoque baixo, nao zero.
      estoque_minimo: minimoBruto === '' ? null : Number(minimoBruto),
    });
  };

  return (
    <Dialog open={open} title={produto ? 'Editar produto' : 'Novo produto'} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 320, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <label style={labelStyle}>Descrição</label>
            <textarea
              name="descricao"
              defaultValue={produto?.descricao ?? ''}
              placeholder="Descreva o produto..."
              rows={3}
              style={{ ...fieldInputStyle, height: 'auto', padding: '8px 9px', resize: 'vertical' }}
            />
          </div>

          <div style={cfgDividerStyle} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Em estoque</label>
              {/* Somente leitura: o saldo so muda por entrada/saida registrada,
                  para o historico sempre explicar como ele chegou aqui. */}
              <div style={{ ...fieldInputStyle, display: 'flex', alignItems: 'center', background: CFG.chipBg, color: CFG.muted }}>
                {produto ? Number(produto.quantidadeEstoque) : 0}
              </div>
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

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {produto && onDelete && (
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>
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
  const [dialog, setDialog] = useState<{ open: boolean; item?: Produto }>({ open: false });
  const [estoqueDialog, setEstoqueDialog] = useState<{ open: boolean; item?: Produto }>({ open: false });
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const produtosQ = useQuery({ queryKey: queryKeys.catalogoProdutos, queryFn: () => fetchProdutos() });
  const contaQ = useQuery({ queryKey: queryKeys.catalogoConta, queryFn: () => fetchCatalogoConta() });
  const todos = produtosQ.data ?? [];
  const data = todos.filter((p) => (mostrarDesativados ? !p.ativo : p.ativo));

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: ProdutoFormData; id?: string }) => saveProduto(v, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos });
      setDialog({ open: false });
    },
  });

  const movimentacaoMut = useMutation({
    mutationFn: ({ produtoId, data }: { produtoId: string; data: { tipo: 'entrada' | 'saida'; quantidade: number; motivo: string } }) =>
      registrarMovimentacaoEstoque(produtoId, data),
    onSuccess: (_result, { produtoId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos });
      void qc.invalidateQueries({ queryKey: queryKeys.movimentacoesEstoque(produtoId) });
      setEstoqueDialog({ open: false });
    },
  });

  // Soft delete: o PUT aceita `ativo`, então o produto sai da vitrine sem ser
  // apagado — diferente do DELETE, que é definitivo.
  const toggleAtivoMut = useMutation({
    mutationFn: (p: Produto) => saveProduto({
      nome: p.nome,
      descricao: p.descricao ?? '',
      valor: Number(p.valor),
      // Reenviado junto: o PUT sobrescreve o que recebe, e omitir aqui
      // apagaria o minimo configurado so por desativar o produto.
      estoque_minimo: p.estoqueMinimo != null ? Number(p.estoqueMinimo) : null,
      ativo: !p.ativo,
    }, p.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos });
      setDialog({ open: false });
    },
  });

  const vitrineUrl = contaQ.data ? `${window.location.origin}/catalogo/${contaQ.data.id}` : null;

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
        <span>
          Apenas produtos ativos aparecem na vitrine pública.
          {vitrineUrl && (
            <>
              {' '}Link da sua vitrine:{' '}
              <a href={vitrineUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600, textDecoration: 'underline', color: 'inherit' }}>
                {vitrineUrl}
              </a>
            </>
          )}
        </span>
      </InfoBanner>

      {produtosQ.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((p, i) => {
          const emEstoque = Number(p.quantidadeEstoque);
          const minimo = p.estoqueMinimo != null ? Number(p.estoqueMinimo) : null;
          const estoqueBaixo = minimo !== null && emEstoque <= minimo;
          return (
            <ConfigListRow
              key={p.id}
              index={i}
              nome={p.nome}
              dataCriacao={p.createdAt}
              onClick={() => setDialog({ open: true, item: p })}
              badges={
                <>
                  <span style={cfgBadgeStyle}>{formatCurrency(Number(p.valor))}</span>
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
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 9px',
                      borderRadius: 999, border: `1px solid ${CFG.borderSoft}`, background: '#fff',
                      fontSize: 11.5, fontWeight: 600, color: CFG.chipText, cursor: 'pointer',
                    }}
                  >
                    <PackagePlus size={13} /> Estoque
                  </button>
                </>
              }
            />
          );
        })}
        {data.length === 0 && !produtosQ.isLoading && (
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
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({
          v: {
            ...v,
            // Produto novo nasce na conta ativa; ao editar, a conta atual do
            // produto e preservada (campo omitido nao troca a conta).
            ...(dialog.item ? {} : { conta_id: getActiveAccountId() }),
          },
          id: dialog.item?.id,
        })}
        onDelete={dialog.item ? () => toggleAtivoMut.mutate(dialog.item as Produto) : undefined}
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
    </div>
  );
}
