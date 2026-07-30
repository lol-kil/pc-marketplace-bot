const GH_TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const OWNER = process.env.GH_OWNER;
const REPO = process.env.GH_REPO;
const BRANCH = process.env.GH_BRANCH || "main";
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

async function ghFetch(path, opts = {}) {
  const res = await fetch(`${API}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "pc-marketplace-bot",
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function getFile(path) {
  const res = await ghFetch(`${path}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function getJson(path) {
  const file = await getFile(path);
  return file ? JSON.parse(file.content) : null;
}

async function putFile(path, contentUtf8OrBase64, message, sha, isBase64 = false) {
  const content = isBase64 ? contentUtf8OrBase64 : Buffer.from(contentUtf8OrBase64, "utf8").toString("base64");
  const res = await ghFetch(path, {
    method: "PUT",
    body: JSON.stringify({ message, content, sha, branch: BRANCH }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub commit failed for ${path}: ${err}`);
  }
  return res.json();
}

async function putJson(path, obj, message) {
  const existing = await getFile(path);
  return putFile(path, JSON.stringify(obj, null, 2), message, existing?.sha);
}

module.exports = { getFile, getJson, putFile, putJson };
