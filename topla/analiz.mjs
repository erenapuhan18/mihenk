// analiz.mjs — karar motoru.
// İki iş yapar: (1) metaller için teknik durum + kademeli giriş planı,
// (2) halka arzlar için geçmiş arzların GERÇEK getirilerinden kalibre edilmiş puanlama.
// Hiçbir ağırlık uydurulmaz; her yargı arkasındaki sayıyı da yayımlar.

import * as T from './ta.mjs';

const { yuvarla, son } = T;

// İki istatistik de hesaplanır ve yan yana yayımlanır:
// MEDYAN "tipik arz ne yaptı" sorusunu doğru cevaplar ve puan kalibrasyonunda
// kullanılır — tek bir +%4.951 uç değeri bütün kovayı bozmasın diye.
// ORTALAMA ise "hepsine girilseydi ne olurdu"yu gösterir; bilgilendirici ama
// bu veride uçlara aşırı duyarlı, o yüzden puanı ona dayandırmıyoruz.
export function medyan(dizi) {
  const d = dizi.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!d.length) return null;
  const o = Math.floor(d.length / 2);
  return d.length % 2 ? d[o] : (d[o - 1] + d[o]) / 2;
}

export const ortalama = d => {
  const t = d.filter(x => x != null && isFinite(x));
  return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
};

// ——— Finansal metin çözümü: "5,4 Milyar TL" → 5.4e9
export const paraCoz = s => {
  if (!s) return null;
  const m = String(s).match(/([\d.,]+)\s*(Milyar|Milyon|Bin)?/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (!isFinite(v)) return null;
  const c = /milyar/i.test(m[2] || '') ? 1e9 : /milyon/i.test(m[2] || '') ? 1e6 : /bin/i.test(m[2] || '') ? 1e3 : 1;
  return v * c;
};

const nfTR = n => (n == null || !isFinite(n)) ? "—" : new Intl.NumberFormat("tr-TR").format(Math.round(n));

const kis = (x, a, b) => Math.max(a, Math.min(b, x));

// ————————————————————————————————————————————————————————————
// 1. METAL ANALİZİ
// ————————————————————————————————————————————————————————————

export function metalAnaliz(gecmis, ad, { tlFiyat = null, tlEtiket = '' } = {}) {
  const { yuksek, dusuk, kapanis } = gecmis;
  const fiyat = son(kapanis);

  const sma20 = T.sma(kapanis, 20), sma50 = T.sma(kapanis, 50), sma200 = T.sma(kapanis, 200);
  const rsi = T.rsi(kapanis, 14);
  const atr = T.atr(yuksek, dusuk, kapanis, 14);
  const boll = T.bollinger(kapanis, 20, 2);
  const mac = T.macd(kapanis);
  const sd = T.destekDirenc(yuksek, dusuk, kapanis, 3);
  const fib = T.fibonacci(yuksek, dusuk, kapanis);

  // Trend puanı: birbirinden bağımsız beş sinyalin toplamı, kabaca -100..+100.
  let puan = 0;
  const sinyaller = [];
  const ekle = (kosul, agirlik, evet, hayir) => {
    if (kosul == null) return;
    puan += kosul ? agirlik : -agirlik;
    sinyaller.push({ olumlu: !!kosul, agirlik, metin: kosul ? evet : hayir });
  };

  ekle(sma200 != null ? fiyat > sma200 : null, 25,
    '200 günlük ortalamanın üzerinde — ana trend yukarı',
    '200 günlük ortalamanın altında — ana trend zayıf');
  ekle(sma50 != null ? fiyat > sma50 : null, 20,
    '50 günlük ortalamanın üzerinde — orta vade güçlü',
    '50 günlük ortalamanın altında — orta vade baskı altında');
  ekle((sma50 != null && sma200 != null) ? sma50 > sma200 : null, 15,
    'Ortalamalar yukarı dizilmiş (50 > 200)',
    'Ortalamalar aşağı dizilmiş (50 < 200)');
  ekle(mac ? mac.fark > 0 : null, 15,
    'MACD sinyal çizgisinin üzerinde — momentum olumlu',
    'MACD sinyal çizgisinin altında — momentum zayıflıyor');
  if (rsi != null) {
    const katki = kis((rsi - 50) / 50 * 25, -25, 25);
    puan += katki;
    sinyaller.push({
      olumlu: katki > 0, agirlik: Math.abs(yuvarla(katki, 0)),
      metin: `RSI ${yuvarla(rsi, 1)} — ${rsi > 70 ? 'aşırı alım bölgesi' : rsi < 30 ? 'aşırı satım bölgesi' : rsi > 55 ? 'alıcılı' : rsi < 45 ? 'satıcılı' : 'nötr'}`
    });
  }
  puan = yuvarla(kis(puan, -100, 100), 0);

  // ——— Karar ve kademeli giriş planı
  const asiriAlim = rsi != null && rsi > 70;
  const asiriSatim = rsi != null && rsi < 32;
  const yukariTrend = puan >= 25;
  const asagiTrend = puan <= -25;
  const d1 = sd.destek[0], d2 = sd.destek[1];

  // Gerekçe, uydurma bir cümle değil; gerçekleşen sinyallerden kurulur.
  const konum = [];
  if (sma50 != null) konum.push(`50 günlük ortalamanın (${yuvarla(sma50, fiyat > 500 ? 0 : 2)}) ${fiyat > sma50 ? 'üzerinde' : 'altında'}`);
  if (sma200 != null) konum.push(`200 günlük ortalamanın (${yuvarla(sma200, fiyat > 500 ? 0 : 2)}) ${fiyat > sma200 ? 'üzerinde' : 'altında'}`);
  const konumMetni = konum.join(', ');
  const momentum = mac ? (mac.fark > 0 ? 'momentum olumlu' : 'momentum negatif') : 'momentum ölçülemedi';
  const karisik = sma50 != null && sma200 != null && (fiyat > sma50) !== (fiyat > sma200);

  let tur, baslik, gerekce;
  if (yukariTrend && asiriAlim) {
    tur = 'bekle';
    baslik = 'Trend güçlü ama fiyat gergin — geri çekilmede al';
    gerekce = `Fiyat ${konumMetni}; ${momentum}. Trend puanı ${puan} ile yukarı tarafta, ancak RSI ${yuvarla(rsi, 1)} aşırı alım bölgesinde. Bu seviyeden peşin girmek ortalama maliyeti yükseltir; ilk desteği beklemek daha iyi risk/getiri verir.`;
  } else if (yukariTrend) {
    tur = 'kademeli';
    baslik = 'Trend yukarı — kademeli alım uygun';
    gerekce = `Fiyat ${konumMetni}; ${momentum}. Trend puanı ${puan}. Tek seferde değil üç kademede girmek, olası düzeltmede ortalama maliyeti düşürür.`;
  } else if (asagiTrend && asiriSatim) {
    tur = 'kademeli';
    baslik = 'Düşüş sert — sadece küçük kademelerle';
    gerekce = `Fiyat ${konumMetni}; ${momentum}. Trend puanı ${puan} ile aşağıda ama RSI ${yuvarla(rsi, 1)} aşırı satım bölgesinde; tepki yükselişi olasılığı var. Trend dönmediği için pozisyon küçük tutulmalı.`;
  } else if (asagiTrend) {
    tur = 'azalt';
    baslik = karisik ? 'Kısa vade toparlıyor, ana trend hâlâ zayıf' : 'Trend aşağı — yeni alım için acele etme';
    gerekce = karisik
      ? `Fiyat ${konumMetni} — yani kısa vadede toparlanmış ama ana trend henüz dönmemiş; ${momentum}. Trend puanı ${puan}. Bu tabloda peşin alım yerine sadece desteklere emir bırakmak, 200 günlük ortalama geri alınana kadar riski sınırlar.`
      : `Fiyat ${konumMetni}; ${momentum}. Trend puanı ${puan}. Düşen trendde ortalama düşürmek çoğu zaman zararı büyütür; 50 günlük ortalamanın geri alınması beklenmeli.`;
  } else {
    tur = 'bekle';
    baslik = 'Yönsüz — bant kenarlarında işlem';
    gerekce = `Fiyat ${konumMetni}; ${momentum}. Trend puanı ${puan} ile nötr bölgede. Net bir yön yok; destekten al, dirençte kâr al mantığı daha uygun.`;
  }

  // Kademeler: destek seviyeleri varsa oraya, yoksa ATR mesafesine göre kur.
  const adim = atr ? atr * 1.2 : fiyat * 0.02;
  const ond = fiyat > 500 ? 0 : 2;
  const sev1 = d1 ? d1.fiyat : yuvarla(fiyat - adim, ond);
  const sev2 = d2 ? d2.fiyat : yuvarla(fiyat - adim * 2.2, ond);

  const dagilim = tur === 'kademeli' ? [40, 35, 25]
    : tur === 'bekle' ? [20, 45, 35]
      : [0, 45, 55];

  const kademeler = [
    { pay: dagilim[0], fiyat: yuvarla(fiyat, ond), etiket: 'Şu anki fiyat', not: dagilim[0] === 0 ? 'Bu aşamada peşin alım önerilmiyor' : 'İlk kademe — pozisyonu başlat' },
    { pay: dagilim[1], fiyat: sev1, etiket: d1 ? `1. destek (${d1.guc})` : 'Yaklaşık 1,2 ATR aşağısı', not: 'Geri çekilmede ekleme' },
    { pay: dagilim[2], fiyat: sev2, etiket: d2 ? `2. destek (${d2.guc})` : 'Yaklaşık 2,2 ATR aşağısı', not: 'Derin düzeltmede son kademe' }
  ].filter(k => k.pay > 0);

  // Ortalama maliyet: kademeler tamamlanırsa oluşacak giriş fiyatı.
  const toplamPay = kademeler.reduce((a, k) => a + k.pay, 0);
  const ortMaliyet = yuvarla(kademeler.reduce((a, k) => a + k.fiyat * k.pay, 0) / toplamPay, ond);

  // Stop, EN DERİN kademenin altına konur; ilk desteğe göre kurulursa
  // ortalama maliyetin üstünde kalıp risk/ödülü sahte biçimde şişirir.
  const enDerin = Math.min(...kademeler.map(k => k.fiyat));
  const altDestek = sd.destek.find(s => s.fiyat < enDerin * 0.999);
  const stop = yuvarla(
    altDestek ? altDestek.fiyat - (atr || fiyat * 0.02) * 0.5 : enDerin - (atr || fiyat * 0.02) * 1.5,
    ond
  );
  const hedef1 = sd.direnc[0]?.fiyat ?? yuvarla(fiyat + adim * 2, ond);
  const hedef2 = sd.direnc[1]?.fiyat ?? yuvarla(fiyat + adim * 4, ond);

  const riskTL = ortMaliyet - stop;
  const odulTL = hedef1 - ortMaliyet;

  // ——— Net hüküm: tek kelimelik karar + yapılacak somut iş + fikri değiştirecek eşik.
  // Kullanıcı "al mı almasın" cevabını arıyor; belirsizlik varsa o da açıkça yazılır.
  // Hüküm cümlesindeki sayılar Türkçe biçimde yazılır: 4.259 · 62,87
  const f = v => (v == null || !isFinite(v)) ? '—' : new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: ond, maximumFractionDigits: ond
  }).format(v);
  const k1 = kademeler[0], sonK = kademeler[kademeler.length - 1];
  let hukum, netCumle, donusNoktasi;

  if (tur === 'kademeli') {
    hukum = 'KADEMELİ AL';
    netCumle = `Alınır — ama tek seferde değil. Bugün ${f(fiyat)} seviyesinden pozisyonun %${k1.pay}’ini al; kalanı ${kademeler.slice(1).map(k => `${f(k.fiyat)} (%${k.pay})`).join(' ve ')} seviyelerine emir olarak bırak. Zarar kes ${f(stop)}.`;
    donusNoktasi = sma50 != null
      ? `Fiyat 50 günlük ortalamanın (${f(sma50)}) altında kapanırsa plan iptal — kalan kademeleri girme.`
      : `Fiyat ${f(stop)} altında kapanırsa plan iptal.`;
  } else if (tur === 'bekle' && asiriAlim) {
    hukum = 'BEKLE';
    netCumle = `Bugün alma. Trend yukarı ama fiyat gergin (RSI ${yuvarla(rsi, 0)}). ${f(k1.fiyat)} seviyesine alım emri bırak; oraya gelirse %${k1.pay} ile başla, gelmezse bu turu pas geç.`;
    donusNoktasi = `RSI 60’ın altına çekilir ya da fiyat ${f(sd.destek[0]?.fiyat ?? stop)} desteğine gelirse hüküm “kademeli al”a döner.`;
  } else if (tur === 'azalt') {
    hukum = 'ALMA';
    netCumle = `Yeni alım yapma. Ana trend henüz dönmedi. Elinde varsa satmak zorunda değilsin ama ekleme yapma; ${f(sonK.fiyat)} altına sarkarsa pozisyonu küçült.`;
    donusNoktasi = sma200 != null
      ? `Fiyat 200 günlük ortalamanın (${f(sma200)}) üzerinde iki gün üst üste kapanırsa hüküm “kademeli al”a döner. Bugün oraya %${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((sma200 - fiyat) / fiyat * 100)} var.`
      : 'Ortalamalar yukarı dizilene kadar bekle.';
  } else {
    hukum = 'BEKLE';
    netCumle = `Acele etme. Yön belirsiz; ${f(k1.fiyat)} desteğine emir bırak, ${f(hedef1)} direncine yaklaşırsa kâr al. Aradaki bantta işlem açma.`;
    donusNoktasi = `Bant kırılırsa (${f(stop)} altı ya da ${f(hedef1)} üstü kapanış) yön netleşir.`;
  }

  // Risk/ödül elverişsizse hüküm ne olursa olsun uyar.
  const riskUyari = (riskTL > 0 && odulTL > 0 && odulTL / riskTL < 1)
    ? `Dikkat: ilk hedefe kazanç (${f(odulTL)}), stopa risk (${f(riskTL)}) kadarından az. Bu kurulumda pozisyonu küçük tut.`
    : null;

  return {
    ad,
    fiyat: yuvarla(fiyat, ond),
    tlFiyat, tlEtiket,
    guncelBar: gecmis.tarih.at(-1),
    teknik: {
      rsi: yuvarla(rsi, 1),
      sma20: yuvarla(sma20, ond), sma50: yuvarla(sma50, ond), sma200: yuvarla(sma200, ond),
      atr: yuvarla(atr, ond === 0 ? 1 : 2),
      atrYuzde: yuvarla(atr / fiyat * 100, 2),
      macdFark: yuvarla(mac?.fark, 2),
      bollKonum: yuvarla(boll?.konum, 2),
      oynaklik: T.oynaklik(kapanis, 30),
      y52: sd.y52, d52: sd.d52,
      y52Uzaklik: yuvarla((fiyat - sd.y52) / sd.y52 * 100, 1),
      d52Uzaklik: yuvarla((fiyat - sd.d52) / sd.d52 * 100, 1)
    },
    degisim: {
      gun: T.degisim(kapanis, 1), hafta: T.degisim(kapanis, 5),
      ay: T.degisim(kapanis, 21), ucAy: T.degisim(kapanis, 63),
      altiAy: T.degisim(kapanis, 126), yil: T.degisim(kapanis, 252)
    },
    seviyeler: sd,
    fibonacci: fib,
    trendPuani: puan,
    sinyaller,
    karar: { tur, hukum, baslik, gerekce, netCumle, donusNoktasi, riskUyari },
    plan: {
      kademeler,
      ortalamaMaliyet: ortMaliyet,
      stop,
      stopYuzde: yuvarla((stop - ortMaliyet) / ortMaliyet * 100, 1),
      hedef1, hedef2,
      hedef1Yuzde: yuvarla((hedef1 - ortMaliyet) / ortMaliyet * 100, 1),
      riskOdul: (riskTL > 0 && odulTL > 0) ? yuvarla(odulTL / riskTL, 2) : null
    },
    seri: kapanis.slice(-180).map(v => yuvarla(v, ond)),
    seriTarih: gecmis.tarih.slice(-180)
  };
}

// TL yatırımcısı için: gram altının hareketi ne kadar metalden, ne kadar kurdan geldi?
export function tlAyristirma(metalSerisi, kurSerisi, barSayisi) {
  if (!metalSerisi || !kurSerisi) return null;
  const mg = T.degisim(metalSerisi, barSayisi);
  const kg = T.degisim(kurSerisi, barSayisi);
  if (mg == null || kg == null) return null;
  // (1+g_TL) = (1+g_metal)(1+g_kur) — bileşik terim ayrı gösterilir.
  const birlesik = ((1 + mg / 100) * (1 + kg / 100) - 1) * 100;
  return {
    metalKatkisi: yuvarla(mg, 2),
    kurKatkisi: yuvarla(kg, 2),
    toplam: yuvarla(birlesik, 2),
    metalPayi: birlesik !== 0 ? yuvarla(mg / birlesik * 100, 0) : null
  };
}

// Altın/gümüş oranı: hangi metal diğerine göre ucuz?
export function oranAnaliz(altinSeri, gumusSeri) {
  if (!altinSeri || !gumusSeri) return null;
  const n = Math.min(altinSeri.length, gumusSeri.length);
  const oran = [];
  for (let i = 0; i < n; i++) oran.push(altinSeri[altinSeri.length - n + i] / gumusSeri[gumusSeri.length - n + i]);
  const simdi = son(oran);
  const dilim = T.yuzdelik(oran, simdi);
  let yorum, taraf;
  if (dilim >= 80) {
    taraf = 'gümüş';
    yorum = `Oran son iki yılın en yüksek %${yuvarla(100 - dilim, 0)}’lik diliminde: gümüş altına göre belirgin ucuz. Oran daralırsa gümüş altından hızlı toparlar; ancak oran uzun süre yüksek kalabilir, bu tek başına alım sinyali değildir.`;
  } else if (dilim >= 60) {
    taraf = 'gümüş';
    yorum = 'Oran bandın üst yarısında; gümüş altına göre görece ucuz tarafta. Yeni alımda ağırlığı gümüşe kaydırmak makul.';
  } else if (dilim <= 20) {
    taraf = 'altın';
    yorum = `Oran son iki yılın en düşük %${yuvarla(dilim, 0)}’lik diliminde: altın gümüşe göre ucuz. Gümüş görece pahalı; yeni alımda altın tarafı daha korunaklı.`;
  } else if (dilim <= 40) {
    taraf = 'altın';
    yorum = 'Oran bandın alt yarısında; altın gümüşe göre görece ucuz tarafta. Gümüşte yeni alım için acele etmeye gerek yok.';
  } else {
    taraf = null;
    yorum = 'Oran kendi tarihsel bandının ortasında. İki metal arasında belirgin bir görece ucuzluk yok; tercih, oynaklık toleransına göre yapılmalı.';
  }
  return {
    simdi: yuvarla(simdi, 1),
    dilim,
    ortalama: yuvarla(ortalama(oran), 1),
    enDusuk: yuvarla(Math.min(...oran), 1),
    enYuksek: yuvarla(Math.max(...oran), 1),
    yorum, ucuzTaraf: taraf,
    seri: oran.slice(-180).map(v => yuvarla(v, 1))
  };
}

// ————————————————————————————————————————————————————————————
// 2. HALKA ARZ ANALİZİ
// ————————————————————————————————————————————————————————————

// Bir arzın gerçekleşen performansı: halka arz fiyatına ve endekse göre.
export function arzPerformans(arz, fiyatGecmisi, endeks) {
  if (!fiyatGecmisi || !arz.fiyat) return null;
  const k = fiyatGecmisi.kapanis;
  const guncel = son(k);
  const ilkGunKapanis = k[0];

  // Bedelsiz sermaye artırımı fiyat geçmişini geriye dönük böler; halka arz fiyatı
  // bölünmez. Aynı ölçeğe getirmek için arz fiyatı kümülatif çarpana bölünür.
  const carpan = fiyatGecmisi.bolunmeCarpani || 1;
  const arzFiyati = arz.fiyat / carpan;

  // Çekilen pencere hisseyi ilk işlem gününe kadar kapsıyor mu? Kapsamıyorsa
  // ilk bar listelemeden haftalar sonrasıdır ve "ilk gün getirisi" sahte çıkar.
  const ilkIslem = fiyatGecmisi.meta?.ilkIslem || fiyatGecmisi.tarih[0];
  const pencereTam = !fiyatGecmisi.meta?.ilkIslem || fiyatGecmisi.tarih[0] <= fiyatGecmisi.meta.ilkIslem;

  const p = {
    guncelFiyat: yuvarla(guncel, 2),
    duzeltilmisArzFiyati: carpan !== 1 ? yuvarla(arzFiyati, 4) : null,
    bolunmeler: fiyatGecmisi.bolunmeler?.length ? fiyatGecmisi.bolunmeler : null,
    getiri: yuvarla((guncel - arzFiyati) / arzFiyati * 100, 1),
    ilkGunGetiri: pencereTam ? yuvarla((ilkGunKapanis - arzFiyati) / arzFiyati * 100, 1) : null,
    pencereTam,
    enYuksek: yuvarla(Math.max(...fiyatGecmisi.yuksek), 2),
    islemGunu: k.length,
    ilkIslem
  };
  p.zirveGetiri = yuvarla((p.enYuksek - arzFiyati) / arzFiyati * 100, 1);
  p.zirvedenDusus = yuvarla((guncel - p.enYuksek) / p.enYuksek * 100, 1);

  // Aynı dönemde BIST 100 ne yaptı? Fark = arzın gerçek katkısı.
  if (endeks?.kapanis?.length) {
    const bas = endeks.tarih.indexOf(p.ilkIslem);
    if (bas >= 0) {
      const eg = (son(endeks.kapanis) - endeks.kapanis[bas]) / endeks.kapanis[bas] * 100;
      p.endeksGetiri = yuvarla(eg, 1);
      p.alfa = yuvarla(p.getiri - eg, 1);
    }
  }
  return p;
}

// Arzın sayısallaştırılmış özellikleri — hem puanlama hem benzerlik için.
export function arzFaktorleri(a) {
  const buyuklukTL = (a.payLot && a.fiyat) ? a.payLot * a.fiyat : null;

  // Piyasa değeri: arz büyüklüğünden halka açıklık oranıyla geri hesaplanır.
  // Sınamada en güçlü ayırt edici çıktı — şirketin toplam boyutu, toplanan paradan farklı.
  const piyasaDegeri = (buyuklukTL && a.halkaAciklik) ? buyuklukTL / (a.halkaAciklik / 100) : null;

  // Hasılat büyümesi: ilk dönem KISMİ olabilir ("2026/6"). Kısmi dönemi tam yılla
  // kıyaslamak her şirketi daralıyor gösterir; o yüzden tam yıllar karşılaştırılır.
  const has = a.finansal?.['Hasılat'] || [];
  const don = a.donemler || [];
  const i0 = /\//.test(don[0] || '') ? 1 : 0;
  const h1 = paraCoz(has[i0]), h2 = paraCoz(has[i0 + 1]);
  const hasilatBuyume = (h1 && h2) ? yuvarla((h1 / h2 - 1) * 100, 1) : null;

  // Fiyat istikrarı kaç gün planlanmış? "Planlanmamaktadır" → 0.
  const fi = String(a.fiyatIstikrari || '');
  const istikrarGun = !fi ? null
    : /planlanmam/i.test(fi) ? 0
      : (parseInt((fi.match(/(\d+)\s*gün/i) || [])[1], 10) || null);

  return {
    iskonto: a.iskonto ?? null,
    halkaAciklik: a.halkaAciklik ?? null,
    buyuklukTL,
    buyuklukMilyar: buyuklukTL ? yuvarla(buyuklukTL / 1e9, 2) : null,
    piyasaDegeriMilyar: piyasaDegeri ? yuvarla(piyasaDegeri / 1e9, 2) : null,
    sermayeOrani: a.sermayeOrani ?? null,
    bireyselOran: a.bireyselOran ?? null,
    hasilatBuyume,
    istikrarGun,
    konsorsiyum: a.konsorsiyumMu === true ? 1 : a.konsorsiyumMu === false ? 0 : null,
    esitDagitim: a.dagitim ? /Eşit/i.test(a.dagitim) : null,
    yildizPazar: a.pazar ? /Yıldız/i.test(a.pazar) : null,
    katilimci: a.katilimci ?? null
  };
}

// Puanlamada kullanılan ölçütler — hepsi geçmiş veriyle sınanıp seçildi.
// `kovalar` eşikleri, `baslik` arayüzde görünen ad.
export const OLCUTLER = [
  {
    alan: 'piyasaDegeriMilyar', baslik: 'Şirketin piyasa değeri',
    aciklama: 'Arz fiyatı üzerinden şirketin tamamının değeri. Sınamada en güçlü ayırt edici ölçüt.',
    kovalar: [
      { max: 5, etiket: 'Küçük (5 milyar ₺ altı)' },
      { min: 5, max: 15, etiket: 'Orta (5-15 milyar ₺)' },
      { min: 15, etiket: 'Büyük (15 milyar ₺ üstü)' }
    ]
  },
  {
    alan: 'iskonto', baslik: 'Halka arz iskontosu',
    aciklama: 'Fiyat tespit raporundaki değere göre uygulanan indirim.',
    kovalar: [
      { max: 15, etiket: 'Düşük (%15 altı)' },
      { min: 15, max: 25, etiket: 'Orta (%15-25)' },
      { min: 25, etiket: 'Yüksek (%25 üstü)' }
    ]
  },
  {
    alan: 'halkaAciklik', baslik: 'Halka açıklık oranı',
    aciklama: 'Şirketin borsada işlem görecek payının toplama oranı.',
    kovalar: [
      { max: 15, etiket: 'Dar (%15 altı)' },
      { min: 15, max: 30, etiket: 'Orta (%15-30)' },
      { min: 30, etiket: 'Geniş (%30 üstü)' }
    ]
  },
  {
    alan: 'buyuklukMilyar', baslik: 'Arz büyüklüğü',
    aciklama: 'Toplanan toplam para. Piyasa değeriyle akrabadır; ikisi birlikte boyutu iki kez tartar.',
    kovalar: [
      { max: 1.5, etiket: 'Küçük (1,5 milyar ₺ altı)' },
      { min: 1.5, max: 4, etiket: 'Orta (1,5-4 milyar ₺)' },
      { min: 4, etiket: 'Büyük (4 milyar ₺ üstü)' }
    ]
  },
  {
    alan: 'bireyselOran', baslik: 'Bireysel yatırımcı tahsisatı',
    aciklama: 'Payların yüzde kaçı bireysel yatırımcıya ayrılmış. Yüksek oran çoğu kez kurumsal talebin zayıf olduğunu gösterir.',
    kovalar: [
      { max: 40, etiket: 'Dar (%40 altı)' },
      { min: 40, max: 70, etiket: 'Orta (%40-70)' },
      { min: 70, etiket: 'Geniş (%70 üstü)' }
    ]
  },
  {
    alan: 'sermayeOrani', baslik: 'Paranın gittiği yer',
    aciklama: 'Sermaye artırımı şirkete para sokar; ortak satışı mevcut hissedarın cebine gider.',
    kovalar: [
      { max: 60, etiket: 'Ağırlıkla ortak satışı' },
      { min: 60, max: 99, etiket: 'Karma' },
      { min: 99, etiket: 'Tamamı sermaye artırımı' }
    ]
  },
  {
    alan: 'hasilatBuyume', baslik: 'Hasılat büyümesi',
    aciklama: 'Son iki tam yılın ciro değişimi. Kısmi dönemler karşılaştırma dışı bırakılır.',
    kovalar: [
      { max: 0, etiket: 'Daralan (%0 altı)' },
      { min: 0, max: 40, etiket: 'Ilımlı (%0-40)' },
      { min: 40, etiket: 'Hızlı (%40 üstü)' }
    ]
  },
  {
    alan: 'istikrarGun', baslik: 'Fiyat istikrarı süresi',
    aciklama: 'Aracı kurumun fiyatı destekleme taahhüdü. Hiç planlanmaması çoğu kez ihtiyaç duyulmayacağına güvenildiği anlamına gelir.',
    kovalar: [
      { max: 1, etiket: 'Planlanmamış' },
      { min: 1, max: 21, etiket: '1-20 gün' },
      { min: 21, etiket: '20 günden uzun' }
    ]
  },
  {
    alan: 'konsorsiyum', baslik: 'Aracılık yapısı',
    aciklama: 'Tek kurum mu yürütüyor, konsorsiyum mu. Konsorsiyum genelde büyük arzlarda kurulur.',
    kovalar: [
      { max: 1, etiket: 'Tek kurum' },
      { min: 1, etiket: 'Konsorsiyum' }
    ]
  }
];

// Bir faktörün gerçekten işe yarayıp yaramadığını geçmiş veriyle sınar.
// Eşiklere göre kovalara böler, her kovanın MEDYAN getirisini döndürür.
export function faktorKaniti(gecmis, alanAdi, kovalar) {
  const sonuc = [];
  for (const kova of kovalar) {
    const uyanlar = gecmis.filter(g => {
      const v = g.faktor?.[alanAdi];
      if (v == null) return false;
      return (kova.min == null || v >= kova.min) && (kova.max == null || v < kova.max);
    });
    const getiriler = uyanlar.map(u => u.perf?.getiri).filter(x => x != null);
    if (getiriler.length >= 3) {
      sonuc.push({
        etiket: kova.etiket,
        adet: getiriler.length,
        medyan: yuvarla(medyan(getiriler), 1),
        ortalama: yuvarla(ortalama(getiriler), 1),
        artiOran: yuvarla(getiriler.filter(x => x > 0).length / getiriler.length * 100, 0)
      });
    }
  }
  return sonuc;
}

// Aday arza en çok benzeyen geçmiş arzlar. Normalize edilmiş uzaklık.
export function benzerArzlar(aday, gecmis, adet = 5) {
  const f = aday.faktor;
  const olcekler = { iskonto: 15, halkaAciklik: 15, buyuklukMilyar: 3, sermayeOrani: 40 };
  const puanli = gecmis
    .filter(g => g.perf?.getiri != null && g.kod !== aday.kod)
    .map(g => {
      let uzaklik = 0, sayilan = 0;
      for (const [k, olcek] of Object.entries(olcekler)) {
        if (f[k] != null && g.faktor?.[k] != null) {
          uzaklik += Math.abs(f[k] - g.faktor[k]) / olcek;
          sayilan++;
        }
      }
      if (f.esitDagitim != null && g.faktor?.esitDagitim != null && f.esitDagitim !== g.faktor.esitDagitim) uzaklik += 0.5;
      if (f.yildizPazar != null && g.faktor?.yildizPazar != null && f.yildizPazar !== g.faktor.yildizPazar) uzaklik += 0.4;
      return sayilan >= 2 ? { ...g, uzaklik: uzaklik / sayilan } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.uzaklik - b.uzaklik);
  return puanli.slice(0, adet);
}

// Aday arzın değerlendirmesi. Puan, geçmişteki kova ortalamalarından türetilir —
// elle atanmış ağırlık yok; her madde arkasındaki örneklem büyüklüğünü de taşır.
export function arzDegerlendir(aday, gecmis, dogrulama = null) {
  const f = aday.faktor;
  const tumGetiriler = gecmis.map(g => g.perf?.getiri).filter(x => x != null);
  const genelMedyan = medyan(tumGetiriler) ?? 0;
  const genelOrtalama = ortalama(tumGetiriler) ?? 0;

  // Ölçütler tek bir tablodan (OLCUTLER) gelir; hepsi geçmiş veriyle sınanarak seçildi.
  // Kalibrasyon MEDYANLA yapılır: ortalama, tek bir +%4.951 uç değerinden kovayı bozup
  // puanlari 0/100'e yapistiriyordu.
  const olcutler = [];
  for (const o of OLCUTLER) {
    const deger = f[o.alan];
    if (deger == null) {
      olcutler.push({ baslik: o.baslik, aciklama: o.aciklama, durum: 'bilinmiyor', metin: 'Bu arz icin aciklanmamis', fark: null });
      continue;
    }
    const kanit = faktorKaniti(gecmis, o.alan, o.kovalar);
    const kova = o.kovalar.find(k => (k.min == null || deger >= k.min) && (k.max == null || deger < k.max));
    const eslesen = kanit.find(k => k.etiket === kova?.etiket);
    if (!eslesen) {
      olcutler.push({ baslik: o.baslik, aciklama: o.aciklama, durum: 'yetersiz', deger: kova?.etiket, metin: 'Bu aralikta karsilastirilacak yeterli gecmis arz yok', fark: null });
      continue;
    }
    // Tek bir olcut puani ele gecirmesin diye fark sinirlanir.
    const fark = yuvarla(kis(eslesen.medyan - genelMedyan, -30, 30), 1);
    olcutler.push({
      baslik: o.baslik, aciklama: o.aciklama,
      deger: kova.etiket,
      durum: fark > 5 ? 'olumlu' : fark < -5 ? 'olumsuz' : 'notr',
      medyan: eslesen.medyan, ortalama: eslesen.ortalama,
      adet: eslesen.adet, artiOran: eslesen.artiOran, fark,
      metin: 'Gecmiste bu araliktaki ' + eslesen.adet + ' arzin medyan getirisi %' + eslesen.medyan
        + ' (tum arzlarin medyani %' + yuvarla(genelMedyan, 1) + '); %' + eslesen.artiOran
        + '’i arz fiyatinin uzerinde kaldi. Ortalamalari %' + eslesen.ortalama + '.'
    });
  }

  // Puan: her olcutun genel MEDYANDAN farki 50 tabanina eklenir.
  const farklar = olcutler.map(o => o.fark).filter(x => x != null);
  const puan = yuvarla(kis(50 + (ortalama(farklar) ?? 0) * 1.6, 0, 100), 0);

  const benzerler = benzerArzlar(aday, gecmis, 5);
  const benzerGetiriler = benzerler.map(b => b.perf.getiri);
  const benzerMedyan = medyan(benzerGetiriler);
  const benzerOrtalama = ortalama(benzerGetiriler);

  let tur, baslik, gerekce;
  const olumlu = olcutler.filter(o => o.durum === 'olumlu').length;
  const olumsuz = olcutler.filter(o => o.durum === 'olumsuz').length;

  if (puan >= 62 && olumlu > olumsuz) {
    tur = 'katil';
    baslik = 'Katılmaya değer görünüyor';
    gerekce = `Ölçütlerin ${olumlu} tanesi geçmiş veride olumlu tarafta. En benzer ${benzerler.length} arzın ortalama getirisi %${yuvarla(benzerMedyan, 1)}.`;
  } else if (puan <= 40 || olumsuz > olumlu + 1) {
    tur = 'uzakDur';
    baslik = 'Zayıf profil — dikkatli ol';
    gerekce = `Ölçütlerin ${olumsuz} tanesi geçmiş veride olumsuz tarafta. En benzer ${benzerler.length} arzın ortalama getirisi %${yuvarla(benzerMedyan, 1)}.`;
  } else {
    tur = 'notr';
    baslik = 'Ortalama profil — küçük katılım mantıklı';
    gerekce = `Olumlu ve olumsuz ölçütler dengeli. Benzer arzların ortalama getirisi %${yuvarla(benzerMedyan, 1)}; katılım maliyeti düşük olduğu için küçük tutarla girmek makul.`;
  }

  // ——— Net hüküm: "katılayım mı" sorusuna tek satırlık cevap + beklenen tutar + kanıt.
  const kova = (dogrulama?.satirlar || []).find(s =>
    (puan >= 70 && s.ad === '70 ve üstü') || (puan >= 55 && puan < 70 && s.ad === '55-70') ||
    (puan >= 45 && puan < 55 && s.ad === '45-55') || (puan < 45 && s.ad === '45 altı'));

  // Beklenen lot: yakın dönem ortalama katılımcı sayısına en yakın tahmin satırı.
  const sonKatilimcilar = gecmis.slice(-20).map(g => g.katilimci).filter(Boolean);
  const beklenenKatilim = sonKatilimcilar.length ? medyan(sonKatilimcilar) : null;
  let lotBeklentisi = null;
  if (beklenenKatilim && aday.lotTahmini?.length) {
    const satirlar = aday.lotTahmini.map(t => {
      const m = t.match(/^([\d.,]+)\s*(Bin|Milyon)?\s*katılım\s*~\s*([\d.]+)\s*Lot\s*\(([\d.]+)\s*TL\)/i);
      if (!m) return null;
      const carpan = /milyon/i.test(m[2] || '') ? 1e6 : /bin/i.test(m[2] || '') ? 1e3 : 1;
      return { kisi: parseFloat(m[1].replace(/\./g, '').replace(',', '.')) * carpan, lot: +m[3], tl: +m[4] };
    }).filter(Boolean);
    if (satirlar.length) {
      lotBeklentisi = satirlar.reduce((en, s) =>
        Math.abs(s.kisi - beklenenKatilim) < Math.abs(en.kisi - beklenenKatilim) ? s : en);
    }
  }

  const tutarMetni = lotBeklentisi
    ? `${beklenenKatilim >= 1e6 ? yuvarla(beklenenKatilim / 1e6, 1) + ' milyon' : Math.round(beklenenKatilim / 1e3) + ' bin'} kişi katılırsa payına yaklaşık ${lotBeklentisi.lot} lot (${nfTR(lotBeklentisi.tl)} ₺) düşer`
    : 'düşecek lot miktarı açıklanmamış';

  const kanitMetni = kova
    ? `Geçmişte bu puan aralığındaki ${kova.adet} arzın ortalama getirisi %${kova.ortalamaGetiri}, %${kova.artidaOran}’i arz fiyatının üzerinde kaldı.`
    : 'Bu puan aralığı için yeterli geçmiş örnek yok.';

  let hukum, netCumle, riskCumlesi;
  if (tur === 'katil') {
    hukum = 'KATIL';
    netCumle = `Katıl. ${tutarMetni} — bu tutar küçük olduğu için asıl risk paranın bağlanması değil, ilk günlerdeki dalgalanma. ${kanitMetni}`;
    riskCumlesi = 'Yine de garanti değil: aynı aralıktaki arzların bir kısmı ekiye geçti. Girdiğin tutarı gözden çıkarabileceğin kadar tut.';
  } else if (tur === 'uzakDur') {
    hukum = 'KATILMA';
    netCumle = `Katılma. Profil zayıf; ${tutarMetni}. ${kanitMetni}`;
    riskCumlesi = 'Katılmamak da bir maliyet: bu profildeki arzların bir kısmı yine de kazandırdı. Ama beklenen değer bu grupta düşük.';
  } else {
    hukum = 'KÜÇÜK KATIL';
    netCumle = `Küçük tutarla katıl. ${tutarMetni} — zaten sınırlı bir tutar, bu yüzden katılmanın maliyeti düşük. ${kanitMetni}`;
    riskCumlesi = 'Ortalama bir profil: ne belirgin fırsat ne belirgin tuzak. Portföyünün küçük bir kısmıyla gir.';
  }

  return {
    puan,
    olcutler,
    benzerler: benzerler.map(b => ({
      kod: b.kod, ad: b.ad, tarih: b.tarihMetni,
      fiyat: b.fiyat, getiri: b.perf.getiri, ilkGunGetiri: b.perf.ilkGunGetiri,
      iskonto: b.faktor.iskonto, halkaAciklik: b.faktor.halkaAciklik,
      buyuklukMilyar: b.faktor.buyuklukMilyar, katilimci: b.faktor.katilimci
    })),
    benzerMedyan: yuvarla(benzerMedyan, 1),
    benzerOrtalama: yuvarla(benzerOrtalama, 1),
    benzerArtiOran: benzerGetiriler.length ? yuvarla(benzerGetiriler.filter(x => x > 0).length / benzerGetiriler.length * 100, 0) : null,
    genelMedyan: yuvarla(genelMedyan, 1),
    genelOrtalama: yuvarla(genelOrtalama, 1),
    karar: { tur, hukum, baslik, gerekce, netCumle, riskCumlesi },
    lotBeklentisi, beklenenKatilim: beklenenKatilim ? Math.round(beklenenKatilim) : null
  };
}

// Geriye dönük puanlama: her arz YALNIZCA kendisinden önce tamamlanmış arzların
// verisiyle puanlanır. Bütün geçmişle puanlansaydı arzın kendi getirisi, karşılaştırıldığı
// ortalamaın içinde olurdu ve puan kendini doğrulardı (ileriye bakma yanlılığı).
export function geriyeDonukPuanla(arzlar, asgariOrnek = 12) {
  const sirali = arzlar
    .filter(a => a.perf?.getiri != null && a.tarih?.bitis)
    .sort((a, b) => a.tarih.bitis.localeCompare(b.tarih.bitis));

  let puanlanan = 0;
  for (let i = 0; i < sirali.length; i++) {
    const oncekiler = sirali.slice(0, i);
    if (oncekiler.length < asgariOrnek) continue;
    const d = arzDegerlendir(sirali[i], oncekiler);
    sirali[i].puan = d.puan;
    sirali[i].puanKarar = d.karar.tur;
    sirali[i].puanOrnek = oncekiler.length;
    puanlanan++;
  }
  return puanlanan;
}

// Puan gerçekten ayırt ediyor mu? Puan kovalarına göre gerçekleşen getiriler.
// Bu tablo modelin kendi karnesidir; kötü çıkarsa da olduğu gibi yayımlanır.
export function puanDogrulama(arzlar) {
  const kovalar = [
    { ad: '70 ve üstü', min: 70, max: 101 },
    { ad: '55-70', min: 55, max: 70 },
    { ad: '45-55', min: 45, max: 55 },
    { ad: '45 altı', min: -1, max: 45 }
  ];
  const puanli = arzlar.filter(a => a.puan != null && a.perf?.getiri != null);
  const satirlar = kovalar.map(k => {
    const uyan = puanli.filter(a => a.puan >= k.min && a.puan < k.max);
    const g = uyan.map(a => a.perf.getiri);
    const ilk = uyan.map(a => a.perf.ilkGunGetiri).filter(x => x != null);
    return {
      ad: k.ad, adet: g.length,
      medyanGetiri: g.length ? yuvarla(medyan(g), 1) : null,
      ortalamaGetiri: g.length ? yuvarla(ortalama(g), 1) : null,
      medyanIlkGun: ilk.length ? yuvarla(medyan(ilk), 1) : null,
      artidaOran: g.length ? yuvarla(g.filter(x => x > 0).length / g.length * 100, 0) : null
    };
  }).filter(s => s.adet > 0);

  // Sıralama ilişkisi: puan yükseldikçe getiri de yükseliyor mu?
  const g1 = satirlar.map(s => s.medyanGetiri);
  const tutarli = g1.length >= 2 && g1.every((v, i) => i === 0 || v <= g1[i - 1]);

  return {
    satirlar,
    toplamPuanli: puanli.length,
    tutarli,
    yorum: !satirlar.length ? 'Puanlanacak yeterli geçmiş yok.'
      : tutarli
        ? 'Puan sırası getiri sırasıyla uyuşuyor: yüksek puanlı arzlar gerçekten daha iyi getirmiş.'
        : 'Puan ile getiri sırası tam uyuşmuyor. Puan bir eğilim gösterir, kesin bir sıralama vaat etmez.'
  };
}

// Aracı kurum karnesi: hangi kurumun götürdüğü arzlar gerçekte ne kazandırmış?
// Konsorsiyumlarda lider kurum sayılır; en az `enAz` arzı olan kurumlar listelenir.
export function kurumKarnesi(arzlar, enAz = 2) {
  const kova = new Map();
  for (const a of arzlar) {
    const ad = a.araciKisa || a.araciKurum;
    if (!ad || a.perf?.getiri == null) continue;
    if (!kova.has(ad)) kova.set(ad, []);
    kova.get(ad).push(a);
  }
  const satirlar = [];
  for (const [ad, liste] of kova) {
    if (liste.length < enAz) continue;
    const g = liste.map(x => x.perf.getiri);
    const ilk = liste.map(x => x.perf.ilkGunGetiri).filter(x => x != null);
    satirlar.push({
      kurum: ad,
      tamAd: liste[0].araciKurum,
      adet: liste.length,
      medyanGetiri: yuvarla(medyan(g), 1),
      medyanGetiri: yuvarla(medyan(g), 1),
    ortalamaGetiri: yuvarla(ortalama(g), 1),
      medyanIlkGun: yuvarla(medyan(ilk), 1),
      artidaOran: yuvarla(g.filter(x => x > 0).length / g.length * 100, 0),
      enIyi: yuvarla(Math.max(...g), 1),
      enKotu: yuvarla(Math.min(...g), 1),
      ortalamaBuyukluk: yuvarla(medyan(liste.map(x => x.faktor?.buyuklukMilyar).filter(x => x != null)), 2),
      ortalamaKatilimci: (() => {
        const k = liste.map(x => x.katilimci).filter(Boolean);
        return k.length ? Math.round(medyan(k)) : null;
      })(),
      konsorsiyumAdedi: liste.filter(x => x.konsorsiyumMu).length,
      kodlar: liste.map(x => x.kod).filter(Boolean)
    });
  }
  // Az örneklemli kurumlar yanıltmasın: önce arz sayısı, sonra ortalama getiri.
  return satirlar.sort((a, b) => b.medyanGetiri - a.medyanGetiri);
}

// Yıl geneli özet — kullanıcının istediği "genel getiri götürü" tablosu.
export function yilOzeti(arzlar) {
  const p = arzlar.filter(a => a.perf?.getiri != null);
  const g = p.map(a => a.perf.getiri);
  const ilk = p.map(a => a.perf.ilkGunGetiri).filter(x => x != null);
  const sirali = [...p].sort((a, b) => b.perf.getiri - a.perf.getiri);
  const toplamBuyukluk = arzlar.reduce((s, a) => s + (a.faktor?.buyuklukTL || 0), 0);
  const katilimcilar = arzlar.map(a => a.faktor?.katilimci).filter(Boolean);

  return {
    arzSayisi: arzlar.length,
    fiyatiOlan: p.length,
    medyanGetiri: yuvarla(medyan(g), 1),
    ortalamaGetiri: yuvarla(ortalama(g), 1),
    medyanGetiri: yuvarla(medyan(g), 1),
    ortalamaGetiri: yuvarla(ortalama(g), 1),
    artidaOran: g.length ? yuvarla(g.filter(x => x > 0).length / g.length * 100, 0) : null,
    medyanIlkGun: yuvarla(medyan(ilk), 1),
    ortalamaIlkGun: yuvarla(ortalama(ilk), 1),
    enIyi: sirali.slice(0, 5).map(a => ({ kod: a.kod, ad: a.ad, getiri: a.perf.getiri })),
    enKotu: sirali.slice(-5).reverse().map(a => ({ kod: a.kod, ad: a.ad, getiri: a.perf.getiri })),
    toplamBuyuklukMilyar: yuvarla(toplamBuyukluk / 1e9, 1),
    medyanKatilimci: katilimcilar.length ? Math.round(medyan(katilimcilar)) : null,
    esitDagitimOrani: (() => {
      const e = arzlar.map(a => a.faktor?.esitDagitim).filter(x => x != null);
      return e.length ? yuvarla(e.filter(Boolean).length / e.length * 100, 0) : null;
    })()
  };
}
