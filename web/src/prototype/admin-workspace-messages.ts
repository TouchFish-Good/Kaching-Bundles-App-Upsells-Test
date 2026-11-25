import { campaignOperationMessages, type CampaignOperationMessageKey } from './campaign-operation-messages';
import { APP_LOCALES, type AdminLocale } from './admin-locale';

const keys = [
  'campaignStatus', 'activeCampaigns', 'currentlyRunning', 'scheduledCampaigns', 'startingLater',
  'pausedCampaigns', 'notShownInStore', 'allCampaigns', 'includingDraftsEnded',
  'searchCampaigns', 'searchPlaceholder', 'filterStatus', 'statusActive', 'statusPaused',
  'statusScheduled', 'statusDraft', 'statusEnded', 'campaign', 'products', 'tiers', 'status',
  'schedule', 'updated', 'actions', 'noMatch', 'tryAnother', 'clearFilters', 'edit', 'pause',
  'activate', 'deleteAction', 'deleteTitle', 'deleteBody', 'tierFor', 'tierPercentOff', 'fullPrice',
  'unsavedDraftNotice', 'saving', 'defaultLanguage', 'unsaved', 'loadingTranslation',
  'copyReadError', 'placeholdersRequired', 'translationSaved', 'translationSaveFailed',
  'dialogAria', 'dialogTitle', 'dialogBody', 'dialogStay', 'dialogDiscard', 'dialogKeep',
  'dismiss', 'close', 'campaignNotFound', 'backToCampaigns', 'backToOverview',
  'preferenceNotStored', 'pauseBeforeEdit', 'published', 'saved', 'publishFailed', 'saveFailed',
  'campaignMissing', 'campaignPaused', 'campaignPublished', 'statusChangeFailed',
  'campaignDeleted', 'campaignDeleteFailed',
] as const;

const supplementalKeys = [
  'combinableDiscounts', 'startTime', 'endTime', 'selectedCampaigns', 'selectCampaign', 'selectAllCampaigns',
  'enable', 'clearSelection', 'pageRange', 'rowsPerPage', 'previous', 'next',
  'batchEnableTitle', 'batchPauseTitle', 'batchDeleteTitle', 'batchEnableBody', 'batchPauseBody', 'batchDeleteBody',
  'batchEnabled', 'batchPaused', 'batchDeleted', 'batchFailed', 'subscriptionExpiringWarning', 'activeCampaignCannotDelete',
  'campaignUpdateFailed', 'translationUpdate', 'discardChanges', 'discardChangesConfirm', 'batchDeletePending',
] as const;

export type WorkspaceMessageKey = typeof keys[number] | typeof supplementalKeys[number] | 'discountName' | 'activationPending' | 'pausePending' | CampaignOperationMessageKey;

const values: Partial<Record<AdminLocale, readonly string[]>> = {
  en: [
    'Campaign status','Active campaigns','Currently running','Scheduled campaigns','Starting later',
    'Paused campaigns','Not shown in store','All campaigns','Including drafts and ended',
    'Search campaigns','Search by campaign or product','Filter by campaign status','Active','Paused',
    'Scheduled','Draft','Ended','Campaign','Products','Tiers','Status',
    'Schedule','Updated','Actions','No campaigns match these filters','Try another search or status.','Clear filters','Edit','Pause',
    'Activate','Delete','Delete campaign?','{{name}} will be permanently removed.','{{quantity}} for {{discount}}','{{percent}}% off','full price',
    'Unsaved changes are retained while switching languages in this session.','Saving...','Default: {{language}}','unsaved','Loading saved translation...',
    'Saved copy could not be read; editing is disabled to prevent overwriting it.','Keep every required placeholder before saving.','{{language}} translation saved for this store.','Translation could not be saved: {{error}}',
    'Unsaved translation changes','Unsaved changes','Choose what to do with the edits for {{language}} before switching languages.','Stay','Discard edits','Keep draft and switch',
    'Dismiss message','Close','Campaign not found','Back to campaigns','Back to overview',
    'Language preference could not be stored in this browser.','Pause this campaign before editing its published rule.','{{name}} was published.','{{name}} was saved.','Campaign was not published: {{error}}','Campaign was not saved: {{error}}',
    'Campaign could not be found. Refresh and retry.','Campaign paused.','Campaign published.','Campaign status was not changed: {{error}}',
    'Campaign deleted.','Campaign was not deleted: {{error}}',
  ],
  fr: [
    'Statut des campagnes','Campagnes actives','En cours','Campagnes programmées','À venir',
    'Campagnes en pause','Non affichées dans la boutique','Toutes les campagnes','Brouillons et campagnes terminées inclus',
    'Rechercher des campagnes','Rechercher par campagne ou produit','Filtrer par statut','Active','En pause',
    'Programmée','Brouillon','Terminée','Campagne','Produits','Paliers','Statut',
    'Programmation','Mise à jour','Actions','Aucune campagne ne correspond à ces filtres','Essayez une autre recherche ou un autre statut.','Effacer les filtres','Modifier','Mettre en pause',
    'Activer','Supprimer','Supprimer la campagne ?','{{name}} sera définitivement supprimée.','{{quantity}} pour {{discount}}','{{percent}} % de remise','prix normal',
    'Les modifications non enregistrées sont conservées pendant le changement de langue dans cette session.','Enregistrement...','Par défaut : {{language}}','non enregistré','Chargement de la traduction enregistrée...',
    'La traduction enregistrée est inaccessible ; la modification est désactivée pour éviter son écrasement.','Conservez tous les paramètres requis avant d’enregistrer.','Traduction en {{language}} enregistrée pour cette boutique.','Impossible d’enregistrer la traduction : {{error}}',
    'Modifications de traduction non enregistrées','Modifications non enregistrées','Que faire des modifications en {{language}} avant de changer de langue ?','Rester','Ignorer les modifications','Conserver le brouillon et changer',
    'Fermer le message','Fermer','Campagne introuvable','Retour aux campagnes','Retour à l’aperçu',
    'Impossible d’enregistrer la langue dans ce navigateur.','Mettez la campagne en pause avant de modifier sa règle publiée.','{{name}} a été publiée.','{{name}} a été enregistrée.','La campagne n’a pas été publiée : {{error}}','La campagne n’a pas été enregistrée : {{error}}',
    'Campagne introuvable. Actualisez et réessayez.','Campagne mise en pause.','Campagne publiée.','Impossible de modifier le statut : {{error}}',
    'Campagne supprimée.','Impossible de supprimer la campagne : {{error}}',
  ],
  de: [
    'Kampagnenstatus','Aktive Kampagnen','Derzeit aktiv','Geplante Kampagnen','Starten später',
    'Pausierte Kampagnen','Im Shop nicht sichtbar','Alle Kampagnen','Einschließlich Entwürfen und beendeten Kampagnen',
    'Kampagnen suchen','Nach Kampagne oder Produkt suchen','Nach Kampagnenstatus filtern','Aktiv','Pausiert',
    'Geplant','Entwurf','Beendet','Kampagne','Produkte','Staffeln','Status',
    'Zeitplan','Aktualisiert','Aktionen','Keine Kampagnen entsprechen diesen Filtern','Versuchen Sie eine andere Suche oder einen anderen Status.','Filter zurücksetzen','Bearbeiten','Pausieren',
    'Aktivieren','Löschen','Kampagne löschen?','{{name}} wird dauerhaft gelöscht.','{{quantity}} für {{discount}}','{{percent}} % Rabatt','regulärer Preis',
    'Nicht gespeicherte Änderungen bleiben beim Sprachwechsel in dieser Sitzung erhalten.','Speichern...','Standard: {{language}}','nicht gespeichert','Gespeicherte Übersetzung wird geladen...',
    'Die gespeicherte Übersetzung konnte nicht gelesen werden; Bearbeiten ist deaktiviert, damit sie nicht überschrieben wird.','Behalten Sie vor dem Speichern alle erforderlichen Platzhalter bei.','Übersetzung für {{language}} wurde für diesen Shop gespeichert.','Übersetzung konnte nicht gespeichert werden: {{error}}',
    'Nicht gespeicherte Übersetzungsänderungen','Nicht gespeicherte Änderungen','Was soll mit den Änderungen für {{language}} geschehen, bevor Sie die Sprache wechseln?','Hier bleiben','Änderungen verwerfen','Entwurf behalten und wechseln',
    'Meldung schließen','Schließen','Kampagne nicht gefunden','Zurück zu Kampagnen','Zurück zur Übersicht',
    'Die Spracheinstellung konnte in diesem Browser nicht gespeichert werden.','Pausieren Sie die Kampagne, bevor Sie die veröffentlichte Regel bearbeiten.','{{name}} wurde veröffentlicht.','{{name}} wurde gespeichert.','Kampagne konnte nicht veröffentlicht werden: {{error}}','Kampagne konnte nicht gespeichert werden: {{error}}',
    'Kampagne nicht gefunden. Aktualisieren und erneut versuchen.','Kampagne pausiert.','Kampagne veröffentlicht.','Status konnte nicht geändert werden: {{error}}',
    'Kampagne gelöscht.','Kampagne konnte nicht gelöscht werden: {{error}}',
  ],
  es: [
    'Estado de las campañas','Campañas activas','En curso','Campañas programadas','Comienzan más tarde',
    'Campañas pausadas','No se muestran en la tienda','Todas las campañas','Incluye borradores y finalizadas',
    'Buscar campañas','Buscar por campaña o producto','Filtrar por estado de campaña','Activa','Pausada',
    'Programada','Borrador','Finalizada','Campaña','Productos','Niveles','Estado',
    'Programación','Actualizada','Acciones','Ninguna campaña coincide con estos filtros','Prueba otra búsqueda u otro estado.','Borrar filtros','Editar','Pausar',
    'Activar','Eliminar','¿Eliminar campaña?','{{name}} se eliminará permanentemente.','{{quantity}} por {{discount}}','{{percent}} % de descuento','precio normal',
    'Los cambios sin guardar se conservan al cambiar de idioma durante esta sesión.','Guardando...','Predeterminado: {{language}}','sin guardar','Cargando traducción guardada...',
    'No se pudo leer la traducción guardada; la edición está desactivada para evitar sobrescribirla.','Conserva todos los marcadores obligatorios antes de guardar.','Traducción de {{language}} guardada para esta tienda.','No se pudo guardar la traducción: {{error}}',
    'Cambios de traducción sin guardar','Cambios sin guardar','¿Qué deseas hacer con los cambios de {{language}} antes de cambiar de idioma?','Permanecer','Descartar cambios','Conservar borrador y cambiar',
    'Cerrar mensaje','Cerrar','Campaña no encontrada','Volver a campañas','Volver al resumen',
    'No se pudo guardar la preferencia de idioma en este navegador.','Pausa esta campaña antes de editar su regla publicada.','Se publicó {{name}}.','Se guardó {{name}}.','No se publicó la campaña: {{error}}','No se guardó la campaña: {{error}}',
    'No se encontró la campaña. Actualiza y vuelve a intentarlo.','Campaña pausada.','Campaña publicada.','No se cambió el estado: {{error}}',
    'Campaña eliminada.','No se eliminó la campaña: {{error}}',
  ],
  it: [
    'Stato delle campagne','Campagne attive','Attualmente in corso','Campagne programmate','Iniziano più tardi',
    'Campagne in pausa','Non visibili nel negozio','Tutte le campagne','Incluse bozze e campagne terminate',
    'Cerca campagne','Cerca per campagna o prodotto','Filtra per stato della campagna','Attiva','In pausa',
    'Programmata','Bozza','Terminata','Campagna','Prodotti','Livelli','Stato',
    'Programmazione','Aggiornato','Azioni','Nessuna campagna corrisponde ai filtri','Prova un’altra ricerca o un altro stato.','Cancella filtri','Modifica','Metti in pausa',
    'Attiva','Elimina','Eliminare la campagna?','{{name}} verrà eliminata definitivamente.','{{quantity}} per {{discount}}','Sconto del {{percent}}%','prezzo pieno',
    'Le modifiche non salvate restano disponibili durante il cambio di lingua in questa sessione.','Salvataggio...','Predefinita: {{language}}','non salvata','Caricamento della traduzione salvata...',
    'Impossibile leggere la traduzione salvata; la modifica è disattivata per evitare di sovrascriverla.','Mantieni tutti i segnaposto obbligatori prima di salvare.','Traduzione {{language}} salvata per questo negozio.','Impossibile salvare la traduzione: {{error}}',
    'Modifiche alla traduzione non salvate','Modifiche non salvate','Cosa fare con le modifiche per {{language}} prima di cambiare lingua?','Resta','Scarta modifiche','Mantieni bozza e cambia',
    'Chiudi messaggio','Chiudi','Campagna non trovata','Torna alle campagne','Torna alla panoramica',
    'Impossibile salvare la preferenza della lingua in questo browser.','Metti in pausa la campagna prima di modificare la regola pubblicata.','{{name}} è stata pubblicata.','{{name}} è stata salvata.','Campagna non pubblicata: {{error}}','Campagna non salvata: {{error}}',
    'Campagna non trovata. Aggiorna e riprova.','Campagna in pausa.','Campagna pubblicata.','Stato non modificato: {{error}}',
    'Campagna eliminata.','Campagna non eliminata: {{error}}',
  ],
  nl: [
    'Campagnestatus','Actieve campagnes','Momenteel actief','Geplande campagnes','Beginnen later',
    'Gepauzeerde campagnes','Niet zichtbaar in de winkel','Alle campagnes','Inclusief concepten en beëindigde campagnes',
    'Campagnes zoeken','Zoeken op campagne of product','Filteren op campagnestatus','Actief','Gepauzeerd',
    'Gepland','Concept','Beëindigd','Campagne','Producten','Niveaus','Status',
    'Planning','Bijgewerkt','Acties','Geen campagnes voldoen aan deze filters','Probeer een andere zoekopdracht of status.','Filters wissen','Bewerken','Pauzeren',
    'Activeren','Verwijderen','Campagne verwijderen?','{{name}} wordt permanent verwijderd.','{{quantity}} voor {{discount}}','{{percent}}% korting','volledige prijs',
    'Niet-opgeslagen wijzigingen blijven tijdens het wisselen van taal in deze sessie bewaard.','Opslaan...','Standaard: {{language}}','niet opgeslagen','Opgeslagen vertaling laden...',
    'Opgeslagen tekst kan niet worden gelezen; bewerken is uitgeschakeld om overschrijven te voorkomen.','Behoud alle verplichte plaatsaanduidingen voordat je opslaat.','Vertaling voor {{language}} opgeslagen voor deze winkel.','Vertaling kon niet worden opgeslagen: {{error}}',
    'Niet-opgeslagen vertaalwijzigingen','Niet-opgeslagen wijzigingen','Wat wil je doen met de wijzigingen voor {{language}} voordat je van taal wisselt?','Blijven','Wijzigingen weggooien','Concept bewaren en wisselen',
    'Bericht sluiten','Sluiten','Campagne niet gevonden','Terug naar campagnes','Terug naar overzicht',
    'Taalvoorkeur kon niet worden opgeslagen in deze browser.','Pauzeer deze campagne voordat je de gepubliceerde regel bewerkt.','{{name}} is gepubliceerd.','{{name}} is opgeslagen.','Campagne is niet gepubliceerd: {{error}}','Campagne is niet opgeslagen: {{error}}',
    'Campagne niet gevonden. Vernieuw en probeer opnieuw.','Campagne gepauzeerd.','Campagne gepubliceerd.','Status is niet gewijzigd: {{error}}',
    'Campagne verwijderd.','Campagne is niet verwijderd: {{error}}',
  ],
  sv: [
    'Kampanjstatus','Aktiva kampanjer','Pågår nu','Schemalagda kampanjer','Startar senare',
    'Pausade kampanjer','Visas inte i butiken','Alla kampanjer','Inklusive utkast och avslutade',
    'Sök kampanjer','Sök efter kampanj eller produkt','Filtrera efter kampanjstatus','Aktiv','Pausad',
    'Schemalagd','Utkast','Avslutad','Kampanj','Produkter','Nivåer','Status',
    'Schema','Uppdaterad','Åtgärder','Inga kampanjer matchar dessa filter','Prova en annan sökning eller status.','Rensa filter','Redigera','Pausa',
    'Aktivera','Ta bort','Ta bort kampanj?','{{name}} tas bort permanent.','{{quantity}} för {{discount}}','{{percent}} % rabatt','ordinarie pris',
    'Osparade ändringar behålls när du byter språk under den här sessionen.','Sparar...','Standard: {{language}}','osparad','Läser in sparad översättning...',
    'Sparad text kunde inte läsas; redigering är avstängd för att undvika överskrivning.','Behåll alla obligatoriska platshållare innan du sparar.','Översättningen till {{language}} har sparats för butiken.','Översättningen kunde inte sparas: {{error}}',
    'Osparade översättningsändringar','Osparade ändringar','Vad vill du göra med ändringarna för {{language}} innan du byter språk?','Stanna','Kasta ändringar','Behåll utkast och byt',
    'Stäng meddelande','Stäng','Kampanjen hittades inte','Tillbaka till kampanjer','Tillbaka till översikten',
    'Språkinställningen kunde inte sparas i den här webbläsaren.','Pausa kampanjen innan du redigerar den publicerade regeln.','{{name}} publicerades.','{{name}} sparades.','Kampanjen publicerades inte: {{error}}','Kampanjen sparades inte: {{error}}',
    'Kampanjen hittades inte. Uppdatera och försök igen.','Kampanjen pausades.','Kampanjen publicerades.','Status kunde inte ändras: {{error}}',
    'Kampanjen togs bort.','Kampanjen kunde inte tas bort: {{error}}',
  ],
  tr: [
    'Kampanya durumu','Aktif kampanyalar','Şu anda yayında','Planlanan kampanyalar','Daha sonra başlayacak',
    'Duraklatılan kampanyalar','Mağazada gösterilmiyor','Tüm kampanyalar','Taslaklar ve bitenler dahil',
    'Kampanya ara','Kampanya veya ürüne göre ara','Kampanya durumuna göre filtrele','Aktif','Duraklatıldı',
    'Planlandı','Taslak','Bitti','Kampanya','Ürünler','Kademeler','Durum',
    'Planlama','Güncellendi','İşlemler','Bu filtrelerle eşleşen kampanya yok','Başka bir arama veya durum deneyin.','Filtreleri temizle','Düzenle','Duraklat',
    'Etkinleştir','Sil','Kampanya silinsin mi?','{{name}} kalıcı olarak silinecek.','{{discount}} karşılığında {{quantity}}','%{{percent}} indirim','normal fiyat',
    'Kaydedilmemiş değişiklikler bu oturumda dil değiştirirken korunur.','Kaydediliyor...','Varsayılan: {{language}}','kaydedilmedi','Kayıtlı çeviri yükleniyor...',
    'Kayıtlı metin okunamadı; üzerine yazılmasını önlemek için düzenleme kapatıldı.','Kaydetmeden önce gerekli tüm yer tutucuları koruyun.','{{language}} çevirisi bu mağaza için kaydedildi.','Çeviri kaydedilemedi: {{error}}',
    'Kaydedilmemiş çeviri değişiklikleri','Kaydedilmemiş değişiklikler','Dil değiştirmeden önce {{language}} düzenlemelerine ne yapılsın?','Kal','Değişiklikleri sil','Taslağı tut ve değiştir',
    'Mesajı kapat','Kapat','Kampanya bulunamadı','Kampanyalara dön','Genel bakışa dön',
    'Dil tercihi bu tarayıcıda kaydedilemedi.','Yayınlanan kuralı düzenlemeden önce kampanyayı duraklatın.','{{name}} yayınlandı.','{{name}} kaydedildi.','Kampanya yayınlanamadı: {{error}}','Kampanya kaydedilemedi: {{error}}',
    'Kampanya bulunamadı. Yenileyip tekrar deneyin.','Kampanya duraklatıldı.','Kampanya yayınlandı.','Durum değiştirilemedi: {{error}}',
    'Kampanya silindi.','Kampanya silinemedi: {{error}}',
  ],
  'pt-BR': [
    'Status das campanhas','Campanhas ativas','Em andamento','Campanhas agendadas','Começam depois',
    'Campanhas pausadas','Não exibidas na loja','Todas as campanhas','Inclui rascunhos e encerradas',
    'Buscar campanhas','Buscar por campanha ou produto','Filtrar por status da campanha','Ativa','Pausada',
    'Agendada','Rascunho','Encerrada','Campanha','Produtos','Faixas','Status',
    'Agendamento','Atualizada','Ações','Nenhuma campanha corresponde a esses filtros','Tente outra busca ou status.','Limpar filtros','Editar','Pausar',
    'Ativar','Excluir','Excluir campanha?','{{name}} será removida permanentemente.','{{quantity}} por {{discount}}','{{percent}}% de desconto','preço integral',
    'As alterações não salvas são mantidas ao trocar de idioma nesta sessão.','Salvando...','Padrão: {{language}}','não salvo','Carregando tradução salva...',
    'Não foi possível ler o texto salvo; a edição foi desativada para evitar sobrescrevê-lo.','Mantenha todos os marcadores obrigatórios antes de salvar.','Tradução em {{language}} salva para esta loja.','Não foi possível salvar a tradução: {{error}}',
    'Alterações de tradução não salvas','Alterações não salvas','O que fazer com as alterações de {{language}} antes de trocar de idioma?','Permanecer','Descartar alterações','Manter rascunho e trocar',
    'Fechar mensagem','Fechar','Campanha não encontrada','Voltar às campanhas','Voltar ao resumo',
    'Não foi possível salvar o idioma neste navegador.','Pause esta campanha antes de editar a regra publicada.','{{name}} foi publicada.','{{name}} foi salva.','Campanha não publicada: {{error}}','Campanha não salva: {{error}}',
    'Campanha não encontrada. Atualize e tente novamente.','Campanha pausada.','Campanha publicada.','Status não alterado: {{error}}',
    'Campanha excluída.','Campanha não excluída: {{error}}',
  ],
  'zh-Hans': [
    '活动状态','生效中的活动','当前生效','已排期的活动','稍后开始',
    '已暂停的活动','不在店铺展示','全部活动','包含草稿和已结束活动',
    '搜索活动','按活动或商品搜索','按活动状态筛选','生效中','已暂停',
    '待生效','草稿','已失效','活动','商品','档位','状态',
    '排期','更新时间','操作','没有符合筛选条件的活动','请尝试其他搜索词或状态。','清除筛选','编辑','暂停',
    '启用','删除','删除活动？','{{name}} 将被永久删除。','{{quantity}} 件享 {{discount}}','优惠 {{percent}}%','原价',
    '切换语言时，未保存的修改会在本次会话中保留。','正在保存...','默认：{{language}}','未保存','正在加载已保存的译文...',
    '无法读取已保存的译文。为防止覆盖，已禁用编辑。','保存前请保留所有必需的占位符。','已为当前店铺保存 {{language}} 译文。','无法保存译文：{{error}}',
    '未保存的翻译修改','未保存的修改','切换语言前，请选择如何处理 {{language}} 的修改。','留在当前语言','放弃更改','保留草稿并切换',
    '关闭消息','关闭','找不到活动','返回活动列表','返回概览',
    '无法在当前浏览器保存语言偏好。','编辑已发布规则前请先暂停此活动。','{{name}} 已发布。','{{name}} 已保存。','活动发布失败：{{error}}','活动保存失败：{{error}}',
    '找不到活动，请刷新后重试。','活动已暂停。','活动已发布。','无法更改活动状态：{{error}}',
    '活动已删除。','无法删除活动：{{error}}',
  ],
  'zh-Hant': [
    '活動狀態','生效中的活動','目前生效','已排程的活動','稍後開始',
    '已暫停的活動','不在商店顯示','所有活動','包含草稿及已結束活動',
    '搜尋活動','依活動或商品搜尋','依活動狀態篩選','生效中','已暫停',
    '待生效','草稿','已失效','活動','商品','檔位','狀態',
    '排程','更新時間','操作','沒有符合篩選條件的活動','請嘗試其他搜尋字詞或狀態。','清除篩選','編輯','暫停',
    '啟用','刪除','刪除活動？','{{name}} 將被永久刪除。','{{quantity}} 件享 {{discount}}','優惠 {{percent}}%','原價',
    '切換語言時，未儲存的修改會保留於本次工作階段。','正在儲存...','預設：{{language}}','未儲存','正在載入已儲存的譯文...',
    '無法讀取已儲存的譯文。為避免覆寫，已停用編輯。','儲存前請保留所有必要的佔位符。','已為此商店儲存 {{language}} 譯文。','無法儲存譯文：{{error}}',
    '未儲存的翻譯修改','未儲存的變更','切換語言前，請選擇如何處理 {{language}} 的修改。','留在目前語言','放棄修改','保留草稿並切換',
    '關閉訊息','關閉','找不到活動','返回活動列表','返回總覽',
    '無法在此瀏覽器儲存語言偏好。','編輯已發佈規則前，請先暫停此活動。','{{name}} 已發佈。','{{name}} 已儲存。','活動發佈失敗：{{error}}','活動儲存失敗：{{error}}',
    '找不到活動，請重新整理後再試。','活動已暫停。','活動已發佈。','無法變更活動狀態：{{error}}',
    '活動已刪除。','無法刪除活動：{{error}}',
  ],
};

const supplementalValues: Partial<Record<AdminLocale, readonly string[]>> = {
  en: ['Combinable discounts', 'Start time', 'End time', '{{count}} selected', 'Select {{name}}', 'Select all campaigns on this page', 'Enable', 'Cancel', '{{from}}–{{to}} of {{total}}', 'Rows per page', 'Previous', 'Next', 'Enable selected campaigns?', 'Pause selected campaigns?', 'Delete selected campaigns?', '{{count}} campaigns will be enabled.', '{{count}} campaigns will stop taking effect in your store.', '{{count}} campaigns will be permanently deleted.', '{{count}} campaigns enabled.', '{{count}} campaigns paused.', '{{count}} campaigns deleted.', 'Some campaigns were not changed: {{error}}', 'Your subscription is ending soon. Related discounts will stop working when it expires.'],
  fr: ['Remises cumulables', 'Début', 'Fin', '{{count}} sélectionnées', 'Sélectionner {{name}}', 'Sélectionner toutes les campagnes de cette page', 'Activer', 'Annuler', '{{from}}–{{to}} sur {{total}}', 'Lignes par page', 'Précédent', 'Suivant', 'Activer les campagnes sélectionnées ?', 'Mettre en pause les campagnes sélectionnées ?', 'Supprimer les campagnes sélectionnées ?', '{{count}} campagnes seront activées.', '{{count}} campagnes ne seront plus appliquées dans votre boutique.', '{{count}} campagnes seront supprimées définitivement.', '{{count}} campagnes activées.', '{{count}} campagnes mises en pause.', '{{count}} campagnes supprimées.', 'Certaines campagnes n’ont pas été modifiées : {{error}}'],
  de: ['Kombinierbare Rabatte', 'Startzeit', 'Endzeit', '{{count}} ausgewählt', '{{name}} auswählen', 'Alle Kampagnen auf dieser Seite auswählen', 'Aktivieren', 'Abbrechen', '{{from}}–{{to}} von {{total}}', 'Zeilen pro Seite', 'Zurück', 'Weiter', 'Ausgewählte Kampagnen aktivieren?', 'Ausgewählte Kampagnen pausieren?', 'Ausgewählte Kampagnen löschen?', '{{count}} Kampagnen werden aktiviert.', '{{count}} Kampagnen werden im Shop nicht mehr angewendet.', '{{count}} Kampagnen werden dauerhaft gelöscht.', '{{count}} Kampagnen aktiviert.', '{{count}} Kampagnen pausiert.', '{{count}} Kampagnen gelöscht.', 'Einige Kampagnen wurden nicht geändert: {{error}}'],
  es: ['Descuentos combinables', 'Inicio', 'Fin', '{{count}} seleccionadas', 'Seleccionar {{name}}', 'Seleccionar todas las campañas de esta página', 'Activar', 'Cancelar', '{{from}}–{{to}} de {{total}}', 'Filas por página', 'Anterior', 'Siguiente', '¿Activar las campañas seleccionadas?', '¿Pausar las campañas seleccionadas?', '¿Eliminar las campañas seleccionadas?', 'Se activarán {{count}} campañas.', '{{count}} campañas dejarán de aplicarse en tu tienda.', '{{count}} campañas se eliminarán definitivamente.', '{{count}} campañas activadas.', '{{count}} campañas pausadas.', '{{count}} campañas eliminadas.', 'No se pudieron modificar algunas campañas: {{error}}'],
  it: ['Sconti combinabili', 'Inizio', 'Fine', '{{count}} selezionate', 'Seleziona {{name}}', 'Seleziona tutte le campagne di questa pagina', 'Attiva', 'Annulla', '{{from}}–{{to}} di {{total}}', 'Righe per pagina', 'Precedente', 'Successivo', 'Attivare le campagne selezionate?', 'Mettere in pausa le campagne selezionate?', 'Eliminare le campagne selezionate?', '{{count}} campagne saranno attivate.', '{{count}} campagne non saranno più applicate nel negozio.', '{{count}} campagne saranno eliminate definitivamente.', '{{count}} campagne attivate.', '{{count}} campagne messe in pausa.', '{{count}} campagne eliminate.', 'Alcune campagne non sono state modificate: {{error}}'],
  nl: ['Combineerbare kortingen', 'Starttijd', 'Eindtijd', '{{count}} geselecteerd', '{{name}} selecteren', 'Alle campagnes op deze pagina selecteren', 'Inschakelen', 'Annuleren', '{{from}}–{{to}} van {{total}}', 'Rijen per pagina', 'Vorige', 'Volgende', 'Geselecteerde campagnes inschakelen?', 'Geselecteerde campagnes pauzeren?', 'Geselecteerde campagnes verwijderen?', '{{count}} campagnes worden ingeschakeld.', '{{count}} campagnes zijn niet langer actief in je winkel.', '{{count}} campagnes worden definitief verwijderd.', '{{count}} campagnes ingeschakeld.', '{{count}} campagnes gepauzeerd.', '{{count}} campagnes verwijderd.', 'Sommige campagnes zijn niet gewijzigd: {{error}}'],
  sv: ['Kombinerbara rabatter', 'Starttid', 'Sluttid', '{{count}} valda', 'Välj {{name}}', 'Välj alla kampanjer på den här sidan', 'Aktivera', 'Avbryt', '{{from}}–{{to}} av {{total}}', 'Rader per sida', 'Föregående', 'Nästa', 'Aktivera valda kampanjer?', 'Pausa valda kampanjer?', 'Ta bort valda kampanjer?', '{{count}} kampanjer aktiveras.', '{{count}} kampanjer slutar gälla i din butik.', '{{count}} kampanjer tas bort permanent.', '{{count}} kampanjer aktiverade.', '{{count}} kampanjer pausade.', '{{count}} kampanjer borttagna.', 'Vissa kampanjer ändrades inte: {{error}}'],
  tr: ['Birleştirilebilir indirimler', 'Başlangıç zamanı', 'Bitiş zamanı', '{{count}} seçildi', '{{name}} seç', 'Bu sayfadaki tüm kampanyaları seç', 'Etkinleştir', 'İptal', '{{from}}–{{to}} / {{total}}', 'Sayfa başına satır', 'Önceki', 'Sonraki', 'Seçili kampanyalar etkinleştirilsin mi?', 'Seçili kampanyalar duraklatılsın mı?', 'Seçili kampanyalar silinsin mi?', '{{count}} kampanya etkinleştirilecek.', '{{count}} kampanya mağazanızda geçerli olmayacak.', '{{count}} kampanya kalıcı olarak silinecek.', '{{count}} kampanya etkinleştirildi.', '{{count}} kampanya duraklatıldı.', '{{count}} kampanya silindi.', 'Bazı kampanyalar değiştirilemedi: {{error}}'],
  'pt-BR': ['Descontos combináveis', 'Início', 'Fim', '{{count}} selecionadas', 'Selecionar {{name}}', 'Selecionar todas as campanhas desta página', 'Ativar', 'Cancelar', '{{from}}–{{to}} de {{total}}', 'Linhas por página', 'Anterior', 'Próxima', 'Ativar campanhas selecionadas?', 'Pausar campanhas selecionadas?', 'Excluir campanhas selecionadas?', '{{count}} campanhas serão ativadas.', '{{count}} campanhas deixarão de funcionar na sua loja.', '{{count}} campanhas serão excluídas permanentemente.', '{{count}} campanhas ativadas.', '{{count}} campanhas pausadas.', '{{count}} campanhas excluídas.', 'Algumas campanhas não foram alteradas: {{error}}'],
  'zh-Hans': ['可叠加折扣', '开始时间', '结束时间', '已选择 {{count}} 项', '选择 {{name}}', '选择本页全部活动', '启用', '取消', '{{from}}–{{to}}，共 {{total}} 项', '每页行数', '上一页', '下一页', '立即启用已选活动？', '暂停已选活动？', '删除已选活动？', '将立即启用 {{count}} 个活动。', '{{count}} 个活动将停止在店铺生效。', '{{count}} 个活动将被永久删除。', '已启用 {{count}} 个活动。', '已暂停 {{count}} 个活动。', '已删除 {{count}} 个活动。', '部分活动未能更改：{{error}}', '订阅套餐即将到期，到期后对应折扣将直接失效。'],
  'zh-Hant': ['可疊加折扣', '開始時間', '結束時間', '已選擇 {{count}} 項', '選擇 {{name}}', '選擇本頁全部活動', '啟用', '取消', '{{from}}–{{to}}，共 {{total}} 項', '每頁列數', '上一頁', '下一頁', '啟用已選活動？', '暫停已選活動？', '刪除已選活動？', '將啟用 {{count}} 個活動。', '{{count}} 個活動將停止在商店生效。', '{{count}} 個活動將被永久刪除。', '已啟用 {{count}} 個活動。', '已暫停 {{count}} 個活動。', '已刪除 {{count}} 個活動。', '部分活動未能變更：{{error}}', '訂閱方案即將到期，到期後對應折扣將直接失效。'],
};

// The five expanded application locales are intentionally kept here rather than
// falling back to English. These labels are used by the campaign list and its
// batch actions, which are the first screen merchants see after authorization.
const addedLocaleWorkspaceMessages: Record<string, Partial<Record<WorkspaceMessageKey, string>>> = {
  id: {
    campaignStatus: 'Status kampanye', activeCampaigns: 'Kampanye aktif', currentlyRunning: 'Sedang berjalan', scheduledCampaigns: 'Kampanye terjadwal', startingLater: 'Mulai nanti', pausedCampaigns: 'Kampanye dijeda', notShownInStore: 'Tidak ditampilkan di toko', allCampaigns: 'Semua kampanye', includingDraftsEnded: 'Termasuk draf dan yang berakhir', searchCampaigns: 'Cari kampanye', searchPlaceholder: 'Cari berdasarkan kampanye atau produk', filterStatus: 'Filter status kampanye', statusActive: 'Aktif', statusPaused: 'Dijeda', statusScheduled: 'Terjadwal', statusDraft: 'Draf', statusEnded: 'Berakhir', campaign: 'Kampanye', products: 'Produk', tiers: 'Tingkat', status: 'Status', schedule: 'Jadwal', updated: 'Diperbarui', actions: 'Tindakan', noMatch: 'Tidak ada kampanye yang cocok', tryAnother: 'Coba pencarian atau status lain.', clearFilters: 'Hapus filter', edit: 'Edit', pause: 'Jeda', activate: 'Aktifkan', deleteAction: 'Hapus', deleteTitle: 'Hapus kampanye?', deleteBody: '{{name}} akan dihapus permanen.', tierFor: '{{quantity}} untuk {{discount}}', tierPercentOff: 'Diskon {{percent}}%', fullPrice: 'harga penuh', saving: 'Menyimpan...', loadingTranslation: 'Memuat terjemahan tersimpan...', close: 'Tutup', campaignNotFound: 'Kampanye tidak ditemukan', backToCampaigns: 'Kembali ke kampanye', backToOverview: 'Kembali ke ringkasan', campaignPaused: 'Kampanye dijeda.', campaignPublished: 'Kampanye diterbitkan.', campaignDeleted: 'Kampanye dihapus.', combinableDiscounts: 'Diskon yang dapat digabung', startTime: 'Waktu mulai', endTime: 'Waktu berakhir', selectedCampaigns: '{{count}} dipilih', selectCampaign: 'Pilih {{name}}', selectAllCampaigns: 'Pilih semua kampanye di halaman ini', enable: 'Aktifkan', clearSelection: 'Batal', pageRange: '{{from}}–{{to}} dari {{total}}', rowsPerPage: 'Baris per halaman', previous: 'Sebelumnya', next: 'Berikutnya'
  },
  ja: {
    campaignStatus: 'キャンペーンのステータス', activeCampaigns: '有効なキャンペーン', currentlyRunning: '現在実施中', scheduledCampaigns: '予約済みキャンペーン', startingLater: '後で開始', pausedCampaigns: '一時停止中のキャンペーン', notShownInStore: 'ストアに表示されません', allCampaigns: 'すべてのキャンペーン', includingDraftsEnded: '下書きと終了済みを含む', searchCampaigns: 'キャンペーンを検索', searchPlaceholder: 'キャンペーンまたは商品で検索', filterStatus: 'ステータスで絞り込む', statusActive: '有効', statusPaused: '一時停止', statusScheduled: '予約済み', statusDraft: '下書き', statusEnded: '終了', campaign: 'キャンペーン', products: '商品', tiers: 'ティア', status: 'ステータス', schedule: 'スケジュール', updated: '更新日', actions: '操作', noMatch: '条件に一致するキャンペーンはありません', tryAnother: '別の検索語またはステータスをお試しください。', clearFilters: 'フィルターをクリア', edit: '編集', pause: '一時停止', activate: '有効化', deleteAction: '削除', deleteTitle: 'キャンペーンを削除しますか？', deleteBody: '{{name}} は完全に削除されます。', tierFor: '{{quantity}}個で{{discount}}', tierPercentOff: '{{percent}}%オフ', fullPrice: '通常価格', saving: '保存中...', loadingTranslation: '保存済みの翻訳を読み込み中...', close: '閉じる', campaignNotFound: 'キャンペーンが見つかりません', backToCampaigns: 'キャンペーンに戻る', backToOverview: '概要に戻る', campaignPaused: 'キャンペーンを一時停止しました。', campaignPublished: 'キャンペーンを公開しました。', campaignDeleted: 'キャンペーンを削除しました。', combinableDiscounts: '併用可能な割引', startTime: '開始日時', endTime: '終了日時', selectedCampaigns: '{{count}}件を選択', selectCampaign: '{{name}}を選択', selectAllCampaigns: 'このページのすべてのキャンペーンを選択', enable: '有効化', clearSelection: 'キャンセル', pageRange: '{{from}}–{{to}} / {{total}}', rowsPerPage: 'ページあたりの行数', previous: '前へ', next: '次へ'
  },
  ms: {
    campaignStatus: 'Status kempen', activeCampaigns: 'Kempen aktif', currentlyRunning: 'Sedang berjalan', scheduledCampaigns: 'Kempen berjadual', startingLater: 'Bermula kemudian', pausedCampaigns: 'Kempen dijeda', notShownInStore: 'Tidak dipaparkan di kedai', allCampaigns: 'Semua kempen', includingDraftsEnded: 'Termasuk draf dan yang tamat', searchCampaigns: 'Cari kempen', searchPlaceholder: 'Cari mengikut kempen atau produk', filterStatus: 'Tapis mengikut status kempen', statusActive: 'Aktif', statusPaused: 'Dijeda', statusScheduled: 'Berjadual', statusDraft: 'Draf', statusEnded: 'Tamat', campaign: 'Kempen', products: 'Produk', tiers: 'Tahap', status: 'Status', schedule: 'Jadual', updated: 'Dikemas kini', actions: 'Tindakan', noMatch: 'Tiada kempen sepadan dengan penapis ini', tryAnother: 'Cuba carian atau status lain.', clearFilters: 'Kosongkan penapis', edit: 'Edit', pause: 'Jeda', activate: 'Aktifkan', deleteAction: 'Padam', deleteTitle: 'Padam kempen?', deleteBody: '{{name}} akan dipadam secara kekal.', tierFor: '{{quantity}} untuk {{discount}}', tierPercentOff: 'Diskaun {{percent}}%', fullPrice: 'harga penuh', saving: 'Menyimpan...', loadingTranslation: 'Memuatkan terjemahan yang disimpan...', close: 'Tutup', campaignNotFound: 'Kempen tidak ditemui', backToCampaigns: 'Kembali ke kempen', backToOverview: 'Kembali ke gambaran keseluruhan', campaignPaused: 'Kempen dijeda.', campaignPublished: 'Kempen diterbitkan.', campaignDeleted: 'Kempen dipadam.', combinableDiscounts: 'Diskaun yang boleh digabungkan', startTime: 'Masa mula', endTime: 'Masa tamat', selectedCampaigns: '{{count}} dipilih', selectCampaign: 'Pilih {{name}}', selectAllCampaigns: 'Pilih semua kempen pada halaman ini', enable: 'Aktifkan', clearSelection: 'Batal', pageRange: '{{from}}–{{to}} daripada {{total}}', rowsPerPage: 'Baris setiap halaman', previous: 'Sebelumnya', next: 'Seterusnya'
  },
  th: {
    campaignStatus: 'สถานะแคมเปญ', activeCampaigns: 'แคมเปญที่ใช้งานอยู่', currentlyRunning: 'กำลังทำงาน', scheduledCampaigns: 'แคมเปญที่ตั้งเวลาไว้', startingLater: 'เริ่มภายหลัง', pausedCampaigns: 'แคมเปญที่หยุดชั่วคราว', notShownInStore: 'ไม่แสดงในร้านค้า', allCampaigns: 'แคมเปญทั้งหมด', includingDraftsEnded: 'รวมฉบับร่างและสิ้นสุดแล้ว', searchCampaigns: 'ค้นหาแคมเปญ', searchPlaceholder: 'ค้นหาตามแคมเปญหรือสินค้า', filterStatus: 'กรองตามสถานะแคมเปญ', statusActive: 'ใช้งานอยู่', statusPaused: 'หยุดชั่วคราว', statusScheduled: 'ตั้งเวลาแล้ว', statusDraft: 'ฉบับร่าง', statusEnded: 'สิ้นสุดแล้ว', campaign: 'แคมเปญ', products: 'สินค้า', tiers: 'ระดับ', status: 'สถานะ', schedule: 'กำหนดการ', updated: 'อัปเดต', actions: 'การดำเนินการ', noMatch: 'ไม่พบแคมเปญที่ตรงกับตัวกรอง', tryAnother: 'ลองค้นหาหรือเลือกสถานะอื่น', clearFilters: 'ล้างตัวกรอง', edit: 'แก้ไข', pause: 'หยุดชั่วคราว', activate: 'เปิดใช้งาน', deleteAction: 'ลบ', deleteTitle: 'ลบแคมเปญหรือไม่', deleteBody: '{{name}} จะถูกลบอย่างถาวร', tierFor: '{{quantity}} สำหรับ {{discount}}', tierPercentOff: 'ลด {{percent}}%', fullPrice: 'ราคาเต็ม', saving: 'กำลังบันทึก...', loadingTranslation: 'กำลังโหลดคำแปลที่บันทึกไว้...', close: 'ปิด', campaignNotFound: 'ไม่พบแคมเปญ', backToCampaigns: 'กลับไปที่แคมเปญ', backToOverview: 'กลับไปที่ภาพรวม', campaignPaused: 'หยุดแคมเปญชั่วคราวแล้ว', campaignPublished: 'เผยแพร่แคมเปญแล้ว', campaignDeleted: 'ลบแคมเปญแล้ว', combinableDiscounts: 'ส่วนลดที่ใช้ร่วมกันได้', startTime: 'เวลาเริ่มต้น', endTime: 'เวลาสิ้นสุด', selectedCampaigns: 'เลือกแล้ว {{count}} รายการ', selectCampaign: 'เลือก {{name}}', selectAllCampaigns: 'เลือกแคมเปญทั้งหมดในหน้านี้', enable: 'เปิดใช้งาน', clearSelection: 'ยกเลิก', pageRange: '{{from}}–{{to}} จาก {{total}}', rowsPerPage: 'แถวต่อหน้า', previous: 'ก่อนหน้า', next: 'ถัดไป'
  },
  vi: {
    campaignStatus: 'Trạng thái chiến dịch', activeCampaigns: 'Chiến dịch đang hoạt động', currentlyRunning: 'Đang chạy', scheduledCampaigns: 'Chiến dịch đã lên lịch', startingLater: 'Bắt đầu sau', pausedCampaigns: 'Chiến dịch đã tạm dừng', notShownInStore: 'Không hiển thị trong cửa hàng', allCampaigns: 'Tất cả chiến dịch', includingDraftsEnded: 'Bao gồm bản nháp và đã kết thúc', searchCampaigns: 'Tìm chiến dịch', searchPlaceholder: 'Tìm theo chiến dịch hoặc sản phẩm', filterStatus: 'Lọc theo trạng thái chiến dịch', statusActive: 'Đang hoạt động', statusPaused: 'Đã tạm dừng', statusScheduled: 'Đã lên lịch', statusDraft: 'Bản nháp', statusEnded: 'Đã kết thúc', campaign: 'Chiến dịch', products: 'Sản phẩm', tiers: 'Mức', status: 'Trạng thái', schedule: 'Lịch', updated: 'Đã cập nhật', actions: 'Thao tác', noMatch: 'Không có chiến dịch phù hợp với bộ lọc', tryAnother: 'Thử tìm kiếm hoặc trạng thái khác.', clearFilters: 'Xóa bộ lọc', edit: 'Chỉnh sửa', pause: 'Tạm dừng', activate: 'Kích hoạt', deleteAction: 'Xóa', deleteTitle: 'Xóa chiến dịch?', deleteBody: '{{name}} sẽ bị xóa vĩnh viễn.', tierFor: '{{quantity}} với {{discount}}', tierPercentOff: 'Giảm {{percent}}%', fullPrice: 'giá đầy đủ', saving: 'Đang lưu...', loadingTranslation: 'Đang tải bản dịch đã lưu...', close: 'Đóng', campaignNotFound: 'Không tìm thấy chiến dịch', backToCampaigns: 'Quay lại chiến dịch', backToOverview: 'Quay lại tổng quan', campaignPaused: 'Đã tạm dừng chiến dịch.', campaignPublished: 'Đã xuất bản chiến dịch.', campaignDeleted: 'Đã xóa chiến dịch.', combinableDiscounts: 'Ưu đãi có thể kết hợp', startTime: 'Thời gian bắt đầu', endTime: 'Thời gian kết thúc', selectedCampaigns: 'Đã chọn {{count}}', selectCampaign: 'Chọn {{name}}', selectAllCampaigns: 'Chọn tất cả chiến dịch trên trang này', enable: 'Kích hoạt', clearSelection: 'Hủy', pageRange: '{{from}}–{{to}} trên {{total}}', rowsPerPage: 'Số dòng mỗi trang', previous: 'Trước', next: 'Tiếp'
  }
};

const activationPendingMessages: Record<AdminLocale, string> = {
  en: 'Submitted. Confirming campaign activation; the list will update automatically.',
  fr: 'Demande envoyée. Confirmation de l’activation en cours ; la liste sera actualisée automatiquement.',
  de: 'Übermittelt. Die Aktivierung wird geprüft; die Liste wird automatisch aktualisiert.',
  es: 'Enviado. Se está confirmando la activación; la lista se actualizará automáticamente.',
  it: 'Richiesta inviata. Attivazione in verifica; l’elenco si aggiornerà automaticamente.',
  nl: 'Verzonden. De activering wordt bevestigd; de lijst wordt automatisch bijgewerkt.',
  sv: 'Skickat. Aktiveringen bekräftas; listan uppdateras automatiskt.',
  tr: 'Gönderildi. Kampanya etkinleştirmesi doğrulanıyor; liste otomatik güncellenecek.',
  'pt-BR': 'Enviado. Confirmando a ativação; a lista será atualizada automaticamente.',
  'zh-Hans': '已提交，正在确认活动启动结果，列表将自动更新。',
  'zh-Hant': '已提交，正在確認活動啟動結果，列表將自動更新。',
  ms: 'Dihantar. Pengaktifan kempen sedang disahkan; senarai akan dikemas kini secara automatik.',
  th: 'ส่งแล้ว กำลังยืนยันการเปิดใช้งานแคมเปญ รายการจะอัปเดตโดยอัตโนมัติ',
  id: 'Terkirim. Sedang mengonfirmasi aktivasi kampanye; daftar akan diperbarui otomatis.',
  vi: 'Đã gửi. Đang xác nhận kích hoạt chiến dịch; danh sách sẽ tự động cập nhật.',
  ja: '送信しました。有効化を確認中です。一覧は自動更新されます。',
};

const batchDeletePendingMessages: Record<AdminLocale, string> = {
  en: 'Deletion results are not yet confirmed. Tasks may still be processing in the background. Refresh the list shortly to check.',
  fr: 'La suppression se poursuit en arrière-plan. Actualisez la liste dans un instant pour vérifier le résultat.',
  de: 'Die Löschung läuft im Hintergrund weiter. Aktualisieren Sie die Liste in Kürze, um das Ergebnis zu prüfen.',
  es: 'La eliminación continúa en segundo plano. Actualiza la lista en unos instantes para comprobar el resultado.',
  it: 'L’eliminazione continua in background. Aggiorna l’elenco tra poco per verificare il risultato.',
  nl: 'Het verwijderen gaat op de achtergrond door. Vernieuw de lijst binnenkort om het resultaat te controleren.',
  sv: 'Borttagningen fortsätter i bakgrunden. Uppdatera listan om en stund för att kontrollera resultatet.',
  tr: 'Silme işlemi arka planda devam ediyor. Sonucu kontrol etmek için birazdan listeyi yenileyin.',
  'pt-BR': 'A exclusão continua em segundo plano. Atualize a lista em instantes para verificar o resultado.',
  'zh-Hans': '删除结果尚未确认，任务可能仍在后台处理，请稍后刷新列表查看结果。',
  'zh-Hant': '刪除結果尚未確認，工作可能仍在背景處理，請稍後重新整理列表查看結果。',
  ms: 'Pemadaman masih diproses di latar belakang. Muat semula senarai sebentar lagi untuk menyemak hasilnya.',
  th: 'กำลังลบในเบื้องหลัง โปรดรีเฟรชรายการในอีกสักครู่เพื่อตรวจสอบผลลัพธ์',
  id: 'Penghapusan masih diproses di latar belakang. Segarkan daftar sebentar lagi untuk memeriksa hasilnya.',
  vi: 'Tác vụ xóa vẫn đang xử lý trong nền. Vui lòng làm mới danh sách sau ít phút để kiểm tra kết quả.',
  ja: '削除はバックグラウンドで処理中です。しばらくしてから一覧を更新して結果を確認してください。',
};
const activeCampaignCannotDeleteMessages: Record<AdminLocale, string> = {
  en: 'Current campaign is active. Pause it before deleting.', fr: 'Cette campagne est active. Mettez-la en pause avant de la supprimer.', de: 'Diese Kampagne ist aktiv. Pausieren Sie sie vor dem Löschen.', es: 'Esta campaña está activa. Paúsala antes de eliminarla.', it: 'Questa campagna è attiva. Mettila in pausa prima di eliminarla.', nl: 'Deze campagne is actief. Pauzeer deze voordat je hem verwijdert.', sv: 'Den här kampanjen är aktiv. Pausa den innan du tar bort den.', tr: 'Bu kampanya etkin. Silmeden önce duraklatın.', 'pt-BR': 'Esta campanha está ativa. Pause-a antes de excluí-la.', 'zh-Hans': '当前活动正在进行中，需要先暂停才可以删除。', 'zh-Hant': '目前活動正在進行中，需要先暫停才可以刪除。', ms: 'Kempen ini sedang aktif. Jeda dahulu sebelum memadamkannya.', th: 'แคมเปญนี้กำลังใช้งานอยู่ โปรดหยุดชั่วคราวก่อนลบ', id: 'Kampanye ini sedang aktif. Jeda terlebih dahulu sebelum menghapusnya.', vi: 'Chiến dịch này đang hoạt động. Hãy tạm dừng trước khi xóa.', ja: 'このキャンペーンは実行中です。削除する前に一時停止してください。',
};
const campaignUpdateFailedMessages: Record<AdminLocale, string> = {
  en: 'Campaign update failed: {{error}}', fr: 'La mise a jour de la campagne a echoue : {{error}}', de: 'Aktualisierung der Kampagne fehlgeschlagen: {{error}}', es: 'La actualizacion de la campana fallo: {{error}}', it: 'Aggiornamento della campagna non riuscito: {{error}}', nl: 'Bijwerken van de campagne is mislukt: {{error}}', sv: 'Det gick inte att uppdatera kampanjen: {{error}}', tr: 'Kampanya guncellenemedi: {{error}}', 'pt-BR': 'Falha ao atualizar a campanha: {{error}}', 'zh-Hans': '活动更新失败：{{error}}', 'zh-Hant': '活動更新失敗：{{error}}', ms: 'Kemas kini kempen gagal: {{error}}', th: 'อัปเดตแคมเปญไม่สำเร็จ: {{error}}', id: 'Pembaruan kampanye gagal: {{error}}', vi: 'Cap nhat chien dich that bai: {{error}}', ja: 'キャンペーンの更新に失敗しました: {{error}}',
};
const translationUpdateMessages: Record<AdminLocale, string> = {
  en: 'Update', fr: 'Mettre a jour', de: 'Aktualisieren', es: 'Actualizar', it: 'Aggiorna', nl: 'Bijwerken', sv: 'Uppdatera', tr: 'Guncelle', 'pt-BR': 'Atualizar', 'zh-Hans': '更新', 'zh-Hant': '更新', ms: 'Kemas kini', th: 'อัปเดต', id: 'Perbarui', vi: 'Cập nhật', ja: '更新',
};
const discardChangesMessages: Record<AdminLocale, string> = {
  en: 'Discard changes', fr: 'Abandonner les modifications', de: 'Anderungen verwerfen', es: 'Descartar cambios', it: 'Annulla modifiche', nl: 'Wijzigingen verwijderen', sv: 'Kasta andringar', tr: 'Degisiklikleri sil', 'pt-BR': 'Descartar alteracoes', 'zh-Hans': '放弃更改', 'zh-Hant': '放棄更改', ms: 'Buang perubahan', th: 'ละทิ้งการเปลี่ยนแปลง', id: 'Buang perubahan', vi: 'Huy thay đổi', ja: '変更を破棄',
};
const discardChangesConfirmMessages: Record<AdminLocale, string> = {
  en: 'Discard current changes?', fr: 'Abandonner les modifications actuelles ?', de: 'Aktuelle Anderungen verwerfen?', es: 'Descartar los cambios actuales?', it: 'Annullare le modifiche correnti?', nl: 'Huidige wijzigingen verwijderen?', sv: 'Kasta aktuella andringar?', tr: 'Mevcut degisiklikler silinsin mi?', 'pt-BR': 'Descartar as alteracoes atuais?', 'zh-Hans': '确认放弃当前已更改的内容？', 'zh-Hant': '確認放棄目前已修改的內容？', ms: 'Buang perubahan semasa?', th: 'ละทิ้งการเปลี่ยนแปลงปัจจุบันหรือไม่', id: 'Buang perubahan saat ini?', vi: 'Hủy các thay đổi hiện tại?', ja: '現在の変更を破棄しますか？',
};
const discountNameMessages: Record<AdminLocale, string> = {
  en: 'Discount name', fr: 'Nom de la remise', de: 'Rabattname', es: 'Nombre del descuento', it: 'Nome dello sconto', nl: 'Kortingsnaam', sv: 'Rabattnamn', tr: 'İndirim adı', 'pt-BR': 'Nome do desconto', 'zh-Hans': '折扣名称', 'zh-Hant': '折扣名稱', ms: 'Nama diskaun', th: 'ชื่อส่วนลด', id: 'Nama diskon', vi: 'Tên giảm giá', ja: '割引名',
};

export const workspaceMessages = Object.fromEntries(APP_LOCALES.map((locale) => [locale,
  Object.fromEntries([...keys.map((key, index) => [key, (values[locale] ?? values.en!)[index]]), ...supplementalKeys.map((key, index) => [key, supplementalValues[locale]?.[index] ?? supplementalValues.en![index]]), ...Object.entries(addedLocaleWorkspaceMessages[locale] ?? {}), ['discountName', discountNameMessages[locale]], ['activationPending', activationPendingMessages[locale]], ['batchDeletePending', batchDeletePendingMessages[locale]], ['activeCampaignCannotDelete', activeCampaignCannotDeleteMessages[locale]], ['campaignUpdateFailed', campaignUpdateFailedMessages[locale]], ['translationUpdate', translationUpdateMessages[locale]], ['discardChanges', discardChangesMessages[locale]], ['discardChangesConfirm', discardChangesConfirmMessages[locale]], ...Object.entries(campaignOperationMessages(locale))]),
])) as Record<AdminLocale, Record<WorkspaceMessageKey, string>>;

export function workspaceText(locale: string | undefined, key: WorkspaceMessageKey, params: Record<string, string | number> = {}): string {
  const supported = APP_LOCALES.find((item) => item.toLowerCase() === locale?.toLowerCase()) ?? 'en';
  return (workspaceMessages[supported][key] ?? workspaceMessages.en[key] ?? key).replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(params[name] ?? match));
}
