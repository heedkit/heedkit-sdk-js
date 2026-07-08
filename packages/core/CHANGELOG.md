# @heedkit/sdk-js

## 0.2.0

### Minor Changes

- Ship the React, Vue, and Angular bindings from this package as subpath exports
  (`@heedkit/sdk-js/react`, `/vue`, `/angular`), so one install covers every web framework.
  The former standalone `@heedkit/sdk-react`, `@heedkit/sdk-vue`, and `@heedkit/sdk-angular`
  packages are superseded. Frameworks are optional peer dependencies, so plain-JS usage is
  unaffected. No breaking changes to the existing `@heedkit/sdk-js` entry.
