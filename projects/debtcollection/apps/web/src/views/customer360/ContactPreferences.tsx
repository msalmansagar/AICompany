import type { CustomerProfile } from '../../data/caseQueries.js';

/**
 * The CRM's own communication settings for the customer, shown as CRM holds them. Secondary weight,
 * and explicitly not a Collection Contact Hold — that decision is separate and not sourced here (KI-79).
 */
export function ContactPreferences({ profile }: { profile: CustomerProfile | undefined }) {
  const value = (restricted: boolean | undefined, word: string) => (restricted === undefined ? 'Not available' : restricted ? `Do not ${word}` : 'Allowed');
  return (
    <section className="section-card c360-prefs" aria-labelledby="c360-prefs-title" data-testid="c360-prefs-card">
      <h3 id="c360-prefs-title">Contact preferences</h3>
      <p className="c360-hint">CRM communication preferences and restrictions. Not a Collection Contact Hold decision.</p>
      <dl className="c360-facts" data-testid="c360-prefs">
        <div className="c360-fact"><dt>Phone</dt><dd>{value(profile?.restrictions.doNotPhone, 'phone')}</dd></div>
        <div className="c360-fact"><dt>Email</dt><dd>{value(profile?.restrictions.doNotEmail, 'email')}</dd></div>
        <div className="c360-fact"><dt>SMS / WhatsApp</dt><dd>{value(profile?.restrictions.doNotFax, 'use')}</dd></div>
      </dl>
    </section>
  );
}
