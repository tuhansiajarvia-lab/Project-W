const DEMO_PRODUCTS = [
  {
    id: 1,
    name: "Omena Honey Crunch",
    brand: "Kotimainen",
    size: "1kg",
    price: 1.29,
    original_price: 2.19,
    discount_percent: 41,
    store: "lidl",
    category: "kasvikset",
    valid_until: "Su 8.11.",
    is_club: false,
    image: "Näyttökuva 2026-11-05 180956.png" // Ссылка на вашу иконку яблока
  },
  {
    id: 2,
    name: "Paulig Juhla Mokka kahvi kahvipapu",
    brand: "Paulig",
    size: "500g (7.98 €/kg)",
    price: 3.99,
    original_price: 6.29,
    discount_percent: 36,
    store: "k-market",
    category: "juomat",
    valid_until: "To 5.11.",
    is_club: true,
    image: "Näyttökuva 2026-11-05 180607.png" // Иконка кофе
  },
  {
    id: 3,
    name: "Coop Ruodoton lohifilee pakaste",
    brand: "Coop",
    size: "n. 1kg (9.90 €/kg)",
    price: 9.90,
    original_price: 14.90,
    discount_percent: 33,
    store: "s-market",
    category: "liha",
    valid_until: "La 7.11.",
    is_club: false,
    image: "Näyttökuva 2026-11-05 180636.png" // Иконка лосося
  },
  {
    id: 4,
    name: "Atria Nauta-Viljapossu Jauheliha",
    brand: "Atria",
    size: "250g (13.96 €/kg)",
    price: 3.49,
    original_price: 4.99,
    discount_percent: 30,
    store: "lidl",
    category: "liha",
    valid_until: "Su 8.11.",
    is_club: false,
    image: "Näyttökuva 2026-11-05 181409.png" // Иконка фарша
  },
  {
    id: 5,
    name: "Arla kermajuusto 17%",
    brand: "Arla",
    size: "1 kg",
    price: 5.99,
    original_price: 7.89,
    discount_percent: 24,
    store: "s-market",
    category: "maito",
    valid_until: "Pe 6.11.",
    is_club: true,
    image: "Näyttökuva 2026-11-05 182838.png" // Иконка сыра
  },
  {
    id: 6,
    name: "Kotimaista rasvaton maito",
    brand: "Kotimaista",
    size: "1l",
    price: 1.79,
    original_price: 2.29,
    discount_percent: 21,
    store: "k-market",
    category: "maito",
    valid_until: "Su 8.11.",
    is_club: false,
    image: "Näyttökuva 2026-11-05 180656.png" // Иконка молока
  }
];

// Состояние UI
const state = {
  products: DEMO_PRODUCTS,
  searchQuery: '',
  selectedCategory: 'all',
  selectedStores: ['lidl', 'k-market', 's-market'],
  clubOnly: false,
  highDiscountOnly: false,
  sortBy: 'discount'
};

// DOM Элементы
const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const resultsCount = document.getElementById('resultsCount');
const emptyState = document.getElementById('emptyState');
const sortSelect = document.getElementById('sortSelect');

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  renderSkeletons();
  setTimeout(() => {
    applyFilters();
  }, 400);

  setupEventListeners();
}

// Отображение скелетонов при загрузке
function renderSkeletons() {
  productGrid.innerHTML = Array(6).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-box" style="height: 120px;"></div>
      <div class="skeleton-box" style="height: 20px; width: 80%;"></div>
      <div class="skeleton-box" style="height: 16px; width: 50%;"></div>
      <div class="skeleton-box" style="height: 30px; width: 40%; margin-top: auto;"></div>
    </div>
  `).join('');
}

// Фильтрация и сортировка
function applyFilters() {
  let filtered = state.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
                          p.brand.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesCat = state.selectedCategory === 'all' || p.category === state.selectedCategory;
    const matchesStore = state.selectedStores.includes(p.store);
    const matchesClub = !state.clubOnly || p.is_club;
    const matchesHighDiscount = !state.highDiscountOnly || p.discount_percent >= 30;

    return matchesSearch && matchesCat && matchesStore && matchesClub && matchesHighDiscount;
  });

  filtered.sort((a, b) => {
    if (state.sortBy === 'discount') return b.discount_percent - a.discount_percent;
    if (state.sortBy === 'price-asc') return a.price - b.price;
    if (state.sortBy === 'price-desc') return b.price - a.price;
    if (state.sortBy === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  renderProducts(filtered);
}

// Рендеринг карточек точно по вашему образцу
function renderProducts(items) {
  resultsCount.textContent = `${items.length} tuotetta löytynyt`;

  if (items.length === 0) {
    productGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  productGrid.innerHTML = items.map(p => {
    return `
      <div class="product-card">
        <div>
          <div class="card-top">
            <span class="store-badge ${p.store}">${p.store}</span>
            <span class="discount-tag">-${p.discount_percent}%</span>
          </div>

          <div class="product-img-wrapper">
            <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/150?text=Ei+kuvaa'">
          </div>

          <h3 class="product-title">${escapeHtml(p.name)}</h3>
          <p class="product-size">${escapeHtml(p.brand)} • ${escapeHtml(p.size)}</p>
        </div>

        <div>
          <div class="price-box">
            <span class="current-price">${p.price.toFixed(2)} €</span>
            <span class="old-price">${p.original_price.toFixed(2)} €</span>
          </div>

          <div class="card-footer">
            <span>Voimassa: ${p.valid_until}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Слушатели событий
function setupEventListeners() {
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    applyFilters();
  });

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      state.selectedCategory = e.target.dataset.cat;
      applyFilters();
    });
  });

  document.querySelectorAll('.filter-store').forEach(cb => {
    cb.addEventListener('change', () => {
      state.selectedStores = Array.from(document.querySelectorAll('.filter-store:checked')).map(c => c.value);
      applyFilters();
    });
  });

  document.getElementById('filterClub').addEventListener('change', (e) => {
    state.clubOnly = e.target.checked;
    applyFilters();
  });

  document.getElementById('filterHighDiscount').addEventListener('change', (e) => {
    state.highDiscountOnly = e.target.checked;
    applyFilters();
  });

  sortSelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    applyFilters();
  });

  document.getElementById('resetSearchBtn').addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    applyFilters();
  });

  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    document.querySelectorAll('.filter-store').forEach(c => c.checked = true);
    document.getElementById('filterClub').checked = false;
    document.getElementById('filterHighDiscount').checked = false;
    state.selectedStores = ['lidl', 'k-market', 's-market'];
    state.clubOnly = false;
    state.highDiscountOnly = false;
    applyFilters();
  });

  document.getElementById('toggleMobileFilters').addEventListener('click', () => {
    document.getElementById('filtersSidebar').classList.toggle('open');
  });

  const modal = document.getElementById('authModal');
  document.getElementById('openAuthModal').addEventListener('click', () => modal.classList.add('open'));
  document.getElementById('closeAuthModal').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(e.target.dataset.target).classList.add('active');
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}