// index.mjs — günlük veri toplayıcı.
// GitHub Actions her gün çalıştırır; çıktı olarak veri.json ve arsiv.json üretir.
// Arşiv, değişmeyen arz bilgilerini önbelleğe alır; günlük koşu sadece fiyatları tazeler.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as K from './kaynak.mjs';
import * as A from './analiz.mjs';
import * as T from './ta.mjs';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARSIV_YOLU = join(KOK, 'veri', 'arsiv.json');
const CIKTI_YOLU = join(KOK, 'veri', 'veri.json');
const YILLAR = ['2024', '2025', '2026'];
// Ayrıştırıcı her değiştiğinde artırılır; arşivdeki eski kayıtlar otomatik tazelenir.
const AYRISTIRICI_SURUMU = 2;

const bekle = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const AYLAR = { ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12 };

// "9-10-11 Eylül 2026" → talep toplamanın ilk ve son günü.
function tarihCoz(metin) {
  if (!metin) return null;
  const m = metin.match(/([\d\s–—-]+)\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*(\d{4})/);
  if (!m) return null;
  const ay = AYLAR[m[2].toLocaleLowerCase('tr-TR')];
  if (!ay) return null;
  const gunler = m[1].split(/[\s–—-]+/).map(x => parseInt(x, 10)).filter(x => x >= 1 && x <= 31);
  if (!gunler.length) return null;
  const yil = +m[3];
  const iso = (g) => `${yil}-${String(ay).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  return { baslangic: iso(gunler[0]), bitis: iso(gunler[gunler.length - 1]), yil };
}

// "Garanti Yatırım Menkul Kıymetler A.Ş." → "Garanti Yatırım"
// Filtre ve karşılaştırma tablolarında tam unvan okunaksız kalıyor.
function kisaKurum(ad) {
  if (!ad) return null;
  return ad
    .replace(/\s*(Menkul (Değerler|Kıymetler)|Yatırım Menkul.*|Menkul.*)\s*A\.Ş\.?$/i, '')
    .replace(/\s*A\.Ş\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || ad;
}

function arsivOku() {
  try { return JSON.parse(readFileSync(ARSIV_YOLU, 'utf8')); } catch { return { arzlar: {} }; }
}

function yaz(yol, nesne) {
  mkdirSync(dirname(yol), { recursive: true });
  writeFileSync(yol, JSON.stringify(nesne), 'utf8');
  log('  →', yol.replace(KOK, '.'), (JSON.stringify(nesne).length / 1024).toFixed(0) + ' KB');
}

// ————————————————————————————————————————————————————————
async function main() {
  const t0 = Date.now();
  const bugun = new Date().toISOString().slice(0, 10);
  const uyarilar = [];
  log('MİHENK toplayıcı —', new Date().toISOString());

  // ——— 1. Metaller, kur, endeks
  log('\n[1/5] Piyasa verileri…');
  const arsivOn = arsivOku();
  const [altin, gumus, kur, bist, tgTaze, sp] = await Promise.all([
    K.yahoo('GC=F', '2y'),
    K.yahoo('SI=F', '2y'),
    K.yahoo('USDTRY=X', '2y'),
    K.yahoo('XU100.IS', '5y'),
    K.truncgil(),
    K.spot()
  ]);
  if (!altin) uyarilar.push('Altın fiyat geçmişi alınamadı.');
  if (!gumus) uyarilar.push('Gümüş fiyat geçmişi alınamadı.');

  // Truncgil zaman zaman cevap vermiyor. Ziynet fiyatları başka kaynaktan
  // hesaplanamadığı için son bilinen değer saklanır ve bayatlığı işaretlenir.
  let tg = tgTaze, tgBayat = null;
  if (tgTaze) {
    arsivOn.sonTruncgil = { veri: tgTaze, zaman: new Date().toISOString() };
  } else if (arsivOn.sonTruncgil) {
    tg = arsivOn.sonTruncgil.veri;
    tgBayat = arsivOn.sonTruncgil.zaman;
    const saat = Math.round((Date.now() - new Date(tgBayat)) / 36e5);
    uyarilar.push(`Serbest piyasa fiyat kaynağı yanıt vermedi; ziynet fiyatları ${saat} saat önceki son bilinen değerlerdir.`);
  } else {
    uyarilar.push('TL cinsi ziynet fiyatları alınamadı.');
  }
  log(`  altın ${altin?.kapanis.length ?? 0} bar · gümüş ${gumus?.kapanis.length ?? 0} · kur ${kur?.kapanis.length ?? 0} · BIST ${bist?.kapanis.length ?? 0}`);
  log(`  gram altın ${tg?.gramAltin?.satis ?? '—'} TL · gram gümüş ${tg?.gramGumus?.satis ?? '—'} TL`);

  // ——— 2. Arz listeleri (yıl kategorileri)
  log('\n[2/5] Halka arz listeleri…');
  const yilHarita = await K.arzYillari();
  const arsiv = arsivOn;
  const hedefler = [];
  for (const y of YILLAR) {
    if (!yilHarita[y]) { uyarilar.push(`${y} arz listesi bulunamadı.`); continue; }
    const l = await K.arzListesiYil(yilHarita[y].id);
    log(`  ${y}: ${l.length} arz`);
    l.forEach(x => hedefler.push({ ...x, yil: y }));
  }

  // ——— 3. Detay sayfaları (önbellekli)
  log('\n[3/5] Arz detayları…');
  let yeni = 0, onbellek = 0;
  for (const h of hedefler) {
    const mevcut = arsiv.arzlar[h.slug];
    // Yakın tarihli/yaklaşan arzlar her koşuda tazelenir (sonuçlar sonradan yayımlanıyor).
    const taze = mevcut?.cekildi && (Date.now() - new Date(mevcut.cekildi)) < 21 * 864e5;
    const tamamlanmis = mevcut?.katilimci != null;
    const surumUygun = mevcut?.surum === AYRISTIRICI_SURUMU;
    if (mevcut && surumUygun && (tamamlanmis || taze)) { onbellek++; continue; }
    const d = await K.arzDetay(h.bag);
    if (d) {
      arsiv.arzlar[h.slug] = { ...d, slug: h.slug, ad: h.ad, yil: h.yil, yayin: h.yayin, surum: AYRISTIRICI_SURUMU, cekildi: new Date().toISOString() };
      yeni++;
    }
    await bekle(350); // kaynağa nazik davran
  }
  log(`  ${yeni} yeni çekildi, ${onbellek} önbellekten`);
  yaz(ARSIV_YOLU, arsiv);

  // ——— 4. Borsa performansı
  log('\n[4/5] Arz performansları…');
  const arzlar = [];
  for (const h of hedefler) {
    const a = arsiv.arzlar[h.slug];
    if (!a) continue;
    const kod = a.bistKodu || null;
    const tarih = tarihCoz(a.tarihMetni);
    const kayit = {
      slug: h.slug, kod, ad: a.ad, yil: h.yil,
      tarihMetni: a.tarihMetni, tarih,
      fiyat: a.fiyat, dagitim: a.dagitim, pazar: a.pazar,
      araciKurum: a.araciKurum, araciKisa: kisaKurum(a.araciKurum),
      konsorsiyum: a.konsorsiyum?.length ? a.konsorsiyum : null,
      konsorsiyumMu: !!a.konsorsiyumMu,
      endeks: a.endeks, bistIlkIslem: a.bistIlkIslem, fiiliDolasimOran: a.fiiliDolasimOran,
      payLot: a.payLot, iskonto: a.iskonto, halkaAciklik: a.halkaAciklik,
      sermayeArtirimi: a.sermayeArtirimi, ortakSatisi: a.ortakSatisi, sermayeOrani: a.sermayeOrani,
      fiyatIstikrari: a.fiyatIstikrari, satmamaTaahhudu: a.satmamaTaahhudu,
      fonKullanimi: a.fonKullanimi, tahsisat: a.tahsisat, lotTahmini: a.lotTahmini,
      bireyselOran: a.bireyselOran, katilimci: a.katilimci, kisiBasiLot: a.kisiBasiLot,
      kisiBasiTutar: a.kisiBasiTutar, dagitimTablosu: a.dagitimTablosu,
      donemler: a.donemler, finansal: a.finansal, kaynak: a.kaynak, logo: null
    };
    kayit.faktor = A.arzFaktorleri(kayit);
    kayit.durum = !tarih ? 'belirsiz' : (tarih.bitis >= bugun ? 'yaklasan' : 'tamamlandi');
    arzlar.push(kayit);
  }

  // Kartlardan logo eşle.
  const kartlar = await K.arzKartlari();
  const logoHarita = {};
  for (const k of kartlar) if (k.kod && k.logo) logoHarita[k.kod] = k.logo;
  for (const a of arzlar) if (a.kod && logoHarita[a.kod]) a.logo = logoHarita[a.kod];

  // Tarihi açıklanmamış kartlar = SPK başvurusu yapılmış, sıra bekleyen şirketler.
  const bilinenKodlar = new Set(arzlar.map(a => a.kod).filter(Boolean));
  const taslaklar = kartlar
    .filter(k => !k.tarih && k.kod && !bilinenKodlar.has(k.kod))
    .map(k => ({ kod: k.kod, ad: k.ad, bag: k.bag, logo: k.logo }));
  log(`  sırada bekleyen (taslak) arz: ${taslaklar.length}`);

  // Yahoo'dan fiyat geçmişi — sadece işlem görmeye başlamış olanlar için.
  const islemdekiler = arzlar.filter(a => a.kod && a.durum === 'tamamlandi');
  log(`  ${islemdekiler.length} kod için fiyat çekiliyor…`);
  let basarili = 0;
  for (const a of islemdekiler) {
    const g = await K.yahoo(a.kod + '.IS', 'max');
    if (g?.kapanis?.length) {
      a.perf = A.arzPerformans(a, g, bist);
      a.seri = g.kapanis.slice(-120).map(v => T.yuvarla(v, 2));
      basarili++;
    }
    await bekle(120);
  }
  log(`  ${basarili}/${islemdekiler.length} kodda fiyat bulundu`);

  // ——— 5. Analizler
  log('\n[5/5] Analiz ve haberler…');
  const gecmis = arzlar.filter(a => a.perf?.getiri != null);
  // Önce tamamlanmış arzlar geriye dönük puanlanır — her biri YALNIZCA kendisinden
  // önceki arzlarla, yoksa puan kendi sonucunu bilerek hesaplanmış olur.
  const puanlanan = A.geriyeDonukPuanla(gecmis, 12);
  const dogrulama = A.puanDogrulama(gecmis);

  // Yaklaşan arzın hükmü, puanın kendi karnesini de cümlesine katabilsin diye sonra gelir.
  const yaklasanlar = arzlar.filter(a => a.durum === 'yaklasan');
  for (const y of yaklasanlar) y.degerlendirme = A.arzDegerlendir(y, gecmis, dogrulama);
  log(`  geriye dönük puanlanan arz: ${puanlanan} · puan-getiri sırası ${dogrulama.tutarli ? 'tutarlı' : 'kısmen tutarlı'}`);

  const ozetler = {};
  for (const y of YILLAR) ozetler[y] = A.yilOzeti(arzlar.filter(a => a.yil === y));
  // Yıllar üstü karşılaştırma için birleşik özet (arayüzde "Tüm yıllar" seçeneği).
  ozetler.tum = A.yilOzeti(arzlar);

  // Faktör kanıt tabloları — kullanıcı puanın nereden geldiğini görebilsin.
  const kanitlar = {
    iskonto: A.faktorKaniti(gecmis, 'iskonto', [
      { max: 15, etiket: 'Düşük iskonto (%15 altı)' },
      { min: 15, max: 25, etiket: 'Orta iskonto (%15-25)' },
      { min: 25, etiket: 'Yüksek iskonto (%25 üstü)' }
    ]),
    halkaAciklik: A.faktorKaniti(gecmis, 'halkaAciklik', [
      { max: 15, etiket: 'Dar (%15 altı)' },
      { min: 15, max: 30, etiket: 'Orta (%15-30)' },
      { min: 30, etiket: 'Geniş (%30 üstü)' }
    ]),
    buyukluk: A.faktorKaniti(gecmis, 'buyuklukMilyar', [
      { max: 1.5, etiket: 'Küçük (1,5 mlr TL altı)' },
      { min: 1.5, max: 4, etiket: 'Orta (1,5-4 mlr TL)' },
      { min: 4, etiket: 'Büyük (4 mlr TL üstü)' }
    ]),
    sermaye: A.faktorKaniti(gecmis, 'sermayeOrani', [
      { max: 60, etiket: 'Ağırlıkla ortak satışı' },
      { min: 60, max: 99, etiket: 'Karma' },
      { min: 99, etiket: 'Tamamı sermaye artırımı' }
    ])
  };

  // Gram fiyat: piyasadan gelen (Truncgil) ile teoriğin (ons × kur ÷ 31,1035) karşılaştırması.
  // Teorik değer aynı zamanda Truncgil düştüğünde yedek kaynaktır.
  const ONS_GRAM = 31.1034768;
  const usdtry = kur ? T.son(kur.kapanis) : null;
  const teorik = (ons) => (ons && usdtry) ? T.yuvarla(ons * usdtry / ONS_GRAM, 2) : null;
  const teorikAltin = teorik(altin ? T.son(altin.kapanis) : null);
  const teorikGumus = teorik(gumus ? T.son(gumus.kapanis) : null);

  const prim = (piyasa, kuramsal) =>
    (piyasa && kuramsal) ? T.yuvarla((piyasa - kuramsal) / kuramsal * 100, 2) : null;

  const gramAltinTL = tgTaze?.gramAltin?.satis ?? teorikAltin;
  const gramGumusTL = tgTaze?.gramGumus?.satis ?? teorikGumus;
  const gramKaynak = tgTaze?.gramAltin?.satis ? 'piyasa' : 'hesaplanan';

  const metaller = {};
  if (altin) metaller.altin = A.metalAnaliz(altin, 'Altın (ons/USD)', { tlFiyat: gramAltinTL, tlEtiket: 'gram altın' });
  if (gumus) metaller.gumus = A.metalAnaliz(gumus, 'Gümüş (ons/USD)', { tlFiyat: gramGumusTL, tlEtiket: 'gram gümüş' });
  if (kur) metaller.kur = A.metalAnaliz(kur, 'Dolar/TL', {});

  const ayristirma = {};
  if (altin && kur) {
    for (const [ad, bar] of [['ay', 21], ['ucAy', 63], ['yil', 252]]) {
      ayristirma[ad] = A.tlAyristirma(altin.kapanis, kur.kapanis, bar);
    }
  }
  const oran = (altin && gumus) ? A.oranAnaliz(altin.kapanis, gumus.kapanis) : null;

  // Haberler
  const [haberAltin, haberGumus, haberArz] = await Promise.all([
    K.haber('altın fiyat OR "gram altın" OR "ons altın"', 10),
    K.haber('gümüş fiyat OR "gram gümüş" OR "ons gümüş"', 8),
    K.haber('halka arz borsa istanbul', 10)
  ]);
  for (const y of yaklasanlar) {
    y.haberler = await K.haber(`"${y.kod}" halka arz`, 6);
    await bekle(200);
  }

  const cikti = {
    uretim: new Date().toISOString(),
    bugun,
    uyarilar,
    kaynaklar: {
      metalGecmis: 'Yahoo Finance (GC=F, SI=F, USDTRY=X, XU100.IS) — günlük kapanış',
      metalTL: 'Truncgil v4 — serbest piyasa gram/ziynet fiyatları',
      spot: 'gold-api.com — anlık ons altın/gümüş',
      arz: 'halkarz.com — izahname ve SPK bültenine dayalı arz künyeleri',
      haber: 'Google Haberler RSS (Türkçe)'
    },
    piyasa: {
      truncgil: tg, truncgilBayat: tgBayat, spot: sp,
      onsAltin: altin ? T.yuvarla(T.son(altin.kapanis), 2) : null,
      onsGumus: gumus ? T.yuvarla(T.son(gumus.kapanis), 2) : null,
      usdtry: usdtry ? T.yuvarla(usdtry, 4) : null,
      bist100: bist ? T.yuvarla(T.son(bist.kapanis), 0) : null,
      bistDegisim: bist ? T.degisim(bist.kapanis, 1) : null,
      gram: {
        altin: gramAltinTL, gumus: gramGumusTL, kaynak: gramKaynak,
        teorikAltin, teorikGumus,
        // Türkiye piyasasında gram altın çoğu zaman teorik değerin üzerinde işlem görür;
        // bu makas, yurt içi talep baskısının doğrudan göstergesidir.
        primAltin: prim(tgTaze?.gramAltin?.satis, teorikAltin),
        primGumus: prim(tgTaze?.gramGumus?.satis, teorikGumus)
      }
    },
    metaller, ayristirma, oran,
    arz: {
      arzlar, yaklasanlar: yaklasanlar.map(y => y.slug), taslaklar, ozetler, kanitlar,
      kurumKarnesi: A.kurumKarnesi(gecmis, 2),
      puanDogrulama: dogrulama
    },
    haberler: { altin: haberAltin, gumus: haberGumus, arz: haberArz }
  };

  yaz(CIKTI_YOLU, cikti);
  log(`\nBitti — ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
  log(`Arz: ${arzlar.length} kayıt (${gecmis.length} performanslı, ${yaklasanlar.length} yaklaşan)`);
  if (uyarilar.length) log('UYARILAR:', uyarilar.join(' | '));
}

main().catch(e => { console.error('ÇÖKTÜ:', e); process.exit(1); });
