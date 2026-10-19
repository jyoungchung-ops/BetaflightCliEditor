import type { BfViewApi } from '../shared/ipc'

declare global {
  interface Window {
    bfview: BfViewApi
  }
}

export {}
