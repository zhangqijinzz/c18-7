import { describe, expect, it } from 'vitest'
import { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import type { BrandDocument } from '../models/brandMirrorModels'
import type { BrandRepository, LoadResult } from '../repositories/brandRepository'
import { buildBrandGuidelinesMarkdown, type BrandGuidelinesExporter } from '../services/exportService'
import { StorageAccessError } from '../services/storageService'

class MemoryRepository implements BrandRepository {
  document: BrandDocument | null = null
  shouldFail = false
  loadFailure: 'none' | 'storage' = 'none'
  saveCalls = 0
  load(): LoadResult {
    if (this.loadFailure === 'storage') return { ok: false }
    return { ok: true, document: this.document }
  }
  save(document: BrandDocument): void {
    this.saveCalls += 1
    if (this.shouldFail) throw new StorageAccessError('write')
    this.document = document
  }
}

class FailingExporter implements BrandGuidelinesExporter {
  export(): void {
    throw new Error('download blocked')
  }
}

class MemoryExporter implements BrandGuidelinesExporter {
  received: string | null = null
  export(snapshot: Parameters<BrandGuidelinesExporter['export']>[0]): void { this.received = buildBrandGuidelinesMarkdown(snapshot) }
}

describe('BrandMirrorViewModel', () => {
  it('initializes, updates tokens and persists the latest state', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateColor('primary', '#123456')
    viewModel.updateScale('typeScale', 0, 18)
    expect(viewModel.getSnapshot().tokens.primary).toBe('#123456')
    expect(viewModel.getSnapshot().tokens.typeScale[0]).toBe(18)
    expect(repository.document?.tokens.primary).toBe('#123456')
  })

  it('saves two versions and enters comparison mode', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.saveVersion()
    viewModel.updateColor('primary', '#238B73')
    viewModel.saveVersion()
    viewModel.toggleCompare()
    expect(viewModel.getSnapshot().versions.map((version) => version.label)).toEqual(['Version A', 'Version B'])
    expect(viewModel.getSnapshot().compareMode).toBe(true)
  })

  it('keeps editing usable when persistence fails', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    repository.shouldFail = true
    viewModel.updateColor('secondary', '#FFFFFF')
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().tokens.secondary).toBe('#FFFFFF')
    expect(viewModel.getSnapshot().storageAvailable).toBe(false)
    expect(viewModel.getSnapshot().message).toContain('无法读取或写入')
  })

  it('recovers a previously persisted document on initialization', () => {
    const repository = new MemoryRepository()
    repository.document = { version: 1, theme: 'night', tokens: { primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38] }, versions: [] }
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    expect(viewModel.getSnapshot().theme).toBe('night')
    expect(viewModel.getSnapshot().message).toContain('恢复')
    expect(viewModel.getSnapshot().storageAvailable).toBe(true)
  })

  it('exports the current token system as brand guidelines', () => {
    const repository = new MemoryRepository()
    const exporter = new MemoryExporter()
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.exportBrandGuidelines()
    expect(exporter.received).toContain('# BrandMirror 品牌规范')
    expect(exporter.received).toContain('`primary`')
    expect(viewModel.getSnapshot().message).toContain('导出')
  })

  it('falls back to default tokens when local data cannot be read, without white-screening', () => {
    const repository = new MemoryRepository()
    repository.loadFailure = 'storage'
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.storageAvailable).toBe(false)
    expect(snapshot.tokens.primary).toBe('#F15A47')
    expect(snapshot.message).toContain('无法读取或写入')
  })

  it('never writes default values over storage after a read failure', () => {
    const repository = new MemoryRepository()
    repository.document = { version: 1, theme: 'night', tokens: { primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38] }, versions: [] }
    repository.loadFailure = 'storage'
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateColor('primary', '#123456')
    viewModel.saveVersion()
    viewModel.reset()
    expect(repository.saveCalls).toBe(0)
    // 存储中的既有文档保持原样，默认值没有覆盖回去
    expect(repository.document.tokens.primary).toBe('#A98BFF')
  })

  it('reports the consistent storage-unavailable message on version saves after quota failure', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    repository.shouldFail = true
    viewModel.saveVersion()
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().versions).toHaveLength(0)
    expect(viewModel.getSnapshot().message).toContain('无法读取或写入')
    // 后续操作不再反复尝试写入
    viewModel.saveVersion()
    expect(repository.saveCalls).toBe(1)
  })

  it('keeps the same error-state wording when exporting fails', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository, new FailingExporter())
    viewModel.initialize()
    viewModel.exportBrandGuidelines()
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().message).toBe('导出失败，请稍后重试')
  })
})
