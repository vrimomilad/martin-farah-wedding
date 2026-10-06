// Google Apps Script web app that writes RSVPs into the Google Sheet.
// Filled in after the script is deployed (see apps-script/Code.gs).
const RSVP_ENDPOINT = "";

const EVENT = {
  title: "Martin & Farah · Dinner Reception",
  location: "Grand Plaza Hotel Internet City Dubai",
  details:
    "Dinner reception celebrating the marriage of Martin & Farah.\n" +
    "Bytes Restaurant, 4th Floor, Grand Plaza Mövenpick Media City.\n" +
    "Valet parking available. Adults-only celebration.\n" +
    "https://martinandfarah.com",
  start: "20261212T190000",
  end: "20261212T220000",
  tz: "Asia/Dubai",
};

const STORAGE_KEY = "mf-rsvp";

document.documentElement.classList.add("js");

// ───────────── Add to Google Calendar ─────────────
(function setupCalendar() {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: EVENT.title,
    dates: `${EVENT.start}/${EVENT.end}`,
    ctz: EVENT.tz,
    location: EVENT.location,
    details: EVENT.details,
  });
  document.getElementById("gcal-link").href =
    "https://calendar.google.com/calendar/render?" + params.toString();
})();

// ───────────── Gentle entrance ─────────────
(function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -6% 0px" }
  );
  // Stagger siblings within each card so the invitation "writes itself"
  document.querySelectorAll(".card").forEach((card) => {
    card.querySelectorAll(".reveal").forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i * 70, 560)}ms`;
      io.observe(el);
    });
  });
})();

// ───────────── RSVP form ─────────────
(function setupForm() {
  const form = document.getElementById("rsvp-form");
  const errorBox = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");
  const dietaryField = document.getElementById("dietary-field");
  const thanks = document.getElementById("thanks");
  const thanksMsg = document.getElementById("thanks-msg");
  const editBtn = document.getElementById("edit-rsvp");

  // Dietary requirements only matter for guests who are coming
  form.addEventListener("change", (e) => {
    if (e.target.name !== "attending") return;
    dietaryField.hidden = e.target.value === "No";
    e.target.closest(".field").classList.remove("is-invalid");
  });
  form.addEventListener("input", (e) => {
    const field = e.target.closest(".field");
    if (field) field.classList.remove("is-invalid");
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function validate(data) {
    const problems = [];
    const mark = (name) =>
      form.querySelector(`[name="${name}"]`).closest(".field").classList.add("is-invalid");

    if (data.name.length < 2) { problems.push("your full name"); mark("name"); }
    if (data.phone.replace(/[^\d]/g, "").length < 7) { problems.push("a phone number"); mark("phone"); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { problems.push("a valid email"); mark("email"); }
    if (!data.attending) { problems.push("whether you'll be attending"); mark("attending"); }

    if (!problems.length) return "";
    const list = problems.length > 1
      ? problems.slice(0, -1).join(", ") + " and " + problems.at(-1)
      : problems[0];
    return `Please add ${list}.`;
  }

  function showThanks(data, updated) {
    const first = data.name.split(/\s+/)[0];
    thanksMsg.textContent = data.attending === "Yes"
      ? `${first}, we can't wait to celebrate with you on Saturday, 12 December.${updated ? " Your reply has been updated." : ""}`
      : `${first}, we'll miss you, and we're grateful you let us know.${updated ? " Your reply has been updated." : ""}`;
    form.hidden = true;
    thanks.hidden = false;
    thanks.focus({ preventScroll: true });
  }

  editBtn.addEventListener("click", () => {
    thanks.hidden = true;
    form.hidden = false;
    form.querySelector('[name="name"]').focus();
  });

  // Returning guests see their previous reply, pre-filled for editing
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && saved.name) {
      ["name", "phone", "email", "dietary"].forEach((k) => {
        if (saved[k]) form.elements[k].value = saved[k];
      });
      const radio = form.querySelector(`[name="attending"][value="${saved.attending}"]`);
      if (radio) radio.checked = true;
      dietaryField.hidden = saved.attending === "No";
      showThanks(saved, false);
    }
  } catch (_) { /* storage unavailable: fine */ }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const fd = new FormData(form);
    const data = {
      name: (fd.get("name") || "").trim(),
      phone: (fd.get("phone") || "").trim(),
      email: (fd.get("email") || "").trim().toLowerCase(),
      attending: fd.get("attending") || "",
      dietary: fd.get("attending") === "Yes" ? (fd.get("dietary") || "").trim() : "",
      website: fd.get("website") || "",
    };

    const problem = validate(data);
    if (problem) { showError(problem); return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="button__text">Sending…</span>';

    try {
      let updated = false;
      if (RSVP_ENDPOINT) {
        const res = await fetch(RSVP_ENDPOINT, {
          method: "POST",
          body: new URLSearchParams(data), // simple request: no CORS preflight
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Request failed");
        updated = Boolean(json.updated);
      } else {
        // Local preview before the Google Sheet is connected
        await new Promise((r) => setTimeout(r, 700));
        console.info("[preview] RSVP not sent, no endpoint configured:", data);
      }

      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
      showThanks(data, updated);
    } catch (err) {
      console.error(err);
      showError("Sorry, something went wrong sending your reply. Please try again in a moment.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="button__text">Submit RSVP</span>';
    }
  });
})();
