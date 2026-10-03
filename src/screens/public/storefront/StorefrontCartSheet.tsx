import { useState } from 'react';
import { MessageCircle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import {
  MAX_CUSTOMER_NAME_LENGTH, MAX_ITEM_QUANTITY, MAX_ORDER_NOTE_LENGTH,
  buildOrderMessage, buildWhatsappUrl, type CartLine,
} from '../../../utils/storefrontCart';
import { formatCurrency } from '../../finance/formatters';
import { StorefrontSheet } from './StorefrontSheet';

/**
 * Sacola: itens, total, nome e observação. "Enviar pedido" abre o WhatsApp da
 * loja com a mensagem pronta; quem confirma é o vendedor, na conversa.
 */
export function StorefrontCartSheet({ open, storeName, whatsapp, lines, total, imageUrlOf, onClose, onSetQuantity, onRemove, onClear }: {
  open: boolean;
  storeName: string;
  whatsapp: string;
  lines: CartLine[];
  total: number;
  imageUrlOf: (productId: string) => string | null;
  onClose: () => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const canSend = lines.length > 0 && customerName.trim() !== '';
  const orderUrl = canSend
    ? buildWhatsappUrl(whatsapp, buildOrderMessage({ storeName, lines, total, customerName, note }))
    : null;

  const closeAndReset = () => {
    setSent(false);
    onClose();
  };

  const footer = lines.length > 0 && !sent ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-base font-semibold text-slate-900">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
      {orderUrl ? (
        <a
          href={orderUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => setSent(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <MessageCircle size={18} /> Enviar pedido pelo WhatsApp
        </a>
      ) : (
        <button type="button" disabled className="flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
          <MessageCircle size={18} /> Informe seu nome para enviar
        </button>
      )}
    </div>
  ) : undefined;

  return (
    <StorefrontSheet open={open} title="Sua sacola" onClose={closeAndReset} footer={footer}>
      {sent ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MessageCircle size={22} />
          </span>
          <p className="text-base font-semibold text-slate-900">Pedido aberto no WhatsApp</p>
          <p className="text-sm text-slate-500">Envie a mensagem para a loja confirmar o pedido, a entrega e o pagamento.</p>
          <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                onClear();
                closeAndReset();
              }}
              className="h-11 flex-1 rounded-full bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Limpar sacola
            </button>
            <button
              type="button"
              onClick={closeAndReset}
              className="h-11 flex-1 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Continuar comprando
            </button>
          </div>
        </div>
      ) : lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-slate-400">
          <ShoppingBag size={32} />
          <p className="text-sm">Sua sacola está vazia.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4">
          <ul className="flex flex-col divide-y divide-slate-100">
            {lines.map((line) => {
              const imageUrl = imageUrlOf(line.product.id);
              return (
                <li key={line.product.id} className="flex items-center gap-3 py-3">
                  <span className="h-14 w-14 flex-none overflow-hidden rounded-xl bg-slate-100">
                    {imageUrl
                      ? <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-slate-300"><ShoppingBag size={18} /></span>}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-semibold text-slate-900">{line.product.nome}</span>
                    <span className="text-xs text-slate-500">{formatCurrency(line.product.valorFinal)} cada</span>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 items-center rounded-full border border-slate-200">
                        <button
                          type="button"
                          aria-label={`Diminuir ${line.product.nome}`}
                          onClick={() => onSetQuantity(line.product.id, line.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center text-slate-600"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Aumentar ${line.product.nome}`}
                          disabled={line.quantity >= MAX_ITEM_QUANTITY}
                          onClick={() => onSetQuantity(line.product.id, line.quantity + 1)}
                          className="flex h-8 w-8 items-center justify-center text-slate-600 disabled:opacity-40"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Tirar ${line.product.nome} da sacola`}
                        onClick={() => onRemove(line.product.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <span className="flex-none text-sm font-semibold text-slate-900">{formatCurrency(line.subtotal)}</span>
                </li>
              );
            })}
          </ul>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Seu nome *</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value.slice(0, MAX_CUSTOMER_NAME_LENGTH))}
              autoComplete="name"
              placeholder="Como a loja vai te chamar"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Observação</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_ORDER_NOTE_LENGTH))}
              rows={2}
              placeholder="Ex: tamanho, cor, melhor horário"
              className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
            />
          </label>
        </div>
      )}
    </StorefrontSheet>
  );
}
