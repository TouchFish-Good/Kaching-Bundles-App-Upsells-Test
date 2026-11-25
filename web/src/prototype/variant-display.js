const MIN_IMAGE_TILE_SIZE = 10;
const MAX_IMAGE_TILE_SIZE = 96;
const MIN_WIDGET_FONT_SIZE = 12;
const MAX_WIDGET_FONT_SIZE = 20;

/**
 * Keeps merchant-configured image choices within the supported size range.
 *
 * @param {number} value
 */
export function normalizeImageTileSize(value) {
  return Math.min(MAX_IMAGE_TILE_SIZE, Math.max(MIN_IMAGE_TILE_SIZE, Math.round(value)));
}

/** @param {number} value */
export function normalizeWidgetFontSize(value) {
  return Math.min(MAX_WIDGET_FONT_SIZE, Math.max(MIN_WIDGET_FONT_SIZE, Math.round(value)));
}

/**
 * @param {Array<{ id: string, color: string, size: string, inventory: number, inventoryPolicy?: 'deny'|'continue', inventoryTracker?: boolean, available: boolean, image: string | null }>} variants
 * @param {{ showColorValue?: boolean, isSoldOut?: (variant: { color: string, size: string, inventory: number, inventoryPolicy?: 'deny'|'continue', inventoryTracker?: boolean, available: boolean }) => boolean }} [options]
 */
export function createVariantImageTiles(variants, options = {}) {
  return variants.map((variant) => ({
    id: variant.id,
    label: `${variant.color} / ${variant.size}`,
    image: variant.image,
    disabled: false,
    status: (options.isSoldOut ? !options.isSoldOut(variant) : variant.inventoryTracker === false || variant.inventoryPolicy === "continue" || (variant.available && variant.inventory > 0)) ? `${variant.inventory} left` : "Sold out",
    colorLabel: options.showColorValue ? variant.color : null,
  }));
}
