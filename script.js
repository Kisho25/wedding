const music = document.getElementById("backgroundMusic");
const openInvitationButton = document.getElementById("openInvitation");
const story = document.querySelector(".story");
const countdown = document.getElementById("countdown");
const countdownDays = document.getElementById("countdownDays");
const countdownHours = document.getElementById("countdownHours");
const countdownMinutes = document.getElementById("countdownMinutes");
const countdownSeconds = document.getElementById("countdownSeconds");
const pages = Array.from(document.querySelectorAll(".page"));
const dots = Array.from(document.querySelectorAll(".dot"));
const inviteeNameEl = document.getElementById("inviteeName");
const confirmButtons = Array.from(document.querySelectorAll("[data-attendance]"));
const responsePopup = document.getElementById("responsePopup");
const responseOverlay = document.getElementById("responseOverlay");

const params = new URLSearchParams(window.location.search);
const inviteeName = params.get("guest") || params.get("name") || "Guest";
const guestId = params.get("id") || params.get("guestId") || slugify(inviteeName);
const responseStorageKey = `wedding-response-${guestId}`;
let autoScrollTimer = null;

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

function startAutoScroll() {
  if (autoScrollTimer || !story) {
    return;
  }

  // The opening screen is a launch screen, not part of the repeating tour.
  const invitationPages = pages.filter((page) => page.id !== "opening");

  autoScrollTimer = window.setInterval(() => {
    const currentIndex = invitationPages.findIndex((page) => page.classList.contains("is-active"));
    if (currentIndex === invitationPages.length - 1) {
      window.clearInterval(autoScrollTimer);
      autoScrollTimer = null;
      return;
    }

    const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;

    invitationPages[nextIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
  }, 6500);
}

function startMusic() {
  if (!music) {
    return Promise.resolve();
  }

  // Keep the real song's play() call inside the user's gesture. The previous
  // silent preroll delayed it, which browsers (notably iOS Safari) block.
  music.volume = 1;
  music.muted = false;
  const playPromise = music.paused ? music.play() : Promise.resolve();

  return Promise.resolve(playPromise)
    .then(() => true)
    .catch(() => false);
}

function updateCountdown() {
  if (!countdown) {
    return;
  }

  // September is daylight-saving time in Beirut (UTC+03:00).
  const weddingTime = new Date("2026-09-05T17:30:00+03:00").getTime();
  const remaining = Math.max(0, weddingTime - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (countdownDays) countdownDays.textContent = String(days);
  if (countdownHours) countdownHours.textContent = String(hours).padStart(2, "0");
  if (countdownMinutes) countdownMinutes.textContent = String(minutes).padStart(2, "0");
  if (countdownSeconds) countdownSeconds.textContent = String(seconds).padStart(2, "0");

  if (remaining === 0) {
    countdown.setAttribute("aria-label", "The wedding day is here");
  }
}

// Run as soon as this script is parsed, without waiting for images or fonts.
updateCountdown();

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

function clearStoredResponse() {
  try {
    window.localStorage.removeItem(responseStorageKey);
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
      <p class="response-popup__eyebrow">Confirmation</p>
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;

  // Show overlay and popup immediately so the user only sees the popup.
  if (responseOverlay) {
    responseOverlay.hidden = false;
    responseOverlay.setAttribute('aria-hidden', 'false');
  }
  responsePopup.classList.add("is-visible");

  if (popupTimer) {
    window.clearTimeout(popupTimer);
  }

  popupTimer = window.setTimeout(() => {
    responsePopup.classList.remove("is-visible");
    if (responseOverlay) {
      responseOverlay.hidden = true;
      responseOverlay.setAttribute('aria-hidden', 'true');
    }
  }, 1200);
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

dots.forEach((dot) => {
  dot.addEventListener("click", (event) => {
    const targetId = dot.getAttribute("href")?.slice(1);
    const targetPage = pages.find((page) => page.id === targetId);
    if (!targetPage) {
      return;
    }

    event.preventDefault();
    targetPage.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  });
});

window.addEventListener("load", () => {
  updateInviteeName();
  updateCountdown();
  window.setInterval(updateCountdown, 1000);

  // Remove any fragment identifier on initial load so the site always
  // lands on the welcome hero instead of jumping to a different page.
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  updateActivePage("opening");

  if (params.get("reset") === "1") {
    clearStoredResponse();
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("reset");
    history.replaceState(null, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }

  if (openInvitationButton) {
    openInvitationButton.addEventListener("click", () => {
      // Calling play() directly in this button handler preserves the browser's
      // user-gesture permission for audible music on mobile devices.
      startMusic();
      document.body.classList.remove("invitation-locked");
      document.getElementById("welcome")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
      startAutoScroll();
    });
  }

  setButtonsDisabled(false);
});

confirmButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    // Prevent any default UI changes or anchor navigation.
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
      event.stopPropagation();
    }
    const attendance = button.getAttribute("data-attendance");
    if (!attendance) {
      return;
    }

    setButtonsDisabled(true);
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

    // Save the response in the background after showing the final message.
    saveAttendance(attendance)
      .then(() => {
        storeResponse(attendance);
      })
      .catch((error) => {
        showPopup({
          title: "Could not save response",
          message: error.message || "There was a problem saving your answer.",
        });
        setButtonsDisabled(false);
      });
  });
});
