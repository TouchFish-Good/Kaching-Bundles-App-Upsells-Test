export function renderAppBootstrapError(documentRef: Document = document): void {
  const root = documentRef.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  const main = documentRef.createElement('main');
  main.setAttribute('role', 'alert');
  main.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:32px;background:#f6f6f6;color:#102a2a;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center';
  const content = documentRef.createElement('div');
  const title = documentRef.createElement('h1');
  title.textContent = '应用加载失败';
  title.style.cssText = 'margin:0 0 12px;font-size:22px';
  const body = documentRef.createElement('p');
  body.textContent = '页面初始化没有完成，请重新加载。';
  body.style.cssText = 'margin:0 0 20px;color:#536865';
  const retry = documentRef.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新加载';
  retry.style.cssText = 'min-height:40px;padding:0 18px;border:0;border-radius:6px;background:#0f766e;color:#fff;font:inherit;font-weight:700;cursor:pointer';
  retry.addEventListener('click', () => window.location.reload());
  content.append(title, body, retry);
  main.append(content);
  root.append(main);
}
