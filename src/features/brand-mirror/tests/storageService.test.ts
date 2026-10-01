import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageService } from '../services/storageService'

function stubWindow(localStorage: unknown) {
  vi.stubGlobal('window', { localStorage })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LocalStorageService', () => {
  it('returns the stored value when storage is accessible', () => {
    const map = new Map<string, string>()
    stubWindow({ getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) })
    const service = new LocalStorageService()
    expect(service.read().ok).toBe(true)
    service.write('{"hello":true}')
    const reading = service.read()
    expect(reading.ok ? reading.value : null).toBe('{"hello":true}')
  })

  it('reports an unavailable read instead of throwing when storage is blocked', () => {
    stubWindow({ getItem: () => { throw new Error('SecurityError: access denied') }, setItem: () => { throw new Error('SecurityError') } })
    const service = new LocalStorageService()
    expect(service.read()).toEqual({ ok: false })
  })

  it('lets write failures (e.g. quota exceeded) propagate', () => {
    stubWindow({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError: quota exceeded') } })
    const service = new LocalStorageService()
    expect(() => service.write('data')).toThrow('quota exceeded')
  })
})
