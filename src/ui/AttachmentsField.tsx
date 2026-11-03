import { useRef, useState, type CSSProperties } from 'react';
import { FileImage, FileText, Paperclip, Trash2 } from 'lucide-react';
import { ATTACHMENT_RULES, attachmentProblem, formatFileSize, type AttachmentOwnerType } from '../utils/attachmentRules';
import { CFG } from './configTokens';

/** Token do tema das Configurações, com a cor clara de reserva fora de `.config-scope` (ex.: modais de lançamento). */
function themed(token: string, fallback: string): string {
  return token.replace(/\)$/, `, ${fallback})`);
}

const COLOR = {
  text: themed(CFG.text, '#0f2b38'),
  textSoft: themed(CFG.textSoft, '#416275'),
  muted: themed(CFG.muted, '#7b93a1'),
  faint: themed(CFG.faint, '#8ba3b0'),
  border: themed(CFG.border, '#e6eef3'),
  surface: themed(CFG.surface, '#ffffff'),
  primary: themed(CFG.primary, '#0891b2'),
  primaryDark: themed(CFG.primaryDark, '#0e7490'),
  danger: themed(CFG.danger, '#b42318'),
  dangerBg: themed(CFG.dangerBg, '#fef3f2'),
  dangerBorder: themed(CFG.dangerBorder, '#fbd5d1'),
};

const titleStyle: CSSProperties = {
  margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: COLOR.faint,
};
const pickButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, padding: '0 11px',
  borderRadius: 999, border: `1px solid ${COLOR.border}`, background: COLOR.surface,
  fontSize: 12, fontWeight: 600, color: COLOR.textSoft, cursor: 'pointer', whiteSpace: 'nowrap',
};
const iconButtonStyle: CSSProperties = {
  flex: 'none', display: 'flex', padding: 4, border: 'none', background: 'transparent', color: COLOR.muted, cursor: 'pointer',
};
const mutedStyle: CSSProperties = { margin: 0, fontSize: 12, color: COLOR.muted };
const errorStyle: CSSProperties = {
  borderRadius: 10, border: `1px solid ${COLOR.dangerBorder}`, background: COLOR.dangerBg,
  padding: '8px 10px', fontSize: 11.5, color: COLOR.danger,
};

/** O que a lista precisa de cada anexo: os enviados ao servidor e os arquivos ainda no aparelho têm os mesmos campos. */
export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  contentType: string;
  createdAt?: string;
}

function ItemIcon({ contentType }: { contentType: string }) {
  return contentType.startsWith('image/')
    ? <FileImage size={15} style={{ flex: 'none', color: COLOR.primary }} />
    : <FileText size={15} style={{ flex: 'none', color: contentType === 'application/pdf' ? '#dc2626' : COLOR.muted }} />;
}

interface AttachmentsFieldProps {
  ownerType: AttachmentOwnerType;
  items: readonly AttachmentItem[];
  /** Só os arquivos que passaram na conferência de tipo e tamanho; os outros viram aviso aqui mesmo. */
  onAddFiles: (files: File[]) => void;
  onRemove: (item: AttachmentItem) => void;
  /** Sem isto o nome não é um botão: o arquivo ainda não foi enviado (contrato em criação). */
  onOpen?: (item: AttachmentItem) => void;
  isUploading?: boolean;
  /** Erro de quem usa o campo: envio, remoção ou abertura do arquivo. */
  error?: string;
  /** Com título, o cabeçalho mostra o título e o botão; sem ele, só o botão. */
  title?: string;
  /** Texto quando não há anexo; o padrão diz os tipos aceitos e o tamanho. */
  emptyHint?: string;
  /** Rótulo do seletor de arquivos, para leitores de tela. */
  inputLabel: string;
}

/** Lista de anexos de um dono (contrato, produto, lançamento): anexar, abrir e remover, com as regras do tipo de dono. */
export function AttachmentsField({
  ownerType, items, onAddFiles, onRemove, onOpen, isUploading = false, error = '', title, emptyHint, inputLabel,
}: AttachmentsFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState('');
  const rule = ATTACHMENT_RULES[ownerType];

  const handleChosen = (chosen: File[]) => {
    const checked = chosen.map((file) => ({ file, problem: attachmentProblem(ownerType, file) }));
    setPickError(checked.find((entry) => entry.problem !== '')?.problem ?? '');
    const accepted = checked.filter((entry) => entry.problem === '').map((entry) => entry.file);
    if (accepted.length > 0) {
      onAddFiles(accepted);
    }
  };

  const shownError = pickError || error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: title ? 'space-between' : 'flex-start', gap: 8 }}>
        {title && <p style={titleStyle}>{title}</p>}
        <button type="button" style={pickButtonStyle} disabled={isUploading} onClick={() => inputRef.current?.click()}>
          <Paperclip size={12} /> {isUploading ? 'Enviando...' : 'Anexar arquivo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={rule.accept}
          multiple
          hidden
          aria-label={inputLabel}
          onChange={(event) => {
            // A lista precisa virar array antes de limpar o campo, que invalida o FileList.
            const chosen = Array.from(event.target.files ?? []);
            event.target.value = '';
            handleChosen(chosen);
          }}
        />
      </div>
      {items.length === 0 && <p style={mutedStyle}>{emptyHint ?? `Nenhum anexo. ${rule.hint}`}</p>}
      {items.map((item) => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <ItemIcon contentType={item.contentType} />
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(item)}
              title="Abrir"
              style={{
                flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, color: COLOR.primaryDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </button>
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: COLOR.text }}>
              {item.name}
            </span>
          )}
          <span style={{ flex: 'none', fontSize: 11, color: COLOR.muted }}>
            {formatFileSize(item.size)}
            {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString('pt-BR')}` : ''}
          </span>
          <button type="button" aria-label={`Remover ${item.name}`} onClick={() => onRemove(item)} style={iconButtonStyle}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {shownError && <div role="alert" style={errorStyle}>{shownError}</div>}
    </div>
  );
}

interface PendingFilesFieldProps {
  ownerType: AttachmentOwnerType;
  files: readonly File[];
  onChange: (files: File[]) => void;
  emptyHint?: string;
  inputLabel: string;
}

/** Arquivos escolhidos para um dono que ainda não foi salvo (contrato em criação): seguem para o servidor depois de salvar. */
export function PendingFilesField({ ownerType, files, onChange, emptyHint, inputLabel }: PendingFilesFieldProps) {
  const items = files.map((file, index) => ({ id: String(index), name: file.name, size: file.size, contentType: file.type }));
  return (
    <AttachmentsField
      ownerType={ownerType}
      items={items}
      onAddFiles={(added) => onChange([...files, ...added])}
      onRemove={(item) => onChange(files.filter((_, position) => String(position) !== item.id))}
      {...(emptyHint !== undefined ? { emptyHint } : {})}
      inputLabel={inputLabel}
    />
  );
}
