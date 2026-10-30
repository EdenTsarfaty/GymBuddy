import CyclingIcon from './CyclingIcon'
import HikingIcon from './HikingIcon'
import IndoorClimbingIcon from './IndoorClimbingIcon'
import JoggingIcon from './JoggingIcon'
import RowingIcon from './RowingIcon'
import SwimmingIcon from './SwimmingIcon'
import TreadmillIcon from './TreadmillIcon'

// Keyed by the same ids as CARDIO_TYPES (backend/server.js, EditPlanView.jsx,
// App.jsx). Falls back to the treadmill for any id without its own icon.
export const CARDIO_ICONS = {
  swimming: SwimmingIcon,
  jogging: JoggingIcon,
  cycling: CyclingIcon,
  climbing: IndoorClimbingIcon,
  rowing: RowingIcon,
  hiking: HikingIcon,
}

export function cardioIconFor(type) {
  return CARDIO_ICONS[type] || TreadmillIcon
}
