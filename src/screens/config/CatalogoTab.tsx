import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Plus } from 'lucide-react';
import {
  fetchProdutos, saveProduto, deleteProduto, fetchCatalogoConta,
  type Produto, type ProdutoImagem,
} from '../../services/catalogoService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, MoneyField, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { CFG } from '../../ui/configTokens';
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
    const ok = await confirm({
      title: 'Excluir produto',
      message: `Excluir "${produto?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
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
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME DO PRODUTO</span><span style={{ color: C.primary }}>*</span></label>
              <input
                name="nome"
                defaultValue={produto?.nome}
                placeholder="Ex: Camiseta, Caneca, Kit..."
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DESCRIÇÃO</label>
              <textarea
                name="descricao"
                defaultValue={produto?.descricao ?? ''}
                placeholder="Descreva o produto..."
                rows={3}
                style={{ ...fieldInputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
              />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>VALOR</span><span style={{ color: C.primary }}>*</span></label>
              <MoneyField value={valor} onChange={setValor} />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>IMAGENS</label>
              {produto ? (
                <ProdutoImagensManager produtoId={produto.id} imagens={imagens} onChange={setImagens} />
              ) : (
                <p style={{ fontSize: 12, color: C.textFaint }}>Salve o produto para poder adicionar imagens.</p>
              )}
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {produto && onDelete && (
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Excluir</button>
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

  const produtosQ = useQuery({ queryKey: queryKeys.catalogoProdutos, queryFn: () => fetchProdutos() });
  const contaQ = useQuery({ queryKey: queryKeys.catalogoConta, queryFn: () => fetchCatalogoConta() });
  const data = produtosQ.data ?? [];

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: { nome: string; descricao: string; valor: number }; id?: string }) =>
      saveProduto(v, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos });
      setDialog({ open: false });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteProduto,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalogoProdutos });
      setDialog({ open: false });
    },
  });

  const vitrineUrl = contaQ.data ? `${window.location.origin}/catalogo/${contaQ.data.id}` : null;

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        countLabel={`${data.length} produto${data.length !== 1 ? 's' : ''} no catálogo`}
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

      <div className="grid gap-1.5">
        {data.map((p, i) => (
          <ConfigListRow
            key={p.id}
            index={i}
            nome={`${p.nome} — ${formatCurrency(Number(p.valor))}${p.ativo ? '' : ' (inativo)'}`}
            dataCriacao={p.createdAt}
            onClick={() => setDialog({ open: true, item: p })}
          />
        ))}
        {data.length === 0 && !produtosQ.isLoading && (
          <EmptyState
            title="Nenhum produto cadastrado"
            description="Crie produtos para exibir na sua vitrine pública."
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
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
