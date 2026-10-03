import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Store } from 'lucide-react';
import {
  disconnectMercadoPago, fetchMercadoPagoConnectUrl, fetchMercadoPagoStatus, saveStorefrontConfig,
  type StorefrontConfig, type StorefrontConfigInput,
} from '../../services/storefrontService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import {
  C, MoneyField, chipGroupLabelStyle, dialogFooterStyle, fieldInputStyle, labelStyle, saveButtonDisabledStyle, saveButtonStyle,
} from '../../ui/dialogFormTokens';
import { CFG, cfgDividerStyle } from '../../ui/configTokens';
import { ToggleRow } from '../../ui/form';
import { useConfirm } from '../../context/ConfirmContext';
import { AvatarUploadDialog } from '../../components/AvatarUploadDialog';
import {
  STOREFRONT_SLUG_MAX_LENGTH, STOREFRONT_SLUG_MIN_LENGTH, SUGGESTED_EXCHANGE_POLICY,
  finalizeSlug, formatWhatsappInput, isValidStorefrontSlug, sanitizeSlugInput,
} from '../../utils/storefrontConfig';

const MAX_DESCRIPTION_LENGTH = 280;
const MAX_PICKUP_ADDRESS_LENGTH = 280;
const MAX_PICKUP_HOURS_LENGTH = 120;
const MAX_DELIVERY_DESCRIPTION_LENGTH = 280;
const MAX_EXCHANGE_POLICY_LENGTH = 5000;

const linkButtonStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 11.5, fontWeight: 600, color: C.primaryDark,
};

const hintStyle: React.CSSProperties = { margin: '5px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted };

const textareaStyle: React.CSSProperties = { ...fieldInputStyle, height: 'auto', padding: '8px 9px', resize: 'vertical' };

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

const panelStyle: React.CSSProperties = {
  borderRadius: 12, border: `1px solid ${CFG.borderSoft}`, padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 8,
};

const noticeStyle = (tone: 'success' | 'warn'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
  borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 600,
  border: `1px solid ${tone === 'success' ? C.successBorder : C.warnBorder}`,
  background: tone === 'success' ? C.successBg : C.warnBg,
  color: tone === 'success' ? C.success : C.warn,
});

/**
 * "Configurar vitrine": nome, logo, descrição, WhatsApp e link da vitrine
 * pública da conta PJ, o Mercado Pago que recebe as vendas, as formas de
 * entrega e a política de troca. Nome e logo vazios usam os da conta (nome
 * fantasia e o logo do acesso, na PJ do login).
 */
export function StorefrontDialog({ open, accountId, config, onClose }: {
  open: boolean;
  accountId: number;
  config: StorefrontConfig;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [nome, setNome] = useState(config.nome ?? '');
  const [descricao, setDescricao] = useState(config.descricao ?? '');
  const [whatsapp, setWhatsapp] = useState(config.whatsapp ? formatWhatsappInput(config.whatsapp) : '');
  const [link, setLink] = useState(config.link);
  const [logo, setLogo] = useState<string | null>(config.logo);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [pickupActive, setPickupActive] = useState(config.retiradaAtiva);
  const [pickupAddress, setPickupAddress] = useState(config.retiradaEndereco ?? '');
  const [pickupHours, setPickupHours] = useState(config.retiradaHorario ?? '');
  const [deliveryActive, setDeliveryActive] = useState(config.entregaAtiva);
  const [deliveryFee, setDeliveryFee] = useState<number | undefined>(config.entregaTaxa ?? undefined);
  const [deliveryDescription, setDeliveryDescription] = useState(config.entregaDescricao ?? '');
  const [exchangePolicy, setExchangePolicy] = useState(config.politicaTroca ?? '');
  const [localError, setLocalError] = useState('');

  const mercadoPagoQ = useQuery({
    queryKey: queryKeys.mercadoPagoStatus(accountId),
    queryFn: () => fetchMercadoPagoStatus(accountId),
    enabled: open,
  });
  const mercadoPago = mercadoPagoQ.data;

  const saveMut = useMutation({
    mutationFn: saveStorefrontConfig,
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.storefrontConfig(accountId), saved);
      onClose();
    },
  });

  // Conectar sai do app (vai ao Mercado Pago e volta): o que foi preenchido aqui é salvo antes.
  const connectMut = useMutation({
    mutationFn: async (input: StorefrontConfigInput) => {
      const saved = await saveStorefrontConfig(input);
      qc.setQueryData(queryKeys.storefrontConfig(accountId), saved);
      return fetchMercadoPagoConnectUrl(accountId);
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectMercadoPago(accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mercadoPagoStatus(accountId) }),
  });

  const shownLogo = logo ?? config.logoPadrao;
  const linkPrefix = `${window.location.host}/loja/`;

  /** O formulário como o servidor recebe; nulo (com o erro na tela) quando algo daqui não confere. */
  const buildInput = (): StorefrontConfigInput | null => {
    const finalLink = finalizeSlug(link);
    if (!isValidStorefrontSlug(finalLink)) {
      setLocalError(`Link: use de ${STOREFRONT_SLUG_MIN_LENGTH} a ${STOREFRONT_SLUG_MAX_LENGTH} letras minúsculas, números e hífens.`);
      return null;
    }
    if (pickupActive && pickupAddress.trim() === '') {
      setLocalError('Informe o endereço de retirada.');
      return null;
    }
    setLocalError('');
    return {
      conta_id: accountId,
      nome: nome.trim(),
      descricao: descricao.trim(),
      whatsapp: whatsapp.trim(),
      link: finalLink,
      logo,
      retirada_ativa: pickupActive,
      retirada_endereco: pickupAddress.trim(),
      retirada_horario: pickupHours.trim(),
      entrega_ativa: deliveryActive,
      // Ativa sem taxa é entrega grátis; desativada guarda a taxa para quando voltar.
      entrega_taxa: deliveryActive ? deliveryFee ?? 0 : deliveryFee ?? null,
      entrega_descricao: deliveryDescription.trim(),
      politica_troca: exchangePolicy.trim(),
    };
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = buildInput();
    if (input) saveMut.mutate(input);
  };

  const handleConnect = () => {
    const input = buildInput();
    if (input) connectMut.mutate(input);
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar o Mercado Pago?',
      message: 'A vitrine para de receber Pix e cartão e volta a enviar os pedidos pelo WhatsApp. Pedidos que ainda aguardam pagamento deixam de ser conferidos.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (ok) disconnectMut.mutate();
  };

  const shownError = localError || saveMut.error?.message || connectMut.error?.message || disconnectMut.error?.message;
  const busy = saveMut.isPending || connectMut.isPending;

  return (
    <>
      <Dialog open={open} title="Configurar vitrine" description="Como a sua loja aparece e vende para os clientes" onClose={onClose} scrollBody={false}>
        <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 64, height: 64, flex: 'none', borderRadius: '50%', overflow: 'hidden',
                border: `1px solid ${CFG.borderSoft}`, background: CFG.chipBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: CFG.muted,
              }}>
                {shownLogo
                  ? <img src={shownLogo} alt="Logo da loja" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Store size={24} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Logo</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" style={linkButtonStyle} onClick={() => setLogoDialogOpen(true)}>
                    {logo ? 'Trocar logo' : 'Escolher logo'}
                  </button>
                  {logo && (
                    <button type="button" style={{ ...linkButtonStyle, color: C.danger }} onClick={() => setLogo(null)}>
                      Remover
                    </button>
                  )}
                </div>
                {!logo && config.logoPadrao && (
                  <span style={{ fontSize: 11, color: CFG.muted }}>Usando o logo da conta.</span>
                )}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Nome da loja</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={config.nomePadrao}
                maxLength={100}
                style={fieldInputStyle}
              />
              <p style={hintStyle}>Vazio usa “{config.nomePadrao}”.</p>
            </div>

            <div>
              <label style={labelStyle}>Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                placeholder="Ex: Bolos e doces por encomenda. Entregamos na região."
                rows={3}
                style={textareaStyle}
              />
              <p style={{ ...hintStyle, textAlign: 'right' }}>{descricao.length}/{MAX_DESCRIPTION_LENGTH}</p>
            </div>

            <div>
              <label style={labelStyle}>WhatsApp da loja</label>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatWhatsappInput(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                style={fieldInputStyle}
              />
              <p style={hintStyle}>
                Contato da loja na vitrine. Sem o Mercado Pago conectado, os pedidos da sacola chegam neste número; sem os dois, a vitrine mostra os produtos sem a sacola.
              </p>
            </div>

            <div style={cfgDividerStyle} />

            <div>
              <label style={labelStyle}>Link da vitrine</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <span style={{
                  ...fieldInputStyle, width: 'auto', flex: 'none', display: 'flex', alignItems: 'center',
                  borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none',
                  background: CFG.chipBg, color: CFG.muted, fontSize: 12, whiteSpace: 'nowrap',
                }}>
                  {linkPrefix}
                </span>
                <input
                  aria-label="Link da vitrine"
                  value={link}
                  onChange={(e) => setLink(sanitizeSlugInput(e.target.value))}
                  maxLength={STOREFRONT_SLUG_MAX_LENGTH}
                  style={{ ...fieldInputStyle, minWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                />
              </div>
              <p style={hintStyle}>Trocar o link derruba o anterior. O link antigo com código continua funcionando.</p>
            </div>

            <div style={cfgDividerStyle} />

            <div style={sectionStyle}>
              <span style={chipGroupLabelStyle}>Pagamento pela vitrine</span>
              <div style={panelStyle}>
                {mercadoPagoQ.isLoading && <span style={{ fontSize: 12, color: CFG.muted }}>Consultando o Mercado Pago...</span>}
                {mercadoPagoQ.isError && <span style={{ fontSize: 12, color: C.danger }}>{mercadoPagoQ.error.message}</span>}
                {mercadoPago && !mercadoPago.disponivel && (
                  <span style={{ fontSize: 12, color: CFG.muted }}>
                    O pagamento online ainda não está disponível. Por enquanto, os pedidos da sacola vão pelo WhatsApp.
                  </span>
                )}
                {mercadoPago?.disponivel && mercadoPago.conectado && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span style={noticeStyle('success')}><CheckCircle2 size={13} /> Mercado Pago conectado</span>
                      {mercadoPago.liveMode === false && <span style={noticeStyle('warn')}>Conta de teste</span>}
                    </div>
                    <span style={{ fontSize: 12, color: CFG.textSoft }}>
                      Pix e cartão caem direto na conta Mercado Pago da empresa, sem taxa do FINGERENCE.
                    </span>
                    <button
                      type="button"
                      style={{ ...linkButtonStyle, color: C.danger, alignSelf: 'flex-start' }}
                      disabled={disconnectMut.isPending}
                      onClick={() => void handleDisconnect()}
                    >
                      {disconnectMut.isPending ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  </>
                )}
                {mercadoPago?.disponivel && !mercadoPago.conectado && (
                  <>
                    <span style={{ fontSize: 12, color: CFG.textSoft }}>
                      Conecte a conta Mercado Pago da empresa para receber Pix e cartão direto na vitrine, sem taxa do FINGERENCE. Sem ela, a sacola envia o pedido pelo WhatsApp.
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleConnect}
                      style={{ ...(busy ? saveButtonDisabledStyle : saveButtonStyle), alignSelf: 'flex-start' }}
                    >
                      {connectMut.isPending ? 'Abrindo o Mercado Pago...' : 'Conectar Mercado Pago'}
                    </button>
                    <span style={{ fontSize: 11, color: CFG.muted }}>
                      Você vai para o Mercado Pago e volta para cá. O que foi preenchido nesta tela é salvo antes.
                    </span>
                  </>
                )}
                {mercadoPago?.conectado && !pickupActive && !deliveryActive && (
                  <span style={noticeStyle('warn')}>Ative a retirada ou a entrega para a vitrine vender.</span>
                )}
              </div>
            </div>

            <div style={sectionStyle}>
              <span style={chipGroupLabelStyle}>Entrega</span>
              <ToggleRow
                label="Retirada no local"
                description="O cliente busca o pedido, sem custo."
                checked={pickupActive}
                onChange={() => setPickupActive((current) => !current)}
              />
              {pickupActive && (
                <>
                  <div>
                    <label style={labelStyle}>Endereço de retirada *</label>
                    <input
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value.slice(0, MAX_PICKUP_ADDRESS_LENGTH))}
                      placeholder="Rua, número, bairro e cidade"
                      style={fieldInputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Horário</label>
                    <input
                      value={pickupHours}
                      onChange={(e) => setPickupHours(e.target.value.slice(0, MAX_PICKUP_HOURS_LENGTH))}
                      placeholder="Ex: seg a sex, das 9h às 18h"
                      style={fieldInputStyle}
                    />
                  </div>
                </>
              )}
              <ToggleRow
                label="Entrega"
                description="Taxa fixa, sem cálculo por CEP."
                checked={deliveryActive}
                onChange={() => setDeliveryActive((current) => !current)}
              />
              {deliveryActive && (
                <>
                  <div>
                    <label style={labelStyle}>Taxa de entrega</label>
                    <MoneyField value={deliveryFee} onChange={setDeliveryFee} />
                    <p style={hintStyle}>Vazio ou zero: entrega grátis.</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Área e prazo</label>
                    <textarea
                      value={deliveryDescription}
                      onChange={(e) => setDeliveryDescription(e.target.value.slice(0, MAX_DELIVERY_DESCRIPTION_LENGTH))}
                      placeholder="Ex: Centro e bairros vizinhos, em até 2 dias úteis."
                      rows={2}
                      style={textareaStyle}
                    />
                  </div>
                </>
              )}
            </div>

            <div style={sectionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={chipGroupLabelStyle}>Política de troca</span>
                {exchangePolicy.trim() === '' && (
                  <button type="button" style={linkButtonStyle} onClick={() => setExchangePolicy(SUGGESTED_EXCHANGE_POLICY)}>
                    Usar texto sugerido
                  </button>
                )}
              </div>
              <textarea
                aria-label="Política de troca"
                value={exchangePolicy}
                onChange={(e) => setExchangePolicy(e.target.value.slice(0, MAX_EXCHANGE_POLICY_LENGTH))}
                placeholder="Como funcionam as trocas e devoluções na sua loja."
                rows={5}
                style={textareaStyle}
              />
              <p style={{ ...hintStyle, marginTop: 0 }}>Aparece no checkout, antes do pagamento.</p>
            </div>

            {shownError && (
              <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
                {shownError}
              </div>
            )}
          </div>

          <div style={dialogFooterStyle}>
            <div style={{ marginLeft: 'auto' }}>
              <button type="submit" disabled={busy} style={busy ? saveButtonDisabledStyle : saveButtonStyle}>
                {saveMut.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </Dialog>

      <AvatarUploadDialog
        open={logoDialogOpen}
        title="Logo da vitrine"
        description="Selecione o logo e ajuste o enquadramento"
        onClose={() => setLogoDialogOpen(false)}
        onConfirm={(dataUrl) => {
          setLogo(dataUrl);
          setLogoDialogOpen(false);
        }}
      />
    </>
  );
}
