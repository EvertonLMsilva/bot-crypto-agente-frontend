import type { RoomId, StationId } from './office';

/** Identidade de apresentação local, independente de estados financeiros. */
export type SceneSelection = { readonly type: 'room'; readonly id: RoomId } |
  { readonly type: 'station' | 'character'; readonly id: StationId };
