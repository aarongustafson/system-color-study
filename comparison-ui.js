const byId = (id) => document.getElementById(id);

export function report(error) {
  console.error("System color study:", error);
  byId("status").textContent = "The operation failed. See the error message.";
  byId("error").textContent =
    error instanceof Error ? error.message : String(error);
  byId("error").hidden = false;
}

export function clearError() {
  byId("error").hidden = true;
}

export function enhanceComparisons() {
  const toggleDeprecated = () => {
    for (const body of document.querySelectorAll("tbody[data-deprecated]"))
      body.hidden = !byId("deprecated").checked;
  };
  byId("deprecated").addEventListener("change", toggleDeprecated);
  toggleDeprecated();

  const headerObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          const tables = new Set(
            entries.map(({ target }) =>
              target.tagName === "THEAD"
                ? target.parentElement
                : target.querySelector("table"),
            ),
          );
          for (const table of tables) {
            table.dataset.stickyHeader = String(
              table.parentElement.clientHeight -
                table.tHead.getBoundingClientRect().height >=
                128,
            );
          }
        })
      : null;
  for (const id of [
    "individual-table",
    "pair-table",
    "forced-individual-table",
    "forced-pair-table",
  ]) {
    const table = byId(id);
    headerObserver?.observe(table.tHead);
    headerObserver?.observe(table.parentElement);
    table.addEventListener("focusin", (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const region = table.parentElement;
      const area = region.getBoundingClientRect();
      const pinned = table.tHead.rows[0].cells[0].getBoundingClientRect();
      const target = event.target.getBoundingClientRect();
      const rtl = getComputedStyle(table).direction === "rtl";
      const left = (rtl ? area.left : pinned.right) + 6;
      const right = (rtl ? pinned.left : area.right) - 6;
      const delta =
        target.left < left
          ? target.left - left
          : target.right > right
            ? target.right - right
            : 0;
      if (delta) region.scrollBy({ left: delta, behavior: "auto" });
    });
    table.parentElement.addEventListener("keydown", (event) => {
      if (
        event.target !== table.parentElement ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      table.parentElement.scrollBy({
        left:
          event.key === "ArrowRight" ? 40 : event.key === "ArrowLeft" ? -40 : 0,
        top: event.key === "ArrowDown" ? 40 : event.key === "ArrowUp" ? -40 : 0,
        behavior: "auto",
      });
    });
  }

  document.addEventListener(
    "close",
    (event) => {
      if (
        event.target instanceof HTMLDialogElement &&
        event.target.closest("#capture-dialogs")
      )
        byId(event.target.dataset.opener)?.focus();
    },
    true,
  );
  document.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("button[commandfor]")
        : null;
    if (!button) return;
    const dialog = byId(button.getAttribute("commandfor"));
    if (
      dialog instanceof HTMLDialogElement &&
      button.getAttribute("command") === "show-modal"
    )
      dialog.dataset.opener = button.id;
    if ("commandForElement" in button) return;
    event.preventDefault();
    clearError();
    try {
      if (!(dialog instanceof HTMLDialogElement))
        throw new Error("Details dialog is unavailable.");
      if (button.getAttribute("command") === "show-modal") dialog.showModal();
      else if (button.getAttribute("command") === "close") dialog.close();
    } catch (error) {
      report(error);
    }
  });
}
