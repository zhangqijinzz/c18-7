import type { BrandDocument } from '../models/brandMirrorModels'
import { clampTokenValues, validateTokens } from '../domain/brandRules'
import { StorageAccessError, type StorageService } from '../services/storageService'

export type LoadResult =
  | { readonly ok: true; readonly document: BrandDocument | null }
  | { readonly ok: false }

export interface BrandRepository {
  load(): LoadResult
  save(document: BrandDocument): void
}

export class LocalBrandRepository implements BrandRepository {
  private writable = true

  constructor(private readonly storage: StorageService) {}

  load(): LoadResult {
    let raw: string | null
    try {
      raw = this.storage.read()
    } catch {
      // 存储被禁用或不可访问：标记为不可写，防止默认值覆盖已有数据
      this.writable = false
      return { ok: false }
    }
    if (!raw) return { ok: true, document: null }
    try {
      const candidate: unknown = JSON.parse(raw)
      if (!isDocument(candidate)) return { ok: true, document: null }
      return { ok: true, document: { ...candidate, tokens: clampTokenValues(candidate.tokens) } }
    } catch {
      return { ok: true, document: null }
    }
  }

  save(document: BrandDocument): void {
    const validationError = validateTokens(document.tokens)
    if (validationError) throw new Error(validationError)
    if (!this.writable) return
    try {
      this.storage.write(JSON.stringify(document))
    } catch (error) {
      // 配额已满或写入被拒：后续一律跳过写入，避免反复失败与误覆盖
      this.writable = false
      throw error instanceof StorageAccessError ? error : new StorageAccessError('write', error)
    }
  }
}

function isDocument(value: unknown): value is BrandDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandDocument>
  return candidate.version === 1 && !!candidate.tokens && Array.isArray(candidate.versions) && typeof candidate.theme === 'string'
}
