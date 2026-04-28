import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const STORAGE_KEY = "speed-pedelec-paklijst-v1";
const firebaseConfig = {
  apiKey: "AIzaSyCJGi1XsCwT3Mbyqcjw_G7JHO79MBbe_bU",
  authDomain: "paklijst-speedbike.firebaseapp.com",
  projectId: "paklijst-speedbike",
  storageBucket: "paklijst-speedbike.firebasestorage.app",
  messagingSenderId: "443623093603",
  appId: "1:443623093603:web:c846ad5d168c1471758f56",
  measurementId: "G-TXFFK8HK5W",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const dom = {
  tabs: document.getElementById("tabs"),
  categories: document.getElementById("categories"),
  activeTabTitle: document.getElementById("activeTabTitle"),
  progressText: document.getElementById("progressText"),
  progressBar: document.getElementById("progressBar"),
  addTabBtn: document.getElementById("addTabBtn"),
  editTabBtn: document.getElementById("editTabBtn"),
  deleteTabBtn: document.getElementById("deleteTabBtn"),
  resetChecksBtn: document.getElementById("resetChecksBtn"),
  addCategoryBtn: document.getElementById("addCategoryBtn"),
  sheetDialog: document.getElementById("sheetDialog"),
  sheetForm: document.getElementById("sheetForm"),
  sheetTitle: document.getElementById("sheetTitle"),
  nameLabel: document.getElementById("nameLabel"),
  nameInput: document.getElementById("nameInput"),
  saveSheetBtn: document.getElementById("saveSheetBtn"),
  cancelSheetBtn: document.getElementById("cancelSheetBtn"),
};

let sheetSubmit = null;
let user = null;
let userDocRef = null;
let unsubscribeCloud = null;
let isApplyingCloudState = false;
let hasLoadedCloudOnce = false;
let authMessage = "";

let state = loadState();

createAuthPanel();
render();
bindEvents();
bindAuthEvents();
watchAuth();
registerServiceWorker();

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
        return parsed;
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const summerId = createId();
  const winterId = createId();
  return {
    activeTabId: summerId,
    tabs: [
      {
        id: summerId,
        name: "Zomer",
        categories: [
          {
            id: createId(),
            name: "Bescherming",
            items: [
              item("Helm"),
              item("Zonnebril"),
              item("Zomerhandschoenen"),
              item("Regenjack"),
            ],
          },
          {
            id: createId(),
            name: "Werk",
            items: [item("Laptop"), item("Telefoon"), item("Sleutels"), item("Lunch")],
          },
          {
            id: createId(),
            name: "Fiets",
            items: [item("Accu opgeladen"), item("Slot"), item("Bidon")],
          },
        ],
      },
      {
        id: winterId,
        name: "Winter",
        categories: [
          {
            id: createId(),
            name: "Warm blijven",
            items: [
              item("Winterhandschoenen"),
              item("Nekwarmer"),
              item("Warme sokken"),
              item("Reflectievest"),
            ],
          },
          {
            id: createId(),
            name: "Werk",
            items: [item("Laptop"), item("Telefoon"), item("Sleutels"), item("Lunch")],
          },
          {
            id: createId(),
            name: "Fiets",
            items: [item("Accu opgeladen"), item("Slot"), item("Verlichting getest")],
          },
        ],
      },
    ],
  };
}

function item(name) {
  return {
    id: createId(),
    name,
    checked: false,
  };
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveCloudState();
}

function bindEvents() {
  dom.addTabBtn.addEventListener("click", addTab);
  dom.editTabBtn.addEventListener("click", renameActiveTab);
  dom.deleteTabBtn.addEventListener("click", deleteActiveTab);
  dom.resetChecksBtn.addEventListener("click", resetActiveChecks);
  dom.addCategoryBtn.addEventListener("click", addCategory);
  dom.tabs.addEventListener("click", selectTab);
  dom.categories.addEventListener("click", handleCategoryClick);
  dom.categories.addEventListener("change", handleItemCheck);
  dom.cancelSheetBtn.addEventListener("click", closeSheet);
  dom.sheetDialog.addEventListener("click", closeSheetFromBackdrop);
  dom.sheetForm.addEventListener("submit", submitSheet);
}

function getActiveTab() {
  let activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab) {
    activeTab = state.tabs[0];
    state.activeTabId = activeTab.id;
    saveState();
  }
  return activeTab;
}

function getTabStats(tab) {
  const items = tab.categories.flatMap((category) => category.items);
  const checked = items.filter((entry) => entry.checked).length;
  return {
    total: items.length,
    checked,
    percent: items.length ? Math.round((checked / items.length) * 100) : 0,
  };
}

function render() {
  renderAuth();
  renderTabs();
  renderActiveTab();
}

function createAuthPanel() {
  const panel = document.createElement("section");
  panel.className = "auth-panel";
  panel.innerHTML = `
    <div class="auth-status">
      <h2 id="authTitle">Online opslag</h2>
      <p id="authText">Log in om je lijst op je iPhone en laptop gelijk te houden.</p>
    </div>
    <form class="auth-form" id="authForm">
      <label class="auth-field">
        <span>E-mail</span>
        <input id="emailInput" type="email" autocomplete="email" required />
      </label>
      <label class="auth-field">
        <span>Wachtwoord</span>
        <input id="passwordInput" type="password" autocomplete="current-password" required minlength="6" />
      </label>
      <div class="auth-buttons">
        <button class="auth-button primary" type="submit" data-auth-action="login">Log in</button>
        <button class="auth-button" type="button" id="signupBtn">Account maken</button>
        <button class="auth-button" type="button" id="logoutBtn" hidden>Log uit</button>
      </div>
      <p class="auth-message" id="authMessage" aria-live="polite"></p>
    </form>
  `;
  document.querySelector(".content").prepend(panel);

  dom.authPanel = panel;
  dom.authTitle = panel.querySelector("#authTitle");
  dom.authText = panel.querySelector("#authText");
  dom.authForm = panel.querySelector("#authForm");
  dom.emailInput = panel.querySelector("#emailInput");
  dom.passwordInput = panel.querySelector("#passwordInput");
  dom.signupBtn = panel.querySelector("#signupBtn");
  dom.logoutBtn = panel.querySelector("#logoutBtn");
  dom.authMessage = panel.querySelector("#authMessage");
}

function bindAuthEvents() {
  dom.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    login();
  });
  dom.signupBtn.addEventListener("click", signup);
  dom.logoutBtn.addEventListener("click", logout);
}

function watchAuth() {
  onAuthStateChanged(auth, async (nextUser) => {
    user = nextUser;
    hasLoadedCloudOnce = false;
    authMessage = "";

    if (unsubscribeCloud) {
      unsubscribeCloud();
      unsubscribeCloud = null;
    }

    if (!user) {
      userDocRef = null;
      render();
      return;
    }

    userDocRef = doc(db, "users", user.uid);
    await ensureCloudDocument();
    subscribeCloudState();
    render();
  });
}

async function ensureCloudDocument() {
  if (!userDocRef) return;
  try {
    const snapshot = await getDoc(userDocRef);
    if (!snapshot.exists()) {
      await setDoc(userDocRef, {
        owner: user.uid,
        list: stripRuntimeState(state),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    authMessage = getFriendlyAuthError(error);
    renderAuth();
  }
}

function subscribeCloudState() {
  if (!userDocRef) return;

  unsubscribeCloud = onSnapshot(
    userDocRef,
    (snapshot) => {
      const cloudList = snapshot.data()?.list;
      if (!cloudList || !Array.isArray(cloudList.tabs) || !cloudList.tabs.length) {
        return;
      }

      isApplyingCloudState = true;
      state = cloudList;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      isApplyingCloudState = false;
      hasLoadedCloudOnce = true;
      render();
    },
    (error) => {
      authMessage = getFriendlyAuthError(error);
      renderAuth();
    }
  );
}

async function saveCloudState() {
  if (!userDocRef || isApplyingCloudState) return;

  try {
    await setDoc(
      userDocRef,
      {
        owner: user.uid,
        list: stripRuntimeState(state),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    authMessage = getFriendlyAuthError(error);
    renderAuth();
  }
}

function stripRuntimeState(value) {
  return JSON.parse(JSON.stringify(value));
}

async function login() {
  authMessage = "";
  setAuthBusy(true);
  try {
    await signInWithEmailAndPassword(auth, dom.emailInput.value.trim(), dom.passwordInput.value);
    dom.passwordInput.value = "";
  } catch (error) {
    authMessage = getFriendlyAuthError(error);
  } finally {
    setAuthBusy(false);
    renderAuth();
  }
}

async function signup() {
  authMessage = "";
  setAuthBusy(true);
  try {
    await createUserWithEmailAndPassword(auth, dom.emailInput.value.trim(), dom.passwordInput.value);
    dom.passwordInput.value = "";
  } catch (error) {
    authMessage = getFriendlyAuthError(error);
  } finally {
    setAuthBusy(false);
    renderAuth();
  }
}

async function logout() {
  authMessage = "";
  await signOut(auth);
}

function setAuthBusy(isBusy) {
  dom.authForm.querySelectorAll("button, input").forEach((element) => {
    element.disabled = isBusy;
  });
}

function renderAuth() {
  if (!dom.authPanel) return;

  const loggedIn = Boolean(user);
  dom.authPanel.classList.toggle("signed-in", loggedIn);
  dom.authTitle.textContent = loggedIn ? "Online opgeslagen" : "Online opslag";
  dom.authText.textContent = loggedIn
    ? `${user.email} ${hasLoadedCloudOnce ? "is gesynchroniseerd." : "wordt geladen..."}`
    : "Log in om je lijst op je iPhone en laptop gelijk te houden.";
  dom.emailInput.hidden = loggedIn;
  dom.passwordInput.hidden = loggedIn;
  dom.authForm.querySelectorAll(".auth-field").forEach((field) => {
    field.hidden = loggedIn;
  });
  dom.signupBtn.hidden = loggedIn;
  dom.logoutBtn.hidden = !loggedIn;
  dom.authForm.querySelector("[data-auth-action='login']").hidden = loggedIn;
  dom.authMessage.textContent = authMessage;
}

function renderTabs() {
  dom.tabs.innerHTML = state.tabs
    .map((tab) => {
      const stats = getTabStats(tab);
      const selected = tab.id === state.activeTabId;
      const count = stats.total ? `${stats.checked}/${stats.total}` : "0";
      return `
        <button class="tab-button" type="button" role="tab" data-tab-id="${tab.id}" aria-selected="${selected}">
          <span class="tab-name">${escapeHtml(tab.name)}</span>
          <span class="tab-count">${count}</span>
        </button>
      `;
    })
    .join("");
}

function renderActiveTab() {
  const tab = getActiveTab();
  const stats = getTabStats(tab);

  dom.activeTabTitle.textContent = tab.name;
  dom.progressText.textContent = stats.total
    ? `${stats.checked} van ${stats.total} afgevinkt`
    : "Nog geen items";
  dom.progressBar.style.width = `${stats.percent}%`;
  dom.deleteTabBtn.disabled = state.tabs.length < 2;
  dom.resetChecksBtn.disabled = stats.checked === 0;

  if (!tab.categories.length) {
    dom.categories.innerHTML = `
      <div class="empty-state">
        <h3>Nog geen categorieën</h3>
        <p>Bijvoorbeeld kleding, fiets of werk.</p>
      </div>
    `;
    return;
  }

  dom.categories.innerHTML = tab.categories
    .map((category) => renderCategory(category))
    .join("");
}

function renderCategory(category) {
  const checked = category.items.filter((entry) => entry.checked).length;
  const total = category.items.length;
  const subtitle = total ? `${checked} van ${total} klaar` : "Nog geen items";

  return `
    <article class="category" data-category-id="${category.id}">
      <header class="category-header">
        <div class="category-title">
          <h3>${escapeHtml(category.name)}</h3>
          <p>${subtitle}</p>
        </div>
        <div class="category-actions">
          <button class="icon-button compact" type="button" data-action="add-item" aria-label="Item toevoegen" title="Item toevoegen">
            <svg class="icon"><use href="#icon-plus"></use></svg>
          </button>
          <button class="icon-button compact" type="button" data-action="rename-category" aria-label="Categorie hernoemen" title="Categorie hernoemen">
            <svg class="icon"><use href="#icon-pencil"></use></svg>
          </button>
          <button class="icon-button compact danger" type="button" data-action="delete-category" aria-label="Categorie verwijderen" title="Categorie verwijderen">
            <svg class="icon"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      </header>
      ${
        category.items.length
          ? `<ul class="item-list">${category.items.map((entry) => renderItem(entry)).join("")}</ul>`
          : `<p class="empty-list">Geen items</p>`
      }
    </article>
  `;
}

function renderItem(entry) {
  const checked = entry.checked ? "checked" : "";
  return `
    <li class="item-row" data-item-id="${entry.id}">
      <label class="item-check">
        <input class="check-input" type="checkbox" ${checked} aria-label="${escapeHtml(entry.name)} afvinken" />
        <span class="check-visual">
          <svg class="icon"><use href="#icon-check"></use></svg>
        </span>
        <span class="item-name">${escapeHtml(entry.name)}</span>
      </label>
      <div class="item-actions">
        <button class="icon-button compact" type="button" data-action="rename-item" aria-label="Item hernoemen" title="Item hernoemen">
          <svg class="icon"><use href="#icon-pencil"></use></svg>
        </button>
        <button class="icon-button compact danger" type="button" data-action="delete-item" aria-label="Item verwijderen" title="Item verwijderen">
          <svg class="icon"><use href="#icon-trash"></use></svg>
        </button>
      </div>
    </li>
  `;
}

function selectTab(event) {
  const button = event.target.closest("[data-tab-id]");
  if (!button) return;

  state.activeTabId = button.dataset.tabId;
  saveState();
  render();
}

function handleCategoryClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const categoryElement = button.closest("[data-category-id]");
  const category = findCategory(categoryElement?.dataset.categoryId);
  if (!category) return;

  const itemElement = button.closest("[data-item-id]");
  const entry = itemElement ? findItem(category, itemElement.dataset.itemId) : null;

  switch (button.dataset.action) {
    case "add-item":
      addItem(category);
      break;
    case "rename-category":
      renameCategory(category);
      break;
    case "delete-category":
      deleteCategory(category);
      break;
    case "rename-item":
      if (entry) renameItem(category, entry);
      break;
    case "delete-item":
      if (entry) deleteItem(category, entry);
      break;
  }
}

function handleItemCheck(event) {
  const checkbox = event.target.closest(".check-input");
  if (!checkbox) return;

  const categoryElement = checkbox.closest("[data-category-id]");
  const itemElement = checkbox.closest("[data-item-id]");
  const category = findCategory(categoryElement?.dataset.categoryId);
  const entry = category ? findItem(category, itemElement?.dataset.itemId) : null;

  if (!entry) return;
  entry.checked = checkbox.checked;
  saveState();
  render();
}

function addTab() {
  openNameSheet({
    title: "Nieuw tabblad",
    label: "Naam tabblad",
    value: "",
    placeholder: "Bijvoorbeeld Herfst",
    saveLabel: "Maak aan",
    onSubmit(name) {
      const id = createId();
      state.tabs.push({
        id,
        name,
        categories: [],
      });
      state.activeTabId = id;
      saveState();
      render();
    },
  });
}

function renameActiveTab() {
  const tab = getActiveTab();
  openNameSheet({
    title: "Tabblad",
    label: "Naam tabblad",
    value: tab.name,
    placeholder: "Naam",
    saveLabel: "Bewaar",
    onSubmit(name) {
      tab.name = name;
      saveState();
      render();
    },
  });
}

function deleteActiveTab() {
  if (state.tabs.length < 2) return;

  const tab = getActiveTab();
  const confirmed = confirm(`Verwijder tabblad "${tab.name}"?`);
  if (!confirmed) return;

  state.tabs = state.tabs.filter((entry) => entry.id !== tab.id);
  state.activeTabId = state.tabs[0].id;
  saveState();
  render();
}

function resetActiveChecks() {
  const tab = getActiveTab();
  tab.categories.forEach((category) => {
    category.items.forEach((entry) => {
      entry.checked = false;
    });
  });
  saveState();
  render();
}

function addCategory() {
  const tab = getActiveTab();
  openNameSheet({
    title: "Nieuwe categorie",
    label: "Naam categorie",
    value: "",
    placeholder: "Bijvoorbeeld Regen",
    saveLabel: "Maak aan",
    onSubmit(name) {
      tab.categories.push({
        id: createId(),
        name,
        items: [],
      });
      saveState();
      render();
    },
  });
}

function renameCategory(category) {
  openNameSheet({
    title: "Categorie",
    label: "Naam categorie",
    value: category.name,
    placeholder: "Naam",
    saveLabel: "Bewaar",
    onSubmit(name) {
      category.name = name;
      saveState();
      render();
    },
  });
}

function deleteCategory(category) {
  const confirmed = confirm(`Verwijder categorie "${category.name}"?`);
  if (!confirmed) return;

  const tab = getActiveTab();
  tab.categories = tab.categories.filter((entry) => entry.id !== category.id);
  saveState();
  render();
}

function addItem(category) {
  openNameSheet({
    title: "Nieuw item",
    label: "Naam item",
    value: "",
    placeholder: "Bijvoorbeeld Regenbroek",
    saveLabel: "Maak aan",
    onSubmit(name) {
      category.items.push(item(name));
      saveState();
      render();
    },
  });
}

function renameItem(category, entry) {
  openNameSheet({
    title: "Item",
    label: "Naam item",
    value: entry.name,
    placeholder: "Naam",
    saveLabel: "Bewaar",
    onSubmit(name) {
      entry.name = name;
      saveState();
      render();
    },
  });
}

function deleteItem(category, entry) {
  const confirmed = confirm(`Verwijder item "${entry.name}"?`);
  if (!confirmed) return;

  category.items = category.items.filter((candidate) => candidate.id !== entry.id);
  saveState();
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function getFriendlyAuthError(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "Dit e-mailadres heeft al een account. Log in met je bestaande wachtwoord.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail of wachtwoord klopt niet.";
    case "auth/weak-password":
      return "Kies een wachtwoord van minimaal 6 tekens.";
    case "auth/invalid-email":
      return "Vul een geldig e-mailadres in.";
    case "permission-denied":
      return "Firebase-regels blokkeren dit nog. Controleer de Firestore-regels.";
    default:
      return "Online opslag lukte niet. Probeer het opnieuw.";
  }
}

function openNameSheet({ title, label, value, placeholder, saveLabel, onSubmit }) {
  sheetSubmit = onSubmit;
  dom.sheetTitle.textContent = title;
  dom.nameLabel.textContent = label;
  dom.nameInput.value = value;
  dom.nameInput.placeholder = placeholder;
  dom.saveSheetBtn.textContent = saveLabel;

  if (typeof dom.sheetDialog.showModal === "function") {
    dom.sheetDialog.showModal();
  } else {
    dom.sheetDialog.setAttribute("open", "");
  }

  requestAnimationFrame(() => {
    dom.nameInput.focus();
    dom.nameInput.select();
  });
}

function submitSheet(event) {
  event.preventDefault();
  const name = dom.nameInput.value.trim();
  if (!name || !sheetSubmit) {
    dom.nameInput.focus();
    return;
  }

  sheetSubmit(name);
  closeSheet();
}

function closeSheet() {
  sheetSubmit = null;
  if (dom.sheetDialog.open) {
    dom.sheetDialog.close();
  } else {
    dom.sheetDialog.removeAttribute("open");
  }
}

function closeSheetFromBackdrop(event) {
  if (event.target === dom.sheetDialog) {
    closeSheet();
  }
}

function findCategory(categoryId) {
  return getActiveTab().categories.find((category) => category.id === categoryId);
}

function findItem(category, itemId) {
  return category.items.find((entry) => entry.id === itemId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
