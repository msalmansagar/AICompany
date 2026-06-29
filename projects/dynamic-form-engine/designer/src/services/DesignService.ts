// Orchestrator — delegates to domain repositories.
// All actual reads/writes are in the *Repository classes.
// This file is the single public surface callers use.
import type { IWebApiAdapter } from './IWebApiAdapter';
import { ThemeDesignRepository, type UpsertThemeDto, type ThemeSummary } from './ThemeDesignRepository';
import { FormDesignRepository, type UpsertFormDesignDto } from './FormDesignRepository';
import { SectionDesignRepository, type UpsertSectionDesignDto } from './SectionDesignRepository';
import { FieldDesignRepository, type UpsertFieldDesignDto } from './FieldDesignRepository';
import { ButtonDesignRepository, type UpsertButtonDesignDto } from './ButtonDesignRepository';
import { LayoutGridRepository, type UpsertLayoutGridDto } from './LayoutGridRepository';
import type {
  ThemeDefinition, FormDesign, SectionDesign, FieldDesign,
  ButtonDesign, LayoutGrid,
} from '@qdb/shared';

// Re-export DTOs so callers have a single import point.
export type {
  UpsertThemeDto, ThemeSummary, UpsertFormDesignDto, UpsertSectionDesignDto,
  UpsertFieldDesignDto, UpsertButtonDesignDto, UpsertLayoutGridDto,
};

export class DesignService {
  private readonly theme: ThemeDesignRepository;
  private readonly formDesign: FormDesignRepository;
  private readonly sectionDesign: SectionDesignRepository;
  private readonly fieldDesign: FieldDesignRepository;
  private readonly buttonDesign: ButtonDesignRepository;
  private readonly layoutGrid: LayoutGridRepository;

  constructor(webApi: IWebApiAdapter) {
    this.theme = new ThemeDesignRepository(webApi);
    this.formDesign = new FormDesignRepository(webApi);
    this.sectionDesign = new SectionDesignRepository(webApi);
    this.fieldDesign = new FieldDesignRepository(webApi);
    this.buttonDesign = new ButtonDesignRepository(webApi);
    this.layoutGrid = new LayoutGridRepository(webApi);
  }

  // ─── Theme ────────────────────────────────────────────────────────────────

  upsertTheme(dto: UpsertThemeDto, existingThemeId?: string | null): Promise<string> {
    return this.theme.upsertTheme(dto, existingThemeId);
  }

  getTheme(id: string): Promise<ThemeDefinition> {
    return this.theme.getTheme(id);
  }

  listThemes(): Promise<ThemeSummary[]> {
    return this.theme.listThemes();
  }

  // ─── Form design ──────────────────────────────────────────────────────────

  upsertFormDesign(dto: UpsertFormDesignDto): Promise<string> {
    return this.formDesign.upsertFormDesign(dto);
  }

  getFormDesign(formId: string): Promise<FormDesign | null> {
    return this.formDesign.getFormDesign(formId);
  }

  // ─── Section design ───────────────────────────────────────────────────────

  upsertSectionDesign(dto: UpsertSectionDesignDto): Promise<string> {
    return this.sectionDesign.upsertSectionDesign(dto);
  }

  getSectionDesigns(formDesignId: string): Promise<SectionDesign[]> {
    return this.sectionDesign.getSectionDesigns(formDesignId);
  }

  // ─── Field design ─────────────────────────────────────────────────────────

  upsertFieldDesign(dto: UpsertFieldDesignDto): Promise<string> {
    return this.fieldDesign.upsertFieldDesign(dto);
  }

  getFieldDesigns(formDesignId: string): Promise<FieldDesign[]> {
    return this.fieldDesign.getFieldDesigns(formDesignId);
  }

  // ─── Button design ────────────────────────────────────────────────────────

  upsertButtonDesign(dto: UpsertButtonDesignDto): Promise<string> {
    return this.buttonDesign.upsertButtonDesign(dto);
  }

  getButtonDesigns(formId: string): Promise<ButtonDesign[]> {
    return this.buttonDesign.getButtonDesigns(formId);
  }

  // ─── Layout grid ──────────────────────────────────────────────────────────

  upsertLayoutGrid(dto: UpsertLayoutGridDto): Promise<string> {
    return this.layoutGrid.upsertLayoutGrid(dto);
  }

  getLayoutGrids(formDesignId: string): Promise<LayoutGrid[]> {
    return this.layoutGrid.getLayoutGrids(formDesignId);
  }

  // ─── Legacy compatibility ─────────────────────────────────────────────────
  // TODO(DFE-STYLE-001): Remove once ThemeEditorScreen migration is complete.

  listThemeSummaries(): Promise<ThemeSummary[]> {
    return this.theme.listThemes();
  }
}
