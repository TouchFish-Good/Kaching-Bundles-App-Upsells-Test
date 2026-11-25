import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import styles from '../pages/quantity-breaks.module.css';
import { SelectionDialog } from './SelectionDialog';

export type ProductVariant = { id: string; title: string; price: number; compareAtPrice: number | null; options: Array<{ name: string; value: string }>; imageUrl: string | null; inventory: number; inventoryPolicy: 'deny' | 'continue'; inventoryTracker?: boolean; available: boolean };
export type Product = { id: string; title: string; imageUrl: string | null; optionNames?: string[]; variants?: ProductVariant[] };
type Labels = { search: string; loading: string; empty: string; failed: string; unavailable?: string; previous: string; next: string; retry: string; remove: string; add: string; selectTitle: string; selectedTitle: string; viewSelected: string; cancel: string; selectItems: (count: number) => string; close: string; selectedCount: (count: number) => string };
const labels: Record<string, Labels> = {
  en: { search: 'Search products', loading: 'Loading products...', empty: 'No products found', failed: 'Could not load products', unavailable: 'Unavailable product', previous: 'Previous', next: 'Next', retry: 'Retry', remove: 'Remove', add: 'Add products', selectTitle: 'Select products', selectedTitle: 'Selected products', viewSelected: 'View selected items', cancel: 'Cancel', selectItems: (count) => `Select ${count} ${count === 1 ? 'item' : 'items'}`, close: 'Close', selectedCount: (count) => `${count} selected` },
  fr: { search: 'Rechercher des produits', loading: 'Chargement des produits...', empty: 'Aucun produit trouvé', failed: 'Chargement impossible', unavailable: 'Produit indisponible', previous: 'Précédent', next: 'Suivant', retry: 'Réessayer', remove: 'Retirer', add: 'Ajouter des produits', selectTitle: 'Sélectionner des produits', selectedTitle: 'Produits sélectionnés', viewSelected: 'Voir les éléments sélectionnés', cancel: 'Annuler', selectItems: (count) => `Sélectionner ${count} ${count === 1 ? 'article' : 'articles'}`, close: 'Fermer', selectedCount: (count) => `${count} sélectionnés` },
  de: { search: 'Produkte suchen', loading: 'Produkte werden geladen...', empty: 'Keine Produkte gefunden', failed: 'Produkte konnten nicht geladen werden', previous: 'Zurück', next: 'Weiter', retry: 'Erneut versuchen', remove: 'Entfernen', add: 'Produkte hinzufügen', selectTitle: 'Produkte auswählen', selectedTitle: 'Ausgewählte Produkte', viewSelected: 'Ausgewählte Elemente anzeigen', cancel: 'Abbrechen', selectItems: (count) => `${count} Elemente auswählen`, close: 'Schließen', selectedCount: (count) => `${count} ausgewählt` },
  es: { search: 'Buscar productos', loading: 'Cargando productos...', empty: 'No se encontraron productos', failed: 'No se pudieron cargar los productos', previous: 'Anterior', next: 'Siguiente', retry: 'Reintentar', remove: 'Quitar', add: 'Añadir productos', selectTitle: 'Seleccionar productos', selectedTitle: 'Productos seleccionados', viewSelected: 'Ver elementos seleccionados', cancel: 'Cancelar', selectItems: (count) => `Seleccionar ${count} elementos`, close: 'Cerrar', selectedCount: (count) => `${count} seleccionados` },
  it: { search: 'Cerca prodotti', loading: 'Caricamento prodotti...', empty: 'Nessun prodotto trovato', failed: 'Impossibile caricare prodotti', previous: 'Precedente', next: 'Successivo', retry: 'Riprova', remove: 'Rimuovi', add: 'Aggiungi prodotti', selectTitle: 'Seleziona prodotti', selectedTitle: 'Prodotti selezionati', viewSelected: 'Visualizza elementi selezionati', cancel: 'Annulla', selectItems: (count) => `Seleziona ${count} elementi`, close: 'Chiudi', selectedCount: (count) => `${count} selezionati` },
  nl: { search: 'Producten zoeken', loading: 'Producten laden...', empty: 'Geen producten gevonden', failed: 'Producten laden mislukt', previous: 'Vorige', next: 'Volgende', retry: 'Opnieuw proberen', remove: 'Verwijderen', add: 'Producten toevoegen', selectTitle: 'Producten selecteren', selectedTitle: 'Geselecteerde producten', viewSelected: 'Geselecteerde items bekijken', cancel: 'Annuleren', selectItems: (count) => `${count} items selecteren`, close: 'Sluiten', selectedCount: (count) => `${count} geselecteerd` },
  sv: { search: 'Sök produkter', loading: 'Läser in produkter...', empty: 'Inga produkter hittades', failed: 'Kunde inte läsa in produkter', previous: 'Föregående', next: 'Nästa', retry: 'Försök igen', remove: 'Ta bort', add: 'Lägg till produkter', selectTitle: 'Välj produkter', selectedTitle: 'Valda produkter', viewSelected: 'Visa valda objekt', cancel: 'Avbryt', selectItems: (count) => `Välj ${count} objekt`, close: 'Stäng', selectedCount: (count) => `${count} valda` },
  tr: { search: 'Ürün ara', loading: 'Ürünler yükleniyor...', empty: 'Ürün bulunamadı', failed: 'Ürünler yüklenemedi', previous: 'Önceki', next: 'Sonraki', retry: 'Yeniden dene', remove: 'Kaldır', add: 'Ürün ekle', selectTitle: 'Ürünleri seç', selectedTitle: 'Seçilen ürünler', viewSelected: 'Seçilenleri görüntüle', cancel: 'İptal', selectItems: (count) => `${count} öğe seç`, close: 'Kapat', selectedCount: (count) => `${count} seçildi` },
  'pt-BR': { search: 'Buscar produtos', loading: 'Carregando produtos...', empty: 'Nenhum produto encontrado', failed: 'Não foi possível carregar produtos', previous: 'Anterior', next: 'Próxima', retry: 'Tentar novamente', remove: 'Remover', add: 'Adicionar produtos', selectTitle: 'Selecionar produtos', selectedTitle: 'Produtos selecionados', viewSelected: 'Ver itens selecionados', cancel: 'Cancelar', selectItems: (count) => `Selecionar ${count} itens`, close: 'Fechar', selectedCount: (count) => `${count} selecionados` },
  'zh-Hans': { search: '搜索商品', loading: '正在加载商品...', empty: '未找到商品', failed: '商品加载失败', unavailable: '商品暂不可用', previous: '上一页', next: '下一页', retry: '重试', remove: '移除', add: '添加商品', selectTitle: '选择商品', selectedTitle: '已选商品', viewSelected: '查看已选项', cancel: '取消', selectItems: (count) => `选择 ${count} 项`, close: '关闭', selectedCount: (count) => `已选 ${count} 项` },
  'zh-Hant': { search: '搜尋商品', loading: '正在載入商品...', empty: '找不到商品', failed: '商品載入失敗', unavailable: '商品暫不可用', previous: '上一頁', next: '下一頁', retry: '重試', remove: '移除', add: '新增商品', selectTitle: '選擇商品', selectedTitle: '已選商品', viewSelected: '查看已選項', cancel: '取消', selectItems: (count) => `選擇 ${count} 項`, close: '關閉', selectedCount: (count) => `已選 ${count} 項` },
};
const previewLabels = {
  en: { product: 'Product', previewTrigger: 'Choose preview product' }, fr: { product: 'Produit', previewTrigger: 'Choisir le produit à prévisualiser' }, de: { product: 'Produkt', previewTrigger: 'Vorschauprodukt auswählen' }, es: { product: 'Producto', previewTrigger: 'Elegir producto de vista previa' }, it: { product: 'Prodotto', previewTrigger: 'Scegli prodotto di anteprima' }, nl: { product: 'Product', previewTrigger: 'Voorbeeldproduct kiezen' }, sv: { product: 'Produkt', previewTrigger: 'Välj produkt för förhandsvisning' }, tr: { product: 'Ürün', previewTrigger: 'Önizleme ürünü seç' }, 'pt-BR': { product: 'Produto', previewTrigger: 'Escolher produto para prévia' }, 'zh-Hans': { product: '商品', previewTrigger: '指定商品预览' }, 'zh-Hant': { product: '商品', previewTrigger: '指定商品預覽' },
};

export function productPickerLabels(locale: string) { return { ...(labels[locale] ?? labels.en), ...(previewLabels[locale as keyof typeof previewLabels] ?? previewLabels.en) }; }
type Props = { fetcher: typeof fetch; selectedIds: string[]; onChange: (ids: string[]) => void; locale: string; onPreviewProduct?: (product: Product) => void; inputId?: string; pageSize?: number; autoPreviewFirst?: boolean; mode?: 'inline' | 'dialog'; selectionLimit?: number; triggerLabel?: string; compactTrigger?: boolean; showSelectedItems?: boolean };

export function CampaignProductPicker({ fetcher, selectedIds, onChange, locale, onPreviewProduct, inputId = 'campaign-product-search', pageSize = 50, autoPreviewFirst = false, mode = 'inline', selectionLimit, triggerLabel, compactTrigger = false, showSelectedItems = true }: Props) {
  const copy = productPickerLabels(locale);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const composing = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Record<string, Product>>({});
  const [selectedLoadError, setSelectedLoadError] = useState(false);
  const [selectedRetry, setSelectedRetry] = useState(0);
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selecting, setSelecting] = useState(false);
  const [viewingSelected, setViewingSelected] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const ids = selectedIds.filter((id) => !selected[id]);
    if (!ids.length) return () => controller.abort();
    setSelectedLoadError(false);
    const url = `/api/quantity-breaks/products?ids=${encodeURIComponent(ids.join(','))}`;
    void fetcher(url, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => { if (!response.ok) throw new Error('Product unavailable'); return response.json() as Promise<{ products: Product[]; missingIds: string[] }>; })
      .then(({ products, missingIds }) => {
        if (controller.signal.aborted) return;
        setSelected((current) => ({ ...current, ...Object.fromEntries(products.map((product) => [product.id, product])), ...Object.fromEntries(missingIds.map((id) => [id, { id, title: `${copy.unavailable ?? 'Unavailable product'} (${id})`, imageUrl: null }])) }));
      })
      .catch(() => { if (!controller.signal.aborted) setSelectedLoadError(true); });
    return () => controller.abort();
  }, [copy.unavailable, fetcher, selectedIds.join(','), selectedRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    const url = new URL('/api/quantity-breaks/products', window.location.origin);
    if (search) url.searchParams.set('title', search);
    url.searchParams.set('limit', String(pageSize));
    if (cursors[pageIndex]) url.searchParams.set('page_info', cursors[pageIndex]);
    void fetcher(`${url.pathname}${url.search}`, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => { if (!response.ok) throw new Error('Product search failed'); return response.json() as Promise<{ products: Product[]; nextPageInfo: string | null }>; })
      .then((page) => { if (!controller.signal.aborted) { setProducts(page.products.slice(0, pageSize)); setNextPageInfo(page.nextPageInfo); setState('ready'); } })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [fetcher, search, pageIndex, cursors, retry, pageSize]);

  useEffect(() => {
    if (autoPreviewFirst && !selectedIds.length && products[0]) onPreviewProduct?.(products[0]);
  }, [autoPreviewFirst, onPreviewProduct, products, selectedIds.length]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const updateSearch = (value: string) => {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (!composing.current) debounce.current = setTimeout(() => { setCursors([null]); setPageIndex(0); setSearch(value); }, 300);
  };
  const toggleDraft = (item: Product) => {
    setSelected((current) => ({ ...current, [item.id]: item }));
    setDraftIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : selectionLimit === 1 ? [item.id] : [...current, item.id]);
  };
  const openSelector = () => { setDraftIds(selectedIds.slice(0, selectionLimit)); setSelecting(true); };
  const selectFromInline = (item: Product) => { setSelected((current) => ({ ...current, [item.id]: item })); onPreviewProduct?.(item); if (!selectedIds.includes(item.id)) onChange([...selectedIds, item.id]); };
  const remove = (id: string) => onChange(selectedIds.filter((item) => item !== id));
  const selectedItems = selectedIds.map((id) => selected[id] ?? { id, title: selectedLoadError ? copy.unavailable ?? labels.en.unavailable! : copy.loading, imageUrl: null });
  const movePage = (direction: -1 | 1) => {
    if (direction < 0) setPageIndex((index) => index - 1);
    else if (nextPageInfo) { setCursors((current) => [...current.slice(0, pageIndex + 1), nextPageInfo]); setPageIndex((index) => index + 1); }
  };
  const pagination = <div className={styles.productPickerPagination}><button type="button" disabled={state === 'loading' || pageIndex === 0} onClick={() => movePage(-1)}>{copy.previous}</button><button type="button" disabled={state === 'loading' || !nextPageInfo || nextPageInfo === cursors[pageIndex]} onClick={() => movePage(1)}>{copy.next}</button></div>;
  const resultList = mode === 'dialog'
    ? <ul className={styles.selectorResults}>{products.map((item) => <li key={item.id}><label><input type="checkbox" checked={draftIds.includes(item.id)} onChange={() => toggleDraft(item)} />{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className={styles.selectorImageFallback} aria-hidden="true" />}<span>{item.title}</span></label></li>)}</ul>
    : <ul className={styles.productPickerResults}>{products.map((item) => <li key={item.id}><button type="button" aria-pressed={selectedIds.includes(item.id)} onClick={() => selectFromInline(item)}>{item.imageUrl && <img src={item.imageUrl} alt="" />}<span>{item.title}</span></button></li>)}</ul>;
  const listContent = <>{state === 'error' && <><p role="alert">{copy.failed}</p><button type="button" onClick={() => setRetry((count) => count + 1)}>{copy.retry}</button></>}{state === 'loading' && <p role="status">{copy.loading}</p>}{state === 'ready' && !products.length && <p role="status">{copy.empty}</p>}{products.length > 0 && resultList}{mode === 'inline' && (state === 'ready' || state === 'loading') && pagination}</>;

  if (mode === 'inline') return <div className={styles.productPicker}>
    <label className={styles.field}>{copy.search}<input id={inputId} type="search" value={query} onChange={(event) => updateSearch(event.target.value)} onCompositionStart={() => { composing.current = true; if (debounce.current) clearTimeout(debounce.current); }} onCompositionEnd={(event) => { composing.current = false; updateSearch((event.target as HTMLInputElement).value); }} /></label>
    {selectedIds.length > 0 && <ul className={styles.productPickerSelected}>{selectedItems.map((item) => <li key={item.id}><span>{item.title}</span><button type="button" aria-label={`${copy.remove} ${item.title}`} title={`${copy.remove} ${item.title}`} onClick={() => remove(item.id)}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
    {listContent}
  </div>;

  return <div className={styles.scopePicker}>
    <button type="button" className={styles.scopePickerAdd} onClick={openSelector} aria-label={compactTrigger ? triggerLabel ?? copy.add : undefined} title={compactTrigger ? triggerLabel ?? copy.add : undefined}><Plus size={16} aria-hidden="true" />{compactTrigger ? <span className={styles.srOnly}>{triggerLabel ?? copy.add}</span> : triggerLabel ?? copy.add}</button>
    {showSelectedItems && selectedIds.length > 0 && selectedIds.length <= 10 && <ul className={styles.scopePickerSelected}>{selectedItems.map((item) => <li key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className={styles.selectorImageFallback} aria-hidden="true" />}<span>{item.title}</span><button type="button" aria-label={`${copy.remove} ${item.title}`} title={`${copy.remove} ${item.title}`} onClick={() => remove(item.id)}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
    {showSelectedItems && selectedIds.length > 10 && <button type="button" className={styles.scopePickerView} onClick={() => setViewingSelected(true)}>{copy.viewSelected} ({selectedIds.length})</button>}
    {selecting && <SelectionDialog ariaLabel={copy.selectTitle} title={copy.selectTitle} closeLabel={copy.close} onClose={() => setSelecting(false)} footer={<>{(state === 'ready' || state === 'loading') && pagination}<span>{copy.selectedCount(draftIds.length)}</span><div><button type="button" onClick={() => setSelecting(false)}>{copy.cancel}</button><button type="button" className={styles.scopePickerConfirm} disabled={!draftIds.length} onClick={() => { onChange(draftIds); const preview = selected[draftIds[0]]; if (preview) onPreviewProduct?.(preview); setSelecting(false); }}>{copy.selectItems(draftIds.length)}</button></div></>}>
      <label className={styles.selectionDialogSearch}>{copy.search}<input data-dialog-autofocus type="search" value={query} onChange={(event) => updateSearch(event.target.value)} onCompositionStart={() => { composing.current = true; if (debounce.current) clearTimeout(debounce.current); }} onCompositionEnd={(event) => { composing.current = false; updateSearch((event.target as HTMLInputElement).value); }} /></label>{listContent}
    </SelectionDialog>}
    {viewingSelected && <SelectionDialog ariaLabel={copy.selectedTitle} title={copy.selectedTitle} closeLabel={copy.close} onClose={() => setViewingSelected(false)} footer={<button type="button" data-dialog-autofocus onClick={() => setViewingSelected(false)}>{copy.close}</button>}>
      {selectedLoadError && <p role="alert">{copy.failed} <button type="button" onClick={() => setSelectedRetry((count) => count + 1)}>{copy.retry}</button></p>}
      <ul className={styles.selectorResults}>{selectedItems.map((item) => <li key={item.id}><div>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className={styles.selectorImageFallback} aria-hidden="true" />}<span>{item.title}</span></div><button type="button" aria-label={`${copy.remove} ${item.title}`} onClick={() => remove(item.id)}><X size={16} aria-hidden="true" /></button></li>)}</ul>
    </SelectionDialog>}
  </div>;
}
