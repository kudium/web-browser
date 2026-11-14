/** Self-contained so the same matcher can be sent to the website's main frame. */
export function createPersonalDataMatching() {
  const types = [
    {
      value: 'name',
      label: 'Full name',
      names: ['name', 'full name', 'fullname'],
    },
    {
      value: 'given-name',
      label: 'First name',
      names: ['first name', 'firstname', 'given name'],
    },
    {
      value: 'family-name',
      label: 'Last name',
      names: ['last name', 'lastname', 'surname', 'family name'],
    },
    { value: 'email', label: 'Email', names: ['email', 'email address'] },
    {
      value: 'username',
      label: 'Username',
      names: ['username', 'user name', 'login'],
    },
    {
      value: 'tel',
      label: 'Phone number',
      names: ['phone', 'phone number', 'telephone', 'mobile', 'mobile number'],
    },
    {
      value: 'street-address',
      label: 'Street address',
      names: ['address', 'street address'],
    },
    { value: 'address-level2', label: 'City', names: ['city', 'town'] },
    {
      value: 'address-level1',
      label: 'State / province',
      names: ['state', 'province', 'region'],
    },
    {
      value: 'postal-code',
      label: 'Postal code',
      names: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode'],
    },
    {
      value: 'country-name',
      label: 'Country',
      names: ['country', 'country name'],
    },
    {
      value: 'organization',
      label: 'Company',
      names: ['company', 'organization'],
    },
    { value: 'url', label: 'Website', names: ['website', 'url'] },
    { value: 'current-password', label: 'Password', names: ['password'] },
    { value: 'cc-number', label: 'Card number', names: ['card number'] },
    {
      value: 'cc-name',
      label: 'Name on card',
      names: ['name on card', 'cardholder name'],
    },
    {
      value: 'cc-exp',
      label: 'Card expiry',
      names: ['expiry', 'expiry date', 'expiration'],
    },
    {
      value: 'cc-csc',
      label: 'Card security code',
      names: ['cvv', 'cvc', 'security code'],
    },
  ];
  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = (name: string) => {
    const key = normalize(name);
    const type = types.find((entry) =>
      [entry.value, ...entry.names].some((hint) => normalize(hint) === key)
    );
    return type ? [type.value] : [];
  };
  const score = (
    name: string,
    otherNames: string[],
    target?: {
      name?: string;
      id?: string;
      label?: string;
      placeholder?: string;
      autocomplete?: string;
      type?: string;
    }
  ) => {
    if (!target) return 0;
    const keys = new Set(
      [
        ...(aliases(name).length &&
        otherNames.some((hint) => types.some((type) => type.value === hint))
          ? []
          : [name]),
        ...otherNames,
      ]
        .flatMap((hint) => [hint, ...aliases(hint)])
        .map(normalize)
        .filter(Boolean)
    );
    if (/\bone-time-code\b/i.test(target.autocomplete || '')) return 0;
    const fieldHints = (value?: string) => {
      if (!value) return [];
      // Framework names often wrap the semantic field: user[email], profile_firstName.
      const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
      const suffixes = [value];
      for (let count = 1; count <= Math.min(3, words.length); count++) {
        const suffix = words.slice(-count).join(' ');
        if (aliases(suffix).length && !['name', 'password'].includes(suffix)) suffixes.push(suffix);
      }
      return suffixes;
    };
    const hints = [
      ...fieldHints(target.name),
      ...fieldHints(target.id),
      target.label,
      target.placeholder,
      ...(target.autocomplete || '').split(/\s+/),
    ].filter((hint): hint is string => !!hint);
    if (
      hints.some((hint) =>
        [hint, ...aliases(hint)].some((key) => keys.has(normalize(key)))
      )
    )
      return 2;
    // Descriptive labels can include a qualifier, e.g. "Work email".
    // Generic "name" must never match "first name" or "name on card".
    const labels = [target.label, target.placeholder]
      .filter(Boolean)
      .map((hint) => ` ${hint!.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `);
    if (
      ['email', 'tel', 'url'].includes(target.type || '') &&
      keys.has(normalize(target.type!))
    )
      return 1;
    return [
      ...otherNames,
      ...(aliases(name).length &&
      otherNames.some((hint) => types.some((type) => type.value === hint))
        ? []
        : [name, ...aliases(name)]),
    ].some((hint) => {
      const text = hint
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      return (
        text.length > 2 &&
        !['name', 'number', 'address', 'password'].includes(text) &&
        labels.some((label) => label.includes(` ${text} `))
      );
    })
      ? 1
      : 0;
  };
  return { types, aliases, score };
}

export const personalDataMatching = createPersonalDataMatching();
