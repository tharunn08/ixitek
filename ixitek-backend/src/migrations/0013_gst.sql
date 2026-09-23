-- 0013 — Indian GST split (CGST + SGST/UTGST intra-state, IGST inter-state).
-- All columns are NULL for orders/invoices without Indian GST, and for every
-- order placed before this migration (historical documents are not altered).
ALTER TABLE orders
  ADD COLUMN place_of_supply  CHAR(2) NULL AFTER tax,
  ADD COLUMN gst_supply_type  ENUM('intra_state','inter_state') NULL AFTER place_of_supply,
  ADD COLUMN state_tax_label  VARCHAR(5) NULL AFTER gst_supply_type,
  ADD COLUMN gst_taxable_value DECIMAL(16,2) NULL AFTER state_tax_label,
  ADD COLUMN cgst             DECIMAL(16,2) NULL AFTER gst_taxable_value,
  ADD COLUMN sgst             DECIMAL(16,2) NULL AFTER cgst,
  ADD COLUMN igst             DECIMAL(16,2) NULL AFTER sgst,
  ADD COLUMN gst_rate_basis   ENUM('rule','effective') NULL AFTER igst;

ALTER TABLE order_items
  ADD COLUMN gst_taxable_value DECIMAL(16,2) NULL,
  ADD COLUMN gst_rate          DECIMAL(7,3) NULL,
  ADD COLUMN cgst              DECIMAL(16,2) NULL,
  ADD COLUMN sgst              DECIMAL(16,2) NULL,
  ADD COLUMN igst              DECIMAL(16,2) NULL;

ALTER TABLE order_addresses ADD COLUMN state_code CHAR(2) NULL AFTER state;

ALTER TABLE invoices
  ADD COLUMN buyer_tax_id      VARCHAR(60) NULL AFTER currency,
  ADD COLUMN place_of_supply   CHAR(2) NULL AFTER buyer_tax_id,
  ADD COLUMN gst_supply_type   ENUM('intra_state','inter_state') NULL AFTER place_of_supply,
  ADD COLUMN gst_taxable_value DECIMAL(16,2) NULL AFTER gst_supply_type,
  ADD COLUMN cgst              DECIMAL(16,2) NULL AFTER gst_taxable_value,
  ADD COLUMN sgst              DECIMAL(16,2) NULL AFTER cgst,
  ADD COLUMN igst              DECIMAL(16,2) NULL AFTER sgst,
  ADD KEY idx_inv_issued (issued_at, invoice_type);

-- Tax that IXITEK itself invoices on a quotation (excludes import duty/tax it pays under DDP).
ALTER TABLE quote_versions ADD COLUMN invoice_tax DECIMAL(16,2) NULL AFTER tax;

ALTER TABLE addresses ADD COLUMN state_code CHAR(2) NULL AFTER state;
