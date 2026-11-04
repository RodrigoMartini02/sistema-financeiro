import { useEffect, useRef, useState } from 'react';
import { ImageOff, Plus, X } from 'lucide-react';
import { deleteAttachment, fetchAttachmentLink, uploadAttachment } from '../services/attachmentsService';
import type { ProdutoImagem } from '../services/catalogoService';
import { ATTACHMENT_RULES, attachmentProblem } from '../utils/attachmentRules';

/** A miniatura abre pelo link de vida curta do R2: o navegador baixa a imagem direto de lá. */
function ImagemThumb({ imagem, onRemove }: { imagem: ProdutoImagem; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchAttachmentLink(imagem.id)
      .then((link) => {
        if (!cancelled) setSrc(link.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imagem.id]);

  return (
    <div className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#e9eef3] bg-[#f8fafc]">
      {src && <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />}
      {failed && <ImageOff size={18} className="text-[#94a3b8]" aria-label="Não foi possível carregar a imagem" />}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
        aria-label="Remover imagem"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface ProdutoImagensManagerProps {
  produtoId: string;
  imagens: ProdutoImagem[];
  onChange: (imagens: ProdutoImagem[]) => void;
}

export function ProdutoImagensManager({ produtoId, imagens, onChange }: ProdutoImagensManagerProps) {
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const problem = attachmentProblem('product', file);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setIsUploading(true);
    try {
      const uploaded = await uploadAttachment('product', file, produtoId);
      onChange([...imagens, { id: uploaded.id }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar imagem');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (imagemId: string) => {
    const previous = imagens;
    onChange(imagens.filter((imagem) => imagem.id !== imagemId));
    try {
      await deleteAttachment(imagemId);
    } catch (err) {
      onChange(previous);
      setError(err instanceof Error ? err.message : 'Falha ao remover imagem');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {imagens.map((imagem) => (
          <ImagemThumb key={imagem.id} imagem={imagem} onRemove={() => handleRemove(imagem.id)} />
        ))}
        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_RULES.product.accept}
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[#d8e0e8] text-[#64748b] transition hover:border-[#0891b2] hover:text-[#0e7490] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={18} />
          <span className="text-[11px] font-medium">{isUploading ? 'Enviando...' : 'Adicionar'}</span>
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      {imagens.length === 0 && !error && (
        <p className="text-[11px] font-medium text-[#64748b]">A primeira imagem enviada é usada como capa na vitrine.</p>
      )}
    </div>
  );
}
