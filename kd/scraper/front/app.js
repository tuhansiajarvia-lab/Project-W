// Глобальное состояние приложения
const state = {
  products: [],
  categories: [],
  selectedCategory: 'all',
  searchQuery: '',
  currentLang: 'fi'
};

// Элементы DOM
const productGrid = document.getElementById('product-grid');
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await fetchCategories();
  await fetchProducts();
  setupEventListeners();
}

// Загрузка категорий с сервера
async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    
    if (data.success) {
      state.categories = data.categories;
      renderCategoryDropdown();
    }
  } catch (err) {
    console.error('Ошибка загрузки категорий:', err);
  }
}

// Загрузка товаров с сервера с учетом поиска и категорий
async function fetchProducts() {
  try {
    const params = new URLSearchParams();
    if (state.searchQuery) params.append('search', state.searchQuery);
    if (state.selectedCategory !== 'all') params.append('category', state.selectedCategory);

    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      state.products = data.data;
      renderProducts();
    }
  } catch (err) {
    console.error('Ошибка загрузки товаров:', err);
    if (productGrid) {
      productGrid.innerHTML = `<p class="error">Не удалось загрузить товары.</p>`;
    }
  }
}

// Отрисовка списка категорий в <select>
function renderCategoryDropdown() {
  if (!categoryFilter) return;

  const defaultOption = `<option value="all">Все категории / каталоги</option>`;
  const options = state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  
  categoryFilter.innerHTML = defaultOption + options;
}

// Отрисовка карточек товаров в сетке
function renderProducts() {
  if (!productGrid) return;

  if (state.products.length === 0) {
    productGrid.innerHTML = `<div class="no-results">Товары не найдены</div>`;
    return;
  }

  productGrid.innerHTML = state.products.map(product => {
    // Формируем плашку скидки или типа акции
    let badgeHtml = '';
    if (product.discount_percent) {
      badgeHtml = `<span class="badge discount">-${product.discount_percent}%</span>`;
    } else if (product.offer_type) {
      badgeHtml = `<span class="badge offer">${product.offer_type}</span>`;
    }

    // Формируем отображение старой цены
    const oldPriceHtml = product.original_price && product.original_price > 0 
      ? `<span class="old-price">${product.original_price.toFixed(2)} €</span>` 
      : '';

    return `
      <div class="product-card">
        <div class="card-header">
          <span class="store-tag">${product.store ? product.store.toUpperCase() : 'STORE'}</span>
          ${badgeHtml}
        </div>
        <div class="card-body">
          <h3 class="product-title">${escapeHtml(product.name || 'Без названия')}</h3>
          <p class="catalog-info">Каталог: ${escapeHtml(product.catalog_folder)} (Стр. ${product.page || 1})</p>
        </div>
        <div class="card-footer">
          <div class="price-container">
            ${oldPriceHtml}
            <span class="current-price">${product.price ? product.price.toFixed(2) : 'N/A'} €</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Настройка обработчиков событий (поиск, фильтр)
function setupEventListeners() {
  // Живой поиск с задержкой (Debounce)
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.searchQuery = e.target.value.trim();
        fetchProducts();
      }, 300);
    });
  }

  // Фильтр по категориям
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      state.selectedCategory = e.target.value;
      fetchProducts();
    });
  }
}

// Вспомогательная функция для защиты от XSS
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};
