// ==== НАСТРОЙКИ — заполни своими значениями после создания репозитория ====
const CONFIG = {
  GH_OWNER: "lol-kil",
  GH_REPO: "pc-marketplace-bot",
  GH_BRANCH: "main",
};
const RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/${CONFIG.GH_BRANCH}`;
// ===========================================================================

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const state = {
  categories: [],
  admins: [],
  isAdmin: false,
  cart: {},      // { productId: qty }
  likes: {},     // { productId: true }
  activeProduct: null,
  activeCategory: null,
};

const $ = (sel) => document.querySelector(sel);

// ---------- Загрузка данных ----------
async function loadCatalog() {
  const res = await fetch(`${RAW_BASE}/catalog/categories.json?_=${Date.now()}`);
  const data = await res.json();
  state.categories = data.categories || [];
}

async function loadAdmins() {
  try {
    const res = await fetch(`${RAW_BASE}/config/admins.json?_=${Date.now()}`);
    const data = await res.json();
    state.admins = data.admins || [];
  } catch {
    state.admins = [];
  }
  const uid = tg?.initDataUnsafe?.user?.id;
  state.isAdmin = !!uid && state.admins.includes(uid);
}

// ---------- CloudStorage (корзина / избранное) ----------
function cloudGet(key) {
  return new Promise((resolve) => {
    if (!tg?.CloudStorage) return resolve(null);
    tg.CloudStorage.getItem(key, (err, value) => resolve(err ? null : value));
  });
}
function cloudSet(key, value) {
  if (!tg?.CloudStorage) return;
  tg.CloudStorage.setItem(key, JSON.stringify(value));
}
async function loadCartAndLikes() {
  const cart = await cloudGet("cart");
  const likes = await cloudGet("likes");
  state.cart = cart ? JSON.parse(cart) : {};
  state.likes = likes ? JSON.parse(likes) : {};
}
function persistCart() { cloudSet("cart", state.cart); }
function persistLikes() { cloudSet("likes", state.likes); }

// ---------- Рендер каталога ----------
function renderCategories() {
  const root = $("#categoryList");
  root.innerHTML = "";
  const tpl = $("#categoryTpl");

  state.categories.forEach((cat) => {
    const node = tpl.content.cloneNode(true);
    const section = node.querySelector(".category");
    section.dataset.id = cat.id;
    node.querySelector(".category__title").textContent = cat.title;

    const grid = node.querySelector(".product-grid");
    (cat.products || []).forEach((p) => grid.appendChild(renderProductChip(p, cat)));

    const addBtn = node.querySelector(".admin-add-product");
    if (state.isAdmin) {
      addBtn.hidden = false;
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openProductForm(cat, null);
      });
    }

    node.querySelector(".category__head").addEventListener("click", () => {
      section.classList.toggle("open");
    });

    root.appendChild(node);
  });
}

function renderProductChip(product, category) {
  const tpl = $("#productChipTpl");
  const node = tpl.content.cloneNode(true);
  const chip = node.querySelector(".product-chip");
  chip.querySelector(".product-chip__brand").textContent = product.brand;
  chip.querySelector(".product-chip__name").textContent = product.name;
  chip.querySelector(".product-chip__price").textContent = formatPrice(product.price);
  chip.addEventListener("click", () => openProductModal(product, category));
  return chip;
}

function formatPrice(v) {
  return new Intl.NumberFormat("ru-RU").format(v) + " сум";
}

// ---------- Карточка товара ----------
function openProductModal(product, category) {
  state.activeProduct = product;
  state.activeCategory = category;

  $("#modalBrand").textContent = product.brand;
  $("#modalName").textContent = product.name;
  $("#modalPrice").textContent = formatPrice(product.price);
  $("#modalDesc").textContent = product.description || "";

  const imgWrap = $("#modalImageWrap");
  imgWrap.innerHTML = product.image
    ? `<img src="${RAW_BASE}/catalog/images/${product.image}" alt="">`
    : "нет фото";

  const liked = !!state.likes[product.id];
  const likeBtn = $("#likeBtn");
  likeBtn.textContent = liked ? "♥ В избранном" : "♡ В избранное";
  likeBtn.classList.toggle("is-active", liked);

  $("#adminControls").hidden = !state.isAdmin;

  $("#productModal").hidden = false;
}
$("#modalClose").addEventListener("click", () => ($("#productModal").hidden = true));

$("#likeBtn").addEventListener("click", () => {
  const id = state.activeProduct.id;
  if (state.likes[id]) delete state.likes[id];
  else state.likes[id] = true;
  persistLikes();
  openProductModal(state.activeProduct, state.activeCategory);
});

$("#cartAddBtn").addEventListener("click", () => {
  const id = state.activeProduct.id;
  state.cart[id] = (state.cart[id] || 0) + 1;
  persistCart();
  updateCartBadge();
  tg?.HapticFeedback?.notificationOccurred("success");
});

$("#editProductBtn").addEventListener("click", () => {
  $("#productModal").hidden = true;
  openProductForm(state.activeCategory, state.activeProduct);
});

$("#deleteProductBtn").addEventListener("click", () => {
  sendToBot({
    type: "delete_product",
    category_id: state.activeCategory.id,
    product_id: state.activeProduct.id,
  });
});

// ---------- Корзина / оформление заказа ----------
function updateCartBadge() {
  const count = Object.values(state.cart).reduce((a, b) => a + b, 0);
  $("#cartCount").textContent = count;
}

function findProductById(id) {
  for (const cat of state.categories) {
    const p = (cat.products || []).find((p) => p.id === id);
    if (p) return p;
  }
  return null;
}

$("#cartBtn").addEventListener("click", () => {
  const wrap = $("#cartItems");
  wrap.innerHTML = "";
  Object.entries(state.cart).forEach(([id, qty]) => {
    const p = findProductById(id);
    if (!p) return;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `<span>${p.brand} ${p.name} × ${qty}</span><span>${formatPrice(p.price * qty)}</span>`;
    wrap.appendChild(row);
  });
  if (!Object.keys(state.cart).length) {
    wrap.innerHTML = `<p style="color:var(--muted);font-size:13px;">Корзина пуста</p>`;
  }
  $("#cartModal").hidden = false;
});
$("#cartClose").addEventListener("click", () => ($("#cartModal").hidden = true));

$("#checkoutForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const items = Object.entries(state.cart).map(([id, qty]) => {
    const p = findProductById(id);
    return { id, brand: p?.brand, name: p?.name, price: p?.price, qty };
  });

  sendToBot({
    type: "order",
    name: fd.get("name"),
    phone: fd.get("phone"),
    address: fd.get("address"),
    comment: fd.get("comment") || "",
    items,
  });
  // sendData закрывает Mini App сразу после отправки — это ожидаемое поведение
});

// ---------- Формы админа ----------
function openProductForm(category, product) {
  state.activeCategory = category;
  state.activeProduct = product;
  $("#productFormTitle").textContent = product ? "Редактировать товар" : "Новый товар";
  const form = $("#productForm");
  form.brand.value = product?.brand || "";
  form.name.value = product?.name || "";
  form.price.value = product?.price || "";
  form.description.value = product?.description || "";
  $("#productFormModal").hidden = false;
}
$("#productFormClose").addEventListener("click", () => ($("#productFormModal").hidden = true));

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const file = fd.get("image");
  let imageBase64 = null;
  if (file && file.size) imageBase64 = await fileToBase64(file);

  sendToBot({
    type: state.activeProduct ? "edit_product" : "add_product",
    category_id: state.activeCategory.id,
    product_id: state.activeProduct?.id || null,
    brand: fd.get("brand"),
    name: fd.get("name"),
    price: Number(fd.get("price")),
    description: fd.get("description"),
    image_base64: imageBase64,
    image_filename: file?.name || null,
  });
});

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
}

$("#addCategoryBtn").addEventListener("click", () => ($("#categoryFormModal").hidden = false));
$("#categoryFormClose").addEventListener("click", () => ($("#categoryFormModal").hidden = true));
$("#categoryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  sendToBot({ type: "add_category", title: fd.get("title") });
});

// ---------- Отправка данных боту ----------
function sendToBot(payload) {
  if (!tg?.sendData) {
    console.warn("sendData недоступен вне Telegram", payload);
    return;
  }
  tg.sendData(JSON.stringify(payload));
}

// ---------- Инициализация ----------
(async function init() {
  await Promise.all([loadCatalog(), loadAdmins(), loadCartAndLikes()]);
  renderCategories();
  updateCartBadge();
  if (state.isAdmin) $("#addCategoryBtn").hidden = false;
})();
