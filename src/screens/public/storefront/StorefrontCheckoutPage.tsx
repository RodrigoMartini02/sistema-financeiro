import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, CreditCard, Loader2, Lock, QrCode, Store, Truck } from 'lucide-react';
import {
  createPublicOrder, getPublicProductImageUrl, storefrontBasePath, storefrontSlug,
  type DeliveryType, type OrderPaymentMethod, type PublicCheckout, type PublicOrderInput,
} from '../../../services/storefrontService';
import { fetchAddressByCep } from '../../../services/cepService';
import { queryKeys } from '../../../services/queryKeys';
import { createMercadoPago, loadMercadoPagoScript } from '../../../utils/mercadoPagoSdk';
import type { CartLine } from '../../../utils/storefrontCart';
import {
  checkoutTotals, hasErrors, onlyDigits, parseCardExpiry, validateAddress, validateCard, validateIdentification,
  type CheckoutAddress, type CheckoutCard, type CheckoutErrors, type CheckoutIdentification, type CheckoutTotals,
} from '../../../utils/storefrontCheckout';
import { formatCurrency } from '../../finance/formatters';
import {
  AddressFields, CardFields, Field, IdentificationFields, OptionCard, inputClassName, type CepLookupStatus,
} from './CheckoutFields';
import { SecureCheckoutBadge, StorefrontFooter, StorefrontMessage, StorefrontTopBar, usePublicStorefront } from './StorefrontLayout';
import { PriceSummary, ProductThumb } from './StorefrontSummary';
import { useStorefrontCart } from './useStorefrontCart';

type Step = 'identificacao' | 'entrega' | 'pagamento';
type StepState = 'done' | 'current' | 'upcoming';

const STEPS: Step[] = ['identificacao', 'entrega', 'pagamento'];
const MAX_NOTE_LENGTH = 300;
const CARD_REFUSED_MESSAGE = 'Pagamento recusado. Confira os dados do cartão ou pague com Pix.';

const EMPTY_IDENTIFICATION: CheckoutIdentification = { nome: '', email: '', telefone: '', cpf: '' };
const EMPTY_ADDRESS: CheckoutAddress = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
const EMPTY_CARD: CheckoutCard = { numero: '', nome: '', validade: '', cvv: '', cpf: '' };

/** Com uma forma de receber só, ela já vem escolhida. */
function defaultDelivery(checkout: PublicCheckout): DeliveryType | null {
  if (checkout.retirada && !checkout.entrega) return 'retirada';
  if (checkout.entrega && !checkout.retirada) return 'entrega';
  return null;
}

/** Erro do servidor (mensagem pronta) ou da biblioteca do Mercado Pago (lista de causas, sem texto para o cliente). */
function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Confira os dados do cartão.';
}

function StepSection({ id, number, title, state, summary, onEdit, children }: {
  id: string;
  number: number;
  title: string;
  state: StepState;
  summary?: ReactNode;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${state === 'current' ? 'border-slate-300' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${state === 'done'
          ? 'bg-emerald-500 text-white'
          : state === 'current' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}`}
        >
          {state === 'done' ? <Check size={14} strokeWidth={3} /> : number}
        </span>
        <h2 className={`flex-1 text-base font-semibold ${state === 'upcoming' ? 'text-slate-400' : 'text-slate-900'}`}>{title}</h2>
        {state === 'done' && onEdit && (
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-brand-700 hover:underline">
            Alterar
          </button>
        )}
      </div>
      {state === 'done' && summary && <div className="mt-2 pl-10 text-sm text-slate-600">{summary}</div>}
      {state === 'current' && <div className="mt-4">{children}</div>}
    </section>
  );
}

function ContinueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-brand-600 px-8 text-sm font-semibold text-white transition hover:bg-brand-700 sm:w-auto"
    >
      Continuar
    </button>
  );
}

/** Itens e valores do pedido: ao lado no computador, recolhido no topo no celular. */
function CheckoutSummary({ lines, itemCount, totals, deliveryLabel, deliveryChosen, imageUrlOf }: {
  lines: CartLine[];
  itemCount: number;
  totals: CheckoutTotals;
  deliveryLabel: string;
  deliveryChosen: boolean;
  imageUrlOf: (productId: string) => string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.product.id} className="flex items-center gap-3">
            <ProductThumb imageUrl={imageUrlOf(line.product.id)} size="small" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{line.product.nome}</p>
              <p className="text-xs text-slate-500">{line.quantity} × {formatCurrency(line.product.valorFinal)}</p>
            </div>
            <span className="flex-none text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(line.subtotal)}</span>
          </li>
        ))}
      </ul>
      <PriceSummary
        itemCount={itemCount}
        subtotal={totals.subtotal}
        savings={totals.savings}
        delivery={{ label: deliveryLabel, fee: deliveryChosen ? totals.deliveryFee : null }}
        total={totals.total}
      />
    </div>
  );
}

/**
 * Checkout da vitrine em três etapas (dados, entrega e pagamento), no padrão
 * dos marketplaces. O cartão vira token na biblioteca do Mercado Pago com a
 * chave pública da loja; o servidor recebe só produto e quantidade e confere
 * preço e estoque. Pedido criado: a sacola é limpa e abre a página do pedido.
 */
export function StorefrontCheckoutPage() {
  const { storefront: storefrontParam = '' } = useParams<{ storefront: string }>();
  const qc = useQueryClient();
  const storefrontQuery = usePublicStorefront(storefrontParam);
  const data = storefrontQuery.data;
  const store = data?.loja;
  const products = useMemo(() => data?.produtos ?? [], [data]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cart = useStorefrontCart(store?.id, products);

  const [step, setStep] = useState<Step>('identificacao');
  const [identification, setIdentification] = useState(EMPTY_IDENTIFICATION);
  const [identificationErrors, setIdentificationErrors] = useState<CheckoutErrors<CheckoutIdentification>>({});
  const [chosenDelivery, setChosenDelivery] = useState<DeliveryType | null>(null);
  const [deliveryError, setDeliveryError] = useState('');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<CheckoutErrors<CheckoutAddress>>({});
  const [cepStatus, setCepStatus] = useState<CepLookupStatus>('idle');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('pix');
  const [card, setCard] = useState(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState<CheckoutErrors<CheckoutCard>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Pedido criado: a página só redireciona (a sacola já foi limpa, não pode voltar para ela).
  const [placedOrderPath, setPlacedOrderPath] = useState<string | null>(null);

  // Na troca de etapa, a nova sobe para a vista (no celular ela pode ficar abaixo da dobra).
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    document.getElementById(`etapa-${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  useEffect(() => {
    if (store) document.title = `Pagamento · ${store.nome}`;
  }, [store]);

  if (placedOrderPath) {
    return <Navigate to={placedOrderPath} replace />;
  }
  if (storefrontQuery.isError || storefrontParam === '') {
    return <StorefrontMessage title="Loja não encontrada" description="Confira o link com quem o enviou." />;
  }
  if (!data || !store) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const { checkout } = data;
  const basePath = storefrontBasePath(store);
  // Sem compra pela vitrine ou com a sacola vazia, o lugar é a página da sacola.
  if (!checkout.online || cart.lines.length === 0) {
    return <Navigate to={`${basePath}/sacola`} replace />;
  }

  const delivery = chosenDelivery ?? defaultDelivery(checkout);
  const totals = checkoutTotals(cart.lines, delivery === 'entrega' ? checkout.entrega?.taxa ?? 0 : 0);
  const stepIndex = STEPS.indexOf(step);
  const stateOf = (target: Step): StepState => {
    const index = STEPS.indexOf(target);
    return index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'upcoming';
  };

  const imageUrlOf = (productId: string) => {
    const cover = productsById.get(productId)?.imagens[0];
    return cover ? getPublicProductImageUrl(store.id, cover.nomeArquivo) : null;
  };

  const continueFromIdentification = () => {
    const errors = validateIdentification(identification);
    setIdentificationErrors(errors);
    if (hasErrors(errors)) return;
    // O titular do cartão costuma ser quem compra: o CPF já vem preenchido.
    setCard((current) => (current.cpf ? current : { ...current, cpf: identification.cpf }));
    setStep('entrega');
  };

  const continueFromDelivery = () => {
    if (!delivery) {
      setDeliveryError('Escolha como quer receber o pedido');
      return;
    }
    setDeliveryError('');
    if (delivery === 'entrega') {
      const errors = validateAddress(address);
      setAddressErrors(errors);
      if (hasErrors(errors)) return;
    }
    setStep('pagamento');
  };

  const handleCepChange = async (cep: string) => {
    setAddress((current) => ({ ...current, cep }));
    if (onlyDigits(cep).length !== 8) {
      setCepStatus('idle');
      return;
    }
    setCepStatus('loading');
    try {
      const found = await fetchAddressByCep(cep);
      if (!found) {
        setCepStatus('not_found');
        return;
      }
      // Só preenche se o CEP ainda for o mesmo (a pessoa pode ter continuado digitando).
      setAddress((current) => (onlyDigits(current.cep) !== onlyDigits(cep) ? current : {
        ...current,
        rua: found.rua || current.rua,
        bairro: found.bairro || current.bairro,
        cidade: found.cidade || current.cidade,
        uf: found.uf || current.uf,
      }));
      setCepStatus('idle');
    } catch {
      setCepStatus('error');
    }
  };

  /** O cartão vira token na biblioteca do Mercado Pago, com a chave pública da loja. */
  const tokenizeCard = async (publicKey: string) => {
    const mercadoPago = await createMercadoPago(publicKey);
    const digits = onlyDigits(card.numero);
    const expiry = parseCardExpiry(card.validade)!;
    const paymentMethods = await mercadoPago.getPaymentMethods({ bin: digits.slice(0, 8) }).catch(() => null);
    const token = await mercadoPago.createCardToken({
      cardNumber: digits,
      cardholderName: card.nome.trim(),
      cardExpirationMonth: expiry.month,
      cardExpirationYear: expiry.year,
      securityCode: onlyDigits(card.cvv),
      identificationType: 'CPF',
      identificationNumber: onlyDigits(card.cpf),
    });
    if (!token.id) {
      throw new Error('Confira os dados do cartão.');
    }
    return { cardToken: token.id, paymentMethodId: paymentMethods?.results?.[0]?.id };
  };

  const pay = async () => {
    if (submitting || !delivery || !checkout.publicKey) return;
    if (paymentMethod === 'cartao') {
      const errors = validateCard(card);
      setCardErrors(errors);
      if (hasErrors(errors)) return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      const cardPayment = paymentMethod === 'cartao' ? await tokenizeCard(checkout.publicKey) : null;
      const input: PublicOrderInput = {
        itens: cart.lines.map((line) => ({ produto_id: line.product.id, quantidade: line.quantity })),
        cliente: {
          nome: identification.nome.trim(),
          email: identification.email.trim(),
          telefone: onlyDigits(identification.telefone),
          cpf: onlyDigits(identification.cpf),
        },
        entrega: delivery === 'entrega'
          ? {
              tipo: 'entrega',
              endereco: {
                cep: onlyDigits(address.cep),
                rua: address.rua.trim(),
                numero: address.numero.trim(),
                complemento: address.complemento.trim(),
                bairro: address.bairro.trim(),
                cidade: address.cidade.trim(),
                uf: address.uf.trim().toUpperCase(),
              },
            }
          : { tipo: 'retirada' },
        pagamento: cardPayment
          ? {
              forma: 'cartao',
              card_token: cardPayment.cardToken,
              ...(cardPayment.paymentMethodId ? { payment_method_id: cardPayment.paymentMethodId } : {}),
            }
          : { forma: 'pix' },
        observacao: note.trim(),
      };
      const order = await createPublicOrder(storefrontParam, input);
      // Cartão recusado na hora: a sacola continua e a pessoa tenta de novo.
      if (order.situacao === 'recusado') {
        setSubmitError(CARD_REFUSED_MESSAGE);
        return;
      }
      qc.setQueryData(queryKeys.publicOrder(storefrontSlug(store), order.id), order);
      void qc.invalidateQueries({ queryKey: queryKeys.publicStorefront(storefrontParam) });
      setPlacedOrderPath(`${basePath}/pedido/${order.id}`);
      cart.clear();
    } catch (error) {
      setSubmitError(errorMessageOf(error));
    } finally {
      setSubmitting(false);
    }
  };

  const summary = (
    <CheckoutSummary
      lines={cart.lines}
      itemCount={cart.count}
      totals={totals}
      deliveryLabel={delivery === 'retirada' ? 'Retirada na loja' : 'Entrega'}
      deliveryChosen={delivery !== null}
      imageUrlOf={imageUrlOf}
    />
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StorefrontTopBar store={store} basePath={basePath} right={<SecureCheckoutBadge />} />

      <main className="mx-auto max-w-5xl px-4 pb-10 pt-5">
        <Link to={`${basePath}/sacola`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft size={16} /> Voltar à sacola
        </Link>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Finalizar compra</h1>

        <details className="group mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-semibold text-slate-700">
              Resumo do pedido ({cart.count} {cart.count === 1 ? 'item' : 'itens'})
            </span>
            <span className="flex items-center gap-2 text-base font-bold tabular-nums text-slate-900">
              {formatCurrency(totals.total)}
              <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-slate-100 px-4 py-4">{summary}</div>
        </details>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex flex-col gap-3">
            <StepSection
              id="etapa-identificacao"
              number={1}
              title="Seus dados"
              state={stateOf('identificacao')}
              summary={(
                <>
                  <p className="font-medium text-slate-800">{identification.nome}</p>
                  <p>{identification.email} · {identification.telefone}</p>
                </>
              )}
              onEdit={() => setStep('identificacao')}
            >
              <IdentificationFields value={identification} errors={identificationErrors} onChange={setIdentification} />
              <ContinueButton onClick={continueFromIdentification} />
            </StepSection>

            <StepSection
              id="etapa-entrega"
              number={2}
              title="Entrega"
              state={stateOf('entrega')}
              summary={delivery === 'retirada'
                ? <p>Retirar na loja{checkout.retirada ? ` — ${checkout.retirada.endereco}` : ''}</p>
                : (
                  <p>
                    Entrega em {address.rua}, {address.numero}
                    {address.complemento ? ` (${address.complemento})` : ''} — {address.bairro}, {address.cidade}/{address.uf.toUpperCase()}
                  </p>
                )}
              onEdit={() => setStep('entrega')}
            >
              <div role="radiogroup" aria-label="Como receber" className="flex flex-col gap-2">
                {checkout.retirada && (
                  <OptionCard
                    selected={delivery === 'retirada'}
                    icon={Store}
                    title="Retirar na loja"
                    description={(
                      <>
                        {checkout.retirada.endereco}
                        {checkout.retirada.horario && <><br />{checkout.retirada.horario}</>}
                      </>
                    )}
                    aside={<span className="text-emerald-600">Grátis</span>}
                    onSelect={() => setChosenDelivery('retirada')}
                  />
                )}
                {checkout.entrega && (
                  <OptionCard
                    selected={delivery === 'entrega'}
                    icon={Truck}
                    title="Receber no endereço"
                    description={checkout.entrega.descricao ?? undefined}
                    aside={checkout.entrega.taxa === 0
                      ? <span className="text-emerald-600">Grátis</span>
                      : formatCurrency(checkout.entrega.taxa)}
                    onSelect={() => setChosenDelivery('entrega')}
                  />
                )}
              </div>
              {deliveryError && <p className="mt-2 text-xs font-medium text-red-600">{deliveryError}</p>}

              {delivery === 'entrega' && (
                <div className="mt-4">
                  <AddressFields
                    value={address}
                    errors={addressErrors}
                    cepStatus={cepStatus}
                    onChange={setAddress}
                    onCepChange={(cep) => void handleCepChange(cep)}
                  />
                </div>
              )}

              <Field label="Observação para a loja (opcional)" className="mt-4">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE_LENGTH))}
                  rows={2}
                  placeholder="Ex: tamanho, cor, melhor horário"
                  className={`${inputClassName()} h-auto resize-none py-2`}
                />
              </Field>
              <ContinueButton onClick={continueFromDelivery} />
            </StepSection>

            <StepSection id="etapa-pagamento" number={3} title="Pagamento" state={stateOf('pagamento')}>
              <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-2 sm:grid-cols-2">
                <OptionCard
                  selected={paymentMethod === 'pix'}
                  icon={QrCode}
                  title="Pix"
                  description="Aprovação na hora. O código vale 30 minutos."
                  onSelect={() => setPaymentMethod('pix')}
                />
                <OptionCard
                  selected={paymentMethod === 'cartao'}
                  icon={CreditCard}
                  title="Cartão de crédito"
                  description="À vista."
                  onSelect={() => {
                    setPaymentMethod('cartao');
                    // Adianta a biblioteca do Mercado Pago enquanto a pessoa digita o cartão.
                    void loadMercadoPagoScript().catch(() => undefined);
                  }}
                />
              </div>

              {paymentMethod === 'cartao' && (
                <div className="mt-4">
                  <CardFields value={card} errors={cardErrors} onChange={setCard} />
                </div>
              )}

              {checkout.politicaTroca && (
                <details className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-slate-700">Política de troca e devolução</summary>
                  <p className="mt-2 whitespace-pre-line text-slate-600">{checkout.politicaTroca}</p>
                </details>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Seus dados vão só para {store.nome}, para o pedido e a entrega. O pagamento é processado pelo Mercado Pago.
              </p>

              {submitError && (
                <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {submitError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void pay()}
                disabled={submitting}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Processando…</>
                  : <><Lock size={16} /> Pagar {formatCurrency(totals.total)}</>}
              </button>
            </StepSection>
          </div>

          <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:block">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Resumo do pedido</h2>
            {summary}
          </aside>
        </div>
      </main>

      <StorefrontFooter className="pb-8" />
    </div>
  );
}
