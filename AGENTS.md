# Agent Instructions

## User-facing language
Avoid adding new jargon or protocol details to the UI. Do not show handles, DIDs, or other technical identifiers unless they are truly necessary for the user to complete the task. Existing copy can stay, but new copy should prefer plain-language terms.

## Translations
Always add or update translations for new or changed user-facing UI copy. Keep support for all configured languages in sync, and avoid introducing hardcoded English strings in components, metadata, placeholders, labels, buttons, aria text, or validation messages.

## Mutation permissions
When adding any feature that creates, updates, deletes, or changes membership/roles, gate the available actions by the user’s current role before they can trigger them. Disable or hide unavailable options up front and use plain-language explanations.
