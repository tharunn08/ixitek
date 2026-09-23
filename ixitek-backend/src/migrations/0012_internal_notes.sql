-- 0012 — staff notes on orders are internal (never shown to customers).
ALTER TABLE order_status_history ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 AFTER note;

-- Bank details printed on proforma invoices (entered by IXITEK; never invented).
INSERT IGNORE INTO settings (setting_key, value_json) VALUES ('seller.bank_details', '""');
-- The earlier default instruction referred to bank details that were not yet configured → clear it unless IXITEK edited it.
UPDATE settings SET value_json = '""'
 WHERE setting_key = 'commerce.bank_transfer_instructions'
   AND JSON_UNQUOTE(value_json) = 'Bank details are provided on your proforma invoice. Please quote your order number as the payment reference.';
