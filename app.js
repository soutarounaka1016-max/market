const STORAGE_KEY = "marketNeeds.v1";

function createNeed(input, now = new Date()) {
  return {
    id: input.id || `need-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: (input.title || "").trim(),
    description: (input.description || "").trim(),
    affected: (input.affected || "").trim(),
    payer: (input.payer || "").trim(),
    source: (input.source || "").trim(),
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function normalizeNeed(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;
  return createNeed({
    id: typeof raw.id === "string" && raw.id ? raw.id : undefined,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    affected: typeof raw.affected === "string" ? raw.affected : "",
    payer: typeof raw.payer === "string" ? raw.payer : "",
    source: typeof raw.source === "string" ? raw.source : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
  }, raw.updatedAt ? new Date(raw.updatedAt) : new Date());
}

function loadNeeds(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeNeed).filter(Boolean) : [];
  } catch (error) {
    console.error("保存データを読み込めませんでした", error);
    return [];
  }
}

function saveNeeds(needs, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(needs));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日付不明";
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}

function setupApp() {
  const form = document.querySelector("#need-form");
  const formTitle = document.querySelector("#form-title");
  const idInput = document.querySelector("#need-id");
  const titleInput = document.querySelector("#title");
  const descriptionInput = document.querySelector("#description");
  const affectedInput = document.querySelector("#affected");
  const payerInput = document.querySelector("#payer");
  const sourceInput = document.querySelector("#source");
  const message = document.querySelector("#form-message");
  const cancelEditButton = document.querySelector("#cancel-edit");
  const list = document.querySelector("#needs-list");
  const count = document.querySelector("#need-count");
  let needs = loadNeeds();

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function resetForm() {
    form.reset();
    idInput.value = "";
    formTitle.textContent = "課題を登録する";
    form.querySelector(".primary-button").textContent = "登録する";
    cancelEditButton.hidden = true;
  }

  function renderNeeds() {
    count.textContent = `${needs.length}件`;
    if (needs.length === 0) {
      list.innerHTML = '<p class="empty">まだ課題が登録されていません。左のフォームから最初の課題を登録してください。</p>';
      return;
    }
    list.innerHTML = needs.map((need) => `
      <article class="need-item" data-id="${escapeHtml(need.id)}">
        <h3>${escapeHtml(need.title)}</h3>
        <p class="need-meta">登録日：${escapeHtml(formatDate(need.createdAt))} / 更新日：${escapeHtml(formatDate(need.updatedAt))}</p>
        ${need.description ? `<p class="need-detail">${escapeHtml(need.description).replace(/\n/g, "<br>")}</p>` : ""}
        ${need.affected ? `<p><strong>困っている人：</strong>${escapeHtml(need.affected)}</p>` : ""}
        ${need.payer ? `<p><strong>支払者候補：</strong>${escapeHtml(need.payer)}</p>` : ""}
        ${need.source ? `<p><strong>情報源：</strong>${escapeHtml(need.source)}</p>` : ""}
        <div class="need-actions">
          <button type="button" class="secondary-button" data-action="edit">編集</button>
          <button type="button" class="danger-button" data-action="delete">削除</button>
        </div>
      </article>
    `).join("");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const existing = needs.find((need) => need.id === idInput.value);
    const nextNeed = createNeed({
      id: existing?.id,
      title: titleInput.value,
      description: descriptionInput.value,
      affected: affectedInput.value,
      payer: payerInput.value,
      source: sourceInput.value,
      createdAt: existing?.createdAt,
    });

    if (!nextNeed.title) {
      showMessage("タイトルを入力してください。", true);
      titleInput.focus();
      return;
    }

    if (existing) {
      needs = needs.map((need) => need.id === existing.id ? nextNeed : need);
      showMessage("課題を更新しました。");
    } else {
      needs = [nextNeed, ...needs];
      showMessage("課題を登録しました。");
    }
    saveNeeds(needs);
    resetForm();
    renderNeeds();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = button.closest(".need-item");
    const need = needs.find((entry) => entry.id === item?.dataset.id);
    if (!need) return;

    if (button.dataset.action === "edit") {
      idInput.value = need.id;
      titleInput.value = need.title;
      descriptionInput.value = need.description;
      affectedInput.value = need.affected;
      payerInput.value = need.payer;
      sourceInput.value = need.source;
      formTitle.textContent = "課題を編集する";
      form.querySelector(".primary-button").textContent = "更新する";
      cancelEditButton.hidden = false;
      showMessage("編集する内容を確認してください。");
      titleInput.focus();
      return;
    }

    if (button.dataset.action === "delete" && window.confirm("この課題を削除しますか？")) {
      needs = needs.filter((entry) => entry.id !== need.id);
      saveNeeds(needs);
      renderNeeds();
      showMessage("課題を削除しました。");
      resetForm();
    }
  });

  cancelEditButton.addEventListener("click", () => {
    resetForm();
    showMessage("編集を取り消しました。");
  });

  renderNeeds();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", setupApp);
}

if (typeof module !== "undefined") {
  module.exports = { STORAGE_KEY, createNeed, normalizeNeed, loadNeeds, saveNeeds, escapeHtml };
}
