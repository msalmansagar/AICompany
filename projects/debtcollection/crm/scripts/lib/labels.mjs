/**
 * labels.mjs
 * Helpers for building Dataverse LocalizedLabel structures.
 */

const LANG = 1033; // English (US)

/**
 * Builds a Dataverse Label with a single en-US localized entry.
 * @param {string} text
 * @returns {object}
 */
export function label1033(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label: text,
      LanguageCode: LANG,
    }],
    UserLocalizedLabel: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label: text,
      LanguageCode: LANG,
    },
  };
}

/**
 * Builds an empty Dataverse Label (used for Description fields).
 * @returns {object}
 */
export function emptyLabel() {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [],
  };
}

/**
 * Builds a Dataverse OptionMetadata item.
 * @param {number} value
 * @param {string} labelText
 * @returns {object}
 */
export function optionItem(value, labelText) {
  return {
    Value: value,
    Label: label1033(labelText),
    Description: emptyLabel(),
  };
}
