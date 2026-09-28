# EverBond AI Launch Specification

## Brand

EverBond AI  
AI characters that remember you.

## Locked Product Direction

- Memory-first AI character chat
- No signup for free trial
- Free users get 40 one-time messages
- Paid unlocks Living Memory™ and continuation
- High-quality characters available to everyone
- Paid users can create private/public characters
- Public characters require structured quality fields
- Option B mature romance policy
- No voice, video, or AI-generated images
- Static character portraits only
- Large portrait beside chat box
- One tuned production model: EverBond-27B

## Prompt Modes

### Chat Mode

Generates:
- dialogue
- action
- emotion
- scene description
- roleplay
- relationship progression

### Memory Mode

Generates:
- story summary
- user facts
- emotional state
- relationship state
- open threads
- promises
- important events

## Memory Schema

```json
{
  "story_summary": "",
  "user_facts": [],
  "relationship_state": "",
  "emotional_state": "",
  "open_threads": [],
  "important_promises": [],
  "important_events": []
}
```

## Pricing

- Free: 40 one-time messages
- Standard: $9.99/mo, 2,000 messages
- Premium: $19.99/mo, 7,500 messages
- Elite: $24.99/mo, fair-use around 20,000 messages

## Admin Switches

- chats_enabled
- free_trial_enabled
- character_creation_enabled
- subscriptions_enabled
- active_model_id
