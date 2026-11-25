const keys = [
  'styleLayout', 'styleLayoutstacked', 'styleLayouthorizontal', 'styleLayoutgrid', 'styleLayoutlist',
  'styleCards', 'styleCardRadius', 'styleCardSpacing', 'styleColors', 'styleColorGeneral', 'styleColorOffer', 'styleColorBadge',
  'styleColorcard', 'styleColorselected', 'styleColorborder', 'styleColorsectionTitle', 'styleColortitle', 'styleColorsubtitle',
  'styleColorprice', 'styleColorcomparePrice', 'styleColorbadgeBackground', 'styleColorbadgeText', 'styleHexError',
  'styleTypography', 'styleBodySize', 'styleTypesectionTitle', 'styleTypetitle', 'styleTypesubtitle', 'styleTypeprice', 'styleTypebadge',
  'styleSize', 'styleWeight', 'styleVariants', 'styleAllowMixed', 'styleShowSelectors', 'styleShowPrices',
  'styleVariantDisplay', 'styleDropdown', 'styleImages', 'styleText', 'styleSwatches', 'styleDefaultSelection',
  'styleFirstAvailable', 'styleNoPreselection', 'styleImageSize', 'styleImageRadius', 'styleShowColorValue',
  'productScope', 'settings', 'style', 'allProducts', 'specificProducts', 'productCollections', 'campaignName',
  'startsAt', 'endsAt', 'otherProductDiscounts', 'neverCombine', 'orderDiscounts', 'shippingDiscounts',
  'offerBar', 'quantity', 'tierLabel', 'tierSubtitle', 'discountType', 'originalPrice', 'percentageOff',
  'amountOff', 'fixedPrice', 'discountValue', 'amountOffEach', 'fixedPriceEach', 'badgeText', 'defaultSelected',
  'addTier', 'livePreview', 'productPageOffer', 'updatesAsEdit', 'ruleSummary',
] as const;
type BaseMessageKey = typeof keys[number];

const values = {
  en: [
    'Layout','Stacked','Horizontal','Grid','List','Cards','Card radius','Card spacing','Colors','General','Offer text','Badge',
    'Card background','Selected background','Card border','Section title','Tier title','Subtitle','Price','Original price','Badge background','Badge text','Enter a 6-digit HEX color.',
    'Typography','Body size','Section title','Tier title','Subtitle','Price','Badge','Size','Weight','Variants','Allow mixed variants','Show variant selectors','Show original and discounted price',
    'Variant display','Dropdown','Original variant images','Text values','Color swatches','Default selection','First available','No preselection','Image size','Image radius','Show color value below image',
    'Product scope','Settings','Style','All products','Specific products','Product collections','Campaign name','Starts at','Ends at (optional)','Other product discounts','Never combine','Order discounts','Shipping discounts',
    'Tier','Qty','Label','Subtitle','Discount type','Original price','Percentage off','Amount off per item','Fixed price per item','Discount value','Amount off per item','Fixed price per item','Badge text','Default selected',
    'Add tier','Live storefront preview','Product page offer','Updates as you edit','Rule summary',
  ],
  fr: [
    'Disposition','Empilé','Horizontal','Grille','Liste','Cartes','Arrondi des cartes','Espacement des cartes','Couleurs','Général','Texte de l’offre','Badge',
    'Fond de la carte','Fond sélectionné','Bordure de la carte','Titre de section','Titre du palier','Sous-titre','Prix','Prix initial','Fond du badge','Texte du badge','Saisissez une couleur HEX à 6 chiffres.',
    'Typographie','Taille du texte','Titre de section','Titre du palier','Sous-titre','Prix','Badge','Taille','Graisse','Variantes','Autoriser plusieurs variantes','Afficher les sélecteurs','Afficher les prix initial et réduit',
    'Affichage des variantes','Liste déroulante','Images des variantes','Valeurs texte','Nuanciers','Sélection par défaut','Première disponible','Aucune présélection','Taille de l’image','Arrondi de l’image','Afficher la couleur sous l’image',
    'Produits concernés','Paramètres','Style','Tous les produits','Produits spécifiques','Collections','Nom de la campagne','Début','Fin (facultatif)','Autres remises produit','Jamais cumuler','Remises commande','Remises livraison',
    'Palier','Qté','Libellé','Sous-titre','Type de remise','Prix initial','Pourcentage','Déduction par article','Prix fixe par article','Valeur de remise','Déduction par article','Prix fixe par article','Texte du badge','Recommandé',
    'Ajouter un palier','Aperçu boutique','Offre sur la page produit','Actualisé en direct','Résumé de la règle',
  ],
  de: [
    'Layout','Gestapelt','Horizontal','Raster','Liste','Karten','Kartenradius','Kartenabstand','Farben','Allgemein','Angebotstext','Badge',
    'Kartenhintergrund','Ausgewählter Hintergrund','Kartenrand','Abschnittstitel','Staffeltitel','Untertitel','Preis','Originalpreis','Badge-Hintergrund','Badge-Text','HEX-Farbe mit 6 Stellen eingeben.',
    'Typografie','Textgröße','Abschnittstitel','Staffeltitel','Untertitel','Preis','Badge','Größe','Schriftstärke','Varianten','Gemischte Varianten erlauben','Variantenauswahl anzeigen','Original- und Rabattpreis anzeigen',
    'Variantenanzeige','Dropdown','Variantenbilder','Textwerte','Farbfelder','Standardauswahl','Erste verfügbare','Keine Vorauswahl','Bildgröße','Bildradius','Farbwert unter Bild anzeigen',
    'Produktauswahl','Einstellungen','Stil','Alle Produkte','Bestimmte Produkte','Kollektionen','Aktionsname','Beginn','Ende (optional)','Andere Produktrabatte','Nie kombinieren','Bestellrabatte','Versandrabatte',
    'Staffel','Menge','Bezeichnung','Untertitel','Rabattart','Originalpreis','Prozentualer Rabatt','Abzug pro Artikel','Festpreis pro Artikel','Rabattwert','Abzug pro Artikel','Festpreis pro Artikel','Badge-Text','Standardmäßig ausgewählt',
    'Staffel hinzufügen','Shop-Vorschau','Angebot auf Produktseite','Aktualisiert sich sofort','Regelübersicht',
  ],
  es: [
    'Diseño','Apilado','Horizontal','Cuadrícula','Lista','Tarjetas','Radio de tarjeta','Espacio entre tarjetas','Colores','General','Texto de la oferta','Etiqueta',
    'Fondo de tarjeta','Fondo seleccionado','Borde de tarjeta','Título de sección','Título del tramo','Subtítulo','Precio','Precio original','Fondo de etiqueta','Texto de etiqueta','Introduce un color HEX de 6 dígitos.',
    'Tipografía','Tamaño de texto','Título de sección','Título del tramo','Subtítulo','Precio','Etiqueta','Tamaño','Grosor','Variantes','Permitir variantes mixtas','Mostrar selectores','Mostrar precio original y rebajado',
    'Vista de variantes','Desplegable','Imágenes de variantes','Valores de texto','Muestras de color','Selección predeterminada','Primera disponible','Sin preselección','Tamaño de imagen','Radio de imagen','Mostrar color debajo de imagen',
    'Ámbito de productos','Configuración','Estilo','Todos los productos','Productos específicos','Colecciones','Nombre de campaña','Inicio','Fin (opcional)','Otros descuentos de producto','No combinar','Descuentos de pedido','Descuentos de envío',
    'Tramo','Cant.','Nombre','Subtítulo','Tipo de descuento','Precio original','Porcentaje','Descuento por artículo','Precio fijo por artículo','Valor del descuento','Descuento por artículo','Precio fijo por artículo','Texto de etiqueta','Recomendado',
    'Añadir tramo','Vista previa de tienda','Oferta en página de producto','Se actualiza al editar','Resumen de regla',
  ],
  it: [
    'Layout','Impilato','Orizzontale','Griglia','Elenco','Schede','Raggio scheda','Spaziatura schede','Colori','Generale','Testo offerta','Etichetta',
    'Sfondo scheda','Sfondo selezionato','Bordo scheda','Titolo sezione','Titolo fascia','Sottotitolo','Prezzo','Prezzo originale','Sfondo etichetta','Testo etichetta','Inserisci un colore HEX a 6 cifre.',
    'Tipografia','Dimensione testo','Titolo sezione','Titolo fascia','Sottotitolo','Prezzo','Etichetta','Dimensione','Spessore','Varianti','Consenti varianti miste','Mostra selettori','Mostra prezzo originale e scontato',
    'Visualizzazione varianti','Menu a discesa','Immagini varianti','Valori testuali','Campioni colore','Selezione predefinita','Prima disponibile','Nessuna preselezione','Dimensione immagine','Raggio immagine','Mostra colore sotto immagine',
    'Prodotti interessati','Impostazioni','Stile','Tutti i prodotti','Prodotti specifici','Collezioni','Nome campagna','Inizio','Fine (facoltativa)','Altri sconti prodotto','Non combinare','Sconti ordine','Sconti spedizione',
    'Fascia','Qtà','Etichetta','Sottotitolo','Tipo sconto','Prezzo originale','Percentuale','Sconto per articolo','Prezzo fisso per articolo','Valore sconto','Sconto per articolo','Prezzo fisso per articolo','Testo etichetta','Consigliato',
    'Aggiungi fascia','Anteprima negozio','Offerta nella pagina prodotto','Aggiornamento immediato','Riepilogo regola',
  ],
  nl: [
    'Indeling','Gestapeld','Horizontaal','Raster','Lijst','Kaarten','Kaartafronding','Kaartafstand','Kleuren','Algemeen','Aanbiedingstekst','Label',
    'Kaartachtergrond','Geselecteerde achtergrond','Kaartrand','Sectietitel','Staffeltitel','Ondertitel','Prijs','Oorspronkelijke prijs','Labelachtergrond','Labeltekst','Voer een HEX-kleur van 6 tekens in.',
    'Typografie','Tekstgrootte','Sectietitel','Staffeltitel','Ondertitel','Prijs','Label','Grootte','Gewicht','Varianten','Gemengde varianten toestaan','Variantkeuzes tonen','Originele en kortingsprijs tonen',
    'Variantweergave','Keuzelijst','Variantafbeeldingen','Tekstwaarden','Kleurstalen','Standaardselectie','Eerste beschikbare','Geen voorselectie','Afbeeldingsgrootte','Afbeeldingsafronding','Kleur onder afbeelding tonen',
    'Productbereik','Instellingen','Stijl','Alle producten','Specifieke producten','Collecties','Campagnenaam','Begint op','Eindigt op (optioneel)','Andere productkortingen','Nooit combineren','Bestelkortingen','Verzendkortingen',
    'Staffel','Aantal','Naam','Ondertitel','Kortingssoort','Oorspronkelijke prijs','Percentage korting','Korting per artikel','Vaste prijs per artikel','Kortingswaarde','Korting per artikel','Vaste prijs per artikel','Labeltekst','Aanbevolen',
    'Staffel toevoegen','Winkelvoorbeeld','Aanbieding op productpagina','Wordt direct bijgewerkt','Regeloverzicht',
  ],
  sv: [
    'Layout','Staplad','Horisontell','Rutnät','Lista','Kort','Kortradie','Kortavstånd','Färger','Allmänt','Erbjudandetext','Etikett',
    'Kortbakgrund','Vald bakgrund','Kortram','Avsnittsrubrik','Nivårubrik','Underrubrik','Pris','Ordinarie pris','Etikettbakgrund','Etiketttext','Ange en HEX-färg med 6 tecken.',
    'Typografi','Textstorlek','Avsnittsrubrik','Nivårubrik','Underrubrik','Pris','Etikett','Storlek','Vikt','Varianter','Tillåt blandade varianter','Visa variantväljare','Visa ordinarie och rabatterat pris',
    'Variantvisning','Rullgardinsmeny','Variantbilder','Textvärden','Färgprover','Standardval','Första tillgängliga','Inget förval','Bildstorlek','Bildradie','Visa färg under bilden',
    'Produkturval','Inställningar','Stil','Alla produkter','Specifika produkter','Kollektioner','Kampanjnamn','Startar','Slutar (valfritt)','Andra produktrabatter','Kombinera aldrig','Orderrabatter','Fraktrabatter',
    'Nivå','Antal','Namn','Underrubrik','Rabattyp','Ordinarie pris','Procentrabatt','Rabatt per vara','Fast pris per vara','Rabattvärde','Rabatt per vara','Fast pris per vara','Etiketttext','Rekommenderad',
    'Lägg till nivå','Butiksförhandsvisning','Erbjudande på produktsidan','Uppdateras direkt','Regelsammanfattning',
  ],
  tr: [
    'Düzen','Dikey','Yatay','Izgara','Liste','Kartlar','Kart köşesi','Kart aralığı','Renkler','Genel','Teklif metni','Etiket',
    'Kart arka planı','Seçili arka plan','Kart kenarlığı','Bölüm başlığı','Kademe başlığı','Alt başlık','Fiyat','Orijinal fiyat','Etiket arka planı','Etiket metni','6 haneli HEX renk girin.',
    'Tipografi','Metin boyutu','Bölüm başlığı','Kademe başlığı','Alt başlık','Fiyat','Etiket','Boyut','Kalınlık','Varyantlar','Karma varyantlara izin ver','Varyant seçicileri göster','Orijinal ve indirimli fiyatı göster',
    'Varyant görünümü','Açılır liste','Varyant görselleri','Metin değerleri','Renk örnekleri','Varsayılan seçim','İlk uygun','Ön seçim yok','Görsel boyutu','Görsel köşesi','Görsel altında renk göster',
    'Ürün kapsamı','Ayarlar','Stil','Tüm ürünler','Belirli ürünler','Koleksiyonlar','Kampanya adı','Başlangıç','Bitiş (isteğe bağlı)','Diğer ürün indirimleri','Asla birleştirme','Sipariş indirimleri','Kargo indirimleri',
    'Kademe','Adet','Etiket','Alt başlık','İndirim türü','Orijinal fiyat','Yüzde indirim','Ürün başına indirim','Ürün başına sabit fiyat','İndirim değeri','Ürün başına indirim','Ürün başına sabit fiyat','Etiket metni','Önerilen',
    'Kademe ekle','Mağaza önizlemesi','Ürün sayfası teklifi','Anında güncellenir','Kural özeti',
  ],
  'pt-BR': [
    'Layout','Empilhado','Horizontal','Grade','Lista','Cartões','Raio do cartão','Espaço entre cartões','Cores','Geral','Texto da oferta','Selo',
    'Fundo do cartão','Fundo selecionado','Borda do cartão','Título da seção','Título da faixa','Subtítulo','Preço','Preço original','Fundo do selo','Texto do selo','Digite uma cor HEX de 6 dígitos.',
    'Tipografia','Tamanho do texto','Título da seção','Título da faixa','Subtítulo','Preço','Selo','Tamanho','Espessura','Variantes','Permitir variantes mistas','Mostrar seletores','Mostrar preço original e com desconto',
    'Exibição das variantes','Lista suspensa','Imagens das variantes','Valores em texto','Amostras de cor','Seleção padrão','Primeira disponível','Sem pré-seleção','Tamanho da imagem','Raio da imagem','Mostrar cor abaixo da imagem',
    'Escopo de produtos','Configurações','Estilo','Todos os produtos','Produtos específicos','Coleções','Nome da campanha','Início','Fim (opcional)','Outros descontos em produtos','Nunca combinar','Descontos no pedido','Descontos no frete',
    'Faixa','Qtd.','Nome','Subtítulo','Tipo de desconto','Preço original','Percentual','Desconto por item','Preço fixo por item','Valor do desconto','Desconto por item','Preço fixo por item','Texto do selo','Recomendado',
    'Adicionar faixa','Prévia da loja','Oferta na página do produto','Atualiza ao editar','Resumo da regra',
  ],
  'zh-Hans': [
    '布局','纵向堆叠','横向三列','两列网格','无边框列表','卡片','卡片圆角','卡片间距','颜色','常规','优惠文案','标签',
    '卡片背景','选中背景','卡片边框','区域标题','档位标题','副标题','价格','原价','标签背景','标签文字','请输入 6 位 HEX 色值。',
    '字体排版','正文字号','区域标题','档位标题','副标题','价格','标签','字号','字重','规格','允许不同规格混购','显示规格选择器','显示原价和折后价',
    '规格显示方式','下拉框','原款式图','纯文本','颜色色板','默认规格选择','首个有货规格','不预选','图片尺寸','图片圆角','图片下方显示规格值',
    '商品范围','设置','样式','全部商品','指定商品','商品分类','活动名称','开始时间','结束时间（可选）','其他商品折扣','不可叠加','订单折扣','运费折扣',
    '档位','数量','名称','副标题','折扣类型','原价','百分比折扣','每件固定减免','每件固定价格','折扣数值','每件减免金额','每件固定价格','标签文案','默认选中',
    '添加档位','前台实时预览','商品页优惠','编辑后实时更新','规则摘要',
  ],
  'zh-Hant': [
    '佈局','縱向堆疊','橫向三欄','兩欄網格','無邊框清單','卡片','卡片圓角','卡片間距','顏色','一般','優惠文案','標籤',
    '卡片背景','選取背景','卡片邊框','區塊標題','檔位標題','副標題','價格','原價','標籤背景','標籤文字','請輸入 6 位 HEX 色碼。',
    '字體排版','內文字級','區塊標題','檔位標題','副標題','價格','標籤','字級','字重','規格','允許不同規格混購','顯示規格選擇器','顯示原價及折後價',
    '規格顯示方式','下拉選單','原款式圖','純文字','顏色色板','預設規格選擇','第一個有貨規格','不預選','圖片尺寸','圖片圓角','圖片下方顯示顏色值',
    '商品範圍','設定','樣式','所有商品','指定商品','商品分類','活動名稱','開始時間','結束時間（可選）','其他商品折扣','不可疊加','訂單折扣','運費折扣',
    '檔位','數量','名稱','副標題','折扣類型','原價','百分比折扣','每件固定減免','每件固定價格','折扣數值','每件減免金額','每件固定價格','標籤文案','預設選中',
    '新增檔位','前台即時預覽','商品頁優惠','編輯後即時更新','規則摘要',
  ],
} as const;

const supplementalKeys = [
  'editCampaign','saveError','nameRequired','quantityRequired','quantityUnique','tierRequired','endAfterStart',
  'coverageUnavailable','checkCoverage','checking','coverageConflict','coverageUnverified','coverageClear','coverageDescription',
  'coverageBlocked','combinationLocked','combinationLockedReason','marketAmounts','marketConversion','loadingMarkets',
  'marketUnavailable','noMarkets','currencyUnavailable','disabled','amountMode','autoConvert','specifyAmount','marketAmount',
  'specifiedUnavailable','tierRule','previewAuthority','untitledCampaign','summaryScope','summaryTiers','summaryRecommended',
  'summaryCombination','none','on','off',
] as const;
const styleExtensionKeys = ['styleOpacity', 'styleTypecomparePrice', 'styleTypeaddButton', 'styleHexAlphaError'] as const;
const styleExtensionValues: Record<keyof typeof values, readonly [string, string, string, string]> = {
  en: ['Opacity', 'Original price', 'Add to cart button', 'Enter a 6- or 8-digit HEX color.'],
  fr: ['Opacité', 'Prix initial', 'Bouton Ajouter au panier', 'Saisissez une couleur HEX à 6 ou 8 chiffres.'],
  de: ['Deckkraft', 'Originalpreis', 'In-den-Warenkorb-Schaltfläche', 'HEX-Farbe mit 6 oder 8 Stellen eingeben.'],
  es: ['Opacidad', 'Precio original', 'Botón Añadir al carrito', 'Introduce un color HEX de 6 u 8 dígitos.'],
  it: ['Opacità', 'Prezzo originale', 'Pulsante Aggiungi al carrello', 'Inserisci un colore HEX a 6 o 8 cifre.'],
  nl: ['Dekking', 'Oorspronkelijke prijs', 'Knop Toevoegen aan winkelwagen', 'Voer een HEX-kleur van 6 of 8 tekens in.'],
  sv: ['Opacitet', 'Ordinarie pris', 'Lägg i varukorg-knapp', 'Ange en HEX-färg med 6 eller 8 tecken.'],
  tr: ['Opaklık', 'Orijinal fiyat', 'Sepete ekle düğmesi', '6 veya 8 basamaklı HEX renk girin.'],
  'pt-BR': ['Opacidade', 'Preço original', 'Botão Adicionar ao carrinho', 'Informe uma cor HEX de 6 ou 8 dígitos.'],
  'zh-Hans': ['透明度', '原价', '加购按钮', '请输入 6 位或 8 位 HEX 色值。'],
  'zh-Hant': ['透明度', '原價', '加入購物車按鈕', '請輸入 6 位或 8 位 HEX 色值。'],
};
const detailKeys = ['styleBadgePosition','styleBadgeCorner','styleBadgeBelow','styleColorVariants','styleColorCheckout',
  'styleColorvariantTitle','styleColorvariantValue','styleColorvariantPrice','styleColorslotNumber','styleColorvariantBorder',
  'styleColorvariantSelectedBorder','styleColoraddButtonBackground','styleColoraddButtonText','styleColorsavingsPrice','styleColorcartLine',
  'styleTypevariantTitle','styleTypevariantValue','styleTypevariantPrice','styleTypeslotNumber','styleTypesavingsPrice','styleTypecartLine'] as const;
const detailValues: Record<keyof typeof values, readonly string[]> = {
  en: ['Badge position','Top right','Below subtitle','Variants','Cart and checkout','Variant title','Variant value','Variant price','Item number','Variant border','Selected variant border','Add button background','Add button text','Savings price','Cart item','Variant title','Variant value','Variant price','Item number','Savings price','Cart item'],
  fr: ['Position du badge','En haut à droite','Sous le sous-titre','Variantes','Panier et paiement','Titre de variante','Valeur de variante','Prix de variante','Numéro d’article','Bordure de variante','Bordure de variante sélectionnée','Fond du bouton d’ajout','Texte du bouton d’ajout','Économies','Article du panier','Titre de variante','Valeur de variante','Prix de variante','Numéro d’article','Économies','Article du panier'],
  de: ['Badge-Position','Oben rechts','Unter dem Untertitel','Varianten','Warenkorb und Checkout','Variantentitel','Variantenwert','Variantenpreis','Artikelnummer','Variantenrand','Rand der gewählten Variante','Hintergrund der Warenkorb-Schaltfläche','Text der Warenkorb-Schaltfläche','Ersparnis','Warenkorbartikel','Variantentitel','Variantenwert','Variantenpreis','Artikelnummer','Ersparnis','Warenkorbartikel'],
  es: ['Posición de etiqueta','Arriba a la derecha','Debajo del subtítulo','Variantes','Carrito y pago','Título de variante','Valor de variante','Precio de variante','Número de artículo','Borde de variante','Borde de variante seleccionada','Fondo del botón de carrito','Texto del botón de carrito','Ahorro','Artículo del carrito','Título de variante','Valor de variante','Precio de variante','Número de artículo','Ahorro','Artículo del carrito'],
  it: ['Posizione etichetta','In alto a destra','Sotto il sottotitolo','Varianti','Carrello e pagamento','Titolo variante','Valore variante','Prezzo variante','Numero articolo','Bordo variante','Bordo variante selezionata','Sfondo pulsante carrello','Testo pulsante carrello','Risparmio','Articolo nel carrello','Titolo variante','Valore variante','Prezzo variante','Numero articolo','Risparmio','Articolo nel carrello'],
  nl: ['Labelpositie','Rechtsboven','Onder ondertitel','Varianten','Winkelwagen en afrekenen','Varianttitel','Variantwaarde','Variantprijs','Artikelnummer','Variantrand','Rand geselecteerde variant','Achtergrond winkelwagenknop','Tekst winkelwagenknop','Besparing','Winkelwagenartikel','Varianttitel','Variantwaarde','Variantprijs','Artikelnummer','Besparing','Winkelwagenartikel'],
  sv: ['Etikettposition','Överst till höger','Under underrubrik','Varianter','Varukorg och kassa','Varianttitel','Variantvärde','Variantpris','Artikelnummer','Variantkant','Kant för vald variant','Bakgrund för köpknapp','Text på köpknapp','Besparing','Varukorgsartikel','Varianttitel','Variantvärde','Variantpris','Artikelnummer','Besparing','Varukorgsartikel'],
  tr: ['Etiket konumu','Sağ üst','Alt başlığın altında','Varyantlar','Sepet ve ödeme','Varyant başlığı','Varyant değeri','Varyant fiyatı','Ürün numarası','Varyant kenarlığı','Seçili varyant kenarlığı','Sepete ekle düğmesi zemini','Sepete ekle düğmesi metni','Tasarruf','Sepet ürünü','Varyant başlığı','Varyant değeri','Varyant fiyatı','Ürün numarası','Tasarruf','Sepet ürünü'],
  'pt-BR': ['Posição do selo','Canto superior direito','Abaixo do subtítulo','Variantes','Carrinho e checkout','Título da variante','Valor da variante','Preço da variante','Número do item','Borda da variante','Borda da variante selecionada','Fundo do botão de compra','Texto do botão de compra','Economia','Item do carrinho','Título da variante','Valor da variante','Preço da variante','Número do item','Economia','Item do carrinho'],
  'zh-Hans': ['标签位置','右上角','副标题下方','规格','购物车与结账','规格标题','规格值','规格价格','商品序号','规格值原始边框','规格值选中边框','加购按钮背景','加购按钮文字','预计节省金额','购物车规格明细','规格标题','规格值','规格价格','商品序号','预计节省金额','购物车规格明细'],
  'zh-Hant': ['標籤位置','右上角','副標題下方','規格','購物車與結帳','規格標題','規格值','規格價格','商品序號','規格值原始邊框','規格值選取邊框','加入購物車按鈕背景','加入購物車按鈕文字','預計節省金額','購物車規格明細','規格標題','規格值','規格價格','商品序號','預計節省金額','購物車規格明細'],
};
const splitTypeKeys = ['styleTypesummaryLabel', 'styleTypesummaryAmount', 'styleTypecheckoutNote'] as const;
const splitTypeValues: Record<keyof typeof values, readonly [string, string, string]> = {
  en: ['Summary label', 'Summary amount', 'Checkout note'],
  fr: ['Libellé du récapitulatif', 'Montant du récapitulatif', 'Note de paiement'],
  de: ['Zusammenfassungstext', 'Zusammenfassungsbetrag', 'Checkout-Hinweis'],
  es: ['Etiqueta del resumen', 'Importe del resumen', 'Nota de pago'],
  it: ['Etichetta del riepilogo', 'Importo del riepilogo', 'Nota di pagamento'],
  nl: ['Samenvattingslabel', 'Samenvattingsbedrag', 'Afrekennotitie'],
  sv: ['Sammanfattningsetikett', 'Sammanfattningsbelopp', 'Kassanotering'],
  tr: ['Özet etiketi', 'Özet tutarı', 'Ödeme notu'],
  'pt-BR': ['Rótulo do resumo', 'Valor do resumo', 'Nota do checkout'],
  'zh-Hans': ['价格汇总文字', '价格汇总金额', '结账提示'],
  'zh-Hant': ['價格彙總文字', '價格彙總金額', '結帳提示'],
};
const summaryColorKeys = ['styleColorsummaryLabel', 'styleColorsummaryAmount'] as const;
const summaryColorValues: Record<keyof typeof values, readonly [string, string]> = {
  en: ['Summary label', 'Summary amount'],
  fr: ['Libellé du récapitulatif', 'Montant du récapitulatif'],
  de: ['Zusammenfassungstext', 'Zusammenfassungsbetrag'],
  es: ['Etiqueta del resumen', 'Importe del resumen'],
  it: ['Etichetta del riepilogo', 'Importo del riepilogo'],
  nl: ['Samenvattingslabel', 'Samenvattingsbedrag'],
  sv: ['Sammanfattningsetikett', 'Sammanfattningsbelopp'],
  tr: ['Özet etiketi', 'Özet tutarı'],
  'pt-BR': ['Rótulo do resumo', 'Valor do resumo'],
  'zh-Hans': ['价格汇总文字', '价格汇总金额'],
  'zh-Hant': ['價格彙總文字', '價格彙總金額'],
};
const styleRefinementKeys = ['styleColorprice', 'styleTypeprice', 'styleColorborder', 'styleColorvariantSelectedBorder', 'styleColorcardBorder', 'styleColorsavingsLabel', 'styleColoraddButtonBorder'] as const;
const styleRefinementValues: Record<keyof typeof values, readonly [string, string, string, string, string, string, string]> = {
  en: ['Sale price', 'Sale price', 'Selected card border', 'Selected variant border', 'Card border', 'Savings label', 'Add button border'],
  fr: ['Prix de vente', 'Prix de vente', 'Bordure de carte sélectionnée', 'Bordure de variante sélectionnée', 'Bordure de carte', 'Texte des économies', 'Bordure du bouton d’ajout'],
  de: ['Verkaufspreis', 'Verkaufspreis', 'Rand der gewählten Karte', 'Rand der gewählten Variante', 'Kartenrand', 'Ersparnistext', 'Rand der Warenkorb-Schaltfläche'],
  es: ['Precio de venta', 'Precio de venta', 'Borde de tarjeta seleccionada', 'Borde de variante seleccionada', 'Borde de tarjeta', 'Texto de ahorro', 'Borde del botón de carrito'],
  it: ['Prezzo di vendita', 'Prezzo di vendita', 'Bordo scheda selezionata', 'Bordo variante selezionata', 'Bordo scheda', 'Testo risparmio', 'Bordo pulsante carrello'],
  nl: ['Verkoopprijs', 'Verkoopprijs', 'Rand geselecteerde kaart', 'Rand geselecteerde variant', 'Kaartrand', 'Besparingstekst', 'Rand winkelwagenknop'],
  sv: ['Försäljningspris', 'Försäljningspris', 'Kant för valt kort', 'Kant för vald variant', 'Kortkant', 'Besparingstext', 'Kant för köpknapp'],
  tr: ['Satış fiyatı', 'Satış fiyatı', 'Seçili kart kenarlığı', 'Seçili varyant kenarlığı', 'Kart kenarlığı', 'Tasarruf metni', 'Sepete ekle düğmesi kenarlığı'],
  'pt-BR': ['Preço de venda', 'Preço de venda', 'Borda do cartão selecionado', 'Borda da variante selecionada', 'Borda do cartão', 'Texto da economia', 'Borda do botão de compra'],
  'zh-Hans': ['售价', '售价', '选中卡片边框', '选中规格边框', '常规卡片边框', '预计节省文字', '加购按钮边框'],
  'zh-Hant': ['售價', '售價', '選中卡片邊框', '選中規格邊框', '一般卡片邊框', '預計節省文字', '加入購物車按鈕邊框'],
};
const statusStyleKeys = ['styleColorvariantBackground', 'styleColorstatus', 'styleTypestatus'] as const;
const statusStyleValues: Record<keyof typeof values, readonly [string, string, string]> = {
  en: ['Variant background', 'Status message', 'Status message'],
  fr: ['Fond de variante', 'Message de statut', 'Message de statut'],
  de: ['Variantenhintergrund', 'Statusmeldung', 'Statusmeldung'],
  es: ['Fondo de variante', 'Mensaje de estado', 'Mensaje de estado'],
  it: ['Sfondo variante', 'Messaggio di stato', 'Messaggio di stato'],
  nl: ['Variantachtergrond', 'Statusbericht', 'Statusbericht'],
  sv: ['Variantbakgrund', 'Statusmeddelande', 'Statusmeddelande'],
  tr: ['Varyant arka planı', 'Durum mesajı', 'Durum mesajı'],
  'pt-BR': ['Fundo da variante', 'Mensagem de status', 'Mensagem de status'],
  'zh-Hans': ['规格背景', '状态提示', '状态提示'],
  'zh-Hant': ['規格背景', '狀態提示', '狀態提示'],
};
const tierSavingsBadgeStyleKeys = ['styleShowTierSavingsBadge', 'styleTierSavingsBadgeRadius', 'styleColorTierSavingsBadge', 'styleColortierSavingsBadgeBackground', 'styleColortierSavingsBadgeText', 'styleTypetierSavingsBadge'] as const;
const styleLabelOverrides: Record<string, Partial<Record<string, string>>> = {
  en: { styleColorprice: 'Tier sale price', styleTypeprice: 'Tier sale price', styleColorcomparePrice: 'Tier original price', styleTypecomparePrice: 'Tier original price', styleColorvariantPrice: 'Variant sale price', styleTypevariantPrice: 'Variant sale price' },
  'zh-hans': { styleColorprice: '档位售价', styleTypeprice: '档位售价', styleColorcomparePrice: '档位原价', styleTypecomparePrice: '档位原价', styleColorvariantPrice: '规格售价', styleTypevariantPrice: '规格售价' },
  'zh-hant': { styleColorprice: '檔位售價', styleTypeprice: '檔位售價', styleColorcomparePrice: '檔位原價', styleTypecomparePrice: '檔位原價', styleColorvariantPrice: '規格售價', styleTypevariantPrice: '規格售價' },
};
const savingsLabelTitles: Record<string, string> = {
  "en": "Savings label",
  "fr": "Titre des économies estimées",
  "de": "Titel der geschätzten Ersparnis",
  "es": "Título del ahorro estimado",
  "it": "Titolo del risparmio stimato",
  "nl": "Titel geschatte besparing",
  "sv": "Rubrik för beräknad besparing",
  "tr": "Tahmini tasarruf başlığı",
  "pt-br": "Título da economia estimada",
  "zh-hans": "预计节省标题",
  "zh-hant": "預計節省標題",
  "id": "Judul perkiraan penghematan",
  "ja": "予想節約額の見出し",
  "ms": "Tajuk anggaran penjimatan",
  "th": "หัวข้อยอดประหยัดโดยประมาณ",
  "vi": "Tiêu đề tiết kiệm dự kiến"
};
for (const [locale, title] of Object.entries(savingsLabelTitles)) (styleLabelOverrides[locale] ??= {}).styleTypesavingsLabel = title;
const selectedVariantTextLabels: Record<string, string> = {
  en: 'Selected variant text',
  fr: 'Texte de variante sélectionnée',
  de: 'Text der ausgewählten Variante',
  es: 'Texto de variante seleccionada',
  it: 'Testo della variante selezionata',
  nl: 'Tekst geselecteerde variant',
  sv: 'Text för vald variant',
  tr: 'Seçili varyant metni',
  'pt-br': 'Texto da variante selecionada',
  'zh-hans': '选中规格值',
  'zh-hant': '選中規格值',
  id: 'Teks varian terpilih',
  ja: '選択したバリエーションの文字',
  ms: 'Teks varian dipilih',
  th: 'ข้อความตัวเลือกสินค้าที่เลือก',
  vi: 'Chữ biến thể đã chọn',
};
for (const [locale, title] of Object.entries(selectedVariantTextLabels)) (styleLabelOverrides[locale] ??= {}).styleColorvariantSelectedText = title;
const selectedVariantBackgroundLabels: Record<string, string> = {
  en: 'Selected variant background',
  fr: 'Arrière-plan de variante sélectionnée',
  de: 'Hintergrund der ausgewählten Variante',
  es: 'Fondo de variante seleccionada',
  it: 'Sfondo della variante selezionata',
  nl: 'Achtergrond geselecteerde variant',
  sv: 'Bakgrund för vald variant',
  tr: 'Seçili varyant arka planı',
  'pt-br': 'Fundo da variante selecionada',
  'zh-hans': '规格选中背景',
  'zh-hant': '規格選中背景',
  id: 'Latar varian terpilih',
  ja: '選択したバリエーションの背景',
  ms: 'Latar belakang varian dipilih',
  th: 'พื้นหลังตัวเลือกสินค้าที่เลือก',
  vi: 'Nền biến thể đã chọn',
};
for (const [locale, title] of Object.entries(selectedVariantBackgroundLabels)) (styleLabelOverrides[locale] ??= {}).styleColorvariantSelectedBackground = title;
const tierSavingsBadgeStyleOverrides: Record<string, Record<typeof tierSavingsBadgeStyleKeys[number], string>> = {
  en: { styleShowTierSavingsBadge: 'Show tier savings badge', styleTierSavingsBadgeRadius: 'Tier savings badge radius', styleColorTierSavingsBadge: 'Tier savings badge', styleColortierSavingsBadgeBackground: 'Tier savings badge background', styleColortierSavingsBadgeText: 'Tier savings badge text', styleTypetierSavingsBadge: 'Tier savings badge' },
  fr: { styleShowTierSavingsBadge: 'Afficher le badge d’économies du palier', styleTierSavingsBadgeRadius: 'Rayon du badge d’économies', styleColorTierSavingsBadge: 'Badge d’économies du palier', styleColortierSavingsBadgeBackground: 'Arrière-plan du badge d’économies', styleColortierSavingsBadgeText: 'Texte du badge d’économies', styleTypetierSavingsBadge: 'Badge d’économies du palier' },
  de: { styleShowTierSavingsBadge: 'Einsparungs-Badge der Staffel anzeigen', styleTierSavingsBadgeRadius: 'Eckenradius des Einsparungs-Badges', styleColorTierSavingsBadge: 'Einsparungs-Badge der Staffel', styleColortierSavingsBadgeBackground: 'Hintergrund des Einsparungs-Badges', styleColortierSavingsBadgeText: 'Text des Einsparungs-Badges', styleTypetierSavingsBadge: 'Einsparungs-Badge der Staffel' },
  es: { styleShowTierSavingsBadge: 'Etiqueta de ahorro por tramo', styleTierSavingsBadgeRadius: 'Radio de la etiqueta de ahorro', styleColorTierSavingsBadge: 'Etiqueta de ahorro por tramo', styleColortierSavingsBadgeBackground: 'Fondo de la etiqueta de ahorro', styleColortierSavingsBadgeText: 'Texto de la etiqueta de ahorro', styleTypetierSavingsBadge: 'Etiqueta de ahorro por tramo' },
  it: { styleShowTierSavingsBadge: 'Mostra etichetta risparmio fascia', styleTierSavingsBadgeRadius: 'Raggio etichetta risparmio', styleColorTierSavingsBadge: 'Etichetta risparmio fascia', styleColortierSavingsBadgeBackground: 'Sfondo etichetta risparmio', styleColortierSavingsBadgeText: 'Testo etichetta risparmio', styleTypetierSavingsBadge: 'Etichetta risparmio fascia' },
  nl: { styleShowTierSavingsBadge: 'Besparingslabel per staffel tonen', styleTierSavingsBadgeRadius: 'Hoekradius besparingslabel', styleColorTierSavingsBadge: 'Besparingslabel per staffel', styleColortierSavingsBadgeBackground: 'Achtergrond besparingslabel', styleColortierSavingsBadgeText: 'Tekst besparingslabel', styleTypetierSavingsBadge: 'Besparingslabel per staffel' },
  sv: { styleShowTierSavingsBadge: 'Visa besparingsetikett för nivå', styleTierSavingsBadgeRadius: 'Hörnradie för besparingsetikett', styleColorTierSavingsBadge: 'Besparingsetikett för nivå', styleColortierSavingsBadgeBackground: 'Bakgrund för besparingsetikett', styleColortierSavingsBadgeText: 'Text för besparingsetikett', styleTypetierSavingsBadge: 'Besparingsetikett för nivå' },
  tr: { styleShowTierSavingsBadge: 'Kademe tasarruf rozetini göster', styleTierSavingsBadgeRadius: 'Tasarruf rozeti köşe yarıçapı', styleColorTierSavingsBadge: 'Kademe tasarruf rozeti', styleColortierSavingsBadgeBackground: 'Tasarruf rozeti arka planı', styleColortierSavingsBadgeText: 'Tasarruf rozeti metni', styleTypetierSavingsBadge: 'Kademe tasarruf rozeti' },
  'pt-br': { styleShowTierSavingsBadge: 'Mostrar selo de economia da faixa', styleTierSavingsBadgeRadius: 'Raio do selo de economia', styleColorTierSavingsBadge: 'Selo de economia da faixa', styleColortierSavingsBadgeBackground: 'Fundo do selo de economia', styleColortierSavingsBadgeText: 'Texto do selo de economia', styleTypetierSavingsBadge: 'Selo de economia da faixa' },
  'zh-hans': { styleShowTierSavingsBadge: '显示档位优惠标签', styleTierSavingsBadgeRadius: '优惠标签圆角', styleColorTierSavingsBadge: '档位优惠标签', styleColortierSavingsBadgeBackground: '档位优惠标签背景', styleColortierSavingsBadgeText: '档位优惠标签文字', styleTypetierSavingsBadge: '档位优惠标签' },
  'zh-hant': { styleShowTierSavingsBadge: '顯示檔位優惠標籤', styleTierSavingsBadgeRadius: '優惠標籤圓角', styleColorTierSavingsBadge: '檔位優惠標籤', styleColortierSavingsBadgeBackground: '檔位優惠標籤背景', styleColortierSavingsBadgeText: '檔位優惠標籤文字', styleTypetierSavingsBadge: '檔位優惠標籤' },
  ms: { styleShowTierSavingsBadge: 'Tunjukkan lencana penjimatan peringkat', styleTierSavingsBadgeRadius: 'Jejari lencana penjimatan', styleColorTierSavingsBadge: 'Lencana penjimatan peringkat', styleColortierSavingsBadgeBackground: 'Latar lencana penjimatan', styleColortierSavingsBadgeText: 'Teks lencana penjimatan', styleTypetierSavingsBadge: 'Lencana penjimatan peringkat' },
  th: { styleShowTierSavingsBadge: 'แสดงป้ายประหยัดของระดับ', styleTierSavingsBadgeRadius: 'ความโค้งของป้ายประหยัด', styleColorTierSavingsBadge: 'ป้ายประหยัดของระดับ', styleColortierSavingsBadgeBackground: 'พื้นหลังป้ายประหยัด', styleColortierSavingsBadgeText: 'ข้อความป้ายประหยัด', styleTypetierSavingsBadge: 'ป้ายประหยัดของระดับ' },
  id: { styleShowTierSavingsBadge: 'Tampilkan lencana hemat tingkat', styleTierSavingsBadgeRadius: 'Radius lencana hemat', styleColorTierSavingsBadge: 'Lencana hemat tingkat', styleColortierSavingsBadgeBackground: 'Latar lencana hemat', styleColortierSavingsBadgeText: 'Teks lencana hemat', styleTypetierSavingsBadge: 'Lencana hemat tingkat' },
  vi: { styleShowTierSavingsBadge: 'Hiển thị nhãn tiết kiệm theo bậc', styleTierSavingsBadgeRadius: 'Bo góc nhãn tiết kiệm', styleColorTierSavingsBadge: 'Nhãn tiết kiệm theo bậc', styleColortierSavingsBadgeBackground: 'Nền nhãn tiết kiệm', styleColortierSavingsBadgeText: 'Chữ nhãn tiết kiệm', styleTypetierSavingsBadge: 'Nhãn tiết kiệm theo bậc' },
  ja: { styleShowTierSavingsBadge: 'ティア割引バッジを表示', styleTierSavingsBadgeRadius: 'ティア割引バッジの角丸', styleColorTierSavingsBadge: 'ティア割引バッジ', styleColortierSavingsBadgeBackground: 'ティア割引バッジの背景', styleColortierSavingsBadgeText: 'ティア割引バッジの文字', styleTypetierSavingsBadge: 'ティア割引バッジ' },
};
for (const [locale, messages] of Object.entries(tierSavingsBadgeStyleOverrides)) Object.assign(styleLabelOverrides[locale] ??= {}, messages);
const tierActionKeys = ['copyTier', 'deleteTier', 'deleteTierTitle', 'deleteTierBody', 'confirmDeleteTier', 'cancelDeleteTier'] as const;
const tierDragKeys = ['reorderTier', 'reorderTierHint', 'tierMoved'] as const;
const tierDragValues: Record<keyof typeof values, readonly [string, string, string]> = {
  en: ['Reorder {tier}; use the up and down arrow keys', 'Drag or use arrow keys to reorder', '{tier} moved to position {position}.'],
  fr: ['Réorganiser {tier} avec les flèches haut et bas', 'Glisser ou utiliser les flèches pour réorganiser', '{tier} déplacé en position {position}.'],
  de: ['{tier} mit den Pfeiltasten nach oben und unten verschieben', 'Ziehen oder mit Pfeiltasten verschieben', '{tier} auf Position {position} verschoben.'],
  es: ['Reordenar {tier} con las flechas arriba y abajo', 'Arrastra o usa las flechas para reordenar', '{tier} se movió a la posición {position}.'],
  it: ['Riordina {tier} con le frecce su e giù', 'Trascina o usa le frecce per riordinare', '{tier} spostato alla posizione {position}.'],
  nl: ['Verplaats {tier} met de pijltoetsen omhoog en omlaag', 'Sleep of gebruik de pijltoetsen om te verplaatsen', '{tier} verplaatst naar positie {position}.'],
  sv: ['Flytta {tier} med upp- och nedpilarna', 'Dra eller använd piltangenterna för att ordna', '{tier} flyttades till plats {position}.'],
  tr: ['{tier} kademesini yukarı ve aşağı ok tuşlarıyla sırala', 'Sürükleyin veya ok tuşlarıyla sıralayın', '{tier} {position}. sıraya taşındı.'],
  'pt-BR': ['Reordene {tier} com as setas para cima e para baixo', 'Arraste ou use as setas para reordenar', '{tier} movida para a posição {position}.'],
  'zh-Hans': ['重新排序{tier}；使用上下方向键', '拖动或使用方向键排序', '{tier}已移至第{position}位。'],
  'zh-Hant': ['重新排序{tier}；使用上下方向鍵', '拖曳或使用方向鍵排序', '{tier}已移至第{position}位。'],
};
const tierActionValues: Record<keyof typeof values, readonly [string, string, string, string, string, string]> = {
  en: ['Copy tier', 'Delete tier', 'Delete this tier?', 'Delete {tier} from this campaign? This change takes effect when you save.', 'Delete tier', 'Cancel'],
  fr: ['Copier le palier', 'Supprimer le palier', 'Supprimer ce palier ?', 'Supprimer {tier} de cette campagne ? Ce changement prend effet à l’enregistrement.', 'Supprimer le palier', 'Annuler'],
  de: ['Staffel kopieren', 'Staffel löschen', 'Diese Staffel löschen?', '{tier} aus dieser Aktion löschen? Die Änderung gilt nach dem Speichern.', 'Staffel löschen', 'Abbrechen'],
  es: ['Copiar tramo', 'Eliminar tramo', '¿Eliminar este tramo?', '¿Eliminar {tier} de esta campaña? El cambio se aplica al guardar.', 'Eliminar tramo', 'Cancelar'],
  it: ['Copia fascia', 'Elimina fascia', 'Eliminare questa fascia?', 'Eliminare {tier} da questa campagna? La modifica si applica al salvataggio.', 'Elimina fascia', 'Annulla'],
  nl: ['Staffel kopiëren', 'Staffel verwijderen', 'Deze staffel verwijderen?', '{tier} uit deze campagne verwijderen? Dit wordt toegepast bij opslaan.', 'Staffel verwijderen', 'Annuleren'],
  sv: ['Kopiera nivå', 'Ta bort nivå', 'Ta bort den här nivån?', 'Ta bort {tier} från kampanjen? Ändringen gäller när du sparar.', 'Ta bort nivå', 'Avbryt'],
  tr: ['Kademeyi kopyala', 'Kademeyi sil', 'Bu kademe silinsin mi?', '{tier} bu kampanyadan silinsin mi? Değişiklik kaydedince geçerli olur.', 'Kademeyi sil', 'İptal'],
  'pt-BR': ['Copiar faixa', 'Excluir faixa', 'Excluir esta faixa?', 'Excluir {tier} desta campanha? A alteração terá efeito ao salvar.', 'Excluir faixa', 'Cancelar'],
  'zh-Hans': ['复制档位', '删除档位', '删除此档位？', '从活动中删除{tier}？保存活动后此更改才会生效。', '删除档位', '取消'],
  'zh-Hant': ['複製檔位', '刪除檔位', '刪除此檔位？', '從活動中刪除{tier}？儲存活動後此變更才會生效。', '刪除檔位', '取消'],
};
const scheduleExtensionKeys = ['endRequired', 'neverExpires'] as const;
const nameCoverageKeys = ['internalName', 'discountName', 'discountNameRequired', 'coverageConflictTitle', 'conflictActivityName', 'conflictProductName'] as const;
export type CampaignEditorMessageKey = 'previewCountry' | 'styleColorvariantSelectedBackground' | 'styleColorvariantSelectedText' | 'styleTypesavingsLabel' | BaseMessageKey | typeof supplementalKeys[number] | typeof styleExtensionKeys[number] | typeof detailKeys[number] | typeof splitTypeKeys[number] | typeof summaryColorKeys[number] | typeof styleRefinementKeys[number] | typeof statusStyleKeys[number] | typeof tierActionKeys[number] | typeof tierDragKeys[number] | typeof scheduleExtensionKeys[number] | typeof nameCoverageKeys[number] | typeof tierSavingsBadgeStyleKeys[number] | 'specifiedMarket' | 'marketPriceLoading' | 'marketPriceUnavailable' | 'marketConversionUnavailable' | 'startRequired' | 'collectionPriorityNotice' | 'marketCombinationNotice' | keyof typeof bundleDiscountMessages.en;
const scheduleExtensionValues: Record<keyof typeof values, readonly [string, string]> = {
  en: ['Enter an end time or select Never expires.', 'Never expires'],
  fr: ['Saisissez une heure de fin ou sélectionnez Sans expiration.', 'Sans expiration'],
  de: ['Geben Sie eine Endzeit ein oder wählen Sie Nie ablaufend.', 'Nie ablaufend'],
  es: ['Introduce una hora de finalización o selecciona Sin vencimiento.', 'Sin vencimiento'],
  it: ['Inserisci un orario di fine o seleziona Senza scadenza.', 'Senza scadenza'],
  nl: ['Vul een eindtijd in of selecteer Verloopt nooit.', 'Verloopt nooit'],
  sv: ['Ange en sluttid eller välj Upphör aldrig.', 'Upphör aldrig'],
  tr: ['Bir bitiş saati girin veya Asla sona ermez seçeneğini belirleyin.', 'Asla sona ermez'],
  'pt-BR': ['Informe um horário de término ou selecione Nunca expira.', 'Nunca expira'],
  'zh-Hans': ['请填写结束时间。', '永不过期'],
  'zh-Hant': ['請填寫結束時間。', '永不過期'],
};
const endsAtLabels: Record<keyof typeof values, string> = {
  en: 'Ends at', fr: 'Se termine le', de: 'Endet am', es: 'Finaliza el', it: 'Termina il', nl: 'Eindigt op', sv: 'Slutar', tr: 'Bitiş zamanı', 'pt-BR': 'Termina em', 'zh-Hans': '结束时间', 'zh-Hant': '結束時間',
};
const addedScheduleMessages: Record<string, { endsAt: string; endRequired: string; neverExpires: string }> = {
  id: { endsAt: 'Berakhir pada', endRequired: 'Masukkan waktu berakhir atau pilih Tidak pernah berakhir.', neverExpires: 'Tidak pernah berakhir' },
  ja: { endsAt: '終了日時', endRequired: '終了日時を入力するか、期限なしを選択してください。', neverExpires: '期限なし' },
  ms: { endsAt: 'Tamat pada', endRequired: 'Masukkan masa tamat atau pilih Tidak pernah tamat.', neverExpires: 'Tidak pernah tamat' },
  th: { endsAt: 'สิ้นสุด', endRequired: 'กรอกเวลาสิ้นสุดหรือเลือกไม่มีวันหมดอายุ', neverExpires: 'ไม่มีวันหมดอายุ' },
  vi: { endsAt: 'Kết thúc lúc', endRequired: 'Nhập thời gian kết thúc hoặc chọn Không hết hạn.', neverExpires: 'Không hết hạn' },
};
const startRequiredMessages: Record<keyof typeof values, string> = {
  en: 'Start time is required.', fr: 'La date de début est obligatoire.', de: 'Die Startzeit ist erforderlich.', es: 'La fecha de inicio es obligatoria.', it: 'La data di inizio è obbligatoria.',
  nl: 'De starttijd is verplicht.', sv: 'Starttiden krävs.', tr: 'Başlangıç zamanı zorunludur.', 'pt-BR': 'A hora de início é obrigatória.', 'zh-Hans': '必须填写开始时间。', 'zh-Hant': '必須填寫開始時間。',
};
const nameCoverageMessages: Record<keyof typeof values, Record<typeof nameCoverageKeys[number], string>> = {
  en: { internalName: 'Name (visible only to you)', discountName: 'Discount name (shown in cart / checkout)', discountNameRequired: 'Enter a discount name for cart and checkout.', coverageConflictTitle: 'Product coverage conflict:', conflictActivityName: 'Activity name', conflictProductName: 'Product name' },
  fr: { internalName: 'Nom (visible uniquement par vous)', discountName: 'Nom de la remise (affiché dans le panier / paiement)', discountNameRequired: 'Saisissez un nom de remise pour le panier et le paiement.', coverageConflictTitle: 'Conflit de couverture produit :', conflictActivityName: 'Nom de l’activité', conflictProductName: 'Nom du produit' },
  de: { internalName: 'Name (nur für Sie sichtbar)', discountName: 'Rabattname (im Warenkorb / Checkout sichtbar)', discountNameRequired: 'Geben Sie einen Rabattnamen für Warenkorb und Checkout ein.', coverageConflictTitle: 'Produktbereich überschneidet sich:', conflictActivityName: 'Aktionsname', conflictProductName: 'Produktname' },
  es: { internalName: 'Nombre (visible solo para ti)', discountName: 'Nombre del descuento (visible en carrito / pago)', discountNameRequired: 'Introduce un nombre de descuento para el carrito y el pago.', coverageConflictTitle: 'Conflicto de cobertura de productos:', conflictActivityName: 'Nombre de actividad', conflictProductName: 'Nombre del producto' },
  it: { internalName: 'Nome (visibile solo a te)', discountName: 'Nome dello sconto (mostrato nel carrello / checkout)', discountNameRequired: 'Inserisci un nome sconto per carrello e checkout.', coverageConflictTitle: 'Conflitto di copertura prodotti:', conflictActivityName: 'Nome attività', conflictProductName: 'Nome prodotto' },
  nl: { internalName: 'Naam (alleen zichtbaar voor jou)', discountName: 'Kortingsnaam (zichtbaar in winkelwagen / afrekenen)', discountNameRequired: 'Voer een kortingsnaam in voor winkelwagen en afrekenen.', coverageConflictTitle: 'Conflict in productbereik:', conflictActivityName: 'Actienaam', conflictProductName: 'Productnaam' },
  sv: { internalName: 'Namn (synligt endast för dig)', discountName: 'Rabattnamn (visas i varukorg / kassa)', discountNameRequired: 'Ange ett rabattnamn för varukorg och kassa.', coverageConflictTitle: 'Konflikt i produkttäckning:', conflictActivityName: 'Aktivitetsnamn', conflictProductName: 'Produktnamn' },
  tr: { internalName: 'Ad (yalnızca size görünür)', discountName: 'İndirim adı (sepet / ödeme sayfasında gösterilir)', discountNameRequired: 'Sepet ve ödeme için bir indirim adı girin.', coverageConflictTitle: 'Ürün kapsamı çakışması:', conflictActivityName: 'Etkinlik adı', conflictProductName: 'Ürün adı' },
  'pt-BR': { internalName: 'Nome (visível apenas para você)', discountName: 'Nome do desconto (exibido no carrinho / checkout)', discountNameRequired: 'Informe um nome de desconto para o carrinho e checkout.', coverageConflictTitle: 'Conflito de cobertura de produtos:', conflictActivityName: 'Nome da atividade', conflictProductName: 'Nome do produto' },
  'zh-Hans': { internalName: '名称（仅您可见）', discountName: '折扣名称（显示在购物车/结账页面）', discountNameRequired: '请填写购物车和结账页面显示的折扣名称。', coverageConflictTitle: '商品范围冲突：', conflictActivityName: '活动名称', conflictProductName: '商品名' },
  'zh-Hant': { internalName: '名稱（僅您可見）', discountName: '折扣名稱（顯示在購物車/結帳頁面）', discountNameRequired: '請填寫購物車和結帳頁面顯示的折扣名稱。', coverageConflictTitle: '商品範圍衝突：', conflictActivityName: '活動名稱', conflictProductName: '商品名' },
};
const collectionPriorityNoticeMessages: Record<keyof typeof values, string> = {
  en: '{product} is already covered by the specified-product campaign {campaign}. The specified-product rule takes priority.',
  fr: '{product} est deja couvert par la campagne de produits specifies {campaign}. La regle de produit specifique est prioritaire.',
  de: '{product} wird bereits durch die Kampagne fur bestimmte Produkte {campaign} abgedeckt. Die Regel fur bestimmte Produkte hat Vorrang.',
  es: '{product} ya esta cubierto por la campana de productos especificos {campaign}. La regla de producto especifico tiene prioridad.',
  it: '{product} e gia coperto dalla campagna per prodotti specifici {campaign}. La regola per prodotto specifico ha priorita.',
  nl: '{product} valt al onder de campagne voor specifieke producten {campaign}. De regel voor specifieke producten heeft voorrang.',
  sv: '{product} omfattas redan av kampanjen for specifika produkter {campaign}. Regeln for specifika produkter har foretrade.',
  tr: '{product} zaten belirli urun kampanyasi {campaign} kapsaminda. Belirli urun kurali onceliklidir.',
  'pt-BR': '{product} ja esta coberto pela campanha de produtos especificos {campaign}. A regra de produto especifico tem prioridade.',
  'zh-Hans': '商品 {product} 已在指定商品活动“{campaign}”中生效，指定商品规则优先。',
  'zh-Hant': '商品 {product} 已在指定商品活動「{campaign}」中生效，指定商品規則優先。',
};
const bundleDiscountMessages = {
  en: { bundleAmountOff: 'Amount off entire bundle', bundleFixedPrice: 'Fixed price for entire bundle', amountOffTotal: 'Amount off entire bundle', fixedPriceTotal: 'Fixed price for entire bundle' },
  fr: { bundleAmountOff: 'Réduction sur l’ensemble', bundleFixedPrice: 'Prix fixe pour l’ensemble', amountOffTotal: 'Réduction sur l’ensemble', fixedPriceTotal: 'Prix fixe pour l’ensemble' },
  de: { bundleAmountOff: 'Rabatt auf das gesamte Set', bundleFixedPrice: 'Festpreis für das gesamte Set', amountOffTotal: 'Rabatt auf das gesamte Set', fixedPriceTotal: 'Festpreis für das gesamte Set' },
  es: { bundleAmountOff: 'Descuento en todo el lote', bundleFixedPrice: 'Precio fijo para todo el lote', amountOffTotal: 'Descuento en todo el lote', fixedPriceTotal: 'Precio fijo para todo el lote' },
  it: { bundleAmountOff: 'Sconto sull’intero set', bundleFixedPrice: 'Prezzo fisso per l’intero set', amountOffTotal: 'Sconto sull’intero set', fixedPriceTotal: 'Prezzo fisso per l’intero set' },
  nl: { bundleAmountOff: 'Korting op de hele bundel', bundleFixedPrice: 'Vaste prijs voor de hele bundel', amountOffTotal: 'Korting op de hele bundel', fixedPriceTotal: 'Vaste prijs voor de hele bundel' },
  sv: { bundleAmountOff: 'Rabatt på hela paketet', bundleFixedPrice: 'Fast pris för hela paketet', amountOffTotal: 'Rabatt på hela paketet', fixedPriceTotal: 'Fast pris för hela paketet' },
  tr: { bundleAmountOff: 'Tüm paket için indirim', bundleFixedPrice: 'Tüm paket için sabit fiyat', amountOffTotal: 'Tüm paket için indirim', fixedPriceTotal: 'Tüm paket için sabit fiyat' },
  'pt-BR': { bundleAmountOff: 'Desconto no pacote inteiro', bundleFixedPrice: 'Preço fixo para o pacote inteiro', amountOffTotal: 'Desconto no pacote inteiro', fixedPriceTotal: 'Preço fixo para o pacote inteiro' },
  'zh-Hans': { bundleAmountOff: '整单固定减免', bundleFixedPrice: '整单固定价格', amountOffTotal: '整单减免金额', fixedPriceTotal: '整单固定价格' },
  'zh-Hant': { bundleAmountOff: '整單固定減免', bundleFixedPrice: '整單固定價格', amountOffTotal: '整單減免金額', fixedPriceTotal: '整單固定價格' },
} as const;
const supplementalValues: Record<keyof typeof values, readonly string[]> = {
  en: ['Edit campaign','Campaign cannot be saved yet','Enter a campaign name.','Each tier needs a positive whole-number quantity.','Tier quantities must be unique.','Add at least one quantity tier.','End date must follow the start date.',
    'Product and collection selection requires a connected SHOPLINE catalog.','Check campaign coverage','Checking...','Campaign coverage conflict','Coverage cannot be verified','No conflicting campaign found','Product coverage must be verified before activation.',
    'Resolve or verify product coverage before saving.','Combination controls are locked','Specified market amounts cannot combine with other discounts.','Market amounts','Automatic conversion uses the store amount and current SHOPLINE exchange rate.','Loading store markets...',
    'Market amounts are unavailable.','No markets are configured for this store.','Currency unavailable','Disabled','Amount mode','Auto-convert store amount','Specify market amount','Market amount',
    'Specified amounts are unavailable when region and market currencies differ.','At 4 items, the 3-item tier applies to all 4 until the next tier starts at 5.','This is a preview. SHOPLINE is the final calculation authority.','Untitled campaign','Scope','Tiers','Recommended','Combination','None','on','off'],
  fr: ['Modifier la campagne','La campagne ne peut pas encore être enregistrée','Saisissez un nom de campagne.','Chaque palier exige une quantité entière positive.','Les quantités doivent être uniques.','Ajoutez au moins un palier.','La fin doit suivre le début.',
    'La sélection de produits exige un catalogue SHOPLINE connecté.','Vérifier les produits','Vérification...','Conflit de produits','Vérification impossible','Aucun conflit trouvé','Vérifiez les produits avant activation.',
    'Résolvez ou vérifiez les produits avant enregistrement.','Cumul verrouillé','Les montants de marché définis ne se cumulent pas.','Montants par marché','Conversion selon le montant boutique et le taux SHOPLINE actuel.','Chargement des marchés...',
    'Montants de marché indisponibles.','Aucun marché configuré.','Devise indisponible','Désactivé','Mode de montant','Convertir automatiquement','Définir le montant','Montant du marché',
    'Montant défini indisponible si les devises diffèrent.','Pour 4 articles, le palier de 3 s’applique aux 4 jusqu’au suivant.','Aperçu uniquement. SHOPLINE calcule la remise finale.','Campagne sans nom','Produits','Paliers','Recommandé','Cumul','Aucun','activé','désactivé'],
  de: ['Aktion bearbeiten','Aktion kann noch nicht gespeichert werden','Aktionsnamen eingeben.','Jede Staffel braucht eine positive ganze Menge.','Staffelmengen müssen eindeutig sein.','Mindestens eine Staffel hinzufügen.','Ende muss nach Beginn liegen.',
    'Produktauswahl erfordert einen verbundenen SHOPLINE-Katalog.','Produktabdeckung prüfen','Prüfung...','Produktkonflikt','Prüfung nicht möglich','Kein Konflikt gefunden','Produkte vor Aktivierung prüfen.',
    'Produktabdeckung vor dem Speichern klären.','Kombination gesperrt','Festgelegte Marktbeträge sind nicht kombinierbar.','Marktbeträge','Umrechnung mit Shop-Betrag und aktuellem SHOPLINE-Kurs.','Märkte werden geladen...',
    'Marktbeträge nicht verfügbar.','Keine Märkte konfiguriert.','Währung nicht verfügbar','Deaktiviert','Betragsmodus','Automatisch umrechnen','Marktbetrag festlegen','Marktbetrag',
    'Festbetrag bei abweichenden Währungen nicht verfügbar.','Bei 4 Artikeln gilt die 3er-Staffel für alle 4 bis zur nächsten Staffel.','Nur Vorschau. SHOPLINE berechnet den endgültigen Rabatt.','Unbenannte Aktion','Produkte','Staffeln','Empfohlen','Kombination','Keine','an','aus'],
  es: ['Editar campaña','La campaña aún no se puede guardar','Introduce un nombre de campaña.','Cada tramo necesita una cantidad entera positiva.','Las cantidades deben ser únicas.','Añade al menos un tramo.','La fecha final debe ser posterior al inicio.',
    'La selección requiere un catálogo SHOPLINE conectado.','Comprobar productos','Comprobando...','Conflicto de productos','No se puede comprobar','Sin conflictos','Verifica los productos antes de activar.',
    'Resuelve o verifica los productos antes de guardar.','Combinación bloqueada','Los importes por mercado no se combinan.','Importes por mercado','Conversión según importe de tienda y tipo SHOPLINE actual.','Cargando mercados...',
    'Importes no disponibles.','No hay mercados configurados.','Moneda no disponible','Desactivado','Modo de importe','Convertir automáticamente','Indicar importe','Importe del mercado',
    'Importe específico no disponible si cambian las monedas.','Con 4 artículos, el tramo de 3 se aplica a los 4 hasta el siguiente.','Solo vista previa. SHOPLINE calcula el descuento final.','Campaña sin nombre','Productos','Tramos','Recomendado','Combinación','Ninguno','sí','no'],
  it: ['Modifica campagna','La campagna non può ancora essere salvata','Inserisci un nome campagna.','Ogni fascia richiede una quantità intera positiva.','Le quantità devono essere uniche.','Aggiungi almeno una fascia.','La fine deve seguire l’inizio.',
    'La selezione richiede un catalogo SHOPLINE collegato.','Verifica prodotti','Verifica...','Conflitto prodotti','Verifica non disponibile','Nessun conflitto','Verifica i prodotti prima di attivare.',
    'Risolvi o verifica i prodotti prima di salvare.','Combinazione bloccata','Gli importi di mercato definiti non sono cumulabili.','Importi per mercato','Conversione con importo negozio e cambio SHOPLINE corrente.','Caricamento mercati...',
    'Importi non disponibili.','Nessun mercato configurato.','Valuta non disponibile','Disattivato','Modalità importo','Conversione automatica','Specifica importo','Importo mercato',
    'Importo definito non disponibile con valute diverse.','Con 4 articoli, la fascia da 3 si applica a tutti e 4 fino alla successiva.','Solo anteprima. SHOPLINE calcola lo sconto finale.','Campagna senza nome','Prodotti','Fasce','Consigliato','Combinazione','Nessuno','attivo','disattivo'],
  nl: ['Campagne bewerken','Campagne kan nog niet worden opgeslagen','Voer een campagnenaam in.','Elke staffel heeft een positief geheel aantal nodig.','Staffelaantallen moeten uniek zijn.','Voeg minstens één staffel toe.','Einddatum moet na de start liggen.',
    'Productselectie vereist een gekoppelde SHOPLINE-catalogus.','Productbereik controleren','Controleren...','Productconflict','Controle niet mogelijk','Geen conflict','Controleer producten vóór activering.',
    'Los productbereik op vóór opslaan.','Combinatie vergrendeld','Vaste marktbedragen zijn niet combineerbaar.','Marktbedragen','Omrekening met winkelbedrag en huidige SHOPLINE-koers.','Markten laden...',
    'Marktbedragen niet beschikbaar.','Geen markten ingesteld.','Valuta niet beschikbaar','Uitgeschakeld','Bedragmodus','Automatisch omrekenen','Marktbedrag instellen','Marktbedrag',
    'Vast bedrag niet mogelijk bij afwijkende valuta.','Bij 4 artikelen geldt de 3-staffel voor alle 4 tot de volgende staffel.','Alleen voorbeeld. SHOPLINE berekent de definitieve korting.','Campagne zonder naam','Producten','Staffels','Aanbevolen','Combinatie','Geen','aan','uit'],
  sv: ['Redigera kampanj','Kampanjen kan inte sparas än','Ange ett kampanjnamn.','Varje nivå kräver ett positivt heltal.','Nivåernas antal måste vara unika.','Lägg till minst en nivå.','Slutdatum måste vara efter start.',
    'Produktval kräver en ansluten SHOPLINE-katalog.','Kontrollera produkter','Kontrollerar...','Produktkonflikt','Kan inte kontrollera','Ingen konflikt','Kontrollera produkter före aktivering.',
    'Lös eller kontrollera produkturvalet före sparande.','Kombination låst','Angivna marknadsbelopp kan inte kombineras.','Marknadsbelopp','Omräkning med butiksbelopp och aktuell SHOPLINE-kurs.','Läser in marknader...',
    'Marknadsbelopp är inte tillgängliga.','Inga marknader konfigurerade.','Valuta saknas','Inaktiverad','Beloppsläge','Omräkna automatiskt','Ange belopp','Marknadsbelopp',
    'Angivet belopp saknas vid olika valutor.','Vid 4 varor gäller nivån för 3 på alla 4 fram till nästa nivå.','Endast förhandsvisning. SHOPLINE beräknar slutlig rabatt.','Namnlös kampanj','Produkter','Nivåer','Rekommenderad','Kombination','Ingen','på','av'],
  tr: ['Kampanyayı düzenle','Kampanya henüz kaydedilemiyor','Kampanya adı girin.','Her kademe pozitif tam sayı gerektirir.','Kademe adetleri benzersiz olmalıdır.','En az bir kademe ekleyin.','Bitiş tarihi başlangıçtan sonra olmalı.',
    'Ürün seçimi için bağlı SHOPLINE kataloğu gerekir.','Ürünleri kontrol et','Kontrol ediliyor...','Ürün çakışması','Kontrol edilemiyor','Çakışma yok','Etkinleştirmeden önce ürünleri doğrulayın.',
    'Kaydetmeden önce ürün kapsamını doğrulayın.','Birleştirme kilitli','Belirli pazar tutarları birleştirilemez.','Pazar tutarları','Mağaza tutarı ve güncel SHOPLINE kuruyla dönüşüm.','Pazarlar yükleniyor...',
    'Pazar tutarları kullanılamıyor.','Yapılandırılmış pazar yok.','Para birimi yok','Devre dışı','Tutar modu','Otomatik dönüştür','Pazar tutarı belirt','Pazar tutarı',
    'Farklı para birimlerinde belirli tutar kullanılamaz.','4 üründe 3’lü kademe sonraki kademeye kadar tüm 4 ürüne uygulanır.','Yalnızca önizleme. Nihai indirimi SHOPLINE hesaplar.','Adsız kampanya','Ürünler','Kademeler','Önerilen','Birleştirme','Yok','açık','kapalı'],
  'pt-BR': ['Editar campanha','A campanha ainda não pode ser salva','Informe um nome para a campanha.','Cada faixa precisa de uma quantidade inteira positiva.','As quantidades devem ser únicas.','Adicione ao menos uma faixa.','O fim deve ser após o início.',
    'A seleção exige um catálogo SHOPLINE conectado.','Verificar produtos','Verificando...','Conflito de produtos','Não foi possível verificar','Nenhum conflito','Verifique os produtos antes de ativar.',
    'Resolva ou verifique os produtos antes de salvar.','Combinação bloqueada','Valores específicos por mercado não podem ser combinados.','Valores por mercado','Conversão pelo valor da loja e câmbio SHOPLINE atual.','Carregando mercados...',
    'Valores indisponíveis.','Nenhum mercado configurado.','Moeda indisponível','Desativado','Modo de valor','Conversão automática','Definir valor','Valor do mercado',
    'Valor específico indisponível com moedas diferentes.','Com 4 itens, a faixa de 3 vale para todos os 4 até a próxima.','Só prévia. SHOPLINE calcula o desconto final.','Campanha sem nome','Produtos','Faixas','Recomendado','Combinação','Nenhum','ligado','desligado'],
  'zh-Hans': ['编辑活动','活动暂时无法保存','请输入活动名称。','每档数量必须为正整数。','档位数量不能重复。','请至少添加一个数量档位。','结束时间必须晚于开始时间。',
    '选择商品或分类需要先接入 SHOPLINE 商品目录。','检查商品覆盖范围','检查中...','商品范围冲突','暂时无法验证覆盖范围','未发现冲突','启用前需验证商品范围。',
    '保存前请解决或验证商品范围。','折扣叠加已锁定','指定市场金额不能与其他折扣叠加。','市场金额','自动换算使用店铺金额和 SHOPLINE 当前汇率。','正在加载店铺市场...',
    '市场金额暂不可用。','当前店铺未配置市场。','币种不可用','已停用','金额方式','按店铺金额自动换算','指定市场金额','市场金额',
    '地区与市场币种不一致时不能指定金额。','购买 4 件时，购买 3 件档位应用于全部 4 件，直到下一档从 5 件开始。','此处仅供预览，实际折扣以 SHOPLINE 结账计算为准。','未命名活动','商品范围','档位','推荐','叠加','无','开启','关闭'],
  'zh-Hant': ['編輯活動','活動暫時無法儲存','請輸入活動名稱。','每檔數量必須為正整數。','檔位數量不可重複。','請至少新增一個數量檔位。','結束時間必須晚於開始時間。',
    '選擇商品或分類需要先接入 SHOPLINE 商品目錄。','檢查商品涵蓋範圍','檢查中...','商品範圍衝突','暫時無法驗證涵蓋範圍','未發現衝突','啟用前須驗證商品範圍。',
    '儲存前請解決或驗證商品範圍。','折扣疊加已鎖定','指定市場金額不可與其他折扣疊加。','市場金額','自動換算使用商店金額和 SHOPLINE 目前匯率。','正在載入商店市場...',
    '市場金額暫不可用。','目前商店未設定市場。','幣別不可用','已停用','金額方式','按商店金額自動換算','指定市場金額','市場金額',
    '地區與市場幣別不同時無法指定金額。','購買 4 件時，購買 3 件檔位套用至全部 4 件，直到下一檔從 5 件開始。','此處僅供預覽，實際折扣以 SHOPLINE 結帳計算為準。','未命名活動','商品範圍','檔位','推薦','疊加','無','開啟','關閉'],
};

export const campaignEditorMessages = Object.fromEntries(Object.entries(values).map(([locale, translations]) => {
  if (translations.length !== keys.length) throw new Error(`Campaign editor translations are incomplete: ${locale}`);
  const extras = supplementalValues[locale as keyof typeof values];
  if (extras.length !== supplementalKeys.length) throw new Error(`Campaign editor translations are incomplete: ${locale} extras`);
  const details = detailValues[locale as keyof typeof values];
  if (details.length !== detailKeys.length) throw new Error(`Campaign editor translations are incomplete: ${locale} details`);
  return [locale, Object.fromEntries([...keys.map((key, index) => [key, key === 'endsAt' ? endsAtLabels[locale as keyof typeof values] : translations[index]]), ...supplementalKeys.map((key, index) => [key, extras[index]]), ...scheduleExtensionKeys.map((key, index) => [key, scheduleExtensionValues[locale as keyof typeof values][index]]), ...nameCoverageKeys.map((key) => [key, nameCoverageMessages[locale as keyof typeof values][key]]), ...styleExtensionKeys.map((key, index) => [key, styleExtensionValues[locale as keyof typeof values][index]]), ...detailKeys.map((key, index) => [key, details[index]]), ...splitTypeKeys.map((key, index) => [key, splitTypeValues[locale as keyof typeof values][index]]), ...summaryColorKeys.map((key, index) => [key, summaryColorValues[locale as keyof typeof values][index]]), ...tierActionKeys.map((key, index) => [key, tierActionValues[locale as keyof typeof values][index]]), ...tierDragKeys.map((key, index) => [key, tierDragValues[locale as keyof typeof values][index]]), ...styleRefinementKeys.map((key, index) => [key, styleRefinementValues[locale as keyof typeof values][index]]), ...statusStyleKeys.map((key, index) => [key, statusStyleValues[locale as keyof typeof values][index]])])];
})) as Record<keyof typeof values, Record<CampaignEditorMessageKey, string>>;

const addedLocaleCampaignMessages: Record<string, Partial<Record<CampaignEditorMessageKey, string>>> = {
  id: { styleLayout: 'Tata letak', styleCards: 'Kartu', styleColors: 'Warna', styleTypography: 'Tipografi', styleVariants: 'Varian', productScope: 'Cakupan produk', settings: 'Pengaturan', style: 'Gaya', allProducts: 'Semua produk', specificProducts: 'Produk tertentu', productCollections: 'Kategori produk', campaignName: 'Nama kampanye', startsAt: 'Mulai pada', endsAt: 'Berakhir pada (opsional)', otherProductDiscounts: 'Diskon produk lainnya', neverCombine: 'Jangan gabungkan', orderDiscounts: 'Diskon pesanan', shippingDiscounts: 'Diskon pengiriman', quantity: 'Jumlah', tierLabel: 'Nama tingkat', tierSubtitle: 'Subjudul', discountType: 'Jenis diskon', originalPrice: 'Harga asli', percentageOff: 'Diskon persentase', amountOff: 'Potongan per item', fixedPrice: 'Harga tetap per item', discountValue: 'Nilai diskon', badgeText: 'Teks lencana', defaultSelected: 'Dipilih secara default', addTier: 'Tambah tingkat', livePreview: 'Pratinjau storefront', productPageOffer: 'Penawaran halaman produk', updatesAsEdit: 'Diperbarui saat diedit', ruleSummary: 'Ringkasan aturan' },
  ja: { styleLayout: 'レイアウト', styleCards: 'カード', styleColors: 'カラー', styleTypography: 'タイポグラフィ', styleVariants: 'バリエーション', productScope: '商品範囲', settings: '設定', style: 'スタイル', allProducts: 'すべての商品', specificProducts: '指定商品', productCollections: '商品コレクション', campaignName: 'キャンペーン名', startsAt: '開始日時', endsAt: '終了日時（任意）', otherProductDiscounts: 'その他の商品割引', neverCombine: '組み合わせない', orderDiscounts: '注文割引', shippingDiscounts: '配送割引', quantity: '数量', tierLabel: 'ティア名', tierSubtitle: 'サブタイトル', discountType: '割引タイプ', originalPrice: '通常価格', percentageOff: '割合割引', amountOff: '商品ごとの減額', fixedPrice: '商品ごとの固定価格', discountValue: '割引値', badgeText: 'バッジ文言', defaultSelected: 'デフォルト選択', addTier: 'ティアを追加', livePreview: 'ストアフロントプレビュー', productPageOffer: '商品ページオファー', updatesAsEdit: '編集内容を即時反映', ruleSummary: 'ルール概要' },
  ms: { styleLayout: 'Susun atur', styleCards: 'Kad', styleColors: 'Warna', styleTypography: 'Tipografi', styleVariants: 'Varian', productScope: 'Skop produk', settings: 'Tetapan', style: 'Gaya', allProducts: 'Semua produk', specificProducts: 'Produk tertentu', productCollections: 'Koleksi produk', campaignName: 'Nama kempen', startsAt: 'Mula pada', endsAt: 'Tamat pada (pilihan)', otherProductDiscounts: 'Diskaun produk lain', neverCombine: 'Jangan gabungkan', orderDiscounts: 'Diskaun pesanan', shippingDiscounts: 'Diskaun penghantaran', quantity: 'Kuantiti', tierLabel: 'Nama tahap', tierSubtitle: 'Sari kata', discountType: 'Jenis diskaun', originalPrice: 'Harga asal', percentageOff: 'Diskaun peratus', amountOff: 'Potongan setiap item', fixedPrice: 'Harga tetap setiap item', discountValue: 'Nilai diskaun', badgeText: 'Teks lencana', defaultSelected: 'Dipilih secara lalai', addTier: 'Tambah tahap', livePreview: 'Pratonton storefront', productPageOffer: 'Tawaran halaman produk', updatesAsEdit: 'Dikemas kini semasa mengedit', ruleSummary: 'Ringkasan peraturan' },
  th: { styleLayout: 'เลย์เอาต์', styleCards: 'การ์ด', styleColors: 'สี', styleTypography: 'ตัวอักษร', styleVariants: 'ตัวเลือกสินค้า', productScope: 'ขอบเขตสินค้า', settings: 'การตั้งค่า', style: 'รูปแบบ', allProducts: 'สินค้าทั้งหมด', specificProducts: 'สินค้าที่ระบุ', productCollections: 'คอลเลกชันสินค้า', campaignName: 'ชื่อแคมเปญ', startsAt: 'เริ่มต้น', endsAt: 'สิ้นสุด (ไม่บังคับ)', otherProductDiscounts: 'ส่วนลดสินค้าอื่น', neverCombine: 'ไม่รวมส่วนลด', orderDiscounts: 'ส่วนลดคำสั่งซื้อ', shippingDiscounts: 'ส่วนลดค่าจัดส่ง', quantity: 'จำนวน', tierLabel: 'ชื่อระดับ', tierSubtitle: 'คำบรรยาย', discountType: 'ประเภทส่วนลด', originalPrice: 'ราคาเดิม', percentageOff: 'ส่วนลดเปอร์เซ็นต์', amountOff: 'ลดต่อรายการ', fixedPrice: 'ราคาคงที่ต่อรายการ', discountValue: 'ค่ส่วนลด', badgeText: 'ข้อความป้าย', defaultSelected: 'เลือกเป็นค่าเริ่มต้น', addTier: 'เพิ่มระดับ', livePreview: 'ตัวอย่างหน้าร้าน', productPageOffer: 'ข้อเสนอหน้าสินค้า', updatesAsEdit: 'อัปเดตขณะแก้ไข', ruleSummary: 'สรุปกฎ' },
  vi: { styleLayout: 'Bố cục', styleCards: 'Thẻ', styleColors: 'Màu sắc', styleTypography: 'Kiểu chữ', styleVariants: 'Biến thể', productScope: 'Phạm vi sản phẩm', settings: 'Cài đặt', style: 'Kiểu', allProducts: 'Tất cả sản phẩm', specificProducts: 'Sản phẩm cụ thể', productCollections: 'Bộ sưu tập sản phẩm', campaignName: 'Tên chiến dịch', startsAt: 'Bắt đầu lúc', endsAt: 'Kết thúc (không bắt buộc)', otherProductDiscounts: 'Ưu đãi sản phẩm khác', neverCombine: 'Không kết hợp', orderDiscounts: 'Ưu đãi đơn hàng', shippingDiscounts: 'Ưu đãi vận chuyển', quantity: 'Số lượng', tierLabel: 'Tên mức', tierSubtitle: 'Phụ đề', discountType: 'Loại ưu đãi', originalPrice: 'Giá gốc', percentageOff: 'Giảm theo phần trăm', amountOff: 'Giảm trên mỗi sản phẩm', fixedPrice: 'Giá cố định mỗi sản phẩm', discountValue: 'Giá trị ưu đãi', badgeText: 'Nội dung nhãn', defaultSelected: 'Chọn mặc định', addTier: 'Thêm mức', livePreview: 'Xem trước storefront', productPageOffer: 'Ưu đãi trang sản phẩm', updatesAsEdit: 'Cập nhật khi chỉnh sửa', ruleSummary: 'Tóm tắt quy tắc' },
};

const addedLocaleStyleMessages: Record<string, Partial<Record<CampaignEditorMessageKey, string>>> = {
  id: { styleLayoutstacked: 'Bertumpuk', styleLayouthorizontal: 'Horizontal', styleLayoutgrid: 'Kisi', styleLayoutlist: 'Daftar', styleCardRadius: 'Radius kartu', styleCardSpacing: 'Jarak kartu', styleColorGeneral: 'Umum', styleColorOffer: 'Teks penawaran', styleColorBadge: 'Lencana', styleColorcard: 'Latar kartu', styleColorselected: 'Latar terpilih', styleColorborder: 'Batas kartu', styleColorsectionTitle: 'Judul bagian', styleColortitle: 'Judul tingkat', styleColorsubtitle: 'Subjudul', styleColorprice: 'Harga', styleColorcomparePrice: 'Harga asli', styleColorbadgeBackground: 'Latar lencana', styleColorbadgeText: 'Teks lencana', styleBodySize: 'Ukuran teks', styleSize: 'Ukuran', styleWeight: 'Ketebalan', styleAllowMixed: 'Izinkan varian campuran', styleShowSelectors: 'Tampilkan pemilih varian', styleShowPrices: 'Tampilkan harga asli dan diskon', styleVariantDisplay: 'Tampilan varian', styleDropdown: 'Menu tarik-turun', styleImages: 'Gambar varian', styleText: 'Nilai teks', styleSwatches: 'Swatch warna', styleDefaultSelection: 'Pilihan default', styleFirstAvailable: 'Pertama yang tersedia', styleNoPreselection: 'Tanpa pilihan awal', styleImageSize: 'Ukuran gambar', styleImageRadius: 'Radius gambar', styleShowColorValue: 'Tampilkan nilai warna', nameRequired: 'Masukkan nama kampanye.', quantityRequired: 'Jumlah harus bilangan bulat positif.', tierRequired: 'Tambahkan setidaknya satu tingkat.' },
  ja: { styleLayoutstacked: '縦積み', styleLayouthorizontal: '横並び', styleLayoutgrid: 'グリッド', styleLayoutlist: 'リスト', styleCardRadius: 'カードの角丸', styleCardSpacing: 'カード間隔', styleColorGeneral: '全般', styleColorOffer: 'オファーテキスト', styleColorBadge: 'バッジ', styleColorcard: 'カード背景', styleColorselected: '選択時の背景', styleColorborder: 'カードの枠線', styleColorsectionTitle: 'セクションタイトル', styleColortitle: 'ティアタイトル', styleColorsubtitle: 'サブタイトル', styleColorprice: '価格', styleColorcomparePrice: '通常価格', styleColorbadgeBackground: 'バッジ背景', styleColorbadgeText: 'バッジ文字', styleBodySize: '本文サイズ', styleSize: 'サイズ', styleWeight: '太さ', styleAllowMixed: '異なるバリエーションを許可', styleShowSelectors: 'バリエーション選択を表示', styleShowPrices: '通常価格と割引価格を表示', styleVariantDisplay: 'バリエーション表示', styleDropdown: 'ドロップダウン', styleImages: 'バリエーション画像', styleText: 'テキスト値', styleSwatches: 'カラースウォッチ', styleDefaultSelection: 'デフォルト選択', styleFirstAvailable: '最初の在庫あり', styleNoPreselection: '事前選択なし', styleImageSize: '画像サイズ', styleImageRadius: '画像の角丸', styleShowColorValue: '画像下に色の値を表示', nameRequired: 'キャンペーン名を入力してください。', quantityRequired: '数量は正の整数で入力してください。', tierRequired: '少なくとも1つのティアを追加してください。' },
  ms: { styleLayoutstacked: 'Bertindan', styleLayouthorizontal: 'Mendatar', styleLayoutgrid: 'Grid', styleLayoutlist: 'Senarai', styleCardRadius: 'Jejari kad', styleCardSpacing: 'Jarak kad', styleColorGeneral: 'Umum', styleColorOffer: 'Teks tawaran', styleColorBadge: 'Lencana', styleColorcard: 'Latar kad', styleColorselected: 'Latar dipilih', styleColorborder: 'Sempadan kad', styleColorsectionTitle: 'Tajuk bahagian', styleColortitle: 'Tajuk tahap', styleColorsubtitle: 'Sari kata', styleColorprice: 'Harga', styleColorcomparePrice: 'Harga asal', styleColorbadgeBackground: 'Latar lencana', styleColorbadgeText: 'Teks lencana', styleBodySize: 'Saiz teks', styleSize: 'Saiz', styleWeight: 'Berat', styleAllowMixed: 'Benarkan varian bercampur', styleShowSelectors: 'Tunjukkan pemilih varian', styleShowPrices: 'Tunjukkan harga asal dan diskaun', styleVariantDisplay: 'Paparan varian', styleDropdown: 'Menu lungsur', styleImages: 'Imej varian', styleText: 'Nilai teks', styleSwatches: 'Sampel warna', styleDefaultSelection: 'Pilihan lalai', styleFirstAvailable: 'Pertama tersedia', styleNoPreselection: 'Tiada pilihan awal', styleImageSize: 'Saiz imej', styleImageRadius: 'Jejari imej', styleShowColorValue: 'Tunjukkan nilai warna', nameRequired: 'Masukkan nama kempen.', quantityRequired: 'Kuantiti mesti nombor bulat positif.', tierRequired: 'Tambah sekurang-kurangnya satu tahap.' },
  th: { styleLayoutstacked: 'เรียงซ้อน', styleLayouthorizontal: 'แนวนอน', styleLayoutgrid: 'ตาราง', styleLayoutlist: 'รายการ', styleCardRadius: 'ความโค้งการ์ด', styleCardSpacing: 'ระยะห่างการ์ด', styleColorGeneral: 'ทั่วไป', styleColorOffer: 'ข้อความข้อเสนอ', styleColorBadge: 'ป้ายกำกับ', styleColorcard: 'พื้นหลังการ์ด', styleColorselected: 'พื้นหลังที่เลือก', styleColorborder: 'เส้นขอบการ์ด', styleColorsectionTitle: 'ชื่อส่วน', styleColortitle: 'ชื่อระดับ', styleColorsubtitle: 'คำบรรยาย', styleColorprice: 'ราคา', styleColorcomparePrice: 'ราคาเดิม', styleColorbadgeBackground: 'พื้นหลังป้าย', styleColorbadgeText: 'ข้อความป้าย', styleBodySize: 'ขนาดข้อความ', styleSize: 'ขนาด', styleWeight: 'น้ำหนัก', styleAllowMixed: 'อนุญาตตัวเลือกสินค้าผสม', styleShowSelectors: 'แสดงตัวเลือกสินค้า', styleShowPrices: 'แสดงราคาเดิมและราคาลด', styleVariantDisplay: 'การแสดงตัวเลือกสินค้า', styleDropdown: 'เมนูแบบเลื่อนลง', styleImages: 'รูปภาพตัวเลือกสินค้า', styleText: 'ค่าข้อความ', styleSwatches: 'ตัวอย่างสี', styleDefaultSelection: 'การเลือกเริ่มต้น', styleFirstAvailable: 'รายการแรกที่มีสินค้า', styleNoPreselection: 'ไม่เลือกไว้ล่วงหน้า', styleImageSize: 'ขนาดรูปภาพ', styleImageRadius: 'ความโค้งรูปภาพ', styleShowColorValue: 'แสดงค่าสีใต้รูปภาพ', nameRequired: 'กรอกชื่อแคมเปญ', quantityRequired: 'จำนวนต้องเป็นจำนวนเต็มบวก', tierRequired: 'เพิ่มอย่างน้อยหนึ่งระดับ' },
  vi: { styleLayoutstacked: 'Xếp chồng', styleLayouthorizontal: 'Ngang', styleLayoutgrid: 'Lưới', styleLayoutlist: 'Danh sách', styleCardRadius: 'Bo góc thẻ', styleCardSpacing: 'Khoảng cách thẻ', styleColorGeneral: 'Chung', styleColorOffer: 'Nội dung ưu đãi', styleColorBadge: 'Nhãn', styleColorcard: 'Nền thẻ', styleColorselected: 'Nền đã chọn', styleColorborder: 'Viền thẻ', styleColorsectionTitle: 'Tiêu đề phần', styleColortitle: 'Tiêu đề mức', styleColorsubtitle: 'Phụ đề', styleColorprice: 'Giá', styleColorcomparePrice: 'Giá gốc', styleColorbadgeBackground: 'Nền nhãn', styleColorbadgeText: 'Chữ nhãn', styleBodySize: 'Cỡ chữ', styleSize: 'Kích thước', styleWeight: 'Độ đậm', styleAllowMixed: 'Cho phép biến thể kết hợp', styleShowSelectors: 'Hiện bộ chọn biến thể', styleShowPrices: 'Hiện giá gốc và giá giảm', styleVariantDisplay: 'Cách hiển thị biến thể', styleDropdown: 'Danh sách thả xuống', styleImages: 'Ảnh biến thể', styleText: 'Giá trị văn bản', styleSwatches: 'Mẫu màu', styleDefaultSelection: 'Lựa chọn mặc định', styleFirstAvailable: 'Biến thể còn hàng đầu tiên', styleNoPreselection: 'Không chọn trước', styleImageSize: 'Kích thước ảnh', styleImageRadius: 'Bo góc ảnh', styleShowColorValue: 'Hiện mã màu dưới ảnh', nameRequired: 'Nhập tên chiến dịch.', quantityRequired: 'Số lượng phải là số nguyên dương.', tierRequired: 'Thêm ít nhất một mức.' },
};
for (const [locale, messages] of Object.entries(addedLocaleStyleMessages)) Object.assign(addedLocaleCampaignMessages[locale], messages);

const addedLocaleNameCoverageMessages: Record<string, Partial<Record<CampaignEditorMessageKey, string>>> = {
  id: { internalName: 'Nama (hanya terlihat oleh Anda)', discountName: 'Nama diskon (ditampilkan di keranjang / checkout)', discountNameRequired: 'Masukkan nama diskon untuk keranjang dan checkout.', coverageConflictTitle: 'Konflik cakupan produk:', conflictActivityName: 'Nama aktivitas', conflictProductName: 'Nama produk' },
  ja: { internalName: '名前（自分だけに表示）', discountName: '割引名（カート / チェックアウトに表示）', discountNameRequired: 'カートとチェックアウト用の割引名を入力してください。', coverageConflictTitle: '商品範囲の競合：', conflictActivityName: 'キャンペーン名', conflictProductName: '商品名' },
  ms: { internalName: 'Nama (hanya kelihatan kepada anda)', discountName: 'Nama diskaun (dipaparkan dalam troli / pembayaran)', discountNameRequired: 'Masukkan nama diskaun untuk troli dan pembayaran.', coverageConflictTitle: 'Konflik liputan produk:', conflictActivityName: 'Nama aktiviti', conflictProductName: 'Nama produk' },
  th: { internalName: 'ชื่อ (เห็นได้เฉพาะคุณ)', discountName: 'ชื่อส่วนลด (แสดงในรถเข็น / ชำระเงิน)', discountNameRequired: 'กรอกชื่อส่วนลดสำหรับรถเข็นและการชำระเงิน', coverageConflictTitle: 'ขอบเขตสินค้าซ้ำกัน:', conflictActivityName: 'ชื่อกิจกรรม', conflictProductName: 'ชื่อสินค้า' },
  vi: { internalName: 'Tên (chỉ bạn nhìn thấy)', discountName: 'Tên giảm giá (hiển thị trong giỏ hàng / thanh toán)', discountNameRequired: 'Nhập tên giảm giá cho giỏ hàng và thanh toán.', coverageConflictTitle: 'Xung đột phạm vi sản phẩm:', conflictActivityName: 'Tên hoạt động', conflictProductName: 'Tên sản phẩm' },
};
for (const [locale, messages] of Object.entries(addedLocaleNameCoverageMessages)) Object.assign(addedLocaleCampaignMessages[locale], messages);

const addedLocaleMarketPreviewMessages: Record<string, Partial<Record<CampaignEditorMessageKey, string>>> = {
  id: { marketConversionUnavailable: 'Harga sebenarnya yang berlaku.' },
  ja: { marketConversionUnavailable: '実際の価格が適用されます。' },
  ms: { marketConversionUnavailable: 'Harga sebenar adalah muktamad.' },
  th: { marketConversionUnavailable: 'ใช้ราคาจริงเป็นหลัก' },
  vi: { marketConversionUnavailable: 'Áp dụng theo giá thực tế.' },
};
for (const [locale, messages] of Object.entries(addedLocaleMarketPreviewMessages)) Object.assign(addedLocaleCampaignMessages[locale], messages);

const productDiscountMessages: Record<keyof typeof values, string> = {
  en: 'Product discounts', fr: 'Remises produit', de: 'Produktrabatte', es: 'Descuentos de producto', it: 'Sconti prodotto', nl: 'Productkortingen', sv: 'Produktrabatter', tr: 'Ürün indirimleri', 'pt-BR': 'Descontos de produto', 'zh-Hans': '商品折扣', 'zh-Hant': '商品折扣',
};

const marketCombinationNoticeMessages: Record<keyof typeof values, string> = {
  en: 'Because these tiers use specified market amounts, they do not combine with the following store discounts in those markets: {{types}}.',
  fr: 'Comme ces paliers utilisent des montants spécifiques au marché, ils ne se cumulent pas avec les remises suivantes de la boutique sur ces marchés : {{types}}.',
  de: 'Da diese Staffeln feste Marktbeträge verwenden, sind sie in diesen Märkten nicht mit den folgenden Shop-Rabatten kombinierbar: {{types}}.',
  es: 'Como estos tramos usan importes específicos por mercado, no se combinan con los siguientes descuentos de la tienda en esos mercados: {{types}}.',
  it: 'Poiché queste fasce usano importi specifici per mercato, non sono cumulabili con i seguenti sconti del negozio in tali mercati: {{types}}.',
  nl: 'Omdat deze staffels vaste marktbedragen gebruiken, combineren ze in die markten niet met de volgende winkelkortingen: {{types}}.',
  sv: 'Eftersom dessa nivåer använder angivna marknadsbelopp kombineras de inte med följande butiksrabatter på dessa marknader: {{types}}.',
  tr: 'Bu kademeler belirli pazar tutarları kullandığından, bu pazarlarda mağazanın şu indirimleriyle birleştirilemez: {{types}}.',
  'pt-BR': 'Como estas faixas usam valores específicos por mercado, elas não se combinam com os seguintes descontos da loja nesses mercados: {{types}}.',
  'zh-Hans': '因当前档位设置了指定市场金额，以下档位在指定市场不与主站{{types}}叠加。',
  'zh-Hant': '因目前檔位設定了指定市場金額，以下檔位在指定市場不與主站{{types}}疊加。',
};

const previewMarketMessages: Record<keyof typeof values, Record<'specifiedMarket' | 'marketPriceLoading' | 'marketPriceUnavailable' | 'marketConversionUnavailable', string>> = {
  en: { specifiedMarket: 'Specified market', marketPriceLoading: 'Loading market prices…', marketPriceUnavailable: 'Market prices are unavailable.', marketConversionUnavailable: 'Actual price prevails.' },
  fr: { specifiedMarket: 'Marché sélectionné', marketPriceLoading: 'Chargement des prix du marché…', marketPriceUnavailable: 'Les prix du marché ne sont pas disponibles.', marketConversionUnavailable: 'Le prix réel prévaut.' },
  de: { specifiedMarket: 'Ausgewählter Markt', marketPriceLoading: 'Marktpreise werden geladen…', marketPriceUnavailable: 'Marktpreise sind nicht verfügbar.', marketConversionUnavailable: 'Der tatsächliche Preis gilt.' },
  es: { specifiedMarket: 'Mercado especificado', marketPriceLoading: 'Cargando precios del mercado…', marketPriceUnavailable: 'Los precios del mercado no están disponibles.', marketConversionUnavailable: 'Se aplica el precio real.' },
  it: { specifiedMarket: 'Mercato selezionato', marketPriceLoading: 'Caricamento prezzi di mercato…', marketPriceUnavailable: 'I prezzi di mercato non sono disponibili.', marketConversionUnavailable: 'Prevale il prezzo effettivo.' },
  nl: { specifiedMarket: 'Geselecteerde markt', marketPriceLoading: 'Marktprijzen laden…', marketPriceUnavailable: 'Marktprijzen zijn niet beschikbaar.', marketConversionUnavailable: 'De werkelijke prijs geldt.' },
  sv: { specifiedMarket: 'Angiven marknad', marketPriceLoading: 'Läser in marknadspriser…', marketPriceUnavailable: 'Marknadspriser är inte tillgängliga.', marketConversionUnavailable: 'Det faktiska priset gäller.' },
  tr: { specifiedMarket: 'Belirtilen pazar', marketPriceLoading: 'Pazar fiyatları yükleniyor…', marketPriceUnavailable: 'Pazar fiyatları kullanılamıyor.', marketConversionUnavailable: 'Geçerli olan gerçek fiyattır.' },
  'pt-BR': { specifiedMarket: 'Mercado especificado', marketPriceLoading: 'Carregando preços do mercado…', marketPriceUnavailable: 'Os preços do mercado não estão disponíveis.', marketConversionUnavailable: 'O preço real prevalece.' },
  'zh-Hans': { specifiedMarket: '指定市场', marketPriceLoading: '正在加载市场价格…', marketPriceUnavailable: '市场价格暂不可用。', marketConversionUnavailable: '以实际界面价格为准。' },
  'zh-Hant': { specifiedMarket: '指定市場', marketPriceLoading: '正在載入市場價格…', marketPriceUnavailable: '市場價格暫不可用。', marketConversionUnavailable: '以實際價格為準。' },
};

const previewCountryMessages: Record<string, string> = {
  en: 'Country / region', fr: 'Pays / région', de: 'Land / Region', es: 'País / región', it: 'Paese / regione', nl: 'Land / regio', sv: 'Land / region', tr: 'Ülke / bölge', 'pt-br': 'País / região', 'zh-hans': '预览国家/地区', 'zh-hant': '預覽國家/地區', id: 'Negara / wilayah', ja: '国 / 地域', ms: 'Negara / wilayah', th: 'ประเทศ / ภูมิภาค', vi: 'Quốc gia / khu vực',
};

export function campaignText(locale: string, key: CampaignEditorMessageKey, params: Record<string, string | number> = {}): string {
  if (key === 'previewCountry') return previewCountryMessages[locale.toLowerCase()] ?? previewCountryMessages.en;
  const override = styleLabelOverrides[locale.toLowerCase()]?.[key];
  if (override) return override;
  const exact = Object.keys(campaignEditorMessages).find((code) => code.toLowerCase() === locale.toLowerCase()) as keyof typeof values | undefined;
  const added = addedLocaleCampaignMessages[locale.toLowerCase()];
  const addedSchedule = addedScheduleMessages[locale.toLowerCase()];
  if (!exact && addedSchedule && (key === 'endsAt' || key === 'endRequired' || key === 'neverExpires')) return addedSchedule[key];
  if (!exact && added?.[key]) return added[key]!.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(params[name] ?? match));
  const language = exact ?? 'en';
  const value = key === 'startRequired' ? startRequiredMessages[language]
    : key in previewMarketMessages.en ? previewMarketMessages[language][key as keyof typeof previewMarketMessages.en]
    : key === 'collectionPriorityNotice' ? collectionPriorityNoticeMessages[language]
      : key === 'otherProductDiscounts' ? productDiscountMessages[language]
        : key === 'marketCombinationNotice' ? marketCombinationNoticeMessages[language]
          : key in bundleDiscountMessages.en ? bundleDiscountMessages[language][key as keyof typeof bundleDiscountMessages.en]
            : campaignEditorMessages[language][key];
  return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(params[name] ?? match));
}
