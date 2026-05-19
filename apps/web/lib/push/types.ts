export type WebPushSubscriptionJson = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type WebPushStored = WebPushSubscriptionJson & {
  updated_at: string;
};
