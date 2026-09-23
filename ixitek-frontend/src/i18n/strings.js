// UI strings for the storefront chrome (header, catalog, cart, checkout).
// Product data (names, specifications) comes from the catalog in English.
// Add a language: add a column here and enable it in Admin → International.
export const STRINGS = {
  en: {
    products: "Products", solutions: "Solutions", services: "Services", resources: "Resources", support: "Support", company: "Company",
    search: "Search part number or keyword", login: "Sign in", account: "Account", cart: "Cart", logout: "Sign out",
    requestQuote: "Request a Quote", addToCart: "Add to Cart", buyNow: "Buy Now", compare: "Compare", wishlist: "Wishlist",
    inStock: "In stock", perUnit: "/ unit", shipTo: "Ship to", language: "Language", currency: "Currency", country: "Country / region",
    save: "Save", detected: "We detected your location as", continue: "Continue", change: "Change", estimate: "Estimate delivered cost",
    subtotal: "Subtotal", freight: "Freight", importCharges: "Estimated import charges", landedCost: "Estimated landed cost", payable: "Payable to IXITEK",
    checkout: "Checkout", quickOrder: "Quick Order", bomUpload: "BOM upload", orders: "Orders", quotes: "Quotes", rfqs: "RFQs", invoices: "Invoices",
  },
  de: {
    products: "Produkte", solutions: "Lösungen", services: "Services", resources: "Ressourcen", support: "Support", company: "Unternehmen",
    search: "Artikelnummer oder Stichwort suchen", login: "Anmelden", account: "Konto", cart: "Warenkorb", logout: "Abmelden",
    requestQuote: "Angebot anfordern", addToCart: "In den Warenkorb", buyNow: "Jetzt kaufen", compare: "Vergleichen", wishlist: "Merkliste",
    inStock: "Auf Lager", perUnit: "/ Stück", shipTo: "Lieferung nach", language: "Sprache", currency: "Währung", country: "Land / Region",
    save: "Speichern", detected: "Ihr Standort wurde erkannt als", continue: "Weiter", change: "Ändern", estimate: "Lieferkosten schätzen",
    subtotal: "Zwischensumme", freight: "Fracht", importCharges: "Geschätzte Einfuhrabgaben", landedCost: "Geschätzte Gesamtkosten", payable: "Zahlbar an IXITEK",
    checkout: "Zur Kasse", quickOrder: "Schnellbestellung", bomUpload: "Stückliste hochladen", orders: "Bestellungen", quotes: "Angebote", rfqs: "Anfragen", invoices: "Rechnungen",
  },
  fr: {
    products: "Produits", solutions: "Solutions", services: "Services", resources: "Ressources", support: "Assistance", company: "Entreprise",
    search: "Rechercher une référence ou un mot-clé", login: "Se connecter", account: "Compte", cart: "Panier", logout: "Se déconnecter",
    requestQuote: "Demander un devis", addToCart: "Ajouter au panier", buyNow: "Acheter", compare: "Comparer", wishlist: "Favoris",
    inStock: "En stock", perUnit: "/ unité", shipTo: "Livrer à", language: "Langue", currency: "Devise", country: "Pays / région",
    save: "Enregistrer", detected: "Votre position détectée :", continue: "Continuer", change: "Modifier", estimate: "Estimer le coût livré",
    subtotal: "Sous-total", freight: "Fret", importCharges: "Frais d'importation estimés", landedCost: "Coût total estimé", payable: "Payable à IXITEK",
    checkout: "Commander", quickOrder: "Commande rapide", bomUpload: "Importer une nomenclature", orders: "Commandes", quotes: "Devis", rfqs: "Demandes", invoices: "Factures",
  },
  es: {
    products: "Productos", solutions: "Soluciones", services: "Servicios", resources: "Recursos", support: "Soporte", company: "Empresa",
    search: "Buscar número de parte o palabra clave", login: "Iniciar sesión", account: "Cuenta", cart: "Carrito", logout: "Cerrar sesión",
    requestQuote: "Solicitar cotización", addToCart: "Añadir al carrito", buyNow: "Comprar ahora", compare: "Comparar", wishlist: "Favoritos",
    inStock: "En stock", perUnit: "/ unidad", shipTo: "Enviar a", language: "Idioma", currency: "Moneda", country: "País / región",
    save: "Guardar", detected: "Detectamos su ubicación como", continue: "Continuar", change: "Cambiar", estimate: "Estimar costo entregado",
    subtotal: "Subtotal", freight: "Flete", importCharges: "Cargos de importación estimados", landedCost: "Costo total estimado", payable: "A pagar a IXITEK",
    checkout: "Pagar", quickOrder: "Pedido rápido", bomUpload: "Cargar lista de materiales", orders: "Pedidos", quotes: "Cotizaciones", rfqs: "Solicitudes", invoices: "Facturas",
  },
  ja: {
    products: "製品", solutions: "ソリューション", services: "サービス", resources: "リソース", support: "サポート", company: "会社情報",
    search: "型番またはキーワードで検索", login: "ログイン", account: "アカウント", cart: "カート", logout: "ログアウト",
    requestQuote: "見積もりを依頼", addToCart: "カートに追加", buyNow: "今すぐ購入", compare: "比較", wishlist: "お気に入り",
    inStock: "在庫あり", perUnit: "/ 個", shipTo: "配送先", language: "言語", currency: "通貨", country: "国 / 地域",
    save: "保存", detected: "検出された地域:", continue: "続ける", change: "変更", estimate: "配送費用を見積もる",
    subtotal: "小計", freight: "運賃", importCharges: "推定輸入諸費用", landedCost: "推定総費用", payable: "IXITEKへのお支払い",
    checkout: "購入手続き", quickOrder: "クイック注文", bomUpload: "BOMアップロード", orders: "注文", quotes: "見積", rfqs: "見積依頼", invoices: "請求書",
  },
};

export function translate(lang, key) {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}
