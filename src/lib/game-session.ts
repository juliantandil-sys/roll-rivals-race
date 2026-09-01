const key = (code: string) => `dados-token:${code.toUpperCase()}`;

export function saveToken(code: string, token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(code), token);
}

export function readToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key(code));
}

export function clearToken(code: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(code));
}
