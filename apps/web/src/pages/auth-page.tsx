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

  if (user) return <Navigate to={user.role === 'MANAGER' ? '/dashboard' : '/staff'} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      if (mode === 'login') {
        const email = String(form.get('email') || '').trim();
        const password = String(form.get('password') || '');
        if (!email) throw new ApiClientError('INVALID_INPUT', 'Please enter your email address.');
        if (!password) throw new ApiClientError('INVALID_INPUT', 'Please enter your password.');
        await login(email, password);
      } else if (mode === 'register') {
        const name = String(form.get('name') || '').trim();
        const email = String(form.get('email') || '').trim();
        const password = String(form.get('password') || '');
        const confirmPassword = String(form.get('confirmPassword') || '');

        if (!name || name.length < 2) throw new ApiClientError('INVALID_INPUT', 'Full name must be at least 2 characters.');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiClientError('INVALID_INPUT', 'Please enter a valid email address.');
        if (password.length < 8) throw new ApiClientError('INVALID_INPUT', 'Password must contain at least 8 characters.');
        if (!/[A-Z]/.test(password)) throw new ApiClientError('INVALID_INPUT', 'Password must contain an uppercase letter.');
        if (!/[a-z]/.test(password)) throw new ApiClientError('INVALID_INPUT', 'Password must contain a lowercase letter.');
        if (!/\d/.test(password)) throw new ApiClientError('INVALID_INPUT', 'Password must contain a number.');
        if (password !== confirmPassword) throw new ApiClientError('INVALID_INPUT', 'Passwords do not match.');

        await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        setMode('login'); setError(''); setNotice('Staff account created. Sign in to open your dashboard. Manager access is assigned by an administrator.');
      } else if (resetStage === 'request') {
        const email = String(form.get('email') || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiClientError('INVALID_INPUT', 'Please enter a valid email address.');
        setResetEmail(email);
        const result = await api<{ message: string; developmentOtp?: string }>('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email }) });
        setResetStage('verify'); setError(''); setNotice(result.developmentOtp ? `Development reset code: ${result.developmentOtp}` : result.message);
      } else {
        const otp = String(form.get('otp') || '').trim();
        const password = String(form.get('password') || '');
        const confirmPassword = String(form.get('confirmPassword') || '');

        if (!/^\d{6}$/.test(otp)) throw new ApiClientError('INVALID_INPUT', 'Enter a valid six-digit reset code.');
        if (password.length < 8) throw new ApiClientError('INVALID_INPUT', 'Password must contain at least 8 characters.');
        if (!/[A-Z]/.test(password)) throw new ApiClientError('INVALID_INPUT', 'Password must contain an uppercase letter.');
        if (!/[a-z]/.test(password)) throw new ApiClientError('INVALID_INPUT', 'Password must contain a lowercase letter.');
        if (!/\d/.test(password)) throw new ApiClientError('INVALID_INPUT', 'Password must contain a number.');
        if (password !== confirmPassword) throw new ApiClientError('INVALID_INPUT', 'Passwords do not match.');

        await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: resetEmail, otp, password }) });
        setMode('login'); setResetStage('request'); setError(''); setNotice('Password updated successfully. Sign in with your new password.');
      }
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        let msg = cause.message;
        if (cause.details && typeof cause.details === 'object' && 'fieldErrors' in cause.details) {
          const fieldMsgs = Object.values((cause.details as { fieldErrors: Record<string, string[]> }).fieldErrors).flat();
          if (fieldMsgs.length > 0) msg = fieldMsgs.join(' ');
        }
        setError(msg);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally { setBusy(false); }
  }

  function switchMode(target: Mode) {
    setMode(target);
    setError('');
    setNotice('');
    setResetStage('request');
    setResetEmail('');
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
        <p>{mode === 'login' ? 'Sign in with your team credentials.' : mode === 'register' ? 'Staff accounts can record stock operations. Manager access is granted by administrators.' : 'Enter your registered email to receive a password reset code.'}</p>
        {notice && <div className="notice success" role="status">{notice}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
        <form onSubmit={submit} className="form-stack">
          {mode === 'register' && <label>Full name<input name="name" minLength={2} required autoComplete="name" placeholder="Aarav Mehta" /></label>}
          {!(mode === 'reset' && resetStage === 'verify') && <label>Email address<input name="email" type="email" required autoComplete="email" defaultValue={mode === 'login' ? '' : resetEmail} placeholder="you@company.com" /></label>}
          {mode === 'reset' && resetStage === 'verify' && <label>Six-digit code<input name="otp" inputMode="numeric" pattern="[0-9]{6}" required placeholder="000000" /></label>}
          {(mode !== 'reset' || resetStage === 'verify') && <>
            <label>{mode === 'reset' ? 'New password' : 'Password'}
              <div className="password-field">
                <input name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
            {mode !== 'login' && <label>Confirm password
              <div className="password-field">
                <input name="confirmPassword" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" />
              </div>
            </label>}
          </>}
          <button className="button primary full" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : resetStage === 'request' ? 'Send reset code' : 'Update password'}<ArrowRight size={17} /></button>
        </form>
        <div className="auth-switches">
          {mode !== 'login' && <button type="button" onClick={() => switchMode('login')}>Back to sign in</button>}
          {mode === 'login' && <><button type="button" onClick={() => switchMode('register')}>Create account</button><button type="button" onClick={() => switchMode('reset')}>Forgot password?</button></>}
        </div>
      </div>
    </section>
  </div>;
}
