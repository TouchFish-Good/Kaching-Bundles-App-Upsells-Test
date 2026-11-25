function readEmbeddedPath(search: string): string | null {
  let path = new URLSearchParams(search).get('path');
  if (!path) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if (!path.startsWith('/quantity-breaks') && !path.startsWith('/product-discount-customizations/') && !path.startsWith('/admin/apps/')) return null;
  return path;
}

export function resolveEntryPath(pathname: string, search = ""): string {
  if (pathname === "/") return resolveEntryPath(readEmbeddedPath(search) ?? "/quantity-breaks");
  const shoplineDiscount = pathname.match(/^\/admin\/apps\/[^/]+\/product-discount-customizations\/([^/]+)\/([^/]+)\/?$/);
  if (shoplineDiscount) return `/product-discount-customizations/${shoplineDiscount[1]}/${shoplineDiscount[2]}`;
  return pathname;
}

export function resolveEntryHref(pathname: string, search = "", hash = ""): string {
  return `${resolveEntryPath(pathname, search)}${search}${hash}`;
}
