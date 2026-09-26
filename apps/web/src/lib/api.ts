export class ApiClientError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

async function request<T>(path: string, options?: RequestInit, paginated = false): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json();
  if (!response.ok) throw new ApiClientError(payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? 'Request failed.', payload.error?.details);
  return paginated ? payload : payload.data ?? payload;
}

export const api = <T>(path: string, options?: RequestInit) => request<T>(path, options);
export const apiPage = <T>(path: string, options?: RequestInit) => request<T>(path, options, true);

export const formatQuantity = (value: string | number, symbol?: string) => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}${symbol ? ` ${symbol}` : ''}`;
export const formatDate = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

