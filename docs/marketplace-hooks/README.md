# Kudium community hooks

Portable source packages for hooks published by Kudium HQ. Import JSON on the
marketplace publisher page to review and publish updates. Publication is separate
from committing these files or releasing the browser.

## Research for the November 14, 2026 additions

- [Mozilla built-in translation request](https://connect.mozilla.org/t5/ideas/get-built-in-translation-feature/idi-p/5347): 276 kudos and 91 comments when reviewed; marked Delivered. Supports translation as an established user need, not an unmet Firefox feature today.
- [Video Speed Controller](https://addons.mozilla.org/en-CA/firefox/addon/videospeed/): 106,950 users and 806 reviews when reviewed. Adds control to HTML videos whose players hide or limit speed settings.
- [Firefox Reader View](https://support.mozilla.org/en-US/kb/firefox-reader-view-clutter-free-web-pages): established reading feature. Article outline is a narrower navigation aid, not a full reader-mode implementation.
- [YouTube distraction userscripts](https://github.com/reysu/youtube-userscripts): precedent for reducing recommended-content distractions.

## Verification and scope

All six new packages passed the shared package parser and JavaScript/CSS source
validator. Quote, shopping and translation handlers were run with fictional
contexts and mocked output APIs; cancellation and empty selection were checked.
Video speed and article outline were run in Ego on a disposable DOM fixture:
speed change, original-speed restoration, dismissal, heading navigation, heading
updates and DOM cleanup passed. YouTube Home feed hiding and restoration were
checked on the live site. These checks do not establish full Kudium context-menu
integration, fullscreen/iframe support or compatibility with every website.

Translation prepares an AI draft and requires user submission. Shopping captures
a user-confirmed price snapshot and creates one note per product; it does not
track prices or merge an existing note. Lifecycle panels run only in loaded pages.
See each package description for compatibility limits.

## Native runtime follow-up

On November 14, 2026, the actual sandboxed lifecycle preload ran the published
Video speed controls and Article outline sources in a disposable Electron
window. Increasing speed produced 1.25×, decreasing restored 1×, dismissal hid
the panel, all three fixture headings appeared and clicking closed the outline.
Sending the production stop event removed both panels. The production action
sandbox ran Translate selection: Cancel returned no commands, while an English
answer produced one validated AI composer draft containing the French sample.
No provider request was submitted. Autofill initialization was stubbed in the
standalone lifecycle harness, following the existing native hook smoke harness;
these checks do not test autofill.

Video speed controls also installed through the verified 1.0.11 application's
marketplace UI into an isolated test profile. Full app enable/save and
context-menu integration remained unverified: automation did not obtain a saved
and running state from the site editor. This observation alone does not establish
a browser defect. The other two packages were not confirmed installed in that
profile. The user's normal stable profile was not changed.
