import { apiRequest } from './apiClient';

/** Avaliação aprovada, como vem de GET /api/avaliacoes. */
export interface PublicReview {
  id: number;
  autor: string;
  estrelas: number;
  comentario: string;
  data_criacao: string;
}

export interface PublicReviews {
  avaliacoes: PublicReview[];
  media: number;
  total: number;
}

/** Avaliações aprovadas, para o site. A rota é pública: vai sem o login. */
export function fetchPublicReviews(): Promise<PublicReviews> {
  return apiRequest<PublicReviews>('/avaliacoes', {}, { anonymous: true });
}
