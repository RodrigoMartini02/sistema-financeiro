import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';

import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle,
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

const EMOJIS = ['💰', '🏠', '🚗', '✈️', '📚', '🛡️', '🎓', '💊', '🎮', '💻', '💶', '🐾'];

const EMOJI_PADRAO = '💰';

/**
 * Protege contra ícone corrompido vindo do banco (mojibake de UTF-8 lido como
 * Latin-1, que aparece como "ō¥°"). Emoji de verdade cai em Symbol/Other na
 * tabela Unicode; qualquer outra coisa vira o padrão.
 */
function emojiSeguro(valor: string | null | undefined): string {
  if (!valor) return EMOJI_PADRAO;
  return /\p{Extended_Pictographic}/u.test(valor) ? valor : EMOJI_PADRAO;
}

const CORES = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];

// Equivalentes locais de cfgIconButtonStyle e do botão de cancelar: os tokens
// cfg* resolvem via var(--cfg-*), que só existe dentro do .config-scope — e
// este painel vive em Movimentações, fora dele.
const iconButtonBase: CSSProperties = {
  display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center',
  borderRadius: 8,
};

const cancelButtonStyle: CSSProperties = {
  height: 30, padding: '0 12px', borderRadius: 999, border: 'none',
  background: 'transparent', color: C.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

/**
 * O backend responde em inglês; aqui vira texto que o usuário entende, com a
 * saída quando existe uma (reabrir o mês). Mensagem desconhecida passa direto,
 * em vez de virar um genérico que esconde a causa.
 */
function traduzirErro(mensagem: string): string {
  if (mensagem.includes('closed month')) {
    return 'Este mês está fechado. Reabra o mês em Movimentações para registrar a movimentação.';
  }
  const disponivel = /Available: R\$ ([\d.]+)/.exec(mensagem)?.[1];
  if (mensagem.includes('Insufficient reserve balance')) {
    return `Esta reserva tem apenas ${formatCurrency(Number(disponivel ?? 0))} disponível.`;
  }
  if (mensagem.includes('Insufficient balance')) {
    return `Saldo disponível insuficiente: ${formatCurrency(Number(disponivel ?? 0))}.`;
  }
  return mensagem;
}

function formatDataHora(iso: string): string {
  const data = new Date(iso);
  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  // data_hora vem como date puro em movimentações antigas; nesse caso a hora
  // seria sempre 00:00 e não acrescenta informação.
  return hora === '00:00' ? dia : `${dia} · ${hora}`;
}

// ─── Linha de uma reserva ─────────────────────────────────────────────────────

function ReservaLinha({
  reserva, isSaving, onMovimentar, onEditar, onExcluir,
}: {
  reserva: Reserva;
  isSaving: boolean;
  onMovimentar: (tipo: 'deposito' | 'retirada', valor: number) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  // O valor a movimentar vive na própria linha: digita e clica na seta. Antes
  // isso abria um formulário com valor, data e descrição.
  const [valor, setValor] = useState(0);

  const cor = reserva.cor ?? '#6366f1';
  const saldo = Number(reserva.valor);
  const meta = Number(reserva.objetivo_valor ?? 0);
  const temMeta = meta > 0;
  const pct = temMeta ? Math.min(100, (saldo / meta) * 100) : 0;
  const contribuicao = temMeta && reserva.data_objetivo
    ? calcContribuicaoMensal(saldo, meta, reserva.data_objetivo)
    : null;

  const podeDepositar = valor > 0 && !isSaving;
  const podeRetirar = valor > 0 && valor <= saldo && !isSaving;

  const aplicar = (tipo: 'deposito' | 'retirada') => {
    onMovimentar(tipo, valor);
    setValor(0);
  };

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
          {emojiSeguro(reserva.icone)}
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

        <div style={{ flex: 'none', width: 110 }}>
          <MoneyField value={valor || undefined} onChange={setValor} />
        </div>

        <div style={{ display: 'flex', flex: 'none', gap: 4 }}>
          <button
            type="button"
            onClick={() => aplicar('deposito')}
            disabled={!podeDepositar}
            title="Adicionar o valor digitado"
            aria-label={`Adicionar valor em ${reserva.observacoes || 'reserva'}`}
            style={{
              ...iconButtonBase, border: 'none',
              background: podeDepositar ? C.success : '#eef2f6',
              color: podeDepositar ? '#fff' : '#c7d3db',
              cursor: podeDepositar ? 'pointer' : 'not-allowed',
            }}
          >
            <ArrowDownToLine size={13} />
          </button>
          <button
            type="button"
            onClick={() => aplicar('retirada')}
            disabled={!podeRetirar}
            title={valor > saldo ? `Esta reserva tem ${formatCurrency(saldo)}` : 'Retirar o valor digitado'}
            aria-label={`Retirar valor de ${reserva.observacoes || 'reserva'}`}
            style={{
              ...iconButtonBase, border: 'none',
              background: podeRetirar ? C.danger : '#eef2f6',
              color: podeRetirar ? '#fff' : '#c7d3db',
              cursor: podeRetirar ? 'pointer' : 'not-allowed',
            }}
          >
            <ArrowUpFromLine size={13} />
          </button>
          <button
            type="button"
            onClick={onEditar}
            title="Editar reserva"
            aria-label={`Editar ${reserva.observacoes || 'reserva'}`}
            style={{ ...iconButtonBase, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer' }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onExcluir}
            title="Excluir reserva"
            aria-label={`Excluir ${reserva.observacoes || 'reserva'}`}
            style={{ ...iconButtonBase, border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel ───────────────────────────────────────────────────────────────────

export function ReservasPanel({ open, defaultDate, onClose }: ReservasPanelProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  // null = fechado; { id: undefined } = criando; { id: n } = editando aquela reserva.
  const [formAberto, setFormAberto] = useState<{ id?: number } | null>(null);
  // Erro de movimentar ou excluir. Sem isso a acao falhava em silencio.
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [icone, setIcone] = useState('💰');
  const [cor, setCor] = useState(CORES[0]!);
  const [meta, setMeta] = useState(0);
  const [metaData, setMetaData] = useState('');

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
    setErroAcao(null);
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
    onMutate: () => setErroAcao(null),
    onSuccess: invalidar,
    onError: (erro) => setErroAcao(traduzirErro(erro instanceof Error ? erro.message : String(erro))),
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
    mutationFn: ({ id, tipo, valor, data }: {
      id: number; tipo: 'deposito' | 'retirada'; valor: number; data: string;
    }) => movimentar(id, { tipo, valor, data }),
    onMutate: () => setErroAcao(null),
    onSuccess: () => {
      setErroAcao(null);
      invalidar();
    },
    onError: (erro) => setErroAcao(traduzirErro(erro instanceof Error ? erro.message : String(erro))),
  });

  const totalReservado = reservas.reduce((soma, reserva) => soma + Number(reserva.valor), 0);

  return (
    <Dialog open={open} title="Reservas" onClose={onClose} size="lg" scrollBody={false}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* O corpo não rola: total, lista e criação ficam sempre visíveis. Só o
            histórico, que cresce sem limite, tem scroll próprio. */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

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

          {erroAcao && (
            <div
              role="alert"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                borderRadius: 10, border: `1px solid ${C.dangerBorder}`,
                background: C.dangerBg, padding: '8px 10px',
                fontSize: 11.5, fontWeight: 500, color: C.danger,
              }}
            >
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{erroAcao}</span>
            </div>
          )}

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
                  isSaving={movimentarMut.isPending}
                  onMovimentar={(tipo, valor) =>
                    movimentarMut.mutate({ id: reserva.id, tipo, valor, data: defaultDate })}
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
                  style={cancelButtonStyle}
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
              <div style={{ flex: 1, minHeight: 90, display: 'flex', flexDirection: 'column' }}>
                <p style={{ margin: '0 0 8px', flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted }}>
                  Histórico de movimentações
                </p>

                {carregandoHistorico ? (
                  <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>Carregando...</p>
                ) : movimentacoes.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
                    Nenhuma movimentação registrada ainda.
                  </p>
                ) : (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
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

      </div>
    </Dialog>
  );
}
