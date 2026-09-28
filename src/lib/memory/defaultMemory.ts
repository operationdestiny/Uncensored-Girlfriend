import { MemoryState } from "@/types/memory";

export const defaultMemory: MemoryState = {
  story_summary: "",
  user_facts: [],
  relationship_state: "New bond",
  emotional_state: "",
  open_threads: [],
  important_promises: [],
  important_events: [],
  current_scene: {
    location: "",
    character_clothing: "",
    user_clothing: "",
    character_position: "",
    user_position: "",
    current_action: ""
  }
};
