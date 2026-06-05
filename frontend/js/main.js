const revealCards = document.querySelectorAll(".card");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("show", entry.isIntersecting);
    });
  }, { threshold: 0.2 });

  revealCards.forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.08}s`;
    observer.observe(card);
  });
} else {
  revealCards.forEach((card) => card.classList.add("show"));
}

const progressBar = document.getElementById("scroll-progress");

function updateScrollProgress() {
  if (!progressBar) return;
  const scrollTop = document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  progressBar.style.width = `${progress}%`;
}

window.addEventListener("scroll", updateScrollProgress);
updateScrollProgress();

const heroUpdate = document.getElementById("heroUpdate");
const homeTicker = document.getElementById("homeTicker");
const priceTable = document.getElementById("homePriceTable");
const authForm = document.querySelector(".auth-card");
const roleButtons = document.querySelectorAll(".role-tabs button");
const authMessage = document.getElementById("authMessage");
const authModeButton = document.getElementById("authModeButton");
const authSwitch = document.getElementById("authSwitch");
const signupFields = document.querySelectorAll(".signup-field");
const suggestionBoard = document.getElementById("suggestionBoard");
const userStatus = document.getElementById("userStatus");
const aiAdviceForm = document.getElementById("aiAdviceForm");
const aiAnswer = document.getElementById("aiAnswer");

const API_BASE = window.location.protocol === "file:" || window.location.port !== "3000"
  ? "http://127.0.0.1:3000"
  : "";

const homePrices = [
  { crop: "Wheat", market: "Delhi Mandi", price: 2420, trend: "+2.4%", signal: "Sell window" },
  { crop: "Rice", market: "Punjab Mandi", price: 3180, trend: "+1.2%", signal: "Demand high" },
  { crop: "Onion", market: "Nashik Mandi", price: 1860, trend: "-0.8%", signal: "Hold if possible" }
];

let authMode = "login";
let selectedRole = "farmer";

function formatPrice(value) {
  return `Rs. ${value.toLocaleString("en-IN")}/qtl`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Server returned an unreadable response. Please start Smart Mandi from port 3000.");
  }
}

function renderHomePrices() {
  if (heroUpdate) {
    heroUpdate.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (homeTicker) {
    homeTicker.innerHTML = homePrices.map((item) => {
      const trendClass = item.trend.startsWith("-") ? "down" : "up";
      return `
        <div class="ticker-row">
          <span>${item.crop}</span>
          <strong>${formatPrice(item.price)}</strong>
          <em class="${trendClass}">${item.trend}</em>
        </div>
      `;
    }).join("");
  }

  if (priceTable) {
    priceTable.innerHTML = homePrices.map((item) => {
      const trendClass = item.trend.startsWith("-") ? "down" : "up";
      return `
        <tr>
          <td>${item.crop}</td>
          <td>${item.market}</td>
          <td>${formatPrice(item.price)}</td>
          <td><span class="pill ${trendClass}">${item.signal}</span></td>
        </tr>
      `;
    }).join("");
  }
}

function simulateHomePriceMove() {
  homePrices.forEach((item) => {
    const change = Math.floor(Math.random() * 45) - 18;
    item.price = Math.max(500, item.price + change);
  });
  renderHomePrices();
}

renderHomePrices();

async function loadHomePrices() {
  try {
    const response = await fetch(`${API_BASE}/api/prices`);
    if (!response.ok) throw new Error("Price API failed");
    const data = await readJsonResponse(response);
    homePrices.splice(0, homePrices.length, ...data.prices.slice(0, 3).map((item) => ({
      crop: item.crop,
      market: item.market,
      price: item.price,
      trend: `${item.trend >= 0 ? "+" : ""}${item.trend}%`,
      signal: item.signal
    })));
    renderHomePrices();
  } catch {
    simulateHomePriceMove();
  }
}

async function loadSuggestion() {
  if (!suggestionBoard) return;

  try {
    const response = await fetch(`${API_BASE}/api/suggestions?crop=Wheat`);
    if (!response.ok) throw new Error("Suggestion API failed");
    const { suggestion } = await readJsonResponse(response);
    suggestionBoard.innerHTML = `
      <article>
        <span class="recommendation-score">${suggestion.score}%</span>
        <h3>${suggestion.action}: ${suggestion.crop}</h3>
        <p>${suggestion.reason}</p>
      </article>
      <article>
        <span class="recommendation-score">Live</span>
        <h3>${suggestion.market}</h3>
        <p>${formatPrice(suggestion.price)} with signal: ${suggestion.signal}.</p>
      </article>
    `;
  } catch {
    // Keep the static suggestions visible if the backend is offline.
  }
}

function setAuthMode(mode) {
  authMode = mode;
  signupFields.forEach((field) => {
    field.hidden = authMode === "login";
  });
  if (authModeButton) authModeButton.textContent = authMode === "login" ? "Login Securely" : "Create Account";
  if (authSwitch) {
    authSwitch.textContent = authMode === "login"
      ? "New here? Create a farmer or buyer account."
      : "Already registered? Login to your account.";
  }
  if (authMessage) authMessage.textContent = "";
}

function renderUserStatus(user) {
  if (!userStatus || !user) return;
  const location = user.village || "Location not added";
  const crop = user.cropPreference || "Crop preference not added";
  userStatus.hidden = false;
  userStatus.innerHTML = `
    <strong>${user.name}</strong>
    <span>${user.role} account</span>
    <span>${location}</span>
    <span>${crop}</span>
  `;
}

function restoreSavedUser() {
  try {
    const savedUser = JSON.parse(localStorage.getItem("smartMandiUser"));
    renderUserStatus(savedUser);
  } catch {
    localStorage.removeItem("smartMandiUser");
  }
}

function renderAiAnswer(data) {
  if (!aiAnswer) return;
  const providerLabel = data.provider === "ollama" ? `Ollama: ${data.model}` : "Offline fallback";
  const paragraphs = String(data.advice || "")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");

  aiAnswer.innerHTML = `
    <div class="ai-answer-meta">
      <span>${providerLabel}</span>
      ${data.note ? `<small>${data.note}</small>` : ""}
    </div>
    ${paragraphs}
  `;
}

roleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    roleButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedRole = button.dataset.role || button.textContent.trim().toLowerCase();
  });
});

if (authSwitch) {
  authSwitch.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(authForm);
    const payload = {
      name: form.get("name"),
      mobile: form.get("mobile"),
      password: form.get("password"),
      role: selectedRole,
      village: form.get("village"),
      cropPreference: form.get("cropPreference")
    };
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Authentication failed");

      localStorage.setItem("smartMandiToken", data.token);
      localStorage.setItem("smartMandiUser", JSON.stringify(data.user));
      authMessage.textContent = `Welcome, ${data.user.name}. You are logged in as ${data.user.role}.`;
      authMessage.className = "auth-message success";
      renderUserStatus(data.user);
    } catch (error) {
      authMessage.textContent = error.message;
      authMessage.className = "auth-message error";
    }
  });
}

if (aiAdviceForm) {
  aiAdviceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = aiAdviceForm.querySelector("button[type='submit']");
    const payload = Object.fromEntries(new FormData(aiAdviceForm).entries());

    aiAnswer.textContent = "Generating advice...";
    submitButton.disabled = true;

    try {
      const response = await fetch(`${API_BASE}/api/ai/advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Could not generate advice");
      renderAiAnswer(data);
    } catch (error) {
      aiAnswer.innerHTML = `<p>${error.message}</p>`;
    } finally {
      submitButton.disabled = false;
    }
  });
}

setAuthMode("login");
restoreSavedUser();
loadHomePrices();
loadSuggestion();
setInterval(loadHomePrices, 4500);
