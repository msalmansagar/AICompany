// Lightweight DynamicIcon for the in-CRM build. The portal version dynamically imports the
// entire @fluentui/react-icons set (~15 MB) to resolve any icon by name; in a single-file web
// resource that would inline the whole set. Here we map a curated set of common icon names to
// tree-shakeable named imports and render nothing for unknown names (icons are decorative).
import type { ComponentType } from 'react';
import {
  PersonRegular, DocumentRegular, MailRegular, CallRegular, CalendarRegular,
  CheckmarkCircleRegular, InfoRegular, WarningRegular, ErrorCircleRegular,
  MoneyRegular, BuildingRegular, HomeRegular, LocationRegular, AttachRegular,
  ImageRegular, FolderRegular, StarRegular, HeartRegular, SettingsRegular,
  EditRegular, DeleteRegular, AddRegular, ArrowDownloadRegular, ShieldRegular,
  ClipboardRegular, type FluentIconsProps,
} from '@fluentui/react-icons';

const ICONS: Record<string, ComponentType<FluentIconsProps>> = {
  PersonRegular, DocumentRegular, MailRegular, CallRegular, CalendarRegular,
  CheckmarkCircleRegular, InfoRegular, WarningRegular, ErrorCircleRegular,
  MoneyRegular, BuildingRegular, HomeRegular, LocationRegular, AttachRegular,
  ImageRegular, FolderRegular, StarRegular, HeartRegular, SettingsRegular,
  EditRegular, DeleteRegular, AddRegular, ArrowDownloadRegular, ShieldRegular,
  ClipboardRegular,
};

interface DynamicIconProps {
  iconName: string;
  size?: number;
}

export function DynamicIcon({ iconName, size = 16 }: DynamicIconProps) {
  const Icon = ICONS[iconName] ?? ICONS[`${iconName}Regular`];
  if (!Icon) return null;
  return <Icon aria-hidden="true" style={{ fontSize: size }} />;
}
