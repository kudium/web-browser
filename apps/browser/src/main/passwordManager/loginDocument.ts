/** Runs in the website main frame. Observations never include credential values. */
export function inspectLoginDocument(origin: string) {
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return (
      element.getClientRects().length > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  };
  if (location.origin !== origin || location.protocol !== 'https:')
    return {
      form: false,
      signedIn: false,
      destinations: [] as { url?: string; label: string }[],
    };
  const controls = [
    ...document.querySelectorAll<HTMLInputElement>('input'),
  ].filter((input) => visible(input) && !input.disabled && !input.readOnly);
  const passwords = controls.filter(
    (input) =>
      input.type === 'password' && input.autocomplete !== 'new-password',
  );
  const password = passwords.length === 1 ? passwords[0] : undefined;
  const users =
    password &&
    controls.filter(
      (input) =>
        input.form === password.form &&
        (['username', 'email'].includes(input.autocomplete) ||
          input.type === 'email' ||
          (input.type === 'text' &&
            /user|login|email|account|identifier/i.test(
              input.name + input.id + input.placeholder,
            ))),
    );
  const form =
    !!password?.form &&
    users?.length === 1 &&
    !controls.some((input) => input.autocomplete === 'new-password') &&
    !controls.some(
      (input) =>
        /one-time-code/i.test(input.autocomplete) ||
        /captcha|otp|verification.?code/i.test(input.name + input.id),
    );
  const actions = [
    ...document.querySelectorAll<HTMLElement>('a,button,[role=button]'),
  ].filter(visible);
  const signedIn = actions.some((element) =>
    /^\s*(sign\s*out|log\s*out)\s*$/i.test(
      element.innerText || element.getAttribute('aria-label') || '',
    ),
  );
  const destinations: { url?: string; label: string }[] = [];
  actions.forEach((element) => {
    const label = (
      element.innerText ||
      element.getAttribute('aria-label') ||
      ''
    ).trim();
    if (
      !/^(?:[\w ]{0,30} )?(?:sign[ -]?in|log[ -]?in)(?: [\w ]{0,30})?$/i.test(
        label,
      ) ||
      /google|apple|facebook|passkey|github|microsoft/i.test(label)
    )
      return;
    const href = element.getAttribute('href');
    if (href) {
      const url = new URL(href, location.href);
      if (
        url.origin !== origin ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password
      )
        return;
      if (!destinations.some((entry) => entry.url === url.href))
        destinations.push({ url: url.href, label });
    } else if (!(element instanceof HTMLButtonElement) || !element.disabled) {
      if (!destinations.some((entry) => !entry.url && entry.label === label))
        destinations.push({ label });
    }
  });
  return { form: !!form, signedIn, destinations };
}

export function openLoginButton(
  origin: string,
  expectedURL: string,
  label: string,
) {
  if (location.origin !== origin || location.href !== expectedURL) return false;
  const buttons = [
    ...document.querySelectorAll<HTMLElement>('button,[role=button]'),
  ].filter(
    (element) =>
      element.getClientRects().length > 0 &&
      (element.innerText || element.getAttribute('aria-label') || '').trim() ===
        label &&
      (!(element instanceof HTMLButtonElement) || !element.disabled),
  );
  if (buttons.length !== 1) return false;
  buttons[0].click();
  return true;
}

/** Fill only one complete login form. Submission is a separate, revalidated step. */
export function fillLoginDocument(
  origin: string,
  expectedURL: string,
  username: string,
  password: string,
) {
  if (
    location.origin !== origin ||
    location.protocol !== 'https:' ||
    location.href !== expectedURL
  )
    return false;
  const usable = (input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    return (
      input.getClientRects().length > 0 &&
      !input.disabled &&
      !input.readOnly &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  };
  const inputs = [
    ...document.querySelectorAll<HTMLInputElement>('input'),
  ].filter(usable);
  const passwords = inputs.filter(
    (input) =>
      input.type === 'password' && input.autocomplete !== 'new-password',
  );
  if (
    passwords.length !== 1 ||
    inputs.some((input) => input.autocomplete === 'new-password')
  )
    return false;
  const target = passwords[0];
  if (
    !target.form ||
    new URL(target.form.action, location.href).origin !== origin
  )
    return false;
  const users = inputs.filter(
    (input) =>
      input.form === target.form &&
      (['username', 'email'].includes(input.autocomplete) ||
        input.type === 'email' ||
        (input.type === 'text' &&
          /user|login|email|account|identifier/i.test(
            input.name + input.id + input.placeholder,
          ))),
  );
  if (users.length !== 1 || !username || !password) return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  if (!setter) return false;
  for (const [input, value] of [
    [users[0], username],
    [target, password],
  ] as const) {
    if (location.href !== expectedURL || !input.isConnected) return false;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

export function submitLoginDocument(origin: string, expectedURL: string) {
  if (
    location.origin !== origin ||
    location.protocol !== 'https:' ||
    location.href !== expectedURL
  )
    return false;
  const inputs = [
    ...document.querySelectorAll<HTMLInputElement>('input'),
  ].filter(
    (input) =>
      input.getClientRects().length > 0 &&
      !input.disabled &&
      !input.readOnly &&
      getComputedStyle(input).visibility !== 'hidden' &&
      getComputedStyle(input).display !== 'none',
  );
  const passwords = inputs.filter(
    (input) =>
      input.type === 'password' && input.autocomplete !== 'new-password',
  );
  if (
    passwords.length !== 1 ||
    !passwords[0].value ||
    inputs.some(
      (input) =>
        input.autocomplete === 'new-password' ||
        input.autocomplete === 'one-time-code' ||
        /captcha|otp|verification.?code/i.test(input.name + input.id),
    )
  )
    return false;
  const form = passwords[0].form;
  if (!form || new URL(form.action, location.href).origin !== origin)
    return false;
  const buttons = [
    ...form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button,input[type=submit]',
    ),
  ].filter(
    (button) =>
      button.type === 'submit' &&
      !button.disabled &&
      button.getClientRects().length > 0,
  );
  if (buttons.length !== 1) return false;
  const label =
    buttons[0] instanceof HTMLInputElement
      ? buttons[0].value
      : buttons[0].innerText;
  if (
    !/sign[ -]?in|log[ -]?in/i.test(
      label || buttons[0].getAttribute('aria-label') || '',
    ) ||
    /sign[ -]?up|register|reset/i.test(label)
  )
    return false;
  form.requestSubmit(buttons[0]);
  return true;
}

/** An idle document does no polling work. */
export function waitForLoginDocument(
  origin: string,
  goal: 'form' | 'signed-in',
  timeout: number,
  inspect: typeof inspectLoginDocument,
): Promise<ReturnType<typeof inspectLoginDocument>> {
  return new Promise((resolve) => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const finish = (state: ReturnType<typeof inspectLoginDocument>) => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(debounce);
      resolve(state);
    };
    const scan = () => {
      const state = inspect(origin);
      if (
        goal === 'form'
          ? state.form || state.signedIn
          : state.signedIn && !state.form
      )
        finish(state);
    };
    const selector = 'form,input,a,button,[role=button]';
    const relevant = (node: Node) => {
      const element = node instanceof Element ? node : node.parentElement;
      return (
        !!element &&
        (!!element.closest(selector) || !!element.querySelector(selector))
      );
    };
    const observer = new MutationObserver((changes) => {
      if (
        !changes.some((change) =>
          change.type === 'childList'
            ? [...change.addedNodes, ...change.removedNodes].some(relevant) ||
              (change.target instanceof Element &&
                !!change.target.closest(selector))
            : relevant(change.target),
        )
      )
        return;
      if (!debounce)
        debounce = setTimeout(() => {
          debounce = undefined;
          scan();
        }, 80);
    });
    const timer = setTimeout(() => finish(inspect(origin)), timeout);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'hidden',
        'disabled',
        'readonly',
        'name',
        'id',
        'placeholder',
        'role',
        'type',
        'autocomplete',
        'href',
        'aria-label',
        'aria-hidden',
        'class',
        'style',
      ],
    });
    scan();
  });
}
