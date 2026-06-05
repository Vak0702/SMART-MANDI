const searchInput = document.getElementById("searchInput");
const avgPrice = document.getElementById("avgPrice");
const totalCrops = document.getElementById("totalCrops");
const updateTime = document.getElementById("updateTime");
const sortButton = document.getElementById("sortPrice");
const cardsContainer = document.getElementById("priceCards");
const scrollProgress = document.getElementById("scrollProgress");

const API_BASE = window.location.protocol === "file:" || window.location.port !== "3000"
  ? "http://127.0.0.1:3000"
  : "";

let prices = [];
let sortedAscending = true;

function formatPrice(value) {
  return `Rs. ${value.toLocaleString("en-IN")} / quintal`;
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

function trendClass(trend) {
  return Number(trend) >= 0 ? "trend-up" : "trend-down";
}

function renderCards(items) {
  cardsContainer.innerHTML = items.map((item) => `
    <article class="price-card">
      <div class="crop">${item.crop}</div>
      <div class="price live-price" data-price="${item.price}">${formatPrice(item.price)}</div>
      <div class="market">${item.market}</div>
      <div class="${trendClass(item.trend)}">${item.trend >= 0 ? "Up" : "Down"} ${Math.abs(item.trend)}%</div>
      <div class="market">${item.signal}</div>
    </article>
  `).join("");
}

function updateStats(items) {
  const average = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.price, 0) / items.length)
    : 0;

  if (avgPrice) avgPrice.textContent = `Rs. ${average.toLocaleString("en-IN")}`;
  if (totalCrops) totalCrops.textContent = String(items.length);
  if (updateTime) {
    updateTime.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }
}

function applyFilters() {
  const value = searchInput.value.trim().toLowerCase();
  let visiblePrices = prices.filter((item) => {
    return item.crop.toLowerCase().includes(value) || item.market.toLowerCase().includes(value);
  });

  visiblePrices = [...visiblePrices].sort((a, b) => {
    return sortedAscending ? a.price - b.price : b.price - a.price;
  });

  renderCards(visiblePrices);
  updateStats(visiblePrices);
}

async function loadPrices() {
  try {
    const response = await fetch(`${API_BASE}/api/prices`);
    if (!response.ok) throw new Error("Could not load mandi prices");
    const data = await readJsonResponse(response);
    prices = data.prices;
    applyFilters();
  } catch (error) {
    cardsContainer.innerHTML = `
      <article class="price-card">
        <div class="crop">Backend offline</div>
        <div class="market">${error.message}</div>
        <div class="market">Start the Smart Mandi server to load live demo prices.</div>
      </article>
    `;
    updateStats([]);
  }
}

function updateScrollProgress() {
  if (!scrollProgress) return;
  const scrollTop = document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  scrollProgress.style.width = `${progress}%`;
}

if (searchInput) searchInput.addEventListener("input", applyFilters);
if (sortButton) {
  sortButton.addEventListener("click", () => {
    sortedAscending = !sortedAscending;
    sortButton.textContent = sortedAscending ? "Sort by Price: Low to High" : "Sort by Price: High to Low";
    applyFilters();
  });
}
window.addEventListener("scroll", updateScrollProgress);

loadPrices();
updateScrollProgress();
setInterval(loadPrices, 5000);
