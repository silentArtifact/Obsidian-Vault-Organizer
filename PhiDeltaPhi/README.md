# Phi Delta Phi - A Narrative Game System for SillyTavern

A mechanical layer for running interactive fiction using Forged in the Dark-inspired resolution. The extension handles dice injection, state tracking, Beat management, and bookkeeping while the LLM narrates.

## Core Concept

**Beats are purchased outcomes.**

When you spend Presence on a Beat, you're buying that story moment. The narrative destination is guaranteed—Jackie WILL open up, Emma WILL share something vulnerable, the fight with Dakota WILL happen. Dice and choices determine the texture of how you get there, not whether you arrive.

## Architecture

```
SCENE START
├── Extension generates dice pool (12 d6s)
├── Injects: dice + FitD rules + Beat setup + narrative direction
└── LLM knows where scene must end

DURING SCENE
├── LLM narrates, consuming dice for uncertain actions
├── TRACE lines track mechanical outcomes
├── Player can Absorb fumbles (spend Heat)
└── Heat accumulates from problems

SCENE END
├── Resolution questions check variable outcomes
├── Guaranteed Beat outcomes apply (always)
├── Variable effects apply (based on questions)
├── Bookkeeper call extracts non-Beat changes
└── Time advances, crisis checks run
```

## Dice Resolution

The LLM receives a pre-rolled dice pool and must consume dice in order:

- **6** = Clean success
- **4-5** = Success with a problem
- **1-3** = Failure with a problem

Dice cannot be reordered or rerolled. The LLM narrates within these constraints.

### TRACE Lines

Every LLM response with rolls ends with:
```
TRACE: pool=N | used=[x,y,z] | highest=H | result=6/4-5/1-3 | problem=none/snag/condition | risk=Y/N | absorbed=Y/N
```

## Resources

Player-tracked (extension displays but doesn't enforce):

| Resource | Purpose |
|----------|---------|
| Edge | Spend for +1d6 on a roll |
| Surge | Enhanced impact on success |
| Trouble | Pressure track (8 boxes, crisis at full) |
| Style | Earned through bold play, spent on Beats |
| Reputation | Social standing |
| Doom | Long-term damage |
| Legacy | Lasting positive outcomes |

### Currencies

| Currency | Purpose |
|----------|---------|
| Presence | Spend to purchase Beats |
| Connection | Emotional progress |
| Damage | Narrative damage taken |
| Heat | Accumulated tension (crisis at 8+) |

## Beat Structure

```json
{
    "beat_id": {
        "name": "Display Name",
        "cost": 2,
        "route": "character_name",
        "prerequisites": {
            "flags": { "required": [], "forbidden": [] },
            "relationships": { "sister": { "min": "warm" } },
            "time": { "dayMin": 3, "periods": ["morning"] }
        },
        "setup": "Opening narration",
        "guaranteed": {
            "narrativeDirection": "What MUST happen by scene end",
            "outcomes": {
                "flags": ["flag_to_set"],
                "relationships": { "sister": 1 },
                "presence": 2
            }
        },
        "variables": {
            "questions": ["Did X happen?", "Did Y happen?"],
            "effectMapping": ["effect_key_1", "effect_key_2"],
            "effects": {
                "effect_key_1": { "style": 1 },
                "effect_key_2": { "heat": 1, "flags": ["some_flag"] }
            }
        }
    }
}
```

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/pdp-state` | Full state as JSON |
| `/pdp-status` | Brief status line |
| `/pdp-available` | List purchasable Beats |
| `/pdp-buy [id]` | Purchase a Beat |
| `/pdp-queue` | Show Beat queue |
| `/pdp-start-scene` | Begin next scene |
| `/pdp-end-scene` | End scene, run resolution |
| `/pdp-resource [name] [+/-N]` | Adjust a resource |
| `/pdp-absorb` | Absorb last fumble |
| `/pdp-bracelet` | Toggle bracelet |
| `/pdp-flag [name]` | Add flag (use -name to remove) |
| `/pdp-resolve` | Generate resolution injection |
| `/pdp-reset` | Reset state (debug) |

## Configuration

### Bookkeeper Model (Optional)

The extension can use a separate, cheaper model for the bookkeeping call. Configure in settings:

- Provider: anthropic / openai
- API Key: Your key
- Model: claude-3-haiku-20240307 / gpt-4o-mini (recommended)

If not configured, falls back to the main chat model via quiet prompt.

## How It Works Together

1. **You purchase "Tennis with Jackie"** — costs 2 Presence
2. **Scene starts** — Extension injects dice pool, rules, Beat setup, and the guarantee: "Jackie opens up about something real"
3. **You play tennis** — Rolls determine if you win, if there's a fight, how it goes
4. **A fumble happens** — You rolled a 2 on an important moment. You can Absorb it (+1 Heat) or let it ride
5. **Scene ends** — Extension asks: "Did Matt hold his own? Did they fight? Did anyone witness?"
6. **Outcomes apply**:
   - Guaranteed: Jackie opened up (+1 relationship, flags set)
   - Variable: You held your own (+1 Style), you fought (+1 Heat)
7. **Bookkeeper checks**: Did you spend Edge? Did your relationship with someone else change? Any emergent flags?
8. **Next scene** — Time advances, Presence awarded, new Beats available

## Relationship Tiers

Relationships progress through tiers:

1. **Hostile** — Active conflict
2. **Cold** — Distant, distrustful
3. **Neutral** — No strong feelings
4. **Warm** — Friendly, comfortable
5. **Close** — Deep connection
6. **Intimate** — Profound bond

Each tier requires accumulating 3 regard to advance (or -3 to drop).

## Time System

Time advances through periods:
- Morning
- Afternoon
- Evening
- Night

After Night, a new day begins. Beats may have time prerequisites.

## Heat & Crisis

Heat accumulates from:
- Problems on rolls (snags, conditions)
- Absorbing fumbles
- Certain Beat effects

At Heat 8+, a crisis triggers. The situation becomes untenable and something must change.

## File Structure

```
PhiDeltaPhi/
├── manifest.json       # Extension metadata
├── index.js            # Main extension code
├── style.css           # UI styling
├── beats-catalog.json  # Beat definitions
├── ambient-seeds.json  # Random scene prompts
└── README.md           # This file
```

## Installation

1. Copy the `PhiDeltaPhi` folder to your SillyTavern extensions directory:
   ```
   SillyTavern/public/scripts/extensions/third-party/PhiDeltaPhi/
   ```
2. Restart SillyTavern
3. Enable the extension in Extensions settings

## Design Philosophy

### Why Beats as Purchased Outcomes?

Traditional RPG mechanics make players prove they deserve narrative moments. This creates anxiety and undermines story.

In Phi Delta Phi, spending Presence IS the proof. You wanted this scene enough to pay for it. The game rewards your investment with a guaranteed story beat.

Dice still matter—they shape HOW you get there, not IF. A fumble-filled path to vulnerability is more interesting than a clean one. The journey creates the drama.

### Why Pre-rolled Dice?

Pre-rolled dice serve several purposes:
1. **Transparency** — Both player and LLM see the same pool
2. **Constraint** — The LLM can't "cheat" by imagining convenient rolls
3. **Drama** — You can see what's coming and plan (or dread) accordingly
4. **Fairness** — The dice are what they are; the story adapts

### Why Bookkeeper Separation?

The bookkeeper call handles mechanical tracking that doesn't require narrative intelligence:
- Resource expenditure
- Collateral relationship shifts
- Emergent flags

Using a cheaper model for this saves API costs while the main model focuses on storytelling.

## Credits

Phi Delta Phi uses concepts from:
- Forged in the Dark (John Harper)
- Belonging Outside Belonging / No Dice No Masters
- For the Queen
- Various narrative games in the story game tradition

## License

MIT License. Use freely, modify freely, share freely.
