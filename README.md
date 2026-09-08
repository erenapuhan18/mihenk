# MİHENK

Altın, gümüş ve Borsa İstanbul halka arzları için her gün kendini güncelleyen
karar masası. Mihenk taşı, altının ayarını sürtünce anlaşılan siyah taştır —
bu site de aynı işi verilerle yapar.

**Canlı:** https://erenapuhan18.github.io/mihenk/

## Ne yapar

**Altın / gümüş.** Ons ve TL fiyatı, destek-direnç bölgeleri, trend puanı,
kademeli giriş planı (hangi fiyattan pozisyonun yüzde kaçı), zarar kes ve hedef
seviyeleri, risk/ödül oranı. TL yatırımcısına özel: getirinin ne kadarının
metalden, ne kadarının kurdan geldiğini ayıran tablo.

**Halka arz.** Talep toplaması süren arzın 100 üzerinden puanı, puanın hangi
ölçütten geldiği, en benzer geçmiş arzların ne yaptığı, katılımcı sayısına göre
kaç lot düşeceği. 2024-2026 arasındaki bütün arzların gerçekleşen getirileri ve
"hangi özellik gerçekten kazandırıyor" kanıt tabloları.

Puanlama elle atanmış ağırlıklara değil, **geçmiş arzların gerçekleşen medyan
getirilerine** dayanır. Her yargının arkasındaki örneklem büyüklüğü de yayımlanır.

## Nasıl çalışır

```
topla/index.mjs   → günlük toplayıcı (GitHub Actions çalıştırır)
topla/kaynak.mjs  → dış veri kaynakları
topla/ta.mjs      → teknik analiz (RSI, ATR, destek-direnç kümeleme, Fibonacci)
topla/analiz.mjs  → karar motoru ve arz puanlaması
veri/veri.json    → siteye giden günlük çıktı
veri/arsiv.json   → değişmeyen arz künyeleri (önbellek)
index.html        → arayüz (bağımlılıksız, tek dosya + uygulama.js)
```

Toplayıcı günde üç kez çalışır (08:10 / 15:10 / 19:10 TR). Sayfa açıldığında
fiyatlar ayrıca tarayıcıdan canlı tazelenir.

Yerelde çalıştırmak için:

```bash
node topla/index.mjs      # veri/veri.json üretir
python -m http.server 8731  # fetch için sunucu gerekir, file:// yetmez
```

## Veri kaynakları

Hepsi anahtarsız ve kamuya açık:

- **Yahoo Finance** — GC=F, SI=F, USDTRY=X, XU100.IS ve `.IS` hisse geçmişleri
- **Truncgil** (v4, düşerse v3) — serbest piyasa gram/ziynet fiyatları
- **gold-api.com** — anlık ons altın/gümüş (CORS açık, tarayıcı da çeker)
- **halkarz.com** — arz künyeleri; WP REST API'sindeki yıl kategorileri kesin listeyi verir
- **Google Haberler RSS** — Türkçe gündem

### Bilinmesi gereken iki tuzak

**Bedelsiz sermaye artırımı.** BIST'te çok yaygın ve Yahoo bunu bölünme olarak
işleyip fiyat geçmişini geriye dönük böler. Halka arz fiyatı bölünmediği için
ham karşılaştırma sahte zararlar üretir — 2024'te medyan ilk gün getirisi
düzeltmeden önce %-13, düzeltmeden sonra %+18,8 çıkıyor. `events=split` ile
gelen kümülatif çarpan arz fiyatına uygulanır.

**Truncgil v4 kararsız.** Bağlantıyı düpedüz reddedebiliyor. Sırayla: v4 → v3 →
son bilinen değer (bayatlığı işaretlenerek) → ons × kur ÷ 31,1035 ile hesaplama.

## Sınırlar

Getiriler temettüyü içermez. Teknik seviyeler geçmiş fiyattan türetilir.
Bu bir yatırım tavsiyesi değildir.
