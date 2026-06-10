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

export interface UploadFileResult {
  name: string
  size?: number
  status: 'uploaded' | 'conflict' | 'error'
  error?: string
}

export interface UploadResponse {
  path: string
  files: UploadFileResult[]
}

export const fsApi = (mountId: string | number) => ({
  list:       (path: string)                      => api.get<import('@/types/files').ListResponse>(`/api/fs/${mountId}/list?path=${encodeURIComponent(path)}`),
  read:       (path: string)                      => api.get<import('@/types/files').ReadResponse>(`/api/fs/${mountId}/read?path=${encodeURIComponent(path)}`),
  // rawUrl returns the URL of the inline-streaming endpoint that
  // serves the file with its detected Content-Type and supports
  // Range requests. Designed for direct use in <img src>, <video
  // src>, <audio src>, and <iframe src> for media preview - same
  // session cookie carries the auth.
  rawUrl:     (path: string): string => `/api/fs/${mountId}/raw?path=${encodeURIComponent(path)}`,
  // thumbUrl returns the URL of the server-side thumbnailer. The
  // backend decodes the image, scales it to fit a `size`×`size`
  // box (preserving aspect ratio) and ships a JPEG with stable
  // ETag/Cache-Control headers - so a folder with hundreds of
  // photos re-paints from cache on every revisit.
  thumbUrl:   (path: string, size = 128): string =>
    `/api/fs/${mountId}/thumb?path=${encodeURIComponent(path)}&size=${size}`,
  // downloadUrl returns the absolute browser-navigable URL for one
  // or more paths under this mount. The backend streams a single
  // file directly OR a zip when more than one path is supplied (or
  // when the only path is a directory). Using a URL instead of a
  // fetch+blob lets the browser's native download UI (progress bar,
  // pause/resume) take over for large files.
  downloadUrl: (paths: string[]): string => {
    const q = paths.map((p) => `path=${encodeURIComponent(p)}`).join('&')
    return `/api/fs/${mountId}/download?${q}`
  },
  write:      (body: { path: string; content: string; expected_checksum?: string; expected_mtime?: string }) =>
                                                     api.put(`/api/fs/${mountId}/write`, body),
  createFile: (body: { path: string; content?: string }) => api.post(`/api/fs/${mountId}/file`, body),
  createDir:  (path: string)                      => api.post(`/api/fs/${mountId}/directory`, { path }),
  // upload sends a multipart/form-data POST. Browser sets the
  // boundary header from the FormData body automatically, so we
  // strip the default JSON Content-Type that the shared `request`
  // helper would otherwise inject.
  upload:     async (dirPath: string, files: File[]): Promise<UploadResponse> => {
    const form = new FormData()
    for (const f of files) form.append('files', f, f.name)
    const url = `/api/fs/${mountId}/upload?path=${encodeURIComponent(dirPath)}`
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new HttpError(res.status, `HTTP ${res.status}`, body)
    }
    return (await res.json()) as UploadResponse
  },
  // extract returns { destination } so the caller can land the user
  // on the freshly-extracted folder if they want to.
  extract:    (path: string) => api.post<{ archive: string; destination: string; entry_count: number }>(`/api/fs/${mountId}/extract`, { path }),
  rename:     (from: string, to: string)          => api.patch(`/api/fs/${mountId}/rename`, { from, to }),
  remove:     (path: string)                      => api.del(`/api/fs/${mountId}/delete`, { path }),
  deepRemove: (path: string)                      => api.del(`/api/fs/${mountId}/deep-delete`, { path }),
  acl:        (path: string)                      => api.get<import('@/types/files').ACLView>(`/api/fs/${mountId}/acl?path=${encodeURIComponent(path)}`),
  setMode:    (path: string, mode: number)        => api.put(`/api/fs/${mountId}/acl`, { path, mode }),
  chown:      (path: string, owner_id: number | null) => api.patch(`/api/fs/${mountId}/owner`, { path, owner_id }),
  chgrp:      (path: string, group_id: number | null) => api.patch(`/api/fs/${mountId}/group`, { path, group_id }),
})
