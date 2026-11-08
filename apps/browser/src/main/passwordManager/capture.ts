/** Values remain in the local service; callers must review before saving. */
export function captureForm(names: string[], allowSensitive = false) {
  return Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input, textarea, select')
  )
    .filter((input) => {
      const name = input.getAttribute('autocomplete') || input.name || input.id;
      return (
        names.some((requested) =>
          [name, input.name, input.id].includes(requested)
        ) &&
        !input.disabled &&
        input.getClientRects().length > 0 &&
        !/hidden|file|checkbox|radio|submit|button/.test(
          input.getAttribute('type') || ''
        ) &&
        !/token|csrf|otp|one-time/i.test(
          [name, input.name, input.id].join(' ')
        ) &&
        (allowSensitive ||
          (!/password/i.test(input.getAttribute('type') || '') &&
            !/cvc|cvv|card|cc-|password/i.test(name)))
      );
    })
    .slice(0, 30)
    .map((input) => {
      let name = input.getAttribute('autocomplete') || input.name || input.id;
      if (input.getAttribute('type') === 'password')
        name =
          input.autocomplete === 'new-password'
            ? 'new-password'
            : 'current-password';
      return {
        name,
        aliases: [input.name, input.id].filter(Boolean),
        value: input.value.slice(0, 4096),
        secret:
          input.getAttribute('type') === 'password' ||
          /password|cvc|cvv|card|cc-|security.?code/i.test(name),
      };
    });
}
