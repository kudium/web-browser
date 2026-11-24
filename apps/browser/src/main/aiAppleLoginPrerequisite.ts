import { appleLatestInstruction, appleLoginRequested } from './aiAppleIntent';
import { randomUUID } from 'crypto';

/** Deterministic saved-login plumbing; the existing executor owns access and filling. */
export function appleAILoginPrerequisite(
  request: any,
  turn: any[],
  tabId: string,
) {
  if (!appleLoginRequested(appleLatestInstruction(request.messages ?? []))) return undefined;
  const calls = turn.flatMap((message) => message.tool_calls ?? []);
  const available = (name: string) =>
    (request.tools ?? []).some((tool: any) => tool.function?.name === name);
  const args = (call: any) => {
    try {
      return JSON.parse(call.function.arguments);
    } catch {
      return {};
    }
  };
  const forTab = (name: string) =>
    [...calls]
      .reverse()
      .find(
        (call) => call.function?.name === name && args(call).tabId === tabId,
      );
  const receipt = (call: any) => {
    const message = turn.find(
      (item) => item.role === 'tool' && item.tool_call_id === call?.id,
    );
    try {
      return JSON.parse(message?.content);
    } catch {
      return undefined;
    }
  };
  const response = (content: string, name?: string, argumentsValue?: any) => ({
    choices: [
      {
        finish_reason: name ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content,
          tool_calls: name
            ? [
                {
                  id: `apple-login-${randomUUID()}`,
                  type: 'function',
                  function: { name, arguments: JSON.stringify(argumentsValue) },
                },
              ]
            : [],
        },
      },
    ],
  });
  const use = (name: string, argumentsValue: any, progress: string) => {
    if (available(name)) return response(progress, name, argumentsValue);
    if (
      available('discover_tools') &&
      !calls.some(
        (call) =>
          call.function?.name === 'discover_tools' &&
          args(call).query === 'saved login',
      )
    )
      return response('Finding saved-login tools…', 'discover_tools', {
        query: 'saved login',
      });
    return response(
      'Saved-login tools are unavailable for this request. No sign-in details were filled.',
    );
  };
  const read = forTab('read_page');
  if (!read) return undefined; // The normal prerequisite reads first.
  const fill = forTab('fill_saved_login') ?? forTab('fill_personal_data');
  if (fill) {
    const result = receipt(fill);
    return response(
      Number(result?.filled) > 0
        ? 'Saved sign-in details were filled locally. The form has not been submitted.'
        : 'Filling was not confirmed. No fill was repeated. Check the page or the saved login in Personal Data.',
    );
  }
  const page = receipt(read);
  if (!page || page.error)
    return response(
      'The current page could not be read. No sign-in details were filled.',
    );
  if (page.verification?.status === 'pending')
    return response(
      'Complete the website’s verification in this tab before continuing. No sign-in details were filled.',
    );
  const fields = (Array.isArray(page.elements) ? page.elements : []).filter(
    (element: any) => !element.disabled && !element.readOnly,
  );
  const loginField = fields.some(
    (element: any) =>
      element.type === 'password' ||
      element.type === 'email' ||
      (element.role === 'textbox' &&
        /username|email|account/i.test(String(element.label ?? ''))),
  );
  if (!loginField)
    return response(
      'Open the sign-in form in this tab first. No sign-in details were filled.',
    );
  const lookup = forTab('list_saved_logins');
  if (!lookup)
    return use(
      'list_saved_logins',
      { tabId },
      'Checking saved sign-in accounts…',
    );
  const accounts = receipt(lookup);
  if (!Array.isArray(accounts))
    return response(
      'Saved sign-in accounts could not be checked. No sign-in details were filled.',
    );
  const valid = accounts.filter(
    (account) => typeof account?.accountId === 'string' && account.accountId,
  );
  if (!valid.length)
    return response(
      'No AI-enabled saved login matches this website. Check this website’s login record and AI access in Personal Data.',
    );
  let selected = valid.length === 1 ? valid[0] : undefined;
  if (!selected) {
    const labels = valid.map(
      (account, index) =>
        `Account ${index + 1}: ${String(account.username || account.title || 'saved account').slice(0, 160)}`,
    );
    const choice = [...calls]
      .reverse()
      .find(
        (call) =>
          call.function?.name === 'request_user_feedback' &&
          args(call).title === 'Choose a saved sign-in account',
      );
    if (choice) {
      const answer = receipt(choice);
      const index = labels.indexOf(answer?.answer);
      if (index < 0)
        return response(
          'No saved account was selected. No sign-in details were filled.',
        );
      selected = valid[index];
    } else if (available('request_user_feedback')) {
      return response(
        'Choose the saved account to use.',
        'request_user_feedback',
        {
          title: 'Choose a saved sign-in account',
          reason:
            'Several saved accounts match this website. Choose one to fill locally.',
          suggestions: labels.slice(0, 5),
        },
      );
    } else
      return response(
        'Several saved accounts match this website. Select the intended account in Personal Data before continuing.',
      );
  }
  return use(
    'fill_saved_login',
    { tabId, accountId: selected.accountId },
    'Filling the selected saved account locally…',
  );
}
