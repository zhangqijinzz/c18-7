import { describe, expect, it } from 'vitest'
import { LocalBrandRepository, type DocumentLoadResult } from '../repositories/brandRepository'
import type { StorageReadResult, StorageService } from '../services/storageService'
import { INITIAL_TOKENS, type BrandDocument } from '../models/brandMirrorModels'

class FakeStorage implements StorageService {
  raw: string | null = null
  readFails = false
  writeFails = false
  writes: string[] = []
  read(): StorageReadResult {
    return this.readFails ? { ok: false } : { ok: true, value: this.raw }
  }
  write(value: string): void {
    if (this.writeFails) throw new Error('QuotaExceededError')
    this.writes.push(value)
    this.raw = value
  }
}

const validDocument: BrandDocument = { version: 1, theme: 'studio', tokens: INITIAL_TOKENS, versions: [] }

describe('LocalBrandRepository', () => {
  it('returns empty when nothing is stored', () => {
    const repository = new LocalBrandRepository(new FakeStorage())
    expect(repository.load().status).toBe('empty')
  })

  it('restores a valid stored document', () => {
    const storage = new FakeStorage()
    storage.raw = JSON.stringify(validDocument)
    const repository = new LocalBrandRepository(storage)
    const result: DocumentLoadResult = repository.load()
    expect(result.status).toBe('ready')
    if (result.status === 'ready') expect(result.document.theme).toBe('studio')
  })

  it('treats corrupt content as empty without writing it back', () => {
    const storage = new FakeStorage()
    storage.raw = '{not-json'
    const repository = new LocalBrandRepository(storage)
    expect(repository.load().status).toBe('empty')
    expect(storage.writes).toHaveLength(0)
  })

  it('reports unavailable when the storage layer cannot be read', () => {
    const storage = new FakeStorage()
    storage.readFails = true
    const repository = new LocalBrandRepository(storage)
    expect(repository.load()).toEqual({ status: 'unavailable' })
  })

  it('propagates write failures so callers can enter degraded mode', () => {
    const storage = new FakeStorage()
    storage.writeFails = true
    const repository = new LocalBrandRepository(storage)
    expect(() => repository.save(validDocument)).toThrow('QuotaExceededError')
  })
})
