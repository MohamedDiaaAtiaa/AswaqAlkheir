(() => {
// Configuration
const supabaseUrl = 'https://ezcfulijxtfglpfarxtl.supabase.co';
// Using anon key for customer app
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6Y2Z1bGlqeHRmZ2xwZmFyeHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MDkwNzYsImV4cCI6MjA5MTk4NTA3Nn0.6mRjNCZIlE5Y9LOYwCXxVXczqflL3YiF6QxbvcszTJ0';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// State
const state = {
  user: null,
  profile: null,
  products: [],
  categories: [],
  banners: [],
  cart: [],
  allBranches: [],
  branch: null,
  lang: localStorage.getItem('aswaq_lang') || 'ar',
  activeTab: 'home'
};

// UI Elements
const els = {
  app: document.getElementById('app'),
  splash: document.getElementById('splash-screen'),
  androidBanner: document.getElementById('android-banner'),
  closeAndroidBanner: document.getElementById('close-android-banner'),
  main: document.getElementById('main-content'),
  tabBar: document.getElementById('tab-bar'),
  cartBadge: document.getElementById('cart-badge'),
  toast: document.getElementById('toast-container'),
  modal: document.getElementById('modal-overlay')
};

// Android Detection
const isAndroid = /Android/i.test(navigator.userAgent);
if (isAndroid && !sessionStorage.getItem('hideAndroidBanner')) {
  els.androidBanner.classList.remove('hidden');
}
els.closeAndroidBanner.addEventListener('click', () => {
  els.androidBanner.classList.add('hidden');
  sessionStorage.setItem('hideAndroidBanner', 'true');
});

// Initialization
async function init() {
  setLang(state.lang);
  
  // Force hide splash screen after 2 seconds maximum (ensure ultra-fast 1-2s load)
  const fallbackTimeout = setTimeout(() => {
    hideSplashAndRender();
  }, 2000);

  try {
    await checkSession();
    await loadAppData();
  } catch (err) {
    console.error('Initialization error:', err);
  } finally {
    clearTimeout(fallbackTimeout);
    hideSplashAndRender();
  }

  setupTabs();
}

function hideSplashAndRender() {
  if (els.splash.classList.contains('hidden')) return;
  els.splash.classList.add('hidden');
  els.app.classList.remove('hidden');
  renderTab(state.activeTab);
}

async function checkSession() {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (session?.user) {
      state.user = session.user;
      const { data } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      state.profile = data;
    }
  } catch (err) {
    console.warn('Session check failed:', err.message);
  }
}

// Haversine formula
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function loadAppData() {
  try {
    // Load branches
    const { data: branches } = await supabaseClient.from('branches').select('*').eq('is_active', true);
    state.allBranches = branches || [];
    let allBranches = state.allBranches;
    
    if (allBranches.length > 0) {
      let selected = allBranches.find(b => b.is_default) || allBranches[0];
      
      // Try to get GPS location within 1 second for fast loading
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 1000, maximumAge: 60000 });
        });
        
        if (pos && pos.coords) {
          const userLat = pos.coords.latitude;
          const userLon = pos.coords.longitude;
          
          let minDist = Infinity;
          for (const b of allBranches) {
            if (b.latitude && b.longitude) {
              const d = getDistanceKm(userLat, userLon, b.latitude, b.longitude);
              if (d < minDist) {
                minDist = d;
                selected = b;
              }
            }
          }
        }
      } catch (geoErr) {
        console.warn('Geolocation failed or denied, using default branch.', geoErr);
      }
      
      state.branch = selected;
    }

    // Load products for branch
    let prodQuery = supabaseClient.from('products').select('*').eq('is_active', true);
    if (state.branch?.id) {
      prodQuery = prodQuery.eq('branch_id', state.branch.id);
    } else {
      prodQuery = prodQuery.is('branch_id', null);
    }
    const { data: products } = await prodQuery;
    state.products = products || [];

    // Load settings
    const { data: settings } = await supabaseClient.from('app_settings').select('key, value').in('key', ['banners', 'categories']);
    if (settings) {
      const b = settings.find(s => s.key === 'banners');
      const c = settings.find(s => s.key === 'categories');
      if (b) state.banners = b.value || [];
      if (c) state.categories = c.value || [];
    }
  } catch (err) {
    console.error('Failed to load app data:', err.message);
  }
}

// Routing & Tabs
function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      const activeTabId = tab.dataset.tab;
      document.querySelectorAll(`.tab-item[data-tab="${activeTabId}"]`).forEach(t => t.classList.add('active'));
      state.activeTab = activeTabId;
      renderTab(state.activeTab);
    });
  });
}

function renderTab(tabId) {
  window.scrollTo(0, 0);
  switch(tabId) {
    case 'home': renderHome(); break;
    case 'shop': renderShop(); break;
    case 'cart': renderCart(); break;
    case 'account': renderAccount(); break;
  }
}

// Translations
const translations = {
  en: {
    home: 'Home', shop: 'Shop', cart: 'Cart', account: 'Account',
    search: 'Search products...', addToCart: '+ Add',
    from: 'From', emptyCart: 'Your cart is empty',
    total: 'Total', checkout: 'Checkout',
    login: 'Log In', signup: 'Sign Up', logout: 'Log Out',
    welcome: 'Welcome back!', guest: 'Continue as Guest'
  },
  ar: {
    home: 'الرئيسية', shop: 'المتجر', cart: 'السلة', account: 'حسابي',
    search: 'ابحث عن المنتجات...', addToCart: '+ أضف',
    from: 'يبدأ من', emptyCart: 'سلة التسوق فارغة',
    total: 'المجموع', checkout: 'الدفع',
    login: 'تسجيل الدخول', signup: 'إنشاء حساب', logout: 'تسجيل الخروج',
    welcome: 'أهلاً بك!', guest: 'المتابعة كزائر'
  }
};
function t(key) { return translations[state.lang][key] || key; }

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('aswaq_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

// Render Home
function renderHome() {
  const branchName = state.lang === 'ar' ? state.branch?.name : (state.branch?.name_en || state.branch?.name);
  
  const h = new Date().getHours();
  let greeting = h < 12 ? (state.lang === 'ar' ? 'صباح الخير' : 'Good Morning') : h < 18 ? (state.lang === 'ar' ? 'مساء الخير' : 'Good Afternoon') : (state.lang === 'ar' ? 'مساء الخير' : 'Good Evening');
  
  els.main.innerHTML = `
    <div class="page active">
      <div class="home-topbar" style="background: var(--primary); padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; color: white;">
        <div style="display: flex; flex-direction: column;">
          <span style="font-size: 13px; font-weight: 500; color: var(--primary-light);">${greeting} 👋</span>
          <span style="font-size: 24px; font-weight: 800;">أسواق الخير</span>
        </div>
        <div class="location-pill" onclick="openBranchSelector()" style="background: rgba(255,255,255,0.2); border-radius: 20px; padding: 6px 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
          <span style="font-size: 12px; font-weight: 700;">📍 ${branchName || '...'}</span>
          <span style="font-size: 10px; color: rgba(255,255,255,0.7);">▼</span>
        </div>
      </div>
      
      <div class="search-bar-fake" onclick="document.querySelector('[data-tab=shop]').click()" style="margin: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; gap: 8px; align-items: center; cursor: pointer;">
        <span>🔍</span>
        <span style="color: var(--muted); font-size: 14px;">${t('search')}</span>
      </div>
      
      ${renderBanners()}
      
      <div class="section-title">
        <span>${state.lang === 'ar' ? 'التسوق حسب الفئة' : 'Shop by Category'}</span>
        <span class="see-all" onclick="document.querySelector('[data-tab=shop]').click()">
          ${state.lang === 'ar' ? 'عرض الكل' : 'See All'}
        </span>
      </div>
      
      ${renderCategories()}
      
      <div class="section-title">
        <span>⭐ ${state.lang === 'ar' ? 'المنتجات المميزة' : 'Featured Products'}</span>
        <span class="see-all" onclick="document.querySelector('[data-tab=shop]').click()">
          ${state.lang === 'ar' ? 'عرض الكل' : 'See All'}
        </span>
      </div>
      
      <div class="product-grid">
        ${state.products.slice(0, getHomeProductCount()).map(p => renderProductCard(p)).join('')}
      </div>
    </div>
  `;
}

function renderCategories() {
  if (!state.categories.length) return '';
  return `
    <div class="cat-carousel">
      ${state.categories.map(c => `
        <div class="cat-card" onclick="openCategory('${c.id}')">
          <div class="cat-emoji">${c.emoji || '📦'}</div>
          <div class="cat-overlay"></div>
          <div class="cat-name">${state.lang === 'ar' ? (c.label_ar || c.label || c.id) : (c.label_en || c.label || c.id)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

window.openCategory = (catId) => {
  state.shopFilter = catId;
  document.querySelector('[data-tab=shop]').click();
};

function renderBanners() {
  if (!state.banners.length) return '';
  return `
    <div class="banner-container">
      ${state.banners.map(b => `
        <div class="banner" style="background-color: ${b.color || 'var(--primary)'}">
          <div class="banner-content">
            <div class="banner-title">${b.title}</div>
            <div class="banner-sub">${b.subtitle || ''}</div>
            <div class="banner-btn" onclick="document.querySelector('[data-tab=shop]').click()">${b.cta || 'Shop Now'}</div>
          </div>
          <div class="banner-emoji">${b.emoji || '🎁'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderProductCard(product) {
  const sizes = product.sizes || [];
  if (!sizes.length) return '';
  const lowestSize = sizes.reduce((min, s) => s.price < min.price ? s : min, sizes[0]);
  
  const hasDiscount = lowestSize.old_price && lowestSize.old_price > lowestSize.price;
  const discountPercent = hasDiscount ? Math.round(((lowestSize.old_price - lowestSize.price) / lowestSize.old_price) * 100) : 0;
  
  return `
    <div class="product-card" onclick="openProductDetail('${product.id}')">
      ${hasDiscount ? `<div class="product-badge">-${discountPercent}%</div>` : ''}
      <div class="product-img-wrap">
        ${product.image_url ? `<img src="${product.image_url}" class="product-img">` : `<div class="product-emoji">${product.emoji}</div>`}
      </div>
      <div class="product-name">${product.name}</div>
      <div class="product-price-row">
        <div>
          <div class="product-old-price">${hasDiscount ? 'EGP ' + lowestSize.old_price : ''}</div>
          <div class="product-price">EGP ${lowestSize.price}</div>
        </div>
        <button class="product-add" onclick="event.stopPropagation(); addToCart('${product.id}', '${lowestSize.label}')">+</button>
      </div>
    </div>
  `;
}

// Render Shop
function renderShop() {
  const catsHtml = `
    <div class="filter-tabs">
      <div class="filter-tab ${!state.shopFilter ? 'active' : ''}" onclick="filterByCategory('')">
        ${state.lang === 'ar' ? 'الكل' : 'All'}
      </div>
      ${state.categories.map(c => `
        <div class="filter-tab ${state.shopFilter === c.id ? 'active' : ''}" onclick="filterByCategory('${c.id}')">
          ${c.emoji} ${state.lang === 'ar' ? (c.label_ar || c.label || c.id) : (c.label_en || c.label || c.id)}
        </div>
      `).join('')}
    </div>
  `;

  let filtered = state.products;
  if (state.shopFilter) {
    filtered = filtered.filter(p => p.category === state.shopFilter);
  }

  els.main.innerHTML = `
    <div class="page active">
      <div class="search-container">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" placeholder="${t('search')}" onkeyup="filterShop(this.value)">
      </div>
      ${catsHtml}
      <div class="product-grid" id="shop-grid" style="margin-top: 16px;">
        ${filtered.map(p => renderProductCard(p)).join('')}
      </div>
    </div>
  `;
}

window.filterByCategory = (catId) => {
  state.shopFilter = catId;
  renderShop();
};

window.filterShop = (query) => {
  const q = query.toLowerCase();
  let filtered = state.products;
  if (state.shopFilter) filtered = filtered.filter(p => p.category === state.shopFilter);
  filtered = filtered.filter(p => {
    const nAr = (p.name_ar || p.name || '').toLowerCase();
    const nEn = (p.name_en || '').toLowerCase();
    return nAr.includes(q) || nEn.includes(q);
  });
  document.getElementById('shop-grid').innerHTML = filtered.map(p => renderProductCard(p)).join('');
};

// Cart Logic
window.addToCart = (productId, sizeLabel) => {
  const product = state.products.find(p => p.id === productId);
  const size = product.sizes.find(s => s.label === sizeLabel);
  const cartItemId = productId + '--' + sizeLabel;
  
  const existing = state.cart.find(i => i.cartItemId === cartItemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      cartItemId, productId,
      name: product.name, emoji: product.emoji, image_url: product.image_url,
      size: sizeLabel, price: size.price, quantity: 1
    });
  }
  updateCartBadge();
  showToast(state.lang === 'ar' ? 'تمت الإضافة للسلة' : 'Added to cart', 'success');
};

window.updateCartQty = (cartItemId, delta) => {
  const item = state.cart.find(i => i.cartItemId === cartItemId);
  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) {
      state.cart = state.cart.filter(i => i.cartItemId !== cartItemId);
    }
  }
  updateCartBadge();
  if (state.activeTab === 'cart') renderCart();
};

function updateCartBadge() {
  const count = state.cart.reduce((s, i) => s + i.quantity, 0);
  const sidebarBadge = document.getElementById('cart-badge-sidebar');
  if (count > 0) {
    els.cartBadge.textContent = count;
    els.cartBadge.classList.remove('hidden');
    if (sidebarBadge) { sidebarBadge.textContent = count; sidebarBadge.classList.remove('hidden'); }
  } else {
    els.cartBadge.classList.add('hidden');
    if (sidebarBadge) { sidebarBadge.classList.add('hidden'); }
  }
}

function renderCart() {
  if (state.cart.length === 0) {
    els.main.innerHTML = `
      <div class="page active cart-empty">
        <div class="cart-empty-emoji">🛒</div>
        <h3>${t('emptyCart')}</h3>
        <button class="btn btn-primary" style="margin-top: 24px; width: auto;" onclick="document.querySelector('[data-tab=shop]').click()">${t('shop')}</button>
      </div>
    `;
    return;
  }
  
  const subtotal = state.cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const delivery = 20; // Default
  const total = subtotal + delivery;
  
  els.main.innerHTML = `
    <div class="page active" style="padding-bottom: 24px;">
      <div class="header">
        <div class="header-title">${t('cart')}</div>
      </div>
      
      <div class="cart-items">
        ${state.cart.map(i => `
          <div class="cart-item">
            <div class="cart-item-img">${i.image_url ? `<img src="${i.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : (i.emoji || '📦')}</div>
            <div class="cart-item-info">
              <div class="cart-item-name">${i.name}</div>
              <div class="cart-item-size">${i.size}</div>
              <div class="cart-item-price">EGP ${(i.price * i.quantity).toFixed(2)}</div>
            </div>
            <div class="cart-qty-ctrl">
              <button class="qty-btn" onclick="updateCartQty('${i.cartItemId}', -1)">-</button>
              <span class="qty-val">${i.quantity}</span>
              <button class="qty-btn" onclick="updateCartQty('${i.cartItemId}', 1)">+</button>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="coupon-box">
        <div class="input-wrapper coupon-input">
          <input type="text" id="coupon-code" class="input-field" placeholder="${state.lang === 'ar' ? 'كود الخصم' : 'Coupon Code'}">
        </div>
        <button class="coupon-btn" onclick="applyCoupon()">${state.lang === 'ar' ? 'تطبيق' : 'Apply'}</button>
      </div>
      
      <div class="cart-summary">
        <div class="summary-row">
          <span>${state.lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span>EGP ${subtotal.toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <span>${state.lang === 'ar' ? 'رسوم التوصيل' : 'Delivery Fee'}</span>
          <span>EGP ${delivery.toFixed(2)}</span>
        </div>
        <div class="summary-row summary-total">
          <span>${t('total')}</span>
          <span>EGP ${total.toFixed(2)}</span>
        </div>
      </div>
      
      <div style="padding: 0 20px;">
        <button class="btn btn-primary" onclick="proceedToCheckout()">${t('checkout')}</button>
      </div>
    </div>
  `;
}

window.applyCoupon = () => {
  showToast(state.lang === 'ar' ? 'نظام الكوبونات قيد التطوير' : 'Coupon system coming soon', 'error');
};

window.proceedToCheckout = () => {
  renderCheckout();
};

function getHomeProductCount() {
  return window.innerWidth >= 1200 ? 12 : window.innerWidth >= 768 ? 8 : 6;
}

function renderCheckout() {
  const subtotal = state.cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const delivery = 20;
  const total = subtotal + delivery;
  const saved = JSON.parse(localStorage.getItem('aswaq_checkout') || '{}');

  els.main.innerHTML = `
    <div class="page active" style="padding-bottom: 24px;">
      <div class="header">
        <button style="font-size:18px; color:var(--primary); font-weight:700;" onclick="renderCart()">${state.lang === 'ar' ? '→ رجوع' : '← Back'}</button>
        <div class="header-title">${t('checkout')}</div>
        <div></div>
      </div>

      <div style="padding: 20px;">
        <div style="font-size:15px; font-weight:800; margin-bottom:12px;">${state.lang === 'ar' ? '📋 معلومات التوصيل' : '📋 Delivery Info'}</div>
        <div class="input-group"><label class="input-label">${state.lang === 'ar' ? 'الاسم الكامل' : 'Full Name'} *</label><div class="input-wrapper"><input type="text" id="co-name" class="input-field" value="${saved.name || ''}" placeholder="${state.lang === 'ar' ? 'محمد أحمد' : 'John Doe'}"></div></div>
        <div class="input-group"><label class="input-label">${state.lang === 'ar' ? 'رقم الهاتف' : 'Phone'} *</label><div class="input-wrapper"><input type="tel" id="co-phone" class="input-field" value="${saved.phone || ''}" placeholder="01xxxxxxxxx"></div></div>
        <div class="input-group"><label class="input-label">${state.lang === 'ar' ? 'العنوان' : 'Address'} *</label><div class="input-wrapper"><input type="text" id="co-address" class="input-field" value="${saved.address || ''}" placeholder="${state.lang === 'ar' ? 'الشارع والمنطقة' : 'Street, Area'}"></div></div>
        <div style="display:flex; gap:12px;"><div class="input-group" style="flex:1;"><label class="input-label">${state.lang === 'ar' ? 'المدينة' : 'City'} *</label><div class="input-wrapper"><input type="text" id="co-city" class="input-field" value="${saved.city || ''}"></div></div></div>

        <div style="font-size:15px; font-weight:800; margin: 20px 0 12px;">${state.lang === 'ar' ? '💳 طريقة الدفع' : '💳 Payment Method'}</div>
        <div id="pay-methods">
          <div class="modal-option active" onclick="selectPayment('cod')" id="pay-cod" style="border-radius:12px; margin-bottom:8px; border:1.5px solid var(--primary); background:var(--primary-light);">
            💵 ${state.lang === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery'}
          </div>
          <div class="modal-option" onclick="selectPayment('instapay')" id="pay-instapay" style="border-radius:12px; margin-bottom:8px; border:1.5px solid var(--border);">
            ⚡ ${state.lang === 'ar' ? 'انستاباي' : 'InstaPay'}
          </div>
        </div>

        <div style="font-size:15px; font-weight:800; margin: 20px 0 12px;">${state.lang === 'ar' ? '📝 ملاحظات' : '📝 Notes'}</div>
        <div class="input-wrapper"><textarea id="co-notes" class="input-field" rows="3" style="resize:none;" placeholder="${state.lang === 'ar' ? 'أي ملاحظات...' : 'Any special notes...'}"></textarea></div>

        <div style="background:var(--warning-bg); padding:12px; border-radius:12px; margin-top:16px; font-size:13px; color:#b45309; font-weight:700;">⚠️ ${state.lang === 'ar' ? 'الأوزان تقريبية وقد يختلف السعر النهائي قليلاً' : 'Weights are approximate, final price may vary slightly'}</div>

        <div class="cart-summary" style="margin: 20px 0;">
          <div class="summary-row"><span>${state.lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span><span>EGP ${subtotal.toFixed(2)}</span></div>
          <div class="summary-row"><span>${state.lang === 'ar' ? 'التوصيل' : 'Delivery'}</span><span>EGP ${delivery.toFixed(2)}</span></div>
          <div class="summary-row summary-total"><span>${t('total')}</span><span>EGP ${total.toFixed(2)}</span></div>
        </div>

        <button class="btn btn-primary" onclick="placeOrder()">${state.lang === 'ar' ? 'تأكيد الطلب' : 'Place Order'}</button>
      </div>
    </div>
  `;
  state.paymentMethod = 'cod';
}

window.selectPayment = (method) => {
  state.paymentMethod = method;
  document.getElementById('pay-cod').style.border = method === 'cod' ? '1.5px solid var(--primary)' : '1.5px solid var(--border)';
  document.getElementById('pay-cod').style.background = method === 'cod' ? 'var(--primary-light)' : 'transparent';
  document.getElementById('pay-instapay').style.border = method === 'instapay' ? '1.5px solid var(--primary)' : '1.5px solid var(--border)';
  document.getElementById('pay-instapay').style.background = method === 'instapay' ? 'var(--primary-light)' : 'transparent';
};

window.placeOrder = async () => {
  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const city = document.getElementById('co-city').value.trim();
  const notes = document.getElementById('co-notes').value.trim();

  if (!name || !phone || !address || !city) {
    showToast(state.lang === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields', 'error');
    return;
  }

  localStorage.setItem('aswaq_checkout', JSON.stringify({ name, phone, address, city }));

  const orderId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const subtotal = state.cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const delivery = 20;

  try {
    const { error: orderErr } = await supabaseClient.from('orders').insert([{
      id: orderId,
      user_id: state.user?.id || null,
      customer_name: name,
      customer_phone: phone,
      customer_address: `${address}, ${city}`,
      payment_method: state.paymentMethod,
      notes: notes || null,
      branch_id: state.branch?.id || null,
      delivery_fee: delivery,
    }]);
    if (orderErr) throw orderErr;

    const items = state.cart.map(i => ({
      order_id: orderId,
      product_id: i.productId,
      product_name: `${i.name} (${i.size})`,
      price: i.price,
      quantity: i.quantity,
    }));
    const { error: itemsErr } = await supabaseClient.from('order_items').insert(items);
    if (itemsErr) throw itemsErr;

    state.cart = [];
    updateCartBadge();
    els.main.innerHTML = `
      <div class="page active" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; padding:40px;">
        <div style="font-size:80px; margin-bottom:16px;">🎉</div>
        <div style="font-size:24px; font-weight:800; margin-bottom:8px;">${state.lang === 'ar' ? 'تم الطلب بنجاح!' : 'Order Placed!'}</div>
        <div style="color:var(--muted); margin-bottom:8px;">${state.lang === 'ar' ? 'رقم الطلب' : 'Order ID'}: #${orderId.slice(0,8).toUpperCase()}</div>
        <div style="color:var(--muted); margin-bottom:24px;">${state.lang === 'ar' ? 'سنتواصل معك قريباً' : 'We will contact you soon'}</div>
        <button class="btn btn-primary" style="width:auto;" onclick="document.querySelector('[data-tab=home]').click()">${state.lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}</button>
      </div>
    `;
  } catch (e) {
    console.error(e);
    showToast(state.lang === 'ar' ? 'فشل إرسال الطلب' : 'Order failed: ' + e.message, 'error');
  }
};

// Auth / Account
function renderAccount() {
  els.main.innerHTML = `
    <div class="page active">
      <div class="header">
        <div class="header-title">${t('account')}</div>
      </div>
      <div class="account-card">
        <div class="account-avatar">👤</div>
        <div>
          <div style="font-size: 18px; font-weight: 800;">${t('welcome')}</div>
          <div style="font-size: 14px; color: var(--muted);">${t('guest')}</div>
        </div>
      </div>
      <div class="menu-list">
        <a href="#" class="menu-item">
          <span class="menu-icon">📦</span>
          <span class="menu-text">${state.lang === 'ar' ? 'طلباتي' : 'Order History'}</span>
          <span class="menu-arrow">›</span>
        </a>
        <a href="#" class="menu-item" onclick="setLang(state.lang === 'ar' ? 'en' : 'ar'); renderAccount(); return false;">
          <span class="menu-icon">🌐</span>
          <span class="menu-text">${state.lang === 'ar' ? 'تغيير اللغة' : 'Change Language'}</span>
          <span style="font-size: 12px; color: var(--muted);">${state.lang === 'en' ? 'English' : 'العربية'}</span>
        </a>
      </div>
    </div>
  `;
}

window.showToast = (msg, type = 'success') => {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span><span class="toast-text">${msg}</span>`;
  els.toast.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

window.openBranchSelector = () => {
  const branchesHtml = state.allBranches.map(b => `
    <div class="modal-option ${state.branch?.id === b.id ? 'active' : ''}" onclick="selectBranch('${b.id}')">
      <span style="margin-${state.lang === 'ar' ? 'left' : 'right'}: 8px;">📍</span> ${state.lang === 'ar' ? b.name : (b.name_en || b.name)}
    </div>
  `).join('');
  
  els.modal.innerHTML = `
    <div class="modal-content branch-modal">
      <div class="modal-header">
        <div class="modal-title">${state.lang === 'ar' ? 'اختر الفرع' : 'Choose Branch'}</div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding-bottom: 20px;">
        ${branchesHtml}
      </div>
    </div>
  `;
  els.modal.classList.remove('hidden');
};

window.selectBranch = async (id) => {
  state.branch = state.allBranches.find(b => b.id === id);
  closeModal();
  
  els.main.innerHTML = `<div style="text-align:center; padding: 40px;"><div class="spinner" style="border-width:3px; width:30px; height:30px; border-color:rgba(0,0,0,0.1); border-top-color:var(--primary);"></div></div>`;
  
  let prodQuery = supabaseClient.from('products').select('*').eq('is_active', true);
  if (state.branch?.id) {
    prodQuery = prodQuery.eq('branch_id', state.branch.id);
  } else {
    prodQuery = prodQuery.is('branch_id', null);
  }
  const { data: products } = await prodQuery;
  state.products = products || [];
  
  renderTab(state.activeTab);
};

window.closeModal = () => {
  els.modal.classList.add('hidden');
};

window.openProductDetail = (id) => {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  const sizes = product.sizes || [];
  if (!sizes.length) return;
  state.selectedSize = sizes[0].label;
  state.modalQty = 1;
  renderProductModal(product);
};

window.renderProductModal = (product) => {
  const sizes = product.sizes || [];
  const sel = sizes.find(s => s.label === state.selectedSize) || sizes[0];
  const hasDiscount = sel.old_price && sel.old_price > sel.price;
  const name = state.lang === 'ar' ? (product.name_ar || product.name) : (product.name_en || product.name);
  const desc = state.lang === 'ar' ? (product.description_ar || product.description || '') : (product.description_en || product.description || '');
  const qty = state.modalQty || 1;

  const sizesHtml = sizes.length > 1 ? `
    <div style="margin-top:16px;">
      <div style="font-size:13px; font-weight:700; color:var(--muted); margin-bottom:8px; text-transform:uppercase;">${state.lang === 'ar' ? 'اختر الحجم' : 'Choose Size'}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${sizes.map(s => {
          const active = state.selectedSize === s.label;
          const sDiscount = s.old_price && s.old_price > s.price;
          return `<div onclick="state.selectedSize='${s.label}'; renderProductModal(state.products.find(p=>p.id==='${product.id}'))"
            style="padding:10px 16px; border-radius:12px; border:1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}; background:${active ? 'var(--primary-light)' : 'var(--card)'}; cursor:pointer; transition:all 0.2s; text-align:center; min-width:80px;">
            <div style="font-weight:700; font-size:14px; color:${active ? 'var(--primary)' : 'var(--text)'}">${s.label}</div>
            <div style="font-size:12px; font-weight:800; color:${active ? 'var(--primary)' : 'var(--text)'}; margin-top:2px;">EGP ${s.price}</div>
            ${sDiscount ? `<div style="font-size:10px; text-decoration:line-through; color:var(--muted);">${s.old_price}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  ` : '';

  els.modal.innerHTML = `
    <div class="modal-content product-modal" style="padding:0; overflow:hidden;">
      <div style="position:relative; height:280px; background:var(--bg-hover); display:flex; align-items:center; justify-content:center;">
        ${product.image_url ? `<img src="${product.image_url}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="font-size:80px;">${product.emoji}</div>`}
        <button onclick="closeModal()" style="position:absolute; top:16px; right:16px; width:36px; height:36px; background:rgba(0,0,0,0.5); color:white; border-radius:50%; font-size:20px; display:flex; align-items:center; justify-content:center; border:none; cursor:pointer;">&times;</button>
        ${hasDiscount ? `<div style="position:absolute; top:16px; left:16px; background:var(--danger); color:white; padding:4px 10px; border-radius:8px; font-size:12px; font-weight:800;">-${Math.round(((sel.old_price - sel.price) / sel.old_price) * 100)}%</div>` : ''}
      </div>
      <div style="padding:24px;">
        <div style="font-size:22px; font-weight:800; margin-bottom:4px;">${name}</div>
        ${desc ? `<div style="color:var(--muted); font-size:14px; margin-bottom:16px; line-height:1.7;">${desc}</div>` : ''}
        <div style="display:flex; align-items:flex-end; gap:8px; margin-bottom:4px;">
          <span style="font-size:26px; font-weight:800; color:var(--primary);">EGP ${sel.price}</span>
          ${hasDiscount ? `<span style="font-size:14px; text-decoration:line-through; color:var(--muted); margin-bottom:4px;">EGP ${sel.old_price}</span>` : ''}
        </div>
        ${sizesHtml}
        <div style="display:flex; align-items:center; gap:16px; margin-top:20px;">
          <div style="display:flex; align-items:center; gap:12px; background:var(--bg-hover); border-radius:12px; padding:6px;">
            <button onclick="if(state.modalQty>1){state.modalQty--;renderProductModal(state.products.find(p=>p.id==='${product.id}'))}" style="width:36px;height:36px;background:white;border-radius:8px;font-weight:bold;font-size:18px;box-shadow:0 1px 2px rgba(0,0,0,0.05);cursor:pointer;">-</button>
            <span style="font-weight:800; font-size:16px; min-width:24px; text-align:center;">${qty}</span>
            <button onclick="state.modalQty++;renderProductModal(state.products.find(p=>p.id==='${product.id}'))" style="width:36px;height:36px;background:white;border-radius:8px;font-weight:bold;font-size:18px;box-shadow:0 1px 2px rgba(0,0,0,0.05);cursor:pointer;">+</button>
          </div>
          <button class="btn btn-primary" style="flex:1;" onclick="addToCartQty('${product.id}','${sel.label}',${qty}); closeModal();">
            ${t('addToCart')} · EGP ${(sel.price * qty).toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  `;
  els.modal.classList.remove('hidden');
};

window.addToCartQty = (productId, sizeLabel, qty) => {
  const product = state.products.find(p => p.id === productId);
  const size = product.sizes.find(s => s.label === sizeLabel);
  const cartItemId = productId + '--' + sizeLabel;
  const existing = state.cart.find(i => i.cartItemId === cartItemId);
  if (existing) {
    existing.quantity += qty;
  } else {
    state.cart.push({ cartItemId, productId, name: product.name, emoji: product.emoji, image_url: product.image_url, size: sizeLabel, price: size.price, quantity: qty });
  }
  updateCartBadge();
  showToast(state.lang === 'ar' ? 'تمت الإضافة للسلة' : 'Added to cart', 'success');
};

// Start
init();
})();
