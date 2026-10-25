import { AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../../ui/dialog';
import { C, dialogFooterStyle, labelStyle, neutralOutlineButtonStyle, saveButtonStyle } from '../../ui/dialogFormTokens';
import { getActiveAccountId } from '../../services/apiClient';
import { fetchCardUsage } from '../../services/cardLimitsService';
import { queryKeys } from '../../services/queryKeys';
import { USAGE_TYPE_LABELS, usageMonthText, usageTypesText } from '../../utils/cardUsage';
import { formatCurrency, formatDate } from './formatters';

interface CardUsageDialogProps {
  /** Cartão aberto; sem ele o diálogo fica fechado. */
  card: { id: number; nome: string } | null;
  escopo?: 'familia';
  /** Abre a lista das faturas vencidas para quitar; sem ele o botão não aparece (falta de permissão). */
  onQuitarVencidas?: () => void;
  onClose: () => void;
}

const USAGE_TYPES = ['unicas', 'parcelas', 'recorrentes', 'renegociacao'] as const;

/**
 * De que é feito o "Usado" do cartão: por fatura (mês do vencimento das compras em aberto) e por tipo
 * de lançamento, com a parte que já venceu e ainda não foi paga no sistema.
 */
export function CardUsageDialog({ card, escopo, onQuitarVencidas, onClose }: CardUsageDialogProps) {
  const accountId = getActiveAccountId();
  const usage = useQuery({
    queryKey: queryKeys.cardUsage(card?.id ?? 0, accountId, escopo),
    queryFn: () => fetchCardUsage(card!.id, escopo),
    enabled: card !== null,
    staleTime: 0,
  });
  const data = usage.data;
  const semFormaDePagamento = data ? Math.round((data.vencido - data.vencidoQuitavel) * 100) / 100 : 0;
  const faturasVencidas = data?.faturas.filter((fatura) => fatura.vencida).length ?? 0;

  return (
    <Dialog
      open={card !== null}
      title={card ? `Usado — ${card.nome}` : 'Usado'}
      description="Compras em aberto que ocupam o limite, agrupadas pelo mês do vencimento."
      onClose={onClose}
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px var(--dialog-px) 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {usage.isPending && <p style={{ fontSize: 13, color: C.textMuted }}>Carregando...</p>}
          {usage.isError && (
            <div style={{ display: 'flex', gap: 8, borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Não foi possível carregar a composição do cartão.</span>
            </div>
          )}

          {data && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 13, color: C.text, borderRadius: 12, border: `1px solid ${C.border}`, background: '#fff', padding: '9px 12px' }}>
                <span>Limite <strong>{formatCurrency(data.limite)}</strong></span>
                <span>Usado <strong>{formatCurrency(data.usado)}</strong></span>
                <span>Disponível <strong>{formatCurrency(data.disponivel)}</strong></span>
              </div>

              {data.vencido > 0 && (
                <div style={{ borderRadius: 10, border: `1px solid ${C.warnBorder}`, background: C.warnBg, padding: '10px 14px', fontSize: 13, color: C.warn, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>
                    <strong>{formatCurrency(data.vencido)}</strong> em {faturasVencidas} fatura{faturasVencidas !== 1 ? 's' : ''} vencida{faturasVencidas !== 1 ? 's' : ''} sem pagamento no sistema.
                    Se você já pagou no banco, quite aqui para liberar o limite.
                  </span>
                  {semFormaDePagamento > 0 && (
                    <span style={{ fontSize: 12 }}>
                      {formatCurrency(semFormaDePagamento)} são lançamentos antigos sem forma de pagamento "crédito"; o "Pagar fatura" não os alcança.
                      Edite cada um para a forma de pagamento correta.
                    </span>
                  )}
                  {onQuitarVencidas && data.vencidoQuitavel > 0 && (
                    <div>
                      <button type="button" onClick={onQuitarVencidas} style={{ ...saveButtonStyle, height: 28 }}>
                        Quitar faturas vencidas ({formatCurrency(data.vencidoQuitavel)})
                      </button>
                    </div>
                  )}
                </div>
              )}

              <section>
                <span style={labelStyle}>POR FATURA</span>
                {data.faturas.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Nenhuma compra em aberto neste cartão.</p>
                ) : (
                  <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                    {data.faturas.map((fatura, index) => (
                      <div
                        key={fatura.mes}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', fontSize: 13, background: index % 2 === 1 ? C.cardBg : '#fff' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Fatura de {usageMonthText(fatura.mes)}
                            {fatura.vencida && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.danger, background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 999, padding: '1px 7px' }}>
                                vencida
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: C.textMuted }}>
                            {fatura.vencida ? 'Venceu' : 'Vence'} em {formatDate(fatura.vencimento)}
                            {usageTypesText(fatura.porTipo) ? ` · ${usageTypesText(fatura.porTipo)}` : ''}
                          </div>
                        </div>
                        <span style={{ fontWeight: 700, color: fatura.vencida ? C.danger : C.text, flexShrink: 0 }}>{formatCurrency(fatura.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {data.faturas.length > 0 && (
                <section>
                  <span style={labelStyle}>POR TIPO</span>
                  <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                    {USAGE_TYPES.filter((type) => data.porTipo[type] > 0).map((type, index) => (
                      <div
                        key={type}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', fontSize: 13, background: index % 2 === 1 ? C.cardBg : '#fff' }}
                      >
                        <span style={{ color: C.text }}>{USAGE_TYPE_LABELS[type]}</span>
                        <span style={{ fontWeight: 600, color: C.text }}>{formatCurrency(data.porTipo[type])}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={neutralOutlineButtonStyle}>Fechar</button>
        </div>
      </div>
    </Dialog>
  );
}
