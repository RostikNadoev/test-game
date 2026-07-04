import type { ApiErrorBody, ApiUser, ExchangeTonToGameResponse } from './types';

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();

export const API_BASE_URL = rawBaseUrl.replace(/\/$/, '');

export const resolveApiUrl = (path: string) => {
  if (API_BASE_URL) {
    return `${API_BASE_URL}${path}`;
  }

  return path;
};

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setApiToken = (token: string | null) => {
  authToken = token;
};

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    const message = formatApiErrorMessage(body);
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const formatApiErrorMessage = (body: ApiErrorBody | null) => {
  if (!body) return 'API error';

  if (import.meta.env.DEV && body.details) {
    return body.details;
  }

  return body.error || body.details || 'API error';
};

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

export const normalizeBalance = (
  response: ExchangeTonToGameResponse,
  currentUser?: ApiUser | null,
) => {
  const game =
    response.balance?.game ??
    response.balance_game ??
    currentUser?.balance_game ??
    0;

  const ton =
    response.balance?.ton ??
    currentUser?.balance_ton ??
    0;

  return { ton, game };
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> => {
  const headers: HeadersInit = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.auth !== false && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(resolveApiUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const data = await parseJsonSafely<T | ApiErrorBody>(response);

  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      unauthorizedHandler?.();
    }

    throw new ApiError(response.status, (data as ApiErrorBody | null) || null);
  }

  return data as T;
};
