import type { Tutorial } from "./tutorials";
import { hookPanelExamples } from "../../../packages/hooks/panel-examples";
export const hookPanelGuide: Tutorial = {
  slug: "hook-panels",
  title: "Hook output and custom panels",
  category: "Developer",
  summary:
    "Display hook results or build an interactive dashboard in the browser sidebar.",
  path: "Developer → Hook editor → After load → Examples → Panel",
  note: "Available in the development build. These APIs are not yet included in a published stable installer.",
  steps: [
    [
      "Choose an example",
      "Open a page in its tab group, open the hook developer editor, and choose a Panel example from the existing example list. Insert it into After load.",
    ],
    [
      "Run the hook",
      "Run the script on the current page or use the isolated hook test. Examples reveal their output in the existing Panels sidebar. Save and enable a hook to run it on matching pages.",
    ],
    [
      "Keep the work in context",
      "Use Auto to follow the current group or the existing group picker to select a group. Panels share the browser header, docking and link handling. Hiding or switching pages does not rerun the hook.",
    ],
  ],
  sections: [
    {
      id: "structured-output",
      title: "Structured output",
      paragraphs: [
        "Use context.panel.show({id,title,content,reveal}) to register output. reveal is optional and defaults to false, so background hooks can publish without interrupting your sidebar. update takes the same complete payload and reuses the panel by id.",
        "Content supports text, Markdown, JSON, tables and loading/success/error status. Structured actions become shared buttons beneath the result. Markdown is presentation only; raw HTML is disabled.",
      ],
      reference: [
        ["text / markdown", '{ type: "text" | "markdown", text: string }'],
        ["JSON", '{ type: "json", value: JSON }'],
        [
          "table",
          '{ type: "table", columns: string[], rows: (string | number | boolean | null)[][] }',
        ],
        [
          "status",
          '{ type: "status", state: "loading" | "success" | "error", text: string }',
        ],
      ],
      examples: hookPanelExamples
        .filter((e) => e.id !== "panel-html")
        .map((e) => ({ title: e.name, code: e.source })),
    },
    {
      id: "custom-html",
      title: "Custom HTML and interactive actions",
      paragraphs: [
        'Custom content accepts {type:"html",html,css,script,data}. The panel runs in an isolated browser view. It has no Node, application preload, website DOM, network, iframe or device-permission access. Inline CSS and JavaScript can draw the interface; data images are supported.',
        'Register context.panel.onAction("refresh", handler) in the page hook and declare actions:[{id:"refresh",label:"Refresh"}] in its output. In custom JavaScript, await kudiumHookPanel.invoke("refresh", payload) to call that handler. Only declared actions may run. Custom designs draw their own action buttons.',
        "Use kudiumHookPanel.onUpdate(output => ...) to render output.content.data. The hook handler retains the original hook’s page access and approval. The panel receives only the JSON you send it; the bridge does not grant more permissions.",
      ],
      examples: hookPanelExamples
        .filter((e) => e.id === "panel-html")
        .map((e) => ({ title: e.name, code: e.source })),
    },
    {
      id: "state-and-groups",
      title: "State, groups and links",
      paragraphs: [
        "Updating data while HTML, CSS and script stay the same preserves inputs and the native view. Replacing the design recreates it. Switching sidebar pages preserves the view, selected panel and existing picker behavior. Opening the panel never reruns the hook.",
        "A panel belongs to its originating hook, page and group. Auto follows the focused group; selecting another group cannot give the old hook access to it. Website links use the existing browser navigation and open in the authorized source group.",
        "context.panel.close(id) removes output. Navigating, disabling, changing or stopping the hook removes its panels and revokes actions. Outputs are runtime state, not a persisted database, and must be republished when the hook starts again.",
      ],
    },
    {
      id: "limits",
      title: "Bounds and failures",
      paragraphs: [
        "Each page can publish ten panels and sixty panel updates per minute. A complete output must fit within 100,000 JSON characters; action requests and responses fit within 32,000. Tables support twenty columns and two hundred rows. Declare at most ten unique actions.",
        "Three actions per panel may run at once, with a ten-second response deadline. Await invoke and show an error state in custom designs. Structured action buttons show failures automatically. Responses from expired runs, other panels or other groups are rejected.",
      ],
    },
  ],
};
