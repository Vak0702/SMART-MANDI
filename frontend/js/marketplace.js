const marketplaceContainer = document.getElementById("marketplaceContainer");
const listingForm = document.getElementById("listingForm");
const listingMessage = document.getElementById("listingMessage");

const API_BASE = window.location.protocol === "file:" || window.location.port !== "3000"
  ? "http://127.0.0.1:3000"
  : "";

function formatPrice(value) {
  return `Rs. ${Number(value).toLocaleString("en-IN")} / quintal`;
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

function listingCard(listing) {
  return `
    <article class="product-card">
      <img src="${listing.image}" alt="${listing.crop} crop listing">
      <div class="product-card-content">
        <div class="product-meta">
          <span>${listing.market}</span>
          <span class="pill ${listing.verified ? "up" : "down"}">${listing.verified ? "Verified" : "New"}</span>
        </div>
        <h3>${listing.crop}</h3>
        <p>${formatPrice(listing.price)}</p>
        <p>${listing.quantity} ${listing.unit} available</p>
        <div class="listing-actions">
          <button type="button" data-contact="${listing.id}">Contact</button>
          <button type="button" data-request="${listing.id}">Buy Request</button>
        </div>
        <div class="seller-info" id="${listing.id}">
          <p><strong>Seller:</strong> ${listing.seller}</p>
          <p><strong>Phone:</strong> ${listing.phone}</p>
        </div>
        <form class="request-form" id="request-${listing.id}" data-listing-id="${listing.id}" hidden>
          <label>
            Buyer name
            <input type="text" name="buyerName" placeholder="Your name" required>
          </label>
          <label>
            Phone
            <input type="tel" name="phone" placeholder="Mobile number" required>
          </label>
          <label>
            Message
            <input type="text" name="message" placeholder="Example: Need 10 quintal this week">
          </label>
          <button type="submit">Send Request</button>
          <p class="request-message" aria-live="polite"></p>
        </form>
      </div>
    </article>
  `;
}

function bindListingActions() {
  marketplaceContainer.querySelectorAll("[data-contact]").forEach((button) => {
    button.addEventListener("click", () => {
      const sellerBox = document.getElementById(button.dataset.contact);
      const isOpen = sellerBox.classList.toggle("show");
      button.textContent = isOpen ? "Hide Contact" : "Contact";
    });
  });

  marketplaceContainer.querySelectorAll("[data-request]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.getElementById(`request-${button.dataset.request}`);
      const isOpen = form.toggleAttribute("hidden");
      button.textContent = isOpen ? "Buy Request" : "Close Request";
    });
  });

  marketplaceContainer.querySelectorAll(".request-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = form.querySelector(".request-message");
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.listingId = form.dataset.listingId;

      try {
        const response = await fetch(`${API_BASE}/api/buy-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await readJsonResponse(response);
        if (!response.ok) throw new Error(data.error || "Could not send buy request");

        message.textContent = "Request sent. The seller can review it from the backend data.";
        message.className = "request-message success";
        form.reset();
      } catch (error) {
        message.textContent = error.message;
        message.className = "request-message error";
      }
    });
  });
}

async function loadListings() {
  try {
    const response = await fetch(`${API_BASE}/api/listings`);
    if (!response.ok) throw new Error("Could not load marketplace listings");
    const data = await readJsonResponse(response);
    marketplaceContainer.innerHTML = data.listings.map(listingCard).join("");
    bindListingActions();
  } catch (error) {
    marketplaceContainer.innerHTML = `
      <article class="product-card">
        <div class="product-card-content">
          <h3>Backend offline</h3>
          <p>${error.message}</p>
          <p>Start the Smart Mandi server to load crop listings.</p>
        </div>
      </article>
    `;
  }
}

if (listingForm) {
  listingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(listingForm);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch(`${API_BASE}/api/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Could not publish listing");

      listingMessage.textContent = `${data.listing.crop} listing published successfully.`;
      listingMessage.className = "auth-message success";
      listingForm.reset();
      loadListings();
    } catch (error) {
      listingMessage.textContent = error.message;
      listingMessage.className = "auth-message error";
    }
  });
}

loadListings();
