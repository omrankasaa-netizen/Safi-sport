/**
 * SAFI wordmark — forward-leaning italic caps with the red speed-slash.
 * Pure styled text/SVG: no binary logo files in the repo.
 */
export function LogoMark({ size = 'md', light = false }) {
  const scale = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  const sub = size === 'lg' ? 'text-[11px]' : size === 'sm' ? 'text-[6px]' : 'text-[8px]';
  const base = light ? 'text-safi-black' : 'text-safi-ice';

  return (
    <span className="inline-flex select-none flex-col leading-none">
      <span className={`font-display font-extrabold italic ${scale} tracking-tight`}>
        <span className={base}>SAFI</span>
        <span className="text-safi-red">/</span>
      </span>
      <span className={`font-display font-semibold ${sub} ${base} ml-0.5 tracking-[0.62em]`}>
        SPORT
      </span>
    </span>
  );
}
