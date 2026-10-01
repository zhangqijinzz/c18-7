import type { BrandDocument } from '../models/brandMirrorModels'
import { clampTokenValues, validateTokens } from '../domain/brandRules'
import type { StorageService } from '../services/storageService'

export type DocumentLoadResult =
  | { status: 'unavailable' }
  | { status: 'empty' }
  | { status: 'ready'; document: BrandDocument }

export interface BrandRepository {
  load(): DocumentLoadResult
  save(document: BrandDocument): void
}

export class LocalBrandRepository implements BrandRepository {
  constructor(private readonly storage: StorageService) {}

  load(): DocumentLoadResult {
    const reading = this.storage.read()
    if (!reading.ok) return { status: 'unavailable' }
    const raw = reading.value
    if (!raw) return { status: 'empty' }
    try {
      const candidate: unknown = JSON.parse(raw)
      if (!isDocument(candidate)) return { status: 'empty' }
      return { status: 'ready', document: { ...candidate, tokens: clampTokenValues(candidate.tokens) } }
    } catch {
      // 数据损坏时按无数据处理（默认令牌），不把损坏内容写回存储
      return { status: 'empty' }
    }
  }

  save(document: BrandDocument): void {
    const validationError = validateTokens(document.tokens)
    if (validationError) throw new Error(validationError)
    this.storage.write(JSON.stringify(document))
  }
}

function isDocument(value: unknown): value is BrandDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandDocument>
  return candidate.version === 1 && !!candidate.tokens && Array.isArray(candidate.versions) && typeof candidate.theme === 'string'
}
