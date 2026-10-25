# Mobile reference (Expo, React Native)

Load this for mobile stacks. Reuse first: check the DESIGN.md Components, Layouts and Packages inventories before adding anything.

## Accessibility
- Interactive elements get `accessible`, `accessibilityLabel` and `accessibilityRole` (`button`, `link`, `header`, `image`, ...); add `accessibilityState` where relevant.
- Touch targets at least 44 x 44 pt.
- Never rely on colour alone for state.

## Layout
- Respect safe-area insets with `react-native-safe-area-context` (`SafeAreaView` or `useSafeAreaInsets`).
- Use `Platform.select` for platform differences instead of scattered `Platform.OS` checks.
- Take spacing, colour and type from DESIGN.md tokens via a shared theme module, not inline literals.
- Respect reduced motion (`AccessibilityInfo.isReduceMotionEnabled`).

## Verification
Native screens cannot be measured by `verify.mjs` directly. Choose one:

1. Expo web: the user starts it (`npx expo start --web`, default `http://localhost:8081`); never start it yourself. Run `verify.mjs` on that URL.
2. Manual screenshots: the user saves screenshots to `.artist/manual/<width>.png`. `create` passes these to the critic in place of verify's screenshots, and marks CWV and axe as not measured for the round.
