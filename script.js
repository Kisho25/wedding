const music = document.getElementById("backgroundMusic");
const pages = Array.from(document.querySelectorAll(".page"));
const dots = Array.from(document.querySelectorAll(".dot"));
const inviteeNameEl = document.getElementById("inviteeName");
const confirmButtons = Array.from(document.querySelectorAll("[data-attendance]"));
const responsePopup = document.getElementById("responsePopup");

const params = new URLSearchParams(window.location.search);
const inviteeName = params.get("guest") || params.get("name") || "Guest";
const guestId = params.get("id") || params.get("guestId") || slugify(inviteeName);
let musicStarted = false;
const responseStorageKey = `wedding-response-${guestId}`;

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "guest"
  );
}

function updateInviteeName() {
  if (inviteeNameEl) {
    inviteeNameEl.textContent = inviteeName;
  }

  document.title = `${inviteeName} | Wedding Invitation`;
}

function updateActivePage(id) {
  pages.forEach((page) => {
    page.classList.toggle("is-active", page.id === id);
  });

  dots.forEach((dot) => {
    dot.classList.toggle("is-active", dot.getAttribute("href") === `#${id}`);
  });
}

function startMusic() {
  if (musicStarted) {
    return;
  }

  musicStarted = true;
  music.play().catch(() => {
    musicStarted = false;
  });
}

function setButtonsDisabled(disabled) {
  confirmButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function getStoredResponse() {
  try {
    return window.localStorage.getItem(responseStorageKey);
  } catch {
    return null;
  }
}

function storeResponse(attendance) {
  try {
    window.localStorage.setItem(responseStorageKey, attendance);
  } catch {
    // Ignore storage failures.
  }
}

async function registerInvite() {
  await fetch("/api/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      guestId,
      inviteeName,
      pageUrl: window.location.href,
    }),
  });
}

async function saveAttendance(attendance) {
  const response = await fetch("/api/rsvp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      guestId,
      inviteeName,
      name: inviteeName,
      attendance,
      guests: 0,
      message: "",
      pageUrl: window.location.href,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Attendance could not be saved.");
  }

  return response.json();
}

let popupTimer = null;

function showPopup({ title, message }) {
  if (!responsePopup) {
    return;
  }

  responsePopup.innerHTML = `
    <div class="response-popup__card">
      <p class="response-popup__eyebrow">Confirmation saved</p>
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;

  responsePopup.classList.add("is-visible");

  if (popupTimer) {
    window.clearTimeout(popupTimer);
  }

  popupTimer = window.setTimeout(() => {
    responsePopup.classList.remove("is-visible");
  }, 2600);
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        updateActivePage(entry.target.id);
      }
    });
  },
  {
    root: document.querySelector(".story"),
    threshold: 0.6,
  },
);

pages.forEach((page) => observer.observe(page));

document.addEventListener("pointerdown", startMusic, { once: true });
document.addEventListener("touchstart", startMusic, { once: true, passive: true });

window.addEventListener("load", () => {
  updateInviteeName();
  // Remove any fragment identifier on initial load so the site always
  // lands on the welcome hero instead of jumping to a different page.
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  updateActivePage("welcome");
  startMusic();
  registerInvite().catch(() => {});

  const storedResponse = getStoredResponse();
  if (storedResponse) {
    setButtonsDisabled(true);
    if (responsePopup) {
      responsePopup.classList.remove("is-visible");
      responsePopup.innerHTML = "";
    }
  }
});

confirmButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const attendance = button.getAttribute("data-attendance");
    if (!attendance) {
      return;
    }

    setButtonsDisabled(true);

    try {
      await saveAttendance(attendance);
      storeResponse(attendance);

      showPopup(
        attendance === "yes"
          ? {
              title: "Thank you",
              message: "We are looking forward to celebrating with you.",
            }
          : {
              title: "Thank you for letting us know",
              message: "We will miss you, but we appreciate your response.",
            },
      );
    } catch (error) {
      showPopup({
        title: "Could not save response",
        message: error.message || "There was a problem saving your answer.",
      });
      setButtonsDisabled(false);
    }
  });
});
