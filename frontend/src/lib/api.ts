export class HttpError extends Error {
  status: number
  body: string
  constructor(status: number, message: string, body: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, `HTTP ${res.status}`, body)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get:   <T>(url: string)         => request<T>(url),
  post:  <T>(url: string, body: unknown) => request<T>(url, { method: 'POST',   body: JSON.stringify(body) }),
  put:   <T>(url: string, body: unknown) => request<T>(url, { method: 'PUT',    body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) => request<T>(url, { method: 'PATCH',  body: JSON.stringify(body) }),
  del:   <T>(url: string, body?: unknown) => request<T>(url, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}

export const fsApi = (mountId: string | number) => ({
  list:       (path: string)                      => api.get<import('@/types/files').ListResponse>(`/api/fs/${mountId}/list?path=${encodeURIComponent(path)}`),
  read:       (path: string)                      => api.get<import('@/types/files').ReadResponse>(`/api/fs/${mountId}/read?path=${encodeURIComponent(path)}`),
  write:      (body: { path: string; content: string; expected_checksum?: string; expected_mtime?: string }) =>
                                                     api.put(`/api/fs/${mountId}/write`, body),
  createFile: (body: { path: string; content?: string }) => api.post(`/api/fs/${mountId}/file`, body),
  createDir:  (path: string)                      => api.post(`/api/fs/${mountId}/directory`, { path }),
  rename:     (from: string, to: string)          => api.patch(`/api/fs/${mountId}/rename`, { from, to }),
  remove:     (path: string)                      => api.del(`/api/fs/${mountId}/delete`, { path }),
  deepRemove: (path: string)                      => api.del(`/api/fs/${mountId}/deep-delete`, { path }),
  acl:        (path: string)                      => api.get<import('@/types/files').ACLView>(`/api/fs/${mountId}/acl?path=${encodeURIComponent(path)}`),
  setMode:    (path: string, mode: number)        => api.put(`/api/fs/${mountId}/acl`, { path, mode }),
  chown:      (path: string, owner_id: number | null) => api.patch(`/api/fs/${mountId}/owner`, { path, owner_id }),
  chgrp:      (path: string, group_id: number | null) => api.patch(`/api/fs/${mountId}/group`, { path, group_id }),
})
