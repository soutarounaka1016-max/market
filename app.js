const STORAGE_KEY = "marketNeeds.v1";
const GITHUB_ISSUES_PER_PAGE = 30;
const HACKER_NEWS_PAGE_SIZE = 20;
const GITHUB_REPO_PATTERN = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i;
const HACKER_NEWS_DEFAULT_QUERY = "problem OR pain OR frustrating OR hard";

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
    sourceType: (input.sourceType || "").trim(),
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
    sourceType: typeof raw.sourceType === "string" ? raw.sourceType : "",
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
  return date.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));
}

function truncateText(value, maxLength = 300) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
}

function createCandidate(input, now = new Date()) {
  const sourceType = String(input.sourceType || "").trim();
  const externalId = String(input.externalId || "").trim();
  const sourceUrl = String(input.sourceUrl || "").trim();
  return {
    candidateId: input.candidateId || `${sourceType}:${externalId || sourceUrl}`,
    sourceType,
    sourceName: String(input.sourceName || "").trim(),
    sourceUrl,
    externalId,
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    author: String(input.author || "").trim(),
    tags: normalizeTags(input.tags),
    commentCount: Number.isFinite(Number(input.commentCount)) ? Number(input.commentCount) : 0,
    score: Number.isFinite(Number(input.score)) ? Number(input.score) : 0,
    publishedAt: input.publishedAt || "",
    updatedAt: input.updatedAt || "",
    fetchedAt: input.fetchedAt || now.toISOString(),
    providerName: String(input.providerName || "").trim(),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

function isValidCandidate(candidate) {
  return Boolean(candidate && candidate.candidateId && candidate.sourceType && candidate.title && candidate.sourceUrl);
}

function parseGitHubRepo(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const shorthandMatch = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  const urlMatch = text.match(GITHUB_REPO_PATTERN);
  const match = shorthandMatch || urlMatch;
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

function createGitHubIssuesUrl(repoInfo) {
  return `https://api.github.com/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(repoInfo.repo)}/issues?state=open&per_page=${GITHUB_ISSUES_PER_PAGE}`;
}

function githubIssueToCandidate(issue, repoInfo, now = new Date()) {
  const repoName = `${repoInfo.owner}/${repoInfo.repo}`;
  return createCandidate({
    candidateId: `github:${issue.id}`,
    sourceType: "github_issues",
    sourceName: `GitHub Issues (${repoName})`,
    sourceUrl: issue.html_url,
    externalId: String(issue.id || issue.number || ""),
    title: issue.title,
    description: typeof issue.body === "string" && issue.body.trim() ? issue.body.trim() : "GitHub Issueから取得しました。詳しい内容は元ページを確認してください。",
    author: issue.user && typeof issue.user.login === "string" ? issue.user.login : "",
    tags: Array.isArray(issue.labels) ? issue.labels.map((label) => typeof label === "string" ? label : label.name) : [],
    commentCount: issue.comments,
    score: 0,
    publishedAt: issue.created_at,
    updatedAt: issue.updated_at,
    fetchedAt: now.toISOString(),
    providerName: "GitHub REST API",
    metadata: { number: issue.number, repository: repoName, state: issue.state },
  }, now);
}

function normalizeGitHubIssues(rawIssues, repoInfo = { owner: "", repo: "" }, now = new Date()) {
  if (!Array.isArray(rawIssues)) return [];
  return rawIssues
    .filter((issue) => issue && typeof issue === "object" && !issue.pull_request)
    .map((issue) => githubIssueToCandidate(issue, repoInfo, now))
    .filter(isValidCandidate);
}

async function fetchJson(url, errorPrefix, fetcher = fetch, options = {}) {
  const response = await fetcher(url, options);
  if (!response.ok) throw new Error(`${errorPrefix}（HTTP ${response.status}）。入力内容や公開状態を確認してください。`);
  return response.json();
}

async function fetchGitHubIssues(repoText, fetcher = fetch) {
  const repoInfo = parseGitHubRepo(repoText);
  if (!repoInfo) throw new Error("GitHubリポジトリは owner/repo または GitHubのURLで入力してください。");
  const json = await fetchJson(createGitHubIssuesUrl(repoInfo), "GitHub Issuesを取得できませんでした", fetcher, { headers: { Accept: "application/vnd.github+json" } });
  return normalizeGitHubIssues(json, repoInfo);
}

function createHackerNewsUrl(query) {
  const trimmed = String(query || "").trim() || HACKER_NEWS_DEFAULT_QUERY;
  const params = new URLSearchParams({ query: trimmed, tags: "story", hitsPerPage: String(HACKER_NEWS_PAGE_SIZE) });
  return `https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`;
}

function hackerNewsHitToCandidate(hit, now = new Date()) {
  const objectId = String(hit.objectID || "");
  const sourceUrl = hit.url || (objectId ? `https://news.ycombinator.com/item?id=${encodeURIComponent(objectId)}` : "");
  return createCandidate({
    candidateId: `hacker_news:${objectId}`,
    sourceType: "hacker_news",
    sourceName: "Hacker News",
    sourceUrl,
    externalId: objectId,
    title: hit.title || hit.story_title || "Hacker News story",
    description: hit.story_text || hit.comment_text || "Hacker Newsから取得しました。詳しい内容は元ページを確認してください。",
    author: hit.author,
    tags: ["Hacker News"],
    commentCount: hit.num_comments,
    score: hit.points,
    publishedAt: hit.created_at,
    updatedAt: hit.updated_at || hit.created_at,
    fetchedAt: now.toISOString(),
    providerName: "HN Search API (Algolia)",
    metadata: { hnItemUrl: objectId ? `https://news.ycombinator.com/item?id=${objectId}` : "" },
  }, now);
}

function normalizeHackerNewsStories(raw, now = new Date()) {
  const hits = raw && Array.isArray(raw.hits) ? raw.hits : [];
  return hits.map((hit) => hackerNewsHitToCandidate(hit, now)).filter(isValidCandidate);
}

async function fetchHackerNewsStories(query, fetcher = fetch) {
  const json = await fetchJson(createHackerNewsUrl(query), "Hacker Newsを取得できませんでした", fetcher);
  return normalizeHackerNewsStories(json);
}

function candidateToNeed(candidate, now = new Date()) {
  return createNeed({
    id: `external-${candidate.candidateId}`,
    title: candidate.title,
    description: truncateText(candidate.description, 1200),
    source: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    externalId: candidate.externalId,
    sourceType: candidate.sourceType,
    fetchedAt: candidate.fetchedAt,
    createdAt: candidate.publishedAt || now.toISOString(),
    extra: { providerName: candidate.providerName, externalMetadata: candidate.metadata },
  }, now);
}

function isSavedCandidate(candidate, needs) {
  return needs.some((need) => (need.sourceUrl && need.sourceUrl === candidate.sourceUrl) || (need.sourceType && need.externalId && need.sourceType === candidate.sourceType && need.externalId === candidate.externalId));
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
  const externalForm = document.querySelector("#external-candidates-form");
  const sourceSelect = document.querySelector("#external-source");
  const queryInput = document.querySelector("#external-query");
  const candidatesMessage = document.querySelector("#external-candidates-message");
  const fetchButton = document.querySelector("#external-fetch-button");
  const candidatesList = document.querySelector("#candidates-list");
  let needs = loadNeeds();
  let candidates = [];

  function showMessage(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle("error", isError);
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
        <div class="need-actions">
          <button type="button" class="secondary-button" data-action="edit">編集</button>
          <button type="button" class="danger-button" data-action="delete">削除</button>
        </div>
      </article>`).join("");
  }

  function renderCandidates() {
    if (candidates.length === 0) {
      candidatesList.innerHTML = '<p class="empty candidate-empty">取得した課題候補はまだありません。</p>';
      return;
    }
    candidatesList.innerHTML = candidates.map((candidate) => {
      const saved = isSavedCandidate(candidate, needs);
      const tags = candidate.tags.length ? candidate.tags.map((tag) => `<span class="label-chip">${escapeHtml(tag)}</span>`).join("") : '<span class="muted-text">タグなし</span>';
      return `
        <article class="candidate-item" data-id="${escapeHtml(candidate.candidateId)}">
          <div class="candidate-heading">
            <h4>${escapeHtml(candidate.title)}</h4>
            <span class="candidate-source">${escapeHtml(candidate.sourceName)}</span>
          </div>
          <p class="candidate-body">${escapeHtml(truncateText(candidate.description) || "本文はありません。").replace(/\n/g, "<br>")}</p>
          <div class="candidate-meta">
            ${candidate.author ? `<span>投稿者：${escapeHtml(candidate.author)}</span>` : ""}
            <span>コメント：${escapeHtml(candidate.commentCount)}件</span>
            <span>スコア：${escapeHtml(candidate.score)}</span>
            ${candidate.publishedAt ? `<span>公開：${escapeHtml(formatDate(candidate.publishedAt))}</span>` : ""}
          </div>
          <div class="label-row">${tags}</div>
          <div class="candidate-actions">
            <a class="external-link" href="${escapeHtml(candidate.sourceUrl)}" target="_blank" rel="noopener noreferrer">元ページを開く</a>
            <button type="button" class="primary-button" data-action="save-candidate" ${saved ? "disabled" : ""}>${saved ? "保存済み" : "課題として保存"}</button>
          </div>
        </article>`;
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
      sourceType: existing?.sourceType || "",
      fetchedAt: existing?.fetchedAt || "",
      createdAt: existing?.createdAt,
    });
    if (!nextNeed.title) {
      showMessage(message, "タイトルを入力してください。", true);
      titleInput.focus();
      return;
    }
    needs = existing ? needs.map((need) => need.id === existing.id ? nextNeed : need) : [nextNeed, ...needs];
    saveNeeds(needs);
    resetForm();
    renderNeeds();
    renderCandidates();
    showMessage(message, existing ? "課題を更新しました。" : "課題を登録しました。");
  });

  externalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    fetchButton.disabled = true;
    showMessage(candidatesMessage, "外部情報を取得しています…");
    try {
      candidates = sourceSelect.value === "hacker_news"
        ? await fetchHackerNewsStories(queryInput.value)
        : await fetchGitHubIssues(queryInput.value);
      renderCandidates();
      showMessage(candidatesMessage, candidates.length ? `${candidates.length}件の課題候補を取得しました。内容を確認してから保存してください。` : "取得できる課題候補は0件でした。");
    } catch (error) {
      showMessage(candidatesMessage, error.message || "外部情報の取得中にエラーが発生しました。", true);
    } finally {
      fetchButton.disabled = false;
    }
  });

  candidatesList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='save-candidate']");
    if (!button) return;
    const item = button.closest(".candidate-item");
    const candidate = candidates.find((entry) => entry.candidateId === item?.dataset.id);
    if (!candidate) return;
    if (isSavedCandidate(candidate, needs)) {
      showMessage(candidatesMessage, "この課題は保存済みです。", true);
      renderCandidates();
      return;
    }
    needs = [candidateToNeed(candidate), ...needs];
    saveNeeds(needs);
    showMessage(candidatesMessage, "課題として保存しました。");
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
      showMessage(message, "編集する内容を確認してください。");
      titleInput.focus();
      return;
    }
    if (button.dataset.action === "delete" && window.confirm("この課題を削除しますか？")) {
      needs = needs.filter((entry) => entry.id !== need.id);
      saveNeeds(needs);
      renderNeeds();
      renderCandidates();
      showMessage(message, "課題を削除しました。");
      resetForm();
    }
  });

  cancelEditButton.addEventListener("click", () => {
    resetForm();
    showMessage(message, "編集を取り消しました。");
  });

  renderNeeds();
  renderCandidates();
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", setupApp);

if (typeof module !== "undefined") {
  module.exports = { STORAGE_KEY, GITHUB_ISSUES_PER_PAGE, HACKER_NEWS_PAGE_SIZE, createNeed, safeDate, normalizeNeed, loadNeeds, saveNeeds, escapeHtml, truncateText, createCandidate, isValidCandidate, parseGitHubRepo, createGitHubIssuesUrl, githubIssueToCandidate, normalizeGitHubIssues, fetchGitHubIssues, createHackerNewsUrl, hackerNewsHitToCandidate, normalizeHackerNewsStories, fetchHackerNewsStories, candidateToNeed, isSavedCandidate };
}
