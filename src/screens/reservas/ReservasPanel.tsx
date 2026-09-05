import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Check, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';

import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, dialogFooterStyle,
  saveButtonStyle, saveButtonDisabledStyle, MoneyField,
} from '../../ui/dialogFormTokens';
import { fetchReservas, saveReserva, deleteReserva, movimentar } from '../../services/reservasService';
import { queryKeys } from '../../services/queryKeys';
import { useConfirm } from '../../context/ConfirmContext';
import { useMovimentacoesConsolidadas } from '../../hooks/useMovimentacoesConsolidadas';
import { calcContribuicaoMensal } from '../../utils/reservaContribuicao';
import { formatCurrency } from '../finance/formatters';
import type { Reserva } from '../../types/reservas';

interface ReservasPanelProps {
  open: boolean;
  /** Data sugerida para a movimentação (mês/ano em que a tela está posicionada). */
  defaultDate: string;
  onClose: () => void;
}

type MovimentoAberto = { reservaId: number; tipo: 'deposito' | 'retirada' } | null;

const EMOJIS = ['💰', '🏠', '🚗', '✈️', '📚', '🛡️', '🎓', '💊', '🎮', '💻', '💶', '🐾'];

const CORES = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];

function formatDataHora(iso: string): string {
  const data = new Date(iso);
  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  // data_hora vem como date puro em movimentações antigas; nesse caso a hora
  // seria sempre 00:00 e não acrescenta informação.
  return hora === '00:00' ? dia : `${dia} · ${hora}`;
}

// ─── Formulário de movimentação, inline na linha da reserva ───────────────────

function MovimentoInline({
  reserva, tipo, isSaving, error, defaultDate, onCancel, onConfirm,
}: {
  reserva: Reserva;
  tipo: 'deposito' | 'retirada';
  isSaving: boolean;
  error?: string;
  defaultDate: string;
  onCancel: () => void;
  onConfirm: (valor: number, data: string, descricao?: string) => void;
}) {
  const [valor, setValor] = useState(0);
  const [data, setData] = useState(defaultDate);
  const [descricao, setDescricao] = useState('');

  const saldo = Number(reserva.valor);
  const excedeSaldo = tipo === 'retirada' && valor > saldo;
  const podeConfirmar = valor > 0 && !!data && !excedeSaldo && !isSaving;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!podeConfirmar) return;
    onConfirm(valor, data, descricao.trim() || undefined);
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        borderRadius: 10, padding: 10,
        border: `1px solid ${tipo === 'deposito' ? '#bbf0cf' : C.dangerBorder}`,
        background: tipo === 'deposito' ? '#f0fdf6' : '#fef3f2',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '150px 130px minmax(0,1fr)', gap: 8 }}>
        <div>
          <label style={labelStyle}>{tipo === 'deposito' ? 'Adicionar' : 'Retirar'}</label>
          <MoneyField value={valor || undefined} onChange={setValor} autoFocus />
        </div>
        <div>
          <label style={labelStyle}>Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={fieldInputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Descrição</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Aporte mensal"
            style={fieldInputStyle}
          />
        </div>
      </div>

      {(excedeSaldo || error) && (
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: C.danger }}>
          {excedeSaldo ? `Esta reserva tem ${formatCurrency(saldo)} disponível.` : error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: 30, padding: '0 12px', borderRadius: 999, border: 'none',
            background: 'transparent', color: C.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!podeConfirmar}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 30, padding: '0 14px', borderRadius: 999, border: 'none',
            fontSize: 12.5, fontWeight: 600, cursor: podeConfirmar ? 'pointer' : 'not-allowed',
            background: podeConfirmar ? (tipo === 'deposito' ? C.primary : C.danger) : '#e6edf1',
            color: podeConfirmar ? '#fff' : '#a3b6c0',
          }}
        >
          <Check size={12} strokeWidth={2.6} />
          {isSaving ? 'Confirmando...' : tipo === 'deposito' ? 'Adicionar' : 'Retirar'}
        </button>
      </div>
    </form>
  );
}

// ─── Linha de uma reserva ─────────────────────────────────────────────────────

function ReservaLinha({
  reserva, movimentoAberto, isSaving, error, defaultDate,
  onAbrirMovimento, onFecharMovimento, onConfirmar, onEditar, onExcluir,
}: {
  reserva: Reserva;
  movimentoAberto: MovimentoAberto;
  isSaving: boolean;
  error?: string;
  defaultDate: string;
  onAbrirMovimento: (tipo: 'deposito' | 'retirada') => void;
  onFecharMovimento: () => void;
  onConfirmar: (valor: number, data: string, descricao?: string) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const cor = reserva.cor ?? '#6366f1';
  const saldo = Number(reserva.valor);
  const meta = Number(reserva.objetivo_valor ?? 0);
  const temMeta = meta > 0;
  const pct = temMeta ? Math.min(100, (saldo / meta) * 100) : 0;
  const contribuicao = temMeta && reserva.data_objetivo
    ? calcContribuicaoMensal(saldo, meta, reserva.data_objetivo)
    : null;

  const aberto = movimentoAberto?.reservaId === reserva.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          minHeight: 40, padding: '6px 12px', borderRadius: 12,
          border: '1px solid #e9eef3', background: '#fff',
        }}
      >
        <span
          style={{
            display: 'flex', flex: 'none', height: 30, width: 30, alignItems: 'center', justifyContent: 'center',
            borderRadius: 9, background: `${cor}18`, fontSize: 15,
          }}
        >
          {reserva.icone ?? '💰'}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {reserva.observacoes || 'Reserva sem nome'}
          </p>
          {temMeta && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ height: 3, flex: 1, maxWidth: 120, borderRadius: 999, background: '#f1f5f9' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: cor }} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 500, color: C.textMuted }}>
                {pct.toFixed(0)}% de {formatCurrency(meta)}
                {contribuicao !== null && ` · ${formatCurrency(contribuicao)}/mês`}
              </span>
            </div>
          )}
        </div>

        <span style={{ flex: 'none', fontSize: 14, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(saldo)}
        </span>

        <div style={{ display: 'flex', flex: 'none', gap: 4 }}>
          <button
            type="button"
            onClick={() => onAbrirMovimento('deposito')}
            title="Adicionar valor"
            style={{
              display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid #d8e0e8', background: '#fff', color: '#067647', cursor: 'pointer',
            }}
          >
            <ArrowDownToLine size={13} />
          </button>
          <button
            type="button"
            onClick={() => onAbrirMovimento('retirada')}
            title="Retirar valor"
            disabled={saldo <= 0}
            style={{
              display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid #d8e0e8', background: '#fff',
              color: saldo > 0 ? C.danger : '#c7d3db', cursor: saldo > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <ArrowUpFromLine size={13} />
          </button>
          <button
            type="button"
            onClick={onEditar}
            title="Editar reserva"
            aria-label={`Editar ${reserva.observacoes || 'reserva'}`}
            style={{
              display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer',
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onExcluir}
            title="Excluir reserva"
            aria-label={`Excluir ${reserva.observacoes || 'reserva'}`}
            style={{
              display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {aberto && (
        <MovimentoInline
          reserva={reserva}
          tipo={movimentoAberto.tipo}
          isSaving={isSaving}
          error={error}
          defaultDate={defaultDate}
          onCancel={onFecharMovimento}
          onConfirm={onConfirmar}
        />
      )}
    </div>
  );
}

// ─── Painel ───────────────────────────────────────────────────────────────────

export function ReservasPanel({ open, defaultDate, onClose }: ReservasPanelProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  // null = fechado; { id: undefined } = criando; { id: n } = editando aquela reserva.
  const [formAberto, setFormAberto] = useState<{ id?: number } | null>(null);
  const [nome, setNome] = useState('');
  const [icone, setIcone] = useState('💰');
  const [cor, setCor] = useState(CORES[0]!);
  const [meta, setMeta] = useState(0);
  const [metaData, setMetaData] = useState('');
  const [movimentoAberto, setMovimentoAberto] = useState<MovimentoAberto>(null);

  const reservasQuery = useQuery({
    queryKey: queryKeys.reservas,
    queryFn: fetchReservas,
    enabled: open,
  });
  const reservas = useMemo(() => reservasQuery.data ?? [], [reservasQuery.data]);

  const { movimentacoes, isLoading: carregandoHistorico } = useMovimentacoesConsolidadas(
    reservas,
    open && reservas.length > 0,
  );

  const fecharForm = () => {
    setFormAberto(null);
    setNome('');
    setIcone('💰');
    setCor(CORES[0]!);
    setMeta(0);
    setMetaData('');
  };

  useEffect(() => {
    if (open) return;
    fecharForm();
    setMovimentoAberto(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.reservas });
    for (const reserva of reservas) {
      void qc.invalidateQueries({ queryKey: queryKeys.movimentacoes(reserva.id) });
    }
  };

  // Um formulário só para criar e editar: saveReserva já faz POST ou PUT
  // conforme receber id.
  const salvarMut = useMutation({
    mutationFn: () => saveReserva(
      {
        observacoes: nome.trim(),
        icone,
        cor,
        objetivo_valor: meta > 0 ? meta : undefined,
        data_objetivo: metaData || undefined,
      },
      formAberto?.id,
    ),
    onSuccess: () => {
      invalidar();
      fecharForm();
    },
  });

  const excluirMut = useMutation({
    mutationFn: deleteReserva,
    onSuccess: invalidar,
  });

  const abrirCriacao = () => {
    salvarMut.reset();
    setNome('');
    setIcone('💰');
    setCor(CORES[0]!);
    setMeta(0);
    setMetaData('');
    setFormAberto({});
  };

  const abrirEdicao = (reserva: Reserva) => {
    salvarMut.reset();
    setNome(reserva.observacoes ?? '');
    setIcone(reserva.icone ?? '💰');
    setCor(reserva.cor ?? CORES[0]!);
    setMeta(Number(reserva.objetivo_valor ?? 0));
    setMetaData(reserva.data_objetivo?.slice(0, 10) ?? '');
    setFormAberto({ id: reserva.id });
  };

  const handleExcluir = async (reserva: Reserva) => {
    const ok = await confirm({
      title: 'Excluir reserva',
      message: `Excluir "${reserva.observacoes || 'reserva sem nome'}"? O histórico de movimentações dela também será perdido.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (ok) excluirMut.mutate(reserva.id);
  };

  const movimentarMut = useMutation({
    mutationFn: ({ id, tipo, valor, data, descricao }: {
      id: number; tipo: 'deposito' | 'retirada'; valor: number; data: string; descricao?: string;
    }) => movimentar(id, { tipo, valor, data, descricao }),
    onSuccess: () => {
      invalidar();
      setMovimentoAberto(null);
    },
  });

  const totalReservado = reservas.reduce((soma, reserva) => soma + Number(reserva.valor), 0);

  return (
    <Dialog open={open} title="Reservas" onClose={onClose} size="lg" scrollBody={false}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Total reservado — o valor que está separado do saldo da conta. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted }}>
                Total reservado
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalReservado)}
              </p>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: C.textMuted }}>
              {reservas.length} reserva{reservas.length === 1 ? '' : 's'} · separado do saldo disponível
            </p>
          </div>

          <div style={{ height: 1, background: '#eef2f6' }} />

          {/* Lista de reservas */}
          {reservasQuery.isLoading ? (
            <p style={{ margin: 0, padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: C.textMuted }}>
              Carregando reservas...
            </p>
          ) : reservas.length === 0 && !formAberto ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <PiggyBank size={26} strokeWidth={1.5} style={{ color: '#c7d3db' }} />
              <p style={{ margin: '6px 0 0', fontSize: 12.5, fontWeight: 600, color: C.textSoft }}>Nenhuma reserva ainda</p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.textMuted }}>
                Crie uma reserva para separar dinheiro do seu saldo.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reservas.map((reserva) => (
                <ReservaLinha
                  key={reserva.id}
                  reserva={reserva}
                  movimentoAberto={movimentoAberto}
                  isSaving={movimentarMut.isPending}
                  error={movimentarMut.error instanceof Error ? movimentarMut.error.message : undefined}
                  defaultDate={defaultDate}
                  onAbrirMovimento={(tipo) => {
                    movimentarMut.reset();
                    setMovimentoAberto({ reservaId: reserva.id, tipo });
                  }}
                  onFecharMovimento={() => setMovimentoAberto(null)}
                  onConfirmar={(valor, data, descricao) =>
                    movimentarMut.mutate({ id: reserva.id, tipo: movimentoAberto!.tipo, valor, data, descricao })}
                  onEditar={() => abrirEdicao(reserva)}
                  onExcluir={() => void handleExcluir(reserva)}
                />
              ))}
            </div>
          )}

          {/* Criar ou editar reserva — o mesmo formulário nos dois casos */}
          {formAberto ? (
            <form
              onSubmit={(event) => { event.preventDefault(); if (nome.trim().length >= 2) salvarMut.mutate(); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 10, border: `1px solid ${C.primary}`, background: C.primarySoft, padding: 10 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px 140px', gap: 8 }}>
                <div>
                  <label style={labelStyle}><span>Nome da reserva</span><span style={{ color: C.danger }}>*</span></label>
                  <input
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                    placeholder="Ex: Fundo de emergência"
                    autoFocus
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Meta</label>
                  <MoneyField value={meta || undefined} onChange={setMeta} />
                </div>
                <div>
                  <label style={labelStyle}>Prazo da meta</label>
                  <input type="date" value={metaData} onChange={(event) => setMetaData(event.target.value)} style={fieldInputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'start' }}>
                <div>
                  <label style={labelStyle}>Ícone</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcone(emoji)}
                        style={{
                          height: 28, width: 28, borderRadius: 8, fontSize: 14, cursor: 'pointer',
                          border: icone === emoji ? `2px solid ${C.primary}` : '1px solid #d8e0e8',
                          background: '#fff',
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Cor</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 132 }}>
                    {CORES.map((opcao) => (
                      <button
                        key={opcao}
                        type="button"
                        onClick={() => setCor(opcao)}
                        aria-label={`Cor ${opcao}`}
                        style={{
                          height: 20, width: 20, borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: opcao,
                          boxShadow: cor === opcao ? `0 0 0 2px #fff, 0 0 0 4px ${C.primary}` : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {salvarMut.error instanceof Error && (
                <p style={{ margin: 0, fontSize: 11.5, color: C.danger }}>{salvarMut.error.message}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={fecharForm}
                  style={{ height: 30, padding: '0 12px', borderRadius: 999, border: 'none', background: 'transparent', color: C.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={nome.trim().length < 2 || salvarMut.isPending}
                  style={nome.trim().length < 2 || salvarMut.isPending
                    ? saveButtonDisabledStyle
                    : saveButtonStyle}
                >
                  {salvarMut.isPending ? 'Salvando...' : formAberto.id ? 'Salvar' : 'Criar reserva'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={abrirCriacao}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                height: 30, borderRadius: 999, border: '1px dashed #d8e0e8',
                background: 'transparent', color: C.textMuted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Plus size={12} strokeWidth={2.6} />
              Nova reserva
            </button>
          )}

          {/* Histórico único de todas as reservas */}
          {reservas.length > 0 && (
            <>
              <div style={{ height: 1, background: '#eef2f6' }} />
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted }}>
                  Histórico de movimentações
                </p>

                {carregandoHistorico ? (
                  <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>Carregando...</p>
                ) : movimentacoes.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
                    Nenhuma movimentação registrada ainda.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {movimentacoes.map((movimentacao) => {
                      const entrada = movimentacao.tipo === 'entrada';
                      return (
                        <div
                          key={`${movimentacao.reserva_id}-${movimentacao.id}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 0', borderBottom: '1px solid #f4f7f9', fontSize: 11.5,
                          }}
                        >
                          <span
                            style={{
                              display: 'flex', flex: 'none', height: 20, width: 20, alignItems: 'center', justifyContent: 'center',
                              borderRadius: 6, background: entrada ? '#e8f8ef' : '#fdecec',
                              color: entrada ? '#067647' : C.danger,
                            }}
                          >
                            {entrada ? <ArrowDownToLine size={11} /> : <ArrowUpFromLine size={11} />}
                          </span>
                          <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: movimentacao.reservaCor }} />
                          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {movimentacao.reservaNome}
                          </span>
                          {movimentacao.observacoes && (
                            <span style={{ flex: 'none', maxWidth: 160, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {movimentacao.observacoes}
                            </span>
                          )}
                          <span style={{ flex: 'none', color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                            {formatDataHora(movimentacao.data_hora)}
                          </span>
                          <span style={{
                            flex: 'none', width: 92, textAlign: 'right', fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: entrada ? '#067647' : C.danger,
                          }}>
                            {entrada ? '+' : '−'} {formatCurrency(Number(movimentacao.valor))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...saveButtonStyle, background: 'transparent', color: C.textMuted }}
          >
            Fechar
          </button>
        </div>
      </div>
    </Dialog>
  );
}
