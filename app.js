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

    // Load banners safely
    const { data: appSettings } = await supabaseClient.from('app_settings').select('value').eq('key', 'banners').maybeSingle();
    if (appSettings) state.banners = appSettings.value || [];
  } catch (err) {
    console.error('Failed to load app data:', err.message);
  }
}

// Routing & Tabs
function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.tab;
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
  
  els.main.innerHTML = `
    <div class="page active">
      <div class="home-header">
        <div class="branch-selector" onclick="openBranchSelector()">
          <span class="branch-icon">📍</span>
          <div class="branch-info">
            <span class="branch-label">${state.lang === 'ar' ? 'التوصيل من' : 'Delivering from'}</span>
            <span class="branch-name">${branchName || '...'}</span>
          </div>
          <span style="font-size: 10px; color: var(--muted); margin-left: 4px; margin-right: 4px;">▼</span>
        </div>
      </div>
      
      ${renderBanners()}
      
      <div class="section-title">
        <span>${state.lang === 'ar' ? 'المنتجات المميزة' : 'Featured Products'}</span>
        <span class="see-all" onclick="document.querySelector('[data-tab=shop]').click()">
          ${state.lang === 'ar' ? 'عرض الكل' : 'See All'}
        </span>
      </div>
      
      <div class="product-grid">
        ${state.products.slice(0, 4).map(p => renderProductCard(p)).join('')}
      </div>
    </div>
  `;
}

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
  els.main.innerHTML = `
    <div class="page active">
      <div class="search-container">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" placeholder="${t('search')}" onkeyup="filterShop(this.value)">
      </div>
      <div class="product-grid" id="shop-grid" style="margin-top: 16px;">
        ${state.products.map(p => renderProductCard(p)).join('')}
      </div>
    </div>
  `;
}

window.filterShop = (query) => {
  const q = query.toLowerCase();
  const filtered = state.products.filter(p => p.name.toLowerCase().includes(q) || (p.categories?.name || '').toLowerCase().includes(q));
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
      name: product.name, emoji: product.emoji,
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
  if (count > 0) {
    els.cartBadge.textContent = count;
    els.cartBadge.classList.remove('hidden');
  } else {
    els.cartBadge.classList.add('hidden');
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
            <div class="cart-item-img">${i.emoji || '📦'}</div>
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
  if (!state.user) {
    showToast(state.lang === 'ar' ? 'يرجى تسجيل الدخول أولاً' : 'Please log in to checkout', 'warning');
    renderAccount();
    return;
  }
  showToast(state.lang === 'ar' ? 'جاري التحويل للدفع...' : 'Proceeding to checkout...', 'success');
  // Complete checkout implementation would go here
};

// Render Account
function renderAccount() {
  if (!state.user) {
    els.main.innerHTML = `
      <div class="page active auth-container">
        <div class="auth-hero">
          <div class="auth-logo">🛒</div>
          <div class="auth-title">أسواق الخير</div>
        </div>
        
        <div style="background: var(--card); padding: 24px; border-radius: 20px; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div class="input-group">
            <label class="input-label">Email</label>
            <div class="input-wrapper">
              <input type="email" id="auth-email" class="input-field" placeholder="you@example.com">
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">Password</label>
            <div class="input-wrapper">
              <input type="password" id="auth-pwd" class="input-field" placeholder="••••••••">
            </div>
          </div>
          <button class="btn btn-primary" onclick="handleLogin()" style="margin-top: 12px;">${t('login')}</button>
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
          <button class="btn-secondary" style="border: none; background: transparent;" onclick="setLang(state.lang === 'ar' ? 'en' : 'ar'); renderAccount();">
            🌐 ${state.lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
          </button>
        </div>
      </div>
    `;
    return;
  }
  
  els.main.innerHTML = `
    <div class="page active">
      <div class="header">
        <div class="header-title">${t('account')}</div>
      </div>
      
      <div class="account-card">
        <div class="account-avatar">${(state.profile?.full_name || state.user.email)[0].toUpperCase()}</div>
        <div>
          <div style="font-weight: 800; font-size: 18px;">${state.profile?.full_name || 'Customer'}</div>
          <div style="color: var(--muted); font-size: 14px;">${state.user.email}</div>
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
      
      <div style="padding: 0 20px;">
        <button class="btn btn-secondary" onclick="handleLogout()">${t('logout')}</button>
      </div>
    </div>
  `;
}

window.handleLogin = async () => {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-pwd').value;
  if (!email || !password) return showToast('Please enter credentials', 'error');
  
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showToast(error.message, 'error');
  } else {
    state.user = data.user;
    showToast(t('welcome'), 'success');
    renderAccount();
  }
};

window.handleLogout = async () => {
  await supabaseClient.auth.signOut();
  state.user = null;
  state.profile = null;
  renderAccount();
};

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
  
  els.main.innerHTML = \`<div style="text-align:center; padding: 40px;"><div class="spinner" style="border-width:3px; width:30px; height:30px; border-color:rgba(0,0,0,0.1); border-top-color:var(--primary);"></div></div>\`;
  
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

// Start
init();
})();
