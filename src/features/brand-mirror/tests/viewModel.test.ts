import { describe, expect, it } from 'vitest'
import { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import type { BrandDocument } from '../models/brandMirrorModels'
import type { BrandRepository, DocumentLoadResult } from '../repositories/brandRepository'
import { buildBrandGuidelinesMarkdown, type BrandGuidelinesExporter } from '../services/exportService'

class MemoryRepository implements BrandRepository {
  document: BrandDocument | null = null
  shouldFail = false
  loadUnavailable = false
  saveCalls = 0
  load(): DocumentLoadResult {
    if (this.loadUnavailable) return { status: 'unavailable' }
    return this.document ? { status: 'ready', document: this.document } : { status: 'empty' }
  }
  save(document: BrandDocument): void {
    this.saveCalls += 1
    if (this.shouldFail) throw new Error('offline')
    this.document = document
  }
}

class MemoryExporter implements BrandGuidelinesExporter {
  received: string | null = null
  shouldFail = false
  export(snapshot: Parameters<BrandGuidelinesExporter['export']>[0]): void {
    if (this.shouldFail) throw new Error('export blocked')
    this.received = buildBrandGuidelinesMarkdown(snapshot)
  }
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
  })

  it('recovers a previously persisted document on initialization', () => {
    const repository = new MemoryRepository()
    repository.document = { version: 1, theme: 'night', tokens: { primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38] }, versions: [] }
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    expect(viewModel.getSnapshot().theme).toBe('night')
    expect(viewModel.getSnapshot().message).toContain('恢复')
  })

  it('opens with default tokens when local storage cannot be read', () => {
    const repository = new MemoryRepository()
    repository.loadUnavailable = true
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.tokens.primary).toBe('#F15A47')
    expect(snapshot.storageAvailable).toBe(false)
    expect(snapshot.status).toBe('error')
    expect(snapshot.message).toContain('无法读取本地数据')
  })

  it('never writes back when initialization cannot read storage', () => {
    const repository = new MemoryRepository()
    repository.loadUnavailable = true
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateColor('primary', '#238B73')
    viewModel.saveVersion()
    expect(repository.saveCalls).toBe(0)
    // 内存中的编辑仍然可用
    expect(viewModel.getSnapshot().tokens.primary).toBe('#238B73')
    expect(viewModel.getSnapshot().versions).toHaveLength(1)
  })

  it('stops attempting writes after a write fails and keeps edits in memory', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    repository.shouldFail = true
    viewModel.updateColor('secondary', '#24324A')
    const attemptsAfterFirstFailure = repository.saveCalls
    viewModel.updateColor('secondary', '#173C35')
    viewModel.saveVersion()
    expect(repository.saveCalls).toBe(attemptsAfterFirstFailure)
    expect(viewModel.getSnapshot().storageAvailable).toBe(false)
    expect(viewModel.getSnapshot().message).toContain('本地存储当前不可用')
  })

  it('reports the same storage-unavailable message on every write path', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    repository.shouldFail = true

    viewModel.updateColor('primary', '#238B73')
    const editingMessage = viewModel.getSnapshot().message

    viewModel.saveVersion()
    const versionMessage = viewModel.getSnapshot().message

    expect(versionMessage).toBe(editingMessage)
    expect(versionMessage).toContain('刷新后会丢失')
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

  it('still exports when storage is unavailable', () => {
    const repository = new MemoryRepository()
    repository.loadUnavailable = true
    const exporter = new MemoryExporter()
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.exportBrandGuidelines()
    expect(exporter.received).toContain('# BrandMirror 品牌规范')
  })

  it('surfaces an export failure with its own fallback message', () => {
    const repository = new MemoryRepository()
    const exporter = new MemoryExporter()
    exporter.shouldFail = true
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.exportBrandGuidelines()
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().message).toBe('导出失败，请稍后重试')
  })
})
