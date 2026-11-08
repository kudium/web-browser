const showcase = document.querySelector(".hero-showcase");
if (showcase) {
  const track = showcase.querySelector(".hero-slides");
  const slides = [...track.children];
  const tabs = [...showcase.querySelectorAll("[data-slide]")];
  let current = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let timer;
  let hovered = false;
  function schedule() {
    clearTimeout(timer);
    if (
      slides.length < 2 ||
      reduced.matches ||
      document.hidden ||
      hovered ||
      showcase.contains(document.activeElement)
    ) return;
    timer = setTimeout(() => select(current + 1), 6000);
  }
  function select(index) {
    current = (index + slides.length) % slides.length;
    track.scrollTo({
      left: slides[current].offsetLeft - slides[0].offsetLeft,
      behavior: reduced.matches ? "instant" : "smooth",
    });
    schedule();
  }
  showcase.addEventListener("mouseenter", () => {
    hovered = true;
    schedule();
  });
  showcase.addEventListener("mouseleave", () => {
    hovered = false;
    schedule();
  });
  showcase.addEventListener("focusin", schedule);
  showcase.addEventListener("focusout", () => setTimeout(schedule, 0));
  track.addEventListener("pointerdown", () => clearTimeout(timer));
  track.addEventListener("scrollend", schedule);
  document.addEventListener("visibilitychange", schedule);
  reduced.addEventListener("change", schedule);
  tabs.forEach((tab, index) =>
    tab.addEventListener("click", () => select(index))
  );
  showcase
    .querySelectorAll("[data-slide-step]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        select(current + Number(button.dataset.slideStep))
      )
    );
  track.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      select(current + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          current = slides.indexOf(entry.target);
          tabs.forEach((tab, index) =>
            tab.setAttribute("aria-pressed", String(index === current))
          );
        }
    },
    { root: track, threshold: 0.6 }
  );
  slides.forEach((slide) => observer.observe(slide));
  schedule();
}

const sidebarDemo = document.querySelector(".sidebar-demo");
if (sidebarDemo) {
  const buttons = [...sidebarDemo.querySelectorAll("[data-sidebar-view]")];
  const samples = [...sidebarDemo.querySelectorAll("[data-sidebar-sample]")];
  buttons.forEach((button) =>
    button.addEventListener("click", () => {
      buttons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button))
      );
      samples.forEach((sample) => {
        sample.hidden =
          sample.dataset.sidebarSample !== button.dataset.sidebarView;
      });
    })
  );
}
