import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Paperclip, X, Download, File, FileImage, FileText } from 'lucide-react';
import type { Attachment } from '../types/finance';

export interface AttachmentSectionHandle {
  openPicker: () => void;
}

const VALID_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.doc,.docx,.txt';
const MAX_SIZE = 10 * 1024 * 1024;

function fileIcon(tipo: string) {
  if (tipo.startsWith('image/')) return <FileImage size={14} className="shrink-0 text-blue-400" />;
  if (tipo.includes('pdf') || tipo.includes('word') || tipo === 'text/plain') return <FileText size={14} className="shrink-0 text-red-400" />;
  return <File size={14} className="shrink-0 text-slate-400" />;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function download(a: Attachment) {
  const chars = atob(a.dados);
  const arr = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) arr[i] = chars.charCodeAt(i);
  const blob = new Blob([arr], { type: a.tipo || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

interface Props {
  value: Attachment[];
  onChange?: (v: Attachment[]) => void;
  readonly?: boolean;
  hideTrigger?: boolean;
}

export const AttachmentSection = forwardRef<AttachmentSectionHandle, Props>(
function AttachmentSection({ value, onChange, readonly = false, hideTrigger = false }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
  }));

  const handleFiles = (files: FileList) => {
    setError(null);
    const toAdd: Attachment[] = [];

    // Convert to array immediately — clearing input.value invalidates the FileList reference
    const all = Array.from(files);
    const valid = all.filter((f) => {
      if (!VALID_TYPES.has(f.type)) { setError('Tipo não permitido. Use PDF, imagens, Excel, Word ou TXT.'); return false; }
      if (f.size > MAX_SIZE) { setError('Arquivo muito grande. Máximo: 10MB por arquivo.'); return false; }
      return true;
    });

    if (valid.length === 0) return;

    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        toAdd.push({
          id: `anexo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          nome: file.name,
          tipo: file.type,
          tamanho: file.size,
          dados: result.split(',')[1],
          dataUpload: new Date().toISOString(),
        });
        if (toAdd.length === valid.length) {
          onChange?.([...value, ...toAdd]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const remove = (id: string) => onChange?.(value.filter((a) => a.id !== id));

  return (
    <div className="grid gap-2">
      {!readonly && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {!hideTrigger && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition"
            >
              <Paperclip size={14} />
              Anexar arquivo
            </button>
          )}
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        </>
      )}

      {value.length > 0 && (
        <div className="grid gap-1.5">
          {value.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              {fileIcon(a.tipo)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">{a.nome}</p>
                <p className="text-[10px] text-slate-400">{fmtSize(a.tamanho)}</p>
              </div>
              <button
                type="button"
                onClick={() => download(a)}
                title="Baixar"
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition"
              >
                <Download size={13} />
              </button>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  title="Remover"
                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 transition"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {readonly && value.length === 0 && (
        <p className="text-xs text-slate-400">Nenhum anexo.</p>
      )}
    </div>
  );
});
