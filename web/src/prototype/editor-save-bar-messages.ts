import { APP_LOCALES, type AdminLocale } from './admin-locale';

type EditorSaveBarCopy = { save: string; exit: string; leaveTitle: string; leaveBody: string; leave: string; stay: string };
type ConfirmationCopy = { confirm: string; cancel: string };

const copy: Record<AdminLocale, EditorSaveBarCopy> = {
  en: { save: 'Save', exit: 'Exit editor', leaveTitle: 'Exit editor?', leaveBody: 'You have unsaved changes. Exit without saving?', leave: 'Exit page', stay: 'Keep editing' },
  fr: { save: 'Enregistrer', exit: 'Quitter l’éditeur', leaveTitle: 'Quitter l’éditeur ?', leaveBody: 'Vous avez des modifications non enregistrées. Quitter sans enregistrer ?', leave: 'Quitter la page', stay: 'Continuer la modification' },
  de: { save: 'Speichern', exit: 'Editor verlassen', leaveTitle: 'Editor verlassen?', leaveBody: 'Du hast ungespeicherte Änderungen. Ohne Speichern verlassen?', leave: 'Seite verlassen', stay: 'Weiter bearbeiten' },
  es: { save: 'Guardar', exit: 'Salir del editor', leaveTitle: '¿Salir del editor?', leaveBody: 'Tienes cambios sin guardar. ¿Salir sin guardar?', leave: 'Salir de la página', stay: 'Seguir editando' },
  it: { save: 'Salva', exit: 'Esci dall’editor', leaveTitle: 'Uscire dall’editor?', leaveBody: 'Sono presenti modifiche non salvate. Uscire senza salvare?', leave: 'Esci dalla pagina', stay: 'Continua a modificare' },
  nl: { save: 'Opslaan', exit: 'Editor verlaten', leaveTitle: 'Editor verlaten?', leaveBody: 'Je hebt niet-opgeslagen wijzigingen. Verlaten zonder op te slaan?', leave: 'Pagina verlaten', stay: 'Verder bewerken' },
  sv: { save: 'Spara', exit: 'Avsluta redigeraren', leaveTitle: 'Avsluta redigeraren?', leaveBody: 'Du har osparade ändringar. Avsluta utan att spara?', leave: 'Lämna sidan', stay: 'Fortsätt redigera' },
  tr: { save: 'Kaydet', exit: 'Düzenleyiciden çık', leaveTitle: 'Düzenleyiciden çıkılsın mı?', leaveBody: 'Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkılsın mı?', leave: 'Sayfadan çık', stay: 'Düzenlemeye devam et' },
  'pt-BR': { save: 'Salvar', exit: 'Sair do editor', leaveTitle: 'Sair do editor?', leaveBody: 'Você tem alterações não salvas. Sair sem salvar?', leave: 'Sair da página', stay: 'Continuar editando' },
  'zh-Hans': { save: '保存', exit: '退出编辑', leaveTitle: '退出编辑？', leaveBody: '当前修改尚未保存，确定不保存并退出吗？', leave: '退出', stay: '继续编辑' },
  'zh-Hant': { save: '儲存', exit: '退出編輯', leaveTitle: '退出編輯？', leaveBody: '目前修改尚未儲存，確定不儲存並退出嗎？', leave: '退出', stay: '繼續編輯' },
  ms: { save: 'Simpan', exit: 'Keluar editor', leaveTitle: 'Keluar editor?', leaveBody: 'Anda mempunyai perubahan yang belum disimpan. Keluar tanpa menyimpan?', leave: 'Keluar halaman', stay: 'Teruskan mengedit' },
  th: { save: 'บันทึก', exit: 'ออกจากตัวแก้ไข', leaveTitle: 'ออกจากตัวแก้ไขหรือไม่', leaveBody: 'คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่', leave: 'ออกจากหน้า', stay: 'แก้ไขต่อ' },
  id: { save: 'Simpan', exit: 'Keluar editor', leaveTitle: 'Keluar dari editor?', leaveBody: 'Anda memiliki perubahan yang belum disimpan. Keluar tanpa menyimpan?', leave: 'Keluar halaman', stay: 'Lanjutkan mengedit' },
  vi: { save: 'Lưu', exit: 'Thoát trình chỉnh sửa', leaveTitle: 'Thoát trình chỉnh sửa?', leaveBody: 'Bạn có thay đổi chưa lưu. Thoát mà không lưu?', leave: 'Thoát trang', stay: 'Tiếp tục chỉnh sửa' },
  ja: { save: '保存', exit: '編集を終了', leaveTitle: '編集を終了しますか？', leaveBody: '未保存の変更があります。保存せずに終了しますか？', leave: 'ページを終了', stay: '編集を続ける' },
};

const confirmationCopy: Record<AdminLocale, ConfirmationCopy> = {
  en: { confirm: 'Confirm', cancel: 'Cancel' }, fr: { confirm: 'Confirmer', cancel: 'Annuler' }, de: { confirm: 'Bestätigen', cancel: 'Abbrechen' }, es: { confirm: 'Confirmar', cancel: 'Cancelar' }, it: { confirm: 'Conferma', cancel: 'Annulla' }, nl: { confirm: 'Bevestigen', cancel: 'Annuleren' }, sv: { confirm: 'Bekräfta', cancel: 'Avbryt' }, tr: { confirm: 'Onayla', cancel: 'İptal' }, 'pt-BR': { confirm: 'Confirmar', cancel: 'Cancelar' }, 'zh-Hans': { confirm: '确认', cancel: '取消' }, 'zh-Hant': { confirm: '確認', cancel: '取消' }, ms: { confirm: 'Sahkan', cancel: 'Batal' }, th: { confirm: 'ยืนยัน', cancel: 'ยกเลิก' }, id: { confirm: 'Konfirmasi', cancel: 'Batal' }, vi: { confirm: 'Xác nhận', cancel: 'Hủy' }, ja: { confirm: '確認', cancel: 'キャンセル' },
};

const createCopy: Record<AdminLocale, string> = {
  en: 'Create', fr: 'Créer', de: 'Erstellen', es: 'Crear', it: 'Crea', nl: 'Aanmaken', sv: 'Skapa', tr: 'Oluştur', 'pt-BR': 'Criar', 'zh-Hans': '创建', 'zh-Hant': '建立', ms: 'Cipta', th: 'สร้าง', id: 'Buat', vi: 'Tạo', ja: '作成',
};

export function editorSaveBarText(language: string | undefined): EditorSaveBarCopy & ConfirmationCopy & { create: string } {
  const locale = APP_LOCALES.find((item) => item.toLowerCase() === language?.toLowerCase()) ?? 'en';
  return { ...copy[locale], ...confirmationCopy[locale], create: createCopy[locale] };
}
