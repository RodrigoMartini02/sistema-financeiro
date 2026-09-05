import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';

const OUTPUT_SIZE = 256;

interface AvatarUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
  isSaving?: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function AvatarUploadDialog({ open, onClose, onConfirm, isSaving = false }: AvatarUploadDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; startOffset: { x: number; y: number } }>({
    dragging: false, startX: 0, startY: 0, startOffset: { x: 0, y: 0 },
  });

  const reset = () => {
    setImageSrc(null);
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Envie uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 2MB.');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      const src = reader.result as string;
      setImageSrc(src);
      setImage(await loadImage(src));
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 240;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const scale = Math.max(size / image.width, size / image.height) * zoom;
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const cx = size / 2 + offset.x;
    const cy = size / 2 + offset.y;

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [image, zoom, offset]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOffset: offset };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState.current.dragging) return;
    setOffset({
      x: dragState.current.startOffset.x + (e.clientX - dragState.current.startX),
      y: dragState.current.startOffset.y + (e.clientY - dragState.current.startY),
    });
  };

  const handlePointerUp = () => {
    dragState.current.dragging = false;
  };

  const handleConfirm = () => {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewSize = 240;
    const scaleToOutput = OUTPUT_SIZE / previewSize;
    const scale = Math.max(previewSize / image.width, previewSize / image.height) * zoom;
    const drawW = image.width * scale * scaleToOutput;
    const drawH = image.height * scale * scaleToOutput;
    const cx = OUTPUT_SIZE / 2 + offset.x * scaleToOutput;
    const cy = OUTPUT_SIZE / 2 + offset.y * scaleToOutput;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, cx - drawW / 2, cy - drawH / 2, drawW, drawH);

    onConfirm(canvas.toDataURL('image/jpeg', 0.9));
    reset();
  };

  return (
    <Dialog open={open} title="Foto da conta" description="Selecione uma imagem e ajuste o enquadramento" onClose={handleClose}>
      <div className="flex flex-col items-center gap-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {!imageSrc ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-full border-2 border-dashed border-[#d8e0e8] text-[12.5px] font-medium text-[#64748b] transition hover:border-brand-400 hover:text-brand-500 dark:border-slate-600"
          >
            Escolher imagem
          </button>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="cursor-move rounded-full"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <div className="flex w-full max-w-xs items-center gap-3">
              <span className="text-[11px] font-medium text-[#64748b]">Zoom</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11.5px] font-semibold text-[#0e7490] hover:underline"
            >
              Trocar imagem
            </button>
          </>
        )}

        {error && <p className="text-xs font-medium text-red-500">{error}</p>}

        <div className="flex w-full items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button type="button" onClick={handleConfirm} disabled={!image || isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar foto'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
