import { SAFI_LOGO_URI } from '@/lib/logoAssets';

/**
 * SAFI SPORT logo — the owner's real red running-man lockup.
 * Served as an embedded image (see src/lib/logoAssets.js); the master
 * file lives at public/logo.webp for anything outside the React app.
 * `light` contexts are unsupported: the white "SPORT" needs a dark bg.
 */
export function LogoMark({ size = 'md' }) {
  const h = size === 'lg' ? 'h-12' : size === 'sm' ? 'h-5' : 'h-8';
  return (
    <img
      src={SAFI_LOGO_URI}
      alt="SAFI SPORT"
      className={`${h} w-auto select-none`}
      draggable="false"
    />
  );
}
