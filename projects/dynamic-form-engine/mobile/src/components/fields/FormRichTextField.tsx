import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import RenderHtml from 'react-native-render-html';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

const EMPTY_HTML = '<p></p>';

const BASE_STYLE = {
  body: {
    color: '#1a1a2e',
    fontSize: 15,
    fontFamily: 'System',
    margin: 0,
    padding: 0,
  },
};

export function FormRichTextField({ field, control }: Props) {
  const { width } = useWindowDimensions();
  const contentWidth = width - 48; // 24px horizontal padding each side

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value }, fieldState: { error } }) => {
        const html = typeof value === 'string' && value.trim() ? value : EMPTY_HTML;
        const isEmpty = html === EMPTY_HTML || html.trim() === '';

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            <View style={[styles.htmlContainer, error && styles.htmlContainerError]}>
              {isEmpty ? (
                <Text style={styles.emptyText}>No content</Text>
              ) : (
                <ScrollView
                  scrollEnabled={false}
                  nestedScrollEnabled
                >
                  <RenderHtml
                    contentWidth={contentWidth}
                    source={{ html }}
                    baseStyle={BASE_STYLE.body}
                    enableExperimentalMarginCollapsing
                  />
                </ScrollView>
              )}
              <View style={styles.readOnlyBadge}>
                <Text style={styles.readOnlyText}>Read only</Text>
              </View>
            </View>

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  htmlContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fafafa',
    minHeight: 80,
    position: 'relative',
  },
  htmlContainerError: {
    borderColor: '#d32f2f',
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    fontStyle: 'italic',
  },
  readOnlyBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  readOnlyText: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },
});
