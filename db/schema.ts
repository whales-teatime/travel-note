export const planSchema = {
  table: 'plans',
  columns: [
    'id', 'title', 'destination', 'start_date', 'end_date', 'people',
    'stops_json', 'password_hash', 'password_salt', 'edit_password_hash',
    'edit_password_salt', 'edit_policy', 'deleted_at', 'edit_token_hash',
    'created_at', 'updated_at',
  ],
} as const;
