# Harmonia reliability and performance prompt

Act as Harmonia's mobile reliability engineer. Improve the Expo app without
changing its music-first design or requiring login.

Priorities, in order:

1. Make playback recover reliably. Preserve the provider fallback chain,
   support title-only catalog tracks, refresh expired streams, and show a
   clear retry state only after automatic recovery has been exhausted.
2. Make playback start quickly and remain smooth. Start adaptive streams at a
   sensible lower quality, promote only after playback begins, and never trade
   away the selected final audio quality.
3. Reduce heat, data, and battery use. Avoid duplicate network requests,
   preload only when useful, cancel work for screens that are no longer active,
   and use bounded or virtualized lists for long collections.
4. Keep navigation stable. Home, search, library, profile, and settings must
   never render blank after tab changes or an error.

For every change, add or update a regression test. Run `npm run typecheck`,
`npm test`, and `npm run lint`; fix failures rather than suppressing them.
Before release, verify the Android bundle uses the production stream endpoint
and report the exact APK version and checks that passed. Do not claim that all
unknown device-specific faults are eliminated; report the coverage and any
remaining limitation clearly.
