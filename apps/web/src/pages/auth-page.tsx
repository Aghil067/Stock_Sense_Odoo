import { ArrowRight, Boxes, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { api, ApiClientError } from '../lib/api';

type Mode = 'login' | 'register' | 'reset';

export function AuthPage() {
  const { user, login } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetStage, setResetStage] = useState<'request' | 'verify'>('request');
  const [resetEmail, setResetEmail] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      if (mode === 'login') {
        await login(String(form.get('email')), String(form.get('password')));
      } else if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') }) });
        setMode('login'); setNotice('Staff account created. Sign in to open your dashboard. Manager access is assigned by an administrator.');
      } else if (resetStage === 'request') {
        const email = String(form.get('email')); setResetEmail(email);
        const result = await api<{ message: string; developmentOtp?: string }>('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email }) });
        setResetStage('verify'); setNotice(result.developmentOtp ? `Development reset code: ${result.developmentOtp}` : result.message);
      } else {
        await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: resetEmail, otp: form.get('otp'), password: form.get('password') }) });
        setMode('login'); setResetStage('request'); setNotice('Password updated. Sign in with your new password.');
      }
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  return <div className="auth-layout">
    <section className="auth-story">
      <div className="brand-row auth-brand"><div className="brand-mark"><span /></div><strong>StockSense</strong></div>
      <div className="auth-message"><span className="eyebrow light">Warehouse clarity, without the spreadsheets</span><h1>Every unit.<br />Every location.<br /><em>Fully accountable.</em></h1><p>Run receipts, deliveries, transfers and physical counts through one reliable inventory ledger.</p></div>
      <div className="auth-proof"><ShieldCheck size={24} /><div><strong>Transaction-safe inventory</strong><span>Every completed movement is validated, persisted and auditable.</span></div></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-icon"><Boxes size={24} /></div>
        <span className="eyebrow">{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Join your workspace' : 'Recover access'}</span>
        <h2>{mode === 'login' ? 'Sign in to StockSense' : mode === 'register' ? 'Create an account' : resetStage === 'request' ? 'Reset your password' : 'Enter your reset code'}</h2>
        <p>{mode === 'login' ? 'Use the demo account or your team credentials.' : 'All fields are validated before they reach inventory operations.'}</p>
        {notice && <div className="notice success" role="status">{notice}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
        <form onSubmit={submit} className="form-stack">
          {mode === 'register' && <label>Full name<input name="name" minLength={2} required autoComplete="name" placeholder="Aarav Mehta" /></label>}
          {!(mode === 'reset' && resetStage === 'verify') && <label>Email address<input name="email" type="email" required autoComplete="email" defaultValue={mode === 'login' ? 'manager@stocksense.local' : ''} placeholder="you@company.com" /></label>}
          {mode === 'reset' && resetStage === 'verify' && <label>Six-digit code<input name="otp" inputMode="numeric" pattern="[0-9]{6}" required placeholder="000000" /></label>}
          {(mode !== 'reset' || resetStage === 'verify') && <label>Password<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} defaultValue={mode === 'login' ? 'Demo@12345' : ''} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
          <button className="button primary full" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : resetStage === 'request' ? 'Send reset code' : 'Update password'}<ArrowRight size={17} /></button>
        </form>
        <div className="auth-switches">
          {mode !== 'login' && <button onClick={() => { setMode('login'); setError(''); }}>Back to sign in</button>}
          {mode === 'login' && <><button onClick={() => { setMode('register'); setError(''); }}>Create account</button><button onClick={() => { setMode('reset'); setError(''); }}>Forgot password?</button></>}
        </div>
      </div>
    </section>
  </div>;
}

