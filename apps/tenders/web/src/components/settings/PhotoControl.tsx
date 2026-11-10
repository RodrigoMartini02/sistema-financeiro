import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { AvatarUploadDialog } from '@ui/components/AvatarUploadDialog';
import { UserAvatar } from './UserAvatar';

interface PhotoControlProps {
  name: string;
  photoUrl: string | null;
  /** Recebe o data URL do recorte; quem chama envia à API. */
  onUpload: (image: string) => void;
  onRemove: () => void;
  busy: boolean;
  error: string | null;
}

/**
 * Foto de perfil no alto do formulário: o avatar é o controle de envio (como em Finanças), com o recorte do
 * `AvatarUploadDialog`. A foto vai para a API na hora, sem esperar o "Salvar" do formulário.
 */
export function PhotoControl({ name, photoUrl, onUpload, onRemove, busy, error }: PhotoControlProps) {
  const [cropping, setCropping] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setCropping(true)}
        disabled={busy}
        aria-label="Enviar foto de perfil"
        className="relative shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        <UserAvatar name={name} photoUrl={photoUrl} size={54} />
        <span className="absolute -bottom-0.5 -right-0.5 grid h-[21px] w-[21px] place-items-center rounded-full border-2 border-white bg-brand-600 text-white dark:border-slate-800">
          <Pencil size={10} aria-hidden="true" />
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">Foto de perfil</span>
        <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
          {busy ? 'Salvando a foto…' : 'Toque no avatar para enviar · JPG, PNG ou WebP, até 2 MB'}
        </span>
        {photoUrl !== null && !busy && (
          <button
            type="button"
            onClick={onRemove}
            className="w-fit text-[11.5px] font-semibold text-red-600 hover:underline dark:text-red-400"
          >
            Remover foto
          </button>
        )}
        {error && (
          <p role="alert" className="text-[11.5px] font-medium text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      <AvatarUploadDialog
        open={cropping}
        title="Foto de perfil"
        description="Selecione uma imagem e ajuste o enquadramento"
        onClose={() => setCropping(false)}
        onConfirm={(image) => {
          setCropping(false);
          onUpload(image);
        }}
      />
    </div>
  );
}
