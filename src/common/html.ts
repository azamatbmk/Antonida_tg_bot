export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f1ea;
        color: #2b2118;
      }
      main {
        width: min(440px, calc(100% - 32px));
        background: #fff;
        border-radius: 20px;
        padding: 28px 24px;
        box-shadow: 0 16px 40px rgba(43, 33, 24, 0.08);
      }
      h1 { font-size: 22px; margin: 0 0 12px; }
      p { margin: 0 0 12px; line-height: 1.5; }
      .muted { color: #7a6a5c; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}
