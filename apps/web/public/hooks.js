(() => {
  const feedback = (message) => {
    const target = document.querySelector("[data-hook-feedback]");
    if (target) target.textContent = message;
  };
  async function api(path, method = "GET", body) {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }
  let loadingHooks = false;
  const more = document.querySelector("[data-hook-more]");
  if (more)
    more.addEventListener("click", async (event) => {
      event.preventDefault();
      if (loadingHooks) return;
      loadingHooks = true;
      more.setAttribute("aria-disabled", "true");
      const link = more.href;
      more.textContent = "Loading…";
      try {
        const response = await fetch(link);
        if (!response.ok) throw new Error();
        const doc = new DOMParser().parseFromString(
          await response.text(),
          "text/html"
        );
        document
          .querySelector(".hook-grid")
          .append(...doc.querySelector(".hook-grid").children);
        const next = doc.querySelector("[data-hook-more]");
        if (next) {
          more.href = next.href;
          more.textContent = "Load more hooks";
        } else more.remove();
      } catch {
        more.textContent = "Try loading again";
      } finally {
        loadingHooks = false;
        more.removeAttribute("aria-disabled");
      }
    });
  const install = document.querySelector("[data-hook-install]");
  if (install)
    install.href =
      "kudium://install-hook?url=" +
      encodeURIComponent(
        new URL(install.getAttribute("href"), location.origin).href
      );
  document
    .querySelector("[data-copy-package]")
    ?.addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(
          new URL(event.currentTarget.dataset.copyPackage, location.origin).href
        );
        feedback(
          "Install link copied. Paste it into Hooks → Install from URL in Kudium."
        );
      } catch {
        feedback(
          "Clipboard unavailable. Copy this link: " +
            new URL(event.currentTarget.dataset.copyPackage, location.origin)
              .href
        );
      }
    });
  const detail = document.querySelector("[data-hook-id]");
  if (detail) {
    const id = detail.dataset.hookId;
    const viewer = detail.dataset.viewer;
    const base = "/api/hooks/" + encodeURIComponent(id);
    let cursor;
    let loading = false;
    let pendingReset = false;
    const signIn = () => {
      location.href = "/sign-in?next=" + encodeURIComponent(location.pathname);
    };
    detail
      .querySelector("[data-hook-like]")
      ?.addEventListener("click", async (event) => {
        if (!viewer) return signIn();
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const result = await api(base + "/like", "PUT", {
            liked: button.getAttribute("aria-pressed") !== "true",
          });
          button.setAttribute("aria-pressed", String(result.liked));
          button.querySelector("[data-like-count]").textContent = result.likes;
        } catch (e) {
          feedback(e.message);
        } finally {
          button.disabled = false;
        }
      });
    async function comments(reset = false) {
      if (loading) {
        pendingReset ||= reset;
        return;
      }
      loading = true;
      try {
        const result = await api(
          "/v1/hooks/" +
            id +
            "/comments" +
            (!reset && cursor ? "?cursor=" + encodeURIComponent(cursor) : "")
        );
        const container = detail.querySelector("[data-hook-comments]");
        if (reset) container.replaceChildren();
        for (const comment of result.items) {
          const article = document.createElement("article");
          article.className = "hook-comment";
          const meta = document.createElement("div");
          const author = document.createElement("strong");
          author.textContent = comment.author.name;
          const date = document.createElement("time");
          date.textContent = new Date(comment.createdAt).toLocaleDateString();
          meta.append(author, date);
          const text = document.createElement("p");
          text.textContent = comment.body;
          article.append(meta, text);
          const action = (label, callback) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", async () => {
              button.disabled = true;
              try {
                await callback();
              } catch (e) {
                feedback(e.message);
              } finally {
                button.disabled = false;
              }
            });
            meta.append(button);
          };
          if (viewer === comment.author.id) {
            action("Edit", () => {
              if (article.querySelector("form")) return;
              const form = document.createElement("form");
              const input = document.createElement("textarea");
              input.value = comment.body;
              input.maxLength = 2000;
              input.required = true;
              input.setAttribute("aria-label", "Edit comment");
              const save = document.createElement("button");
              save.textContent = "Save changes";
              form.append(input, save);
              form.addEventListener("submit", async (event) => {
                event.preventDefault();
                save.disabled = true;
                try {
                  await api(base + "/comments/" + comment.id, "PATCH", {
                    body: input.value,
                  });
                  await comments(true);
                } catch (e) {
                  feedback(e.message);
                  save.disabled = false;
                }
              });
              article.append(form);
            });
          }
          if (viewer === comment.author.id || detail.dataset.admin === "true")
            action("Delete", async () => {
              if (!confirm("Delete this comment?")) return;
              await api(base + "/comments/" + comment.id, "DELETE", {});
              article.remove();
            });
          if (viewer) action("Report", () => reportForm(article, comment.id));
          container.append(article);
        }
        cursor = result.nextCursor;
        detail.querySelector("[data-comment-more]").hidden = !cursor;
      } catch (e) {
        feedback(e.message);
      } finally {
        loading = false;
        if (pendingReset) {
          pendingReset = false;
          await comments(true);
        }
      }
    }
    comments();
    detail
      .querySelector("[data-comment-more]")
      .addEventListener("click", () => comments());
    detail
      .querySelector("[data-hook-comment]")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector("button");
        button.disabled = true;
        try {
          await api(base + "/comments", "POST", {
            body: new FormData(form).get("body"),
          });
          form.reset();
          await comments(true);
        } catch (e) {
          feedback(e.message);
        } finally {
          button.disabled = false;
        }
      });
    function reportForm(container, commentId) {
      if (container.querySelector("[data-report-form]")) return;
      const form = document.createElement("form");
      form.dataset.reportForm = "";
      form.className = "hook-report-form";
      const label = document.createElement("label");
      label.textContent = commentId
        ? "Report this comment"
        : "Report this hook";
      const input = document.createElement("textarea");
      input.required = true;
      input.maxLength = 2000;
      input.placeholder = "Explain what needs review…";
      label.append(input);
      const actions = document.createElement("div");
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Submit report";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => form.remove());
      actions.append(submit, cancel);
      form.append(label, actions);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        try {
          await api(base + "/report", "POST", {
            reason: input.value,
            ...(commentId ? { commentId } : {}),
          });
          form.remove();
          feedback("Report submitted.");
        } catch (e) {
          feedback(e.message);
          submit.disabled = false;
        }
      });
      container.append(form);
      input.focus();
    }
    detail
      .querySelector("[data-report-hook]")
      ?.addEventListener("click", (event) =>
        reportForm(event.currentTarget.parentElement)
      );
    detail
      .querySelector("[data-hook-moderate]")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
          await api("/api/hooks/admin/" + id, "PATCH", data);
          location.reload();
        } catch (e) {
          feedback(e.message);
        }
      });
  }
  const publish = document.querySelector("[data-hook-publish]");
  if (publish) {
    const targets = publish.elements.namedItem("sites");
    const applicability = publish.elements.namedItem("applicability");
    const updateTargets = () => {
      const general = applicability.value === "general";
      targets.required = !general;
      targets.closest("label").hidden = general;
    };
    applicability.addEventListener("change", updateTargets);
    updateTargets();

    publish.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(publish));
      const pkg = {
        schemaVersion: 1,
        minimumBrowserVersion: data.minimumBrowserVersion,
        name: data.name,
        description: data.description,
        license: data.license,
        applicability: data.applicability,
        sites:
          data.applicability === "general"
            ? []
            : data.sites
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => ({
                  host: s.replace(/^\*\./, ""),
                  includeSubdomains: s.startsWith("*."),
                })),
        path: data.path,
        lifecycle: { before: data.before, after: data.after, css: data.css },
      };
      const button = publish.querySelector("button[type=submit],.hook-primary");
      button.disabled = true;
      feedback("Publishing…");
      try {
        const result = await api("/api/hooks/publish", "POST", {
          package: pkg,
          ...(publish.dataset.id
            ? {
                id: publish.dataset.id,
                expectedVersion: Number(publish.dataset.version),
              }
            : {}),
        });
        location.href = "/hooks/" + result.id;
      } catch (e) {
        feedback(e.message);
        button.disabled = false;
      }
    });
    document
      .querySelector("[data-import-hook]")
      .addEventListener("change", async (event) => {
        try {
          const file = event.target.files[0];
          if (!file) return;
          if (file.size > 256 * 1024) throw new Error("Package is too large.");
          const raw = JSON.parse(await file.text());
          const pkg = raw.package || raw;
          if (pkg.schemaVersion !== 1 || !pkg.lifecycle)
            throw new Error("Unsupported hook package.");
          for (const key of [
            "name",
            "description",
            "license",
            "applicability",
            "path",
            "minimumBrowserVersion",
          ])
            if (publish.elements.namedItem(key))
              publish.elements.namedItem(key).value = pkg[key] || "";
          publish.elements.namedItem("sites").value = (pkg.sites || [])
            .map((s) => (s.includeSubdomains ? "*." : "") + s.host)
            .join(", ");
          for (const phase of ["before", "after", "css"]) {
            const field = publish.elements.namedItem(phase);
            field.value = pkg.lifecycle[phase] || "";
            field.closest("details").open = !!field.value.trim();
          }
          updateTargets();
          feedback("Package loaded. Review it before publishing.");
        } catch (e) {
          feedback(e.message);
        } finally {
          event.target.value = "";
        }
      });
  }
  if (location.pathname === "/hooks/admin") {
    const area = document.createElement("section");
    area.className = "hook-report-list";
    area.innerHTML = "<h2>Open reports</h2>";
    document.querySelector("main").append(area);
    api("/api/hooks/admin/reports")
      .then((result) => {
        for (const report of result.items) {
          const row = document.createElement("article");
          const link = document.createElement("a");
          link.href = "/hooks/" + report.hookId;
          link.textContent = report.commentId
            ? "Reported comment"
            : "Reported hook";
          const reason = document.createElement("p");
          reason.textContent = report.reason;
          const resolve = document.createElement("button");
          resolve.textContent = "Mark resolved";
          resolve.addEventListener("click", async () => {
            try {
              await api(
                "/api/hooks/admin/reports/" + report.id + "/resolve",
                "POST",
                {}
              );
              row.remove();
            } catch (e) {
              reason.textContent = e.message;
            }
          });
          row.append(link, reason, resolve);
          area.append(row);
        }
        if (!result.items.length) area.append("No open reports.");
      })
      .catch((e) => area.append(e.message));
  }
})();
