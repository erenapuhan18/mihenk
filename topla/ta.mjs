// ta.mjs — teknik analiz çekirdeği. Saf fonksiyonlar, dış bağımlılık yok.
// Bütün diziler günlük ve eski→yeni sıralıdır.

export const son = a => a[a.length - 1];
export const yuvarla = (x, n = 2) => (x == null || !isFinite(x)) ? null : Math.round(x * 10 ** n) / 10 ** n;

export function sma(dizi, n) {
  if (dizi.length < n) return null;
  let t = 0; for (let i = dizi.length - n; i < dizi.length; i++) t += dizi[i];
  return t / n;
}

export function ema(dizi, n) {
  if (dizi.length < n) return null;
  const k = 2 / (n + 1);
  let e = dizi.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dizi.length; i++) e = dizi[i] * k + e * (1 - k);
  return e;
}

// Wilder yumuşatmalı RSI — standart 14 periyot.
export function rsi(kapanis, n = 14) {
  if (kapanis.length < n + 1) return null;
  let kaz = 0, kay = 0;
  for (let i = 1; i <= n; i++) {
    const d = kapanis[i] - kapanis[i - 1];
    if (d >= 0) kaz += d; else kay -= d;
  }
  kaz /= n; kay /= n;
  for (let i = n + 1; i < kapanis.length; i++) {
    const d = kapanis[i] - kapanis[i - 1];
    kaz = (kaz * (n - 1) + Math.max(d, 0)) / n;
    kay = (kay * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (kay === 0) return 100;
  return 100 - 100 / (1 + kaz / kay);
}

// Ortalama Gerçek Aralık — stop mesafesi ve pozisyon boyutu için.
export function atr(yuksek, dusuk, kapanis, n = 14) {
  if (kapanis.length < n + 1) return null;
  const tr = [];
  for (let i = 1; i < kapanis.length; i++) {
    tr.push(Math.max(
      yuksek[i] - dusuk[i],
      Math.abs(yuksek[i] - kapanis[i - 1]),
      Math.abs(dusuk[i] - kapanis[i - 1])
    ));
  }
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

export function bollinger(kapanis, n = 20, k = 2) {
  if (kapanis.length < n) return null;
  const dilim = kapanis.slice(-n);
  const orta = dilim.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(dilim.reduce((a, b) => a + (b - orta) ** 2, 0) / n);
  const ust = orta + k * sd, alt = orta - k * sd;
  const fiyat = son(kapanis);
  return { ust, orta, alt, sd, genislik: (ust - alt) / orta, konum: ust === alt ? 0.5 : (fiyat - alt) / (ust - alt) };
}

export function macd(kapanis, hizli = 12, yavas = 26, sinyal = 9) {
  if (kapanis.length < yavas + sinyal) return null;
  const emaDizi = (d, n) => {
    const k = 2 / (n + 1); const out = []; let e = d.slice(0, n).reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < d.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      if (i === n - 1) { out.push(e); continue; }
      e = d[i] * k + e * (1 - k); out.push(e);
    }
    return out;
  };
  const eh = emaDizi(kapanis, hizli), ey = emaDizi(kapanis, yavas);
  const cizgi = kapanis.map((_, i) => (eh[i] != null && ey[i] != null) ? eh[i] - ey[i] : null);
  const gecerli = cizgi.filter(x => x != null);
  if (gecerli.length < sinyal) return null;
  const sinyalDizi = emaDizi(gecerli, sinyal).filter(x => x != null);
  return { cizgi: son(gecerli), sinyal: son(sinyalDizi), fark: son(gecerli) - son(sinyalDizi) };
}

// Fraktal salınım noktaları: k bar solunda ve sağında en uçta kalan barlar.
export function salinimlar(yuksek, dusuk, k = 5) {
  const tepe = [], dip = [];
  for (let i = k; i < yuksek.length - k; i++) {
    let ust = true, alt = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (yuksek[j] >= yuksek[i]) ust = false;
      if (dusuk[j] <= dusuk[i]) alt = false;
    }
    if (ust) tepe.push({ i, fiyat: yuksek[i] });
    if (alt) dip.push({ i, fiyat: dusuk[i] });
  }
  return { tepe, dip };
}

// Yakın seviyeleri tek bölgede topla; dokunuş sayısı ve tazelik ile puanla.
export function seviyeKumele(noktalar, toleransOran, sonIndeks) {
  const sirali = [...noktalar].sort((a, b) => a.fiyat - b.fiyat);
  const kume = [];
  for (const n of sirali) {
    const s = kume[kume.length - 1];
    if (s && Math.abs(n.fiyat - s.ortalama) / s.ortalama <= toleransOran) {
      s.uyeler.push(n);
      s.ortalama = s.uyeler.reduce((a, b) => a + b.fiyat, 0) / s.uyeler.length;
    } else {
      kume.push({ uyeler: [n], ortalama: n.fiyat });
    }
  }
  return kume.map(s => {
    const enTaze = Math.max(...s.uyeler.map(u => u.i));
    const yas = sonIndeks - enTaze;
    // Çok dokunulmuş ve yakın zamanlı seviye daha güvenilirdir.
    const puan = s.uyeler.length * 2 + Math.max(0, 6 - yas / 30);
    return { fiyat: s.ortalama, dokunus: s.uyeler.length, sonBarOnce: yas, puan };
  });
}

// Fiyatın altındaki destekler, üstündeki dirençler — güce göre sıralı.
export function destekDirenc(yuksek, dusuk, kapanis, adet = 3) {
  const fiyat = son(kapanis);
  const { tepe, dip } = salinimlar(yuksek, dusuk, 5);
  const sonI = kapanis.length - 1;
  const tol = 0.012;

  const hepsi = [...tepe, ...dip];
  const y52 = Math.max(...yuksek.slice(-252)), d52 = Math.min(...dusuk.slice(-252));
  hepsi.push({ i: sonI - 1, fiyat: y52 }, { i: sonI - 1, fiyat: d52 });

  const kumeler = seviyeKumele(hepsi, tol, sonI);
  const ondalik = fiyat > 500 ? 0 : 2;
  const destek = kumeler.filter(s => s.fiyat < fiyat * 0.997).sort((a, b) => b.fiyat - a.fiyat);
  const direnc = kumeler.filter(s => s.fiyat > fiyat * 1.003).sort((a, b) => a.fiyat - b.fiyat);

  const isaretle = (dizi, tur) => dizi.slice(0, adet).map(s => ({
    fiyat: yuvarla(s.fiyat, ondalik),
    uzaklikYuzde: yuvarla((s.fiyat - fiyat) / fiyat * 100, 2),
    dokunus: s.dokunus,
    guc: s.puan >= 8 ? 'güçlü' : s.puan >= 5 ? 'orta' : 'zayıf',
    tur
  }));

  return { destek: isaretle(destek, 'destek'), direnc: isaretle(direnc, 'direnç'), y52: yuvarla(y52, 2), d52: yuvarla(d52, 2) };
}

// Son büyük salınımın Fibonacci düzeltme seviyeleri.
export function fibonacci(yuksek, dusuk, kapanis) {
  const pencere = Math.min(180, yuksek.length);
  const y = yuksek.slice(-pencere), d = dusuk.slice(-pencere);
  const tepeI = y.indexOf(Math.max(...y)), dipI = d.indexOf(Math.min(...d));
  const tepe = y[tepeI], dip = d[dipI];
  const yukselen = tepeI > dipI;
  const aralik = tepe - dip;
  const ondalik = son(kapanis) > 500 ? 0 : 2;
  return {
    yon: yukselen ? 'yükselen' : 'düşen',
    tepe: yuvarla(tepe, ondalik), dip: yuvarla(dip, ondalik),
    seviyeler: [0.236, 0.382, 0.5, 0.618, 0.786].map(o => ({
      oran: o,
      fiyat: yuvarla(yukselen ? tepe - aralik * o : dip + aralik * o, ondalik)
    }))
  };
}

export function degisim(kapanis, barSayisi) {
  if (kapanis.length <= barSayisi) return null;
  const a = kapanis[kapanis.length - 1 - barSayisi];
  return yuvarla((son(kapanis) - a) / a * 100, 2);
}

// Bir değerin kendi geçmişindeki yüzdelik dilimi (0-100).
export function yuzdelik(dizi, deger) {
  const temiz = dizi.filter(x => x != null && isFinite(x));
  if (!temiz.length) return null;
  return yuvarla(temiz.filter(x => x < deger).length / temiz.length * 100, 1);
}

// Yıllıklandırılmış oynaklık — günlük getirilerin standart sapmasından.
export function oynaklik(kapanis, n = 30) {
  if (kapanis.length < n + 1) return null;
  const g = [];
  for (let i = kapanis.length - n; i < kapanis.length; i++) g.push(Math.log(kapanis[i] / kapanis[i - 1]));
  const ort = g.reduce((a, b) => a + b, 0) / g.length;
  const sd = Math.sqrt(g.reduce((a, b) => a + (b - ort) ** 2, 0) / (g.length - 1));
  return yuvarla(sd * Math.sqrt(252) * 100, 1);
}
