// Applies the color scheme choice from the site header: auto, light or dark.
// Load it in the head without defer, so a stored choice applies before the first paint.
(function () {
  var root = document.documentElement;

  function readChoice() {
    try {
      return localStorage.getItem("theme") || "auto";
    } catch (error) {
      return "auto";
    }
  }

  function applyChoice(choice) {
    if (choice === "auto") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", choice);
    }
    var buttons = document.querySelectorAll("[data-theme-choice]");
    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-choice") === choice));
    }
    try {
      localStorage.setItem("theme", choice);
    } catch (error) {
      // Storage can be unavailable, the choice then lasts for this page view only.
    }
  }

  applyChoice(readChoice());

  document.addEventListener("DOMContentLoaded", function () {
    applyChoice(readChoice());
    var buttons = document.querySelectorAll("[data-theme-choice]");
    for (var index = 0; index < buttons.length; index += 1) {
      buttons[index].addEventListener("click", function (event) {
        applyChoice(event.currentTarget.getAttribute("data-theme-choice"));
      });
    }
  });
})();
