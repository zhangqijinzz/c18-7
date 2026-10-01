import { clampTokenValues, cloneTokens, contrastRatio, normalizeColor, themeTokens, validateTokens } from '../domain/brandRules'
import type { BrandRepository } from '../repositories/brandRepository'
import type { BrandGuidelinesExporter } from '../services/exportService'
import { INITIAL_TOKENS, type BrandDocument, type BrandMirrorSnapshot, type BrandTheme, type SavedVersion } from '../models/brandMirrorModels'

type Listener = () => void

const STORAGE_UNAVAILABLE_MESSAGE = '本地存储当前不可用（已被浏览器禁用或空间已满），更改仅保留在本页面，刷新后会丢失'

export class BrandMirrorViewModel {
  private snapshot: BrandMirrorSnapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] })
  private readonly listeners = new Set<Listener>()
  private readonly repository: BrandRepository
  private readonly exporter?: BrandGuidelinesExporter
  private storageAvailable = true

  constructor(repository: BrandRepository, exporter?: BrandGuidelinesExporter) {
    this.repository = repository
    this.exporter = exporter
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): BrandMirrorSnapshot {
    return this.snapshot
  }

  initialize(): void {
    const loaded = this.repository.load()
    if (loaded.status === 'unavailable') {
      // 读取失败（浏览器禁用存储/配额已满）：用默认令牌打开页面，且绝不回写，避免覆盖用户已有数据
      this.storageAvailable = false
      this.snapshot = this.makeSnapshot(
        { tokens: INITIAL_TOKENS, theme: 'studio', versions: [] },
        `无法读取本地数据，已使用默认令牌打开。${STORAGE_UNAVAILABLE_MESSAGE}`,
        'error',
      )
    } else if (loaded.status === 'ready') {
      this.snapshot = this.makeSnapshot(loaded.document, '已恢复最近一次工作状态')
    } else {
      this.snapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] }, '从 Studio warm 开始探索')
    }
    this.emit()
  }

  selectTheme(theme: BrandTheme): void {
    this.update({ tokens: themeTokens(theme), theme }, '已切换基础主题')
  }

  updateColor(field: 'primary' | 'secondary', value: string): void {
    const color = normalizeColor(value)
    this.update({ tokens: { ...this.snapshot.tokens, [field]: color } }, '令牌已更新')
  }

  updateScale(field: 'radiusScale' | 'spacingScale' | 'typeScale', index: number, value: number): void {
    const values = [...this.snapshot.tokens[field]]
    values[index] = Number.isFinite(value) ? value : values[index]
    this.update({ tokens: clampTokenValues({ ...this.snapshot.tokens, [field]: values }) }, '令牌已更新')
  }

  reset(): void {
    this.update({ tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio' }, '已恢复默认令牌')
  }

  saveVersion(): void {
    const validationError = validateTokens(this.snapshot.tokens)
    if (validationError) {
      this.snapshot = { ...this.snapshot, status: 'error', message: validationError }
      this.emit()
      return
    }
    const nextVersion: SavedVersion = {
      id: `version-${Date.now()}`,
      label: this.snapshot.versions.length === 0 ? 'Version A' : `Version ${String.fromCharCode(65 + this.snapshot.versions.length)}`,
      tokens: cloneTokens(this.snapshot.tokens),
      createdAt: new Date().toISOString(),
    }
    const versions = [...this.snapshot.versions, nextVersion]
    this.persist({ tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions }, '版本已保存')
  }

  toggleCompare(): void {
    this.snapshot = { ...this.snapshot, compareMode: !this.snapshot.compareMode, message: this.snapshot.compareMode ? '已退出对比模式' : '正在对比最近两个版本' }
    this.emit()
  }

  exportBrandGuidelines(): void {
    if (!this.exporter) return
    try {
      this.exporter.export(this.snapshot)
      this.snapshot = { ...this.snapshot, message: '品牌规范已导出' }
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', message: '导出失败，请稍后重试' }
    }
    this.emit()
  }

  private update(partial: Partial<Pick<BrandDocument, 'tokens' | 'theme'>>, message: string): void {
    const tokens = partial.tokens ?? this.snapshot.tokens
    this.snapshot = this.makeSnapshot({ tokens, theme: partial.theme ?? this.snapshot.theme, versions: this.snapshot.versions }, message, 'editing')
    this.persistCurrent()
  }

  private persistCurrent(): void {
    if (!this.storageAvailable) {
      this.snapshot = { ...this.snapshot, status: 'error', message: STORAGE_UNAVAILABLE_MESSAGE }
      this.emit()
      return
    }
    try {
      this.repository.save({ version: 1, tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions: this.snapshot.versions })
    } catch {
      this.markStorageUnavailable()
    }
    this.emit()
  }

  private persist(document: Omit<BrandDocument, 'version'>, message: string): void {
    if (!this.storageAvailable) {
      // 存储不可用时不写入，但版本仍保留在当前页面会话中
      this.snapshot = this.makeSnapshot(document, STORAGE_UNAVAILABLE_MESSAGE, 'error')
      this.emit()
      return
    }
    try {
      this.repository.save({ version: 1, ...document })
      this.snapshot = this.makeSnapshot(document, message, 'ready')
    } catch {
      this.markStorageUnavailable()
    }
    this.emit()
  }

  private markStorageUnavailable(): void {
    // 一旦确认无法写入（配额已满等），本次会话内不再尝试写入，避免用默认值覆盖存储中可能已有的数据
    this.storageAvailable = false
    this.snapshot = { ...this.snapshot, status: 'error', storageAvailable: false, message: STORAGE_UNAVAILABLE_MESSAGE }
  }

  private makeSnapshot(document: Omit<BrandDocument, 'version'>, message = '', status: BrandMirrorSnapshot['status'] = 'ready'): BrandMirrorSnapshot {
    const ratio = contrastRatio(document.tokens.primary, document.tokens.secondary)
    const latestVersion = document.versions[document.versions.length - 1]
    return { status, storageAvailable: this.storageAvailable, tokens: cloneTokens(document.tokens), theme: document.theme, versions: document.versions, compareMode: false, activeVersionId: latestVersion?.id ?? null, contrastRatio: ratio, contrastWarning: ratio < 3, message }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
