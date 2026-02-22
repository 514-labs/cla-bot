import { flag } from "flags/next"

export const showPrPreview = flag<boolean>({
  key: "show-pr-preview",
  description: "Show the PR Preview page and nav item",
  defaultValue: false,
  async decide() {
    return false
  },
})

export const showTests = flag<boolean>({
  key: "show-tests",
  description: "Show the Tests page and nav item",
  defaultValue: false,
  async decide() {
    return false
  },
})
