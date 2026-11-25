import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from '../admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from '../admin-request-headers';

export function buildProductCreateUrl(handle: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle)) throw new Error('Invalid store handle');
  return `https://${handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}/products/products.json`;
}

export default async function createProductService(handle, token) {
  try {
    const url = buildProductCreateUrl(handle);
    const bodyParams = {
      product: {
        title: `shopline app test product`,
      },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': SHOPLINE_USER_AGENT,
        Accept: SHOPLINE_ACCEPT,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(bodyParams),
    });
    if (!/2[0-9]+/.test(`${response.status}`)) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return {
      headers: response.headers,
      data,
    };
  } catch (error) {
    throw error;
  }
}
