import { createContext, useContext } from 'react'

/** Cài đặt hiển thị của một khung session. */
export interface PaneSettings {
  /** true: thẻ diff code mở sẵn; false: thu gọn, chỉ hiện tên file và số dòng +/−. */
  diffExpanded: boolean
}

export const defaultPaneSettings: PaneSettings = { diffExpanded: true }

export const PaneSettingsContext = createContext<PaneSettings>(defaultPaneSettings)

export const usePaneSettings = () => useContext(PaneSettingsContext)
