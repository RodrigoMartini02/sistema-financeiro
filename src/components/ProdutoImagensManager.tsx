import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  fetchProdutoImagemBlob, uploadProdutoImagem, deleteProdutoImagem,
  type ProdutoImagem,
} from '../services/catalogoService';

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;

function ImagemThumb({ imagem, onRemove }: { imagem: ProdutoImagem; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchProdutoImagemBlob(imagem.nomeArquivo).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imagem.nomeArquivo]);

  return (
    <div className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
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

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Envie uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setError('A imagem deve ter no máximo 8MB.');
      return;
    }

    setError('');
    setIsUploading(true);
    try {
      const imagem = await uploadProdutoImagem(produtoId, file);
      onChange([...imagens, imagem]);
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
      await deleteProdutoImagem(imagemId);
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
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-brand-400 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={18} />
          <span className="text-[11px] font-medium">{isUploading ? 'Enviando...' : 'Adicionar'}</span>
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      {imagens.length === 0 && !error && (
        <p className="text-xs text-slate-400">A primeira imagem enviada é usada como capa na vitrine.</p>
      )}
    </div>
  );
}
