---
name: Project review
description: Review relevant project files and explain concrete bugs, risks, and improvements.
---

# Project review

Use this workflow when the user asks to review code in the current group’s linked project.

1. Use `get_project` to identify the linked folder. If no project is linked, explain what is missing.
2. Use `project_files` to read only the files relevant to the requested review.
3. Read `references/checklist.md` with `read_skill` for review guidance.
4. Explain concrete findings with file references, their effects, and suggested fixes.
5. Make edits only when the user requests fixes. Use preview versions when saving.
6. Use existing terminal permissions for any verification commands. Do not run scripts automatically.

If a required tool is unavailable, explain the limitation instead of claiming the work succeeded.
