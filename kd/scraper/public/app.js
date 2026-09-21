let currentLang = 'fi';
let currentCategory = 'all';
let searchQuery = '';

const i18n = {
  fi: { searchPlaceholder: 'Etsi tuotetta...', allCategories: 'Kaikki kategoriat', noResults: 'Tuotteita ei löytynyt' },
  en: { searchPlaceholder: 'Search product...', allCategories: 'All Categories', noResults: 'No products found' },
  ru: { searchPlaceholder: 'Поиск товара...', allCategories: 'Все категории', noResults: 'Товары не найдены' }
};

async function loadCategories() {
  try {
    const res = await fetch(`/api/categories?lang=${currentLang}`);
    const data = await res.json();

    const select = document.getElementById('categorySelect');
    select.innerHTML = `<option value="all">${i18n[currentLang].allCategories}</option>`;

    if (data.success) {
      data.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        if (cat === currentCategory) option.selected = true;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Ошибка загрузки категорий:', err);
  }
}

async function loadProducts() {
  try {
    const res = await fetch(`/api/products?lang=${currentLang}&category=${encodeURIComponent(currentCategory)}&search=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();

    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';

    if (!data.success || data.data.length === 0) {
      grid.innerHTML = `<div class="no-results">${i18n[currentLang].noResults}</div>`;
      return;
    }

    data.data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'product-card';

      const discountBadge = item.discount_percent 
        ? `<div class="badge">${item.discount_percent}</div>` 
        : '';

      const oldPrice = item.original_price 
        ? `<span class="old-price">${item.original_price.toFixed(2)} €</span>` 
        : '';

      card.innerHTML = `
        ${discountBadge}
        <div>
          <div class="category-tag">${item.category || ''}</div>
          <div class="product-title">${item.name || 'Nimetön tuote'}</div>
        </div>
        <div>
          <div class="price-container">
            <span class="price">${item.price ? item.price.toFixed(2) : '—'} €</span>
            ${oldPrice}
          </div>
          <div class="unit">${item.unit || ''}</div>
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Ошибка загрузки продуктов:', err);
  }
}

function setLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('.lang-picker button').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`lang-${lang}`).classList.add('active');

  document.getElementById('searchInput').placeholder = i18n[lang].searchPlaceholder;

  currentCategory = 'all';
  loadCategories();
  loadProducts();
}

function handleSearch() {
  searchQuery = document.getElementById('searchInput').value;
  loadProducts();
}

function handleCategoryChange() {
  currentCategory = document.getElementById('categorySelect').value;
  loadProducts();
}

// Инициализация при старте
loadCategories();
loadProducts();