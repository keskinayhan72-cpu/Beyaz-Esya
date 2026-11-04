# Fiyat Yakala — Chrome eklentisi

Baktığınız ürün sayfasındaki fiyatı tek tıkla Fırsat Motoru'na kaydeder.
Sayfaları kendiliğinden gezmez, tıklamaz, CAPTCHA çözmez; yalnızca sizin açtığınız sayfayı, siz düğmeye bastığınızda okur.

## Kurulum (bir kez)
1. Web uygulaması bilgisayarınızda çalışıyor olmalı (http://localhost:3000).
2. `web/.env.local` içinde `CAPTURE_TOKEN` tanımlı olsun (en az 16 karakter). Üretmek için:
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` — sonra web uygulamasını yeniden başlatın.
3. Chrome → adres çubuğuna `chrome://extensions` → sağ üstte **Geliştirici modu** açık → **Paketlenmemiş öğe yükle** → bu `extension` klasörünü seçin.
4. Eklenti simgesini araç çubuğuna sabitleyin, tıklayın, sunucu adresi ve `CAPTURE_TOKEN` değerini girin.

## Kullanım
1. Trendyol, Hepsiburada, Amazon, n11, Pazarama, PttAVM, MediaMarkt, Teknosa, Vatan, Koçtaş, marka mağazaları veya akakçe'de bir ürün sayfası açın.
2. Eklenti simgesine tıklayın: marka, model, EAN, fiyat, satıcı, stok okunur (schema.org verisi ve sayfadaki mevcut veri). Uyarıları okuyun; tahmin edilen model kodunu kontrol edin.
3. Uşak teslimatını kontrol ettiyseniz seçin (nasıl kontrol ettiğinizi kısaca yazın) → **Kaydet**.
4. Ürün katalogda EAN veya marka + model koduyla eşleşirse doğrudan kaydedilir; eşleşmezse katalogdan seçersiniz ya da aynı ekrandan kataloğa ekleyip kaydedersiniz.

Pazaryeri fiyatları varsayılan olarak hem **alış seçeneği** hem **o pazaryerindeki rakip satış fiyatı** olarak kaydedilir.
akakçe'de yalnızca alış tarafı kaydedilir; Uşak teslimatını satın alacağınız mağazada kontrol edin.

## Sınırlar
- Fiyat okunamazsa uyarı çıkar ve fiyatı elle yazarsınız (ör. Amazon'da öne çıkan teklifi olmayan ürün).
- Hepsiburada'da varsayılan fiyat sepete özel fiyattır; sepetsiz fiyat listeden seçilebilir.
- Mağaza içi veya kontrol hanesi tutmayan barkodlar EAN sayılmaz, boş bırakılır.
- Site sonuçları: ana README, "Eklenti gerçek site testi". Okunamayan site olursa **Tanı için sayfayı kaydet**e tıklayın: HTML yalnızca bilgisayarınızda `web/.sayfa-ornekleri/` klasörüne yazılır (git dışı), o site için kural eklenir. Bu dosyalarda hesap adınız bulunabilir; paylaşmayın.
