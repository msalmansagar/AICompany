/**
 * Attribute logical names for qdb_dfe_edit_lock.
 * Do NOT use inline strings — always reference from here.
 */
export const EDIT_LOCK_ATTRS = {
  ID:                   'qdb_dfe_edit_lockid',
  FORM_ID:              'qdb_form_id',
  EDITOR_USER_ID:       'qdb_editor_user_id',
  EDITOR_DISPLAY_NAME:  'qdb_editor_display_name',
  SESSION_ID:           'qdb_session_id',
  LAST_HEARTBEAT:       'qdb_last_heartbeat',
  OPENED_AT:            'qdb_opened_at',
} as const;

/** A lock older than this is considered stale and ignored by the presence banner. */
export const EDIT_LOCK_STALE_THRESHOLD_MS = 90_000; // 90 seconds
/** Interval at which the current editor renews their lock. */
export const HEARTBEAT_INTERVAL_MS = 60_000;        // 60 seconds
/** Interval at which the banner polls for other active locks. */
export const PRESENCE_POLL_INTERVAL_MS = 30_000;    // 30 seconds
