import { addTodo } from './todos';
import { localDay } from '../browser/todos';

export function validateAITodo(input: Record<string, unknown>) {
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 500
  )
    throw new Error('Provide a task title up to 500 characters.');
  if (
    input.todoDetails !== undefined &&
    (typeof input.todoDetails !== 'string' || input.todoDetails.length > 30000)
  )
    throw new Error('Task details must be Markdown up to 30,000 characters.');
  if (input.today !== undefined && typeof input.today !== 'boolean')
    throw new Error('today must be boolean.');
  if (
    input.destination !== undefined &&
    !['group', 'browser'].includes(input.destination as string)
  )
    throw new Error('Choose group or browser for the todo destination.');
  return {
    title: input.title.trim(),
    details: input.todoDetails as string | undefined,
    today: input.today !== false,
    destination: input.destination === 'browser' ? 'browser' : 'group',
  };
}

/** Append through the UI's storage path without disclosing or granting access to other tasks. */
export function createAITodo(
  input: Record<string, unknown>,
  currentScope?: string,
) {
  const todo = validateAITodo(input);
  const scope = todo.destination === 'browser' ? undefined : currentScope;
  const result = addTodo(
    todo.title,
    todo.today,
    scope,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    todo.details,
  );
  return {
    ...result,
    created: true,
    today: todo.today ? localDay() : undefined,
  };
}
