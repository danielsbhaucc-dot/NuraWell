export type DemoAccessLinkRow = {
  id: string;
  token_hash: string;
  target_user_id: string;
  guest_name: string | null;
  reason: string;
  password_hash: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  first_claimed_at: string | null;
  last_claimed_at: string | null;
  claim_count: number;
  max_claims: number | null;
  session_epoch: number;
  welcome_image_key: string | null;
};

export type DemoAccessPublicPreview = {
  guest_name: string | null;
  reason: string;
  expires_at: string;
  requires_password: boolean;
  welcome_image_url: string | null;
  target_display_name: string | null;
};
