/**
 * index.ts  — PCF entry point
 * EmailEditorControl: StandardControl<IInputs, IOutputs>
 *
 * Lifecycle:
 *   init()        — capture context, build MetadataService, read initial value
 *   updateView()  — return React element tree (virtual control)
 *   getOutputs()  — return current template string to save pipeline
 *   destroy()     — dispose service
 */

import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { EmailEditorComponent } from './src/components/EmailEditorComponent';
import { MetadataService } from './src/services/MetadataService';
import { MetadataCache } from './src/services/MetadataCache';
import { Logger } from './src/services/Logger';

export class EmailEditorControl
  implements ComponentFramework.ReactControl<IInputs, IOutputs> {

  private notifyOutputChanged!: () => void;
  private context!: ComponentFramework.Context<IInputs>;
  private currentValue: string = '';
  private metadataService!: MetadataService;
  private logger!: Logger;

  /** Called once when the control is first attached to the form. */
  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.context = context;
    this.notifyOutputChanged = notifyOutputChanged;
    this.currentValue = context.parameters.templateValue.raw ?? '';

    this.logger = new Logger('EmailEditorControl');

    const clientUrl = this.resolveClientUrl(context);
    const cache = new MetadataCache(window.sessionStorage, clientUrl);

    this.metadataService = new MetadataService({
      webAPI: context.webAPI,
      cache,
      logger: this.logger,
      clientUrl
    });

    this.logger.info('init', {
      rootEntity: context.parameters.rootEntityLogicalName.raw ?? '',
      clientUrl
    });
  }

  /** Called whenever the bound field value or context properties change. */
  public updateView(
    context: ComponentFramework.Context<IInputs>
  ): React.ReactElement {
    this.context = context;

    const incoming = context.parameters.templateValue.raw ?? '';
    if (incoming !== this.currentValue) {
      this.currentValue = incoming;
    }

    return React.createElement(EmailEditorComponent, {
      value: this.currentValue,
      rootEntityLogicalName: context.parameters.rootEntityLogicalName.raw ?? '',
      sampleRecordId: context.parameters.sampleRecordId.raw ?? null,
      maxRelationshipDepth: context.parameters.maxRelationshipDepth.raw ?? 3,
      metadataService: this.metadataService,
      logger: this.logger,
      onChange: (next: string) => {
        if (next === this.currentValue) return;
        this.currentValue = next;
        this.notifyOutputChanged();
      }
    });
  }

  /** Returns the current template value back to the CRM field. */
  public getOutputs(): IOutputs {
    return { templateValue: this.currentValue };
  }

  /** Called when the control is removed from the form. */
  public destroy(): void {
    this.metadataService.dispose();
    this.logger.info('destroy', {});
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Resolves the CRM client URL from the PCF context.
   * Falls through to window.location.origin for test harness / dev mode.
   */
  private resolveClientUrl(context: ComponentFramework.Context<IInputs>): string {
    try {
      // PCF context exposes page.getClientUrl() in UCI
      const page = (context as unknown as { page?: { getClientUrl?: () => string } }).page;
      if (page?.getClientUrl) return page.getClientUrl().replace(/\/$/, '');
    } catch {
      // Expected outside UCI — fall through
    }

    try {
      // Try parent Xrm for legacy web resource embedding
      const xrm = (window.parent as unknown as { Xrm?: { Utility?: { getGlobalContext?: () => { getClientUrl: () => string } } } }).Xrm;
      if (xrm?.Utility?.getGlobalContext) {
        return xrm.Utility.getGlobalContext().getClientUrl().replace(/\/$/, '');
      }
    } catch {
      // Not in CRM context
    }

    return window.location.origin.replace(/\/$/, '');
  }
}
