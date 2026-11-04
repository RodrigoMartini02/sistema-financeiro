import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cnpjLinkPath } from '../utils/cnpj';

const LINK_CLASS =
  'rounded hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300';

interface CnpjLinkProps {
  /** O CNPJ (14 dígitos) de quem o nome identifica; CPF mascarado e CNPJ com dígito errado não têm página. */
  cnpj: string | null | undefined;
  children: ReactNode;
  className?: string;
}

/**
 * O nome de um órgão ou fornecedor como link para a página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md). Só vira
 * link quando o CNPJ é válido (dígitos verificadores certos); senão fica o texto, como era.
 */
export function CnpjLink({ cnpj, children, className = '' }: CnpjLinkProps) {
  const to = cnpjLinkPath(cnpj);
  if (!to) return <>{children}</>;
  return (
    <Link to={to} className={`${LINK_CLASS} ${className}`.trim()}>
      {children}
    </Link>
  );
}
