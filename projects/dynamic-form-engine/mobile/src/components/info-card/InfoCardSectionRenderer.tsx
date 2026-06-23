import React from 'react';
import { Text } from 'react-native';
import type { InfoCardSection } from '@qdb/shared';
import { NumberedStepsSection } from './sections/NumberedStepsSection';
import { IconListSection } from './sections/IconListSection';
import { DownloadListSection } from './sections/DownloadListSection';

interface Props {
  section: InfoCardSection;
}

export function InfoCardSectionRenderer({ section }: Props) {
  switch (section.sectionType) {
    case 'numbered-steps':
      return (
        <NumberedStepsSection
          sectionTitle={section.sectionTitle}
          items={section.items}
        />
      );
    case 'icon-list':
      return (
        <IconListSection
          sectionTitle={section.sectionTitle}
          items={section.items}
        />
      );
    case 'download-list':
      return (
        <DownloadListSection
          sectionTitle={section.sectionTitle}
          items={section.items}
          noteText={section.noteText}
        />
      );
    default: {
      const exhaustive: never = section.sectionType;
      return (
        <Text style={{ color: '#999', fontSize: 13 }}>
          Unknown section type: {String(exhaustive)}
        </Text>
      );
    }
  }
}
