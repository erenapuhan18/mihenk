import { readFileSync, writeFileSync } from 'fs';
const p = 'uygulama.js';
let s = readFileSync(p, 'utf8');

// Silinen iki bölüm geri konuyor — bu sefer medyan + ortalama yan yana.
const yeni = String.raw`
// Puanın kendi karnesi: geçmiş arzlar, KENDİLERİNDEN ÖNCEKİ verilerle puanlanıp
// gerçek getirileriyle karşılaştırılır. Model burada sınanır; sonuç kötüyse de yayımlanır.
function puanKarnesi() {
  const d = V.arz.puanDogrulama;
  if (!d?.satirlar?.length) return '';
  const en = Math.max(...d.satirlar.map(s => Math.abs(s.medyanGetiri ?? 0)), 1);

  return DIZE`<div class="kart">
    <div class="baslikSatir">
      <h2>Puan işe yarıyor mu?</h2>
      <span class="not">${d.toplamPuanli} geçmiş arz · her biri yalnızca kendinden önceki arzlarla puanlandı</span>
    </div>
    <div class="tabloKutu"><table>
      <thead><tr>
        <th>Mihenk puanı</th><th class="say">Arz</th><th>Gerçekleşen getiri</th>
        <th class="say">Medyan</th><th class="say">Ortalama</th><th class="say">Artıda kalan</th>
      </tr></thead>
      <tbody>${d.satirlar.map(s => DIZE`<tr>
        <td><strong>${kaks(s.ad)}</strong></td>
        <td class="say">${s.adet}</td>
        <td style="min-width:120px"><div class="karneCubuk"><i style="width:${Math.abs(s.medyanGetiri ?? 0) / en * 100}%;background:${(s.medyanGetiri ?? 0) >= 0 ? 'var(--yesil)' : 'var(--kirmizi)'}"></i></div></td>
        <td class="say ${sinif(s.medyanGetiri)}"><strong>${yuzde(s.medyanGetiri)}</strong></td>
        <td class="say" style="color:var(--soluk)">${yuzde(s.ortalamaGetiri)}</td>
        <td class="say">%${nf(s.artidaOran)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="kaynakNot" style="margin-top:12px">
      <strong>Neden geriye dönük?</strong> Bir arzı, kendi getirisinin de içinde olduğu ortalamayla karşılaştırmak
      puanı kendi kendini doğrular hale getirir. Bu yüzden her arz, <strong>yalnızca kendisinden önce tamamlanmış</strong>
      arzların verisiyle puanlandı — yani o gün elde olan bilgiyle. İlk 12 arz puanlanamadı, örneklem yetmiyordu.
      <br><br>${kaks(d.yorum)}
      ${(() => {
        const t = d.satirlar;
        if (t.length < 2) return '';
        const ust = t[0], alt = t[t.length - 1];
        return DIZE` “Artıda kalan” oranı uç değerlerden etkilenmediği için en sağlam ölçüdür:
          en yüksek kovada arzların <strong>%${nf(ust.artidaOran)}</strong>’i, en düşük kovada
          <strong>%${nf(alt.artidaOran)}</strong>’i arz fiyatının üzerinde kalmış.`;
      })()}
    </div>
  </div>`;
}

// Aracı kurum karnesi — hangi kurumun götürdüğü arzlar ne kazandırmış?
function kurumBolumu() {
  const K = V.arz.kurumKarnesi || [];
  if (!K.length) return '';
  const enBuyuk = Math.max(...K.map(k => Math.abs(k.medyanGetiri)), 1);

  const satir = k => {
    const pay = Math.abs(k.medyanGetiri) / enBuyuk * 100;
    const artiMi = k.medyanGetiri >= 0;
    return DIZE`<tr>
      <td>
        <button class="filtreSifirla" data-kurum-sec="${kaks(k.kurum)}"
          style="text-decoration:none;font-size:13px;font-weight:500;color:var(--metin);padding:0;text-align:left"
          title="${kaks(k.tamAd || k.kurum)} — tabloda filtrele">${kaks(k.kurum)}</button>
        ${k.konsorsiyumAdedi ? DIZE`<span class="rozet" style="padding:1px 6px;font-size:10px;margin-left:5px" title="${k.konsorsiyumAdedi} arz konsorsiyumla yapıldı">kons.</span>` : ''}
      </td>
      <td class="say">${k.adet}</td>
      <td style="min-width:100px">
        <div class="karneCubuk"><i style="width:${pay}%;background:${artiMi ? 'var(--yesil)' : 'var(--kirmizi)'}"></i></div>
      </td>
      <td class="say ${sinif(k.medyanGetiri)}"><strong>${yuzde(k.medyanGetiri)}</strong></td>
      <td class="say" style="color:var(--soluk)">${yuzde(k.ortalamaGetiri)}</td>
      <td class="say ${sinif(k.medyanIlkGun)}">${yuzde(k.medyanIlkGun)}</td>
      <td class="say">%${nf(k.artidaOran)}</td>
      <td class="say arti">${yuzde(k.enIyi)}</td>
      <td class="say eksi">${yuzde(k.enKotu)}</td>
      <td class="say">${k.ortalamaBuyukluk != null ? para(k.ortalamaBuyukluk, 2) : '—'}</td>
      <td class="say">${k.medyanKatilimci ? buyukSayi(k.medyanKatilimci) : '—'}</td>
    </tr>`;
  };

  return DIZE`<div class="kart">
    <div class="baslikSatir">
      <h2>Aracı kurum karnesi</h2>
      <span class="not">2024-2026 · en az 2 arzı olan kurumlar · kuruma tıkla, tabloyu filtrelesin</span>
    </div>
    <div class="tabloKutu"><table>
      <thead><tr>
        <th>Aracı kurum</th><th class="say">Arz</th><th>Getiri</th><th class="say">Medyan</th><th class="say">Ortalama</th>
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

`;

const capa = 'function arzListesi() {';
if (!s.includes('function puanKarnesi()')) {
  s = s.replace(capa, yeni.split('DIZE`').join('`') + capa);
  writeFileSync(p, s, 'utf8');
  console.log('puanKarnesi ve kurumBolumu geri kondu');
} else {
  console.log('zaten var, atlandı');
}
