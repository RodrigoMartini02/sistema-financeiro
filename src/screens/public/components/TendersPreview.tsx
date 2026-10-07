import { Bell, Search } from 'lucide-react';

// Prévia da tela de busca de Licitações, feita em código e com dados
// fictícios: o módulo não tem demonstração (plano .plans/site-novo.md).

interface PreviewNotice {
  agency: string;
  state: string;
  object: string;
  modality: string;
  value: string;
  closes: string;
  tracking: string | null;
}

const PREVIEW_NOTICES: PreviewNotice[] = [
  {
    agency: 'Prefeitura de Vale Serrano',
    state: 'SP',
    object: 'Contratação de software de gestão de frotas, com implantação, treinamento e suporte',
    modality: 'Pregão eletrônico',
    value: 'R$ 186.400,00',
    closes: 'Encerra em 6 dias',
    tracking: 'Analisar',
  },
  {
    agency: 'Câmara Municipal de Lagoa Clara',
    state: 'MG',
    object: 'Aquisição de notebooks e monitores para os gabinetes',
    modality: 'Pregão eletrônico',
    value: 'R$ 74.900,00',
    closes: 'Encerra em 9 dias',
    tracking: null,
  },
  {
    agency: 'Consórcio Intermunicipal do Vale Verde',
    state: 'RS',
    object: 'Serviços contínuos de manutenção predial preventiva e corretiva',
    modality: 'Concorrência',
    value: 'R$ 1.240.000,00',
    closes: 'Encerra em 13 dias',
    tracking: 'Vou participar',
  },
];

const FILTER_CHIPS = ['SP', 'MG', 'RS', 'Pregão eletrônico', 'Até R$ 2 mi'];

export function TendersPreview() {
  return (
    <figure>
      <div
        role="img"
        aria-label="Prévia da tela de busca de Licitações: editais com órgão, objeto, modalidade, valor e prazo, e o aviso de edital novo. Dados fictícios."
        className="relative rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(8,52,61,0.12)] sm:p-6"
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-[#f8fbfb] px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-700">software de gestão</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTER_CHIPS.map((chip) => (
            <span key={chip} className="rounded-full border border-brand-200 bg-[#eef8f9] px-3 py-1 text-[12px] font-medium text-brand-700">
              {chip}
            </span>
          ))}
        </div>

        <div className="mt-5 grid gap-3">
          {PREVIEW_NOTICES.map((notice) => (
            <div key={notice.agency} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-slate-950">
                  {notice.agency} · {notice.state}
                </p>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-medium text-amber-700">{notice.closes}</span>
              </div>
              <p className="mt-2 text-[14px] leading-[1.5] text-slate-700">{notice.object}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-slate-500">
                <span>{notice.modality}</span>
                <span className="font-semibold text-slate-950">{notice.value}</span>
                {notice.tracking && (
                  <span className="ml-auto rounded-full bg-[#e6f6f8] px-2.5 py-0.5 font-medium text-brand-700">{notice.tracking}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="absolute -top-5 right-4 hidden w-[290px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:block lg:-right-6">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e6f6f8] text-brand-700">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-slate-950">Edital novo na sua busca</p>
              <p className="mt-0.5 text-[12px] leading-[1.5] text-slate-500">“Software de gestão” · Prefeitura de Vale Serrano (SP)</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[13px] text-slate-500">Prévia com dados fictícios.</figcaption>
    </figure>
  );
}
