import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { Attachment } from '../types/finance';
import { C } from './dialogFormTokens';

export interface AttachmentSectionHandle {
  openPicker: () => void;
}

const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'xls', 'xlsx', 'doc', 'docx', 'txt'];
const ACCEPT = ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',');
const MAX_SIZE = 10 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function download(attachment: Attachment) {
  const chars = atob(attachment.dados);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: attachment.tipo || 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function readAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `anexo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      nome: file.name,
      tipo: file.type,
      tamanho: file.size,
      dados: String(reader.result).split(',')[1] ?? '',
      dataUpload: new Date().toISOString(),
    });
    reader.onerror = () => reject(new Error(`Não foi possível ler “${file.name}”.`));
    reader.readAsDataURL(file);
  });
}

interface Props {
  value: Attachment[];
  onChange?: (attachments: Attachment[]) => void;
  /** Só lista e baixa (visualização dos anexos de um lançamento). */
  readonly?: boolean;
  /** Com título, mostra o cabeçalho com "+ Anexar arquivo" e a dica de tipos. Sem ele, quem usa abre pelo próprio botão (openPicker). */
  title?: string;
}

/** Lista de anexos em linhas (tipo, nome, tamanho, baixar e remover) e o seletor de arquivos. */
export const AttachmentSection = forwardRef<AttachmentSectionHandle, Props>(
  function AttachmentSection({ value, onChange, readonly = false, title }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');

    useImperativeHandle(ref, () => ({
      openPicker: () => inputRef.current?.click(),
    }));

    const addFiles = async (files: File[]) => {
      let lastError = '';
      const accepted = files.filter((file) => {
        if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
          lastError = `“${file.name}”: tipo de arquivo não aceito.`;
          return false;
        }
        if (file.size > MAX_SIZE) {
          lastError = `“${file.name}” passa de 10 MB.`;
          return false;
        }
        return true;
      });
      setError(lastError);
      if (accepted.length === 0) return;
      try {
        onChange?.([...value, ...await Promise.all(accepted.map(readAsAttachment))]);
      } catch (readError) {
        setError(readError instanceof Error ? readError.message : 'Não foi possível ler o arquivo.');
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!readonly && (
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              // A lista precisa virar array antes de limpar o campo, que invalida o FileList.
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length > 0) void addFiles(files);
            }}
          />
        )}

        {title && !readonly && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{title}</span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{ border: 'none', background: 'transparent', padding: 0, color: C.primary, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              + Anexar arquivo
            </button>
          </div>
        )}

        {value.map((attachment) => (
          <div
            key={attachment.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px',
              border: '1px solid #eef2f6', borderRadius: 8, fontSize: 12, color: C.text,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 500, color: C.textSoft, background: '#f1f5f9', borderRadius: 4, padding: '2px 5px', fontVariantNumeric: 'tabular-nums' }}>
              {extensionOf(attachment.nome).toUpperCase() || 'ARQ'}
            </span>
            <span title={attachment.nome} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachment.nome}
            </span>
            <span style={{ fontSize: 11, color: C.textFaint }}>{formatSize(attachment.tamanho)}</span>
            <button
              type="button"
              onClick={() => download(attachment)}
              style={{ border: 'none', background: 'transparent', padding: 0, color: C.primary, fontSize: 12, cursor: 'pointer' }}
            >
              baixar
            </button>
            {!readonly && (
              <button
                type="button"
                onClick={() => onChange?.(value.filter((item) => item.id !== attachment.id))}
                aria-label={`Remover ${attachment.nome}`}
                style={{ border: 'none', background: 'transparent', padding: '0 2px', color: C.textFaint, fontSize: 14, cursor: 'pointer' }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {title && !readonly && value.length === 0 && (
          <span style={{ fontSize: 12, color: C.textFaint }}>PDF, imagem, planilha, DOC ou TXT, até 10 MB cada.</span>
        )}
        {readonly && value.length === 0 && <span style={{ fontSize: 12, color: C.textFaint }}>Nenhum anexo.</span>}
        {error && <span style={{ fontSize: 12, color: C.danger }}>{error}</span>}
      </div>
    );
  },
);
