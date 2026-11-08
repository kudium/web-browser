# AI working mode

The isolated activity view shields the working page from incidental human input while CDP actions continue to reach the underlying page. Clicking, scrolling, typing or pressing Escape does not pause the agent. The explicit Take control button in the floating activity dock or assistant toolbar pauses work through the existing cancellation and held-pointer cleanup path. The assistant's Stop button remains an explicit task cancellation action.

The activity chrome uses a soft violet/blue edge glow, a faint dotted edge, a compact bottom dock and a gently animated working indicator. It supports keyboard activation, narrow panes and reduced motion. It stays above the working page and follows its bounds; it hides when work completes or hands off. Resuming re-enables Take control. The overlay is a separate sandboxed view and never inserts controls into website DOM.

Reference: inspected the installed Ego Lite agent-control UI using the ego-browser skill and native screenshot. Verification: 33 targeted unit tests, TypeScript and lint; disposable native Electron regression covers AI click passthrough, incidental click/wheel/Escape protection, explicit takeover, resume, bounds, visibility and disposal. The personal running instance was not restarted.
