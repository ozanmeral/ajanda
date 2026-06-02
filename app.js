/* ==========================================================================
   Günlük Takip Paneli - Dinamik Kontrol Kodları (Türkçe Genel Sürüm)
   Özellikler: Dinamik takvim oluşturma, yerel günlük ilaç takibi,
   GitHub API REST istemcisi, otomatik depo keşfi ve randevu düzenleme.
   ========================================================================== */

// --- Varsayılan Bellek Durumu (Yerel dosya okuma hatalarında yedek olarak kullanılır) ---
const DEFAULT_FALLBACK_STATE = {
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
  ]
};

let appState = {
  medications: [],
  appointments: []
};

// Düzenleme modunda olan randevunun ID'sini tutar
let editingAppointmentId = null;
let appointmentCountdownTimer = null;
let adminPastAppointmentsPage = 1;
const ADMIN_PAST_APPOINTMENTS_PAGE_SIZE = 5;

const CONFIRMATION_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  NOT_REQUIRED: "not_required"
};

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
  renderTodaySummary();
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
      const apiFetchUrl = `https://api.github.com/repos/${repo}/contents/data.json?t=${Date.now()}`;
      
      const headers = { 
        "Accept": "application/vnd.github.v3.raw"
      };

      // CORS el sıkışmasını ve yetkilendirmeyi kolaylaştırmak amacıyla 'Bearer' standardı kullanılıyor
      if (ghConfig.token) {
        headers["Authorization"] = `Bearer ${ghConfig.token}`;
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
  // 1. Randevuları ve Zaman Çizelgesini Oluştur
  const timelineEl = document.getElementById("care-timeline");
  const countEl = document.getElementById("appointment-count");
  
  if (!appState.appointments || appState.appointments.length === 0) {
    stopAppointmentCountdowns();
    renderAppointmentCalendar([], new Date());
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

  // Tarihleri çözümle; randevu başlangıcından 1 saat sonra ana ekrandan gizle.
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const sortedApts = appState.appointments
    .map(apt => ({
      ...apt,
      confirmationStatus: normalizeConfirmationStatus(apt.confirmationStatus),
      parsedDate: parseAppointmentDate(apt.date),
      parsedDateTime: createAppointmentDateTime(apt.date, apt.time)
    }))
    .filter(apt => isAppointmentVisibleOnDashboard(apt.parsedDateTime, now))
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.parsedDate - b.parsedDate;
      }
      return a.time.localeCompare(b.time);
    });

  countEl.textContent = `${sortedApts.length} randevu`;

  if (sortedApts.length === 0) {
    stopAppointmentCountdowns();
    renderAppointmentCalendar([], today);
    timelineEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌸</div>
        <p>Planlanmış işlem veya randevu bulunmuyor. Güzel bir gün dilerim! 🌸</p>
      </div>
    `;
    return;
  }

  const groupedApts = sortedApts.reduce((groups, apt) => {
    if (!groups.has(apt.date)) {
      groups.set(apt.date, []);
    }
    groups.get(apt.date).push(apt);
    return groups;
  }, new Map());

  // Randevu kartlarını gün grupları halinde render et
  const groupedAptValues = Array.from(groupedApts.values());

  renderAppointmentCalendar(sortedApts, today);

  timelineEl.innerHTML = groupedAptValues.map((group, groupIndex) => {
    const firstApt = group[0];
    const groupDate = firstApt.parsedDate;
    const weekdayStr = groupDate.toLocaleString("tr-TR", { weekday: "long" });
    const dayNum = groupDate.getDate();
    const monthStr = groupDate.toLocaleString("tr-TR", { month: "long" });
    const yearStr = groupDate.getFullYear();
    const groupRelative = getRelativeDayInfo(groupDate, today).label;
    const appointmentText = `${group.length} randevu var`;

    return `
      <section class="timeline-day-group day-theme-${groupIndex % 5}" data-timeline-date="${escapeHTML(firstApt.date)}" aria-label="${escapeHTML(capitalizeTurkish(weekdayStr))} günü ${appointmentText}">
        <div class="timeline-day-divider">
          <div>
            <h3>${escapeHTML(capitalizeTurkish(weekdayStr))} günü ${appointmentText}</h3>
            <p>${dayNum} ${escapeHTML(monthStr)} ${yearStr}${groupRelative ? ` · ${groupRelative}` : ""}</p>
          </div>
          <span class="timeline-day-count">${group.length}</span>
        </div>
        ${group.map(apt => {
          const appointmentDateTime = apt.parsedDateTime || createAppointmentDateTime(apt.date, apt.time);
          const countdownTarget = appointmentDateTime.toISOString();

          // Türkçe takvim biçimlendirmesi
          const dayNum = apt.parsedDate.getDate();
          const weekdayStr = apt.parsedDate.toLocaleString("tr-TR", { weekday: "long" });
          const monthStr = apt.parsedDate.toLocaleString("tr-TR", { month: "long" });
          const confirmationStatus = normalizeConfirmationStatus(apt.confirmationStatus);
          const confirmationInfo = getConfirmationInfo(apt, today);
          const calendarHref = createCalendarEventHref(apt);
          const calendarFileName = `${safeFileSlug(apt.title || "randevu")}.ics`;
          const calendarAction = isAppleMobileDevice()
            ? `<a class="calendar-add-link" href="${calendarHref}" download="${escapeHTML(calendarFileName)}">Takvime Ekle</a>`
            : "";

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
                <div class="timeline-date-block">
                  <span class="timeline-date-primary">${dayNum} ${escapeHTML(monthStr)}</span>
                  <span class="timeline-weekday">${escapeHTML(capitalizeTurkish(weekdayStr))}</span>
                </div>
                <span class="timeline-date-time">
                  <span class="timeline-time-label">Saat</span>
                  <span class="timeline-time-value">${escapeHTML(apt.time)}</span>
                </span>
                <span class="timeline-relative-badge appointment-countdown" data-countdown-target="${escapeHTML(countdownTarget)}" aria-live="polite">
                  Hesaplanıyor...
                </span>
              </div>

              <div class="timeline-body">
                <div class="timeline-category-container">
                  <span class="timeline-category-tag tag-${apt.category}">${icon} ${categoryLabel}</span>
                </div>
                <h3 class="timeline-title">${escapeHTML(apt.title)}</h3>

                <div class="confirmation-box confirmation-${confirmationStatus}">
                  <span class="confirmation-label">${escapeHTML(confirmationInfo.label)}</span>
                  <span class="confirmation-message">${escapeHTML(confirmationInfo.message)}</span>
                </div>

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

                ${calendarAction ? `<div class="timeline-actions">${calendarAction}</div>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </section>
    `;
  }).join("");

  startAppointmentCountdowns();

  // 2. İlaç listesini render et
  renderMedicationChecklist();
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

  // Randevu listesi tablosunu render et
  renderAdminAppointmentsTable();
  renderAppointmentShortcuts();

  // İlaç listesi düzenleyicisini render et
  renderAdminMedsList();
}

function renderAdminAppointmentsTable() {
  const tbody = document.getElementById("admin-appointments-tbody");
  const pastTbody = document.getElementById("admin-past-appointments-tbody");
  const activeCountEl = document.getElementById("admin-active-count");
  const pastCountEl = document.getElementById("admin-past-count");
  const paginationEl = document.getElementById("admin-past-pagination");
  const pageLabelEl = document.getElementById("admin-past-page-label");
  const prevBtn = document.getElementById("btn-past-prev");
  const nextBtn = document.getElementById("btn-past-next");
  
  if (!appState.appointments || appState.appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Sistemde kayıtlı randevu bulunmuyor.</td></tr>`;
    if (pastTbody) pastTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Geçmiş randevu bulunmuyor.</td></tr>`;
    if (activeCountEl) activeCountEl.textContent = "0 kayıt";
    if (pastCountEl) pastCountEl.textContent = "0 kayıt";
    if (paginationEl) paginationEl.hidden = true;
    return;
  }

  const now = new Date();
  const appointmentsWithDates = appState.appointments.map(apt => ({
    ...apt,
    parsedDateTime: createAppointmentDateTime(apt.date, apt.time)
  }));
  const activeAppointments = appointmentsWithDates
    .filter(apt => isAppointmentVisibleOnDashboard(apt.parsedDateTime, now))
    .sort((a, b) => a.parsedDateTime - b.parsedDateTime);
  const pastAppointments = appointmentsWithDates
    .filter(apt => !isAppointmentVisibleOnDashboard(apt.parsedDateTime, now))
    .sort((a, b) => b.parsedDateTime - a.parsedDateTime);

  tbody.innerHTML = activeAppointments.length
    ? renderAdminAppointmentRows(activeAppointments)
    : `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Aktif veya yaklaşan randevu bulunmuyor.</td></tr>`;

  if (activeCountEl) activeCountEl.textContent = `${activeAppointments.length} kayıt`;
  if (pastCountEl) pastCountEl.textContent = `${pastAppointments.length} kayıt`;

  const totalPastPages = Math.max(1, Math.ceil(pastAppointments.length / ADMIN_PAST_APPOINTMENTS_PAGE_SIZE));
  adminPastAppointmentsPage = Math.min(Math.max(1, adminPastAppointmentsPage), totalPastPages);
  const startIndex = (adminPastAppointmentsPage - 1) * ADMIN_PAST_APPOINTMENTS_PAGE_SIZE;
  const visiblePastAppointments = pastAppointments.slice(startIndex, startIndex + ADMIN_PAST_APPOINTMENTS_PAGE_SIZE);

  if (pastTbody) {
    pastTbody.innerHTML = visiblePastAppointments.length
      ? renderAdminAppointmentRows(visiblePastAppointments)
      : `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Geçmiş randevu bulunmuyor.</td></tr>`;
  }

  if (paginationEl) paginationEl.hidden = pastAppointments.length <= ADMIN_PAST_APPOINTMENTS_PAGE_SIZE;
  if (pageLabelEl) pageLabelEl.textContent = `Sayfa ${adminPastAppointmentsPage} / ${totalPastPages}`;
  if (prevBtn) prevBtn.disabled = adminPastAppointmentsPage <= 1;
  if (nextBtn) nextBtn.disabled = adminPastAppointmentsPage >= totalPastPages;
}

function renderAdminAppointmentRows(appointments) {
  return appointments.map(apt => {
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
          <div class="confirmation-table-status">${escapeHTML(getConfirmationStatusLabel(normalizeConfirmationStatus(apt.confirmationStatus)))}</div>
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

function renderAppointmentShortcuts() {
  renderComboOptions(document.querySelector('[data-combo-field="title"]'));
  renderComboOptions(document.querySelector('[data-combo-field="doctor"]'));
  renderComboOptions(document.querySelector('[data-combo-field="location"]'));
}

function getUniqueAppointmentValues(fieldName) {
  return Array.from(new Set((appState.appointments || [])
    .map(apt => (apt[fieldName] || "").trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "tr-TR"));
}

function setupSearchableDropdowns() {
  document.querySelectorAll("[data-combo-field]").forEach(combo => {
    if (combo.dataset.comboReady === "true") return;

    const input = combo.querySelector("input");
    const toggle = combo.querySelector(".combo-toggle");
    if (!input || !toggle) return;

    input.addEventListener("input", () => renderComboOptions(combo, true));
    input.addEventListener("focus", () => renderComboOptions(combo, true));
    toggle.addEventListener("click", () => {
      const options = combo.querySelector(".combo-options");
      const shouldOpen = options?.hidden;
      closeComboOptions();
      if (shouldOpen) {
        input.focus();
        renderComboOptions(combo, true, "");
      }
    });

    combo.dataset.comboReady = "true";
  });

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-combo-field]")) {
      closeComboOptions();
    }
  });
}

function renderComboOptions(combo, open = false, forcedQuery = null) {
  if (!combo) return;

  const input = combo.querySelector("input");
  const optionsEl = combo.querySelector(".combo-options");
  if (!input || !optionsEl) return;

  const values = getUniqueAppointmentValues(combo.dataset.comboField);
  const query = forcedQuery !== null ? forcedQuery : input.value.trim();
  const normalizedQuery = query.toLocaleLowerCase("tr-TR");
  const filteredValues = values
    .filter(value => !normalizedQuery || value.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
    .slice(0, 8);

  optionsEl.innerHTML = filteredValues.length
    ? filteredValues.map(value => `
        <li role="option">
          <button type="button" data-combo-value="${escapeHTML(value)}">${highlightMatch(value, query)}</button>
        </li>
      `).join("")
    : `<li class="combo-empty">Eşleşen kayıt yok</li>`;

  optionsEl.hidden = !open;
  input.setAttribute("aria-expanded", String(!optionsEl.hidden));

  optionsEl.querySelectorAll("[data-combo-value]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.getAttribute("data-combo-value") || "";
      optionsEl.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.focus();
    });
  });
}

function closeComboOptions() {
  document.querySelectorAll(".combo-options").forEach(options => {
    options.hidden = true;
    const input = options.closest("[data-combo-field]")?.querySelector("input");
    if (input) input.setAttribute("aria-expanded", "false");
  });
}

function highlightMatch(value, query) {
  if (!query) return escapeHTML(value);

  const index = value.toLocaleLowerCase("tr-TR").indexOf(query.toLocaleLowerCase("tr-TR"));
  if (index < 0) return escapeHTML(value);

  const before = value.slice(0, index);
  const match = value.slice(index, index + query.length);
  const after = value.slice(index + query.length);
  return `${escapeHTML(before)}<mark>${escapeHTML(match)}</mark>${escapeHTML(after)}`;
}

// --- GitHub REST API Git Eşitleme İşlemleri ---
async function pushDataToGitHub(updatedState, successMessage) {
  const { repo } = getRepositoryDetails();
  if (!repo || !ghConfig.token) {
    showToast("⚠️ GitHub yapılandırması eksik. Ayarları kontrol edin.", "error");
    return false;
  }

  const apiUrl = `https://api.github.com/repos/${repo}/contents/data.json`;
  const stateToSave = sanitizeAppStateForSave(updatedState);
  
  try {
    // 1. Güncel dosya bilgilerini çek (Dosyayı ezebilmek için 'sha' değerini almak şart)
    // El sıkışma CORS ve preflight kontrolünü Bearer olarak modern yapıda yapıyoruz
    const getResponse = await fetch(`${apiUrl}?t=${Date.now()}`, {
      headers: {
        "Authorization": `Bearer ${ghConfig.token}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });

    let sha = "";
    if (getResponse.ok) {
      const fileData = await getResponse.json();
      sha = fileData.sha;
    } else if (getResponse.status !== 404) {
      throw new Error(`Dosya kontrol hatası: ${getResponse.statusText}`);
    }

    // 2. Güncelleme isteğini gönder (PUT)
    const jsonString = JSON.stringify(stateToSave, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

    const putResponse = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${ghConfig.token}`,
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

    // 3. Eşitleme başarılı: belleği güncelle ve başarı mesajı göster
    appState = stateToSave;
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
  const confirmationStatus = normalizeConfirmationStatus(document.getElementById("apt-confirmation-status").value);
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
          confirmationStatus,
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
      confirmationStatus,
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
  document.getElementById("apt-confirmation-status").value = normalizeConfirmationStatus(apt.confirmationStatus);
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

// --- Olay Dinleyicileri Kurulumu ---
function setupEventListeners() {
  setupSearchableDropdowns();

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

  // İlaç ekleme formu gönderimi
  const medForm = document.getElementById("med-add-form");
  if (medForm) {
    medForm.addEventListener("submit", handleAddMedication);
  }

  const pastPrevBtn = document.getElementById("btn-past-prev");
  if (pastPrevBtn) {
    pastPrevBtn.addEventListener("click", () => {
      adminPastAppointmentsPage = Math.max(1, adminPastAppointmentsPage - 1);
      renderAdminAppointmentsTable();
    });
  }

  const pastNextBtn = document.getElementById("btn-past-next");
  if (pastNextBtn) {
    pastNextBtn.addEventListener("click", () => {
      adminPastAppointmentsPage += 1;
      renderAdminAppointmentsTable();
    });
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

function sanitizeAppStateForSave(state) {
  const cleanState = { ...(state || {}) };
  delete cleanState["daily" + "Message"];
  delete cleanState["con" + "tacts"];

  return {
    medications: cleanState.medications || [],
    appointments: cleanState.appointments || []
  };
}

// Günün tarihini YYYY-MM-DD biçiminde alan yardımcı
function getTodayDateString() {
  const d = new Date();
  const month = "" + (d.getMonth() + 1);
  const day = "" + d.getDate();
  const year = d.getFullYear();
  return [year, month.padStart(2, "0"), day.padStart(2, "0")].join("-");
}

function renderAppointmentCalendar(appointments, todayStart) {
  const monthsEl = document.getElementById("appointment-calendar-months");
  const todayLabelEl = document.getElementById("calendar-today-label");
  const rangeLabelEl = document.getElementById("calendar-range-label");
  if (!monthsEl || !todayLabelEl || !rangeLabelEl) return;

  const appointmentsByDate = appointments.reduce((map, apt) => {
    if (!map.has(apt.date)) {
      map.set(apt.date, []);
    }
    map.get(apt.date).push(apt);
    return map;
  }, new Map());

  const todayKey = formatDateKey(todayStart);
  const monthDates = getCalendarMonthDates(appointments, todayStart);

  todayLabelEl.textContent = `Bugün: ${formatShortAppointmentDate(todayStart)}`;
  rangeLabelEl.textContent = appointments.length
    ? `Sıradaki randevu: ${formatShortAppointmentDate(appointments[0].parsedDate)}`
    : "Yaklaşan randevu yok";

  const appointmentDateOrder = Array.from(appointmentsByDate.keys());
  const dateThemeMap = appointmentDateOrder.reduce((map, dateKey, index) => {
    map.set(dateKey, index % 5);
    return map;
  }, new Map());

  monthsEl.innerHTML = monthDates.map(monthDate =>
    renderCalendarMonth(monthDate, appointmentsByDate, dateThemeMap, todayKey)
  ).join("");

  monthsEl.querySelectorAll("[data-calendar-date]").forEach(button => {
    button.addEventListener("click", () => {
      const target = document.querySelector(`[data-timeline-date="${button.getAttribute("data-calendar-date")}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function renderCalendarMonth(monthDate, appointmentsByDate, dateThemeMap, todayKey) {
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlankCount = (firstDay.getDay() + 6) % 7;
  let monthAppointmentCount = 0;
  let daysHTML = "";

  for (let i = 0; i < leadingBlankCount; i++) {
    daysHTML += `<span class="calendar-day is-empty" aria-hidden="true"></span>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);
    const dayAppointments = appointmentsByDate.get(dateKey) || [];
    const hasAppointment = dayAppointments.length > 0;
    const themeClass = hasAppointment ? `day-theme-${dateThemeMap.get(dateKey)}` : "";
    const label = hasAppointment
      ? `${day} ${date.toLocaleString("tr-TR", { month: "long" })}: ${dayAppointments.length} randevu`
      : `${day} ${date.toLocaleString("tr-TR", { month: "long" })}`;
    const dayContent = `
      <span class="calendar-day-number">${day}</span>
      ${hasAppointment ? `<span class="calendar-day-dot">${dayAppointments.length}</span>` : ""}
    `;
    monthAppointmentCount += dayAppointments.length;

    if (hasAppointment) {
      daysHTML += `
        <button class="calendar-day has-appointment ${themeClass} ${dateKey === todayKey ? "is-today" : ""}" type="button" data-calendar-date="${dateKey}" aria-label="${escapeHTML(label)}">
          ${dayContent}
        </button>
      `;
    } else {
      daysHTML += `
        <span class="calendar-day ${dateKey === todayKey ? "is-today" : ""}" aria-label="${escapeHTML(label)}">
          ${dayContent}
        </span>
      `;
    }
  }

  const monthName = capitalizeTurkish(monthDate.toLocaleString("tr-TR", { month: "long" }));
  const appointmentText = `${monthAppointmentCount} randevu`;

  return `
    <section class="calendar-month" aria-label="${escapeHTML(monthName)} ${year}, ${appointmentText}">
      <div class="calendar-month-header">
        <h3>${escapeHTML(monthName)} ${year}</h3>
        <span>${appointmentText}</span>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        <span>Pzt</span>
        <span>Sal</span>
        <span>Çar</span>
        <span>Per</span>
        <span>Cum</span>
        <span>Cmt</span>
        <span>Paz</span>
      </div>
      <div class="calendar-grid">
        ${daysHTML}
      </div>
    </section>
  `;
}

function getCalendarMonthDates(appointments, todayStart) {
  const start = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const end = appointments.length
    ? new Date(appointments[appointments.length - 1].parsedDate.getFullYear(), appointments[appointments.length - 1].parsedDate.getMonth(), 1)
    : start;
  const months = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortAppointmentDate(date) {
  const weekday = capitalizeTurkish(date.toLocaleString("tr-TR", { weekday: "long" }));
  const day = date.getDate();
  const month = date.toLocaleString("tr-TR", { month: "long" });
  return `${day} ${month}, ${weekday}`;
}

function parseAppointmentDate(dateStr) {
  // Yerel gün başlangıcında çözümleyerek saat dilimi kaynaklı dün/bugün kaymalarını önler.
  return new Date(`${dateStr}T00:00:00`);
}

function isAppointmentVisibleOnDashboard(appointmentDateTime, now = new Date()) {
  if (!(appointmentDateTime instanceof Date) || Number.isNaN(appointmentDateTime.getTime())) {
    return false;
  }

  const hideAfter = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000);
  return hideAfter > now;
}

function normalizeConfirmationStatus(status) {
  if (status === CONFIRMATION_STATUS.CONFIRMED || status === CONFIRMATION_STATUS.NOT_REQUIRED) {
    return status;
  }
  return CONFIRMATION_STATUS.PENDING;
}

function getConfirmationStatusLabel(status) {
  if (status === CONFIRMATION_STATUS.CONFIRMED) return "Onaylandı";
  if (status === CONFIRMATION_STATUS.NOT_REQUIRED) return "Onay gerekmiyor";
  return "Onaylanmadı";
}

function getConfirmationInfo(apt, now = new Date()) {
  const status = normalizeConfirmationStatus(apt.confirmationStatus);
  if (status === CONFIRMATION_STATUS.CONFIRMED) {
    return {
      label: "Onaylandı",
      message: "Bu randevunun onayı tamamlandı."
    };
  }

  if (status === CONFIRMATION_STATUS.NOT_REQUIRED) {
    return {
      label: "Onay gerekmiyor",
      message: "Bu randevu için ayrıca onay işlemi gerekmiyor."
    };
  }

  const deadline = getConfirmationDeadline(apt.parsedDate || parseAppointmentDate(apt.date));
  const deadlineText = formatConfirmationDeadline(deadline);
  const isOverdue = now.getTime() > deadline.getTime();

  return {
    label: isOverdue ? "Onay süresi geçti" : "Onay bekliyor",
    message: isOverdue
      ? `${deadlineText} tarihine kadar onaylanmalıydı.`
      : `${deadlineText} tarihine kadar onaylanmalı.`
  };
}

function getConfirmationDeadline(appointmentDate) {
  const deadline = new Date(appointmentDate);
  deadline.setDate(deadline.getDate() - 1);
  deadline.setHours(20, 0, 0, 0);
  return deadline;
}

function formatConfirmationDeadline(date) {
  const day = date.getDate();
  const month = date.toLocaleString("tr-TR", { month: "long" });
  const weekday = capitalizeTurkish(date.toLocaleString("tr-TR", { weekday: "long" }));
  const time = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month} ${weekday} ${time}`;
}

function createCalendarEventHref(apt) {
  const start = createAppointmentDateTime(apt.date, apt.time);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const title = apt.title || "Randevu";
  const descriptionLines = [
    apt.doctor ? `Uzman: ${apt.doctor}` : "",
    apt.notes ? `Not: ${apt.notes}` : "",
    getConfirmationInfo(apt).message
  ].filter(Boolean);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Takip Paneli//Appointments//TR",
    "BEGIN:VEVENT",
    `UID:${apt.id || Date.now()}@takip-paneli`,
    `DTSTAMP:${formatIcsDate(new Date(), true)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    apt.location ? `LOCATION:${escapeIcsText(apt.location)}` : "",
    descriptionLines.length ? `DESCRIPTION:${escapeIcsText(descriptionLines.join("\\n"))}` : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function createAppointmentDateTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0);
}

function formatIcsDate(date, utc = false) {
  const source = utc ? new Date(date.getTime()) : date;
  const year = utc ? source.getUTCFullYear() : source.getFullYear();
  const month = utc ? source.getUTCMonth() + 1 : source.getMonth() + 1;
  const day = utc ? source.getUTCDate() : source.getDate();
  const hour = utc ? source.getUTCHours() : source.getHours();
  const minute = utc ? source.getUTCMinutes() : source.getMinutes();
  const second = utc ? source.getUTCSeconds() : source.getSeconds();
  const value = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}${String(second).padStart(2, "0")}`;
  return utc ? `${value}Z` : value;
}

function escapeIcsText(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function safeFileSlug(str) {
  return String(str)
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "randevu";
}

function isAppleMobileDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function renderTodaySummary() {
  const todaySummaryEl = document.getElementById("today-summary");
  if (!todaySummaryEl) return;

  const today = new Date();
  const weekday = capitalizeTurkish(today.toLocaleString("tr-TR", { weekday: "long" }));
  const day = today.getDate();
  const month = today.toLocaleString("tr-TR", { month: "long" });
  const year = today.getFullYear();

  todaySummaryEl.textContent = `Bugün: ${weekday}, ${day} ${month} ${year}`;
}

function getRelativeDayInfo(date, today) {
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { label: "Bugün", badgeClass: "badge-today" };
  }
  if (diffDays === 1) {
    return { label: "Yarın", badgeClass: "badge-tomorrow" };
  }
  if (diffDays > 1 && diffDays <= 7) {
    return { label: `${diffDays} gün sonra`, badgeClass: "" };
  }
  return { label: "", badgeClass: "" };
}

function startAppointmentCountdowns() {
  stopAppointmentCountdowns();

  updateAppointmentCountdowns();
  appointmentCountdownTimer = setInterval(updateAppointmentCountdowns, 1000);
}

function stopAppointmentCountdowns() {
  if (!appointmentCountdownTimer) return;
  clearInterval(appointmentCountdownTimer);
  appointmentCountdownTimer = null;
}

function updateAppointmentCountdowns() {
  let shouldRefreshDashboard = false;

  document.querySelectorAll("[data-countdown-target]").forEach(el => {
    const target = new Date(el.getAttribute("data-countdown-target"));
    if (Number.isNaN(target.getTime())) return;

    const now = new Date();
    if (!isAppointmentVisibleOnDashboard(target, now)) {
      shouldRefreshDashboard = true;
      return;
    }

    el.textContent = formatAppointmentCountdown(target, now);
  });

  if (shouldRefreshDashboard) {
    renderDashboardView();
  }
}

function formatAppointmentCountdown(target, now) {
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "Randevu zamanı geldi";
  }

  const totalMinutes = Math.ceil(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days} gün`);
  if (hours > 0) parts.push(`${hours} saat`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} dk`);

  return `${parts.join(" ")} kaldı`;
}

function capitalizeTurkish(str) {
  if (!str) return "";
  return str.charAt(0).toLocaleUpperCase("tr-TR") + str.slice(1);
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
