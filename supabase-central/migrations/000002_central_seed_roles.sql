-- Least-privilege staff roles. Seeded in the same txn style; audited by trigger.
insert into central.permissions(id, description, sensitive) values
  ('platform.manage', 'ניהול כל הפלטפורמה', true),
  ('staff.manage', 'ניהול צוות והרשאות', true),
  ('product.read', 'צפייה במוצר', false),
  ('product.manage', 'ניהול מוצר', false),
  ('support.ticket.read', 'קריאת פניות תמיכה', false),
  ('support.ticket.reply', 'מענה לפניות תמיכה', false),
  ('customer.contact.read', 'פרטי קשר מינימליים של לקוח', true),
  ('billing.read', 'צפייה בחיובים', true),
  ('billing.manage', 'ניהול חיובים', true),
  ('audit.read', 'קריאת יומן ביקורת', true);

insert into central.roles(id, label, scope, owner_level, max_duration) values
  ('founder', 'מייסד', 'platform', true, null),
  ('finance', 'כספים', 'platform', false, null),
  ('product_manager', 'מנהל מוצר', 'product', false, null),
  ('support_rep', 'נציג תמיכה', 'product', false, interval '365 days');

insert into central.role_permissions(role_id, permission_id)
select 'founder', id from central.permissions
union all select 'finance', p from unnest(array['billing.read','billing.manage']) p
union all select 'product_manager', p from unnest(array['product.read','product.manage','support.ticket.read','support.ticket.reply','customer.contact.read']) p
union all select 'support_rep', p from unnest(array['support.ticket.read','support.ticket.reply','customer.contact.read']) p;

insert into central.products(id, name, status, product_db_ref) values
  ('nurawell', 'NuraWell', 'active', 'csxsxvzowlswahmfcsjk');
