const STORAGE_KEY = 'brandmirror.document.v1'

/**
 * 读取或写入浏览器本地存储失败（存储被禁用、隐身模式限制或配额已满）。
 * 调用方据此与“没有数据”区分开，避免把默认值误写回覆盖已有内容。
 */
export class StorageAccessError extends Error {
  constructor(operation: 'read' | 'write', cause?: unknown) {
    super(`无法${operation === 'read' ? '读取' : '写入'}本地存储`)
    this.name = 'StorageAccessError'
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', { value: cause, enumerable: false, configurable: true, writable: true })
    }
  }
}

export interface StorageService {
  read(): string | null
  write(value: string): void
}

export class LocalStorageService implements StorageService {
  private get storage(): Storage {
    return window.localStorage
  }

  read(): string | null {
    try {
      return this.storage.getItem(STORAGE_KEY)
    } catch (error) {
      throw new StorageAccessError('read', error)
    }
  }

  write(value: string): void {
    try {
      this.storage.setItem(STORAGE_KEY, value)
    } catch (error) {
      throw new StorageAccessError('write', error)
    }
  }
}
