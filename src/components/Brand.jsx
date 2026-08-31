import React from 'react';
import { LogoMark } from '@/components/Logo';

/* SAFI rebrand: the binary Kharbesh lockups are gone, so the shared brand
   mark is the text/SVG LogoMark (no image files in the repo). */
export const BrandLogo = ({ className = '', size = 'md' }) => (
  <span className={className} style={{ display: 'inline-block' }}>
    <LogoMark size={size} />
  </span>
);

/* The Kharbesh zigzag scribble became the SAFI red speed-slash. */
export const Scribble = ({ className = '', width = 40 }) => (
  <span
    className={className}
    style={{ width: Math.max(6, Math.round(width / 8)), height: 14, display: 'inline-block', transform: 'skewX(-18deg)', background: '#E1261C' }}
    aria-hidden="true"
  />
);

export const DotsMark = ({ className = '', lime = false }) => (
  <span className={`kh-dots ${lime ? 'kh-dots-lime' : ''} ${className}`} aria-hidden="true">
    <i /><i /><i />
  </span>
);

export const IconShop = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="8" height="8" /><rect x="13" y="4" width="8" height="8" /><rect x="3" y="14" width="8" height="6" /><rect x="13" y="14" width="8" height="6" />
  </svg>
);
export const IconSearch = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="6" /><line x1="20" y1="20" x2="15.5" y2="15.5" />
  </svg>
);
export const IconBag = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
export const IconWhatsApp = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.5 3.62 1.44 5.13L2 22l5.13-1.53a9.85 9.85 0 0 0 4.9 1.32h.01c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.77 14.02c-.24.68-1.4 1.31-1.93 1.39-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.79-4.16-4.94-4.35-.15-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.26-.29.57-.36.76-.36h.55c.18 0 .42-.07.65.5.24.58.81 1.99.88 2.14.07.15.11.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.28.72 1.19 1.55 1.93 1.06.95 1.97 1.25 2.25 1.39.28.14.44.12.61-.07.17-.19.72-.83.91-1.11.19-.29.38-.24.63-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.11.07.65-.17 1.33Z" />
  </svg>
);
export const IconMail = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    <path d="M3 6.5l8.4 6a1 1 0 0 0 1.2 0L21 6.5" />
  </svg>
);
export const IconHeart = ({ size = 24, filled = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7-4.6-7-9.5A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.5C19 15.4 12 20 12 20z" />
  </svg>
);
export const IconShare = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><line x1="8.2" y1="10.8" x2="15.8" y2="7.2" /><line x1="8.2" y1="13.2" x2="15.8" y2="16.8" />
  </svg>
);
export const IconCustom = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16c2-3 4 3 6 0s4 3 6 0 3-2 6-2" /><path d="M15 6l3 3" /><path d="M17.5 3.5a1.8 1.8 0 0 1 2.6 2.6l-8 8-3.6.9.9-3.6 8.1-8z" />
  </svg>
);
export const IconNewDrop = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l2.2 5.6L20 9l-4 3.6L17.2 19 12 15.8 6.8 19 8 12.6 4 9l5.8-.4L12 3z" />
  </svg>
);
export const IconThreeDots = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="2.4" /><circle cx="12" cy="12" r="2.4" /><circle cx="18" cy="12" r="2.4" /></svg>
);
export const IconCotton = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="9" r="3" /><circle cx="7" cy="12" r="2.4" /><circle cx="17" cy="12" r="2.4" /><path d="M12 12v3a3 3 0 0 1-3 3H8" />
  </svg>
);
export const IconNoSweat = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5c2.4 3.4 5 6.7 5 9.7a5 5 0 0 1-10 0c0-3 2.6-6.3 5-9.7z" /><line x1="4" y1="20" x2="20" y2="4" />
  </svg>
);
export const IconNoWrinkle = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8c3-2.5 5.5-2.5 8 0s5 2.5 8 0" /><path d="M3 14c3-2.5 5.5-2.5 8 0s5 2.5 8 0" /><path d="M3 20c3-2.5 5.5-2.5 8 0s5 2.5 8 0" opacity="0.4" />
  </svg>
);
export const IconFit = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 4l4 2 4-2 3 4-2.5 2v11a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1V10L5 8l3-4z" />
  </svg>
);
export const IconCash = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="1.5" /><circle cx="12" cy="12" r="3" /><line x1="5.5" y1="9" x2="5.5" y2="9" /><line x1="18.5" y1="15" x2="18.5" y2="15" />
  </svg>
);
export const IconTruck = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 7.5h11v8h-11v-8z" /><path d="M13.5 11h4l3 3v1.5h-7V11z" /><circle cx="6.5" cy="17.5" r="1.6" /><circle cx="16.5" cy="17.5" r="1.6" />
  </svg>
);

/* Lebanon flag + cedar seal — the one deliberate flag/cedar use on the site,
   reserved for the "100% Lebanese made" line only (explicit founder
   exception to the no-flags brand rule). Full color, not currentColor. */
export const LebanonSeal = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <clipPath id="kh-lb-seal-clip"><circle cx="20" cy="20" r="18" /></clipPath>
    </defs>
    <circle cx="20" cy="20" r="19" fill="none" stroke="var(--ink)" strokeOpacity="0.25" strokeWidth="1" />
    <g clipPath="url(#kh-lb-seal-clip)">
      <rect x="2" y="2" width="36" height="36" fill="#ED1C24" />
      <rect x="2" y="11" width="36" height="18" fill="#FFFFFF" />
      <path
        d="M20 14.5c-1.8 2.4-3.6 4.2-5.2 5.6 1.1-.3 2.2-.5 3.3-.6-1.6 2-3.4 3.7-5.4 5.1 2-.5 3.9-.9 5.7-1.1v3.1h3.2v-3.1c1.8.2 3.7.6 5.7 1.1-2-1.4-3.8-3.1-5.4-5.1 1.1.1 2.2.3 3.3.6-1.6-1.4-3.4-3.2-5.2-5.6z"
        fill="#00A651"
      />
    </g>
  </svg>
);
