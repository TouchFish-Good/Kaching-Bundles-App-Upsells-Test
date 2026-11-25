/**
 * Keep the compiled CSS and its CSS-module names atomic with the HTML release.
 * @returns {import('vite').Plugin}
 */
export function inlineEntryStyles() {
  return {
    name: 'inline-entry-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
        const styles = [];
        const html = String(asset.source).replace(/<link\b[^>]*>/g, (tag) => {
          if (!/\brel=["']stylesheet["']/.test(tag)) return tag;
          const href = tag.match(/\bhref=["']([^"']+)["']/)?.[1];
          const css = href && bundle[href.replace(/^\.?\//, '')];
          if (!css || css.type !== 'asset' || !css.fileName.endsWith('.css')) {
            throw new Error(`Cannot inline production stylesheet: ${href}`);
          }
          styles.push(String(css.source).replace(/<\/style/gi, '<\\/style'));
          return '';
        });
        if (styles.length) {
          asset.source = html.replace('<head>', `<head>\n<style id="quantity-breaks-production-styles">${styles.join('\n')}</style>`);
        }
      }
    },
  };
}
