# 🌸 Günlük Takip & Ajanda Paneli

Yakınlarınızın veya kendinizin planlanmış doktor randevularını, rutin muayene seanslarını, tahlil/tetkik zamanlarını kolayca takip edebileceği ve günlük ilaç kullanımını işaretleyebileceği **reklamsız ve tamamen ücretsiz** bir web uygulamasıdır.

Uygulamanın çalışması için herhangi bir veri tabanına ücret ödemeniz veya sunucu kurmanız gerekmez. Telefonunuza kısayol olarak kaydedebileceğiniz özel bir yönetim paneli üzerinden randevuları ekleyebilir, günlük mesajlar bırakabilir ve bunları anında güncelleyebilirsiniz. Yapılan tüm güncellemeler kullanıcı ekranına **anında** yansır.

---

## 📱 Nasıl Çalışır?

1. **Kullanıcı Ekranı (`https://<kullanici-adi>.github.io/<depo-adi>/`):**
   Gözü yormayan, sade ve büyük yazılı tasarım. En üstte yazdığınız günün mesajı, kronolojik randevu akışı, günlük ilaç takip listesi ve tek tıkla aranabilecek rehber numaraları yer alır.

2. **Yönetici Paneli (`https://<kullanici-adi>.github.io/<depo-adi>/#admin`):**
   Telefonunuzdan kolayca erişebileceğiniz ve ana ekranınıza kısayol olarak ekleyebileceğiniz şifreli arayüzdür. Bir defalık GitHub Erişim Anahtarı (PAT) girerek dilediğiniz randevuyu ekleyebilir, güncelleyebilir veya silebilirsiniz.

---

## 🛠️ Kurulum Kılavuzu (5 Dakika)

Bu uygulamayı aktif hale getirmek ve telefonunuzu bağlamak oldukça basittir. Sırasıyla şu adımları takip edin:

### Adım 1. GitHub Deposu (Repository) Oluşturun ve Dosyaları Yükleyin
1. GitHub hesabınızda **Public** (Açık) yeni bir depo (repository) oluşturun (Örn: `ajanda` veya `takip-paneli`).
2. Bilgisayarınızdaki veya bu klasördeki şu dosyaları o depoya yükleyin:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `data.json`
3. Dosyaları `main` (veya `master`) dalına doğrudan kaydedin (commit).

### Adım 2. Ücretsiz Web Yayınını Aktif Edin (GitHub Pages)
1. Oluşturduğunuz GitHub deposunun üst menüsündeki **Settings** (Ayarlar) sekmesine tıklayın.
2. Sol menüdeki "Code and automation" başlığı altında bulunan **Pages** seçeneğine girin.
3. **Build and deployment** başlığı altında:
   - **Source:** "Deploy from a branch" olarak kalsın.
   - **Branch:** **main** (veya `master`) dalını seçin ve yanındaki klasör alanını `/ (root)` olarak bırakıp **Save** butonuna tıklayın.
4. Yaklaşık 30-40 saniye sonra sayfayı yenilediğinizde sitenin canlı bağlantısını göreceksiniz:
   `https://<kullanici-adi>.github.io/<depo-adi>/`
   *(Bu bağlantıyı kullanıcının telefon veya tabletine kaydedip ana ekrana simge olarak ekleyebilirsiniz!)*

### Adım 3. Telefonunuz İçin Erişim Anahtarı (PAT) Oluşturun
Telefonunuzdan veri ekleyip silebilmek için GitHub'a güvenli yazma yetkisi vermeniz gerekir:
1. Doğrudan şu bağlantıya tıklayın: [GitHub Erişim Anahtarı Oluşturucu](https://github.com/settings/personal-access-tokens/new).
2. İlgili alanları şu şekilde doldurun:
   - **Token name:** `Care Tracker`
   - **Expiration:** **No expiration** (Süresiz seçeneğini seçin ki ileride anahtarın süresi bitip kapanmasın).
   - **Repository access:** **Only select repositories** seçeneğini işaretleyin ve açılan listeden deponuzu (`takip-paneli` gibi) seçin.
   - **Permissions:** **Repository permissions** butonuna tıklayarak açılan yetkilerden **Contents** satırını bulun ve **Read and write** (Oku ve Yaz) olarak yetkilendirin.
3. Sayfanın en altındaki yeşil **Generate token** butonuna tıklayın.
4. **Oluşturulan anahtarı kopyalayın** (`github_pat_...` ile başlar). Bu anahtar sadece bir defa gösterilir, kopyalamadan sayfadan çıkmayın.

### Adım 4. Kendi Telefonunuzdan Yönetici Girişi Yapın
1. Kendi cep telefonunuzun tarayıcısından sitenizin sonuna `#admin` ekleyerek adrese gidin:
   `https://<kullanici-adi>.github.io/<depo-adi>/#admin`
2. Bu sayfayı telefonunuzun ana ekranına kısayol olarak ekleyin (iPhone'da Safari üzerinden "Ana Ekrana Ekle", Android'de Chrome üzerinden "Ana Ekrana Ekle").
3. Açılan kurulum formunda:
   - Kopyaladığınız **Erişim Anahtarını** yapıştırın.
   - **Depo adını** `kullaniciadi/depoadi` şeklinde girin.
4. **Bağlan ve Verileri Yükle** butonuna dokunun.

🎉 **Kurulum Tamamlandı!** Telefonunuz artık depoya güvenli bir şekilde bağlandı. Erişim anahtarınız sadece kendi telefonunuzun tarayıcı belleğinde şifreli olarak tutulur. Artık tek bir dokunuşla randevu ekleyebilir, ilaç listesini düzenleyebilir veya günün notunu yazıp **Kaydet** butonuna basarak anında ekrana gönderebilirsiniz!

---

## 🎨 Tasarım Detayları
- **Huzur Verici Renkler:** Zihni dinlendiren, gözü yormayan pastel mavi, adaçayı yeşili ve krem tonları tercih edilmiştir.
- **Büyük ve Okunaklı Yazılar:** Halsiz ve yorgun hissedilen anlarda dahi ekranın zorlanmadan okunabilmesi için yazı boyutları büyük ve yüksek kontrastlı olarak seçilmiştir.
- **Otomatik Tarih Hesaplama:** Yaklaşan randevular gün sayısına göre otomatik olarak **Bugün**, **Yarın** veya **X gün sonra** şeklinde Türkçe etiketlenir. Kullanıcının takvim hesabı yapmasına gerek kalmaz.
- **Akıllı İlaç Takibi:** Günlük ilaç işaretleme listesi, her gece yarısı otomatik olarak sıfırlanır, manuel temizleme gerektirmez.
