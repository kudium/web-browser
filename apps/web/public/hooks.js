(() => {
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-hook-site-icon')) event.target.hidden = true;
  }, true);
  // Clone server-rendered Radix controls for dynamically loaded comments/reports.
  const makeButton = () => document.querySelector('[data-hook-button-template]').content.firstElementChild.cloneNode(true);
  const makeTextarea = () => {
    const root = document.querySelector('[data-hook-textarea-template]').content.firstElementChild.cloneNode(true);
    return root.querySelector('textarea');
  };
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
          author.textContent = comment.author.name + " · @" + comment.author.username;
          const date = document.createElement("time");
          date.textContent = new Date(comment.createdAt).toLocaleDateString();
          meta.append(author, date);
          const text = document.createElement("p");
          text.textContent = comment.body;
          article.append(meta, text);
          const action = (label, callback) => {
            const button = makeButton();
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
              const input = makeTextarea();
              input.value = comment.body;
              input.maxLength = 2000;
              input.required = true;
              input.setAttribute("aria-label", "Edit comment");
              const save = makeButton();
              save.type = "submit";
              save.textContent = "Save changes";
              form.append(input.parentElement, save);
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
      const input = makeTextarea();
      input.required = true;
      input.maxLength = 2000;
      input.placeholder = "Explain what needs review…";
      label.append(input.parentElement);
      const actions = document.createElement("div");
      const submit = makeButton();
      submit.type = "submit";
      submit.textContent = "Submit report";
      const cancel = makeButton();
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
    let screenshotKeys = JSON.parse(publish.dataset.images || '[]');
    let uploading = false;
    const uploadInput = publish.querySelector('[data-hook-images]');
    const previews = publish.querySelector('[data-image-previews]');
    const uploadFeedback = publish.querySelector('[data-image-feedback]');
    const renderImages = () => {
      previews.replaceChildren();
      screenshotKeys.forEach((key,index) => {
        const card = document.createElement('div');
        const image = document.createElement('img');image.src='/hook-images/'+key+'/thumb.webp';image.alt='Screenshot '+(index+1);
        const remove = document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove screenshot '+(index+1));
        remove.onclick=()=>{if(uploading)return;screenshotKeys=screenshotKeys.filter(k=>k!==key);renderImages();};
        card.append(image,remove);previews.append(card);
      });
    };
    renderImages();
    uploadInput.addEventListener('change',async()=>{
      if(uploading)return;
      const files=[...uploadInput.files];
      if(screenshotKeys.length+files.length>3){uploadFeedback.textContent='Choose at most 3 screenshots.';uploadInput.value='';return;}
      uploading=true;uploadInput.disabled=true;publish.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=true);
      try{
        for(const file of files){
          if(file.size>5*1024*1024)throw new Error('Each screenshot must be 5 MB or smaller.');
          uploadFeedback.textContent='Compressing and uploading screenshot…';
          const body=new FormData();body.append('image',file);
          const response=await fetch('/api/hooks/images',{method:'POST',body});const result=await response.json();
          if(!response.ok)throw new Error(result.error || 'Screenshot upload failed.');
          screenshotKeys.push(result.key);renderImages();
        }
        uploadFeedback.textContent='Screenshots ready.';
      }catch(error){uploadFeedback.textContent=error.message;}
      finally{uploading=false;uploadInput.disabled=false;uploadInput.value='';publish.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false);}
    });
    const targets = publish.elements.namedItem("sites");
    const applicability = publish.elements.namedItem("applicability");
    const updateTargets = () => {
      const general = applicability.value === "general";
      targets.required = !general;
      targets.closest("label").hidden = general;
    };
    applicability.addEventListener("change", updateTargets);
    updateTargets();

    const actionsSection = publish.querySelector('[data-hook-actions]');
    const actionList = actionsSection.querySelector('[data-action-list]');
    const templates = JSON.parse(actionsSection.dataset.actionTemplates);
    const addAction = (action) => {
      if (actionList.children.length >= 20) throw new Error('Maximum twenty actions.');
      const fragment = actionsSection.querySelector('template').content.cloneNode(true);
      const card = fragment.querySelector('[data-hook-action]');
      card.querySelector('[data-action-id]').value = action?.id || crypto.randomUUID();
      if (action) {
        card.querySelector('[data-action-name]').value = action.name;
        card.querySelector('[data-action-title]').textContent = action.name;
        card.querySelector('[data-action-source]').value = action.source;
        card.querySelectorAll('[data-action-context]').forEach(input => { input.checked = action.contexts.includes(input.value); });
      }
      actionList.append(fragment);
    };
    actionsSection.querySelector('[data-add-action]').addEventListener('click', () => {
      try { const choice = actionsSection.querySelector('[data-action-example]').value; addAction(choice === 'custom' ? undefined : templates[Number(choice)]); }
      catch (e) { feedback(e.message); }
    });
    actionList.addEventListener('click', event => { if (event.target.closest('[data-remove-action]')) {
      const card = event.target.closest('[data-hook-action]');
      card.querySelectorAll('[data-code-editor]').forEach(field => field.dispatchEvent(new Event('hook-editor-destroy')));
      card.remove();
    } });
    actionList.addEventListener('input', event => { if (event.target.matches('[data-action-name]')) event.target.closest('[data-hook-action]').querySelector('[data-action-title]').textContent = event.target.value || 'Untitled action'; });
    const collectActions = () => [...actionList.querySelectorAll('[data-hook-action]')].map(card => ({
      id: card.querySelector('[data-action-id]').value || crypto.randomUUID(),
      name: card.querySelector('[data-action-name]').value,
      contexts: [...card.querySelectorAll('[data-action-context]:checked')].map(input => input.value),
      source: card.querySelector('[data-action-source]').value,
    }));

    publish.addEventListener("submit", async (event) => {
      event.preventDefault();
      if(uploading)return;
      const data = Object.fromEntries(new FormData(publish));
      const pkg = {
        schemaVersion: actionList.children.length ? 2 : 1,
        ...(actionList.children.length ? { actions: collectActions() } : {}),
        minimumBrowserVersion: data.minimumBrowserVersion,
        ...(data.testUrl?.trim() ? { testUrl: data.testUrl.trim() } : {}),
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
      const button = publish.querySelector(".hook-publish-actions button[type=submit]");
      button.disabled = true;
      feedback("Publishing…");
      try {
        const result = await api("/api/hooks/publish", "POST", {
          package: pkg,
          images: screenshotKeys,
          username: data.username,
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
          if (![1, 2].includes(pkg.schemaVersion) || !pkg.lifecycle)
            throw new Error("Unsupported hook package.");
          for (const key of [
            "name",
            "description",
            "license",
            "applicability",
            "path",
            "minimumBrowserVersion",
            "testUrl",
          ])
            if (publish.elements.namedItem(key))
              publish.elements.namedItem(key).value = pkg[key] || "";
          publish.elements.namedItem("sites").value = (pkg.sites || [])
            .map((s) => (s.includeSubdomains ? "*." : "") + s.host)
            .join(", ");
          for (const phase of ["before", "after", "css"]) {
            const field = publish.elements.namedItem(phase);
            field.value = pkg.lifecycle[phase] || "";
            field.dispatchEvent(new Event("hook-source-replaced"));
            field.closest("details").open = !!field.value.trim();
          }
          actionList.querySelectorAll("[data-code-editor]").forEach(field => field.dispatchEvent(new Event("hook-editor-destroy")));
          actionList.replaceChildren();
          (pkg.actions || []).forEach(addAction);
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
          const resolve = makeButton();
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
