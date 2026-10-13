import { dispatch } from './core.mjs';

export function core(action, payload) {
  const response = JSON.parse(dispatch(JSON.stringify({ action, ...payload })));
  if (!response.ok) throw new Error(response.message);
  return response.value;
}
