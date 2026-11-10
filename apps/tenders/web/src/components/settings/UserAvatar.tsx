import { useEffect, useState } from 'react';
import { initials } from '../../utils/teamMembers';

interface UserAvatarProps {
  name: string;
  /** Link assinado da foto; nulo sem foto. */
  photoUrl: string | null;
  /** Lado do círculo, em px. */
  size?: number;
}

/** Foto do usuário, ou as iniciais quando não há foto ou o link não abriu (o link assinado dura pouco). */
export function UserAvatar({ name, photoUrl, size = 36 }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  // Foto trocada (link novo): tenta de novo.
  useEffect(() => setFailed(false), [photoUrl]);

  const showPhoto = photoUrl !== null && !failed;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-[12px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
