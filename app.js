"use strict";

const USERS_KEY = "findit_users";
const SESSION_KEY = "findit_current_user";

const loginForm = document.querySelector("#login-form");

if (loginForm) {
  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const email = loginForm.elements.email.value.trim().toLowerCase();
    const password = loginForm.elements.password.value;

    let users = [];

    try {
      users = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch {
      showMessage("Saved account data could not be read.");
      return;
    }

    const user = users.find(function (savedUser) {
      return savedUser.email === email && savedUser.password === password;
    });

    if (!user) {
      showMessage("Email or password is incorrect.");
      return;
    }

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ name: user.name, email: user.email })
    );

    window.location.href = "index.html";
  });
}

function showMessage(message) {
  let messageElement = document.querySelector("#login-message");

  if (!messageElement) {
    messageElement = document.createElement("p");
    messageElement.id = "login-message";
    messageElement.setAttribute("role", "status");
    loginForm.appendChild(messageElement);
  }

  messageElement.textContent = message;
}