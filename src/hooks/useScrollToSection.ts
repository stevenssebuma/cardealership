export function scrollToSection(sectionId: string) {
  const safeSectionId = sectionId.replace(/^#/, "").trim();

  if (!safeSectionId) {
    return;
  }

  const target = document.getElementById(safeSectionId);

  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });

    if (window.location.hash !== `#${safeSectionId}`) {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${safeSectionId}`);
    }

    return;
  }

  if (window.location.pathname === "/") {
    window.location.hash = `#${safeSectionId}`;
    return;
  }

  window.location.assign(`/#${safeSectionId}`);
}
