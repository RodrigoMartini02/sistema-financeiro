export function HeroLogoDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden select-none overflow-hidden lg:block">
      <img
        src="/icons/logo-hero.png"
        alt=""
        aria-hidden="true"
        className="absolute right-[-6%] top-1/2 -translate-y-1/2 object-contain"
        style={{
          width:  'min(110vh, 980px)',
          height: 'min(110vh, 980px)',
          opacity: 0.13,
          mixBlendMode: 'screen',
          filter: 'brightness(3.2)',
        }}
      />
      {/* fade esquerdo largo — protege todo o conteúdo de texto */}
      <div className="absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-[#040E12] via-[#040E12]/70 to-transparent" />
      {/* fade direito — dissolve a borda da logo */}
      <div className="absolute inset-y-0 right-0 w-[12%] bg-gradient-to-l from-[#040E12] to-transparent" />
      {/* fade topo e base */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#040E12] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#040E12] to-transparent" />
    </div>
  );
}
