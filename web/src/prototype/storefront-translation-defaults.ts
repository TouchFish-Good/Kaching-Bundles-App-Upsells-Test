import { storefrontCopy, type StorefrontTranslations } from './storefront-copy';
import { resolveStorefrontLocale } from './storefront-locales';
import bg from '../../../theme-app-extension/i18n/bg.json';
import cs from '../../../theme-app-extension/i18n/cs.json';
import da from '../../../theme-app-extension/i18n/da.json';
import el from '../../../theme-app-extension/i18n/el.json';
import et from '../../../theme-app-extension/i18n/et.json';
import fi from '../../../theme-app-extension/i18n/fi.json';
import hi from '../../../theme-app-extension/i18n/hi.json';
import hr from '../../../theme-app-extension/i18n/hr.json';
import hu from '../../../theme-app-extension/i18n/hu.json';
import ko from '../../../theme-app-extension/i18n/ko.json';
import lt from '../../../theme-app-extension/i18n/lt.json';
import lv from '../../../theme-app-extension/i18n/lv.json';
import nb from '../../../theme-app-extension/i18n/nb.json';
import pl from '../../../theme-app-extension/i18n/pl.json';
import ptPt from '../../../theme-app-extension/i18n/pt-pt.json';
import ro from '../../../theme-app-extension/i18n/ro.json';
import ru from '../../../theme-app-extension/i18n/ru.json';
import sk from '../../../theme-app-extension/i18n/sk.json';
import sl from '../../../theme-app-extension/i18n/sl.json';

const defaults: Record<string, string[]> = {
  fr: [
    'Achetez plus et économisez', 'Choisissez une quantité, puis configurez chaque article.', 'Le palier le plus élevé s’applique à tous les articles',
    'Prix d’origine', 'Économies estimées', 'Total du lot', 'Ajouter {quantity} au panier · {price}', 'Ajout du lot...',
    'Impossible d’ajouter le lot. Vos choix ont été conservés pour réessayer.', '{quantity} articles ont été ajoutés sur {lines} lignes du panier.',
    '{item} : {quantity} sélectionné(s), {available} disponible(s).', 'Stock insuffisant pour cette quantité.', 'Épuisé', 'Couleur', 'Taille',
    'Les taxes et la remise finale sont calculées par SHOPLINE lors du paiement.',
  ],
  de: [
    'Mehr kaufen und sparen', 'Wähle eine Menge und konfiguriere dann jeden Artikel.', 'Die höchste Mengenstufe gilt für alle Artikel',
    'Originalpreis', 'Voraussichtliche Ersparnis', 'Gesamtpreis des Sets', '{quantity} zum Warenkorb hinzufügen · {price}', 'Set wird hinzugefügt...',
    'Das Set konnte nicht hinzugefügt werden. Deine Auswahl bleibt für einen erneuten Versuch erhalten.', '{quantity} Artikel wurden in {lines} Warenkorbpositionen hinzugefügt.',
    '{item}: {quantity} ausgewählt, {available} verfügbar.', 'Für diese Menge sind nicht genügend Varianten verfügbar.', 'Ausverkauft', 'Farbe', 'Größe',
    'Steuern und endgültiger Rabatt werden von SHOPLINE beim Checkout berechnet.',
  ],
  es: [
    'Compra más y ahorra', 'Elige una cantidad y configura cada artículo.', 'El nivel más alto se aplica a todos los artículos',
    'Precio original', 'Ahorro estimado', 'Total del lote', 'Añadir {quantity} al carrito · {price}', 'Añadiendo lote...',
    'No se pudo añadir el lote. Se conservaron tus selecciones para reintentarlo.', 'Se añadieron {quantity} artículos en {lines} líneas del carrito.',
    '{item}: {quantity} seleccionados, {available} disponibles.', 'No hay suficientes variantes disponibles para esta cantidad.', 'Agotado', 'Color', 'Talla',
    'SHOPLINE calcula los impuestos y el descuento final al finalizar la compra.',
  ],
  it: [
    'Acquista di più e risparmia', 'Scegli una quantità, poi configura ogni articolo.', 'Il livello più alto si applica a tutti gli articoli',
    'Prezzo originale', 'Risparmio stimato', 'Totale del bundle', 'Aggiungi {quantity} al carrello · {price}', 'Aggiunta del bundle...',
    'Impossibile aggiungere il bundle. Le selezioni sono state conservate per riprovare.', '{quantity} articoli aggiunti in {lines} righe del carrello.',
    '{item}: {quantity} selezionati, {available} disponibili.', 'Varianti disponibili insufficienti per questa quantità.', 'Esaurito', 'Colore', 'Taglia',
    'Tasse e sconto finale vengono calcolati da SHOPLINE al pagamento.',
  ],
  nl: [
    'Koop meer en bespaar', 'Kies een aantal en stel daarna elk artikel in.', 'De hoogste staffel geldt voor alle artikelen',
    'Oorspronkelijke prijs', 'Geschatte besparing', 'Bundeltotaal', 'Voeg {quantity} toe aan winkelwagen · {price}', 'Bundel wordt toegevoegd...',
    'Bundel toevoegen is mislukt. Je keuzes blijven bewaard om het opnieuw te proberen.', '{quantity} artikelen toegevoegd als {lines} winkelwagenregels.',
    '{item}: {quantity} geselecteerd, {available} beschikbaar.', 'Niet genoeg beschikbare varianten voor dit aantal.', 'Uitverkocht', 'Kleur', 'Maat',
    'SHOPLINE berekent belastingen en de definitieve korting bij het afrekenen.',
  ],
  sv: [
    'Köp fler och spara', 'Välj antal och ställ sedan in varje vara.', 'Den högsta nivån gäller för alla varor',
    'Ordinarie pris', 'Beräknad besparing', 'Paketpris', 'Lägg {quantity} i varukorgen · {price}', 'Lägger till paketet...',
    'Paketet kunde inte läggas till. Dina val har sparats så att du kan försöka igen.', '{quantity} varor lades till som {lines} rader i varukorgen.',
    '{item}: {quantity} valda, {available} tillgängliga.', 'Det finns inte tillräckligt många varianter för detta antal.', 'Slutsåld', 'Färg', 'Storlek',
    'Skatt och slutlig rabatt beräknas av SHOPLINE i kassan.',
  ],
  tr: [
    'Daha fazla al, tasarruf et', 'Bir adet seçin, ardından her ürünü yapılandırın.', 'En yüksek kademe tüm ürünlere uygulanır',
    'Orijinal fiyat', 'Tahmini tasarruf', 'Paket toplamı', '{quantity} ürünü sepete ekle · {price}', 'Paket ekleniyor...',
    'Paket eklenemedi. Tekrar denemeniz için seçimleriniz korundu.', '{quantity} ürün sepete {lines} satır olarak eklendi.',
    '{item}: {quantity} seçildi, {available} mevcut.', 'Bu adet için yeterli varyant yok.', 'Tükendi', 'Renk', 'Beden',
    'Vergiler ve son indirim ödeme sırasında SHOPLINE tarafından hesaplanır.',
  ],
  'pt-br': [
    'Compre mais e economize', 'Escolha uma quantidade e configure cada item.', 'A maior faixa se aplica a todos os itens',
    'Preço original', 'Economia estimada', 'Total do conjunto', 'Adicionar {quantity} ao carrinho · {price}', 'Adicionando conjunto...',
    'Não foi possível adicionar o conjunto. Suas escolhas foram mantidas para tentar novamente.', '{quantity} itens foram adicionados em {lines} linhas do carrinho.',
    '{item}: {quantity} selecionados, {available} disponíveis.', 'Não há variantes suficientes para essa quantidade.', 'Esgotado', 'Cor', 'Tamanho',
    'Os impostos e o desconto final são calculados pela SHOPLINE no checkout.',
  ],
  'zh-hans': [
    '多买多省', '选择购买数量，再为每件商品选择规格。', '所有商品均按最高档位享受优惠',
    '原价', '预计节省', '组合总价', '将 {quantity} 件商品加入购物车 · {price}', '正在加入购物车...',
    '无法加入购物车。已保留您的选择，请重试。', '已将 {quantity} 件商品作为 {lines} 条购物车商品加入。',
    '{item}：已选 {quantity} 件，仅剩 {available} 件。', '可用规格库存不足，无法购买此数量。', '已售罄', '颜色', '尺码',
    '税费和最终优惠金额由 SHOPLINE 在结账时计算。',
  ],
  'zh-hant': [
    '多買多省', '選擇購買數量，再為每件商品選擇規格。', '所有商品均按最高級距享有優惠',
    '原價', '預計節省', '組合總價', '將 {quantity} 件商品加入購物車 · {price}', '正在加入購物車...',
    '無法加入購物車。已保留您的選擇，請重試。', '已將 {quantity} 件商品作為 {lines} 筆購物車商品加入。',
    '{item}：已選 {quantity} 件，僅剩 {available} 件。', '可用規格庫存不足，無法購買此數量。', '已售罄', '顏色', '尺寸',
    '稅金和最終優惠金額由 SHOPLINE 在結帳時計算。',
  ],
  ar: [
    'اشترِ المزيد ووفر', 'اختر الكمية، ثم حدد خيارات كل منتج.', 'ينطبق أعلى مستوى خصم على جميع المنتجات',
    'السعر الأصلي', 'الوفورات المتوقعة', 'إجمالي الحزمة', 'أضف {quantity} إلى السلة · {price}', 'جارٍ إضافة الحزمة...',
    'تعذرت إضافة الحزمة. احتفظنا بخياراتك لتتمكن من المحاولة مرة أخرى.', 'تمت إضافة {quantity} منتجات ضمن {lines} عناصر في السلة.',
    '{item}: تم اختيار {quantity}، والمتاح {available}.', 'لا تتوفر خيارات كافية لهذه الكمية.', 'نفد المخزون', 'اللون', 'المقاس',
    'تحسب SHOPLINE الضرائب والخصم النهائي عند إتمام الشراء.',
  ],
  id: ['Beli lebih banyak dan hemat', 'Pilih jumlah, lalu atur setiap item.', 'Tingkat tertinggi berlaku untuk semua item', 'Harga asli', 'Perkiraan hemat', 'Total paket', 'Tambahkan {quantity} ke keranjang · {price}', 'Menambahkan paket...', 'Paket tidak dapat ditambahkan. Pilihan Anda disimpan untuk dicoba lagi.', '{quantity} item ditambahkan sebagai {lines} baris keranjang.', '{item}: {quantity} dipilih, {available} tersedia.', 'Varian yang tersedia tidak cukup untuk jumlah ini.', 'Habis', 'Warna', 'Ukuran', 'Pajak dan diskon akhir dihitung SHOPLINE saat checkout.'],
  ja: ['まとめ買いでお得', '数量を選び、各商品の内容を設定してください。', 'すべての商品に最高数量ティアが適用されます', '通常価格', '見積もり節約額', 'セット合計', '{quantity}個をカートに追加 · {price}', 'セットを追加中...', 'セットを追加できませんでした。選択内容は再試行のため保持されています。', '{quantity}個の商品を{lines}行のカートに追加しました。', '{item}：{quantity}個選択、在庫{available}個。', 'この数量に必要なバリエーションが不足しています。', '売り切れ', 'カラー', 'サイズ', '税金と最終割引はチェックアウト時にSHOPLINEが計算します。'],
  ms: ['Beli lebih banyak dan jimat', 'Pilih kuantiti, kemudian tetapkan setiap item.', 'Tahap tertinggi digunakan untuk semua item', 'Harga asal', 'Anggaran penjimatan', 'Jumlah pakej', 'Tambah {quantity} ke troli · {price}', 'Menambah pakej...', 'Pakej tidak dapat ditambah. Pilihan anda disimpan untuk cuba lagi.', '{quantity} item telah ditambah sebagai {lines} baris troli.', '{item}: {quantity} dipilih, {available} tersedia.', 'Varian yang tersedia tidak mencukupi untuk kuantiti ini.', 'Kehabisan stok', 'Warna', 'Saiz', 'Cukai dan diskaun akhir dikira oleh SHOPLINE semasa pembayaran.'],
  th: ['ซื้อเพิ่มประหยัดเพิ่ม', 'เลือกจำนวน แล้วกำหนดรายละเอียดของแต่ละรายการ', 'ใช้ระดับสูงสุดกับสินค้าทั้งหมด', 'ราคาเดิม', 'ยอดประหยัดโดยประมาณ', 'ราคารวมชุด', 'เพิ่ม {quantity} รายการลงรถเข็น · {price}', 'กำลังเพิ่มชุด...', 'ไม่สามารถเพิ่มชุดได้ ระบบเก็บตัวเลือกของคุณไว้ให้ลองอีกครั้ง', 'เพิ่มสินค้า {quantity} รายการเป็น {lines} รายการในรถเข็นแล้ว', '{item}: เลือก {quantity} รายการ มี {available} รายการ', 'ตัวเลือกสินค้าไม่เพียงพอสำหรับจำนวนนี้', 'สินค้าหมด', 'สี', 'ขนาด', 'SHOPLINE จะคำนวณภาษีและส่วนลดสุดท้ายเมื่อชำระเงิน'],
  vi: ['Mua nhiều, tiết kiệm hơn', 'Chọn số lượng, sau đó thiết lập từng sản phẩm.', 'Mức cao nhất áp dụng cho tất cả sản phẩm', 'Giá gốc', 'Khoản tiết kiệm ước tính', 'Tổng gói', 'Thêm {quantity} sản phẩm vào giỏ · {price}', 'Đang thêm gói...', 'Không thể thêm gói. Lựa chọn của bạn đã được giữ để thử lại.', 'Đã thêm {quantity} sản phẩm vào {lines} dòng giỏ hàng.', '{item}: đã chọn {quantity}, còn {available}.', 'Không đủ biến thể cho số lượng này.', 'Hết hàng', 'Màu sắc', 'Kích thước', 'SHOPLINE sẽ tính thuế và ưu đãi cuối cùng khi thanh toán.'],
};

const runtimeDefaults: Record<string, Record<string, string>> = {
  fr: { 'widget.calculated_at_checkout': 'Calculé au paiement', 'widget.choose_option': 'Choisissez une option', 'widget.item_option': 'Article {index} : {option}', 'widget.tier_items': '{quantity} articles', 'widget.cart_uncertain': 'Nous n’avons pas pu confirmer votre panier. Vérifiez-le avant de réessayer.' },
  de: { 'widget.calculated_at_checkout': 'Wird beim Checkout berechnet', 'widget.choose_option': 'Option auswählen', 'widget.item_option': 'Artikel {index}: {option}', 'widget.tier_items': '{quantity} Artikel', 'widget.cart_uncertain': 'Der Warenkorb konnte nicht bestätigt werden. Prüfe ihn vor dem nächsten Versuch.' },
  es: { 'widget.calculated_at_checkout': 'Se calcula al pagar', 'widget.choose_option': 'Elige una opción', 'widget.item_option': 'Artículo {index}: {option}', 'widget.tier_items': '{quantity} artículos', 'widget.cart_uncertain': 'No se pudo confirmar el carrito. Revísalo antes de intentarlo de nuevo.' },
  it: { 'widget.calculated_at_checkout': 'Calcolato al pagamento', 'widget.choose_option': 'Scegli un’opzione', 'widget.item_option': 'Articolo {index}: {option}', 'widget.tier_items': '{quantity} articoli', 'widget.cart_uncertain': 'Non abbiamo potuto confermare il carrello. Controllalo prima di riprovare.' },
  nl: { 'widget.calculated_at_checkout': 'Berekend bij afrekenen', 'widget.choose_option': 'Kies een optie', 'widget.item_option': 'Artikel {index}: {option}', 'widget.tier_items': '{quantity} artikelen', 'widget.cart_uncertain': 'We konden je winkelwagen niet bevestigen. Controleer hem voordat je opnieuw probeert.' },
  sv: { 'widget.calculated_at_checkout': 'Beräknas i kassan', 'widget.choose_option': 'Välj ett alternativ', 'widget.item_option': 'Artikel {index}: {option}', 'widget.tier_items': '{quantity} artiklar', 'widget.cart_uncertain': 'Vi kunde inte bekräfta din varukorg. Kontrollera den innan du försöker igen.' },
  tr: { 'widget.calculated_at_checkout': 'Ödemede hesaplanır', 'widget.choose_option': 'Bir seçenek belirleyin', 'widget.item_option': 'Ürün {index}: {option}', 'widget.tier_items': '{quantity} ürün', 'widget.cart_uncertain': 'Sepetiniz doğrulanamadı. Yeniden denemeden önce kontrol edin.' },
  'pt-br': { 'widget.calculated_at_checkout': 'Calculado no checkout', 'widget.choose_option': 'Escolha uma opção', 'widget.item_option': 'Produto {index}: {option}', 'widget.tier_items': '{quantity} itens', 'widget.cart_uncertain': 'Não foi possível confirmar seu carrinho. Verifique-o antes de tentar novamente.' },
  'zh-hans': { 'widget.calculated_at_checkout': '结账时计算', 'widget.choose_option': '请选择规格', 'widget.item_option': '第 {index} 件：{option}', 'widget.tier_items': '{quantity} 件商品', 'widget.cart_uncertain': '购物车状态暂未确认，请检查购物车后重试。' },
  'zh-hant': { 'widget.calculated_at_checkout': '結帳時計算', 'widget.choose_option': '請選擇規格', 'widget.item_option': '第 {index} 件：{option}', 'widget.tier_items': '{quantity} 件商品', 'widget.cart_uncertain': '購物車狀態暫未確認，請檢查購物車後再試。' },
  ar: { 'widget.calculated_at_checkout': 'يُحسب عند الدفع', 'widget.choose_option': 'اختر خيارًا', 'widget.item_option': 'العنصر {index}: {option}', 'widget.tier_items': '{quantity} عناصر', 'widget.cart_uncertain': 'تعذر تأكيد سلة التسوق. تحقق منها قبل المحاولة مرة أخرى.' },
  id: { 'widget.calculated_at_checkout': 'Dihitung saat checkout', 'widget.choose_option': 'Pilih opsi', 'widget.item_option': 'Produk {index}: {option}', 'widget.tier_items': '{quantity} item', 'widget.cart_uncertain': 'Keranjang tidak dapat dikonfirmasi. Periksa sebelum mencoba lagi.' },
  ja: { 'widget.calculated_at_checkout': 'チェックアウト時に計算', 'widget.choose_option': 'オプションを選択', 'widget.item_option': '商品{index}：{option}', 'widget.tier_items': '{quantity}個', 'widget.cart_uncertain': 'カートを確認できませんでした。再試行前に確認してください。' },
  ms: { 'widget.calculated_at_checkout': 'Dikira semasa pembayaran', 'widget.choose_option': 'Pilih pilihan', 'widget.item_option': 'Produk {index}: {option}', 'widget.tier_items': '{quantity} item', 'widget.cart_uncertain': 'Troli tidak dapat disahkan. Semak sebelum cuba lagi.' },
  th: { 'widget.calculated_at_checkout': 'คำนวณเมื่อชำระเงิน', 'widget.choose_option': 'เลือกตัวเลือก', 'widget.item_option': 'รายการที่ {index}: {option}', 'widget.tier_items': '{quantity} รายการ', 'widget.cart_uncertain': 'ยืนยันรถเข็นไม่ได้ โปรดตรวจสอบก่อนลองอีกครั้ง' },
  vi: { 'widget.calculated_at_checkout': 'Tính khi thanh toán', 'widget.choose_option': 'Chọn tùy chọn', 'widget.item_option': 'Sản phẩm {index}: {option}', 'widget.tier_items': '{quantity} sản phẩm', 'widget.cart_uncertain': 'Không thể xác nhận giỏ hàng. Hãy kiểm tra trước khi thử lại.' },
};

const tierSavingsBadgeDefaults: Record<string, string> = {
  fr: 'Économisez {saving_amount}', de: 'Spare {saving_amount}', es: 'Ahorra {saving_amount}', it: 'Risparmia {saving_amount}',
  nl: 'Bespaar {saving_amount}', sv: 'Spara {saving_amount}', tr: '{saving_amount} tasarruf edin', 'pt-br': 'Economize {saving_amount}',
  'zh-hans': '节省 {saving_amount}', 'zh-hant': '節省 {saving_amount}', ar: 'وفّر {saving_amount}', id: 'Hemat {saving_amount}',
  ja: '{saving_amount} お得', ms: 'Jimat {saving_amount}', th: 'ประหยัด {saving_amount}', vi: 'Tiết kiệm {saving_amount}',
  bg: 'Спестете {saving_amount}', cs: 'Ušetřete {saving_amount}', da: 'Spar {saving_amount}', el: 'Εξοικονομήστε {saving_amount}',
  et: 'Säästke {saving_amount}', fi: 'Säästä {saving_amount}', hi: '{saving_amount} बचाएं', hr: 'Uštedite {saving_amount}',
  hu: 'Takarítson meg {saving_amount}', ko: '{saving_amount} 절약', lt: 'Sutaupykite {saving_amount}', lv: 'Ietaupiet {saving_amount}',
  nb: 'Spar {saving_amount}', pl: 'Oszczędź {saving_amount}', 'pt-pt': 'Poupe {saving_amount}', ro: 'Economisiți {saving_amount}',
  ru: 'Сэкономьте {saving_amount}', sk: 'Ušetrite {saving_amount}', sl: 'Prihranite {saving_amount}',
};

const checkoutNoteDefaults: Record<string, string> = {
  bg: 'Данъците и крайната отстъпка се изчисляват от SHOPLINE при плащане.',
  cs: 'Daně a konečnou slevu vypočítá SHOPLINE při placení.',
  da: 'Skatter og den endelige rabat beregnes af SHOPLINE ved betaling.',
  el: 'Οι φόροι και η τελική έκπτωση υπολογίζονται από το SHOPLINE κατά την ολοκλήρωση της αγοράς.',
  et: 'Maksud ja lõpliku allahindluse arvutab SHOPLINE kassas.',
  fi: 'SHOPLINE laskee verot ja lopullisen alennuksen kassalla.',
  hi: 'कर और अंतिम छूट का हिसाब SHOPLINE चेकआउट पर करता है।',
  hr: 'Poreze i konačni popust SHOPLINE izračunava pri naplati.',
  hu: 'Az adókat és a végső kedvezményt a SHOPLINE a pénztárnál számítja ki.',
  ko: '세금 및 최종 할인은 결제 시 SHOPLINE에서 계산됩니다.',
  lt: 'Mokesčius ir galutinę nuolaidą atsiskaitymo metu apskaičiuoja SHOPLINE.',
  lv: 'Nodokļus un galīgo atlaidi norēķinoties aprēķina SHOPLINE.',
  nb: 'Skatter og endelig rabatt beregnes av SHOPLINE i kassen.',
  pl: 'Podatki i ostateczny rabat są obliczane przez SHOPLINE przy realizacji zamówienia.',
  'pt-pt': 'Os impostos e o desconto final são calculados pela SHOPLINE no checkout.',
  ro: 'Taxele și reducerea finală sunt calculate de SHOPLINE la finalizarea comenzii.',
  ru: 'Налоги и окончательная скидка рассчитываются SHOPLINE при оформлении заказа.',
  sk: 'Dane a konečnú zľavu vypočíta SHOPLINE pri pokladni.',
  sl: 'Davke in končni popust SHOPLINE izračuna ob zaključku nakupa.',
};

const themeWidgetDefaults = { bg, cs, da, el, et, fi, hi, hr, hu, ko, lt, lv, nb, pl, 'pt-pt': ptPt, ro, ru, sk, sl };

const defaultCopyOrder = [
  'widget.title', 'widget.description', 'widget.tier_rule', 'widget.original', 'widget.savings', 'widget.total',
  'widget.add_to_cart', 'widget.adding', 'widget.cart_failure', 'widget.cart_success', 'widget.stock_shortage',
  'widget.no_stock', 'widget.sold_out', 'widget.color', 'widget.size', 'widget.checkout_note',
];

function baseLocale(locale: string): string {
  const code = resolveStorefrontLocale(locale);
  if (code === 'zh-Hant') return 'zh-hant';
  if (code === 'zh-Hans') return 'zh-hans';
  if (code === 'pt-BR') return 'pt-br';
  return code.toLowerCase();
}

export function initialTranslationDraft(locale: string, saved: StorefrontTranslations): StorefrontTranslations {
  const localized = defaults[baseLocale(locale)];
  const resolvedLocale = baseLocale(locale);
  const extras = {
    'widget.tier_savings_badge': tierSavingsBadgeDefaults[resolvedLocale] ?? 'Save {saving_amount}',
    'widget.checkout_note': checkoutNoteDefaults[resolvedLocale],
    ...(runtimeDefaults[resolvedLocale] ?? {}),
  };
  const themeWidget = themeWidgetDefaults[resolvedLocale as keyof typeof themeWidgetDefaults]?.app_block.widget;
  const initial = Object.fromEntries(storefrontCopy.map((entry) => [
    entry.key,
    localized?.[defaultCopyOrder.indexOf(entry.key)] ?? extras[entry.key] ?? themeWidget?.[entry.key.replace('widget.', '')] ?? entry.source,
  ])) as StorefrontTranslations;
  return { ...initial, ...saved };
}
