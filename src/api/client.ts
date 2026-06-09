import type { ApiErrorBody } from './types';

const rawBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'https://shamefully-gifted-catbird.cloudpub.ru';

export const API_BASE_URL = rawBaseUrl.replace(/\/$/, '');

let authToken: string | null = null;

export const setApiToken = (token: string | null) => {
  authToken = token;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    const message = body?.details || body?.error || `API error ${status}`;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
};

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> => {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not set');
  }

  const headers: HeadersInit = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.auth !== false && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const data = await parseJsonSafely<T | ApiErrorBody>(response);

  if (!response.ok) {
    throw new ApiError(response.status, (data as ApiErrorBody | null) || null);
  }

  return data as T;
};
