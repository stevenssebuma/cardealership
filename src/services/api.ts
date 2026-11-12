import { getApiBaseUrl } from '../config/env';
import { AUTH_STORAGE_KEYS } from '../features/auth/types';

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
  updated_at?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  user?: T;
  token?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
 ): Promise<T> {
  // The API origin comes from the shared public environment contract
  // (VITE_API_BASE_URL through src/config/env.ts) and is resolved per request
  // so a missing variable fails the request instead of the whole bundle.
  const baseUrl = getApiBaseUrl();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.message || 'Something went wrong',
      response.status
    );
  }

  return data;
}

export async function registerCustomer(customer: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}) {
  return request<ApiResponse<Customer>>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(customer)
    }
  );
}

export async function loginCustomer(credentials: {
  email: string;
  password: string;
}) {
  const data = await request<ApiResponse<Customer>>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(credentials)
    }
  );

  if (data.token) {
    localStorage.setItem(
      AUTH_STORAGE_KEYS.accessToken,
      data.token
    );
  }

  if (data.user) {
    localStorage.setItem(
      AUTH_STORAGE_KEYS.user,
      JSON.stringify(data.user)
    );
  }

  return data;
}

function authenticatedRequest<T>(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = localStorage.getItem(
    AUTH_STORAGE_KEYS.accessToken
  );

  if (!token) {
    throw new ApiError('Please log in first', 401);
  }

  return request<T>(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}

export async function getMyProfile() {
  return authenticatedRequest<ApiResponse<Customer>>(
    '/api/users/me'
  );
}

export async function updateMyProfile(profile: {
  name: string;
  email: string;
  phone: string;
}) {
  return authenticatedRequest<ApiResponse<Customer>>(
    '/api/users/me',
    {
      method: 'PATCH',
      body: JSON.stringify(profile)
    }
  );
}

export function logoutCustomer() {
  localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.user);
}

export function isLoggedIn() {
  return Boolean(
    localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
  );
}
