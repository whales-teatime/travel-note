export const planSchema = {
  table: 'plans',
  columns: [
    'id', 'title', 'destination', 'start_date', 'end_date', 'people',
    'stops_json', 'password_hash', 'password_salt', 'edit_password_hash',
    'edit_password_salt', 'edit_policy', 'deleted_at', 'edit_token_hash',
    'created_at', 'updated_at', 'version', 'password_algo', 'edit_password_algo',
  ],
} as const;

export const planSearchSchema = {
  table: 'plan_search',
  columns: ['plan_id', 'title', 'destination'],
} as const;

export const planSearchGramsSchema = {
  table: 'plan_search_grams',
  columns: ['plan_id', 'gram'],
} as const;

export const serviceThrottleSchema = {
  table: 'service_throttle',
  columns: ['id', 'next_allowed_ms'],
} as const;
