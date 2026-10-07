import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { queryKeys } from '../../../services/queryKeys';
import { fetchPublicReviews } from '../../../services/reviewsService';
import { ScrollReveal } from './ScrollReveal';
import { SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './siteStyles';

const MAX_STARS = 5;
const SHOWN_REVIEWS = 6;

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${value} de ${MAX_STARS} estrelas`}>
      {Array.from({ length: MAX_STARS }, (_, index) => (
        <Star
          key={index}
          size={14}
          aria-hidden="true"
          className={index < value ? 'fill-site-accent text-site-accent' : 'text-slate-300'}
        />
      ))}
    </div>
  );
}

/** Avaliações de quem usa. Sem avaliações, ou se a rota falhar, a seção não aparece. */
export function ReviewsSection() {
  const reviews = useQuery({
    queryKey: queryKeys.avaliacoes,
    queryFn: fetchPublicReviews,
    staleTime: 10 * 60 * 1000,
  });

  const items = reviews.data?.avaliacoes ?? [];
  if (!reviews.isSuccess || items.length === 0) {
    return null;
  }
  const { media, total } = reviews.data;

  return (
    <section className={`${SITE_SECTION} border-t border-slate-200/70`}>
      <div className={SITE_CONTAINER}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>O que dizem os usuários</p>
          <h2 className={`mt-4 ${SECTION_TITLE}`}>Quem usa, recomenda.</h2>
          <div className="mt-4 flex items-center gap-3">
            <StarRating value={Math.round(media)} />
            <span className="text-[14px] text-slate-500">
              {media.toFixed(1)} · {total} {total === 1 ? 'avaliação' : 'avaliações'}
            </span>
          </div>
        </ScrollReveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, SHOWN_REVIEWS).map((review, index) => (
            <ScrollReveal key={review.id} delay={Math.min(index * 0.05, 0.2)}>
              <article className="h-full rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                <StarRating value={review.estrelas} />
                <p className="mt-4 text-[15px] leading-[1.7] text-slate-600">“{review.comentario}”</p>
                <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{review.autor}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
