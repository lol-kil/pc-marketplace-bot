const { getUpdates, sendMessage } = require("./lib/telegram");
const { getJson, putJson, putFile } = require("./lib/github");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const MINI_APP_URL = process.env.MINI_APP_URL;
const STATE_PATH = "bot/state.json";
const CATALOG_PATH = "catalog/categories.json";
const ADMINS_PATH = "config/admins.json";

function slugify(str) {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s-]/gi, "")
      .trim()
      .replace(/\s+/g, "-") || `cat-${Date.now()}`
  );
}

async function isAdmin(userId) {
  const admins = (await getJson(ADMINS_PATH)) || { admins: [] };
  return admins.admins.includes(userId);
}

async function handleOrder(payload, user) {
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  const itemsText = payload.items
    .map((i) => `• ${i.brand} ${i.name} × ${i.qty} — ${i.price * i.qty} сум`)
    .join("\n");
  const total = payload.items.reduce((s, i) => s + i.price * i.qty, 0);

  const text = [
    `🧾 <b>Новый заказ</b>`,
    ``,
    `👤 ${payload.name}`,
    `📞 ${payload.phone}`,
    `📍 ${payload.address}`,
    payload.comment ? `💬 ${payload.comment}` : null,
    ``,
    itemsText,
    ``,
    `Итого: <b>${total} сум</b>`,
    ``,
    `#заказ #${date.slice(0, 10)} #${(user?.username || "user_" + user?.id || "").replace(/\s+/g, "_")}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (ADMIN_CHAT_ID) await sendMessage(ADMIN_CHAT_ID, text);
}

async function handleAddCategory(payload, user) {
  if (!(await isAdmin(user.id))) return;
  const catalog = (await getJson(CATALOG_PATH)) || { categories: [] };
  catalog.categories.push({ id: slugify(payload.title), title: payload.title, products: [] });
  await putJson(CATALOG_PATH, catalog, `Добавлен раздел: ${payload.title}`);
}

async function handleAddOrEditProduct(payload, user, isEdit) {
  if (!(await isAdmin(user.id))) return;
  const catalog = (await getJson(CATALOG_PATH)) || { categories: [] };
  const cat = catalog.categories.find((c) => c.id === payload.category_id);
  if (!cat) return;

  let imageFilename = null;
  if (payload.image_base64) {
    imageFilename = `${Date.now()}-${(payload.image_filename || "photo.jpg").replace(/\s+/g, "_")}`;
    await putFile(
      `catalog/images/${imageFilename}`,
      payload.image_base64,
      `Фото товара: ${payload.name}`,
      undefined,
      true
    );
  }

  if (isEdit) {
    const product = cat.products.find((p) => p.id === payload.product_id);
    if (!product) return;
    product.brand = payload.brand;
    product.name = payload.name;
    product.price = payload.price;
    product.description = payload.description;
    if (imageFilename) product.image = imageFilename;
  } else {
    cat.products.push({
      id: `p-${Date.now()}`,
      brand: payload.brand,
      name: payload.name,
      price: payload.price,
      description: payload.description,
      image: imageFilename,
    });
  }

  await putJson(CATALOG_PATH, catalog, `${isEdit ? "Изменён" : "Добавлен"} товар: ${payload.name}`);
}

async function handleDeleteProduct(payload, user) {
  if (!(await isAdmin(user.id))) return;
  const catalog = (await getJson(CATALOG_PATH)) || { categories: [] };
  const cat = catalog.categories.find((c) => c.id === payload.category_id);
  if (!cat) return;
  cat.products = cat.products.filter((p) => p.id !== payload.product_id);
  await putJson(CATALOG_PATH, catalog, `Удалён товар: ${payload.product_id}`);
}

async function handleWebAppData(rawData, user) {
  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch {
    return;
  }
  switch (payload.type) {
    case "order":
      return handleOrder(payload, user);
    case "add_category":
      return handleAddCategory(payload, user);
    case "add_product":
      return handleAddOrEditProduct(payload, user, false);
    case "edit_product":
      return handleAddOrEditProduct(payload, user, true);
    case "delete_product":
      return handleDeleteProduct(payload, user);
  }
}

async function handleStart(chatId) {
  if (!MINI_APP_URL) return sendMessage(chatId, "Добро пожаловать!");
  await sendMessage(chatId, "Добро пожаловать в каталог комплектующих 👇", {
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть каталог", web_app: { url: MINI_APP_URL } }]],
    },
  });
}

async function main() {
  const state = (await getJson(STATE_PATH)) || { offset: 0 };
  const res = await getUpdates(state.offset);
  const updates = res.result || [];
  if (!updates.length) return;

  for (const update of updates) {
    const msg = update.message;
    if (!msg) continue;

    if (msg.web_app_data?.data) {
      await handleWebAppData(msg.web_app_data.data, msg.from);
    } else if (msg.text === "/start") {
      await handleStart(msg.chat.id);
    }
  }

  const newOffset = updates[updates.length - 1].update_id + 1;
  await putJson(STATE_PATH, { offset: newOffset }, "Обновлён offset обработанных сообщений");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
