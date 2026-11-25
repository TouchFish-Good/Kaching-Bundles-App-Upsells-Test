import { APP_LOCALES, APP_LOCALE_NAMES, type AdminLocale } from './admin-locale';

export const subscriptionLocales = APP_LOCALES;
export type SubscriptionLocale = AdminLocale;
export type SubscriptionMessageKey = 'title' | 'subtitle' | 'price' | 'trial' | 'subscribe' | 'renew' | 'loading' | 'checking' | 'verificationTimeout' | 'retryVerification' | 'subscribed' | 'grace' | 'reviewPending' | 'inactive' | 'error' | 'checkoutError' | 'reference' | 'retry' | 'backToApp';

const messages: Partial<Record<SubscriptionLocale, Partial<Record<Exclude<SubscriptionMessageKey, 'subscribed'>, string>>>> = {
  en: { title: 'Choose your Quantity Breaks plan', subtitle: 'Keep your campaigns and storefront widget active with Ultra.', price: 'USD 9.99 / month (every 30 days)', trial: 'Start free trial', subscribe: 'Subscribe now', renew: 'Renew now', loading: 'Checking subscription...', checking: 'We are verifying your payment with SHOPLINE.', verificationTimeout: 'SHOPLINE is taking longer than expected to confirm the subscription.', retryVerification: 'Check again', grace: 'Your subscription is in a grace period. Renew to keep campaigns active.', reviewPending: 'We are verifying your subscription. Editing is temporarily locked.', inactive: 'Your subscription is inactive. Renew to restore access.', error: 'We could not load your subscription.', checkoutError: 'Unable to create the SHOPLINE payment link.', reference: 'Request ID', retry: 'Try again', backToApp: 'Back to Quantity Breaks' },
  fr: { title: 'Choisissez votre forfait Quantity Breaks', subtitle: 'Gardez vos campagnes et votre widget actifs avec Ultra.', price: '9,99 USD / mois (tous les 30 jours)', trial: 'Commencer l’essai gratuit', subscribe: 'S’abonner maintenant', renew: 'Renouveler maintenant', loading: 'Vérification de l’abonnement...', checking: 'Nous vérifions votre paiement avec SHOPLINE.', grace: 'Votre abonnement est en période de grâce. Renouvelez-le pour garder vos campagnes actives.', reviewPending: 'Nous vérifions votre abonnement. La modification est temporairement verrouillée.', inactive: 'Votre abonnement est inactif. Renouvelez-le pour rétablir l’accès.', error: 'Impossible de charger votre abonnement.', checkoutError: 'Impossible de créer le lien de paiement SHOPLINE.', reference: 'ID de demande', retry: 'Réessayer', backToApp: 'Retour à Quantity Breaks' },
  de: { title: 'Wählen Sie Ihren Quantity-Breaks-Tarif', subtitle: 'Halten Sie Kampagnen und Widget mit Ultra aktiv.', price: '9,99 USD / Monat (alle 30 Tage)', trial: 'Kostenlose Testversion starten', subscribe: 'Jetzt abonnieren', renew: 'Jetzt verlängern', loading: 'Abonnement wird geprüft...', checking: 'Wir prüfen Ihre Zahlung bei SHOPLINE.', grace: 'Ihr Abonnement befindet sich in der Kulanzphase. Verlängern Sie es, damit Kampagnen aktiv bleiben.', reviewPending: 'Ihr Abonnement wird geprüft. Bearbeitungen sind vorübergehend gesperrt.', inactive: 'Ihr Abonnement ist inaktiv. Verlängern Sie es, um den Zugriff wiederherzustellen.', error: 'Abonnement konnte nicht geladen werden.', checkoutError: 'SHOPLINE-Zahlungslink konnte nicht erstellt werden.', reference: 'Anfrage-ID', retry: 'Erneut versuchen', backToApp: 'Zurück zu Quantity Breaks' },
  es: { title: 'Elige tu plan de Quantity Breaks', subtitle: 'Mantén activas tus campañas y tu widget con Ultra.', price: '9,99 USD / mes (cada 30 días)', trial: 'Iniciar prueba gratuita', subscribe: 'Suscribirse ahora', renew: 'Renovar ahora', loading: 'Comprobando suscripción...', checking: 'Estamos verificando tu pago con SHOPLINE.', grace: 'Tu suscripción está en periodo de gracia. Renueva para mantener activas las campañas.', reviewPending: 'Estamos verificando tu suscripción. La edición está bloqueada temporalmente.', inactive: 'Tu suscripción está inactiva. Renueva para recuperar el acceso.', error: 'No se pudo cargar tu suscripción.', checkoutError: 'No se pudo crear el enlace de pago de SHOPLINE.', reference: 'ID de solicitud', retry: 'Reintentar', backToApp: 'Volver a Quantity Breaks' },
  it: { title: 'Scegli il piano Quantity Breaks', subtitle: 'Mantieni attive campagne e widget con Ultra.', price: '9,99 USD / mese (ogni 30 giorni)', trial: 'Inizia la prova gratuita', subscribe: 'Abbonati ora', renew: 'Rinnova ora', loading: 'Verifica dell’abbonamento...', checking: 'Stiamo verificando il pagamento con SHOPLINE.', grace: 'Il tuo abbonamento è nel periodo di tolleranza. Rinnova per mantenere attive le campagne.', reviewPending: 'Stiamo verificando il tuo abbonamento. Le modifiche sono temporaneamente bloccate.', inactive: 'Il tuo abbonamento è inattivo. Rinnova per ripristinare l’accesso.', error: 'Impossibile caricare l’abbonamento.', checkoutError: 'Impossibile creare il link di pagamento SHOPLINE.', reference: 'ID richiesta', retry: 'Riprova', backToApp: 'Torna a Quantity Breaks' },
  nl: { title: 'Kies je Quantity Breaks-abonnement', subtitle: 'Houd campagnes en widget actief met Ultra.', price: 'USD 9,99 / maand (elke 30 dagen)', trial: 'Gratis proefperiode starten', subscribe: 'Nu abonneren', renew: 'Nu verlengen', loading: 'Abonnement controleren...', checking: 'We controleren je betaling bij SHOPLINE.', grace: 'Je abonnement zit in de respijtperiode. Verleng om campagnes actief te houden.', reviewPending: 'We controleren je abonnement. Bewerken is tijdelijk vergrendeld.', inactive: 'Je abonnement is inactief. Verleng om toegang te herstellen.', error: 'Abonnement kon niet worden geladen.', checkoutError: 'De SHOPLINE-betaallink kon niet worden gemaakt.', reference: 'Aanvraag-ID', retry: 'Opnieuw proberen', backToApp: 'Terug naar Quantity Breaks' },
  sv: { title: 'Välj din Quantity Breaks-plan', subtitle: 'Håll kampanjer och widget aktiva med Ultra.', price: '9,99 USD / månad (var 30:e dag)', trial: 'Starta kostnadsfri provperiod', subscribe: 'Prenumerera nu', renew: 'Förnya nu', loading: 'Kontrollerar prenumeration...', checking: 'Vi verifierar din betalning med SHOPLINE.', grace: 'Din prenumeration är i respitperiod. Förnya för att hålla kampanjer aktiva.', reviewPending: 'Vi verifierar din prenumeration. Redigering är tillfälligt låst.', inactive: 'Din prenumeration är inaktiv. Förnya för att återställa åtkomsten.', error: 'Det gick inte att läsa prenumerationen.', checkoutError: 'Kunde inte skapa SHOPLINE-betalningslänken.', reference: 'Begärande-ID', retry: 'Försök igen', backToApp: 'Tillbaka till Quantity Breaks' },
  tr: { title: 'Quantity Breaks planınızı seçin', subtitle: 'Ultra ile kampanyalarınızı ve widgetınızı aktif tutun.', price: 'Ayda 9,99 USD (her 30 günde bir)', trial: 'Ücretsiz denemeyi başlat', subscribe: 'Şimdi abone ol', renew: 'Şimdi yenile', loading: 'Abonelik kontrol ediliyor...', checking: 'SHOPLINE ödemenizi doğruluyoruz.', grace: 'Aboneliğiniz hoşgörü döneminde. Kampanyaları aktif tutmak için yenileyin.', reviewPending: 'Aboneliğinizi doğruluyoruz. Düzenleme geçici olarak kilitli.', inactive: 'Aboneliğiniz etkin değil. Erişimi geri almak için yenileyin.', error: 'Abonelik yüklenemedi.', checkoutError: 'SHOPLINE ödeme bağlantısı oluşturulamadı.', reference: 'İstek kimliği', retry: 'Tekrar dene', backToApp: 'Quantity Breaks’e dön' },
  'pt-BR': { title: 'Escolha seu plano de Quantity Breaks', subtitle: 'Mantenha campanhas e widget ativos com o Ultra.', price: 'US$ 9,99 / mês (a cada 30 dias)', trial: 'Começar teste grátis', subscribe: 'Assinar agora', renew: 'Renovar agora', loading: 'Verificando assinatura...', checking: 'Estamos verificando seu pagamento com a SHOPLINE.', grace: 'Sua assinatura está no período de carência. Renove para manter as campanhas ativas.', reviewPending: 'Estamos verificando sua assinatura. A edição está temporariamente bloqueada.', inactive: 'Sua assinatura está inativa. Renove para restaurar o acesso.', error: 'Não foi possível carregar sua assinatura.', checkoutError: 'Não foi possível criar o link de pagamento da SHOPLINE.', reference: 'ID da solicitação', retry: 'Tentar novamente', backToApp: 'Voltar para Quantity Breaks' },
  'zh-Hans': { title: '选择 Quantity Breaks 套餐', subtitle: '使用 Ultra 保持活动和商品页组件正常生效。', price: 'USD 9.99 / 月（每 30 天）', trial: '开始试用', subscribe: '立即订阅', renew: '立即续费', loading: '正在核验订阅...', checking: '正在通过 SHOPLINE 核验支付结果。', verificationTimeout: 'SHOPLINE 核验订阅时间较长，请稍后重试。', retryVerification: '重新检查', grace: '当前处于宽恕期。请续费以保持活动生效。', reviewPending: '正在核验订阅，编辑功能暂时锁定。', inactive: '订阅已失效，请续费恢复权益。', error: '无法加载订阅状态。', checkoutError: '无法创建 SHOPLINE 付款链接。', reference: '请求编号', retry: '重试', backToApp: '返回多件优惠' },
  'zh-Hant': { title: '選擇 Quantity Breaks 方案', subtitle: '使用 Ultra，保持活動和商品頁元件正常生效。', price: 'USD 9.99 / 月（每 30 天）', trial: '開始試用', subscribe: '立即訂閱', renew: '立即續費', loading: '正在核驗訂閱...', checking: '正在透過 SHOPLINE 核驗付款結果。', verificationTimeout: 'SHOPLINE 核驗訂閱時間較長，請稍後重試。', retryVerification: '重新檢查', grace: '目前處於寬限期。請續費以保持活動生效。', reviewPending: '正在核驗訂閱，編輯功能暫時鎖定。', inactive: '訂閱已失效，請續費恢復權益。', error: '無法載入訂閱狀態。', checkoutError: '無法建立 SHOPLINE 付款連結。', reference: '請求編號', retry: '重試', backToApp: '返回多件優惠' },
};

const addedSubscriptionMessages: Record<Exclude<SubscriptionLocale, 'en' | 'fr' | 'de' | 'es' | 'it' | 'nl' | 'sv' | 'tr' | 'pt-BR' | 'zh-Hans' | 'zh-Hant'>, Partial<Record<Exclude<SubscriptionMessageKey, 'subscribed'>, string>>> = {
  id: { title: 'Pilih paket Diskon Bertingkat', subtitle: 'Jaga kampanye dan widget storefront tetap aktif dengan Ultra.', price: 'USD 9,99 / bulan (setiap 30 hari)', trial: 'Mulai uji coba gratis', subscribe: 'Berlangganan sekarang', renew: 'Perbarui sekarang', loading: 'Memeriksa langganan...', checking: 'Kami memverifikasi pembayaran Anda dengan SHOPLINE.', verificationTimeout: 'Konfirmasi SHOPLINE memakan waktu lebih lama dari biasanya.', retryVerification: 'Periksa lagi', grace: 'Langganan Anda berada dalam masa tenggang. Perbarui untuk menjaga kampanye tetap aktif.', reviewPending: 'Kami sedang memverifikasi langganan Anda. Pengeditan dikunci sementara.', inactive: 'Langganan Anda tidak aktif. Perbarui untuk memulihkan akses.', error: 'Langganan tidak dapat dimuat.', checkoutError: 'Tautan pembayaran SHOPLINE tidak dapat dibuat.', reference: 'ID permintaan', retry: 'Coba lagi', backToApp: 'Kembali ke Diskon Bertingkat' },
  ja: { title: '数量割引プランを選択', subtitle: 'Ultraでキャンペーンとストアフロントウィジェットを有効に保ちます。', price: 'USD 9.99 / 月（30日ごと）', trial: '無料トライアルを開始', subscribe: '今すぐ購読', renew: '今すぐ更新', loading: '購読を確認中...', checking: 'SHOPLINEで支払いを確認しています。', verificationTimeout: 'SHOPLINEの確認に通常より時間がかかっています。', retryVerification: '再確認', grace: '購読は猶予期間中です。キャンペーンを維持するには更新してください。', reviewPending: '購読を確認しています。編集は一時的にロックされています。', inactive: '購読は無効です。更新してアクセスを復元してください。', error: '購読を読み込めませんでした。', checkoutError: 'SHOPLINE決済リンクを作成できませんでした。', reference: 'リクエストID', retry: '再試行', backToApp: '数量割引に戻る' },
  ms: { title: 'Pilih pelan Diskaun Kuantiti', subtitle: 'Kekalkan kempen dan widget storefront aktif dengan Ultra.', price: 'USD 9.99 / bulan (setiap 30 hari)', trial: 'Mulakan percubaan percuma', subscribe: 'Langgan sekarang', renew: 'Perbaharui sekarang', loading: 'Menyemak langganan...', checking: 'Kami sedang mengesahkan bayaran anda dengan SHOPLINE.', verificationTimeout: 'Pengesahan SHOPLINE mengambil masa lebih lama daripada biasa.', retryVerification: 'Semak semula', grace: 'Langganan anda dalam tempoh ihsan. Perbaharui untuk mengekalkan kempen aktif.', reviewPending: 'Kami sedang mengesahkan langganan anda. Penyuntingan dikunci sementara.', inactive: 'Langganan anda tidak aktif. Perbaharui untuk memulihkan akses.', error: 'Langganan tidak dapat dimuatkan.', checkoutError: 'Pautan pembayaran SHOPLINE tidak dapat dibuat.', reference: 'ID permintaan', retry: 'Cuba lagi', backToApp: 'Kembali ke Diskaun Kuantiti' },
  th: { title: 'เลือกแพ็กเกจส่วนลดตามจำนวน', subtitle: 'ให้แคมเปญและวิดเจ็ตหน้าร้านทำงานต่อด้วย Ultra', price: 'USD 9.99 / เดือน (ทุก 30 วัน)', trial: 'เริ่มทดลองใช้ฟรี', subscribe: 'สมัครสมาชิกตอนนี้', renew: 'ต่ออายุตอนนี้', loading: 'กำลังตรวจสอบการสมัครสมาชิก...', checking: 'กำลังตรวจสอบการชำระเงินกับ SHOPLINE', verificationTimeout: 'SHOPLINE ใช้เวลายืนยันนานกว่าปกติ', retryVerification: 'ตรวจสอบอีกครั้ง', grace: 'การสมัครสมาชิกอยู่ในช่วงผ่อนผัน ต่ออายุเพื่อให้แคมเปญทำงานต่อ', reviewPending: 'กำลังตรวจสอบการสมัครสมาชิก การแก้ไขถูกล็อกชั่วคราว', inactive: 'การสมัครสมาชิกไม่ใช้งาน ต่ออายุเพื่อคืนสิทธิ์', error: 'โหลดการสมัครสมาชิกไม่ได้', checkoutError: 'สร้างลิงก์ชำระเงิน SHOPLINE ไม่ได้', reference: 'รหัสคำขอ', retry: 'ลองอีกครั้ง', backToApp: 'กลับไปที่ส่วนลดตามจำนวน' },
  vi: { title: 'Chọn gói Ưu đãi theo số lượng', subtitle: 'Giữ chiến dịch và widget storefront hoạt động với Ultra.', price: 'USD 9,99 / tháng (mỗi 30 ngày)', trial: 'Bắt đầu dùng thử miễn phí', subscribe: 'Đăng ký ngay', renew: 'Gia hạn ngay', loading: 'Đang kiểm tra gói đăng ký...', checking: 'Đang xác minh thanh toán với SHOPLINE.', verificationTimeout: 'SHOPLINE mất nhiều thời gian hơn dự kiến để xác nhận gói đăng ký.', retryVerification: 'Kiểm tra lại', grace: 'Gói đăng ký đang trong thời gian gia hạn. Hãy gia hạn để giữ chiến dịch hoạt động.', reviewPending: 'Đang xác minh gói đăng ký. Tạm thời không thể chỉnh sửa.', inactive: 'Gói đăng ký không hoạt động. Hãy gia hạn để khôi phục quyền truy cập.', error: 'Không thể tải gói đăng ký.', checkoutError: 'Không thể tạo liên kết thanh toán SHOPLINE.', reference: 'Mã yêu cầu', retry: 'Thử lại', backToApp: 'Quay lại Ưu đãi theo số lượng' },
};
Object.assign(messages, addedSubscriptionMessages);

const subscribedMessages: Partial<Record<SubscriptionLocale, string>> = {
  en: 'Your Ultra subscription is active.',
  fr: 'Votre abonnement Ultra est actif.',
  de: 'Ihr Ultra-Abonnement ist aktiv.',
  es: 'Tu suscripción Ultra está activa.',
  it: 'Il tuo abbonamento Ultra è attivo.',
  nl: 'Je Ultra-abonnement is actief.',
  sv: 'Din Ultra-prenumeration är aktiv.',
  tr: 'Ultra aboneliğiniz etkin.',
  'pt-BR': 'Sua assinatura Ultra está ativa.',
  'zh-Hans': '您的 Ultra 订阅已生效。',
  'zh-Hant': '您的 Ultra 訂閱已生效。',
};
Object.assign(subscribedMessages, { id: 'Gói Ultra của bạn đang hoạt động.', ja: 'Ultraの購読は有効です。', ms: 'Langganan Ultra anda aktif.', th: 'การสมัครสมาชิก Ultra ของคุณใช้งานอยู่', vi: 'Gói Ultra của bạn đang hoạt động.' });

type SubscriptionPlanUi = { appName: string; pageTitle: string; languageLabel: string; trialBadge: string; trialAction: string; supportLabel: string; billingPrice: string; billingCycle: string };

const planUi: Partial<Record<SubscriptionLocale, SubscriptionPlanUi>> = {
  en: { appName: 'Multi-item discount', pageTitle: 'App plan', languageLabel: 'App language', trialBadge: 'Trial active', trialAction: 'First-time users can try the app free for 7 days. Click the subscription button below to select the trial.', supportLabel: 'Questions? Contact us anytime:', billingPrice: '$9.99', billingCycle: 'Every 30 days' },
  fr: { appName: 'Remise multi-articles', pageTitle: 'Forfait de l’application', languageLabel: 'Langue de l’application', trialBadge: 'Essai en cours', trialAction: 'Les nouveaux utilisateurs peuvent essayer l’application gratuitement pendant 7 jours. Cliquez sur le bouton d’abonnement ci-dessous pour choisir l’essai.', supportLabel: 'Des questions ? Contactez-nous à tout moment :', billingPrice: '$9.99', billingCycle: 'Tous les 30 jours' },
  de: { appName: 'Mehrartikel-Rabatt', pageTitle: 'App-Tarif', languageLabel: 'App-Sprache', trialBadge: 'Testphase aktiv', trialAction: 'Neue Nutzer können die App 7 Tage kostenlos testen. Klicken Sie unten auf die Abo-Schaltfläche, um die Testphase auszuwählen.', supportLabel: 'Fragen? Kontaktieren Sie uns jederzeit:', billingPrice: '$9.99', billingCycle: 'Alle 30 Tage' },
  es: { appName: 'Descuento por varios artículos', pageTitle: 'Plan de la aplicación', languageLabel: 'Idioma de la aplicación', trialBadge: 'Prueba activa', trialAction: 'Los nuevos usuarios pueden probar la aplicación gratis durante 7 días. Haz clic en el botón de suscripción de abajo para seleccionar la prueba.', supportLabel: '¿Tienes preguntas? Contáctanos cuando quieras:', billingPrice: '$9.99', billingCycle: 'Cada 30 días' },
  it: { appName: 'Sconto multi-articolo', pageTitle: 'Piano dell’app', languageLabel: 'Lingua dell’app', trialBadge: 'Prova attiva', trialAction: 'I nuovi utenti possono provare l’app gratis per 7 giorni. Fai clic sul pulsante di abbonamento qui sotto per scegliere la prova.', supportLabel: 'Domande? Contattaci in qualsiasi momento:', billingPrice: '$9.99', billingCycle: 'Ogni 30 giorni' },
  nl: { appName: 'Korting voor meerdere artikelen', pageTitle: 'App-abonnement', languageLabel: 'App-taal', trialBadge: 'Proefperiode actief', trialAction: 'Nieuwe gebruikers kunnen de app 7 dagen gratis proberen. Klik op de abonnementsknop hieronder om de proefperiode te kiezen.', supportLabel: 'Vragen? Neem gerust contact met ons op:', billingPrice: '$9.99', billingCycle: 'Elke 30 dagen' },
  sv: { appName: 'Rabatt för flera artiklar', pageTitle: 'App-prenumeration', languageLabel: 'Appspråk', trialBadge: 'Provperiod aktiv', trialAction: 'Nya användare kan prova appen gratis i 7 dagar. Klicka på prenumerationsknappen nedan för att välja provperioden.', supportLabel: 'Frågor? Kontakta oss när som helst:', billingPrice: '$9.99', billingCycle: 'Var 30:e dag' },
  tr: { appName: 'Çoklu ürün indirimi', pageTitle: 'Uygulama planı', languageLabel: 'Uygulama dili', trialBadge: 'Deneme etkin', trialAction: 'Yeni kullanıcılar uygulamayı 7 gün ücretsiz deneyebilir. Denemeyi seçmek için aşağıdaki abonelik düğmesine tıklayın.', supportLabel: 'Sorunuz mu var? İstediğiniz zaman bize ulaşın:', billingPrice: '$9.99', billingCycle: 'Her 30 günde bir' },
  'pt-BR': { appName: 'Desconto para vários itens', pageTitle: 'Plano do aplicativo', languageLabel: 'Idioma do aplicativo', trialBadge: 'Teste ativo', trialAction: 'Novos usuários podem experimentar o aplicativo grátis por 7 dias. Clique no botão de assinatura abaixo para escolher o teste.', supportLabel: 'Dúvidas? Entre em contato a qualquer momento:', billingPrice: '$9.99', billingCycle: 'A cada 30 dias' },
  'zh-Hans': { appName: '多件优惠', pageTitle: '应用套餐', languageLabel: '应用语言', trialBadge: '试用中', trialAction: '首次使用可免费试用 7 天，点击下方订阅按钮选择试用。', supportLabel: '有问题随时联系：', billingPrice: '$9.99', billingCycle: '每 30 天' },
  'zh-Hant': { appName: '多件優惠', pageTitle: '應用套餐', languageLabel: '應用語言', trialBadge: '試用中', trialAction: '首次使用可免費試用 7 天，點擊下方訂閱按鈕選擇試用。', supportLabel: '有問題隨時聯絡：', billingPrice: '$9.99', billingCycle: '每 30 天' },
};
Object.assign(planUi, {
  id: { appName: 'Diskon Bertingkat', pageTitle: 'Paket aplikasi', languageLabel: 'Bahasa aplikasi', trialBadge: 'Uji coba aktif', trialAction: 'Pengguna baru dapat mencoba aplikasi gratis selama 7 hari. Klik tombol berlangganan di bawah untuk memilih uji coba.', supportLabel: 'Ada pertanyaan? Hubungi kami kapan saja:', billingPrice: '$9.99', billingCycle: 'Setiap 30 hari' },
  ja: { appName: '数量割引', pageTitle: 'アプリプラン', languageLabel: 'アプリの言語', trialBadge: 'トライアル中', trialAction: '初めてご利用の方は7日間無料でお試しいただけます。下の購読ボタンをクリックして無料トライアルを選択してください。', supportLabel: 'ご不明な点はいつでもお問い合わせください：', billingPrice: '$9.99', billingCycle: '30日ごと' },
  ms: { appName: 'Diskaun Kuantiti', pageTitle: 'Pelan aplikasi', languageLabel: 'Bahasa aplikasi', trialBadge: 'Percubaan aktif', trialAction: 'Pengguna baharu boleh mencuba aplikasi secara percuma selama 7 hari. Klik butang langganan di bawah untuk memilih percubaan.', supportLabel: 'Ada soalan? Hubungi kami pada bila-bila masa:', billingPrice: '$9.99', billingCycle: 'Setiap 30 hari' },
  th: { appName: 'ส่วนลดตามจำนวน', pageTitle: 'แพ็กเกจแอป', languageLabel: 'ภาษาของแอป', trialBadge: 'กำลังทดลองใช้ฟรี', trialAction: 'ผู้ใช้ใหม่สามารถทดลองใช้แอปฟรี 7 วัน คลิกปุ่มสมัครสมาชิกด้านล่างเพื่อเลือกทดลองใช้ฟรี', supportLabel: 'หากมีคำถาม ติดต่อเราได้ตลอดเวลา:', billingPrice: '$9.99', billingCycle: 'ทุก 30 วัน' },
  vi: { appName: 'Ưu đãi theo số lượng', pageTitle: 'Gói ứng dụng', languageLabel: 'Ngôn ngữ ứng dụng', trialBadge: 'Đang dùng thử', trialAction: 'Người dùng mới có thể dùng thử ứng dụng miễn phí trong 7 ngày. Nhấp vào nút đăng ký bên dưới để chọn dùng thử.', supportLabel: 'Có thắc mắc? Liên hệ với chúng tôi bất cứ lúc nào:', billingPrice: '$9.99', billingCycle: 'Mỗi 30 ngày' },
});

const localeNames: Record<SubscriptionLocale, string> = APP_LOCALE_NAMES;

export function resolveSubscriptionLocale(locale: string | undefined): SubscriptionLocale {
  return subscriptionLocales.find((item) => item.toLowerCase() === locale?.toLowerCase()) ?? 'en';
}

export function subscriptionPlanUi(locale: string | undefined): SubscriptionPlanUi {
  return planUi[resolveSubscriptionLocale(locale)] ?? planUi.en!;
}

export function subscriptionLocaleName(locale: SubscriptionLocale): string {
  return localeNames[locale];
}

export type SubscriptionPlanFeature = { title: string; description: string };

const planFeatures: Partial<Record<SubscriptionLocale, SubscriptionPlanFeature[]>> = {
  en: [
    { title: 'Quantity break rules', description: 'Percentage, per-item reduction, fixed price, order reduction, and order fixed price.' },
    { title: 'Product and collection targeting', description: 'Target products or collections and check same-level campaign overlap before publishing.' },
    { title: 'Market-specific amounts', description: 'Set per-item or order fixed reductions and fixed prices for selected markets.' },
    { title: 'Configurable product-page widget', description: 'Adjust tier layout, colors, radius, and type styles independently for desktop and mobile.' },
    { title: 'Discount combinations', description: 'Choose whether to combine with product, order, and shipping discounts.' },
    { title: '36-language localization', description: 'Localized app-admin and product-page widget text in 36 supported languages.' },
  ],
  fr: [
    { title: 'Règles de remises par quantité', description: 'Pourcentage, remise par article, prix fixe, remise et prix fixe sur la commande.' },
    { title: 'Ciblage produits et collections', description: 'Ciblez des produits ou collections et vérifiez les chevauchements avant publication.' },
    { title: 'Montants par marché', description: 'Définissez des remises ou prix fixes par article ou commande pour chaque marché.' },
    { title: 'Widget produit configurable', description: 'Ajustez séparément la mise en page, les couleurs, rayons et polices sur ordinateur et mobile.' },
    { title: 'Combinaisons de remises', description: 'Choisissez la combinaison avec les remises produit, commande et livraison.' },
    { title: 'Localisation en 36 langues', description: 'Textes localisés de l’administration et du widget produit dans 36 langues prises en charge.' },
  ],
  de: [
    { title: 'Mengenrabatt-Regeln', description: 'Prozentrabatt, Rabatt je Artikel, Festpreis, Bestellrabatt und Bestellfestpreis.' },
    { title: 'Produkt- und Kategorieauswahl', description: 'Produkte oder Kategorien festlegen und Überschneidungen gleichrangiger Kampagnen prüfen.' },
    { title: 'Marktspezifische Beträge', description: 'Feste Rabatte oder Festpreise je Artikel oder Bestellung für gewählte Märkte festlegen.' },
    { title: 'Konfigurierbares Produkt-Widget', description: 'Layout, Farben, Radius und Schrift für Desktop und Mobilgeräte getrennt anpassen.' },
    { title: 'Rabattkombinationen', description: 'Kombination mit Produkt-, Bestell- und Versandrabatten festlegen.' },
    { title: 'Lokalisierung in 36 Sprachen', description: 'Lokalisierte Texte für App-Verwaltung und Produkt-Widget in 36 unterstützten Sprachen.' },
  ],
  es: [
    { title: 'Reglas de descuentos por cantidad', description: 'Porcentaje, reducción por artículo, precio fijo, reducción y precio fijo del pedido.' },
    { title: 'Segmentación de productos y colecciones', description: 'Selecciona productos o colecciones y comprueba solapamientos antes de publicar.' },
    { title: 'Importes por mercado', description: 'Define reducciones o precios fijos por artículo o pedido para mercados seleccionados.' },
    { title: 'Widget de producto configurable', description: 'Ajusta por separado diseño, colores, radio y tipografía para escritorio y móvil.' },
    { title: 'Combinaciones de descuentos', description: 'Configura la combinación con descuentos de producto, pedido y envío.' },
    { title: 'Localización en 36 idiomas', description: 'Textos localizados de administración y widget de producto en 36 idiomas compatibles.' },
  ],
  it: [
    { title: 'Regole di sconto quantità', description: 'Percentuale, riduzione per articolo, prezzo fisso, riduzione e prezzo fisso dell’ordine.' },
    { title: 'Target per prodotti e collezioni', description: 'Seleziona prodotti o collezioni e verifica le sovrapposizioni prima della pubblicazione.' },
    { title: 'Importi per mercato', description: 'Imposta riduzioni o prezzi fissi per articolo o ordine nei mercati selezionati.' },
    { title: 'Widget prodotto configurabile', description: 'Regola separatamente layout, colori, raggi e tipografia per desktop e mobile.' },
    { title: 'Combinazioni di sconti', description: 'Configura la combinazione con sconti prodotto, ordine e spedizione.' },
    { title: 'Localizzazione in 36 lingue', description: 'Testi localizzati per amministrazione e widget prodotto in 36 lingue supportate.' },
  ],
  nl: [
    { title: 'Staffelkortingsregels', description: 'Percentage, korting per artikel, vaste prijs, orderkorting en vaste orderprijs.' },
    { title: 'Product- en collectiegericht', description: 'Selecteer producten of collecties en controleer overlap vóór publicatie.' },
    { title: 'Marktgebonden bedragen', description: 'Stel vaste korting of prijs per artikel of bestelling in voor gekozen markten.' },
    { title: 'Configureerbare productwidget', description: 'Pas layout, kleuren, hoeken en lettertypen afzonderlijk aan voor desktop en mobiel.' },
    { title: 'Kortingscombinaties', description: 'Stel combinatie met product-, order- en verzendkortingen in.' },
    { title: 'Lokalisatie in 36 talen', description: 'Gelokaliseerde app- en productwidgetteksten in 36 ondersteunde talen.' },
  ],
  sv: [
    { title: 'Regler för mängdrabatter', description: 'Procent, rabatt per vara, fast pris, orderrabatt och fast orderpris.' },
    { title: 'Produkt- och samlingsinriktning', description: 'Välj produkter eller samlingar och kontrollera överlapp före publicering.' },
    { title: 'Marknadsspecifika belopp', description: 'Ange fasta rabatter eller priser per vara eller order för valda marknader.' },
    { title: 'Konfigurerbar produktwidget', description: 'Justera layout, färger, radie och typsnitt separat för dator och mobil.' },
    { title: 'Rabattkombinationer', description: 'Välj kombination med produkt-, order- och fraktrabatter.' },
    { title: 'Lokalisering på 36 språk', description: 'Lokaliserade texter för appadministration och produktwidget på 36 språk.' },
  ],
  tr: [
    { title: 'Miktar indirimi kuralları', description: 'Yüzde, ürün başına indirim, sabit fiyat, sipariş indirimi ve sabit sipariş fiyatı.' },
    { title: 'Ürün ve koleksiyon hedefleme', description: 'Ürün veya koleksiyon seçin, yayınlamadan önce çakışmaları kontrol edin.' },
    { title: 'Pazara özel tutarlar', description: 'Seçilen pazarlar için ürün veya sipariş bazında sabit indirim ve fiyat tanımlayın.' },
    { title: 'Yapılandırılabilir ürün bileşeni', description: 'Masaüstü ve mobil için düzen, renk, köşe ve yazı stilini ayrı ayarlayın.' },
    { title: 'İndirim kombinasyonları', description: 'Ürün, sipariş ve kargo indirimleriyle birleştirmeyi yapılandırın.' },
    { title: '36 dilde yerelleştirme', description: 'Uygulama yönetimi ve ürün bileşeni için 36 desteklenen dilde metinler.' },
  ],
  'pt-BR': [
    { title: 'Regras de desconto por quantidade', description: 'Percentual, redução por item, preço fixo, redução e preço fixo do pedido.' },
    { title: 'Segmentação por produto e coleção', description: 'Selecione produtos ou coleções e verifique sobreposições antes de publicar.' },
    { title: 'Valores por mercado', description: 'Defina reduções ou preços fixos por item ou pedido para mercados selecionados.' },
    { title: 'Widget de produto configurável', description: 'Ajuste layout, cores, cantos e tipografia separadamente em desktop e mobile.' },
    { title: 'Combinações de descontos', description: 'Configure a combinação com descontos de produto, pedido e frete.' },
    { title: 'Localização em 36 idiomas', description: 'Textos localizados do app e widget de produto em 36 idiomas compatíveis.' },
  ],
  'zh-Hans': [
    { title: '多件阶梯优惠规则', description: '支持百分比优惠、每件固定减免、固定单价、整单固定减免与整单固定价格。' },
    { title: '商品与商品分类定向', description: '可指定商品或商品分类；发布前检查同级活动的覆盖冲突。' },
    { title: '指定市场金额', description: '可为指定市场设定每件或整单固定减免、固定单价。' },
    { title: '可配置的商品页组件', description: 'PC 与移动端可分别调整档位布局、颜色、圆角和字体等样式。' },
    { title: '折扣叠加控制', description: '可配置是否与商品折扣、订单折扣和运费折扣叠加。' },
    { title: '36 种语言本地化', description: '应用后台与商品页组件支持 36 种语言的本地化显示。' },
  ],
  'zh-Hant': [
    { title: '多件階梯優惠規則', description: '支援百分比優惠、每件固定減免、固定單價、整單固定減免與整單固定價格。' },
    { title: '商品與商品分類定向', description: '可指定商品或商品分類；發佈前檢查同級活動的覆蓋衝突。' },
    { title: '指定市場金額', description: '可為指定市場設定每件或整單固定減免、固定單價。' },
    { title: '可配置的商品頁元件', description: 'PC 與行動端可分別調整檔位版面、顏色、圓角和字體等樣式。' },
    { title: '折扣疊加控制', description: '可配置是否與商品折扣、訂單折扣和運費折扣疊加。' },
    { title: '36 種語言本地化', description: '應用後台與商品頁元件支援 36 種語言的本地化顯示。' },
  ],
};
const addedPlanFeatures: Record<'id' | 'ja' | 'ms' | 'th' | 'vi', SubscriptionPlanFeature[]> = {
  id: [{ title: 'Aturan diskon bertingkat', description: 'Persentase, pengurangan per item, harga tetap, pengurangan pesanan, dan harga tetap pesanan.' }, { title: 'Target produk dan kategori', description: 'Targetkan produk atau kategori dan periksa tumpang tindih sebelum menerbitkan.' }, { title: 'Nominal khusus pasar', description: 'Atur pengurangan atau harga tetap per item maupun pesanan untuk pasar tertentu.' }, { title: 'Widget halaman produk yang dapat dikonfigurasi', description: 'Sesuaikan tata letak, warna, radius, dan gaya teks untuk desktop dan seluler.' }, { title: 'Kombinasi diskon', description: 'Pilih apakah akan digabungkan dengan diskon produk, pesanan, dan pengiriman.' }, { title: 'Lokalisasi 16 bahasa', description: 'Teks admin aplikasi dan widget halaman produk dalam 16 bahasa.' }],
  ja: [{ title: '数量割引ルール', description: '割合、商品ごとの減額、固定価格、注文減額、注文固定価格に対応します。' }, { title: '商品とコレクションの指定', description: '商品またはコレクションを指定し、公開前に重複を確認します。' }, { title: '市場別金額', description: '選択した市場ごとに商品単位または注文単位の固定額を設定できます。' }, { title: '設定可能な商品ページウィジェット', description: 'デスクトップとモバイルのレイアウト、色、角丸、文字スタイルを調整できます。' }, { title: '割引の組み合わせ', description: '商品、注文、配送割引との組み合わせを選択できます。' }, { title: '16言語のローカライズ', description: '管理画面と商品ページウィジェットを16言語で表示できます。' }],
  ms: [{ title: 'Peraturan diskaun kuantiti', description: 'Peratus, pengurangan setiap item, harga tetap, pengurangan pesanan dan harga tetap pesanan.' }, { title: 'Sasaran produk dan koleksi', description: 'Sasarkan produk atau koleksi dan semak pertindihan sebelum menerbitkan.' }, { title: 'Amaun khusus pasaran', description: 'Tetapkan pengurangan atau harga tetap setiap item atau pesanan untuk pasaran terpilih.' }, { title: 'Widget halaman produk boleh dikonfigurasikan', description: 'Laraskan susun atur, warna, jejari dan gaya teks untuk desktop dan mudah alih.' }, { title: 'Gabungan diskaun', description: 'Pilih sama ada untuk digabungkan dengan diskaun produk, pesanan dan penghantaran.' }, { title: 'Penyetempatan 16 bahasa', description: 'Teks pentadbir aplikasi dan widget produk dalam 16 bahasa.' }],
  th: [{ title: 'กฎส่วนลดตามจำนวน', description: 'รองรับส่วนลดเปอร์เซ็นต์ ลดต่อรายการ ราคาคงที่ ลดทั้งคำสั่งซื้อ และราคาคงที่ทั้งคำสั่งซื้อ' }, { title: 'กำหนดเป้าหมายสินค้าและคอลเลกชัน', description: 'เลือกสินค้าและคอลเลกชัน พร้อมตรวจสอบรายการซ้ำก่อนเผยแพร่' }, { title: 'จำนวนเงินเฉพาะตลาด', description: 'กำหนดส่วนลดหรือราคาคงที่ต่อรายการหรือทั้งคำสั่งซื้อสำหรับตลาดที่เลือก' }, { title: 'วิดเจ็ตหน้าสินค้าที่ปรับแต่งได้', description: 'ปรับเลย์เอาต์ สี มุมโค้ง และรูปแบบตัวอักษรแยกสำหรับเดสก์ท็อปและมือถือ' }, { title: 'การรวมส่วนลด', description: 'เลือกว่าจะรวมกับส่วนลดสินค้า คำสั่งซื้อ และค่าจัดส่งหรือไม่' }, { title: 'รองรับ 16 ภาษา', description: 'ข้อความแอปและวิดเจ็ตหน้าสินค้ารองรับ 16 ภาษา' }],
  vi: [{ title: 'Quy tắc ưu đãi theo số lượng', description: 'Hỗ trợ phần trăm, giảm theo sản phẩm, giá cố định, giảm theo đơn và giá cố định theo đơn.' }, { title: 'Nhắm mục tiêu sản phẩm và bộ sưu tập', description: 'Chọn sản phẩm hoặc bộ sưu tập và kiểm tra trùng lặp trước khi đăng.' }, { title: 'Giá trị theo thị trường', description: 'Đặt mức giảm hoặc giá cố định theo sản phẩm hay đơn hàng cho từng thị trường.' }, { title: 'Widget trang sản phẩm có thể tùy chỉnh', description: 'Điều chỉnh bố cục, màu sắc, bo góc và kiểu chữ riêng cho desktop và mobile.' }, { title: 'Kết hợp ưu đãi', description: 'Chọn kết hợp với ưu đãi sản phẩm, đơn hàng và vận chuyển.' }, { title: 'Bản địa hóa 16 ngôn ngữ', description: 'Văn bản quản trị và widget trang sản phẩm hỗ trợ 16 ngôn ngữ.' }],
};
Object.assign(planFeatures, addedPlanFeatures);

export function subscriptionPlanFeatures(locale: string | undefined): SubscriptionPlanFeature[] {
  return planFeatures[resolveSubscriptionLocale(locale)] ?? planFeatures.en!;
}

export function subscriptionText(locale: string | undefined, key: SubscriptionMessageKey): string {
  const selected = resolveSubscriptionLocale(locale);
  if (key === 'subscribed') return subscribedMessages[selected] ?? subscribedMessages.en!;
  return messages[selected]?.[key] ?? messages.en?.[key] ?? '';
}

export function subscriptionMessageKeys(): SubscriptionMessageKey[] { return [...Object.keys(messages.en!), 'subscribed'] as SubscriptionMessageKey[]; }
