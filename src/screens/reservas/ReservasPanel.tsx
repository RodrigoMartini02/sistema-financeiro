import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Check, PiggyBank, Plus } from 'lucide-react';

import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, dialogFooterStyle,
  saveButtonStyle, saveButtonDisabledStyle, MoneyField,
} from '../../ui/dialogFormTokens';
import { fetchReservas, saveReserva, movimentar } from '../../services/reservasService';
import { queryKeys } from '../../services/queryKeys';
import { useMovimentacoesConsolidadas } from '../../hooks/useMovimentacoesConsolidadas';
import { calcContribuicaoMensal } from '../../utils/reservaContribuicao';
import { formatCurrency } from '../finance/formatters';
import type { Reserva } from '../../types/reservas';

interface ReservasPanelProps {
  open: boolean;
  /** Data sugerida para a movimentação (mês/ano em que a tela está posicionada). */
  defaultDate: string;
  onClose: () => void;
  /**
   * Leva à tela de Reservas, onde dá para editar cor, ícone, meta e excluir.
   * Omitido quando o painel já é aberto de dentro dessa tela.
   */
  onGerenciar?: () => void;
}

type MovimentoAberto = { reservaId: number; tipo: 'deposito' | 'retirada' } | null;

const EMOJIS = ['💰', '🏠', '🚗', '✈️', '📚', '🛡️', '🎓', '💊', '🎮', '💻', '💶', '🐾'];

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
            height: 28, padding: '0 12px', borderRadius: 999, border: 'none',
            background: 'transparent', color: C.textMuted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!podeConfirmar}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 28, padding: '0 14px', borderRadius: 999, border: 'none',
            fontSize: 11.5, fontWeight: 600, cursor: podeConfirmar ? 'pointer' : 'not-allowed',
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
  reserva, movimentoAberto, isSaving, error, defaultDate, onAbrirMovimento, onFecharMovimento, onConfirmar,
}: {
  reserva: Reserva;
  movimentoAberto: MovimentoAberto;
  isSaving: boolean;
  error?: string;
  defaultDate: string;
  onAbrirMovimento: (tipo: 'deposito' | 'retirada') => void;
  onFecharMovimento: () => void;
  onConfirmar: (valor: number, data: string, descricao?: string) => void;
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
          minHeight: 44, padding: '8px 12px', borderRadius: 12,
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
              display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center',
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
              display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid #d8e0e8', background: '#fff',
              color: saldo > 0 ? C.danger : '#c7d3db', cursor: saldo > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <ArrowUpFromLine size={13} />
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

export function ReservasPanel({ open, defaultDate, onClose, onGerenciar }: ReservasPanelProps) {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoIcone, setNovoIcone] = useState('💰');
  const [novaMeta, setNovaMeta] = useState(0);
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

  useEffect(() => {
    if (open) return;
    setCriando(false);
    setNovoNome('');
    setNovoIcone('💰');
    setNovaMeta(0);
    setMovimentoAberto(null);
  }, [open]);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.reservas });
    for (const reserva of reservas) {
      void qc.invalidateQueries({ queryKey: queryKeys.movimentacoes(reserva.id) });
    }
  };

  const criarMut = useMutation({
    mutationFn: () => saveReserva({
      observacoes: novoNome.trim(),
      icone: novoIcone,
      objetivo_valor: novaMeta > 0 ? novaMeta : undefined,
    }),
    onSuccess: () => {
      invalidar();
      setCriando(false);
      setNovoNome('');
      setNovoIcone('💰');
      setNovaMeta(0);
    },
  });

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
          ) : reservas.length === 0 && !criando ? (
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
                />
              ))}
            </div>
          )}

          {/* Criar reserva */}
          {criando ? (
            <form
              onSubmit={(event) => { event.preventDefault(); if (novoNome.trim().length >= 2) criarMut.mutate(); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 10, border: `1px solid ${C.primary}`, background: C.primarySoft, padding: 10 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 8 }}>
                <div>
                  <label style={labelStyle}><span>Nome da reserva</span><span style={{ color: C.danger }}>*</span></label>
                  <input
                    value={novoNome}
                    onChange={(event) => setNovoNome(event.target.value)}
                    placeholder="Ex: Fundo de emergência"
                    autoFocus
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Meta</label>
                  <MoneyField value={novaMeta || undefined} onChange={setNovaMeta} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Ícone</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNovoIcone(emoji)}
                      style={{
                        height: 28, width: 28, borderRadius: 8, fontSize: 14, cursor: 'pointer',
                        border: novoIcone === emoji ? `2px solid ${C.primary}` : '1px solid #d8e0e8',
                        background: '#fff',
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {criarMut.error instanceof Error && (
                <p style={{ margin: 0, fontSize: 11.5, color: C.danger }}>{criarMut.error.message}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setCriando(false); criarMut.reset(); }}
                  style={{ height: 28, padding: '0 12px', borderRadius: 999, border: 'none', background: 'transparent', color: C.textMuted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={novoNome.trim().length < 2 || criarMut.isPending}
                  style={novoNome.trim().length < 2 || criarMut.isPending
                    ? { ...saveButtonDisabledStyle, height: 28, fontSize: 11.5 }
                    : { ...saveButtonStyle, height: 28, fontSize: 11.5 }}
                >
                  {criarMut.isPending ? 'Criando...' : 'Criar reserva'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCriando(true)}
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

        <div style={dialogFooterStyle}>
          {/* Editar cor, ícone, meta e excluir seguem na tela de Reservas. */}
          {onGerenciar && (
            <button
              type="button"
              onClick={onGerenciar}
              style={{ ...saveButtonStyle, background: 'transparent', color: C.primaryDark }}
            >
              Gerenciar reservas
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...saveButtonStyle, background: 'transparent', color: C.textMuted }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
