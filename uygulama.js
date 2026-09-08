/* MİHENK — arayüz.
   veri.json günlük toplayıcıdan gelir (analiz orada hesaplanır).
   Fiyatlar ayrıca tarayıcıdan canlı tazelenir; analiz metinleri hesaplandığı ana aittir. */

'use strict';

let V = null;              // veri.json
let canliFiyat = null;     // tarayıcıdan gelen anlık fiyatlar

/* ——————————————————— biçimlendirme ——————————————————— */
const nf = (n, o = {}) => (n == null || !isFinite(n)) ? '—' : new Intl.NumberFormat('tr-TR', o).format(n);
const para = (n, ond = 2) => nf(n, { minimumFractionDigits: ond, maximumFractionDigits: ond });
const yuzde = (n, ond = 1) => n == null ? '—' : (n > 0 ? '+' : '') + nf(n, { minimumFractionDigits: ond, maximumFractionDigits: ond }) + '%';
const sinif = n => n == null ? 'notr' : n > 0 ? 'arti' : n < 0 ? 'eksi' : 'notr';
const kaks = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const buyukSayi = n => {
  if (n == null) return '—';
  if (n >= 1e9) return nf(n / 1e9, { maximumFractionDigits: 2 }) + ' milyar';
  if (n >= 1e6) return nf(n / 1e6, { maximumFractionDigits: 1 }) + ' milyon';
  if (n >= 1e3) return nf(n / 1e3, { maximumFractionDigits: 0 }) + ' bin';
  return nf(n);
};

function gecenSure(iso) {
  if (!iso) return '—';
  const dk = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return dk + ' dk önce';
  const s = Math.floor(dk / 60);
  if (s < 24) return s + ' saat önce';
  return Math.floor(s / 24) + ' gün önce';
}

const tarihTR = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/* ——————————————————— SVG grafik ——————————————————— */
// Fiyat serisi + isteğe bağlı yatay seviyeler (destek/direnç).
function cizgiGrafik(seri, { yukseklik = 168, seviyeler = [], renk = 'var(--altin)', etiketler = null } = {}) {
  if (!seri || seri.length < 2) return '<div class="kaynakNot">Grafik için yeterli veri yok.</div>';
  const G = 1000, Y = yukseklik, pd = { u: 12, s: 56, a: 18, l: 4 };
  const tumDegerler = seri.concat(seviyeler.map(s => s.fiyat).filter(x => x != null));
  let enAz = Math.min(...tumDegerler), enCok = Math.max(...tumDegerler);
  const pay = (enCok - enAz) * 0.08 || Math.abs(enCok) * 0.02 || 1;
  enAz -= pay; enCok += pay;
  const x = i => pd.l + i / (seri.length - 1) * (G - pd.l - pd.s);
  const y = v => pd.u + (1 - (v - enAz) / (enCok - enAz)) * (Y - pd.u - pd.a);

  const nokta = seri.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const alan = `${pd.l},${y(enAz)} ${nokta} ${x(seri.length - 1).toFixed(1)},${y(enAz)}`;
  const kimlik = 'g' + Math.random().toString(36).slice(2, 8);

  const cizgiler = seviyeler.filter(s => s.fiyat >= enAz && s.fiyat <= enCok).map(s => {
    const yy = y(s.fiyat).toFixed(1);
    const rk = s.tur === 'destek' ? 'var(--yesil)' : s.tur === 'direnc' ? 'var(--kirmizi)' : 'var(--cokSoluk)';
    const kesik = s.guc === 'güçlü' ? '' : 'stroke-dasharray="4 4"';
    return `<line x1="${pd.l}" y1="${yy}" x2="${G - pd.s}" y2="${yy}" stroke="${rk}" stroke-width="1" opacity=".55" ${kesik}/>
            <text class="seviyeEtiket" x="${G - pd.s + 6}" y="${+yy + 3.5}" fill="${rk}">${para(s.fiyat, s.fiyat > 500 ? 0 : 2)}</text>`;
  }).join('');

  const sonY = y(seri[seri.length - 1]);
  const eksen = etiketler ? `<text class="seviyeEtiket" x="${pd.l}" y="${Y - 4}">${kaks(etiketler[0])}</text>
     <text class="seviyeEtiket" x="${G - pd.s}" y="${Y - 4}" text-anchor="end">${kaks(etiketler[1])}</text>` : '';

  return `<svg class="grafik" viewBox="0 0 ${G} ${Y}" preserveAspectRatio="none" role="img" aria-label="fiyat grafiği">
    <defs><linearGradient id="${kimlik}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${renk}" stop-opacity=".26"/><stop offset="100%" stop-color="${renk}" stop-opacity="0"/>
    </linearGradient></defs>
    ${cizgiler}
    <polygon points="${alan}" fill="url(#${kimlik})"/>
    <polyline points="${nokta}" fill="none" stroke="${renk}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(seri.length - 1).toFixed(1)}" cy="${sonY.toFixed(1)}" r="3" fill="${renk}"/>
    ${eksen}
  </svg>`;
}

// Küçük satır içi grafik (tablo hücrelerinde).
function mini(seri, renk) {
  if (!seri || seri.length < 2) return '';
  const enAz = Math.min(...seri), enCok = Math.max(...seri), a = (enCok - enAz) || 1;
  const p = seri.map((v, i) => `${(i / (seri.length - 1) * 74).toFixed(1)},${(20 - (v - enAz) / a * 18).toFixed(1)}`).join(' ');
  return `<svg width="74" height="22" viewBox="0 0 74 22" style="vertical-align:middle"><polyline points="${p}" fill="none" stroke="${renk}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
}

/* ——————————————————— ortak parçalar ——————————————————— */
function kararKarti(karar, etiket) {
  return `<div class="kart karar ${kaks(karar.tur)}">
    <div class="kararEtiket">${kaks(etiket)}</div>
    <div class="kararBaslik">${kaks(karar.baslik)}</div>
    <div class="kararGerekce">${kaks(karar.gerekce)}</div>
  </div>`;
}

function haberListesi(haberler, adet = 6) {
  if (!haberler?.length) return '<div class="kaynakNot">Şu an ilgili haber bulunamadı.</div>';
  return haberler.slice(0, adet).map(h => `<a class="haber" href="${kaks(h.bag)}" target="_blank" rel="noopener">
    <div class="haberBaslik">${kaks(h.baslik)}</div>
    <div class="haberAlt"><span>${kaks(h.kaynak || 'kaynak')}</span><span>${gecenSure(h.tarih)}</span></div>
  </a>`).join('');
}

/* ——————————————————— PANEL: BUGÜN ——————————————————— */
function panelBugun() {
  const p = V.piyasa, m = V.metaller;
  const g = canliFiyat || {};
  const gramAltin = g.gramAltin ?? p.gram?.altin;
  const gramGumus = g.gramGumus ?? p.gram?.gumus;
  const onsAltin = g.onsAltin ?? p.onsAltin;
  const onsGumus = g.onsGumus ?? p.onsGumus;

  const serit = `<div class="serit">
    ${[
      ['Gram altın', para(gramAltin, 0) + ' ₺', p.truncgil?.gramAltin?.degisim],
      ['Gram gümüş', para(gramGumus, 2) + ' ₺', p.truncgil?.gramGumus?.degisim],
      ['Ons altın', '$' + para(onsAltin, 0), m.altin?.degisim.gun],
      ['Ons gümüş', '$' + para(onsGumus, 2), m.gumus?.degisim.gun],
      ['Dolar/TL', para(p.usdtry, 3) + ' ₺', p.truncgil?.usd?.degisim],
      ['BIST 100', nf(p.bist100, { maximumFractionDigits: 0 }), p.bistDegisim]
    ].map(([ad, dg, dgs]) => `<div class="seritHucre">
      <div class="seritAd">${ad}</div>
      <div class="seritDeger">${dg}</div>
      <div class="seritAlt ${sinif(dgs)}">${yuzde(dgs, 2)}</div>
    </div>`).join('')}
  </div>`;

  // Üç alanın hükmü tek bakışta.
  const yaklasan = V.arz.arzlar.filter(a => V.arz.yaklasanlar.includes(a.slug));
  const arzKarar = yaklasan.length
    ? { tur: yaklasan[0].degerlendirme.karar.tur, baslik: `${yaklasan[0].kod} — ${yaklasan[0].degerlendirme.karar.baslik}`, gerekce: yaklasan[0].degerlendirme.karar.gerekce }
    : { tur: 'notr', baslik: 'Talep toplaması süren arz yok', gerekce: `Şu an açık bir halka arz bulunmuyor. ${V.arz.ozetler['2026'].arzSayisi} arzla geçen 2026’nın medyan getirisi %${V.arz.ozetler['2026'].medyanGetiri}.` };

  // Etiketlere metale özgü sayı eklenir; iki metal aynı teknik konumdaysa
  // kartlar birbirinin kopyası gibi görünmesin.
  const metalEtiket = (ad, veri) => {
    const d1 = veri.seviyeler.destek[0];
    return `${ad} · trend ${veri.trendPuani >= 0 ? '+' : ''}${veri.trendPuani} · RSI ${para(veri.teknik.rsi, 0)}` +
      (d1 ? ` · destek ${para(d1.fiyat, d1.fiyat > 500 ? 0 : 2)}` : '');
  };
  const arzEtiket = yaklasan.length
    ? `Halka arz · ${yaklasan[0].kod} puan ${yaklasan[0].degerlendirme.puan}/100`
    : 'Halka arz';

  const kararlar = `<div class="izgara i3">
    ${kararKarti(m.altin.karar, metalEtiket('Altın', m.altin))}
    ${kararKarti(m.gumus.karar, metalEtiket('Gümüş', m.gumus))}
    ${kararKarti(arzKarar, arzEtiket)}
  </div>`;

  // Günün tek cümlelik hamlesi — en yüksek öncelikli eylem.
  const hamle = gununHamlesi();

  const oran = V.oran ? `<div class="kart">
    <div class="baslikSatir"><h2>Altın / gümüş oranı</h2>
      <span class="not">1 ons altın = ${para(V.oran.simdi, 1)} ons gümüş</span></div>
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">${cizgiGrafik(V.oran.seri, { yukseklik: 92, renk: 'var(--gumus)', etiketler: ['180 gün önce', 'bugün'] })}</div>
      <div style="flex:1.4;min-width:250px">
        <div style="font-size:12px;color:var(--cokSoluk);margin-bottom:6px">2 yıllık bandın %${nf(V.oran.dilim)} diliminde (${para(V.oran.enDusuk, 0)}–${para(V.oran.enYuksek, 0)})</div>
        <div style="font-size:13.5px;color:var(--soluk);line-height:1.6">${kaks(V.oran.yorum)}</div>
      </div>
    </div>
  </div>` : '';

  return `
    <section>${serit}</section>
    <section>
      <div class="baslikSatir"><h2>Bugün ne yapmalı</h2><span class="not">${tarihTR(V.bugun)}</span></div>
      ${hamle}
    </section>
    <section>${kararlar}</section>
    <section>${oran}</section>
    <section>
      <div class="baslikSatir"><h2>Gündem</h2><span class="not">Google Haberler üzerinden, son 24-48 saat</span></div>
      <div class="izgara i2">
        <div class="kart"><div class="kararEtiket">Altın &amp; gümüş</div>${haberListesi((V.haberler.altin || []).concat(V.haberler.gumus || []).slice(0, 6))}</div>
        <div class="kart"><div class="kararEtiket">Halka arz</div>${haberListesi(V.haberler.arz, 6)}</div>
      </div>
    </section>`;
}

// En yüksek öncelikli eylemi seçer: açık arz > aşırı uç teknik > kademe seviyesine yakınlık.
function gununHamlesi() {
  const m = V.metaller;
  const yaklasan = V.arz.arzlar.filter(a => V.arz.yaklasanlar.includes(a.slug));
  const satirlar = [];

  for (const y of yaklasan) {
    const d = y.degerlendirme;
    const sonGun = y.tarih?.bitis;
    satirlar.push({
      oncelik: 1,
      metin: `<strong>${kaks(y.kod)}</strong> talep toplaması ${kaks(y.tarihMetni)} — son gün ${tarihTR(sonGun)}. Puan ${d.puan}/100, en benzer ${d.benzerler.length} arzın medyan getirisi ${yuzde(d.benzerMedyan)}. ${kaks(d.karar.baslik)}.`
    });
  }

  for (const [ad, veri] of [['Altın', m.altin], ['Gümüş', m.gumus]]) {
    if (!veri) continue;
    const d1 = veri.seviyeler.destek[0];
    const yakinlik = d1 ? Math.abs(d1.uzaklikYuzde) : 99;
    if (veri.teknik.rsi >= 70) {
      satirlar.push({ oncelik: 2, metin: `<strong>${ad}</strong> RSI ${para(veri.teknik.rsi, 1)} ile aşırı alım bölgesinde — yeni alım için ${para(d1?.fiyat, d1?.fiyat > 500 ? 0 : 2)} desteğine çekilmesini beklemek daha iyi.` });
    } else if (veri.teknik.rsi <= 32) {
      satirlar.push({ oncelik: 2, metin: `<strong>${ad}</strong> RSI ${para(veri.teknik.rsi, 1)} ile aşırı satım bölgesinde — kademeli alım için ilk fırsat penceresi açık.` });
    } else if (yakinlik <= 1.5) {
      satirlar.push({ oncelik: 3, metin: `<strong>${ad}</strong> ${para(d1.fiyat, d1.fiyat > 500 ? 0 : 2)} desteğine ${para(Math.abs(d1.uzaklikYuzde), 2)}% mesafede — planlanan kademe tetiklenmek üzere.` });
    }
  }

  if (!satirlar.length) {
    satirlar.push({ oncelik: 9, metin: 'Acil bir hamle gerektiren gelişme yok. Kademeli alım emirlerini destek seviyelerinde bekletmek yeterli.' });
  }

  satirlar.sort((a, b) => a.oncelik - b.oncelik);
  return `<div class="kart" style="border-color:var(--altinKoyu);background:linear-gradient(180deg,var(--altinSis),transparent 70%)">
    ${satirlar.slice(0, 3).map((s, i) => `<div style="display:flex;gap:12px;padding:${i ? '11px' : '0'} 0 ${i === Math.min(satirlar.length, 3) - 1 ? '0' : '11px'};${i ? 'border-top:1px solid var(--cizgi)' : ''}">
      <span style="color:var(--altin);font:700 13px var(--mono);flex-shrink:0">${i + 1}</span>
      <span style="font-size:14px;line-height:1.6;color:var(--metin)">${s.metin}</span>
    </div>`).join('')}
  </div>`;
}

/* ——————————————————— PANEL: METAL ——————————————————— */
function panelMetal(anahtar) {
  const m = V.metaller[anahtar];
  if (!m) return '<div class="kart">Bu metal için veri alınamadı.</div>';
  const altinMi = anahtar === 'altin';
  const renk = altinMi ? 'var(--altin)' : 'var(--gumus)';
  const gramTL = altinMi ? (canliFiyat?.gramAltin ?? V.piyasa.gram?.altin) : (canliFiyat?.gramGumus ?? V.piyasa.gram?.gumus);
  const ond = m.fiyat > 500 ? 0 : 2;

  const seviyeler = [
    ...m.seviyeler.destek.map(d => ({ ...d, tur: 'destek' })),
    ...m.seviyeler.direnc.map(d => ({ ...d, tur: 'direnc' }))
  ];

  const ust = `<div class="izgara i2">
    <div class="kart">
      <div class="seritAd">${altinMi ? 'Gram altın' : 'Gram gümüş'} · serbest piyasa</div>
      <div style="font:700 34px/1.1 var(--mono);margin:6px 0 4px">${para(gramTL, altinMi ? 0 : 2)} <span style="font-size:20px;color:var(--soluk)">₺</span></div>
      <div style="font-size:12.5px;color:var(--cokSoluk)">
        Ons: <span class="mono">$${para(m.fiyat, ond)}</span> ·
        Dolar/TL: <span class="mono">${para(V.piyasa.usdtry, 3)}</span>
        ${V.piyasa.gram?.[altinMi ? 'primAltin' : 'primGumus'] != null
          ? ` · piyasa primi <span class="mono ${sinif(V.piyasa.gram[altinMi ? 'primAltin' : 'primGumus'])}">${yuzde(V.piyasa.gram[altinMi ? 'primAltin' : 'primGumus'], 2)}</span>` : ''}
      </div>
    </div>
    <div class="kart">
      <div class="seritAd">Dönem getirileri (ons bazında)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px">
        ${[['1 hafta', m.degisim.hafta], ['1 ay', m.degisim.ay], ['3 ay', m.degisim.ucAy], ['6 ay', m.degisim.altiAy], ['1 yıl', m.degisim.yil], ['52h zirveden', m.teknik.y52Uzaklik]]
          .map(([ad, d]) => `<div><div style="font-size:11px;color:var(--cokSoluk)">${ad}</div><div class="mono ${sinif(d)}" style="font-size:15px;font-weight:600">${yuzde(d)}</div></div>`).join('')}
      </div>
    </div>
  </div>`;

  const sinyaller = m.sinyaller.map(s => `<div class="sinyal ${s.olumlu ? 'e' : 'h'}">
    <span class="sinyalIkon">${s.olumlu ? '↑' : '↓'}</span>
    <span>${kaks(s.metin)}</span>
    <span class="sinyalAgirlik">${s.olumlu ? '+' : '−'}${s.agirlik}</span>
  </div>`).join('');

  const plan = m.plan.kademeler.map(k => `<div class="kademe">
    <span class="kademePay">%${k.pay}</span>
    <span class="kademeFiyat">${para(k.fiyat, ond)}</span>
    <span class="kademeAd">${kaks(k.etiket)}<br><span style="color:var(--cokSoluk);font-size:11.5px">${kaks(k.not)}</span></span>
  </div>`).join('');

  const ayr = altinMi && V.ayristirma?.yil ? `<div class="kart">
    <div class="baslikSatir"><h2>TL yatırımcısı için: getiri nereden geldi?</h2></div>
    <div class="tabloKutu"><table>
      <thead><tr><th>Dönem</th><th class="say">Metal (ons)</th><th class="say">Kur (USD/TL)</th><th class="say">TL toplam</th><th class="say">Metalin payı</th></tr></thead>
      <tbody>${[['Son 1 ay', 'ay'], ['Son 3 ay', 'ucAy'], ['Son 1 yıl', 'yil']].map(([ad, k]) => {
        const a = V.ayristirma[k]; if (!a) return '';
        return `<tr><td>${ad}</td>
          <td class="say ${sinif(a.metalKatkisi)}">${yuzde(a.metalKatkisi)}</td>
          <td class="say ${sinif(a.kurKatkisi)}">${yuzde(a.kurKatkisi)}</td>
          <td class="say ${sinif(a.toplam)}"><strong>${yuzde(a.toplam)}</strong></td>
          <td class="say">${a.metalPayi != null ? '%' + nf(a.metalPayi) : '—'}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="kaynakNot" style="margin-top:10px">Gram altın TL cinsinden iki kaynaktan beslenir: ons fiyatı ve dolar kuru. Bu tablo, kazancın ne kadarının gerçekten metalden, ne kadarının TL’nin değer kaybından geldiğini ayırır. Metalin payı düşükse, aslında altın değil kur kazandırıyordur.</div>
  </div>` : '';

  const ziynet = altinMi && V.piyasa.truncgil ? `<div class="kart">
    <div class="baslikSatir"><h2>Ziynet ve ayar fiyatları</h2>
      <span class="not">serbest piyasa satış, ₺</span>
      ${V.piyasa.truncgilBayat ? `<span class="rozet kotu">${gecenSure(V.piyasa.truncgilBayat)} — kaynak yanıt vermiyor</span>` : ''}</div>
    <div class="tabloKutu"><table><tbody>
      ${[['Çeyrek', 'ceyrek'], ['Yarım', 'yarim'], ['Tam', 'tam'], ['Cumhuriyet', 'cumhuriyet'], ['Ata', 'ata'], ['22 ayar bilezik', 'ayar22'], ['18 ayar', 'ayar18'], ['14 ayar', 'ayar14']]
        .filter(([, k]) => V.piyasa.truncgil[k])
        .map(([ad, k]) => {
          const x = V.piyasa.truncgil[k];
          return `<tr><td>${ad}</td><td class="say">${para(x.satis, 0)}</td><td class="say ${sinif(x.degisim)}">${yuzde(x.degisim, 2)}</td></tr>`;
        }).join('')}
    </tbody></table></div>
  </div>` : '';

  return `
    <section>${ust}</section>
    <section>${kararKarti(m.karar, `${altinMi ? 'Altın' : 'Gümüş'} · trend puanı ${m.trendPuani >= 0 ? '+' : ''}${m.trendPuani}`)}</section>

    <section>
      <div class="baslikSatir"><h2>Fiyat ve seviyeler</h2><span class="not">son 180 işlem günü · yeşil destek, kırmızı direnç</span></div>
      <div class="grafikKutu">${cizgiGrafik(m.seri, { seviyeler, renk, yukseklik: 210, etiketler: [m.seriTarih?.[0] ?? '', m.guncelBar ?? ''] })}</div>
    </section>

    <section class="izgara i2">
      <div class="kart">
        <div class="baslikSatir"><h2>Destek ve direnç</h2></div>
        <div class="tabloKutu"><table>
          <thead><tr><th>Seviye</th><th class="say">Fiyat</th><th class="say">Uzaklık</th><th>Güç</th></tr></thead>
          <tbody>
            ${m.seviyeler.direnc.slice().reverse().map(d => `<tr><td><span class="rozet kotu">direnç</span></td><td class="say">${para(d.fiyat, ond)}</td><td class="say arti">${yuzde(d.uzaklikYuzde, 2)}</td><td>${kaks(d.guc)} · ${d.dokunus} dokunuş</td></tr>`).join('')}
            <tr style="background:var(--kat3)"><td><strong>şu an</strong></td><td class="say"><strong>${para(m.fiyat, ond)}</strong></td><td class="say">—</td><td>—</td></tr>
            ${m.seviyeler.destek.map(d => `<tr><td><span class="rozet iyi">destek</span></td><td class="say">${para(d.fiyat, ond)}</td><td class="say eksi">${yuzde(d.uzaklikYuzde, 2)}</td><td>${kaks(d.guc)} · ${d.dokunus} dokunuş</td></tr>`).join('')}
          </tbody>
        </table></div>
        <div class="kaynakNot" style="margin-top:10px">Seviyeler, son 2 yılın fraktal tepe/diplerinin kümelenmesiyle bulunur. “Dokunuş”, fiyatın o bölgeden kaç kez döndüğünü gösterir; çok dokunulmuş seviye daha güvenilirdir.</div>
      </div>
      <div class="kart">
        <div class="baslikSatir"><h2>Trend sinyalleri</h2><span class="not">toplam ${m.trendPuani >= 0 ? '+' : ''}${m.trendPuani}</span></div>
        ${sinyaller}
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--cizgi);display:grid;grid-template-columns:repeat(2,1fr);gap:11px;font-size:12.5px">
          ${[['RSI (14)', para(m.teknik.rsi, 1)], ['ATR (14)', para(m.teknik.atr, 2) + ` (%${para(m.teknik.atrYuzde, 2)})`],
             ['20 günlük ort.', para(m.teknik.sma20, ond)], ['50 günlük ort.', para(m.teknik.sma50, ond)],
             ['200 günlük ort.', para(m.teknik.sma200, ond)], ['Yıllık oynaklık', '%' + para(m.teknik.oynaklik, 1)],
             ['52 hafta zirve', para(m.teknik.y52, ond)], ['52 hafta dip', para(m.teknik.d52, ond)]]
            .map(([a, b]) => `<div><span style="color:var(--cokSoluk)">${a}</span><br><span class="mono" style="font-size:14px">${b}</span></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="kart">
      <div class="baslikSatir"><h2>Kademeli giriş planı</h2><span class="not">pozisyonun yüzde kaçı, hangi fiyattan</span></div>
      ${plan}
      <div class="izgara i4" style="margin-top:14px">
        ${[['Ortalama maliyet', para(m.plan.ortalamaMaliyet, ond), 'kademeler dolarsa'],
           ['Zarar kes', para(m.plan.stop, ond), yuzde(m.plan.stopYuzde) + ' maliyetten'],
           ['İlk hedef', para(m.plan.hedef1, ond), yuzde(m.plan.hedef1Yuzde) + ' maliyetten'],
           ['Risk / ödül', m.plan.riskOdul ? '1 : ' + para(m.plan.riskOdul, 2) : '—', m.plan.riskOdul >= 1.5 ? 'elverişli' : m.plan.riskOdul >= 1 ? 'sınırda' : 'zayıf']]
          .map(([a, b, c]) => `<div style="background:var(--kat2);border:1px solid var(--cizgi);border-radius:9px;padding:12px 14px">
            <div style="font-size:11px;color:var(--cokSoluk);letter-spacing:.06em;text-transform:uppercase">${a}</div>
            <div class="mono" style="font-size:19px;font-weight:600;margin:4px 0 2px">${b}</div>
            <div style="font-size:11.5px;color:var(--soluk)">${c}</div>
          </div>`).join('')}
      </div>
      <div class="kaynakNot" style="margin-top:12px">Kademeler destek seviyelerine yerleştirilir; zarar kes emri en derin kademenin altındaki desteğin de altına konur ki normal dalgalanmada tetiklenmesin. Risk/ödül 1:1,5’in altındaysa işlem beklemeye değer.</div>
    </section>

    <section>${ayr}</section>
    ${ziynet ? `<section>${ziynet}</section>` : ''}

    <section class="kart">
      <div class="baslikSatir"><h2>${altinMi ? 'Altın' : 'Gümüş'} gündemi</h2></div>
      ${haberListesi(altinMi ? V.haberler.altin : V.haberler.gumus, 7)}
    </section>`;
}

/* ——————————————————— PANEL: HALKA ARZ ——————————————————— */
let arzYilSecim = '2026';
let arzSiraSecim = 'getiri';
const arzSuzgec = { kurum: '', dagitim: '', buyukluk: '', pazar: '', ara: '' };

// Türkçe katlama: "İŞ" ile "iş", "GÜMÜŞ" ile "gumus" eşleşsin.
const katla = s => String(s || '')
  .toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

const BUYUKLUK_BANTLARI = {
  kucuk: { ad: 'Küçük — 1,5 milyar ₺ altı', test: v => v != null && v < 1.5 },
  orta: { ad: 'Orta — 1,5-4 milyar ₺', test: v => v != null && v >= 1.5 && v < 4 },
  buyuk: { ad: 'Büyük — 4 milyar ₺ üstü', test: v => v != null && v >= 4 }
};

function arzFiltrele() {
  const s = arzSuzgec;
  let liste = V.arz.arzlar.filter(a => arzYilSecim === 'tum' || a.yil === arzYilSecim);
  if (s.kurum) liste = liste.filter(a => (a.araciKisa || '') === s.kurum);
  if (s.dagitim) liste = liste.filter(a => (a.dagitim || '') === s.dagitim);
  if (s.pazar) liste = liste.filter(a => (a.pazar || '') === s.pazar);
  if (s.buyukluk) liste = liste.filter(a => BUYUKLUK_BANTLARI[s.buyukluk]?.test(a.faktor?.buyuklukMilyar));
  if (s.ara) {
    const q = katla(s.ara);
    liste = liste.filter(a => katla(a.kod).includes(q) || katla(a.ad).includes(q) || katla(a.araciKurum).includes(q));
  }
  const sirala = {
    getiri: (a, b) => (b.perf?.getiri ?? -1e9) - (a.perf?.getiri ?? -1e9),
    ilkGun: (a, b) => (b.perf?.ilkGunGetiri ?? -1e9) - (a.perf?.ilkGunGetiri ?? -1e9),
    alfa: (a, b) => (b.perf?.alfa ?? -1e9) - (a.perf?.alfa ?? -1e9),
    tarih: (a, b) => String(b.tarih?.bitis ?? '').localeCompare(String(a.tarih?.bitis ?? '')),
    buyukluk: (a, b) => (b.faktor?.buyuklukTL ?? 0) - (a.faktor?.buyuklukTL ?? 0),
    katilimci: (a, b) => (b.katilimci ?? 0) - (a.katilimci ?? 0),
    kurum: (a, b) => String(a.araciKisa ?? 'zzz').localeCompare(String(b.araciKisa ?? 'zzz'), 'tr')
  }[arzSiraSecim] || ((a, b) => 0);
  return [...liste].sort(sirala);
}

const suzgecAcik = () => !!(arzSuzgec.kurum || arzSuzgec.dagitim || arzSuzgec.buyukluk || arzSuzgec.pazar || arzSuzgec.ara);

function panelArz() {
  const A = V.arz;
  const yaklasan = A.arzlar.filter(a => A.yaklasanlar.includes(a.slug));

  const yaklasanBolum = yaklasan.length
    ? yaklasan.map(y => yaklasanKarti(y)).join('')
    : `<div class="kart"><div class="kararBaslik">Şu an talep toplaması süren arz yok</div>
       <div class="kararGerekce">Yeni arz açıklandığında burada tam değerlendirmesiyle görünecek. Aşağıdaki geçmiş veriler her gün güncellenmeye devam eder.</div></div>`;

  const o = A.ozetler[arzYilSecim] || {};
  const ozetKart = `<div class="kart">
    <div class="baslikSatir">
      <h2>${arzYilSecim === 'tum' ? '2024-2026' : arzYilSecim} halka arz karnesi</h2>
      <div class="dugmeSira" style="margin-left:auto">
        ${[['2026','2026'],['2025','2025'],['2024','2024'],['tum','Tümü']].map(([y,ad]) => `<button class="dugme" data-yil="${y}" aria-pressed="${y === arzYilSecim}">${ad}</button>`).join('')}
      </div>
    </div>
    <div class="izgara i4">
      ${[['Arz sayısı', nf(o.arzSayisi), `${nf(o.toplamBuyuklukMilyar)} milyar ₺ toplam`],
         ['Medyan getiri', yuzde(o.medyanGetiri), 'arz fiyatına göre bugün'],
         ['Artıda kalan', o.artidaOran != null ? '%' + nf(o.artidaOran) : '—', 'arz fiyatının üzerinde'],
         ['Medyan ilk gün', yuzde(o.medyanIlkGun), 'ilk işlem günü kapanışı']]
        .map(([a, b, c]) => `<div style="background:var(--kat2);border:1px solid var(--cizgi);border-radius:9px;padding:13px 15px">
          <div style="font-size:11px;color:var(--cokSoluk);letter-spacing:.06em;text-transform:uppercase">${a}</div>
          <div class="mono" style="font-size:23px;font-weight:700;margin:5px 0 3px">${b}</div>
          <div style="font-size:11.5px;color:var(--soluk)">${c}</div>
        </div>`).join('')}
    </div>
    <div class="izgara i2" style="margin-top:14px">
      <div>
        <div class="seritAd">En çok kazandıran</div>
        ${(o.enIyi || []).map(x => `<div style="display:flex;gap:10px;padding:6px 0;font-size:13px"><span class="kod" style="color:var(--altin);min-width:56px">${kaks(x.kod)}</span><span style="color:var(--soluk);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kaks(x.ad)}</span><span class="mono arti">${yuzde(x.getiri)}</span></div>`).join('')}
      </div>
      <div>
        <div class="seritAd">En çok kaybettiren</div>
        ${(o.enKotu || []).map(x => `<div style="display:flex;gap:10px;padding:6px 0;font-size:13px"><span class="kod" style="color:var(--gumus);min-width:56px">${kaks(x.kod)}</span><span style="color:var(--soluk);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kaks(x.ad)}</span><span class="mono eksi">${yuzde(x.getiri)}</span></div>`).join('')}
      </div>
    </div>
    <div class="kaynakNot" style="margin-top:12px">
      Katılımcı medyanı ${o.medyanKatilimci ? buyukSayi(o.medyanKatilimci) + ' kişi' : '—'} · arzların %${nf(o.esitDagitimOrani)}’i eşit dağıtım.
      Getiriler bedelsiz sermaye artırımına göre düzeltilmiştir; temettü dahil değildir.
    </div>
  </div>`;

  return `
    <section>
      <div class="baslikSatir"><h2>Talep toplaması süren / yaklaşan arz</h2></div>
      ${yaklasanBolum}
    </section>
    <section>${taslakBolumu()}</section>
    <section>${ozetKart}</section>
    <section>${kanitBolumu()}</section>
    <section>${kurumBolumu()}</section>
    <section>${arzListesi()}</section>`;
}

function yaklasanKarti(y) {
  const d = y.degerlendirme;
  const f = y.faktor;

  const olcutler = d.olcutler.map(o => `<div class="olcut ${kaks(o.durum)}">
    <div class="olcutIz"></div>
    <div>
      <div class="olcutAd">${kaks(o.baslik)}</div>
      ${o.deger ? `<div class="olcutDeger">${kaks(o.deger)}</div>` : ''}
      <div class="olcutMetin">${kaks(o.metin)}</div>
    </div>
  </div>`).join('');

  const benzer = `<div class="tabloKutu"><table>
    <thead><tr><th>Kod</th><th>Tarih</th><th class="say">İskonto</th><th class="say">Halka açıklık</th><th class="say">Büyüklük</th><th class="say">İlk gün</th><th class="say">Bugünkü getiri</th></tr></thead>
    <tbody>${d.benzerler.map(b => `<tr>
      <td><span class="kod">${kaks(b.kod)}</span></td>
      <td style="font-size:12px;color:var(--soluk)">${kaks(b.tarih || '—')}</td>
      <td class="say">${b.iskonto != null ? '%' + para(b.iskonto, 1) : '—'}</td>
      <td class="say">${b.halkaAciklik != null ? '%' + para(b.halkaAciklik, 1) : '—'}</td>
      <td class="say">${b.buyuklukMilyar != null ? para(b.buyuklukMilyar, 2) + ' mlr' : '—'}</td>
      <td class="say ${sinif(b.ilkGunGetiri)}">${yuzde(b.ilkGunGetiri)}</td>
      <td class="say ${sinif(b.getiri)}"><strong>${yuzde(b.getiri)}</strong></td>
    </tr>`).join('')}</tbody>
  </table></div>`;

  const lot = y.lotTahmini?.length ? `<div class="tabloKutu"><table>
    <thead><tr><th>Katılımcı sayısı</th><th class="say">Kişi başı lot</th><th class="say">Yaklaşık tutar</th></tr></thead>
    <tbody>${y.lotTahmini.map(t => {
      const m = t.match(/^(.+?)\s*katılım\s*~\s*([\d.]+)\s*Lot\s*\(([\d.]+)\s*TL\)/i);
      return m ? `<tr><td>${kaks(m[1])}</td><td class="say">${kaks(m[2])}</td><td class="say">${nf(+m[3])} ₺</td></tr>`
               : `<tr><td colspan="3">${kaks(t)}</td></tr>`;
    }).join('')}</tbody>
  </table></div>` : '';

  const kunye = [
    ['Halka arz fiyatı', para(y.fiyat, 2) + ' ₺'],
    ['Talep toplama', y.tarihMetni || '—'],
    ['Dağıtım yöntemi', y.dagitim || '—'],
    ['Arz büyüklüğü', f.buyuklukMilyar != null ? para(f.buyuklukMilyar, 2) + ' milyar ₺' : '—'],
    ['Pay sayısı', y.payLot ? nf(y.payLot) + ' lot' : '—'],
    ['Halka açıklık', y.halkaAciklik != null ? '%' + para(y.halkaAciklik, 2) : '—'],
    ['İskonto', y.iskonto != null ? '%' + para(y.iskonto, 2) : '—'],
    ['Pazar', y.pazar || '—'],
    ['Aracı kurum', y.araciKurum || '—'],
    ['Fiyat istikrarı', y.fiyatIstikrari || '—']
  ];

  return `<div class="kart karar ${kaks(d.karar.tur)}" style="padding-left:26px">
    <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:16px">
      ${y.logo ? `<img src="${kaks(y.logo)}" alt="" style="width:52px;height:52px;border-radius:9px;object-fit:contain;background:#fff;padding:4px" loading="lazy">` : ''}
      <div style="flex:1;min-width:210px">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <span class="kod" style="font-size:16px;color:var(--altin)">${kaks(y.kod)}</span>
          <span class="rozet altin">${kaks(y.dagitim || '—')}</span>
          <span class="rozet">${kaks(y.pazar || '—')}</span>
        </div>
        <div style="font-size:16px;font-weight:600;margin-top:5px">${kaks(y.ad)}</div>
        <div style="font-size:13px;color:var(--soluk);margin-top:3px">${kaks(y.tarihMetni)} · ${para(y.fiyat, 2)} ₺ · ${f.buyuklukMilyar != null ? para(f.buyuklukMilyar, 2) + ' milyar ₺' : ''}</div>
      </div>
      <div style="min-width:190px">
        <div class="seritAd">Mihenk puanı</div>
        <div class="puanKutu">
          <span class="puanSayi" style="color:${d.puan >= 62 ? 'var(--yesil)' : d.puan <= 40 ? 'var(--kirmizi)' : 'var(--sari)'}">${d.puan}</span>
          <div class="puanCubuk"><div class="puanDolgu" style="width:${d.puan}%"></div></div>
        </div>
        <div style="font-size:11.5px;color:var(--cokSoluk);margin-top:5px">100 üzerinden · geçmiş arz verisinden</div>
      </div>
    </div>

    <div class="kararBaslik">${kaks(d.karar.baslik)}</div>
    <div class="kararGerekce" style="margin-bottom:6px">${kaks(d.karar.gerekce)}</div>

    <details class="katla" open style="margin-top:16px">
      <summary>Puan neden bu? — ölçütler ve geçmiş kanıtı</summary>
      <div class="katlaIc">
        ${olcutler}
        <div class="kaynakNot" style="margin-top:12px">Her ölçüt, aynı aralıktaki geçmiş arzların <strong>gerçekleşen medyan getirisiyle</strong> karşılaştırılır. Elle atanmış ağırlık yoktur; puan bu farkların ortalamasından üretilir. Örneklem küçükse (n&lt;3) ölçüt puana katılmaz.</div>
      </div>
    </details>

    <details class="katla">
      <summary>En benzer ${d.benzerler.length} geçmiş arz ne yaptı?</summary>
      <div class="katlaIc">
        ${benzer}
        <div class="kaynakNot" style="margin-top:11px">Benzerlik; iskonto, halka açıklık, arz büyüklüğü, sermaye artırımı oranı, dağıtım yöntemi ve pazar üzerinden ölçülür. Bu ${d.benzerler.length} arzın medyan getirisi <strong>${yuzde(d.benzerMedyan)}</strong>, %${nf(d.benzerArtiOran)}’i hâlâ arz fiyatının üzerinde. Tüm arzların medyanı ${yuzde(d.genelMedyan)}.</div>
      </div>
    </details>

    ${lot ? `<details class="katla">
      <summary>Kaç lot düşer? — katılımcı sayısına göre</summary>
      <div class="katlaIc">${lot}
        <div class="kaynakNot" style="margin-top:11px">Eşit dağıtımda bireysel tahsisat, katılan kişi sayısına bölünür. 2026’da medyan katılımcı sayısı ${buyukSayi(V.arz.ozetler['2026'].medyanKatilimci)} kişi; bu tabloda karşılığına bakmak gerçekçi bir beklenti verir.</div>
      </div>
    </details>` : ''}

    <details class="katla">
      <summary>Künye, tahsisat ve fon kullanımı</summary>
      <div class="katlaIc">
        <div class="tabloKutu"><table><tbody>
          ${kunye.map(([a, b]) => `<tr><td style="color:var(--soluk);width:42%">${kaks(a)}</td><td class="mono">${kaks(b)}</td></tr>`).join('')}
        </tbody></table></div>
        ${y.tahsisat?.length ? `<div style="margin-top:14px"><div class="seritAd">Tahsisat grupları</div>
          ${y.tahsisat.map(t => `<div style="font-size:13px;padding:5px 0;color:var(--soluk)">${kaks(t)}</div>`).join('')}</div>` : ''}
        ${y.fonKullanimi?.length ? `<div style="margin-top:14px"><div class="seritAd">Toplanan para nereye gidecek</div>
          ${y.fonKullanimi.map(t => `<div style="font-size:13px;padding:5px 0;color:var(--soluk)">${kaks(t)}</div>`).join('')}</div>` : ''}
        ${y.sermayeOrani != null ? `<div class="kaynakNot" style="margin-top:13px">Arzın <strong>%${nf(y.sermayeOrani)}</strong>’i sermaye artırımı — yani bu para şirkete giriyor. Kalan kısım mevcut ortakların pay satışıdır ve şirkete girmez.</div>` : ''}
        ${y.satmamaTaahhudu?.length ? `<div class="kaynakNot" style="margin-top:9px">Satmama taahhüdü: ${kaks(y.satmamaTaahhudu.join(' · '))}</div>` : ''}
      </div>
    </details>

    ${y.haberler?.length ? `<details class="katla">
      <summary>Basında ${kaks(y.kod)} — ${y.haberler.length} haber</summary>
      <div class="katlaIc">${haberListesi(y.haberler, 8)}
        <div class="kaynakNot" style="margin-top:11px">Bunlar haber başlıklarıdır, yatırım tavsiyesi değildir. Kamuoyunun genel eğilimini görmek için buradalar; her başlığın kaynağını açıp kendiniz değerlendirin.</div>
      </div>
    </details>` : ''}
  </div>`;
}

// SPK başvurusu yapılmış ama tarihi açıklanmamış şirketler.
function taslakBolumu() {
  const t = V.arz.taslaklar || [];
  if (!t.length) return '';
  return `<details class="katla">
    <summary>Sırada bekleyen ${t.length} şirket — SPK sürecinde, tarihi açıklanmadı</summary>
    <div class="katlaIc">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:9px">
        ${t.map(x => `<a href="${kaks(x.bag)}" target="_blank" rel="noopener"
            style="display:flex;align-items:center;gap:9px;padding:8px 11px;background:var(--kat2);border:1px solid var(--cizgi);border-radius:8px;text-decoration:none">
          <span class="kod" style="color:var(--altin);min-width:52px">${kaks(x.kod)}</span>
          <span style="font-size:12.5px;color:var(--soluk);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kaks(x.ad)}</span>
        </a>`).join('')}
      </div>
      <div class="kaynakNot" style="margin-top:13px">Bu şirketler halka arz için başvuru sürecinde. Talep toplama tarihi ve fiyatı açıklandığında yukarıdaki “yaklaşan arz” bölümünde tam değerlendirmesiyle görünürler. Başvuru, arzın gerçekleşeceği anlamına gelmez — bir kısmı ertelenir ya da iptal edilir.</div>
    </div>
  </details>`;
}

function kanitBolumu() {
  const K = V.arz.kanitlar;
  const bloklar = [
    ['İskonto ne kadar önemli?', K.iskonto, 'Fiyat tespit raporundaki değere göre uygulanan indirim.'],
    ['Halka açıklık oranı', K.halkaAciklik, 'Şirketin borsada işlem gören payının toplama oranı.'],
    ['Arz büyüklüğü', K.buyukluk, 'Toplanan toplam para. Küçük arzlarda talep aynı miktarda paya daha çok yığılır.'],
    ['Para nereye gidiyor?', K.sermaye, 'Sermaye artırımı şirkete para sokar; ortak satışı mevcut hissedarın cebine gider.']
  ].filter(([, k]) => k?.length);

  return `<div class="kart">
    <div class="baslikSatir"><h2>Hangi özellik gerçekten kazandırıyor?</h2>
      <span class="not">2024-2026 arası ${V.arz.arzlar.filter(a => a.perf?.getiri != null).length} arzın gerçekleşen getirisi</span></div>
    <div class="izgara i2">
      ${bloklar.map(([ad, kanit, aciklama]) => `<div style="background:var(--kat2);border:1px solid var(--cizgi);border-radius:10px;padding:15px">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:3px">${ad}</div>
        <div style="font-size:11.5px;color:var(--cokSoluk);margin-bottom:11px;line-height:1.5">${aciklama}</div>
        ${kanit.map(k => {
          const en = Math.max(...kanit.map(x => Math.abs(x.medyan)), 1);
          const g = Math.abs(k.medyan) / en * 100;
          return `<div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span style="color:var(--soluk)">${kaks(k.etiket)} <span style="color:var(--cokSoluk)">n=${k.adet}</span></span>
              <span class="mono ${sinif(k.medyan)}" style="font-weight:600">${yuzde(k.medyan)}</span>
            </div>
            <div style="height:5px;background:var(--kat3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${g}%;background:${k.medyan >= 0 ? 'var(--yesil)' : 'var(--kirmizi)'};border-radius:3px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>`).join('')}
    </div>
    <div class="kaynakNot" style="margin-top:13px">Her çubuk, o gruptaki arzların <strong>medyan getirisidir</strong> (ortalama değil — tek bir uç örnek tabloyu bozmasın diye). n, gruptaki arz sayısı. Bu tablolar geçmişi anlatır; geleceği garanti etmez, ama “küçük arz daha çok kazandırır” gibi yaygın sözlerin sayısal karşılığını verir.</div>
  </div>`;
}

// Aracı kurum karnesi — kullanıcının istediği "hangi kurumun arzı ne kazandırdı" karşılaştırması.
function kurumBolumu() {
  const K = V.arz.kurumKarnesi || [];
  if (!K.length) return '';
  const enBuyuk = Math.max(...K.map(k => Math.abs(k.medyanGetiri)), 1);

  const satir = k => {
    const pay = Math.abs(k.medyanGetiri) / enBuyuk * 100;
    const artiMi = k.medyanGetiri >= 0;
    return `<tr>
      <td>
        <button class="filtreSifirla" data-kurum-sec="${kaks(k.kurum)}"
          style="text-decoration:none;font-size:13px;font-weight:500;color:var(--metin);padding:0;text-align:left"
          title="${kaks(k.tamAd || k.kurum)} — tabloda filtrele">${kaks(k.kurum)}</button>
        ${k.konsorsiyumAdedi ? `<span class="rozet" style="padding:1px 6px;font-size:10px;margin-left:5px" title="${k.konsorsiyumAdedi} arz konsorsiyumla yapıldı">kons.</span>` : ''}
      </td>
      <td class="say">${k.adet}</td>
      <td style="min-width:110px">
        <div class="karneCubuk"><i style="width:${pay}%;background:${artiMi ? 'var(--yesil)' : 'var(--kirmizi)'}"></i></div>
      </td>
      <td class="say ${sinif(k.medyanGetiri)}"><strong>${yuzde(k.medyanGetiri)}</strong></td>
      <td class="say ${sinif(k.medyanIlkGun)}">${yuzde(k.medyanIlkGun)}</td>
      <td class="say">%${nf(k.artidaOran)}</td>
      <td class="say arti">${yuzde(k.enIyi)}</td>
      <td class="say eksi">${yuzde(k.enKotu)}</td>
      <td class="say">${k.medyanBuyukluk != null ? para(k.medyanBuyukluk, 2) : '—'}</td>
      <td class="say">${k.medyanKatilimci ? buyukSayi(k.medyanKatilimci) : '—'}</td>
    </tr>`;
  };

  return `<div class="kart">
    <div class="baslikSatir">
      <h2>Aracı kurum karnesi</h2>
      <span class="not">2024-2026 · en az 2 arzı olan kurumlar · kuruma tıkla, tabloyu filtrelesin</span>
    </div>
    <div class="tabloKutu"><table>
      <thead><tr>
        <th>Aracı kurum</th><th class="say">Arz</th><th>Medyan getiri</th><th class="say">Medyan</th>
        <th class="say">İlk gün</th><th class="say">Artıda</th><th class="say">En iyi</th><th class="say">En kötü</th>
        <th class="say">Medyan mlr ₺</th><th class="say">Medyan katılımcı</th>
      </tr></thead>
      <tbody>${K.map(satir).join('')}</tbody>
    </table></div>
    <div class="kaynakNot" style="margin-top:12px">
      Konsorsiyumla yapılan arzlarda <strong>lider kurum</strong> sayılır. Bu tablo kurumun becerisini değil,
      götürdüğü şirketlerin sonrasında ne yaptığını gösterir — küçük ve iskontolu arz götüren kurum doğal olarak
      önde çıkar. Örneklem küçük (çoğu kurumda 2-4 arz), bu yüzden tek başına karar ölçütü sayılmamalı;
      <strong>arzın kendi özellikleriyle birlikte</strong> okunmalı.
    </div>
  </div>`;
}

function suzgecCubugu(kapsam) {
  // Seçenekler kapsamdaki gerçek değerlerden üretilir; boş kalan filtre gösterilmez.
  const benzersiz = (alan) => [...new Set(kapsam.map(a => a[alan]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const kurumlar = benzersiz('araciKisa');
  const dagitimlar = benzersiz('dagitim');
  const pazarlar = benzersiz('pazar');

  const sec = (anahtar, etiket, secenekler, hepsiMetni) => `
    <div class="filtre">
      <label class="filtreAd" for="sz-${anahtar}">${etiket}</label>
      <select id="sz-${anahtar}" data-suz="${anahtar}" class="${arzSuzgec[anahtar] ? 'etkin' : ''}">
        <option value="">${hepsiMetni}</option>
        ${secenekler.map(o => {
          const [deger, ad] = Array.isArray(o) ? o : [o, o];
          return `<option value="${kaks(deger)}"${arzSuzgec[anahtar] === deger ? ' selected' : ''}>${kaks(ad)}</option>`;
        }).join('')}
      </select>
    </div>`;

  return `<div class="filtreler">
    <div class="filtre">
      <label class="filtreAd" for="sz-yil">Yıl</label>
      <select id="sz-yil" data-suz="yil" class="${arzYilSecim === 'tum' ? 'etkin' : ''}">
        ${['2026', '2025', '2024', 'tum'].map(y =>
          `<option value="${y}"${y === arzYilSecim ? ' selected' : ''}>${y === 'tum' ? 'Tüm yıllar' : y}</option>`).join('')}
      </select>
    </div>
    ${sec('kurum', 'Aracı kurum', kurumlar, 'Hepsi (' + kurumlar.length + ')')}
    ${sec('dagitim', 'Dağıtım yöntemi', dagitimlar, 'Hepsi')}
    ${sec('buyukluk', 'Arz büyüklüğü', Object.entries(BUYUKLUK_BANTLARI).map(([k, v]) => [k, v.ad]), 'Hepsi')}
    ${sec('pazar', 'Pazar', pazarlar, 'Hepsi')}
    <div class="filtre">
      <label class="filtreAd" for="sz-ara">Ara</label>
      <input id="sz-ara" data-suz="ara" type="search" placeholder="kod, şirket, kurum…" value="${kaks(arzSuzgec.ara)}">
    </div>
    <div class="filtre">
      <label class="filtreAd" for="sz-sira">Sırala</label>
      <select id="sz-sira" data-suz="sira">
        ${[['getiri', 'Bugünkü getiri'], ['ilkGun', 'İlk gün getirisi'], ['alfa', 'BIST’e göre fark'],
           ['tarih', 'Tarih'], ['buyukluk', 'Arz büyüklüğü'], ['katilimci', 'Katılımcı sayısı'], ['kurum', 'Aracı kurum']]
          .map(([k, ad]) => `<option value="${k}"${k === arzSiraSecim ? ' selected' : ''}>${ad}</option>`).join('')}
      </select>
    </div>
    ${suzgecAcik() ? '<button class="filtreSifirla" data-suz-sifirla>filtreleri temizle</button>' : ''}
  </div>`;
}

function arzListesi() {
  const kapsam = V.arz.arzlar.filter(a => arzYilSecim === 'tum' || a.yil === arzYilSecim);
  const liste = arzFiltrele();
  const perfli = liste.filter(a => a.perf?.getiri != null);
  const g = perfli.map(a => a.perf.getiri);
  const med = g.length ? [...g].sort((x, y) => x - y)[Math.floor(g.length / 2)] : null;

  const satirlar = liste.map(a => {
    const p = a.perf;
    return `<tr>
      <td><span class="kod">${kaks(a.kod || '—')}</span>${p?.bolunmeler ? ' <span class="rozet" title="bedelsiz sermaye artırımına göre düzeltildi" style="padding:1px 6px;font-size:10px">bedelsiz</span>' : ''}</td>
      <td style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px">${kaks(a.ad)}</td>
      <td style="font-size:12px;white-space:nowrap">
        ${a.araciKisa ? kaks(a.araciKisa) : '<span style="color:var(--cokSoluk)">—</span>'}
        ${a.konsorsiyumMu ? `<span class="rozet" style="padding:1px 6px;font-size:10px;margin-left:4px" title="${kaks((a.konsorsiyum || []).join(' · '))}">+${(a.konsorsiyum || []).length - 1}</span>` : ''}
      </td>
      <td style="font-size:12px;color:var(--soluk);white-space:nowrap">${kaks(a.dagitim || '—')}</td>
      <td style="font-size:12px;color:var(--soluk);white-space:nowrap">${kaks(a.tarihMetni || '—')}</td>
      <td class="say">${a.fiyat != null ? para(a.fiyat, 2) : '—'}</td>
      <td class="say">${a.faktor?.buyuklukMilyar != null ? para(a.faktor.buyuklukMilyar, 2) : '—'}</td>
      <td class="say ${sinif(p?.ilkGunGetiri)}">${yuzde(p?.ilkGunGetiri)}</td>
      <td class="say ${sinif(p?.getiri)}"><strong>${yuzde(p?.getiri)}</strong></td>
      <td class="say ${sinif(p?.alfa)}">${yuzde(p?.alfa)}</td>
      <td class="say">${a.katilimci ? buyukSayi(a.katilimci) : '—'}</td>
      <td class="say">${a.kisiBasiTutar ? nf(a.kisiBasiTutar) + ' ₺' : '—'}</td>
      <td>${mini(a.seri, p?.getiri >= 0 ? 'var(--yesil)' : 'var(--kirmizi)')}</td>
    </tr>`;
  }).join('');

  return `<div class="kart">
    <div class="baslikSatir">
      <h2>Arzları karşılaştır</h2>
      <span class="not">${arzYilSecim === 'tum' ? '2024-2026' : arzYilSecim} · ${kapsam.length} arz içinden</span>
    </div>
    ${suzgecCubugu(kapsam)}
    <div class="filtreler" style="margin-top:-6px;margin-bottom:12px">
      <span class="filtreSayac" style="margin-left:0;padding-bottom:0">
        <strong style="color:var(--metin)">${liste.length}</strong> arz gösteriliyor${perfli.length ? ` · medyan getiri <strong class="${sinif(med)}">${yuzde(med)}</strong>` : ''}
      </span>
    </div>
    ${liste.length ? `<div class="tabloKutu"><table>
      <thead><tr>
        <th>Kod</th><th>Şirket</th><th>Aracı kurum</th><th>Dağıtım</th><th>Talep toplama</th>
        <th class="say">Arz ₺</th><th class="say">Büyüklük mlr</th>
        <th class="say">İlk gün</th><th class="say">Getiri</th><th class="say">BIST’e göre</th>
        <th class="say">Katılımcı</th><th class="say">Kişi başı</th><th>Seyir</th>
      </tr></thead>
      <tbody>${satirlar}</tbody>
    </table></div>` : '<div class="bosSonuc">Bu filtrelerle eşleşen arz yok. Filtreleri gevşetmeyi dene.</div>'}
    <div class="kaynakNot" style="margin-top:12px">
      “Aracı kurum” arzı yürüten lider kurumdur; <strong>+n</strong> rozeti konsorsiyum ortağı sayısını gösterir (üstüne gelince adları çıkar).
      “Getiri” bugünkü fiyatın halka arz fiyatına göre değişimi; bedelsiz sermaye artırımı yapan şirketlerde arz fiyatı aynı ölçeğe getirilerek düzeltilir.
      “BIST’e göre” aynı dönemde BIST 100’ün getirisi düşülmüş halidir. “Kişi başı”, bireysel yatırımcıya düşen ortalama lotun arz fiyatıyla çarpımıdır.
    </div>
  </div>`;
}

/* ——————————————————— sekme yönetimi ——————————————————— */
const paneller = {
  bugun: { el: 'panelBugun', ciz: panelBugun },
  altin: { el: 'panelAltin', ciz: () => panelMetal('altin') },
  gumus: { el: 'panelGumus', ciz: () => panelMetal('gumus') },
  arz: { el: 'panelArz', ciz: panelArz }
};
let aktif = 'bugun';

function sekmeAc(ad, zorla = false, koruScroll = false) {
  if (!paneller[ad]) return;
  if (ad === aktif && !zorla) return;
  aktif = ad;
  const y = window.scrollY;
  for (const [k, p] of Object.entries(paneller)) {
    const el = document.getElementById(p.el);
    if (k === ad) { el.innerHTML = p.ciz(); el.hidden = false; }
    else el.hidden = true;
  }
  document.querySelectorAll('.sekme').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.panel === ad)));
  if (location.hash.slice(1) !== ad) history.replaceState(null, '', '#' + ad);
  window.scrollTo({ top: koruScroll ? y : 0, behavior: 'instant' });
}

// Filtre değişince panel yeniden çizilir; arama kutusundaki odak ve imleç geri konur.
function arzTazele() {
  const el = document.activeElement;
  const odak = el?.dataset?.suz;
  const konum = el?.selectionStart ?? null;
  sekmeAc('arz', true, true);
  if (odak) {
    const yeni = document.querySelector(`[data-suz="${odak}"]`);
    if (yeni) {
      yeni.focus();
      if (konum != null && yeni.setSelectionRange) {
        try { yeni.setSelectionRange(konum, konum); } catch { /* select alanları desteklemez */ }
      }
    }
  }
}

let aramaZaman = null;

document.addEventListener('click', e => {
  const yil = e.target.closest('[data-yil]');
  if (yil) { arzYilSecim = yil.dataset.yil; sekmeAc('arz', true); return; }

  // Karnedeki kurum adına tıklayınca tablo o kuruma filtrelenir.
  const kurum = e.target.closest('[data-kurum-sec]');
  if (kurum) {
    arzSuzgec.kurum = kurum.dataset.kurumSec;
    arzYilSecim = 'tum';
    sekmeAc('arz', true, true);
    document.querySelector('[data-suz="kurum"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (e.target.closest('[data-suz-sifirla]')) {
    for (const k of Object.keys(arzSuzgec)) arzSuzgec[k] = '';
    sekmeAc('arz', true, true);
    return;
  }

  const sekme = e.target.closest('.sekme');
  if (sekme) sekmeAc(sekme.dataset.panel);
});

document.addEventListener('change', e => {
  const s = e.target.closest('[data-suz]');
  if (!s || s.type === 'search') return;
  const anahtar = s.dataset.suz;
  if (anahtar === 'yil') arzYilSecim = s.value;
  else if (anahtar === 'sira') arzSiraSecim = s.value;
  else arzSuzgec[anahtar] = s.value;
  arzTazele();
});

document.addEventListener('input', e => {
  const s = e.target.closest('[data-suz="ara"]');
  if (!s) return;
  clearTimeout(aramaZaman);
  aramaZaman = setTimeout(() => { arzSuzgec.ara = s.value; arzTazele(); }, 220);
});

/* ——————————————————— canlı fiyat tazeleme ——————————————————— */
// gold-api.com ve Truncgil CORS’a açık; sayfa günlük veriyi beklemeden fiyatı tazeler.
async function canliTazele() {
  const al = async (u) => {
    try {
      const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(9000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  // "6.849,66" → 6849.66
  const trSayi = s => {
    if (s == null) return null;
    if (typeof s === 'number') return s;
    const v = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    return isFinite(v) ? v : null;
  };
  const [xau, xag, tr4] = await Promise.all([
    al('https://api.gold-api.com/price/XAU'),
    al('https://api.gold-api.com/price/XAG'),
    al('https://finans.truncgil.com/v4/today.json')
  ]);
  // v4 sık düşüyor; aynı veriyi veren v3 yedeğe alınır.
  const tr3 = tr4?.USD ? null : await al('https://finans.truncgil.com/today.json');
  if (!xau && !tr4 && !tr3) return false;
  canliFiyat = {
    onsAltin: xau?.price ?? null,
    onsGumus: xag?.price ?? null,
    gramAltin: tr4?.GRA?.Selling ?? trSayi(tr3?.['gram-altin']?.['Satış']) ?? null,
    gramGumus: tr4?.GUMUS?.Selling ?? trSayi(tr3?.gumus?.['Satış']) ?? null,
    zaman: new Date().toISOString()
  };
  const g = document.getElementById('guncelleme');
  if (g) g.textContent = 'fiyatlar canlı · analiz ' + gecenSure(V.uretim);
  if (aktif === 'bugun' || aktif === 'altin' || aktif === 'gumus') sekmeAc(aktif, true);
  return true;
}

/* ——————————————————— açılış ——————————————————— */
function altbilgiCiz() {
  const k = V.kaynaklar;
  document.getElementById('altbilgi').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-bottom:20px">
      <div><strong style="color:var(--soluk)">Veri kaynakları</strong><br>${Object.values(k).map(kaks).join('<br>')}</div>
      <div><strong style="color:var(--soluk)">Nasıl çalışır</strong><br>
        Veriler her gün otomatik toplanır ve analiz yeniden hesaplanır.<br>
        Fiyatlar sayfa her açıldığında ayrıca canlı tazelenir.<br>
        Son hesaplama: ${tarihTR(V.uretim)} ${new Date(V.uretim).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div><strong style="color:var(--soluk)">Sınırlar</strong><br>
        Getiriler temettüyü içermez.<br>
        Halka arz künyeleri izahname ve SPK bültenine dayanır.<br>
        Teknik seviyeler geçmiş fiyattan türetilir; geleceği bilmez.
      </div>
    </div>
    <div style="border-top:1px solid var(--cizgi);padding-top:16px">
      <strong style="color:var(--soluk)">Bu bir yatırım tavsiyesi değildir.</strong>
      MİHENK, kamuya açık verileri toplayıp aynı ölçütlerle karşılaştıran bir analiz aracıdır. Buradaki puanlar ve seviyeler geçmiş veriden hesaplanır; hiçbiri gelecekteki fiyatı garanti etmez.
      Yatırım kararı vermeden önce izahnameyi kendiniz okuyun ve kendi araştırmanızı yapın.
    </div>`;
}

async function baslat() {
  try {
    const r = await fetch('veri/veri.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('veri.json okunamadı (' + r.status + ')');
    V = await r.json();
  } catch (e) {
    document.getElementById('yukleniyor').innerHTML =
      `<div class="uyari">Veri dosyası yüklenemedi: ${kaks(e.message)}<br>
       <span style="font-size:12px;color:var(--soluk)">Site bir sunucu üzerinden açılmalıdır (dosya:// ile fetch engellenir).</span></div>`;
    return;
  }

  document.getElementById('yukleniyor').hidden = true;
  document.getElementById('guncelleme').textContent = gecenSure(V.uretim) + ' güncellendi';
  if (V.arz.yaklasanlar?.length) document.getElementById('arzNokta').hidden = false;

  if (V.uyarilar?.length) {
    const d = document.createElement('div');
    d.className = 'kap';
    d.innerHTML = `<div class="uyari" style="margin-bottom:18px">Bu koşuda bazı kaynaklar eksik kaldı: ${V.uyarilar.map(kaks).join(' ')}</div>`;
    document.querySelector('main').prepend(d);
  }

  altbilgiCiz();
  const bas = location.hash.slice(1);
  sekmeAc(paneller[bas] ? bas : 'bugun', true);
  canliTazele();
  setInterval(canliTazele, 5 * 60 * 1000);
}

window.addEventListener('hashchange', () => sekmeAc(location.hash.slice(1) || 'bugun'));
baslat();
