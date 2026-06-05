// Placeholder — implementation in later prompts
(function init() {
  if ((window as Window & { __jobAutofillInitialized?: boolean }).__jobAutofillInitialized) {
    return;
  }
  (window as Window & { __jobAutofillInitialized?: boolean }).__jobAutofillInitialized = true;
})();

export const PLACEHOLDER = true;
