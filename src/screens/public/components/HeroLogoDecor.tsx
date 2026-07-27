import homeHeroBg from '../../../../icons/home-hero-bg.png';

export function HeroLogoDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 bg-cover bg-[65%_center] opacity-45 sm:opacity-55 lg:bg-[center_right] lg:opacity-90"
        style={{ backgroundImage: `url(${homeHeroBg})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#040E12_0%,rgba(4,14,18,0.98)_28%,rgba(4,14,18,0.78)_52%,rgba(4,14,18,0.18)_78%,rgba(4,14,18,0.42)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_46%,rgba(14,196,216,0.09),transparent_52%),radial-gradient(circle_at_82%_20%,rgba(14,196,216,0.05),transparent_38%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#040E12] via-[#040E12]/78 to-transparent" />
    </div>
  );
}
