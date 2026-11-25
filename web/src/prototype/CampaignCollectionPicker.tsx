import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import styles from '../pages/quantity-breaks.module.css';
import { SelectionDialog } from './SelectionDialog';

type Collection = { id: string; title: string; kind: 'manual' | 'smart'; imageUrl: string | null };
type Copy = { search: string; manual: string; smart: string; previous: string; next: string; retry: string; empty: string; failed: string; remove: string; add: string; selectTitle: string; selectedTitle: string; viewSelected: string; cancel: string; close: string; selectedCount: (count: number) => string; selectItems: (count: number) => string };
const copies: Record<string, Copy> = {
  en: { search: 'Search collections', manual: 'Manual', smart: 'Smart', previous: 'Previous', next: 'Next', retry: 'Retry', empty: 'No collections found', failed: 'Could not load collections', remove: 'Remove', add: 'Add product collections', selectTitle: 'Select product collections', selectedTitle: 'Selected collections', viewSelected: 'View selected items', cancel: 'Cancel', close: 'Close', selectedCount: (count) => `${count} selected`, selectItems: (count) => `Select ${count} ${count === 1 ? 'item' : 'items'}` },
  fr: { search: 'Rechercher des collections', manual: 'Manuelles', smart: 'Automatiques', previous: 'Précédent', next: 'Suivant', retry: 'Réessayer', empty: 'Aucune collection', failed: 'Chargement impossible', remove: 'Retirer', add: 'Ajouter des collections', selectTitle: 'Sélectionner des collections', selectedTitle: 'Collections sélectionnées', viewSelected: 'Voir les éléments sélectionnés', cancel: 'Annuler', close: 'Fermer', selectedCount: (count) => `${count} sélectionnés`, selectItems: (count) => `Sélectionner ${count} éléments` },
  de: { search: 'Kollektionen suchen', manual: 'Manuell', smart: 'Automatisch', previous: 'Zurück', next: 'Weiter', retry: 'Erneut versuchen', empty: 'Keine Kollektionen', failed: 'Laden fehlgeschlagen', remove: 'Entfernen', add: 'Produktkategorien hinzufügen', selectTitle: 'Produktkategorien auswählen', selectedTitle: 'Ausgewählte Kategorien', viewSelected: 'Ausgewählte Elemente anzeigen', cancel: 'Abbrechen', close: 'Schließen', selectedCount: (count) => `${count} ausgewählt`, selectItems: (count) => `${count} Elemente auswählen` },
  es: { search: 'Buscar colecciones', manual: 'Manuales', smart: 'Automáticas', previous: 'Anterior', next: 'Siguiente', retry: 'Reintentar', empty: 'Sin colecciones', failed: 'No se pudieron cargar', remove: 'Quitar', add: 'Añadir colecciones', selectTitle: 'Seleccionar colecciones', selectedTitle: 'Colecciones seleccionadas', viewSelected: 'Ver elementos seleccionados', cancel: 'Cancelar', close: 'Cerrar', selectedCount: (count) => `${count} seleccionados`, selectItems: (count) => `Seleccionar ${count} elementos` },
  it: { search: 'Cerca collezioni', manual: 'Manuali', smart: 'Automatiche', previous: 'Precedente', next: 'Successivo', retry: 'Riprova', empty: 'Nessuna collezione', failed: 'Caricamento non riuscito', remove: 'Rimuovi', add: 'Aggiungi collezioni', selectTitle: 'Seleziona collezioni', selectedTitle: 'Collezioni selezionate', viewSelected: 'Visualizza elementi selezionati', cancel: 'Annulla', close: 'Chiudi', selectedCount: (count) => `${count} selezionati`, selectItems: (count) => `Seleziona ${count} elementi` },
  nl: { search: 'Collecties zoeken', manual: 'Handmatig', smart: 'Automatisch', previous: 'Vorige', next: 'Volgende', retry: 'Opnieuw proberen', empty: 'Geen collecties gevonden', failed: 'Collecties laden mislukt', remove: 'Verwijderen', add: 'Collecties toevoegen', selectTitle: 'Collecties selecteren', selectedTitle: 'Geselecteerde collecties', viewSelected: 'Geselecteerde items bekijken', cancel: 'Annuleren', close: 'Sluiten', selectedCount: (count) => `${count} geselecteerd`, selectItems: (count) => `${count} items selecteren` },
  sv: { search: 'Sök kollektioner', manual: 'Manuella', smart: 'Automatiska', previous: 'Föregående', next: 'Nästa', retry: 'Försök igen', empty: 'Inga kollektioner hittades', failed: 'Kunde inte läsa in kollektioner', remove: 'Ta bort', add: 'Lägg till kollektioner', selectTitle: 'Välj kollektioner', selectedTitle: 'Valda kollektioner', viewSelected: 'Visa valda objekt', cancel: 'Avbryt', close: 'Stäng', selectedCount: (count) => `${count} valda`, selectItems: (count) => `Välj ${count} objekt` },
  tr: { search: 'Koleksiyon ara', manual: 'Manuel', smart: 'Akıllı', previous: 'Önceki', next: 'Sonraki', retry: 'Yeniden dene', empty: 'Koleksiyon bulunamadı', failed: 'Koleksiyonlar yüklenemedi', remove: 'Kaldır', add: 'Koleksiyon ekle', selectTitle: 'Koleksiyonları seç', selectedTitle: 'Seçilen koleksiyonlar', viewSelected: 'Seçilenleri görüntüle', cancel: 'İptal', close: 'Kapat', selectedCount: (count) => `${count} seçildi`, selectItems: (count) => `${count} öğe seç` },
  'pt-BR': { search: 'Buscar coleções', manual: 'Manuais', smart: 'Inteligentes', previous: 'Anterior', next: 'Próxima', retry: 'Tentar novamente', empty: 'Nenhuma coleção encontrada', failed: 'Não foi possível carregar coleções', remove: 'Remover', add: 'Adicionar coleções', selectTitle: 'Selecionar coleções', selectedTitle: 'Coleções selecionadas', viewSelected: 'Ver itens selecionados', cancel: 'Cancelar', close: 'Fechar', selectedCount: (count) => `${count} selecionados`, selectItems: (count) => `Selecionar ${count} itens` },
  'zh-Hans': { search: '搜索商品分类', manual: '手动分类', smart: '智能分类', previous: '上一页', next: '下一页', retry: '重试', empty: '未找到分类', failed: '分类加载失败', remove: '移除', add: '添加商品分类', selectTitle: '选择商品分类', selectedTitle: '已选商品分类', viewSelected: '查看已选项', cancel: '取消', close: '关闭', selectedCount: (count) => `已选 ${count} 项`, selectItems: (count) => `选择 ${count} 项` },
  'zh-Hant': { search: '搜尋商品分類', manual: '手動分類', smart: '智能分類', previous: '上一頁', next: '下一頁', retry: '重試', empty: '找不到分類', failed: '分類載入失敗', remove: '移除', add: '新增商品分類', selectTitle: '選擇商品分類', selectedTitle: '已選商品分類', viewSelected: '查看已選項', cancel: '取消', close: '關閉', selectedCount: (count) => `已選 ${count} 項`, selectItems: (count) => `選擇 ${count} 項` },
};
type Props = { fetcher: typeof fetch; selectedIds: string[]; onChange: (ids: string[]) => void; locale: string; mode?: 'inline' | 'dialog' };

export function CampaignCollectionPicker({ fetcher, selectedIds, onChange, locale, mode = 'inline' }: Props) {
  const copy = copies[locale] ?? copies.en;
  const [kind, setKind] = useState<'manual' | 'smart'>('manual');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [rows, setRows] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Record<string, Collection>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [viewingSelected, setViewingSelected] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    selectedIds.filter((id) => !selected[id]).forEach((id) => {
      void fetcher(`/api/quantity-breaks/collections/${encodeURIComponent(id)}`, { signal: controller.signal, credentials: 'same-origin' })
        .then(async (response) => { if (!response.ok) throw new Error('Collection unavailable'); return response.json() as Promise<{ collection: Collection }>; })
        .then(({ collection }) => { if (!controller.signal.aborted) setSelected((current) => ({ ...current, [id]: collection })); })
        .catch(() => { if (!controller.signal.aborted) setSelected((current) => ({ ...current, [id]: { id, title: id, kind: 'manual', imageUrl: null } })); });
    });
    return () => controller.abort();
  }, [fetcher, selectedIds.join(',')]);

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL('/api/quantity-breaks/collections', window.location.origin);
    url.searchParams.set('kind', kind);
    url.searchParams.set('limit', '50');
    if (query) url.searchParams.set('title', query);
    if (cursors[pageIndex]) url.searchParams.set('page_info', cursors[pageIndex]);
    setState('loading');
    void fetcher(`${url.pathname}${url.search}`, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => { if (!response.ok) throw new Error('Collection search failed'); return response.json() as Promise<{ collections: Collection[]; nextPageInfo: string | null }>; })
      .then((page) => { if (!controller.signal.aborted) { setRows(page.collections.slice(0, 50)); setNext(page.nextPageInfo); setState('ready'); } })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [fetcher, kind, query, cursors, pageIndex, retry]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const changeInput = (value: string) => {
    setInput(value);
    if (timer.current) clearTimeout(timer.current);
    if (!composing.current) timer.current = setTimeout(() => { setCursors([null]); setPageIndex(0); setQuery(value); }, 300);
  };
  const changeKind = (value: 'manual' | 'smart') => { setKind(value); setCursors([null]); setPageIndex(0); };
  const toggleDraft = (item: Collection) => {
    setSelected((current) => ({ ...current, [item.id]: item }));
    setDraftIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
  };
  const remove = (id: string) => onChange(selectedIds.filter((item) => item !== id));
  const selectedItems = selectedIds.map((id) => selected[id] ?? { id, title: id, kind: 'manual' as const, imageUrl: null });
  const page = (direction: -1 | 1) => {
    if (direction < 0) setPageIndex((current) => current - 1);
    else if (next) { setCursors((current) => [...current.slice(0, pageIndex + 1), next]); setPageIndex((current) => current + 1); }
  };
  const pagination = <div className={styles.productPickerPagination}><button type="button" disabled={state === 'loading' || pageIndex === 0} onClick={() => page(-1)}>{copy.previous}</button><button type="button" disabled={state === 'loading' || !next || next === cursors[pageIndex]} onClick={() => page(1)}>{copy.next}</button></div>;
  const results = mode === 'dialog'
    ? <ul className={styles.selectorResults}>{rows.map((item) => <li key={item.id}><label><input type="checkbox" checked={draftIds.includes(item.id)} onChange={() => toggleDraft(item)} />{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className={styles.selectorImageFallback} aria-hidden="true" />}<span>{item.title}</span></label></li>)}</ul>
    : <ul className={styles.productPickerResults}>{rows.map((item) => <li key={item.id}><button type="button" aria-pressed={selectedIds.includes(item.id)} onClick={() => { setSelected((current) => ({ ...current, [item.id]: item })); if (!selectedIds.includes(item.id)) onChange([...selectedIds, item.id]); }}>{item.title}</button></li>)}</ul>;
  const listContent = <>{state === 'error' && <p role="alert">{copy.failed} <button type="button" onClick={() => setRetry((value) => value + 1)}>{copy.retry}</button></p>}{state === 'loading' && <p role="status">{copy.search}...</p>}{state === 'ready' && !rows.length && <p role="status">{copy.empty}</p>}{rows.length > 0 && results}{mode === 'inline' && (state === 'ready' || state === 'loading') && pagination}</>;

  if (mode === 'inline') return <div className={styles.productPicker}>
    <div className={styles.collectionKinds} role="group" aria-label={copy.search}><button type="button" aria-pressed={kind === 'manual'} onClick={() => changeKind('manual')}>{copy.manual}</button><button type="button" aria-pressed={kind === 'smart'} onClick={() => changeKind('smart')}>{copy.smart}</button></div>
    <label className={styles.field}>{copy.search}<input id="campaign-collection-search" type="search" value={input} onChange={(event) => changeInput(event.target.value)} onCompositionStart={() => { composing.current = true; if (timer.current) clearTimeout(timer.current); }} onCompositionEnd={(event) => { composing.current = false; changeInput((event.target as HTMLInputElement).value); }} /></label>
    {selectedIds.length > 0 && <ul className={styles.productPickerSelected}>{selectedItems.map((item) => <li key={item.id}><span>{item.title}</span><button type="button" aria-label={`${copy.remove} ${item.title}`} onClick={() => remove(item.id)}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
    {listContent}
  </div>;

  return <div className={styles.scopePicker}>
    <button type="button" className={styles.scopePickerAdd} onClick={() => { setDraftIds([...selectedIds]); setSelecting(true); }}><Plus size={16} aria-hidden="true" />{copy.add}</button>
    {selectedIds.length > 0 && selectedIds.length <= 10 && <ul className={styles.scopePickerSelected}>{selectedItems.map((item) => <li key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className={styles.selectorImageFallback} aria-hidden="true" />}<span>{item.title}</span><button type="button" aria-label={`${copy.remove} ${item.title}`} onClick={() => remove(item.id)}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
    {selectedIds.length > 10 && <button type="button" className={styles.scopePickerView} onClick={() => setViewingSelected(true)}>{copy.viewSelected} ({selectedIds.length})</button>}
    {selecting && <SelectionDialog ariaLabel={copy.selectTitle} title={copy.selectTitle} closeLabel={copy.close} onClose={() => setSelecting(false)} footer={<>{(state === 'ready' || state === 'loading') && pagination}<span>{copy.selectedCount(draftIds.length)}</span><div><button type="button" onClick={() => setSelecting(false)}>{copy.cancel}</button><button type="button" className={styles.scopePickerConfirm} disabled={!draftIds.length} onClick={() => { onChange(draftIds); setSelecting(false); }}>{copy.selectItems(draftIds.length)}</button></div></>}>
      <div className={styles.collectionKinds} role="group" aria-label={copy.search}><button type="button" aria-pressed={kind === 'manual'} onClick={() => changeKind('manual')}>{copy.manual}</button><button type="button" aria-pressed={kind === 'smart'} onClick={() => changeKind('smart')}>{copy.smart}</button></div><label className={styles.selectionDialogSearch}>{copy.search}<input data-dialog-autofocus type="search" value={input} onChange={(event) => changeInput(event.target.value)} onCompositionStart={() => { composing.current = true; if (timer.current) clearTimeout(timer.current); }} onCompositionEnd={(event) => { composing.current = false; changeInput((event.target as HTMLInputElement).value); }} /></label>{listContent}
    </SelectionDialog>}
    {viewingSelected && <SelectionDialog ariaLabel={copy.selectedTitle} title={copy.selectedTitle} closeLabel={copy.close} onClose={() => setViewingSelected(false)} footer={<button type="button" data-dialog-autofocus onClick={() => setViewingSelected(false)}>{copy.close}</button>}>
      <ul className={styles.selectorResults}>{selectedItems.map((item) => <li key={item.id}><div>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className={styles.selectorImageFallback} aria-hidden="true" />}<span>{item.title}</span></div><button type="button" aria-label={`${copy.remove} ${item.title}`} onClick={() => remove(item.id)}><X size={16} aria-hidden="true" /></button></li>)}</ul>
    </SelectionDialog>}
  </div>;
}
