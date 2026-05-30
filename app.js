/* ==========================================================================
   Günlük Takip Paneli - Dinamik Kontrol Kodları (Türkçe Genel Sürüm)
   Özellikler: Dinamik takvim oluşturma, yerel günlük ilaç takibi,
   GitHub API REST istemcisi, otomatik depo keşfi ve randevu düzenleme.
   ========================================================================== */

// --- Varsayılan Bellek Durumu (Yerel dosya okuma hatalarında yedek olarak kullanılır) ---
const DEFAULT_FALLBACK_STATE = {
  "dailyMessage": "Günaydın! Bugünün senin için huzurlu, rahat ve çok güzel geçmesini diliyorum. Kendini yorma, bol bol dinlen. Seni çok seviyorum. ❤️ — Ozan",
  "medications": [
    { "id": "med-1", "name": "Sabah İlaçları (Kahvaltıdan sonra tok karnına)", "time": "08:00" },
    { "id": "med-2", "name": "Öğle Takviyeleri (Bol su ile alınacak)", "time": "14:00" },
    { "id": "med-3", "name": "Akşam İlacı (Bulantı önleyici & Rahat uyku için)", "time": "20:00" }
  ],
  "appointments": [
    {
      "id": "apt-1",
      "title": "Cerrahi Poliklinik Kontrolü",
      "date": "2026-06-02",
      "time": "11:24",
      "category": "consultation",
      "doctor": "Prof. Dr. Mahmut Müslümanoğlu",
      "location": "ÇAPAYERLEŞKESİ - EK POLİKLİNİK BİNASI",
      "notes": "Planlı kontrol muayenesi. Randevu saatinden 15 dakika önce poliklinikte bulunulması rica olunur."
    },
    {
      "id": "apt-2",
      "title": "Enfeksiyon Hastalıkları Poliklinik Görüşmesi",
      "date": "2026-06-03",
      "time": "10:00",
      "category": "consultation",
      "doctor": "Uzm. Dr. Derya Özyiğitoğlu",
      "location": "Sultan Abdülhamid Han Eğitim ve Araştırma Hastanesi",
      "notes": "Rutin uzman kontrolü. Son yapılan tetkik sonuçlarınızı yanınızda bulundurabilirsiniz."
    },
    {
      "id": "apt-3",
      "title": "Ruh Sağlığı ve Hastalıkları Görüşmesi",
      "date": "2026-06-03",
      "time": "14:00",
      "category": "consultation",
      "doctor": "Uzm. Dr. Meliha Zengin Eroğlu",
      "location": "Sultan Abdülhamid Han Eğitim ve Araştırma Hastanesi",
      "notes": "Rutin destek ve takip görüşmesi."
    }
  ],
  "contacts": [
    { "name": "Klinik Destek & Danışma Hattı", "phone": "+90-555-123-4567" },
    { "name": "Hastane İletişim / Koordinasyon", "phone": "+90-555-987-6543" },
    { "name": "İletişim - Ozan", "phone": "+90-555-555-1234" }
  ]
};

let appState = {
  dailyMessage: "Mesaj yükleniyor...",
  medications: [],
  appointments: [],
  contacts: []
};

// Düzenleme modunda olan randevunun ID'sini tutar
let editingAppointmentId = null;

// Yerel depolamadan alınan GitHub yapılandırması
let ghConfig = {
  token: localStorage.getItem("care_gh_token") || "",
  repo: localStorage.getItem("care_gh_repo") || "" // Format: kullanıcıadı/depo-adı veya tam URL
};

// Yerel testler için varsayılan veri dosyası
const LOCAL_DATA_FALLBACK = "data.json";

// --- Uygulama Başlatma ---
document.addEventListener("DOMContentLoaded", () => {
  initRouter();
  loadData();
  setupEventListeners();
  checkMedicationDateReset();
});

// --- Tek Sayfa Yönlendirici (SPA Router) ---
function initRouter() {
  const handleRoute = () => {
    const hash = window.location.hash;
    const viewDashboard = document.getElementById("view-dashboard");
    const viewAdmin = document.getElementById("view-admin");
    const adminLinkGear = document.getElementById("admin-link-gear");

    if (hash === "#admin") {
      viewDashboard.style.display = "none";
      viewAdmin.style.display = "block";
      adminLinkGear.style.transform = "rotate(45deg)";
      renderAdminView();
    } else {
      viewDashboard.style.display = "block";
      viewAdmin.style.display = "none";
      adminLinkGear.style.transform = "none";
      loadData(); // Dashboard'a geri dönüldüğünde en güncel veriyi tekrar çek
    }
  };

  window.addEventListener("hashchange", handleRoute);
  handleRoute(); // İlk açılışta çalıştır
}

// --- Otomatik ve Gelişmiş Depo Adı Keşfi & Temizliği ---
function getRepositoryDetails() {
  const host = window.location.hostname;
  const path = window.location.pathname;

  // GitHub Pages üzerinde çalışırken otomatik keşif yap
  if (host.endsWith(".github.io")) {
    const owner = host.split(".github.io")[0];
    const repo = path.replace(/^\/|\/$/g, ""); // Baş ve sondaki eğik çizgileri temizle
    if (owner && repo) {
      return { owner, repo: `${owner}/${repo}`, isGitHubPages: true };
    }
  }

  // Yerel veya özel ayarlarda girilen depo adını temizle (URL yapıştırılma hatalarını düzeltir)
  if (ghConfig.repo) {
    let rawRepo = ghConfig.repo.trim();

    // Eğer tam URL yapıştırılmışsa (Örn: https://github.com/ozanmeral/ajanda.git) ayıkla
    if (rawRepo.includes("github.com/")) {
      rawRepo = rawRepo.split("github.com/")[1];
    }
    
    // ".git" uzantısını kaldır
    rawRepo = rawRepo.replace(/\.git$/i, "");
    
    // Baş ve sondaki eğik çizgileri temizle
    rawRepo = rawRepo.replace(/^\/|\/$/g, "");

    const parts = rawRepo.split("/");
    if (parts.length === 2) {
      return { owner: parts[0], repo: rawRepo, isGitHubPages: false };
    }
  }

  return { owner: "", repo: "", isGitHubPages: false };
}

// --- ÜÇ AŞAMALI AKILLI VE GECİKMESİZ YÜKLEYİCİ ---
async function loadData() {
  const { owner, repo } = getRepositoryDetails();
  
  if (window.location.protocol === "file:") {
    console.log("file:// protokolünde çalışılıyor. CORS sınırları nedeniyle varsayılan yerel veri kullanılacak.");
    appState = JSON.parse(JSON.stringify(DEFAULT_FALLBACK_STATE));
    renderDashboardView();
    return;
  }

  // Eğer repo bilgisi mevcutsa, gecikmesiz canlı veri çekimi başlat
  if (owner && repo) {
    
    // AŞAMA 1: Doğrudan GitHub API ile Ham İçerik Çekimi (Gecikme Süresi: 0 Saniye!)
    try {
      const apiFetchUrl = `https://api.github.com/repos/${repo}/contents/data.json`;
      
      const headers = { 
        "Accept": "application/vnd.github.v3.raw",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      };

      if (ghConfig.token) {
        headers["Authorization"] = `token ${ghConfig.token}`;
      }

      console.log("Aşama 1: GitHub REST API üzerinden anlık canlı veriler çekiliyor...");
      const response = await fetch(apiFetchUrl, { headers });
      if (response.ok) {
        appState = await response.json();
        console.log("Veriler doğrudan GitHub API üzerinden anında güncellendi.");
        renderDashboardView();
        return;
      } else {
        console.warn(`GitHub API yanıt vermedi (Durum: ${response.status}). Aşama 2'ye geçiliyor...`);
      }
    } catch (apiError) {
      console.warn("GitHub API bağlantı hatası, Aşama 2'ye geçiliyor...", apiError);
    }

    // AŞAMA 2: raw.githubusercontent Üzerinden Çekim (Hafif önbellekli sürüm)
    try {
      const rawFetchUrl = `https://raw.githubusercontent.com/${repo}/main/data.json?t=${Date.now()}`;
      console.log("Aşama 2: raw.githubusercontent üzerinden çekim deneniyor...");
      const response = await fetch(rawFetchUrl);
      if (response.ok) {
        appState = await response.json();
        console.log("Veriler raw.githubusercontent üzerinden yüklendi.");
        renderDashboardView();
        return;
      }
    } catch (rawError) {
      console.warn("raw.githubusercontent bağlantı hatası, Aşama 3'e geçiliyor...", rawError);
    }
  }

  // AŞAMA 3: Yerel Yayın Klasörü (En son çare, Pages derlemesi bitmiş önbellek sürümü)
  try {
    console.log("Aşama 3: Yerel data.json dosyasından veri okunuyor...");
    const response = await fetch(`${LOCAL_DATA_FALLBACK}?t=${Date.now()}`);
    if (response.ok) {
      appState = await response.json();
      renderDashboardView();
    } else {
      throw new Error("Yerel dosya okunamadı.");
    }
  } catch (error) {
    console.error("Tüm veri çekme yolları başarısız oldu:", error);
    // Çevrimdışı kurtarma modunda statik randevuları yükle
    appState = JSON.parse(JSON.stringify(DEFAULT_FALLBACK_STATE));
    renderDashboardView();
    showToast("⚠️ Güncel verilere ulaşılamadı. Önbellekteki sürüm yükleniyor.", "error");
  }
}

// --- Arayüz Oluşturma: Ana Dashboard Görünümü ---
function renderDashboardView() {
  // 1. Günün Mesajını Yaz
  const msgTextEl = document.getElementById("daily-message-text");
  msgTextEl.innerHTML = appState.dailyMessage || "Huzurlu ve güzel bir gün dilerim. ❤️";

  // 2. Randevuları ve Zaman Çizelgesini Oluştur
  const timelineEl = document.getElementById("care-timeline");
  const countEl = document.getElementById("appointment-count");
  
  if (!appState.appointments || appState.appointments.length === 0) {
    timelineEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🩺</div>
        <p>Yaklaşan planlanmış bir randevu veya işlem bulunmuyor.</p>
        <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.5rem;">Yönetici panelinden yeni girdiler ekleyebilirsiniz!</p>
      </div>
    `;
    countEl.textContent = "Randevu yok";
    return;
  }

  // Tarihleri çözümle ve sadece bugünkü ve gelecekteki randevuları filtrele, kronolojik sırala
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedApts = appState.appointments
    .map(apt => ({
      ...apt,
      parsedDate: new Date(apt.date + "T00:00:00") // Yerel saat diliminde çözümlenmesi için zorla
    }))
    .filter(apt => {
      const aptDate = new Date(apt.parsedDate);
      aptDate.setHours(0, 0, 0, 0);
      return aptDate >= today;
    })
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.parsedDate - b.parsedDate;
      }
      return a.time.localeCompare(b.time);
    });

  countEl.textContent = `${sortedApts.length} randevu`;

  if (sortedApts.length === 0) {
    timelineEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌸</div>
        <p>Planlanmış işlem veya randevu bulunmuyor. Güzel bir gün dilerim! 🌸</p>
      </div>
    `;
    return;
  }

  // Randevu kartlarını render et
  timelineEl.innerHTML = sortedApts.map(apt => {
    // Relative date labels (Bugün, Yarın, X gün sonra)
    const diffTime = apt.parsedDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let relativeBadge = "";
    if (diffDays === 0) {
      relativeBadge = `<span class="timeline-relative-badge badge-today">Bugün</span>`;
    } else if (diffDays === 1) {
      relativeBadge = `<span class="timeline-relative-badge badge-tomorrow">Yarın</span>`;
    } else if (diffDays > 1 && diffDays <= 7) {
      relativeBadge = `<span class="timeline-relative-badge">${diffDays} gün sonra</span>`;
    }

    // Türkçe takvim biçimlendirmesi
    const dayNum = apt.parsedDate.getDate();
    const monthStr = apt.parsedDate.toLocaleString("tr-TR", { month: "short" });

    // Kategori etiketleri
    let categoryLabel = "Planlı İşlem";
    let icon = "🩺";
    if (apt.category === "treatment") {
      categoryLabel = "Planlı Uygulama";
      icon = "🧪";
    } else if (apt.category === "consultation") {
      categoryLabel = "Doktor Kontrolü";
      icon = "🩺";
    } else if (apt.category === "scan") {
      categoryLabel = "Tahlil & Görüntüleme";
      icon = "📸";
    }

    return `
      <article class="glass-card timeline-card card-${apt.category}" role="listitem">
        <div class="timeline-time-box">
          <span class="timeline-date-day">${dayNum}</span>
          <span class="timeline-date-month">${monthStr}</span>
          <span class="timeline-date-time">${escapeHTML(apt.time)}</span>
          ${relativeBadge}
        </div>
        
        <div class="timeline-body">
          <div class="timeline-category-container">
            <span class="timeline-category-tag tag-${apt.category}">${icon} ${categoryLabel}</span>
          </div>
          <h3 class="timeline-title">${escapeHTML(apt.title)}</h3>
          
          <div class="timeline-meta">
            ${apt.doctor ? `
              <div class="meta-row">
                <span class="meta-icon" aria-hidden="true">🩺</span>
                <span><strong>Uzman:</strong> ${escapeHTML(apt.doctor)}</span>
              </div>
            ` : ""}
            ${apt.location ? `
              <div class="meta-row">
                <span class="meta-icon" aria-hidden="true">📍</span>
                <span>
                  <strong>Konum:</strong> 
                  <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(apt.location)}" target="_blank" rel="noopener">
                    ${escapeHTML(apt.location)} ↗
                  </a>
                </span>
              </div>
            ` : ""}
          </div>
          
          ${apt.notes ? `
            <div class="timeline-notes">
              <strong>Notlar & Hatırlatmalar:</strong><br>
              ${escapeHTML(apt.notes).replace(/\n/g, "<br>")}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");

  // 3. İlaç listesini render et
  renderMedicationChecklist();

  // 4. İletişim Numaralarını Render et
  const contactsEl = document.getElementById("contacts-list");
  if (!appState.contacts || appState.contacts.length === 0) {
    contactsEl.innerHTML = `<p class="text-muted">Kayıtlı numara bulunmuyor.</p>`;
  } else {
    contactsEl.innerHTML = appState.contacts.map(c => `
      <a href="tel:${c.phone.replace(/[^0-9+]/g, "")}" class="contact-card-btn">
        <div class="contact-info">
          <strong>${escapeHTML(c.name)}</strong>
          <div class="text-muted" style="font-size: 0.8rem; margin-top: 0.15rem;">${escapeHTML(c.phone)}</div>
        </div>
        <div class="contact-phone-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        </div>
      </a>
    `).join("");
  }
}

// --- İlaç Kontrol Listesi Yönetimi ---
function renderMedicationChecklist() {
  const medListEl = document.getElementById("medication-list");
  if (!appState.medications || appState.medications.length === 0) {
    medListEl.innerHTML = `<p class="text-muted">Bugün için ekli bir ilaç bulunmuyor.</p>`;
    return;
  }

  // Yerel depodan bugünün işaretlenmiş ilaçlarını al
  const dateStr = getTodayDateString();
  const checkedMeds = JSON.parse(localStorage.getItem(`meds-checked-${dateStr}`) || "[]");

  medListEl.innerHTML = appState.medications.map(med => {
    const isTaken = checkedMeds.includes(med.id);
    return `
      <div class="med-item ${isTaken ? "taken" : ""}" data-med-id="${med.id}" role="checkbox" aria-checked="${isTaken}">
        <div class="med-checkbox-container">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="med-info">
          <span class="med-name">${escapeHTML(med.name)}</span>
          <span class="med-time">⏰ Saat: ${escapeHTML(med.time)}</span>
        </div>
      </div>
    `;
  }).join("");

  // Tıklama olaylarını ata
  document.querySelectorAll(".med-item").forEach(item => {
    item.addEventListener("click", () => {
      const medId = item.getAttribute("data-med-id");
      toggleMedication(medId);
    });
  });
}

function toggleMedication(medId) {
  const dateStr = getTodayDateString();
  const storageKey = `meds-checked-${dateStr}`;
  let checkedMeds = JSON.parse(localStorage.getItem(storageKey) || "[]");

  if (checkedMeds.includes(medId)) {
    checkedMeds = checkedMeds.filter(id => id !== medId);
  } else {
    checkedMeds.push(medId);
  }

  localStorage.setItem(storageKey, JSON.stringify(checkedMeds));
  renderMedicationChecklist();
  
  // Tüm ilaçlar alındığında başarı mesajı göster
  const totalMeds = appState.medications.length;
  if (checkedMeds.length === totalMeds && totalMeds > 0) {
    showToast("🎉 Harika! Bugünün tüm ilaçları alındı. Şifa olsun. ❤️", "success");
  }
}

// Gün değiştiğinde eski günleri temizle
function checkMedicationDateReset() {
  const dateStr = getTodayDateString();
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("meds-checked-") && key !== `meds-checked-${dateStr}`) {
      localStorage.removeItem(key);
    }
  }
}

// --- Yönetici Görünümü Kontrolü ---
function renderAdminView() {
  const authSection = document.getElementById("admin-auth");
  const editorSection = document.getElementById("admin-editor");

  if (!ghConfig.token) {
    authSection.style.display = "block";
    editorSection.style.display = "none";
    
    // Otomatik depo doldurma
    const { repo } = getRepositoryDetails();
    if (repo) {
      document.getElementById("gh-repo").value = repo;
    }
    return;
  }

  authSection.style.display = "none";
  editorSection.style.display = "block";

  // Mevcut depo adını ekrana yaz
  document.getElementById("connected-repo-label").textContent = ghConfig.repo || "Bilinmiyor";

  // Günün mesajını düzenleyiciye aktar
  document.getElementById("msg-text").value = appState.dailyMessage || "";

  // Randevu listesi tablosunu render et
  renderAdminAppointmentsTable();

  // İlaç listesi düzenleyicisini render et
  renderAdminMedsList();

  // İletişim listesi düzenleyicisini render et
  renderAdminContactsList();
}

function renderAdminAppointmentsTable() {
  const tbody = document.getElementById("admin-appointments-tbody");
  
  if (!appState.appointments || appState.appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Sistemde kayıtlı randevu bulunmuyor.</td></tr>`;
    return;
  }

  // Tarihe göre yeniden eskiye sıralayarak tabloda göster
  const sorted = [...appState.appointments].sort((a, b) => b.date.localeCompare(a.date));

  tbody.innerHTML = sorted.map(apt => {
    let icon = "🩺";
    let catText = "Randevu";
    if (apt.category === "treatment") { icon = "🧪"; catText = "Uygulama"; }
    if (apt.category === "scan") { icon = "📸"; catText = "Tahlil"; }

    return `
      <tr>
        <td>
          <strong>${apt.date}</strong><br>
          <span class="text-muted" style="font-size:0.8rem;">Saat: ${escapeHTML(apt.time)}</span>
        </td>
        <td>
          <span class="timeline-category-tag tag-${apt.category}">${icon} ${catText}</span>
        </td>
        <td>
          <div class="table-title">${escapeHTML(apt.title)}</div>
          <div class="table-notes-preview" title="${escapeHTML(apt.notes || '')}">${escapeHTML(apt.notes || "Not eklenmemiş.")}</div>
        </td>
        <td>
          ${apt.doctor ? `<strong>${escapeHTML(apt.doctor)}</strong><br>` : ""}
          <span class="text-muted" style="font-size:0.8rem;">${escapeHTML(apt.location || "")}</span>
        </td>
        <td>
          <!-- Düzenleme Butonu (Yeni eklenen kalem simgesi) -->
          <button class="btn-edit-row" onclick="startEditAppointment('${apt.id}')" title="Randevuyu Düzenle" aria-label="Randevuyu Düzenle">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <!-- Silme Butonu -->
          <button class="btn-delete-row" onclick="deleteAppointment('${apt.id}')" title="Randevuyu Sil" aria-label="Randevuyu Sil">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAdminMedsList() {
  const ul = document.getElementById("admin-meds-list");
  if (!appState.medications || appState.medications.length === 0) {
    ul.innerHTML = `<li class="text-muted" style="font-size:0.85rem;">Henüz ilaç eklenmemiş.</li>`;
    return;
  }

  ul.innerHTML = appState.medications.map(med => `
    <li class="admin-item-row">
      <div class="admin-item-text">
        <strong>${escapeHTML(med.name)}</strong>
        <span class="admin-item-subtext">⏰ Saat: ${escapeHTML(med.time)}</span>
      </div>
      <button class="btn-delete-row" type="button" onclick="deleteMedication('${med.id}')" title="İlacı Sil">
        ✕
      </button>
    </li>
  `).join("");
}

function renderAdminContactsList() {
  const ul = document.getElementById("admin-contacts-list");
  if (!appState.contacts || appState.contacts.length === 0) {
    ul.innerHTML = `<li class="text-muted" style="font-size:0.85rem;">Rehber boş.</li>`;
    return;
  }

  ul.innerHTML = appState.contacts.map((c, index) => `
    <li class="admin-item-row">
      <div class="admin-item-text">
        <strong>${escapeHTML(c.name)}</strong>
        <span class="admin-item-subtext">📞 ${escapeHTML(c.phone)}</span>
      </div>
      <button class="btn-delete-row" type="button" onclick="deleteContact(${index})" title="Kişiyi Sil">
        ✕
      </button>
    </li>
  `).join("");
}

// --- GitHub REST API Git Eşitleme İşlemleri ---
async function pushDataToGitHub(updatedState, successMessage) {
  const { repo } = getRepositoryDetails();
  if (!repo || !ghConfig.token) {
    showToast("⚠️ GitHub yapılandırması eksik. Ayarları kontrol edin.", "error");
    return false;
  }

  const apiUrl = `https://api.github.com/repos/${repo}/contents/data.json`;
  
  try {
    // 1. Get the current file details (need the 'sha' hash to overwrite file in Git)
    const getResponse = await fetch(apiUrl, {
      headers: {
        "Authorization": `token ${ghConfig.token}`,
        "Accept": "application/vnd.github.v3+json",
        "Cache-Control": "no-cache"
      }
    });

    let sha = "";
    if (getResponse.ok) {
      const fileData = await getResponse.json();
      sha = fileData.sha;
    } else if (getResponse.status !== 404) {
      throw new Error(`Dosya kontrol hatası: ${getResponse.statusText}`);
    }

    // 2. Perform the update/write (PUT)
    const jsonString = JSON.stringify(updatedState, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

    const putResponse = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `token ${ghConfig.token}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github.v3+json"
      },
      body: JSON.stringify({
        message: "Takip panelini güncelle: randevu ve ilaç güncellemeleri yapıldı",
        content: base64Content,
        sha: sha || undefined
      })
    });

    if (!putResponse.ok) {
      const errBody = await putResponse.json();
      throw new Error(errBody.message || "Yazma hatası");
    }

    // 3. Update memory state & show beautiful success notification
    appState = updatedState;
    showToast(successMessage || "✅ Güncelleme başarıyla kaydedildi!", "success");
    return true;
  } catch (error) {
    console.error("GitHub Sync Hatası:", error);
    showToast(`❌ Hata Oluştu: ${error.message}`, "error");
    return false;
  }
}

// --- Eylemler & Form Kontrolleri ---

// Randevu Ekleme ve DÜZENLEME İşlemi
async function handleAddAppointment(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-save-appointment");
  
  const title = document.getElementById("apt-title").value.trim();
  const date = document.getElementById("apt-date").value;
  const time = document.getElementById("apt-time").value;
  const category = document.getElementById("apt-category").value;
  const doctor = document.getElementById("apt-doctor").value.trim();
  const location = document.getElementById("apt-location").value.trim();
  const notes = document.getElementById("apt-notes").value.trim();

  if (!title || !date || !time) return;

  let updatedState;
  let successMsg = "✅ Randevu başarıyla eklendi!";

  if (editingAppointmentId) {
    // DÜZENLEME MODU: Mevcut randevuyu haritalayarak güncelle
    successMsg = "✅ Randevu başarıyla güncellendi!";
    const updatedAppointments = appState.appointments.map(apt => {
      if (apt.id === editingAppointmentId) {
        return {
          id: apt.id, // ID değişmez
          title,
          date,
          time,
          category,
          doctor: doctor || undefined,
          location: location || undefined,
          notes: notes || undefined
        };
      }
      return apt;
    });

    updatedState = {
      ...appState,
      appointments: updatedAppointments
    };
  } else {
    // EKLEME MODU: Yeni randevu ekle
    const newApt = {
      id: `apt-${Date.now()}`,
      title,
      date,
      time,
      category,
      doctor: doctor || undefined,
      location: location || undefined,
      notes: notes || undefined
    };

    updatedState = {
      ...appState,
      appointments: [...(appState.appointments || []), newApt]
    };
  }

  btn.classList.add("btn-loading");
  const success = await pushDataToGitHub(updatedState, successMsg);
  btn.classList.remove("btn-loading");

  if (success) {
    cancelEditAppointment();
    renderAdminView();
  }
}

// Randevu Düzenlemeyi Başlatma (Formu doldur ve düzenleme moduna al)
function startEditAppointment(id) {
  const apt = appState.appointments.find(a => a.id === id);
  if (!apt) return;

  editingAppointmentId = id;

  // Form alanlarını doldur
  document.getElementById("apt-title").value = apt.title || "";
  document.getElementById("apt-date").value = apt.date || "";
  document.getElementById("apt-time").value = apt.time || "";
  document.getElementById("apt-category").value = apt.category || "consultation";
  document.getElementById("apt-doctor").value = apt.doctor || "";
  document.getElementById("apt-location").value = apt.location || "";
  document.getElementById("apt-notes").value = apt.notes || "";

  // Görsel buton ayarlarını güncelle
  document.getElementById("btn-save-appointment-text").textContent = "Değişiklikleri Kaydet";
  document.getElementById("btn-cancel-edit").style.display = "inline-flex";

  // Form başlığını ve form alanını odakla
  const formCard = document.querySelector(".editor-card");
  if (formCard) {
    formCard.scrollIntoView({ behavior: "smooth" });
  }
  
  showToast("✍️ Randevu düzenleme moduna alındı.", "info");
}

// Randevu Düzenlemeyi İptal Etme
function cancelEditAppointment() {
  editingAppointmentId = null;
  document.getElementById("appointment-form").reset();

  // Butonları varsayılana döndür
  document.getElementById("btn-save-appointment-text").textContent = "Randevuyu Ekle";
  document.getElementById("btn-cancel-edit").style.display = "none";
}

// Randevu Silme
async function deleteAppointment(id) {
  // Eğer silinecek randevu şu an düzenleniyorsa önce düzenlemeyi iptal et
  if (editingAppointmentId === id) {
    cancelEditAppointment();
  }

  if (!confirm("Bu randevuyu silmek istediğinizden emin misiniz?")) return;

  const updatedState = {
    ...appState,
    appointments: appState.appointments.filter(apt => apt.id !== id)
  };

  showToast("Randevu kaldırılıyor...", "info");
  const success = await pushDataToGitHub(updatedState, "🗑️ Randevu başarıyla silindi!");
  if (success) {
    renderAdminView();
  }
}

// Günün Mesajını Değiştirme
async function handleUpdateMessage(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-save-message");
  const msgText = document.getElementById("msg-text").value.trim();

  const updatedState = {
    ...appState,
    dailyMessage: msgText
  };

  btn.classList.add("btn-loading");
  const success = await pushDataToGitHub(updatedState, "💌 Günün notu başarıyla güncellendi!");
  btn.classList.remove("btn-loading");

  if (success) {
    renderAdminView();
  }
}

// İlaç Ekleme
async function handleAddMedication(e) {
  e.preventDefault();
  const name = document.getElementById("med-new-name").value.trim();
  const time = document.getElementById("med-new-time").value.trim();

  if (!name || !time) return;

  const newMed = {
    id: `med-${Date.now()}`,
    name,
    time
  };

  const updatedState = {
    ...appState,
    medications: [...(appState.medications || []), newMed]
  };

  const success = await pushDataToGitHub(updatedState, "💊 İlaç başarıyla eklendi!");
  if (success) {
    document.getElementById("med-add-form").reset();
    renderAdminView();
  }
}

// İlaç Silme
async function deleteMedication(id) {
  if (!confirm("Bu ilacı listeden kaldırmak istediğinizden emin misiniz?")) return;

  const updatedState = {
    ...appState,
    medications: appState.medications.filter(med => med.id !== id)
  };

  const success = await pushDataToGitHub(updatedState, "🗑️ İlaç başarıyla listeden kaldırıldı.");
  if (success) {
    renderAdminView();
  }
}

// İletişim Numarası Ekleme
async function handleAddContact(e) {
  e.preventDefault();
  const name = document.getElementById("contact-new-name").value.trim();
  const phone = document.getElementById("contact-new-phone").value.trim();

  if (!name || !phone) return;

  const newContact = { name, phone };

  const updatedState = {
    ...appState,
    contacts: [...(appState.contacts || []), newContact]
  };

  const success = await pushDataToGitHub(updatedState, "📞 Telefon numarası başarıyla eklendi!");
  if (success) {
    document.getElementById("contact-add-form").reset();
    renderAdminView();
  }
}

// Kişi Silme
async function deleteContact(index) {
  if (!confirm("Bu numarayı rehberden silmek istediğinizden emin misiniz?")) return;

  const updatedState = {
    ...appState,
    contacts: appState.contacts.filter((_, idx) => idx !== index)
  };

  const success = await pushDataToGitHub(updatedState, "🗑️ Numarası silindi.");
  if (success) {
    renderAdminView();
  }
}

// --- Olay Dinleyicileri Kurulumu ---
function setupEventListeners() {
  // Giriş/PAT Kaydetme Formu
  const authForm = document.getElementById("auth-form");
  if (authForm) {
    authForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const token = document.getElementById("gh-token").value.trim();
      const repo = document.getElementById("gh-repo").value.trim();

      if (token && repo) {
        localStorage.setItem("care_gh_token", token);
        localStorage.setItem("care_gh_repo", repo);
        ghConfig.token = token;
        ghConfig.repo = repo;
        
        showToast("🔑 Depo bağlantısı başarıyla kuruldu!", "success");
        loadData().then(() => renderAdminView());
      }
    });
  }

  // Çıkış yapma / Bağlantı kesme
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("Bağlantıyı kesmek ve erişim anahtarınızı bu telefondan silmek istediğinizden emin misiniz?")) {
        localStorage.removeItem("care_gh_token");
        localStorage.removeItem("care_gh_repo");
        ghConfig.token = "";
        ghConfig.repo = "";
        
        showToast("🔑 Bağlantı kesildi.", "info");
        renderAdminView();
      }
    });
  }

  // Randevu ekleme formu gönderimi (Düzenleme modunu da kapsar)
  const aptForm = document.getElementById("appointment-form");
  if (aptForm) {
    aptForm.addEventListener("submit", handleAddAppointment);
  }

  // Randevu Düzenlemeyi İptal Etme butonu
  const cancelEditBtn = document.getElementById("btn-cancel-edit");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", cancelEditAppointment);
  }

  // Mesaj formu gönderimi
  const msgForm = document.getElementById("message-form");
  if (msgForm) {
    msgForm.addEventListener("submit", handleUpdateMessage);
  }

  // İlaç ekleme formu gönderimi
  const medForm = document.getElementById("med-add-form");
  if (medForm) {
    medForm.addEventListener("submit", handleAddMedication);
  }

  // İletişim ekleme formu gönderimi
  const contactForm = document.getElementById("contact-add-form");
  if (contactForm) {
    contactForm.addEventListener("submit", handleAddContact);
  }

  // İlaç işaretlerini manuel sıfırlama butonu
  const resetMedsBtn = document.getElementById("reset-meds");
  if (resetMedsBtn) {
    resetMedsBtn.addEventListener("click", () => {
      const dateStr = getTodayDateString();
      localStorage.setItem(`meds-checked-${dateStr}`, JSON.stringify([]));
      renderMedicationChecklist();
      showToast("🔄 İlaç kontrol listesi sıfırlandı.", "info");
    });
  }
}

// --- Yardımcı Fonksiyonlar ---

// Güvenli HTML Temizliği (XSS Koruması)
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Günün tarihini YYYY-MM-DD biçiminde alan yardımcı
function getTodayDateString() {
  const d = new Date();
  const month = "" + (d.getMonth() + 1);
  const day = "" + d.getDate();
  const year = d.getFullYear();
  return [year, month.padStart(2, "0"), day.padStart(2, "0")].join("-");
}

// Geri bildirim bildirim pencereleri (Toast)
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-message");
  const toastIcon = document.getElementById("toast-icon");
  
  toast.className = `toast-banner active ${type}`;
  toastMsg.textContent = message;

  if (type === "success") {
    toastIcon.textContent = "✓";
  } else if (type === "error") {
    toastIcon.textContent = "✕";
  } else {
    toastIcon.textContent = "ℹ";
  }

  setTimeout(() => {
    toast.classList.remove("active");
  }, 3500);
}

// onclick nitelikleri için fonksiyonları küresel pencere nesnesine bağla
window.deleteAppointment = deleteAppointment;
window.startEditAppointment = startEditAppointment;
window.cancelEditAppointment = cancelEditAppointment;
window.deleteMedication = deleteMedication;
window.deleteContact = deleteContact;
