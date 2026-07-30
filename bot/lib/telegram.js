const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

async function call(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error in ${method}:`, data.description);
  }
  return data;
}

function getUpdates(offset) {
  return call("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });
}

function sendMessage(chatId, text, opts = {}) {
  return call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...opts });
}

module.exports = { call, getUpdates, sendMessage };
