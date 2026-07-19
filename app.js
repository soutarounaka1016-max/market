const STORAGE_KEY = "marketNeeds.v1";
const GITHUB_API_BASE = "https://api.github.com/repos";
const GITHUB_ALLOWED_STATES = ["open", "all"];
const GITHUB_ALLOWED_LIMITS = [10, 20];
const DESCRIPTION_PREVIEW_LENGTH = 240;

function createNeed(input, now = new Date()) {
  const existingExtra = input.extra && typeof input.extra === "object" ? input.extra : {};
  return {
    ...existingExtra,
    id: input.id || `need-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: (input.title || "").trim(),
    description: (input.description || "").trim(),
    affected: (input.affected || "").trim(),
    payer: (input.payer || "").trim(),
    source: (input.source || "").trim(),
    sourceUrl: (input.sourceUrl || "").trim(),
    externalId: (input.externalId || "").trim(),
    fetchedAt: input.fetchedAt || "",
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function safeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeNeed(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;
  return createNeed({
    extra: raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : undefined,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    affected: typeof raw.affected === "string" ? raw.affected : "",
    payer: typeof raw.payer === "string" ? raw.payer : "",
    source: typeof raw.source === "string" ? raw.source : "",
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : "",
    externalId: typeof raw.externalId === "string" ? raw.externalId : "",
    fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
  }, safeDate(raw.updatedAt));
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

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function truncateText(value, maxLength = DESCRIPTION_PREVIEW_LENGTH) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function normalizeGitHubInput(input) {
  const owner = String(input.owner || "").trim();
  const repo = String(input.repo || "").trim();
  const state = GITHUB_ALLOWED_STATES.includes(input.state) ? input.state : "open";
  const limit = GITHUB_ALLOWED_LIMITS.includes(Number(input.limit)) ? Number(input.limit) : 10;
  if (!owner) throw new Error("GitHubのユーザー名または組織名を入力してください。");
  if (!repo) throw new Error("リポジトリ名を入力してください。");
  return { owner, repo, state, limit };
}

function createExternalId(owner, repo, issueNumber) {
  return `github:${owner}/${repo}#${issueNumber}`.toLowerCase();
}

function createGitHubIssuesUrl(input) {
  const params = new URLSearchParams({ state: input.state, per_page: String(input.limit) });
  return `${GITHUB_API_BASE}/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues?${params.toString()}`;
}

function createGitHubErrorMessage(response) {
  if (response.status === 404) return "リポジトリが存在しない、または非公開のため取得できません。ユーザー名とリポジトリ名を確認してください。";
  if (response.status === 403) return "GitHub APIの利用上限に達した、またはアクセスが制限されています。しばらく待ってから再度試してください。";
  if (response.status >= 500) return "GitHub API側で一時的な問題が発生しています。時間をおいて再度試してください。";
  return `GitHub APIが正常でない応答を返しました（HTTP ${response.status}）。`;
}

function responseHeader(response, name) {
  return response.headers && typeof response.headers.get === "function" ? response.headers.get(name) : null;
}

function issueToCandidate(issue, repoInfo, fetchedAt = new Date().toISOString()) {
  const labels = Array.isArray(issue.labels) ? issue.labels.map((label) => {
    if (typeof label === "string") return label;
    return label && typeof label.name === "string" ? label.name : "";
  }).filter(Boolean) : [];
  return {
    id: createExternalId(repoInfo.owner, repoInfo.repo, issue.number),
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    repositoryFullName: `${repoInfo.owner}/${repoInfo.repo}`,
    number: issue.number,
    title: typeof issue.title === "string" && issue.title.trim() ? issue.title.trim() : `GitHub Issue #${issue.number}`,
    body: typeof issue.body === "string" ? issue.body : "",
    labels,
    comments: Number.isInteger(issue.comments) ? issue.comments : 0,
    createdAt: typeof issue.created_at === "string" ? issue.created_at : "",
    updatedAt: typeof issue.updated_at === "string" ? issue.updated_at : "",
    htmlUrl: typeof issue.html_url === "string" ? issue.html_url : "",
    fetchedAt,
  };
}

function normalizeGitHubIssues(rawIssues, repoInfo, fetchedAt = new Date().toISOString()) {
  if (!Array.isArray(rawIssues)) return [];
  return rawIssues
    .filter((issue) => issue && typeof issue === "object" && !issue.pull_request)
    .filter((issue) => Number.isInteger(issue.number))
    .map((issue) => issueToCandidate(issue, repoInfo, fetchedAt));
}

async function fetchGitHubIssues(input, fetcher = fetch) {
  const repoInfo = normalizeGitHubInput(input);
  const response = await fetcher(createGitHubIssuesUrl(repoInfo), {
    headers: { Accept: "application/vnd.github+json" },
  }).catch(() => {
    throw new Error("ネットワーク通信に失敗しました。接続状況を確認してください。");
  });

  const remaining = responseHeader(response, "x-ratelimit-remaining");
  if (!response.ok) throw new Error(createGitHubErrorMessage(response));

  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new Error("GitHub APIの応答を読み取れませんでした。時間をおいて再度試してください。");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("GitHub APIが想定外の形式を返しました。リポジトリ名を確認してください。");
  }

  return {
    candidates: normalizeGitHubIssues(parsed, repoInfo),
    remaining,
  };
}

function candidateToNeed(candidate, now = new Date()) {
  return createNeed({
    title: candidate.title,
    description: candidate.body,
    affected: "",
    payer: "",
    source: "GitHub Issues",
    sourceUrl: candidate.htmlUrl,
    externalId: candidate.id,
    fetchedAt: candidate.fetchedAt,
  }, now);
}

function isSavedCandidate(candidate, needs) {
  return needs.some((need) => (
    (candidate.id && need.externalId === candidate.id) ||
    (candidate.htmlUrl && need.sourceUrl === candidate.htmlUrl) ||
    (candidate.htmlUrl && need.source === candidate.htmlUrl)
  ));
}

function renderEvaluationIfPresent(need) {
  if (!need.evaluation || typeof need.evaluation !== "object") return "";
  const entries = Object.entries(need.evaluation).filter(([, value]) => value !== "" && value !== undefined && value !== null);
  if (entries.length === 0) return "";
  const total = entries.reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
  return `<p><strong>評価合計：</strong>${escapeHtml(total)}点</p>`;
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
  const issuesForm = document.querySelector("#github-issues-form");
  const ownerInput = document.querySelector("#github-owner");
  const repoInput = document.querySelector("#github-repo");
  const stateInput = document.querySelector("#github-state");
  const limitInput = document.querySelector("#github-limit");
  const issuesMessage = document.querySelector("#github-issues-message");
  const importButton = document.querySelector("#github-import-button");
  const candidatesList = document.querySelector("#github-candidates-list");
  let needs = loadNeeds();
  let candidates = [];

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function showIssuesMessage(text, isError = false) {
    issuesMessage.textContent = text;
    issuesMessage.classList.toggle("error", isError);
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
        ${need.sourceUrl ? `<p><strong>情報源URL：</strong><a href="${escapeHtml(need.sourceUrl)}" target="_blank" rel="noopener noreferrer">元ページを開く</a></p>` : ""}
        ${need.externalId ? `<p class="need-meta">外部データID：${escapeHtml(need.externalId)}</p>` : ""}
        ${need.fetchedAt ? `<p class="need-meta">取得日時：${escapeHtml(formatDateTime(need.fetchedAt))}</p>` : ""}
        ${renderEvaluationIfPresent(need)}
        <div class="need-actions">
          <button type="button" class="secondary-button" data-action="edit">編集</button>
          <button type="button" class="danger-button" data-action="delete">削除</button>
        </div>
      </article>
    `).join("");
  }

  function renderCandidates() {
    if (candidates.length === 0) {
      candidatesList.innerHTML = '<p class="empty candidate-empty">取得した課題候補はまだありません。</p>';
      return;
    }
    candidatesList.innerHTML = candidates.map((candidate) => {
      const saved = isSavedCandidate(candidate, needs);
      const labels = candidate.labels.length > 0
        ? candidate.labels.map((label) => `<span class="label-chip">${escapeHtml(label)}</span>`).join("")
        : '<span class="muted-text">ラベルなし</span>';
      const bodyPreview = truncateText(candidate.body) || "本文はありません。";
      return `
        <article class="candidate-item" data-id="${escapeHtml(candidate.id)}">
          <div class="candidate-heading">
            <h4>${escapeHtml(candidate.title)}</h4>
            <span class="candidate-source">${escapeHtml(candidate.repositoryFullName)} #${escapeHtml(candidate.number)}</span>
          </div>
          <p class="candidate-body">${escapeHtml(bodyPreview).replace(/\n/g, "<br>")}</p>
          <div class="candidate-meta">
            <span>コメント：${escapeHtml(candidate.comments)}件</span>
            <span>作成：${escapeHtml(formatDate(candidate.createdAt))}</span>
            <span>更新：${escapeHtml(formatDate(candidate.updatedAt))}</span>
          </div>
          <div class="label-row">${labels}</div>
          <div class="candidate-actions">
            ${candidate.htmlUrl ? `<a class="external-link" href="${escapeHtml(candidate.htmlUrl)}" target="_blank" rel="noopener noreferrer">GitHubで開く</a>` : ""}
            <button type="button" class="primary-button" data-action="save-candidate" ${saved ? "disabled" : ""}>${saved ? "保存済み" : "課題として保存"}</button>
          </div>
        </article>
      `;
    }).join("");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const existing = needs.find((need) => need.id === idInput.value);
    const nextNeed = createNeed({
      extra: existing,
      id: existing?.id,
      title: titleInput.value,
      description: descriptionInput.value,
      affected: affectedInput.value,
      payer: payerInput.value,
      source: sourceInput.value,
      sourceUrl: existing?.sourceUrl || "",
      externalId: existing?.externalId || "",
      fetchedAt: existing?.fetchedAt || "",
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
    renderCandidates();
  });

  issuesForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    importButton.disabled = true;
    showIssuesMessage("GitHub Issuesを取得しています…");
    try {
      const result = await fetchGitHubIssues({
        owner: ownerInput.value,
        repo: repoInput.value,
        state: stateInput.value,
        limit: limitInput.value,
      });
      candidates = result.candidates;
      renderCandidates();
      const limitMessage = result.remaining === null || result.remaining === undefined
        ? ""
        : ` API残り利用回数：${result.remaining}回。`;
      if (candidates.length === 0) {
        showIssuesMessage(`取得できるIssueは0件でした。${limitMessage}`);
      } else {
        showIssuesMessage(`${candidates.length}件の課題候補を取得しました。内容を確認してから保存してください。${limitMessage}`);
      }
    } catch (error) {
      showIssuesMessage(error.message || "GitHub Issuesの取得中にエラーが発生しました。", true);
    } finally {
      importButton.disabled = false;
    }
  });

  candidatesList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='save-candidate']");
    if (!button) return;
    const item = button.closest(".candidate-item");
    const candidate = candidates.find((entry) => entry.id === item?.dataset.id);
    if (!candidate) return;

    if (isSavedCandidate(candidate, needs)) {
      showIssuesMessage("この課題は保存済みです", true);
      renderCandidates();
      return;
    }

    const nextNeed = candidateToNeed(candidate);
    needs = [nextNeed, ...needs];
    saveNeeds(needs);
    showIssuesMessage("課題として保存しました。");
    renderNeeds();
    renderCandidates();
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
      renderCandidates();
      showMessage("課題を削除しました。");
      resetForm();
    }
  });

  cancelEditButton.addEventListener("click", () => {
    resetForm();
    showMessage("編集を取り消しました。");
  });

  renderNeeds();
  renderCandidates();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", setupApp);
}

if (typeof module !== "undefined") {
  module.exports = {
    STORAGE_KEY,
    GITHUB_API_BASE,
    GITHUB_ALLOWED_STATES,
    GITHUB_ALLOWED_LIMITS,
    DESCRIPTION_PREVIEW_LENGTH,
    createNeed,
    safeDate,
    normalizeNeed,
    loadNeeds,
    saveNeeds,
    formatDate,
    formatDateTime,
    escapeHtml,
    truncateText,
    normalizeGitHubInput,
    createExternalId,
    createGitHubIssuesUrl,
    createGitHubErrorMessage,
    issueToCandidate,
    normalizeGitHubIssues,
    fetchGitHubIssues,
    candidateToNeed,
    isSavedCandidate,
    renderEvaluationIfPresent,
  };
}
