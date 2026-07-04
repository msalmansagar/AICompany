import React, { useCallback } from 'react';
import {
  Field,
  Input,
  Select,
  Text,
  makeStyles,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { ButtonDesign, ButtonType } from '@qdb/shared';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px' },
});

const BUTTON_TYPES: ButtonType[] = ['Submit', 'SaveDraft', 'Cancel'];

interface ButtonRowProps {
  buttonType: ButtonType;
  design: Partial<ButtonDesign>;
  onPatch: (update: Partial<ButtonDesign>) => void;
}

function ButtonRow({ buttonType, design, onPatch }: ButtonRowProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--colorNeutralStroke2)', borderRadius: '4px' }}>
      <Text weight="semibold" size={200} block>{buttonType}</Text>

      <Field label="Size">
        <Select value={design.size ?? 'Medium'} onChange={(_, d) => onPatch({ size: d.value as ButtonDesign['size'] })}>
          <option value="Small">Small</option>
          <option value="Medium">Medium</option>
          <option value="Large">Large</option>
        </Select>
      </Field>

      <Field label="Alignment">
        <Select value={design.alignment ?? 'Left'} onChange={(_, d) => onPatch({ alignment: d.value as ButtonDesign['alignment'] })}>
          <option value="Left">Left</option>
          <option value="Center">Center</option>
          <option value="Right">Right</option>
        </Select>
      </Field>

      <Field label="Hover Effect">
        <Select value={design.hoverEffect ?? 'None'} onChange={(_, d) => onPatch({ hoverEffect: d.value as ButtonDesign['hoverEffect'] })}>
          <option value="None">None</option>
          <option value="Elevate">Elevate</option>
          <option value="ColorShift">Color Shift</option>
        </Select>
      </Field>

      <Field label="Loading Style">
        <Select value={design.loadingStyle ?? 'Spinner'} onChange={(_, d) => onPatch({ loadingStyle: d.value as ButtonDesign['loadingStyle'] })}>
          <option value="Spinner">Spinner</option>
          <option value="Dots">Dots</option>
          <option value="Pulse">Pulse</option>
        </Select>
      </Field>

      <Field label="Color Override">
        <Input value={design.color ?? ''} onChange={(_, d) => onPatch({ color: d.value || undefined })} placeholder="#0078d4" style={{ fontFamily: 'monospace' }} />
      </Field>

      <Field label="Border Radius">
        <Input value={design.borderRadius ?? ''} onChange={(_, d) => onPatch({ borderRadius: d.value || undefined })} placeholder="4px" />
      </Field>

      <Field label="Icon">
        <Input value={design.icon ?? ''} onChange={(_, d) => onPatch({ icon: d.value || undefined })} placeholder="icon name or SVG" />
      </Field>
    </div>
  );
}

/** ButtonStylePanel — individual style controls for Submit, SaveDraft, and Cancel buttons. */
export function ButtonStylePanel(): React.ReactElement {
  const classes = useStyles();
  const buttonDesigns = useDesignerStore(s => s.designPayload.buttonDesigns);
  const updateButtonDesign = useDesignerStore(s => s.updateButtonDesign);

  const makePatcher = useCallback(
    (buttonType: ButtonType) => (update: Partial<ButtonDesign>) => updateButtonDesign(buttonType, update),
    [updateButtonDesign]
  );

  return (
    <div className={classes.root}>
      <Text weight="semibold" size={300} block>Button Styles</Text>
      {BUTTON_TYPES.map(buttonType => (
        <ButtonRow
          key={buttonType}
          buttonType={buttonType}
          design={buttonDesigns[buttonType] ?? {}}
          onPatch={makePatcher(buttonType)}
        />
      ))}
    </div>
  );
}
