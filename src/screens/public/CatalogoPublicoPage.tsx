import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingBag, MessageCircle } from 'lucide-react';
import {
  fetchProdutosPublicos, getProdutoImagemPublicaUrl,
  type ProdutoPublico,
} from '../../services/catalogoService';
import { formatCurrency } from '../finance/formatters';

function whatsappUrl(nomeProduto: string) {
  const mensagem = encodeURIComponent(`Olá! Tenho interesse no produto "${nomeProduto}".`);
  return `https://wa.me/?text=${mensagem}`;
}

function ProdutoCard({ produto, contaId }: { produto: ProdutoPublico; contaId: string }) {
  const capa = produto.imagens[0];

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="aspect-square w-full bg-slate-100">
        {capa ? (
          <img
            src={getProdutoImagemPublicaUrl(contaId, capa.nomeArquivo)}
            alt={produto.nome}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ShoppingBag size={32} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-sm font-semibold text-slate-900">{produto.nome}</h3>
        {produto.descricao && (
          <p className="line-clamp-2 text-xs text-slate-500">{produto.descricao}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-bold text-slate-900">{formatCurrency(Number(produto.valor))}</span>
          <a
            href={whatsappUrl(produto.nome)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
          >
            <MessageCircle size={14} />
            Comprar
          </a>
        </div>
      </div>
    </div>
  );
}

export function CatalogoPublicoPage() {
  const { contaId } = useParams<{ contaId: string }>();
  const [produtos, setProdutos] = useState<ProdutoPublico[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contaId) return;
    fetchProdutosPublicos(contaId)
      .then(setProdutos)
      .catch((err) => setError(err instanceof Error ? err.message : 'Catálogo não encontrado'));
  }, [contaId]);

  useEffect(() => {
    document.title = 'Catálogo de produtos';
    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Confira os produtos disponíveis.');
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
        <p className="text-sm text-slate-500">Catálogo não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-6">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <ShoppingBag size={20} className="text-brand-600" />
          <h1 className="text-lg font-semibold text-slate-900">Catálogo de produtos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {!produtos && !error && (
          <p className="py-12 text-center text-sm text-slate-400">Carregando...</p>
        )}

        {produtos && produtos.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">Nenhum produto disponível no momento.</p>
        )}

        {produtos && produtos.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {produtos.map((produto) => (
              <ProdutoCard key={produto.id} produto={produto} contaId={contaId!} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
