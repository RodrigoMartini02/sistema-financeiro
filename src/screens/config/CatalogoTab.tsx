import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import {
  fetchProdutos, saveProduto, fetchCatalogoConta,
  type Produto, type ProdutoImagem,
} from '../../services/catalogoService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, MoneyField, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { CFG, cfgBadgeStyle } from '../../ui/configTokens';
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
  onSave: (data: { nome: string; descricao: string; valor: number }) => void;
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
    onSave({
      nome: (fd.get('nome') as string).trim(),
      descricao: (fd.get('descricao') as string).trim(),
      valor: valor ?? 0,
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

          <div style={{ height: 1, background: '#eef2f6' }} />

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

export function CatalogoTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Produto }>({ open: false });
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const produtosQ = useQuery({ queryKey: queryKeys.catalogoProdutos, queryFn: () => fetchProdutos() });
  const contaQ = useQuery({ queryKey: queryKeys.catalogoConta, queryFn: () => fetchCatalogoConta() });
  const todos = produtosQ.data ?? [];
  const data = todos.filter((p) => (mostrarDesativados ? !p.ativo : p.ativo));

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: { nome: string; descricao: string; valor: number }; id?: string }) =>
      saveProduto(v, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos });
      setDialog({ open: false });
    },
  });

  // Soft delete: o PUT aceita `ativo`, então o produto sai da vitrine sem ser
  // apagado — diferente do DELETE, que é definitivo.
  const toggleAtivoMut = useMutation({
    mutationFn: (p: Produto) => saveProduto({
      nome: p.nome,
      descricao: p.descricao ?? '',
      valor: Number(p.valor),
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
        {data.map((p, i) => (
          <ConfigListRow
            key={p.id}
            index={i}
            nome={p.nome}
            dataCriacao={p.createdAt}
            onClick={() => setDialog({ open: true, item: p })}
            badges={<span style={cfgBadgeStyle}>{formatCurrency(Number(p.valor))}</span>}
          />
        ))}
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
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onDelete={dialog.item ? () => toggleAtivoMut.mutate(dialog.item as Produto) : undefined}
      />
    </div>
  );
}
