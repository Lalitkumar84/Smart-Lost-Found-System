"use strict";

const TOKEN_KEY = "findit_token";
const USER_KEY = "findit_current_user";

function showMessage(form, message, isError = true) {
  let output = form.querySelector(".form-message");
  if (!output) {
    output = document.createElement("p");
    output.className = "form-message";
    output.setAttribute("role", "status");
    form.appendChild(output);
  }
  output.textContent = message;
  output.style.color = isError ? "#b42318" : "#23765f";
}

async function apiRequest(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("Could not reach the server. Make sure npm run dev is running.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed. Please try again.");
  return data;
}

function saveSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "login.html";
}

function setupRegisterForm() {
  const form = document.querySelector("#register-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const confirmPassword = form.elements.confirmPassword.value;
    if (password !== confirmPassword) return showMessage(form, "The passwords do not match.");

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });
      saveSession(result);
      showMessage(form, "Account created. Opening the app…", false);
      window.setTimeout(() => { window.location.href = "index.html"; }, 600);
    } catch (error) {
      showMessage(form, error.message);
    } finally {
      button.disabled = false;
    }
  });
}

function setupLoginForm() {
  const form = document.querySelector("#login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.elements.email.value.trim().toLowerCase(),
          password: form.elements.password.value
        })
      });
      saveSession(result);
      window.location.href = "index.html";
    } catch (error) {
      showMessage(form, error.message);
    } finally {
      button.disabled = false;
    }
  });
}

function setupLogoutButton() {
  const button = document.querySelector("#logout-button");
  if (button) button.addEventListener("click", logout);
}

function setupAuthNavigation() {
  const link = document.querySelector("#auth-link");
  const user = getCurrentUser();
  if (link && user) {
    link.textContent = `Log out (${user.name})`;
    link.href = "#logout";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      logout();
    });
  }
}

function setupWelcomeMessage() {
  const target = document.querySelector("#welcome-message");
  const user = getCurrentUser();
  if (target && user) target.textContent = `Welcome, ${user.name}!`;
}

function makeItemCard(item) {
  const card = document.createElement("article");
  card.className = "item-card";

  const imageArea = document.createElement("div");
  imageArea.className = "item-image";
  imageArea.style.backgroundColor = item.type === "found" ? "#edf2e8" : "#f8eee3";
  if (item.image) {
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = item.title;
    image.style.cssText = "width:100%;height:100%;object-fit:cover";
    imageArea.appendChild(image);
  } else {
    const icon = document.createElement("span");
    icon.textContent = item.type === "found" ? "🔎" : "📦";
    imageArea.appendChild(icon);
  }

  const tag = document.createElement("span");
  tag.className = `tag ${item.type === "found" ? "tag-found" : "tag-lost"}`;
  tag.textContent = item.type === "found" ? "Found" : "Lost";
  imageArea.appendChild(tag);

  const details = document.createElement("div");
  details.className = "item-details";
  const titleRow = document.createElement("div");
  titleRow.className = "item-title-row";
  const title = document.createElement("h3");
  title.textContent = item.title;
  const date = document.createElement("span");
  date.className = "item-date";
  date.textContent = item.date ? new Date(`${item.date}T00:00:00`).toLocaleDateString() : "Date unknown";
  titleRow.append(title, date);

  const location = document.createElement("p");
  location.textContent = item.location;
  const description = document.createElement("p");
  description.textContent = item.description || "No description provided.";
  const category = document.createElement("span");
  category.className = "category";
  category.textContent = item.category;
  details.append(titleRow, location, description, category);
  card.append(imageArea, details);
  return card;
}

async function loadItems() {
  const grid = document.querySelector("#item-grid");
  if (!grid) return;
  try {
    const items = await apiRequest("/api/items");
    grid.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No community reports yet. Be the first to report an item.";
      grid.appendChild(empty);
      return;
    }
    items.forEach((item) => grid.appendChild(makeItemCard(item)));
  } catch (error) {
    grid.replaceChildren();
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = error.message;
    grid.appendChild(message);
  }
}

function readOptionalImage(file) {
  if (!file) return Promise.resolve("");
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Please choose an image file."));
  if (file.size > 1024 * 1024) return Promise.reject(new Error("Please choose an image smaller than 1 MB."));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function setupReportForm() {
  const form = document.querySelector(".report-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!localStorage.getItem(TOKEN_KEY)) {
      showMessage(form, "Please log in before submitting a report.");
      window.setTimeout(() => { window.location.href = "login.html"; }, 1000);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const image = await readOptionalImage(form.elements.image.files[0]);
      const item = await apiRequest("/api/items", {
        method: "POST",
        body: JSON.stringify({
          type: form.elements["report-type"].value,
          title: form.elements.title.value.trim(),
          category: form.elements.category.value,
          location: form.elements.location.value.trim(),
          date: form.elements.date.value,
          description: form.elements.description.value.trim(),
          image
        })
      });
      showMessage(form, "Your report was saved to MongoDB.", false);
      form.reset();
      await loadItems();
      document.querySelector("#items")?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      showMessage(form, error.message || "The report could not be saved.");
    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupRegisterForm();
  setupLoginForm();
  setupLogoutButton();
  setupAuthNavigation();
  setupWelcomeMessage();
  setupReportForm();
  loadItems();
});
