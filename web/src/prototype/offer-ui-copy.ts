// New controls share the existing campaign style translations where possible.
const copy = {
  en: { viewVariants: 'View selected variants', custom: 'Custom', from: 'and higher', only: 'only', unknownPrice: 'Price unavailable', unknownStock: 'Availability unavailable', unsupportedMarket: 'Price preview is unavailable for this market', failed: 'Could not load product information', carousel: 'Carousel', bar: 'Bar' },
  'zh-Hans': { viewVariants: '查看已选择的款式', custom: '自定义', from: '及以上', only: '仅此档位', unknownPrice: '无法获取价格', unknownStock: '无法获取可售状态', unsupportedMarket: '当前市场暂不支持价格预览', failed: '商品信息加载失败', carousel: '轮播', bar: '档位' },
  'zh-Hant': { viewVariants: '查看已選擇的款式', custom: '自訂', from: '及以上', only: '僅此級距', unknownPrice: '無法取得價格', unknownStock: '無法取得可售狀態', unsupportedMarket: '目前市場暫不支援價格預覽', failed: '商品資訊載入失敗', carousel: '輪播', bar: '級距' },
  "fr": {"viewVariants": "Voir les variantes sélectionnées", "custom": "Personnalisé", "from": "et au-delà", "only": "uniquement", "unknownPrice": "Prix indisponible", "unknownStock": "Disponibilité inconnue", "unsupportedMarket": "Aperçu des prix indisponible pour ce marché", "failed": "Impossible de charger les informations produit", "carousel": "Carrousel", "bar": "Palier"},
  "de": {"viewVariants": "Ausgewählte Varianten anzeigen", "custom": "Benutzerdefiniert", "from": "und höher", "only": "nur", "unknownPrice": "Preis nicht verfügbar", "unknownStock": "Verfügbarkeit unbekannt", "unsupportedMarket": "Preisvorschau für diesen Markt nicht verfügbar", "failed": "Produktinformationen konnten nicht geladen werden", "carousel": "Karussell", "bar": "Stufe"},
  "es": {"viewVariants": "Ver variantes seleccionadas", "custom": "Personalizado", "from": "y superiores", "only": "solamente", "unknownPrice": "Precio no disponible", "unknownStock": "Disponibilidad desconocida", "unsupportedMarket": "Vista previa de precios no disponible para este mercado", "failed": "No se pudo cargar la información del producto", "carousel": "Carrusel", "bar": "Nivel"},
  "it": {"viewVariants": "Visualizza varianti selezionate", "custom": "Personalizzato", "from": "e superiori", "only": "soltanto", "unknownPrice": "Prezzo non disponibile", "unknownStock": "Disponibilità sconosciuta", "unsupportedMarket": "Anteprima prezzi non disponibile per questo mercato", "failed": "Impossibile caricare le informazioni sul prodotto", "carousel": "Carosello", "bar": "Livello"},
  "nl": {"viewVariants": "Geselecteerde varianten bekijken", "custom": "Aangepast", "from": "en hoger", "only": "alleen", "unknownPrice": "Prijs niet beschikbaar", "unknownStock": "Beschikbaarheid onbekend", "unsupportedMarket": "Prijsvoorbeeld niet beschikbaar voor deze markt", "failed": "Productinformatie kon niet worden geladen", "carousel": "Carrousel", "bar": "Niveau"},
  "sv": {"viewVariants": "Visa valda varianter", "custom": "Anpassat", "from": "och högre", "only": "endast", "unknownPrice": "Priset är inte tillgängligt", "unknownStock": "Tillgänglighet okänd", "unsupportedMarket": "Prisförhandsvisning saknas för denna marknad", "failed": "Kunde inte läsa in produktinformationen", "carousel": "Karusell", "bar": "Nivå"},
  "tr": {"viewVariants": "Seçilen varyantları görüntüle", "custom": "Özel", "from": "ve üzeri", "only": "yalnızca", "unknownPrice": "Fiyat mevcut değil", "unknownStock": "Stok durumu bilinmiyor", "unsupportedMarket": "Bu pazar için fiyat önizlemesi mevcut değil", "failed": "Ürün bilgileri yüklenemedi", "carousel": "Karusel", "bar": "Kademe"},
  "pt-br": {"viewVariants": "Ver variantes selecionadas", "custom": "Personalizado", "from": "e superiores", "only": "somente", "unknownPrice": "Preço indisponível", "unknownStock": "Disponibilidade desconhecida", "unsupportedMarket": "Prévia de preços indisponível para este mercado", "failed": "Não foi possível carregar as informações do produto", "carousel": "Carrossel", "bar": "Faixa"},
  "id": {"viewVariants": "Lihat varian yang dipilih", "custom": "Kustom", "from": "dan lebih tinggi", "only": "saja", "unknownPrice": "Harga tidak tersedia", "unknownStock": "Ketersediaan tidak diketahui", "unsupportedMarket": "Pratinjau harga tidak tersedia untuk pasar ini", "failed": "Informasi produk tidak dapat dimuat", "carousel": "Karusel", "bar": "Tingkat"},
  "ms": {"viewVariants": "Lihat varian yang dipilih", "custom": "Tersuai", "from": "dan ke atas", "only": "sahaja", "unknownPrice": "Harga tidak tersedia", "unknownStock": "Ketersediaan tidak diketahui", "unsupportedMarket": "Pratonton harga tidak tersedia untuk pasaran ini", "failed": "Maklumat produk tidak dapat dimuatkan", "carousel": "Karusel", "bar": "Tahap"},
  "th": {"viewVariants": "ดูตัวเลือกสินค้าที่เลือก", "custom": "กำหนดเอง", "from": "ขึ้นไป", "only": "เท่านั้น", "unknownPrice": "ไม่สามารถรับราคาได้", "unknownStock": "ไม่ทราบสถานะสินค้า", "unsupportedMarket": "ไม่รองรับตัวอย่างราคาในตลาดนี้", "failed": "ไม่สามารถโหลดข้อมูลสินค้าได้", "carousel": "ภาพหมุน", "bar": "ระดับ"},
  "vi": {"viewVariants": "Xem các biến thể đã chọn", "custom": "Tùy chỉnh", "from": "trở lên", "only": "chỉ", "unknownPrice": "Không có giá", "unknownStock": "Chưa rõ tình trạng hàng", "unsupportedMarket": "Không có bản xem trước giá cho thị trường này", "failed": "Không thể tải thông tin sản phẩm", "carousel": "Băng chuyền", "bar": "Bậc"},
  ja: { viewVariants: '選択したバリエーションを表示', custom: 'カスタム', from: '以上', only: 'のみ', unknownPrice: '価格を取得できません', unknownStock: '販売状況を取得できません', unsupportedMarket: 'このマーケットでは価格をプレビューできません', failed: '商品情報を読み込めません', carousel: 'カルーセル', bar: '段階' },
};
const productTitles: Record<string, string> = {
  en: 'Product title', fr: 'Titre du produit', de: 'Produkttitel', es: 'Título del producto', it: 'Titolo del prodotto', nl: 'Producttitel', sv: 'Produkttitel', tr: 'Ürün başlığı', 'pt-br': 'Título do produto',
  'zh-hans': '商品标题', 'zh-hant': '商品標題', ja: '商品タイトル', id: 'Judul produk', ms: 'Tajuk produk', th: 'ชื่อสินค้า', vi: 'Tiêu đề sản phẩm',
};
export function offerUiText(locale: string, key: keyof typeof copy.en | 'productTitle'): string {
  const language = locale.toLowerCase();
  if (key === 'productTitle') return productTitles[language] ?? productTitles[language === 'zh-tw' ? 'zh-hant' : language.startsWith('zh') ? 'zh-hans' : language.split('-')[0]] ?? productTitles.en;
  const normalized = (language.startsWith('zh-hant') || language === 'zh-tw' ? 'zh-Hant' : language.startsWith('zh') ? 'zh-Hans' : language.startsWith('pt') ? 'pt-br' : language.split('-')[0]) as keyof typeof copy;
  return (copy[normalized] ?? copy.en)[key];
}

const refinementCopy: Record<string, readonly string[]> = {
 en: ['Show savings amount', 'On border (top center)', 'Top right', 'Below product title'],
 'zh-hans': ['显示优惠金额', '边框上（边框正中间）', '右上角', '商品标题下面'],
 'zh-hant': ['顯示優惠金額', '邊框上（邊框正中間）', '右上角', '商品標題下方'],
 fr: ['Afficher le montant économisé', 'Sur la bordure (en haut au centre)', 'En haut à droite', 'Sous le titre du produit'],
 de: ['Ersparnis anzeigen', 'Auf dem Rand (oben mittig)', 'Oben rechts', 'Unter dem Produkttitel'],
 es: ['Mostrar importe ahorrado', 'En el borde (arriba centrado)', 'Arriba a la derecha', 'Debajo del título del producto'],
 it: ['Mostra importo risparmiato', 'Sul bordo (in alto al centro)', 'In alto a destra', 'Sotto il titolo del prodotto'],
 nl: ['Bespaard bedrag tonen', 'Op de rand (boven in het midden)', 'Rechtsboven', 'Onder de producttitel'],
 sv: ['Visa sparat belopp', 'På kanten (överst i mitten)', 'Överst till höger', 'Under produkttiteln'],
 tr: ['Tasarruf tutarını göster', 'Kenarlıkta (üst orta)', 'Sağ üst', 'Ürün başlığının altında'],
 'pt-br': ['Mostrar valor economizado', 'Na borda (centro superior)', 'Canto superior direito', 'Abaixo do título do produto'],
 ja: ['割引額を表示', '枠線上（上部中央）', '右上', '商品タイトルの下'],
 id: ['Tampilkan jumlah penghematan', 'Pada bingkai (atas tengah)', 'Kanan atas', 'Di bawah judul produk'],
 ms: ['Tunjukkan jumlah penjimatan', 'Pada bingkai (atas tengah)', 'Kanan atas', 'Di bawah tajuk produk'],
 th: ['แสดงจำนวนเงินที่ประหยัด', 'บนขอบ (ตรงกลางด้านบน)', 'มุมขวาบน', 'ใต้ชื่อสินค้า'],
 vi: ['Hiển thị số tiền tiết kiệm', 'Trên viền (giữa phía trên)', 'Góc trên bên phải', 'Bên dưới tiêu đề sản phẩm'],
};
export function offerRefinementText(locale: string, key: 'showSavings' | 'giftBorder' | 'bundleCorner' | 'belowTitle'): string {
 const lower = locale.toLowerCase();
 const language = lower.startsWith('zh-hant') || lower === 'zh-tw' ? 'zh-hant' : lower.startsWith('zh') ? 'zh-hans' : lower.startsWith('pt') ? 'pt-br' : lower.split('-')[0];
 return (refinementCopy[language] ?? refinementCopy.en)[['showSavings', 'giftBorder', 'bundleCorner', 'belowTitle'].indexOf(key)];
}

const priceTitles: Record<string, readonly [string, string]> = {
 en: ['Sale price', 'Original price'], 'zh-hans': ['折扣价', '原价'], 'zh-hant': ['折扣價', '原價'],
 fr: ['Prix réduit', 'Prix initial'], de: ['Angebotspreis', 'Originalpreis'], es: ['Precio rebajado', 'Precio original'],
 it: ['Prezzo scontato', 'Prezzo originale'], nl: ['Aanbiedingsprijs', 'Oorspronkelijke prijs'], sv: ['Rabattpris', 'Ordinarie pris'],
 tr: ['İndirimli fiyat', 'Orijinal fiyat'], 'pt-br': ['Preço promocional', 'Preço original'], ja: ['割引価格', '通常価格'],
 id: ['Harga diskon', 'Harga asli'], ms: ['Harga diskaun', 'Harga asal'], th: ['ราคาลด', 'ราคาเดิม'], vi: ['Giá giảm', 'Giá gốc'],
};
export function offerPriceTitle(locale: string, original = false): string {
 const lower = locale.toLowerCase();
 const language = lower.startsWith('zh-hant') || lower === 'zh-tw' ? 'zh-hant' : lower.startsWith('zh') ? 'zh-hans' : lower.startsWith('pt') ? 'pt-br' : lower.split('-')[0];
 return (priceTitles[language] ?? priceTitles.en)[original ? 1 : 0];
}
