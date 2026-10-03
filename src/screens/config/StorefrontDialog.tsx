import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { saveStorefrontConfig, type StorefrontConfig } from '../../services/storefrontService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, saveButtonStyle, saveButtonDisabledStyle } from '../../ui/dialogFormTokens';
import { CFG, cfgDividerStyle } from '../../ui/configTokens';
import { AvatarUploadDialog } from '../../components/AvatarUploadDialog';
import {
  STOREFRONT_SLUG_MAX_LENGTH, STOREFRONT_SLUG_MIN_LENGTH,
  finalizeSlug, formatWhatsappInput, isValidStorefrontSlug, sanitizeSlugInput,
} from '../../utils/storefrontConfig';

const MAX_DESCRIPTION_LENGTH = 280;

const linkButtonStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 11.5, fontWeight: 600, color: C.primaryDark,
};

const hintStyle: React.CSSProperties = { margin: '5px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted };

/**
 * "Configurar vitrine": nome, logo, descrição, WhatsApp e link da vitrine
 * pública da conta PJ. Nome e logo vazios usam os da conta (nome fantasia e o
 * logo do acesso, na PJ do login).
 */
export function StorefrontDialog({ open, accountId, config, onClose }: {
  open: boolean;
  accountId: number;
  config: StorefrontConfig;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(config.nome ?? '');
  const [descricao, setDescricao] = useState(config.descricao ?? '');
  const [whatsapp, setWhatsapp] = useState(config.whatsapp ? formatWhatsappInput(config.whatsapp) : '');
  const [link, setLink] = useState(config.link);
  const [logo, setLogo] = useState<string | null>(config.logo);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [localError, setLocalError] = useState('');

  const saveMut = useMutation({
    mutationFn: saveStorefrontConfig,
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.storefrontConfig(accountId), saved);
      onClose();
    },
  });

  const shownLogo = logo ?? config.logoPadrao;
  const linkPrefix = `${window.location.host}/loja/`;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalLink = finalizeSlug(link);
    if (!isValidStorefrontSlug(finalLink)) {
      setLocalError(`Link: use de ${STOREFRONT_SLUG_MIN_LENGTH} a ${STOREFRONT_SLUG_MAX_LENGTH} letras minúsculas, números e hífens.`);
      return;
    }
    setLocalError('');
    saveMut.mutate({
      conta_id: accountId,
      nome: nome.trim(),
      descricao: descricao.trim(),
      whatsapp: whatsapp.trim(),
      link: finalLink,
      logo,
    });
  };

  const shownError = localError || saveMut.error?.message;

  return (
    <>
      <Dialog open={open} title="Configurar vitrine" description="Como a sua loja aparece para os clientes" onClose={onClose} scrollBody={false}>
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
                style={{ ...fieldInputStyle, height: 'auto', padding: '8px 9px', resize: 'vertical' }}
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
              <p style={hintStyle}>Os pedidos da sacola chegam neste número. Sem WhatsApp, a vitrine mostra os produtos sem a sacola.</p>
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

            {shownError && (
              <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
                {shownError}
              </div>
            )}
          </div>

          <div style={dialogFooterStyle}>
            <div style={{ marginLeft: 'auto' }}>
              <button type="submit" disabled={saveMut.isPending} style={saveMut.isPending ? saveButtonDisabledStyle : saveButtonStyle}>
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
