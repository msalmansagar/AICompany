import type { FormDefinition, DesignPayload } from '@qdb/shared';
import type { DesignAssembler } from './DesignAssembler.js';
import { DEFAULT_DESIGN_PAYLOAD } from './DesignAssembler.js';
import type { sanitiseCustomCss as SanitiseFn } from '../sanitizer/CssSanitiser.js';
import { logger } from '../utils/logger.js';

export class CacheAssemblyService {
  constructor(
    private readonly designAssembler: DesignAssembler,
    private readonly sanitiseCss: typeof SanitiseFn,
  ) {}

  async injectDesign(formDefinition: FormDefinition, formDefinitionId: string): Promise<FormDefinition> {
    const designPayload = await this.fetchDesignPayloadSafely(formDefinitionId);
    const sanitisedPayload = sanitiseCssInPayload(designPayload, this.sanitiseCss, formDefinitionId);
    return { ...formDefinition, design: sanitisedPayload };
  }

  private async fetchDesignPayloadSafely(formDefinitionId: string): Promise<DesignPayload> {
    try {
      return await this.designAssembler.assembleDesignPayload(formDefinitionId);
    } catch (error) {
      logger.error(
        { formDefinitionId, error },
        'DesignAssembler failed — embedding DEFAULT_DESIGN_PAYLOAD in cache',
      );
      return DEFAULT_DESIGN_PAYLOAD as DesignPayload;
    }
  }
}

function sanitiseCssInPayload(
  payload: DesignPayload,
  sanitiseCss: typeof SanitiseFn,
  formDefinitionId: string,
): DesignPayload {
  const rawCss = payload.formDesign.customCss;
  if (!rawCss) return payload;
  try {
    const sanitised = sanitiseCss(rawCss);
    return { ...payload, formDesign: { ...payload.formDesign, customCss: sanitised } };
  } catch (error) {
    logger.error({ formDefinitionId, error }, 'CSS sanitisation failed — omitting customCss from cache');
    return { ...payload, formDesign: { ...payload.formDesign, customCss: undefined } };
  }
}
