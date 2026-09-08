// kaynak.mjs — dış veri kaynakları. Node'da çalışır (CORS yok, User-Agent serbest).
// Her fonksiyon başarısız olursa null/boş döner; toplayıcı eksik kaynağı raporlar.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export async function getir(url, { tur = 'json', tekrar = 3, zamanAsimi = 25000 } = {}) {
  let sonHata;
  for (let d = 0; d < tekrar; d++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' },
        signal: AbortSignal.timeout(zamanAsimi)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return tur === 'json' ? await r.json() : await r.text();
    } catch (e) {
      sonHata = e;
      if (d < tekrar - 1) await new Promise(s => setTimeout(s, 900 * (d + 1)));
    }
  }
  console.warn('  ! alınamadı:', url.slice(0, 90), '—', sonHata?.message);
  return null;
}

// ——— Yahoo Finance: günlük OHLC geçmişi. Anahtar istemez, Node'dan sorunsuz.
export async function yahoo(sembol, aralik = '2y') {
  // events=split şart: BIST'te bedelsiz sermaye artırımı Yahoo'da bölünme olarak görünür
  // ve fiyat geçmişini geriye dönük böler. Arz fiyatı bölünmediği için düzeltme gerekir.
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?range=${aralik}&interval=1d&events=split`;
  const j = await getir(u);
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) return null;
  const q = r.indicators.quote[0];
  const o = { sembol, tarih: [], acilis: [], yuksek: [], dusuk: [], kapanis: [], hacim: [] };
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null) continue; // tatil/boş barları at
    o.tarih.push(new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10));
    o.acilis.push(q.open[i] ?? q.close[i]);
    o.yuksek.push(q.high[i] ?? q.close[i]);
    o.dusuk.push(q.low[i] ?? q.close[i]);
    o.kapanis.push(q.close[i]);
    o.hacim.push(q.volume?.[i] ?? 0);
  }
  // Bölünmeler (bedelsiz): tarih + oran. Kümülatif çarpan arz fiyatını düzeltmekte kullanılır.
  const bol = r.events?.splits ? Object.values(r.events.splits) : [];
  o.bolunmeler = bol.map(s => ({
    tarih: new Date(s.date * 1000).toISOString().slice(0, 10),
    oran: s.numerator / s.denominator,
    metin: s.splitRatio
  })).sort((a, b) => a.tarih.localeCompare(b.tarih));
  o.bolunmeCarpani = o.bolunmeler.reduce((a, s) => a * s.oran, 1);

  o.meta = {
    parabirimi: r.meta.currency,
    borsa: r.meta.fullExchangeName,
    anlikFiyat: r.meta.regularMarketPrice,
    ilkIslem: r.meta.firstTradeDate ? new Date(r.meta.firstTradeDate * 1000).toISOString().slice(0, 10) : null,
    zaman: r.meta.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000).toISOString() : null
  };
  return o.kapanis.length ? o : null;
}

// "6.849,66" → 6849.66 · "%-0,14" → -0.14
const trSayi = s => {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const t = String(s).replace(/%/g, '').replace(/\./g, '').replace(',', '.').trim();
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
};

// ——— Truncgil: TL cinsinden gram altın, gümüş, ziynet kalemleri ve kurlar.
// v4 sık sık bağlantı reddediyor; aynı veriyi veren v3 yedek olarak denenir.
export async function truncgil() {
  const v4 = await getir('https://finans.truncgil.com/v4/today.json', { tekrar: 2 });
  if (v4?.USD) {
    const al = k => v4[k] ? { alis: v4[k].Buying, satis: v4[k].Selling, degisim: v4[k].Change } : null;
    return {
      surum: 'v4', guncelleme: v4.Update_Date,
      usd: al('USD'), eur: al('EUR'),
      gramAltin: al('GRA'), gramHas: al('HAS'), gramGumus: al('GUMUS'),
      ceyrek: al('CEYREKALTIN'), yarim: al('YARIMALTIN'), tam: al('TAMALTIN'),
      ata: al('ATAALTIN'), cumhuriyet: al('CUMHURIYETALTINI'),
      ayar22: al('YIA'), ayar18: al('18AYARALTIN'), ayar14: al('14AYARALTIN'),
      gramPlatin: al('GPL'), gramPaladyum: al('PAL'),
      xu100: al('XU100')
    };
  }

  const v3 = await getir('https://finans.truncgil.com/today.json', { tekrar: 2 });
  if (!v3?.USD) return null;
  const al = k => v3[k]
    ? { alis: trSayi(v3[k]['Alış']), satis: trSayi(v3[k]['Satış']), degisim: trSayi(v3[k]['Değişim']) }
    : null;
  return {
    surum: 'v3', guncelleme: v3.Update_Date,
    usd: al('USD'), eur: al('EUR'),
    gramAltin: al('gram-altin'), gramHas: al('gram-has-altin'), gramGumus: al('gumus'),
    ceyrek: al('ceyrek-altin'), yarim: al('yarim-altin'), tam: al('tam-altin'),
    ata: al('ata-altin'), cumhuriyet: al('cumhuriyet-altini'),
    ayar22: al('22-ayar-bilezik'), ayar18: al('18-ayar-altin'), ayar14: al('14-ayar-altin'),
    gramPlatin: al('gram-platin'), gramPaladyum: al('gram-paladyum'),
    xu100: null
  };
}

// ——— gold-api.com: ons altın/gümüş spot. CORS açık, tarayıcı da doğrudan çekebilir.
export async function spot() {
  const [a, g] = await Promise.all([
    getir('https://api.gold-api.com/price/XAU'),
    getir('https://api.gold-api.com/price/XAG')
  ]);
  if (!a?.price) return null;
  return {
    altinOns: a.price,
    gumusOns: g?.price ?? null,
    zaman: a.updatedAt,
    oran: (a.price && g?.price) ? a.price / g.price : null
  };
}

const HTML_KOD = { amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', rsquo: '’', ldquo: '“', rdquo: '”' };

function cozHtml(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&apos;/g, String.fromCharCode(39))
    .replace(/&([a-z]+);/gi, (m, n) => HTML_KOD[n.toLowerCase()] ?? m)
    .trim();
}

// ——— Google Haberler RSS: anahtarsız, Türkçe sonuç verir.
export async function haber(sorgu, adet = 8) {
  const u = `https://news.google.com/rss/search?q=${encodeURIComponent(sorgu)}&hl=tr&gl=TR&ceid=TR:tr`;
  const x = await getir(u, { tur: 'metin' });
  if (!x) return [];
  const cz = s => cozHtml(String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ''));
  return x.split('<item>').slice(1, adet + 1).map(it => {
    const bas = cz((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const tar = (it.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const bag = (it.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const kay = cz((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
    // Google başlığın sonuna " - Kaynak" ekler; ayıkla.
    const p = bas.lastIndexOf(' - ');
    return {
      baslik: p > 20 ? bas.slice(0, p) : bas,
      kaynak: kay || (p > 20 ? bas.slice(p + 3) : ''),
      tarih: tar ? new Date(tar).toISOString() : null,
      bag
    };
  }).filter(h => h.baslik);
}

// ——— halkarz.com kart listesi (ana sayfa: tarihli arzlar + taslaklar).
export async function arzKartlari() {
  const h = await getir('https://halkarz.com/', { tur: 'metin' });
  if (!h) return [];
  return h.split('<article').slice(1).map(b => {
    const kod = (b.match(/il-bist-kod"?>\s*([A-Z0-9]{3,6})\s*</) || [])[1];
    const bag = (b.match(/href="(https:\/\/halkarz\.com\/[^"]+)"/) || [])[1];
    const ad = (b.match(/il-halka-arz-sirket"><a[^>]*>([^<]+)</) || [])[1];
    const tarih = (b.match(/datetime="([^"]*)"/) || [])[1] || '';
    const logo = (b.match(/src="(https:\/\/halkarz\.com\/wp-content\/uploads\/[^"]+)"/) || [])[1];
    return kod && bag ? { kod, bag, ad: cozHtml(ad), tarih: tarih.trim(), logo, yeni: /il-new/.test(b) } : null;
  }).filter(Boolean);
}

// Künye tablosunda etiketten sonra gelen etiketler — değer taraması burada durur.
const KUNYE_ETIKETLERI = [
  'Halka Arz Tarihi', 'Halka Arz Fiyatı', 'Dağıtım Yöntemi', 'Pay :', 'Aracı Kurum',
  'Fiili Dolaşımdaki Pay', 'Bist Kodu', 'Endeks', 'Pazar', 'Bist İlk İşlem Tarihi',
  'Son Güncelleme', 'Özet Bilgiler', 'Halka Arz Sonuçları'
];

// Etiketli alanı "Etiket : | | değer |" kalıbından çeker.
// Önce ": " ile biten gerçek künye etiketi aranır; sayfada aynı kelimeler serbest
// metinde de geçebiliyor (ör. "Bist Aracı Kurum Endeksi" listesi) ve yanlış eşleşiyordu.
function etiketYeri(metin, etiket) {
  for (const kalip of [etiket + ' : |', etiket + ' :', etiket + ':|', etiket + ':']) {
    const i = metin.indexOf(kalip);
    if (i >= 0) return { i, uzunluk: kalip.length };
  }
  return null;
}

function alan(metin, etiket) {
  const y = etiketYeri(metin, etiket);
  if (!y) return null;
  const parcalar = metin.slice(y.i + y.uzunluk, y.i + y.uzunluk + 400).split('|');
  for (const p of parcalar.slice(0, 5)) {
    const t = p.replace(/^\s*:\s*/, '').trim();
    if (t && t !== ':') return t.slice(0, 160);
  }
  return null;
}

// Konsorsiyumla yapılan arzlarda üye kurumlar "Aracı Kurum" etiketinden sonra
// ayrı hücreler halinde dizilir; bir sonraki künye etiketine kadar toplanır.
function araciKurumlar(metin) {
  const y = etiketYeri(metin, 'Aracı Kurum');
  if (!y) return { lider: null, konsorsiyum: [] };
  const parcalar = metin.slice(y.i + y.uzunluk, y.i + y.uzunluk + 900).split('|');
  const isimler = [];
  let konsorsiyumMu = false;
  for (const p of parcalar) {
    const t = p.replace(/^\s*:\s*/, '').trim();
    if (!t) continue;
    if (KUNYE_ETIKETLERI.some(e => t.startsWith(e.replace(' :', '')))) break;
    if (/^\(Konsorsiyum\)$/i.test(t)) { konsorsiyumMu = true; continue; }
    if (!/(A\.Ş\.|Bankası|Menkul|Yatırım|Capital|Securities)/i.test(t)) break;
    isimler.push(t.slice(0, 120));
    if (isimler.length >= 8) break;
  }
  if (!isimler.length) return { lider: konsorsiyumMu ? '(Konsorsiyum)' : null, konsorsiyum: [] };
  return {
    lider: isimler[0],
    konsorsiyum: konsorsiyumMu ? isimler : [],
    konsorsiyumMu
  };
}

// Bir bölümün maddelerini toplar; sonraki başlık ya da dipnot görülünce durur.
const BOLUM_BASLIKLARI = [
  'Halka Arz Şekli', 'Fonun Kullanım Yeri', 'Halka Arz Satış Yöntemi', 'Tahsisat Grupları',
  'Dağıtılacak Pay Miktarı', 'Finansal Tablo', 'Fiyat İstikrarı', 'Satmama Taahhüdü',
  'Halka Açıklık', 'Halka Arz İskontosu', 'Özet Bilgiler', 'Yatırımcı Grubu', 'Piyasa Değeri'
];

function maddeler(metin, baslik, limit = 12) {
  const i = metin.indexOf(baslik);
  if (i < 0) return [];
  const dilim = metin.slice(i + baslik.length, i + baslik.length + 1600);
  const out = [];
  for (const p of dilim.split('|')) {
    const t = p.trim();
    if (!t) continue;
    if (/^\*/.test(t)) break;                                    // dipnot → bölüm bitti
    if (BOLUM_BASLIKLARI.some(b => b !== baslik && t.startsWith(b))) break; // sonraki başlık
    if (/^-\s+/.test(t)) out.push(t.replace(/^-\s+/, '').replace(/\s+/g, ' ').trim());
    if (out.length >= limit) break;
  }
  return out;
}

// ——— halkarz.com WP REST API: yıl kategorileri arzların kesin listesini verir.
// Kategori kimlikleri yıl adıyla eşleşir (ör. 2026 → 1490); önce kategori tablosu çekilir.
export async function arzYillari() {
  const j = await getir('https://halkarz.com/wp-json/wp/v2/categories?per_page=60&_fields=id,slug,count');
  if (!Array.isArray(j)) return {};
  const harita = {};
  for (const c of j) if (/^(19|20)\d{2}$/.test(c.slug)) harita[c.slug] = { id: c.id, adet: c.count };
  return harita;
}

export async function arzListesiYil(kategoriId) {
  const j = await getir(`https://halkarz.com/wp-json/wp/v2/posts?categories=${kategoriId}&per_page=100&_fields=slug,date,link,title`);
  if (!Array.isArray(j)) return [];
  return j.map(p => ({
    slug: p.slug,
    bag: p.link,
    yayin: p.date.slice(0, 10),
    ad: cozHtml(p.title?.rendered || '')
  }));
}

// Künye yüzde alanlarında ayırıcı NOKTADIR ("%31.67"); sayiya() noktayı binlik sayar.
const oranSayi = s => {
  if (s == null) return null;
  const m = String(s).match(/-?[0-9]+(?:[.,][0-9]+)?/);
  if (!m) return null;
  const v = parseFloat(m[0].replace(',', '.'));
  return isFinite(v) ? v : null;
};

const sayiya = s => {
  if (s == null) return null;
  const m = String(s).match(/-?[\d.]+(?:,\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? v : null;
};

// ——— halkarz.com arz detay sayfası: fiyat, dağıtım, iskonto, tahsisat, finansallar.
export async function arzDetay(url) {
  const ham = await getir(url, { tur: 'metin' });
  if (!ham) return null;
  const t = cozHtml(
    ham.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '|').replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').replace(/\|\s*\|+/g, '|')
  );

  const dagitimHam = alan(t, 'Dağıtım Yöntemi');
  const d = {
    kaynak: url,
    tarihMetni: alan(t, 'Halka Arz Tarihi'),
    fiyatMetni: alan(t, 'Halka Arz Fiyatı/Aralığı') || alan(t, 'Halka Arz Fiyatı'),
    dagitim: dagitimHam ? dagitimHam.replace(/\*+/g, '').trim() : null,
    payLot: sayiya(alan(t, 'Pay')),
    bistKodu: alan(t, 'Bist Kodu'),
    pazar: alan(t, 'Pazar'),
    endeks: alan(t, 'Endeks'),
    bistIlkIslem: alan(t, 'Bist İlk İşlem Tarihi'),
    fiiliDolasim: sayiya(alan(t, 'Fiili Dolaşımdaki Pay')),
    fiiliDolasimOran: oranSayi(alan(t, 'Fiili Dolaşımdaki Pay Oranı (%)')),
    halkaAciklik: sayiya((maddeler(t, 'Halka Açıklık', 2)[0] || '').replace('%', '')),
    iskonto: sayiya((maddeler(t, 'Halka Arz İskontosu', 2)[0] || '').replace('%', '')),
    fiyatIstikrari: maddeler(t, 'Fiyat İstikrarı', 3).join(' '),
    satmamaTaahhudu: maddeler(t, 'Satmama Taahhüdü', 4),
    arzSekli: maddeler(t, 'Halka Arz Şekli', 4),
    fonKullanimi: maddeler(t, 'Fonun Kullanım Yeri', 6),
    satisYontemi: maddeler(t, 'Halka Arz Satış Yöntemi', 4),
    tahsisat: maddeler(t, 'Tahsisat Grupları', 6),
    lotTahmini: maddeler(t, 'Dağıtılacak Pay Miktarı', 10)
  };

  d.fiyat = sayiya(d.fiyatMetni);

  const ak = araciKurumlar(t);
  d.araciKurum = ak.lider;
  d.konsorsiyum = ak.konsorsiyum;
  d.konsorsiyumMu = !!ak.konsorsiyumMu;

  // Arz şekli: para şirkete mi giriyor (sermaye artırımı), ortağın cebine mi (ortak satışı)?
  for (const s of d.arzSekli) {
    if (/Sermaye Art/i.test(s)) d.sermayeArtirimi = sayiya(s);
    if (/Ortak Sat/i.test(s)) d.ortakSatisi = sayiya(s);
  }
  if (d.sermayeArtirimi != null || d.ortakSatisi != null) {
    const top = (d.sermayeArtirimi || 0) + (d.ortakSatisi || 0);
    d.sermayeOrani = top ? Math.round((d.sermayeArtirimi || 0) / top * 100) : null;
  }

  // Bireysel yatırımcı tahsisatı.
  const bir = d.tahsisat.find(x => /Bireysel/i.test(x));
  if (bir) {
    d.bireyselOran = sayiya((bir.match(/%\s*([\d,.]+)/) || [])[1]);
    d.bireyselLot = sayiya(bir);
  }

  // Tamamlanmış arzlarda gerçekleşen dağıtım tablosu: kişi / lot / oran.
  const kt = t.indexOf('Yatırımcı Grubu');
  if (kt > 0) {
    const dilim = t.slice(kt, kt + 1400);
    const gruplar = [];
    for (const g of ['Yurt İçi Bireysel', 'Yurt İçi Kurumsal', 'Yurt Dışı Kurumsal', 'Yurt Dışı Bireysel', 'Şirket Çalışanları']) {
      const re = new RegExp(g + '\\|+\\s*([\\d.]+)\\s*\\|+\\s*([\\d.]+)\\s*\\|+\\s*%\\s*([\\d,.]+)');
      const m = dilim.match(re);
      if (m) gruplar.push({ grup: g, kisi: sayiya(m[1]), lot: sayiya(m[2]), oran: sayiya(m[3]) });
    }
    if (gruplar.length) {
      d.dagitimTablosu = gruplar;
      const b = gruplar.find(x => /Bireysel/.test(x.grup));
      if (b?.kisi) {
        d.katilimci = b.kisi;
        d.kisiBasiLot = Math.round(b.lot / b.kisi);
        if (d.fiyat) d.kisiBasiTutar = Math.round(b.lot / b.kisi * d.fiyat);
      }
    }
  }

  // Finansal tablo satırları.
  const fi = t.indexOf('Finansal Tablo');
  if (fi > 0) {
    const dilim = t.slice(fi, fi + 1100);
    // İleri bakışlı kalıp: "|2026/6|2025|2024|" dizisinde ardışık dönemler de yakalanır.
    d.donemler = [...dilim.matchAll(/\|(\d{4}(?:\/\d{1,2})?)(?=\|)/g)].map(m => m[1]).slice(0, 4);
    const SATIRLAR = ['Hasılat', 'Brüt Kâr', 'Net Dönem Kârı', 'FAVÖK', 'Özkaynak'];
    d.finansal = {};
    for (const satir of SATIRLAR) {
      const re = new RegExp('- ?' + satir + '\\|((?:[^|]*\\|){1,4})');
      const m = dilim.match(re);
      if (!m) continue;
      // Bir sonraki satırın etiketi ("- Brüt Kâr") değere karışmasın.
      const degerler = m[1].split('|').map(s => s.trim())
        .filter(s => s && !/^-/.test(s) && !SATIRLAR.some(x => s.includes(x)))
        .slice(0, 4);
      if (degerler.length) d.finansal[satir] = degerler;
    }
  }
  return d;
}
