import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { MailCheck, ShieldCheck } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/lib/AuthContext';
import { LogoMark } from '@/components/Logo';
import { ErrorNote, btnRed, inputCls, labelCls } from './ui';

/**
 * Staff login — email + 6-digit code (no passwords). The code is mailed by
 * the server; verifying it sets the session cookie (SPEC §6 Login).
 */
export default function AdminLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { checkUserAuth } = useAuth();
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const requestOtp = trpc.auth.requestEmailOtp.useMutation({
    onSuccess: () => setStep('code'),
  });
  const verifyOtp = trpc.auth.verifyEmailOtp.useMutation({
    onSuccess: async () => {
      await checkUserAuth();
      nav(params.get('returnTo') || '/admin');
    },
  });

  const busy = requestOtp.isPending || verifyOtp.isPending;

  return (
    <main className="flex min-h-screen items-center justify-center bg-safi-black px-4">
      <div className="w-full max-w-sm rounded-sm border border-safi-line bg-safi-graphite/60 p-6">
        <LogoMark size="lg" />
        <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-safi-steel">Staff sign-in</p>

        {step === 'email' ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              requestOtp.mutate({ email: email.trim() });
            }}
          >
            <div>
              <label htmlFor="email" className={labelCls}>Work email</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@safisport.com"
                className={inputCls}
              />
            </div>
            <ErrorNote error={requestOtp.error} />
            <button type="submit" disabled={busy} className={`${btnRed} w-full py-3`}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
            <p className="text-[11px] leading-relaxed text-safi-steel">
              We email you a 6-digit code. No password to remember. Only emails approved by the owner get in.
            </p>
          </form>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verifyOtp.mutate({ email: email.trim(), code: code.trim() });
            }}
          >
            <p className="flex items-center gap-2 text-sm text-safi-ice">
              <MailCheck className="h-4 w-4 text-safi-red" /> Code sent to <b>{email}</b>
            </p>
            <div>
              <label htmlFor="code" className={labelCls}>6-digit code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className={`${inputCls} text-center font-display text-2xl tracking-[0.5em]`}
              />
            </div>
            <ErrorNote error={verifyOtp.error} />
            <button type="submit" disabled={busy || code.length !== 6} className={`${btnRed} w-full py-3`}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                verifyOtp.reset();
              }}
              className="w-full text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-steel hover:text-safi-ice"
            >
              ← Use a different email
            </button>
          </form>
        )}

        <p className="mt-6 flex items-center gap-2 border-t border-safi-line pt-4 text-[10px] uppercase tracking-[0.2em] text-safi-steel">
          <ShieldCheck className="h-3.5 w-3.5" /> Signed-in sessions last 7 days
        </p>
        <p className="mt-2 text-center">
          <Link to="/" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-safi-steel hover:text-safi-ice">
            ← Back to the store
          </Link>
        </p>
      </div>
    </main>
  );
}
