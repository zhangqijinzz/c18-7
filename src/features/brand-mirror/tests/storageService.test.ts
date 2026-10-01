import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageService, StorageAccessError } from '../services/storageService'
import { LocalBrandRepository } from '../repositories/brandRepository'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LocalStorageService', () => {
  it('round-trips a value through localStorage', () => {
    const service = new LocalStorageService()
    service.write('{"hello":true}')
    expect(service.read()).toBe('{"hello":true}')
  })

  it('raises StorageAccessError when reading is blocked by the browser', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access is denied for this document')
    })
    const service = new LocalStorageService()
    expect(() => service.read()).toThrow(StorageAccessError)
  })

  it('raises StorageAccessError when the quota is full on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const service = new LocalStorageService()
    expect(() => service.write('data')).toThrow(StorageAccessError)
  })

  it('stays readable as null when no document has been stored', () => {
    const repository = new LocalBrandRepository(new LocalStorageService())
    expect(repository.load()).toEqual({ ok: true, document: null })
  })
})
