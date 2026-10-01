const STORAGE_KEY = 'brandmirror.document.v1'

export type StorageReadResult =
  | { ok: true; value: string | null }
  | { ok: false }

export interface StorageService {
  read(): StorageReadResult
  write(value: string): void
}

export class LocalStorageService implements StorageService {
  read(): StorageReadResult {
    try {
      return { ok: true, value: window.localStorage.getItem(STORAGE_KEY) }
    } catch {
      // 浏览器禁用本地存储（隐私模式/安全策略）或存储不可访问时会抛出异常
      return { ok: false }
    }
  }

  write(value: string): void {
    // 配额已满或存储被禁用时抛出异常，交由上层统一进入存储不可用兜底
    window.localStorage.setItem(STORAGE_KEY, value)
  }
}
