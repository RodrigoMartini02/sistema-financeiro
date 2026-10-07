import { useId, useState, type FormEvent } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { SOLUTION_NAMES, SUPPORT_CONTACT } from '../../brand';
import { formatPhone } from '../../utils/brazilDocuments';
import { PageIntro } from './components/PageIntro';
import { ScrollReveal } from './components/ScrollReveal';
import { PRIMARY_BUTTON, SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';

const OTHER_SUBJECT = 'Outro assunto';
const SUBJECTS = [SOLUTION_NAMES.finance, SOLUTION_NAMES.tenders, OTHER_SUBJECT];

const CHANNELS = [
  { icon: Mail, title: 'E-mail', value: SUPPORT_CONTACT.email, href: `mailto:${SUPPORT_CONTACT.email}`, external: false },
  { icon: MessageCircle, title: 'WhatsApp', value: SUPPORT_CONTACT.whatsappLabel, href: SUPPORT_CONTACT.whatsappUrl, external: true },
];

const fieldClass = [
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-950 outline-none transition',
  'placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:shadow-[0_0_0_4px_rgba(14,196,216,0.12)] motion-reduce:transition-none',
].join(' ');

const labelClass = 'mb-1.5 block text-[13px] font-semibold text-slate-700';

interface ContactForm {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

const EMPTY_FORM: ContactForm = { name: '', email: '', phone: '', subject: SOLUTION_NAMES.finance, message: '' };

/** E-mail pronto no aplicativo de e-mail da pessoa (não há envio pelo servidor). */
function contactMailto(form: ContactForm): string {
  const body = [
    `Nome: ${form.name}`,
    `E-mail: ${form.email}`,
    `Telefone: ${form.phone || 'Não informado'}`,
    `Assunto: ${form.subject}`,
    '',
    form.message,
  ].join('\n');
  const subject = `Contato pelo site: ${form.subject}`;
  return `mailto:${SUPPORT_CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ContactPage() {
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [mailOpened, setMailOpened] = useState(false);
  const fieldId = useId();

  const update = (field: keyof ContactForm, value: string) => {
    setMailOpened(false);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.location.href = contactMailto(form);
    setMailOpened(true);
    setForm(EMPTY_FORM);
  };

  return (
    <>
      <PageIntro
        label="Contato"
        title="Fale com a gente."
        description="Dúvidas, suporte ou sugestões: escreva para a gente. Respondemos em até 1 dia útil."
      />

      <section className={SITE_SECTION}>
        <div className={`${SITE_CONTAINER} grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16`}>
          <ScrollReveal>
            <div className="grid gap-4">
              {CHANNELS.map(({ icon: Icon, title, value, href, external }) => (
                <a
                  key={title}
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="flex items-center gap-4 rounded-[24px] border border-slate-200 bg-white p-6 outline-none transition hover:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e6f6f8] text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</span>
                    <span className="mt-1 block text-[17px] font-semibold text-slate-950">{value}</span>
                  </span>
                </a>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.08}>
            <form onSubmit={handleSubmit} className="grid gap-4 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${fieldId}-name`} className={labelClass}>Nome</label>
                  <input id={`${fieldId}-name`} required autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-email`} className={labelClass}>E-mail</label>
                  <input id={`${fieldId}-email`} type="email" required autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} className={fieldClass} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${fieldId}-phone`} className={labelClass}>Telefone ou WhatsApp (opcional)</label>
                  <input
                    id={`${fieldId}-phone`}
                    type="tel"
                    autoComplete="tel"
                    inputMode="numeric"
                    placeholder="(DDD) número"
                    value={form.phone}
                    onChange={(event) => update('phone', formatPhone(event.target.value))}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-subject`} className={labelClass}>Sobre</label>
                  <select id={`${fieldId}-subject`} value={form.subject} onChange={(event) => update('subject', event.target.value)} className={`${fieldClass} cursor-pointer`}>
                    {SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor={`${fieldId}-message`} className={labelClass}>Mensagem</label>
                <textarea
                  id={`${fieldId}-message`}
                  required
                  rows={5}
                  value={form.message}
                  onChange={(event) => update('message', event.target.value)}
                  className={`${fieldClass} h-auto resize-y py-3`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button type="submit" className={PRIMARY_BUTTON}>
                  Escrever o e-mail
                </button>
                <p className="text-[13px] text-slate-500">Abre o seu aplicativo de e-mail com a mensagem pronta.</p>
              </div>
              {mailOpened && (
                <p role="status" className="rounded-xl bg-[#eef8f9] px-4 py-3 text-[14px] text-slate-700">
                  Se o aplicativo de e-mail não abriu, escreva para {SUPPORT_CONTACT.email} ou chame no WhatsApp {SUPPORT_CONTACT.whatsappLabel}.
                </p>
              )}
            </form>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
