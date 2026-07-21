const music = document.getElementById("backgroundMusic");
const prerollMusic = document.getElementById("backgroundMusicPreroll");
const pages = Array.from(document.querySelectorAll(".page"));
const dots = Array.from(document.querySelectorAll(".dot"));
const inviteeNameEl = document.getElementById("inviteeName");
const confirmButtons = Array.from(document.querySelectorAll("[data-attendance]"));
const responsePopup = document.getElementById("responsePopup");
const responseOverlay = document.getElementById("responseOverlay");

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

function playMainMusic() {
  if (!music || musicStarted) {
    return;
  }

  musicStarted = true;
  music.currentTime = 0;
  music.volume = 1;
  const playPromise = music.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        music.muted = false;
      })
      .catch(() => {
        musicStarted = false;
      });
  } else {
    music.muted = false;
  }
}

function startMusic() {
  if (!music || musicStarted) {
    return;
  }

  if (prerollMusic) {
    prerollMusic.currentTime = 0;
    prerollMusic.volume = 1;
    const prerollPromise = prerollMusic.play();

    if (prerollPromise && typeof prerollPromise.then === "function") {
      prerollPromise
        .then(() => {
          prerollMusic.muted = false;
          prerollMusic.addEventListener("ended", playMainMusic, { once: true });
          if (prerollMusic.currentTime >= prerollMusic.duration - 0.05) {
            playMainMusic();
          }
        })
        .catch(() => {
          playMainMusic();
        });
      return;
    }
  }

  playMainMusic();
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

window.addEventListener("load", () => {
  updateInviteeName();
  // Remove any fragment identifier on initial load so the site always
  // lands on the welcome hero instead of jumping to a different page.
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  updateActivePage("welcome");

  // Start music on first user interaction to satisfy browser autoplay policies.
  const activateMusic = () => {
    startMusic();
    document.removeEventListener("pointerdown", activateMusic);
    document.removeEventListener("touchstart", activateMusic);
    document.removeEventListener("click", activateMusic);
    document.removeEventListener("keydown", activateMusic);
  };

  document.addEventListener("pointerdown", activateMusic, { passive: true });
  document.addEventListener("touchstart", activateMusic, { passive: true });
  document.addEventListener("click", activateMusic, { passive: true });
  document.addEventListener("keydown", activateMusic, { passive: true });

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
