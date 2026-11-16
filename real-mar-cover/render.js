// Renderiza cover.html -> PNG/JPG (1640x624, 2x = 3280x1248) e gera uma pré-visualização
// com as zonas de recorte do Facebook (desktop, telemóvel + foto de perfil).
// Uso: node render.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const dir = __dirname;
  const out = path.join(dir, 'output');
  fs.mkdirSync(out, { recursive: true });
  const url = 'file://' + path.join(dir, 'cover.html');
  const browser = await chromium.launch();

  for (const [scale, name] of [[1, 'real-mar-capa-1640x624'], [2, 'real-mar-capa-3280x1248']]) {
    const page = await browser.newPage({ viewport: { width: 1640, height: 624 }, deviceScaleFactor: scale });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, name + '.png'), clip: { x: 0, y: 0, width: 1640, height: 624 } });
    if (scale === 1) await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 1640, height: 624 } });
    await page.close();
  }

  // Pré-visualização: desktop (completo) e telemóvel (recorte central 3:2 + foto de perfil)
  const png = 'data:image/png;base64,' + fs.readFileSync(path.join(out, 'real-mar-capa-1640x624.png')).toString('base64');
  const p = await browser.newPage({ viewport: { width: 1700, height: 1180 }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0;background:#e9ebee;font:600 20px sans-serif;color:#333">
    <div style="padding:20px 30px">Desktop (820×312)</div>
    <div style="position:relative;width:1640px;height:624px;margin:0 30px;transform-origin:0 0;transform:scale(.99)">
      <img src="${png}" style="display:block;width:1640px">
      <div style="position:absolute;left:60px;bottom:-130px;width:330px;height:330px;border-radius:50%;background:#7a8aa6;border:8px solid #fff;opacity:.9"></div>
    </div>
    <div style="padding:150px 30px 10px">Telemóvel (recorte central ~3:2 + foto de perfil)</div>
    <div style="position:relative;width:936px;height:624px;margin:0 30px;overflow:hidden;">
      <img src="${png}" style="position:absolute;left:-352px;top:0;width:1640px">
      <div style="position:absolute;left:50%;bottom:-141px;width:415px;height:415px;margin-left:-207px;border-radius:50%;background:#7a8aa6;border:8px solid #fff;opacity:.9"></div>
    </div></body>`);
  await p.screenshot({ path: path.join(out, 'preview-recortes.png'), fullPage: true });
  await browser.close();
  console.log('ok');
})();
