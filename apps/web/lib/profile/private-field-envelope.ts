/** שדות רגישים נשלחים ב-HTTPS בלבד — לא עוברים ל-LLM */
export type PrivateFieldTlsPayloadV1 = {
  mode: 'tls-v1';
  value: string;
};

export type PrivateFieldSubmitBody = {
  key: 'full_name' | 'current_weight_kg' | 'goal_weight_kg' | 'wake_up_time' | 'sleep_time';
  envelope: PrivateFieldTlsPayloadV1;
};
