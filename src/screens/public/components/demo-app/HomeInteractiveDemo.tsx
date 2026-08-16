export function HomeInteractiveDemo() {
  return (
    <section aria-labelledby="demo-interativa-title" className="public-light-panel relative isolate border-b border-slate-200 bg-white py-12 sm:py-14 xl:py-16">
      <div className="mx-auto max-w-[1800px] px-5 sm:px-8 xl:px-10">
        <header className="mx-auto max-w-[1000px] text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.26em] text-site-accent">EXPERIMENTE AGORA</p>
          <h2 id="demo-interativa-title" className="mx-auto mt-4 max-w-[820px] text-[clamp(28px,2.8vw,44px)] font-semibold leading-[1.1] text-slate-950 text-balance">
            Use o sistema de verdade, com seus próprios dados.
          </h2>
          <p className="mx-auto mt-4 max-w-[680px] text-[15px] leading-relaxed text-slate-600">
            Lance uma despesa, uma receita, crie uma reserva e veja tudo refletir na hora. É uma
            demonstração — nada aqui é salvo.
          </p>
        </header>

        <div className="mt-8 h-[680px] max-h-[80vh] overflow-hidden rounded-[24px] shadow-[0_0_28px_rgba(14,196,216,0.06),0_20px_60px_rgba(0,0,0,0.28)]">
          <iframe
            src="/demo.html"
            title="Demonstração interativa do sistema Fingerence"
            sandbox="allow-scripts allow-same-origin allow-forms"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </section>
  );
}
