import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileImage, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import {
  deleteContractAttachment, fetchContractAttachmentFile, uploadContractAttachment, type AttachmentKind, type ContractAttachment,
} from '../../services/contractsService';
import { invalidateIncomeQueries } from '../../services/queryKeys';
import { CFG } from '../../ui/configTokens';
import { errorBoxStyle, mutedTextStyle, secondaryButtonStyle, sectionTitleStyle } from './clientStyles';

export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** O arquivo abre sempre com o tipo conferido no envio: nunca como página. */
const MIME_TYPES: Record<AttachmentKind, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Conferência antes de enviar (o servidor confere de novo, pelo conteúdo). Vazio quando o arquivo serve. */
export function attachmentProblem(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!ACCEPTED_EXTENSIONS.includes(extension)) return `"${file.name}": envie um arquivo PDF, JPG ou PNG.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `"${file.name}" passa de 20 MB.`;
  return '';
}

/**
 * Abre o anexo numa aba nova. A aba é aberta já no clique (senão o bloqueador
 * de janelas barra) e recebe o arquivo com o tipo fixado em PDF ou imagem.
 */
async function openAttachment(attachment: ContractAttachment): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const blob = await fetchContractAttachmentFile(attachment.id);
    const url = URL.createObjectURL(new Blob([blob], { type: MIME_TYPES[attachment.kind] }));
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      window.location.assign(url);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

function KindIcon({ kind }: { kind: AttachmentKind }) {
  return kind === 'pdf'
    ? <FileText size={15} style={{ flex: 'none', color: '#dc2626' }} />
    : <FileImage size={15} style={{ flex: 'none', color: CFG.primary }} />;
}

/** Anexos da ficha do contrato: enviar, abrir e remover. */
export function ContractAttachments({ contractId, attachments }: { contractId: number; attachments: ContractAttachment[] }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const refresh = () => invalidateIncomeQueries(qc);
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await uploadContractAttachment(contractId, file);
      }
    },
    onSuccess: refresh,
    onError: (failure: Error) => { setError(failure.message); refresh(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (attachmentId: number) => deleteContractAttachment(attachmentId),
    onSuccess: refresh,
    onError: (failure: Error) => setError(failure.message),
  });

  const addFiles = (files: File[]) => {
    setError('');
    const problem = files.map(attachmentProblem).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    if (files.length > 0) uploadMutation.mutate(files);
  };

  const remove = async (attachment: ContractAttachment) => {
    const ok = await confirm({ title: 'Remover anexo', message: `Remover "${attachment.originalName}"?`, confirmLabel: 'Remover' });
    if (ok) deleteMutation.mutate(attachment.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={sectionTitleStyle}>Anexos</p>
        <button type="button" style={secondaryButtonStyle} disabled={uploadMutation.isPending} onClick={() => inputRef.current?.click()}>
          <Paperclip size={12} /> {uploadMutation.isPending ? 'Enviando...' : 'Anexar arquivo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          hidden
          aria-label="Anexar arquivo ao contrato"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {attachments.length === 0 && <p style={mutedTextStyle}>Nenhum anexo. PDF, JPG ou PNG, até 20 MB.</p>}
      {attachments.map((attachment) => (
        <div key={attachment.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <KindIcon kind={attachment.kind} />
          <button
            type="button"
            onClick={() => { setError(''); openAttachment(attachment).catch((failure: Error) => setError(failure.message)); }}
            title="Abrir"
            style={{
              flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: CFG.primaryDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {attachment.originalName}
          </button>
          <span style={{ flex: 'none', fontSize: 11, color: CFG.muted }}>
            {formatFileSize(attachment.size)} · {new Date(attachment.createdAt).toLocaleDateString('pt-BR')}
          </span>
          <button
            type="button"
            aria-label={`Remover ${attachment.originalName}`}
            onClick={() => void remove(attachment)}
            style={{ flex: 'none', display: 'flex', padding: 4, border: 'none', background: 'transparent', color: CFG.muted, cursor: 'pointer' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {error && <div role="alert" style={errorBoxStyle}>{error}</div>}
    </div>
  );
}

/** Arquivos escolhidos no contrato ainda não salvo: vão para o servidor logo depois de salvar. */
export function PendingAttachments({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div>
        <button type="button" style={secondaryButtonStyle} onClick={() => inputRef.current?.click()}>
          <Paperclip size={12} /> Anexar arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          hidden
          aria-label="Anexar arquivo ao contrato"
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            event.target.value = '';
            const problem = chosen.map(attachmentProblem).find(Boolean);
            setError(problem ?? '');
            if (!problem) onChange([...files, ...chosen]);
          }}
        />
      </div>
      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: CFG.text }}>
          <Paperclip size={12} style={{ flex: 'none', color: CFG.muted }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          <span style={{ flex: 'none', fontSize: 11, color: CFG.muted }}>{formatFileSize(file.size)}</span>
          <button
            type="button"
            aria-label={`Tirar ${file.name}`}
            onClick={() => onChange(files.filter((_, position) => position !== index))}
            style={{ flex: 'none', display: 'flex', padding: 4, border: 'none', background: 'transparent', color: CFG.muted, cursor: 'pointer' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {files.length === 0 && <p style={mutedTextStyle}>PDF, JPG ou PNG, até 20 MB. Enviados ao salvar o contrato.</p>}
      {error && <div role="alert" style={errorBoxStyle}>{error}</div>}
    </div>
  );
}
