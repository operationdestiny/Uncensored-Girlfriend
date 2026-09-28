export type PermanentIdentity = {
  name: string | null;
  gender: string | null;
  core_identity: string | null;
};

export type SceneState = {
  location: string;
  character_clothing: string;
  user_clothing: string;
  character_position: string;
  user_position: string;
  current_action: string;
};

export type MemoryState = {
  story_summary: string;
  user_facts: string[];
  relationship_state: string;
  emotional_state: string;
  open_threads: string[];
  important_promises: string[];
  important_events: string[];
  current_scene?: SceneState;
  permanent_identity?: PermanentIdentity;
};
