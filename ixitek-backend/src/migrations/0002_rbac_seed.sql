-- 0002_rbac_seed.sql — built-in roles and granular permissions.
INSERT INTO roles (code, name, description, is_staff, sort_order) VALUES
 ('owner','Owner','Full access, including sensitive financial settings',1,1),
 ('super_admin','Super Admin','Full operational access',1,2),
 ('catalog_manager','Catalog Manager','Products, categories, imports, media',1,3),
 ('pricing_manager','Pricing Manager','Costs, margins, price lists, currency',1,4),
 ('order_manager','Order Manager','Orders, shipments',1,5),
 ('inventory_manager','Inventory Manager','Warehouses and stock',1,6),
 ('sales_manager','Sales Manager','CRM, RFQs, quotes',1,7),
 ('finance_manager','Finance Manager','Invoices, payments, reconciliation',1,8),
 ('support_manager','Support Manager','Tickets, returns, warranty',1,9),
 ('content_manager','Content Manager','Site content and SEO',1,10),
 ('staff','Staff','Enquiries and registered users (legacy staff role)',1,11),
 ('customer','Customer','Website customer',0,99);

INSERT INTO permissions (code, module, description, is_sensitive) VALUES
 ('admin.access','admin','Open the admin panel',0),
 ('users.read','users','View registered customers',0),
 ('users.manage','users','Edit customers',0),
 ('staff.manage','users','Add/remove team members and roles',1),
 ('enquiries.read','enquiries','View enquiries and applications',0),
 ('enquiries.manage','enquiries','Change enquiry status',0),
 ('enquiries.delete','enquiries','Archive (soft-delete) enquiries',0),
 ('catalog.read','catalog','View catalog in admin',0),
 ('catalog.write','catalog','Create/edit products, categories, media',0),
 ('catalog.import','catalog','Run catalog imports',0),
 ('catalog.delete','catalog','Archive products and categories',1),
 ('pricing.read_cost','pricing','See cost / FOB / EXW prices',1),
 ('pricing.write','pricing','Change prices, margins and price rules',1),
 ('inventory.read','inventory','View stock levels and movements',0),
 ('inventory.adjust','inventory','Increase/decrease stock',0),
 ('inventory.warehouses','inventory','Create and edit warehouses',0),
 ('audit.read','admin','View the audit log',0),
 ('backups.manage','admin','Create and list backups',1),
 ('settings.manage','admin','Change system settings and feature flags',1),
 ('orders.read','orders','View orders',0),
 ('orders.manage','orders','Update orders',0),
 ('rfq.manage','sales','Handle RFQs',0),
 ('quotes.manage','sales','Create and send quotes',0),
 ('crm.manage','sales','Manage leads and customers',0),
 ('finance.read','finance','View invoices and payments',0),
 ('finance.manage','finance','Record payments, refunds, credit',1),
 ('content.manage','content','Edit site content and SEO',0),
 ('support.manage','support','Tickets, returns, warranty',0),
 ('reports.read','reports','View reports and dashboards',0);

-- Owner is granted everything in code; still materialise it for visibility.
INSERT INTO role_permissions (role_code, permission_code) SELECT 'owner', code FROM permissions;
INSERT INTO role_permissions (role_code, permission_code) SELECT 'super_admin', code FROM permissions WHERE code NOT IN ('backups.manage','settings.manage');

INSERT INTO role_permissions (role_code, permission_code) VALUES
 ('staff','admin.access'),('staff','users.read'),('staff','enquiries.read'),('staff','enquiries.manage'),('staff','enquiries.delete'),('staff','catalog.read'),('staff','inventory.read'),
 ('catalog_manager','admin.access'),('catalog_manager','catalog.read'),('catalog_manager','catalog.write'),('catalog_manager','catalog.import'),('catalog_manager','inventory.read'),('catalog_manager','enquiries.read'),
 ('pricing_manager','admin.access'),('pricing_manager','catalog.read'),('pricing_manager','pricing.read_cost'),('pricing_manager','pricing.write'),('pricing_manager','reports.read'),
 ('order_manager','admin.access'),('order_manager','orders.read'),('order_manager','orders.manage'),('order_manager','catalog.read'),('order_manager','inventory.read'),
 ('inventory_manager','admin.access'),('inventory_manager','catalog.read'),('inventory_manager','inventory.read'),('inventory_manager','inventory.adjust'),('inventory_manager','inventory.warehouses'),
 ('sales_manager','admin.access'),('sales_manager','catalog.read'),('sales_manager','crm.manage'),('sales_manager','rfq.manage'),('sales_manager','quotes.manage'),('sales_manager','enquiries.read'),('sales_manager','enquiries.manage'),('sales_manager','users.read'),('sales_manager','inventory.read'),
 ('finance_manager','admin.access'),('finance_manager','finance.read'),('finance_manager','finance.manage'),('finance_manager','orders.read'),('finance_manager','reports.read'),('finance_manager','pricing.read_cost'),
 ('support_manager','admin.access'),('support_manager','support.manage'),('support_manager','orders.read'),('support_manager','enquiries.read'),('support_manager','enquiries.manage'),
 ('content_manager','admin.access'),('content_manager','content.manage'),('content_manager','catalog.read');

INSERT INTO feature_flags (flag_key, enabled, description) VALUES
 ('storefront_catalog', 1, 'Database-driven product catalog pages'),
 ('pricing_engine', 0, 'Show computed selling prices on the storefront'),
 ('checkout', 0, 'Online checkout'),
 ('rfq', 0, 'Request for quote flow');
