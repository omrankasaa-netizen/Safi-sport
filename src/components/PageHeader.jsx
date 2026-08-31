import React from 'react';
import { useI18n } from '@/lib/i18n';

export default function PageHeader({ eyebrow, title, sub }) {
  const { lang } = useI18n();
  return (
    <header>
      <span className="kh-eyebrow">{eyebrow}</span>
      <h1 className={`kh-section-title mt-4 text-4xl sm:text-6xl ${lang === 'ar' ? 'kh-section-title-ar' : ''}`}>{title}</h1>
      {sub && <p className="mt-4 max-w-2xl" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </header>
  );
}
