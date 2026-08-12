# `/_test`

`/_test` lists a small set of public, safe previews. Each preview lives on its own subroute.

When a production flow has a preview here, render the production component and mock only its fixture data, persistence, navigation, and external side effects. Do not copy the production interface into the preview.

Do not add a preview unless it is requested. Previews are public: never include secrets, privileged controls, or real personal data, and never call live mutation, payment, wallet, publishing, or recipient-verification services.
