import { emptyCatalogs } from '../data'
import type { Catalogs, CaseType, FollowUp, ServiceCase, UserAccess, UserProfile } from '../types'
import { getAccessToken } from './auth'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

async function authHeaders() {
  const accessToken = await getAccessToken()
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders()
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'No se pudo completar la solicitud.')
  }

  return payload as T
}

export async function getCurrentUserProfile() {
  return request<UserProfile>('/v1/auth/me')
}

export async function loadCatalogs(): Promise<Catalogs> {
  try {
    return await request<Catalogs>('/v1/catalogos')
  } catch {
    return emptyCatalogs
  }
}

export async function loadCases(): Promise<ServiceCase[]> {
  const response = await request<{ items: ServiceCase[] }>('/v1/casos?limit=100')
  return response.items
}

export async function loadFollowUps(caseId: string): Promise<FollowUp[]> {
  return request<FollowUp[]>(`/v1/casos/${caseId}/seguimientos`)
}

export async function createFollowUp(form: {
  caseId: string
  comment: string
  visibility: FollowUp['visibility']
}): Promise<FollowUp> {
  return request<FollowUp>(`/v1/casos/${form.caseId}/seguimientos`, {
    method: 'POST',
    body: JSON.stringify({
      comment: form.comment,
      visibility: form.visibility,
    }),
  })
}

export async function createServiceCase(form: {
  type: CaseType
  customer: string
  requesterName: string
  requesterEmail: string
  receptionAt: string
  address: string
  receptionChannelId: string
  dispatched: boolean
  reason: string
  areaId: string
  priority: ServiceCase['priority']
  slaDays: number
}) {
  return request<ServiceCase>('/v1/casos', {
    method: 'POST',
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(form),
  })
}

export async function updateServiceCase(
  id: string,
  form: {
    type: CaseType
    requesterName: string
    requesterEmail: string
    receptionAt: string
    address: string
    dispatched: boolean
    status: ServiceCase['status']
    areaId: string
    priority: ServiceCase['priority']
    slaDays: number
    publicResponse: string
    internalSummary: string
  },
) {
  return request<ServiceCase>(`/v1/casos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(form),
  })
}

export async function softDeleteServiceCase(id: string) {
  await request<void>(`/v1/casos/${id}`, {
    method: 'DELETE',
  })
}

export async function loadUsers(): Promise<UserProfile[]> {
  return request<UserProfile[]>('/v1/usuarios')
}

export async function updateUserProfile(user: UserProfile) {
  await request<void>(`/v1/usuarios/${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify(user),
  })
}

export async function loadUserAccess(): Promise<UserAccess[]> {
  return []
}

export async function createUserAccess(_user: Omit<UserAccess, 'id'>) {
  throw new Error('La alta directa de accesos se gestiona desde Microsoft Entra ID y PostgreSQL.')
}

export async function updateUserAccess(_user: UserAccess) {
  throw new Error('La alta directa de accesos se gestiona desde Microsoft Entra ID y PostgreSQL.')
}

export async function createArea(name: string) {
  await request<void>('/v1/catalogos/areas', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function updateArea(id: string, values: { name: string; active: boolean }) {
  await request<void>(`/v1/catalogos/areas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export async function createCategory(caseType: CaseType, name: string) {
  await request<void>('/v1/catalogos/categorias', {
    method: 'POST',
    body: JSON.stringify({ caseType, name }),
  })
}

export async function updateCategory(id: string, values: { name: string; active: boolean }) {
  await request<void>(`/v1/catalogos/categorias/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export async function createReason(categoryId: string, name: string) {
  await request<void>('/v1/catalogos/motivos', {
    method: 'POST',
    body: JSON.stringify({ categoryId, name }),
  })
}

export async function updateReason(id: string, values: { name: string; active: boolean }) {
  await request<void>(`/v1/catalogos/motivos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}
