import { MESSAGE_TABLE_RESTRICTION, type MessageTable } from '@dcp/domain';
import type { CustomerProfile } from '../../data/caseQueries.js';

/**
 * The CRM's own communication settings for the customer, shown as CRM holds them. Secondary weight,
 * and explicitly not a Collection Contact Hold — that decision is separate and not sourced here (KI-79).
 *
 * SMS / WhatsApp shows the preference that governs them in this organisation: the "do not" flag of
 * the table they travel in — postal mail on Housing Loan (Letter), fax on BFD (Fax).
 */
export function ContactPreferences({ profile, messageTable }: { profile: CustomerProfile | undefined; messageTable: MessageTable | undefined }) {
  const value = (restricted: boolean | undefined, word: string) => (restricted === undefined ? 'Not available' : restricted ? `Do not ${word}` : 'Allowed');
  const governing = messageTable ? MESSAGE_TABLE_RESTRICTION[messageTable] : undefined;
  return (
    <section className="section-card c360-prefs" aria-labelledby="c360-prefs-title" data-testid="c360-prefs-card">
      <h3 id="c360-prefs-title">Contact preferences</h3>
      <p className="c360-hint">CRM communication preferences and restrictions. Not a Collection Contact Hold decision.</p>
      <dl className="c360-facts" data-testid="c360-prefs">
        <div className="c360-fact"><dt>Phone</dt><dd>{value(profile?.restrictions.doNotPhone, 'phone')}</dd></div>
        <div className="c360-fact"><dt>Email</dt><dd>{value(profile?.restrictions.doNotEmail, 'email')}</dd></div>
        <div className="c360-fact">
          <dt>SMS / WhatsApp</dt>
          <dd>{governing ? value(profile?.restrictions[governing.flag], 'use') : 'Not configured for this organisation'}</dd>
        </div>
      </dl>
    </section>
  );
}
