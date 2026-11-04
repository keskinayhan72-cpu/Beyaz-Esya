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
2. Eklenti simgesine tıklayın: marka, model, EAN, fiyat, satıcı, stok okunur (sayfadaki schema.org ürün verisinden).
3. Uşak teslimatını kontrol ettiyseniz seçin (nasıl kontrol ettiğinizi kısaca yazın) → **Kaydet**.
4. Ürün katalogda EAN veya marka + model koduyla eşleşirse doğrudan kaydedilir; eşleşmezse katalogdan seçmeniz istenir.

Pazaryeri fiyatları varsayılan olarak hem **alış seçeneği** hem **o pazaryerindeki rakip satış fiyatı** olarak kaydedilir.
akakçe'de yalnızca alış tarafı kaydedilir; Uşak teslimatını satın alacağınız mağazada kontrol edin.

## Sınırlar
- Sayfada yapılandırılmış ürün verisi yoksa fiyat okunamaz; uyarı çıkar ve fiyatı elle yazarsınız.
- Bazı sayfalar yalnızca en düşük fiyatı verir (AggregateOffer); satıcıyı kontrol edin.
- Gerçek sitelerde henüz denenmedi (geliştirme ortamı bu sitelere erişemiyordu). Okunamayan site olursa bildirin, o site için okuma kuralı eklenir.
