/**
 * Phi Delta Phi - A Narrative Game System for SillyTavern
 * Version 0.2.0
 *
 * Core Concept: Beats are purchased outcomes.
 * When a player spends Presence on a Beat, they're buying that story moment.
 * The narrative destination is guaranteed. Dice shape the journey, not the destination.
 */

// ============================================================================
// EXTENSION SETUP & IMPORTS
// ============================================================================

import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { registerSlashCommand } from '../../../slash-commands.js';
import { extension_settings, getContext } from '../../../extensions.js';

const extensionName = 'PhiDeltaPhi';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Extension settings storage key
const SETTINGS_KEY = 'phiDeltaPhi';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Default game state structure
 */
function createDefaultState() {
    return {
        // Core currencies
        currencies: {
            presence: 3,        // Resource for purchasing Beats
            connection: 0,      // Emotional progress
            damage: 0,          // Narrative damage taken
            heat: 0             // Accumulated tension (crisis at 8+)
        },

        // FitD Resources (player-tracked, extension displays)
        resources: {
            edge: 3,            // Spend for +1d6 on a roll
            surge: 0,           // Enhanced impact on success
            trouble: 0,         // Pressure track (8 boxes, crisis at full)
            troubleMax: 8,
            style: 0,           // Earned through bold play
            reputation: 0,      // Social standing
            doom: 0,            // Long-term damage
            legacy: 0           // Lasting positive outcomes
        },

        // Story flags
        flags: [],

        // Active conditions
        conditions: [],

        // Sister relationships
        relationships: {
            jackie: { tier: 'neutral', regard: 0 },
            dakota: { tier: 'neutral', regard: 0 },
            emma: { tier: 'neutral', regard: 0 },
            holly: { tier: 'neutral', regard: 0 },
            nina: { tier: 'neutral', regard: 0 },
            yuki: { tier: 'neutral', regard: 0 }
        },

        // Time tracking
        time: {
            day: 1,
            period: 'morning',   // morning, afternoon, evening, night
            turnCount: 0
        },

        // Beat system
        beats: {
            queue: [],          // { id, priority, purchasedAt }
            currentBeat: null,  // Active beat ID
            completed: [],      // Completed beat IDs
            unlocked: []        // Unlocked beat IDs
        },

        // Scene state
        scene: {
            active: false,
            type: null,         // 'beat' or 'ambient'
            startTurn: null,
            messageCountAtStart: null,
            dicePool: null,     // Pre-rolled dice array
            diceConsumed: 0,    // How many dice have been used
            canAbsorb: false,   // Is there a fumble to absorb?
            lastFumble: null    // Last fumble trace for absorption
        },

        // Bracelet system
        bracelet: {
            worn: false,
            wearerKnown: false,
            suspicion: {}
        }
    };
}

// Global state
let gameState = createDefaultState();
let beatsCatalog = {};
let ambientSeeds = [];
let extensionSettings = {};

/**
 * Loads state from SillyTavern extension settings
 */
async function loadState() {
    try {
        if (extension_settings[SETTINGS_KEY]) {
            const saved = extension_settings[SETTINGS_KEY];
            if (saved.gameState) {
                gameState = mergeDeep(createDefaultState(), saved.gameState);
            }
            if (saved.settings) {
                extensionSettings = saved.settings;
            }
        }
    } catch (error) {
        console.error('[PDP] Failed to load state:', error);
        gameState = createDefaultState();
    }
}

/**
 * Saves state to SillyTavern extension settings
 */
async function saveState() {
    try {
        extension_settings[SETTINGS_KEY] = {
            gameState: gameState,
            settings: extensionSettings
        };
        saveSettingsDebounced();
    } catch (error) {
        console.error('[PDP] Failed to save state:', error);
    }
}

/**
 * Deep merge utility for state restoration
 */
function mergeDeep(target, source) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = mergeDeep(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

// ============================================================================
// DICE POOL SYSTEM
// ============================================================================

/**
 * Generates a fresh dice pool for a scene.
 * @param {number} size - Number of d6s to generate (default 12)
 * @returns {number[]} Array of d6 results (1-6)
 */
function generateDicePool(size = 12) {
    return Array.from({ length: size }, () => Math.floor(Math.random() * 6) + 1);
}

/**
 * Formats dice pool for injection into LLM context.
 * @param {number[]} pool - The dice pool
 * @returns {string} Formatted string for context injection
 */
function formatDicePoolInjection(pool) {
    return pool.join(', ');
}

/**
 * Gets remaining dice from pool after consumption.
 * @returns {number[]} Unconsumed dice
 */
function getRemainingDice() {
    if (!gameState.scene.dicePool) return [];
    return gameState.scene.dicePool.slice(gameState.scene.diceConsumed);
}

// ============================================================================
// FITD ADJUDICATION INJECTION
// ============================================================================

/**
 * Builds the complete FitD rules injection for scene start.
 * @param {number[]} dicePool - The generated dice pool
 * @returns {string} Complete rules text for injection
 */
function buildFitDInjection(dicePool) {
    return `[DICE AND ADJUDICATION RULES]

Dice bank for this scene: ${formatDicePoolInjection(dicePool)}

Treat each number as a d6 result. Never reorder or reroll; always consume dice in order from left to right. If the bank runs out, narrate without rolling.

WHEN TO ROLL
Only roll when {{user}} attempts something with uncertain outcome AND meaningful stakes. Trivial actions, safe choices, and pure description don't need rolls.

ACTION ROLLS
1. Build pool size (1-4 dice):
   - Base: 1d6
   - +1d6 if {{user}} spends Edge
   - +1d6 if {{user}} invokes Risk
   - +1d6 if another character helps in fiction
   - +1d6 if {{user}} leans hard into a vulnerability or ideal

2. Take the NEXT N dice from the bank in order. That's your roll.

3. Read the HIGHEST die:
   - 6 = Clean success (no new problem)
   - 4-5 = Success with a problem (complication, cost, or twist)
   - 1-3 = Failure with a problem (it doesn't work AND something goes wrong)

PROBLEMS
- Snag: Immediate complication (wrong person walks in, timing goes bad, something interrupts)
- Condition: Lingering state (tired, flustered, on thin ice with someone, awkward)

RESOURCES ({{user}} tracks these, not you)
- Edge: +1d6 when spent
- Surge: Enhanced impact on success, still spent on failure
- Risk: {{user}} declares before roll, chooses +1d6 OR +1 Surge OR clear 1 Trouble; you announce a guaranteed cost (mark Trouble OR a specific problem that happens even on 6)

TRACE LINE (required)
End EVERY response that includes rolls with:
TRACE: pool=N | used=[x,y,z] | highest=H | result=6/4-5/1-3 | problem=none/snag/condition | risk=Y/N | absorbed=Y/N

If multiple rolls in one response, include multiple TRACE lines.

[/DICE AND ADJUDICATION RULES]`;
}

// ============================================================================
// BEAT NARRATIVE DIRECTION INJECTION
// ============================================================================

/**
 * Builds the narrative direction injection for an active Beat.
 * @param {object} beat - The beat object from catalog
 * @returns {string} Narrative direction for LLM
 */
function buildBeatDirectionInjection(beat) {
    if (!beat.guaranteed) return '';

    return `[SCENE DESTINATION]

This is a purchased Beat. The following outcome is GUARANTEED to happen by scene end:

${beat.guaranteed.narrativeDirection}

Your job is to steer toward this destination while respecting the dice along the way. Rolls determine texture, complications, and how you get there—not whether you arrive.

- A fumble on a roll means something goes wrong in THAT MOMENT, but the scene still reaches its destination
- Let the journey be messy if the dice say so
- The guaranteed outcome happens regardless—it might just be complicated by what came before

[/SCENE DESTINATION]`;
}

// ============================================================================
// TRACE LINE PARSING
// ============================================================================

/**
 * Parses TRACE lines from an LLM response.
 * @param {string} response - The full LLM response text
 * @returns {object[]} Array of parsed trace objects
 */
function parseTraceLines(response) {
    const traces = [];

    // Match TRACE lines with flexible spacing
    const regex = /TRACE:\s*pool\s*=\s*(\d+)\s*\|\s*used\s*=\s*\[([\d,\s]*)\]\s*\|\s*highest\s*=\s*(\d)\s*\|\s*result\s*=\s*(6|4-5|1-3)\s*\|\s*problem\s*=\s*(\w+)\s*\|\s*risk\s*=\s*(Y|N)\s*(?:\|\s*absorbed\s*=\s*(Y|N))?/gi;

    let match;
    while ((match = regex.exec(response)) !== null) {
        const diceUsed = match[2]
            .split(',')
            .map(d => parseInt(d.trim()))
            .filter(d => !isNaN(d));

        traces.push({
            poolSize: parseInt(match[1]),
            diceUsed: diceUsed,
            diceCount: diceUsed.length,
            highest: parseInt(match[3]),
            result: match[4],
            problem: match[5].toLowerCase(),
            risk: match[6].toUpperCase() === 'Y',
            absorbed: match[7] ? match[7].toUpperCase() === 'Y' : false
        });
    }

    return traces;
}

/**
 * Processes parsed TRACE data and updates game state.
 * @param {object[]} traces - Parsed trace objects
 */
function processTraces(traces) {
    for (const trace of traces) {
        // Update dice consumption
        gameState.scene.diceConsumed += trace.diceCount;

        // Accumulate Heat from problems (unless absorbed)
        if (!trace.absorbed && trace.problem !== 'none') {
            const heatGain = 1;
            gameState.currencies.heat += heatGain;
            showCurrencyToast('heat', heatGain);
        }

        // Track if there's an unabsorbed fumble for Absorb UI
        if (trace.result === '1-3' && !trace.absorbed) {
            gameState.scene.lastFumble = trace;
            gameState.scene.canAbsorb = true;
        }

        // Log for debugging
        console.log(`[PDP] TRACE: ${trace.diceCount}d6 -> ${trace.diceUsed.join(',')} -> highest ${trace.highest} -> ${trace.result}`);
    }

    // Check Heat crisis
    checkHeatCrisis();

    // Save and update UI
    saveState();
    updatePanel();
}

// ============================================================================
// ABSORB MECHANIC
// ============================================================================

/**
 * Player absorbs the last fumble, spending Heat to soften it.
 * @returns {object} Result of absorb attempt
 */
function absorbLastFumble() {
    if (!gameState.scene.canAbsorb || !gameState.scene.lastFumble) {
        return { success: false, message: 'Nothing to absorb' };
    }

    // Cost: +1 Heat normally, +2 if scene is already tense (Heat >= 5)
    const cost = gameState.currencies.heat >= 5 ? 2 : 1;

    // Apply
    gameState.currencies.heat += cost;
    gameState.scene.lastFumble.absorbed = true;
    gameState.scene.canAbsorb = false;

    showToast(`Absorbed fumble (+${cost} Heat)`, 'warning');
    showCurrencyToast('heat', cost);

    checkHeatCrisis();
    saveState();
    updatePanel();

    return {
        success: true,
        message: `Fumble absorbed. The consequence is softened, but tension rises. (+${cost} Heat)`
    };
}

// ============================================================================
// RESOLUTION QUESTIONS
// ============================================================================

/**
 * Builds the resolution prompt for scene end.
 * @param {object} beat - The active beat
 * @returns {string} Resolution injection text
 */
function buildResolutionInjection(beat) {
    if (!beat || !beat.variables || !beat.variables.questions) {
        return `[SCENE RESOLUTION]
The scene is complete. Write a brief closing (2-3 paragraphs) that transitions out.
RESOLUTION: []
[/SCENE RESOLUTION]`;
    }

    const questions = beat.variables.questions;
    const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

    return `[SCENE RESOLUTION]

The scene is wrapping up. Answer these questions about what happened:

${numbered}

For each question, answer YES or NO based on what actually occurred in this scene.
Then write a brief closing beat (2-3 paragraphs) that transitions out.

Format:
RESOLUTION: [Y/N, Y/N, ...]

Then your closing narration.
[/SCENE RESOLUTION]`;
}

/**
 * Parses RESOLUTION line from LLM response.
 * @param {string} response - LLM response text
 * @returns {boolean[]} Array of yes/no answers
 */
function parseResolution(response) {
    const match = response.match(/RESOLUTION:\s*\[([\w\s,\/]*)\]/i);

    if (!match) {
        console.warn('[PDP] No RESOLUTION line found');
        return [];
    }

    return match[1]
        .split(',')
        .map(a => {
            const cleaned = a.trim().toUpperCase();
            return cleaned === 'Y' || cleaned === 'YES';
        });
}

/**
 * Applies variable effects based on resolution answers.
 * @param {object} beat - The beat object
 * @param {boolean[]} answers - Resolution answers
 */
function applyVariableEffects(beat, answers) {
    if (!beat.variables || !beat.variables.questions || !beat.variables.effects) {
        return;
    }

    const effectMapping = beat.variables.effectMapping;
    const effects = beat.variables.effects;

    if (effectMapping) {
        for (let i = 0; i < answers.length; i++) {
            if (answers[i] && effectMapping[i]) {
                const effectKey = effectMapping[i];
                const effect = effects[effectKey];
                if (effect) {
                    applyEffectObject(effect);
                }
            }
        }
    }
}

/**
 * Applies a single effect object to game state.
 * @param {object} effect - Effect definition
 */
function applyEffectObject(effect) {
    if (effect.heat) {
        gameState.currencies.heat += effect.heat;
        showCurrencyToast('heat', effect.heat);
    }
    if (effect.style) {
        gameState.resources.style += effect.style;
        showToast(`+${effect.style} Style`, 'success');
    }
    if (effect.presence) {
        gameState.currencies.presence += effect.presence;
        showCurrencyToast('presence', effect.presence);
    }
    if (effect.connection) {
        gameState.currencies.connection += effect.connection;
        showCurrencyToast('connection', effect.connection);
    }
    if (effect.damage) {
        gameState.currencies.damage += effect.damage;
        showCurrencyToast('damage', effect.damage);
    }
    if (effect.flags) {
        for (const flag of effect.flags) {
            if (!gameState.flags.includes(flag)) {
                gameState.flags.push(flag);
            }
        }
    }
    if (effect.relationships) {
        for (const [sister, change] of Object.entries(effect.relationships)) {
            const delta = typeof change === 'number' ? change : parseInt(change);
            if (!isNaN(delta)) {
                modifyRegard(sister, delta);
            }
        }
    }
}

// ============================================================================
// BOOKKEEPER CALL
// ============================================================================

/**
 * Makes a bookkeeper call to extract mechanical changes not covered by Beat outcomes.
 * Uses a separate, cheaper model if configured.
 * @param {string} sceneTranscript - The full scene transcript
 * @param {object} beat - The beat that was played (for context)
 * @returns {Promise<object>} Extracted mechanical changes
 */
async function callBookkeeper(sceneTranscript, beat) {
    const centralCharacter = beat?.route || 'none';

    const prompt = `You are a bookkeeper for a narrative game. Extract mechanical state changes from this scene transcript.

The scene's CENTRAL character was: ${centralCharacter}
(Relationship changes with the central character are handled separately—focus on OTHER characters and general state.)

=== TRANSCRIPT ===
${sceneTranscript}
=== END TRANSCRIPT ===

Extract the following. Be conservative—only note clear, unambiguous changes.

1. RESOURCES_SPENT: Did {{user}} explicitly spend Edge, Surge, or invoke Risk? Format: "edge:1, surge:1" or "none"

2. TROUBLE_MARKED: Did {{user}} take a Reprieve or otherwise mark Trouble? Format: "N" where N is amount, or "0"

3. OTHER_RELATIONSHIPS: Did {{user}}'s relationship with any sister OTHER than ${centralCharacter} clearly shift? Format: "emma:+1, yuki:-1" or "none"

4. NEW_FLAGS: Did anything significant happen that should be recorded as a story flag? Only clear, concrete events. Format: "flag_name, another_flag" or "none"

5. CONDITIONS: Did {{user}} end the scene with any lingering conditions? Format: "tired, awkward_with_holly" or "none"

Respond in EXACTLY this format, one line each:
RESOURCES_SPENT: [value]
TROUBLE_MARKED: [value]
OTHER_RELATIONSHIPS: [value]
NEW_FLAGS: [value]
CONDITIONS: [value]`;

    try {
        const response = await callBookkeeperModel(prompt);
        return parseBookkeeperResponse(response);
    } catch (error) {
        console.error('[PDP] Bookkeeper call failed:', error);
        return {
            resourcesSpent: {},
            troubleMarked: 0,
            otherRelationships: {},
            newFlags: [],
            conditions: []
        };
    }
}

/**
 * Calls the bookkeeper model (cheap/fast model for mechanical extraction).
 * @param {string} prompt - The bookkeeper prompt
 * @returns {Promise<string>} Model response
 */
async function callBookkeeperModel(prompt) {
    const config = extensionSettings?.bookkeeper;

    // If no separate bookkeeper configured, use ST's quiet prompt
    if (!config?.apiKey || !config?.enabled) {
        return await generateQuietPrompt(prompt);
    }

    // Use configured separate model
    if (config.provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: config.model || 'claude-3-haiku-20240307',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        return data.content[0].text;
    }

    if (config.provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o-mini',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    }

    // Fallback
    return await generateQuietPrompt(prompt);
}

/**
 * Generates a quiet prompt using SillyTavern's API.
 * @param {string} prompt - The prompt to send
 * @returns {Promise<string>} Model response
 */
async function generateQuietPrompt(prompt) {
    const context = getContext();
    if (typeof context.generateQuietPrompt === 'function') {
        return await context.generateQuietPrompt(prompt);
    }
    // Fallback: return empty response
    console.warn('[PDP] generateQuietPrompt not available');
    return '';
}

/**
 * Parses the bookkeeper response into structured data.
 * @param {string} response - Raw bookkeeper response
 * @returns {object} Parsed bookkeeper data
 */
function parseBookkeeperResponse(response) {
    const result = {
        resourcesSpent: {},
        troubleMarked: 0,
        otherRelationships: {},
        newFlags: [],
        conditions: []
    };

    // Parse RESOURCES_SPENT
    const resourceMatch = response.match(/RESOURCES_SPENT:\s*(.+)/i);
    if (resourceMatch && resourceMatch[1].toLowerCase() !== 'none') {
        const parts = resourceMatch[1].split(',');
        for (const part of parts) {
            const [resource, amount] = part.split(':').map(s => s.trim());
            if (resource && amount) {
                result.resourcesSpent[resource.toLowerCase()] = parseInt(amount) || 0;
            }
        }
    }

    // Parse TROUBLE_MARKED
    const troubleMatch = response.match(/TROUBLE_MARKED:\s*(\d+)/i);
    if (troubleMatch) {
        result.troubleMarked = parseInt(troubleMatch[1]) || 0;
    }

    // Parse OTHER_RELATIONSHIPS
    const relMatch = response.match(/OTHER_RELATIONSHIPS:\s*(.+)/i);
    if (relMatch && relMatch[1].toLowerCase() !== 'none') {
        const parts = relMatch[1].split(',');
        for (const part of parts) {
            const match = part.match(/(\w+)\s*:\s*([+-]?\d+)/);
            if (match) {
                result.otherRelationships[match[1].toLowerCase()] = parseInt(match[2]);
            }
        }
    }

    // Parse NEW_FLAGS
    const flagMatch = response.match(/NEW_FLAGS:\s*(.+)/i);
    if (flagMatch && flagMatch[1].toLowerCase() !== 'none') {
        result.newFlags = flagMatch[1].split(',').map(f => f.trim().toLowerCase()).filter(f => f);
    }

    // Parse CONDITIONS
    const condMatch = response.match(/CONDITIONS:\s*(.+)/i);
    if (condMatch && condMatch[1].toLowerCase() !== 'none') {
        result.conditions = condMatch[1].split(',').map(c => c.trim().toLowerCase()).filter(c => c);
    }

    return result;
}

/**
 * Applies bookkeeper findings to game state.
 * @param {object} findings - Parsed bookkeeper data
 */
function applyBookkeeperFindings(findings) {
    // Apply resource expenditures
    for (const [resource, amount] of Object.entries(findings.resourcesSpent)) {
        if (gameState.resources[resource] !== undefined) {
            gameState.resources[resource] -= amount;
            showToast(`-${amount} ${resource}`, 'info');
        }
    }

    // Apply Trouble
    if (findings.troubleMarked > 0) {
        gameState.resources.trouble += findings.troubleMarked;
        showToast(`+${findings.troubleMarked} Trouble`, 'warning');
    }

    // Apply other relationship changes
    for (const [sister, delta] of Object.entries(findings.otherRelationships)) {
        if (gameState.relationships[sister]) {
            modifyRegard(sister, delta);
            const sign = delta > 0 ? '+' : '';
            showToast(`${sister}: ${sign}${delta}`, delta > 0 ? 'success' : 'warning');
        }
    }

    // Apply new flags
    for (const flag of findings.newFlags) {
        if (!gameState.flags.includes(flag)) {
            gameState.flags.push(flag);
        }
    }

    // Apply conditions
    gameState.conditions = findings.conditions;
}

// ============================================================================
// SCENE MANAGEMENT
// ============================================================================

/**
 * Gets the next scene from queue or generates ambient.
 * @returns {object} Next scene info
 */
function getNextScene() {
    // Check queue for beats
    if (gameState.beats.queue.length > 0) {
        const queueEntry = gameState.beats.queue[0];
        const beat = beatsCatalog[queueEntry.id];
        if (beat) {
            return { type: 'beat', beat, queueEntry };
        }
    }

    // Generate ambient scene
    const validSeeds = ambientSeeds.filter(seed => {
        if (seed.period && seed.period !== gameState.time.period) return false;
        if (seed.flags?.required) {
            for (const flag of seed.flags.required) {
                if (!gameState.flags.includes(flag)) return false;
            }
        }
        if (seed.flags?.forbidden) {
            for (const flag of seed.flags.forbidden) {
                if (gameState.flags.includes(flag)) return false;
            }
        }
        return true;
    });

    if (validSeeds.length > 0) {
        const seed = validSeeds[Math.floor(Math.random() * validSeeds.length)];
        return { type: 'ambient', seed };
    }

    return { type: 'ambient', seed: { prompt: 'A quiet moment at the sorority house.' } };
}

/**
 * Starts a new scene from the queue or ambient.
 */
async function handleStartScene() {
    const context = getContext();
    const next = getNextScene();

    // Generate fresh dice pool
    const dicePool = generateDicePool(12);

    // Initialize scene state
    gameState.scene = {
        active: true,
        type: next.type,
        startTurn: gameState.time.turnCount,
        messageCountAtStart: context.chat?.length || 0,
        dicePool: dicePool,
        diceConsumed: 0,
        canAbsorb: false,
        lastFumble: null
    };

    // Build injection content
    let injection = buildFitDInjection(dicePool);

    if (next.beat) {
        gameState.beats.currentBeat = next.queueEntry.id;

        // Add beat setup
        if (next.beat.setup) {
            injection += '\n\n[SCENE SETUP]\n' + next.beat.setup + '\n[/SCENE SETUP]';
        }

        // Add narrative direction
        injection += '\n\n' + buildBeatDirectionInjection(next.beat);

        // Trigger World Info entry if specified
        if (next.beat.wiEntryId && typeof triggerWorldInfoEntry === 'function') {
            await triggerWorldInfoEntry(next.beat.wiEntryId);
        }

        showToast(`Scene started: ${next.beat.name}`, 'info');
    } else if (next.seed) {
        injection += '\n\n[AMBIENT SCENE]\n' + next.seed.prompt + '\n[/AMBIENT SCENE]';
        showToast('Ambient scene started', 'info');
    }

    // Save state
    await saveState();
    updatePanel();

    // Send injection as system message or inject into context
    if (context.sendSystemMessage) {
        context.sendSystemMessage('generic', injection);
    }

    return injection;
}

/**
 * Complete scene end handler.
 * Orchestrates resolution questions, guaranteed outcomes, variable effects, and bookkeeper call.
 */
async function handleEndScene() {
    if (!gameState.scene.active) {
        showToast('No active scene', 'warning');
        return;
    }

    const beatId = gameState.beats.currentBeat;
    const beat = beatId ? beatsCatalog[beatId] : null;

    // Step 1: Get the scene transcript
    const transcript = getSceneTranscript();

    // Step 2: Parse resolution from the last message
    const lastMessage = getLastAssistantMessage();
    const resolutionAnswers = parseResolution(lastMessage);

    // Step 3: Apply guaranteed Beat outcomes (always happens)
    if (beat?.guaranteed?.outcomes) {
        applyGuaranteedOutcomes(beat.guaranteed.outcomes);
        showToast(`Beat complete: ${beat.name}`, 'success');
    }

    // Step 4: Apply variable effects based on resolution
    if (beat && resolutionAnswers.length > 0) {
        applyVariableEffects(beat, resolutionAnswers);
    }

    // Step 5: Bookkeeper call for everything else
    if (transcript) {
        const bookkeepingData = await callBookkeeper(transcript, beat);
        applyBookkeeperFindings(bookkeepingData);
    }

    // Step 6: Mark beat complete, clear from queue
    if (beatId) {
        if (!gameState.beats.completed.includes(beatId)) {
            gameState.beats.completed.push(beatId);
        }
        gameState.beats.queue = gameState.beats.queue.filter(q => q.id !== beatId);

        // Unlock any beats this one unlocks
        if (beat?.guaranteed?.outcomes?.unlocks) {
            for (const unlockId of beat.guaranteed.outcomes.unlocks) {
                if (!gameState.beats.unlocked.includes(unlockId)) {
                    gameState.beats.unlocked.push(unlockId);
                }
            }
        }
    }

    // Step 7: Award base presence
    gameState.currencies.presence += 1;
    showCurrencyToast('presence', 1);

    // Step 8: Scene cleanup
    gameState.scene.active = false;
    gameState.scene.dicePool = null;
    gameState.scene.diceConsumed = 0;
    gameState.scene.canAbsorb = false;
    gameState.scene.lastFumble = null;
    gameState.beats.currentBeat = null;

    // Step 9: Advance time
    advanceTime();

    // Step 10: Check crisis
    checkHeatCrisis();

    // Step 11: Save and update
    await saveState();
    updatePanel();
}

/**
 * Applies guaranteed Beat outcomes to game state.
 * @param {object} outcomes - The guaranteed outcomes object
 */
function applyGuaranteedOutcomes(outcomes) {
    if (outcomes.flags) {
        for (const flag of outcomes.flags) {
            if (!gameState.flags.includes(flag)) {
                gameState.flags.push(flag);
            }
        }
    }

    if (outcomes.relationships) {
        for (const [sister, change] of Object.entries(outcomes.relationships)) {
            const delta = typeof change === 'number' ? change : parseInt(change);
            if (!isNaN(delta)) {
                modifyRegard(sister, delta);
                const sign = delta > 0 ? '+' : '';
                showToast(`${sister}: ${sign}${delta}`, delta > 0 ? 'success' : 'warning');
            }
        }
    }

    if (outcomes.presence) {
        gameState.currencies.presence += outcomes.presence;
        showCurrencyToast('presence', outcomes.presence);
    }

    if (outcomes.connection) {
        gameState.currencies.connection += outcomes.connection;
        showCurrencyToast('connection', outcomes.connection);
    }

    if (outcomes.damage) {
        gameState.currencies.damage += outcomes.damage;
        showCurrencyToast('damage', outcomes.damage);
    }

    if (outcomes.heat) {
        gameState.currencies.heat += outcomes.heat;
        showCurrencyToast('heat', outcomes.heat);
    }
}

/**
 * Gets the full scene transcript for bookkeeper analysis.
 * @returns {string} Formatted transcript
 */
function getSceneTranscript() {
    const context = getContext();
    const chat = context.chat;

    if (!chat || !gameState.scene.messageCountAtStart) {
        return '';
    }

    const sceneMessages = chat.slice(gameState.scene.messageCountAtStart);

    return sceneMessages.map(msg => {
        const role = msg.is_user ? '{{user}}' : 'Narrator';
        return `${role}: ${msg.mes}`;
    }).join('\n\n---\n\n');
}

/**
 * Gets the last assistant message from chat.
 * @returns {string} The message text
 */
function getLastAssistantMessage() {
    const context = getContext();
    const chat = context.chat;

    if (!chat) return '';

    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) {
            return chat[i].mes;
        }
    }

    return '';
}

// ============================================================================
// RELATIONSHIP SYSTEM
// ============================================================================

const RELATIONSHIP_TIERS = ['hostile', 'cold', 'neutral', 'warm', 'close', 'intimate'];

/**
 * Modifies a sister's regard value and potentially tier.
 * @param {string} sister - Sister name
 * @param {number} delta - Change amount
 */
function modifyRegard(sister, delta) {
    const rel = gameState.relationships[sister];
    if (!rel) return;

    rel.regard += delta;

    // Check for tier changes
    const tierIndex = RELATIONSHIP_TIERS.indexOf(rel.tier);

    if (rel.regard >= 3 && tierIndex < RELATIONSHIP_TIERS.length - 1) {
        rel.tier = RELATIONSHIP_TIERS[tierIndex + 1];
        rel.regard = 0;
        showToast(`Relationship with ${sister} improved to ${rel.tier}!`, 'success');
    } else if (rel.regard <= -3 && tierIndex > 0) {
        rel.tier = RELATIONSHIP_TIERS[tierIndex - 1];
        rel.regard = 0;
        showToast(`Relationship with ${sister} dropped to ${rel.tier}`, 'warning');
    }
}

// ============================================================================
// TIME SYSTEM
// ============================================================================

const TIME_PERIODS = ['morning', 'afternoon', 'evening', 'night'];

/**
 * Advances time by one period.
 */
function advanceTime() {
    const periodIndex = TIME_PERIODS.indexOf(gameState.time.period);

    if (periodIndex >= TIME_PERIODS.length - 1) {
        // Move to next day
        gameState.time.day += 1;
        gameState.time.period = TIME_PERIODS[0];
    } else {
        gameState.time.period = TIME_PERIODS[periodIndex + 1];
    }

    gameState.time.turnCount += 1;
}

// ============================================================================
// BEAT SYSTEM
// ============================================================================

/**
 * Gets available beats that can be purchased.
 * @returns {object[]} Array of available beat objects with IDs
 */
function getAvailableBeats() {
    const available = [];

    for (const [id, beat] of Object.entries(beatsCatalog)) {
        // Skip completed beats
        if (gameState.beats.completed.includes(id)) continue;

        // Skip already queued beats
        if (gameState.beats.queue.some(q => q.id === id)) continue;

        // Check prerequisites
        if (!checkBeatPrerequisites(beat)) continue;

        available.push({ id, ...beat });
    }

    return available;
}

/**
 * Checks if a beat's prerequisites are met.
 * @param {object} beat - Beat object
 * @returns {boolean} Whether prerequisites are met
 */
function checkBeatPrerequisites(beat) {
    const prereqs = beat.prerequisites;
    if (!prereqs) return true;

    // Check required flags
    if (prereqs.flags?.required) {
        for (const flag of prereqs.flags.required) {
            if (!gameState.flags.includes(flag)) return false;
        }
    }

    // Check forbidden flags
    if (prereqs.flags?.forbidden) {
        for (const flag of prereqs.flags.forbidden) {
            if (gameState.flags.includes(flag)) return false;
        }
    }

    // Check relationship requirements
    if (prereqs.relationships) {
        for (const [sister, req] of Object.entries(prereqs.relationships)) {
            const rel = gameState.relationships[sister];
            if (!rel) continue;

            if (req.min) {
                const minIndex = RELATIONSHIP_TIERS.indexOf(req.min);
                const currentIndex = RELATIONSHIP_TIERS.indexOf(rel.tier);
                if (currentIndex < minIndex) return false;
            }

            if (req.max) {
                const maxIndex = RELATIONSHIP_TIERS.indexOf(req.max);
                const currentIndex = RELATIONSHIP_TIERS.indexOf(rel.tier);
                if (currentIndex > maxIndex) return false;
            }
        }
    }

    // Check time requirements
    if (prereqs.time) {
        if (prereqs.time.dayMin && gameState.time.day < prereqs.time.dayMin) return false;
        if (prereqs.time.dayMax && gameState.time.day > prereqs.time.dayMax) return false;
        if (prereqs.time.periods && !prereqs.time.periods.includes(gameState.time.period)) return false;
    }

    return true;
}

/**
 * Purchases a beat and adds it to the queue.
 * @param {string} beatId - Beat ID to purchase
 * @returns {object} Result of purchase attempt
 */
function purchaseBeat(beatId) {
    const beat = beatsCatalog[beatId];

    if (!beat) {
        return { success: false, message: `Beat not found: ${beatId}` };
    }

    if (gameState.beats.completed.includes(beatId)) {
        return { success: false, message: 'Beat already completed' };
    }

    if (gameState.beats.queue.some(q => q.id === beatId)) {
        return { success: false, message: 'Beat already in queue' };
    }

    if (!checkBeatPrerequisites(beat)) {
        return { success: false, message: 'Prerequisites not met' };
    }

    const cost = beat.cost || 1;
    if (gameState.currencies.presence < cost) {
        return { success: false, message: `Not enough Presence (need ${cost}, have ${gameState.currencies.presence})` };
    }

    // Deduct cost
    gameState.currencies.presence -= cost;

    // Add to queue
    gameState.beats.queue.push({
        id: beatId,
        priority: beat.route ? 1 : 0,  // Route beats have higher priority
        purchasedAt: gameState.time.turnCount
    });

    // Sort queue by priority
    gameState.beats.queue.sort((a, b) => b.priority - a.priority);

    saveState();
    updatePanel();

    return { success: true, message: `Purchased: ${beat.name} (-${cost} Presence)` };
}

// ============================================================================
// HEAT / CRISIS SYSTEM
// ============================================================================

const HEAT_CRISIS_THRESHOLD = 8;

/**
 * Checks if Heat has reached crisis level.
 */
function checkHeatCrisis() {
    if (gameState.currencies.heat >= HEAT_CRISIS_THRESHOLD) {
        showToast('CRISIS: Heat at maximum!', 'error');
        // Crisis handling would go here
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Shows a toast notification.
 * @param {string} message - Message to display
 * @param {string} type - Type: 'info', 'success', 'warning', 'error'
 */
function showToast(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](message, 'Phi Delta Phi');
    } else {
        console.log(`[PDP] ${type.toUpperCase()}: ${message}`);
    }
}

/**
 * Shows a currency change toast.
 * @param {string} currency - Currency name
 * @param {number} change - Change amount
 */
function showCurrencyToast(currency, change) {
    const sign = change > 0 ? '+' : '';
    const type = change > 0 ? 'success' : 'warning';
    showToast(`${sign}${change} ${currency}`, type);
}

/**
 * Updates the UI panel with current state.
 */
function updatePanel() {
    const panel = document.getElementById('pdp-panel');
    if (!panel) return;

    // Update currencies
    updateCurrencyDisplay('presence', gameState.currencies.presence);
    updateCurrencyDisplay('connection', gameState.currencies.connection);
    updateCurrencyDisplay('damage', gameState.currencies.damage);
    updateCurrencyDisplay('heat', gameState.currencies.heat);

    // Update resources
    for (const [name, value] of Object.entries(gameState.resources)) {
        if (name !== 'troubleMax') {
            updateResourceDisplay(name, value);
        }
    }

    // Update trouble bar
    updateTroubleBar();

    // Update dice pool display
    updateDicePoolDisplay();

    // Update absorb button
    updateAbsorbButton();

    // Update conditions
    updateConditionsDisplay();

    // Update time display
    updateTimeDisplay();

    // Update scene status
    updateSceneStatus();
}

function updateCurrencyDisplay(name, value) {
    const el = document.querySelector(`#pdp-currency-${name} .pdp-currency-value`);
    if (el) el.textContent = value;
}

function updateResourceDisplay(name, value) {
    const el = document.querySelector(`.pdp-resource-${name} .pdp-resource-value`);
    if (el) el.textContent = value;
}

function updateTroubleBar() {
    const container = document.getElementById('pdp-trouble-bar');
    if (!container) return;

    container.innerHTML = '';
    const max = gameState.resources.troubleMax;
    const current = gameState.resources.trouble;

    for (let i = 0; i < max; i++) {
        const box = document.createElement('div');
        box.className = 'pdp-trouble-box';
        if (i < current) {
            box.classList.add('filled');
            if (i >= max - 2) box.classList.add('danger');
        }
        container.appendChild(box);
    }
}

function updateDicePoolDisplay() {
    const container = document.getElementById('pdp-dice-pool');
    if (!container) return;

    if (!gameState.scene.active || !gameState.scene.dicePool) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const row = container.querySelector('.pdp-dice-row');
    if (!row) return;

    row.innerHTML = '';
    const pool = gameState.scene.dicePool;
    const consumed = gameState.scene.diceConsumed;

    pool.forEach((die, i) => {
        const dieEl = document.createElement('div');
        dieEl.className = 'pdp-die';
        dieEl.textContent = die;

        if (i < consumed) {
            dieEl.classList.add('consumed');
        } else {
            if (die === 6) dieEl.classList.add('high');
            else if (die >= 4) dieEl.classList.add('mid');
            else dieEl.classList.add('low');
        }

        row.appendChild(dieEl);
    });
}

function updateAbsorbButton() {
    const container = document.getElementById('pdp-absorb-container');
    if (!container) return;

    if (gameState.scene.canAbsorb) {
        container.style.display = 'block';
        const costText = container.querySelector('.pdp-absorb-cost');
        if (costText) {
            const cost = gameState.currencies.heat >= 5 ? 2 : 1;
            costText.textContent = `Cost: +${cost} Heat`;
        }
    } else {
        container.style.display = 'none';
    }
}

function updateConditionsDisplay() {
    const container = document.getElementById('pdp-conditions');
    if (!container) return;

    container.innerHTML = '';

    for (const condition of gameState.conditions) {
        const tag = document.createElement('span');
        tag.className = 'pdp-condition-tag';
        tag.textContent = condition.replace(/_/g, ' ');
        container.appendChild(tag);
    }
}

function updateTimeDisplay() {
    const dayEl = document.getElementById('pdp-day');
    const periodEl = document.getElementById('pdp-period');

    if (dayEl) dayEl.textContent = `Day ${gameState.time.day}`;
    if (periodEl) periodEl.textContent = gameState.time.period;
}

function updateSceneStatus() {
    const statusEl = document.getElementById('pdp-scene-status');
    if (!statusEl) return;

    if (gameState.scene.active) {
        const beatId = gameState.beats.currentBeat;
        const beat = beatId ? beatsCatalog[beatId] : null;
        statusEl.textContent = beat ? `In scene: ${beat.name}` : 'In ambient scene';
        statusEl.classList.add('active');
    } else {
        statusEl.textContent = 'Downtime';
        statusEl.classList.remove('active');
    }
}

// ============================================================================
// UI PANEL CREATION
// ============================================================================

function createPanel() {
    // Check if panel already exists
    if (document.getElementById('pdp-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'pdp-panel';
    panel.className = 'pdp-panel';

    panel.innerHTML = `
        <div class="pdp-header">
            <div class="pdp-title">Phi Delta Phi</div>
            <div class="pdp-time">
                <span id="pdp-day">Day 1</span>
                <span id="pdp-period">morning</span>
            </div>
        </div>

        <div class="pdp-scene-status" id="pdp-scene-status">Downtime</div>

        <div class="pdp-section">
            <div class="pdp-section-title">Currencies</div>
            <div class="pdp-currencies">
                <div class="pdp-currency" id="pdp-currency-presence">
                    <span class="pdp-currency-name">Presence</span>
                    <span class="pdp-currency-value">3</span>
                </div>
                <div class="pdp-currency" id="pdp-currency-connection">
                    <span class="pdp-currency-name">Connection</span>
                    <span class="pdp-currency-value">0</span>
                </div>
                <div class="pdp-currency" id="pdp-currency-heat">
                    <span class="pdp-currency-name">Heat</span>
                    <span class="pdp-currency-value">0</span>
                </div>
                <div class="pdp-currency" id="pdp-currency-damage">
                    <span class="pdp-currency-name">Damage</span>
                    <span class="pdp-currency-value">0</span>
                </div>
            </div>
        </div>

        <div class="pdp-section">
            <div class="pdp-section-title">Resources</div>
            <div class="pdp-resources">
                <div class="pdp-resource-item pdp-resource-edge">
                    <span class="pdp-resource-name">Edge</span>
                    <span class="pdp-resource-value">3</span>
                </div>
                <div class="pdp-resource-item pdp-resource-surge">
                    <span class="pdp-resource-name">Surge</span>
                    <span class="pdp-resource-value">0</span>
                </div>
                <div class="pdp-resource-item pdp-resource-style">
                    <span class="pdp-resource-name">Style</span>
                    <span class="pdp-resource-value">0</span>
                </div>
                <div class="pdp-resource-item pdp-resource-reputation">
                    <span class="pdp-resource-name">Reputation</span>
                    <span class="pdp-resource-value">0</span>
                </div>
            </div>
            <div class="pdp-trouble-section">
                <div class="pdp-resource-name">Trouble</div>
                <div class="pdp-trouble-bar" id="pdp-trouble-bar"></div>
            </div>
        </div>

        <div class="pdp-dice-pool" id="pdp-dice-pool" style="display: none;">
            <div class="pdp-dice-label">Dice Bank</div>
            <div class="pdp-dice-row"></div>
        </div>

        <div class="pdp-absorb-available" id="pdp-absorb-container" style="display: none;">
            <div class="pdp-absorb-text">Fumble occurred! Absorb to soften the consequence.</div>
            <div class="pdp-absorb-cost">Cost: +1 Heat</div>
            <button class="pdp-btn pdp-btn-absorb" onclick="window.pdpAbsorb()">Absorb Fumble</button>
        </div>

        <div class="pdp-conditions" id="pdp-conditions"></div>

        <div class="pdp-section pdp-actions">
            <button class="pdp-btn pdp-btn-primary" onclick="window.pdpStartScene()" id="pdp-btn-start">Start Scene</button>
            <button class="pdp-btn pdp-btn-secondary" onclick="window.pdpEndScene()" id="pdp-btn-end">End Scene</button>
        </div>
    `;

    // Find a good place to insert the panel
    const extensionsPanel = document.getElementById('extensions_settings');
    if (extensionsPanel) {
        extensionsPanel.appendChild(panel);
    } else {
        document.body.appendChild(panel);
    }

    // Initial update
    updatePanel();
}

// ============================================================================
// SLASH COMMANDS
// ============================================================================

function registerSlashCommands() {
    // State dump
    registerSlashCommand('pdp-state', () => {
        return '```json\n' + JSON.stringify(gameState, null, 2) + '\n```';
    }, [], 'Dumps full game state as JSON');

    // Brief status
    registerSlashCommand('pdp-status', () => {
        const s = gameState;
        return `Day ${s.time.day} ${s.time.period} | Presence: ${s.currencies.presence} | Heat: ${s.currencies.heat}/8 | Scene: ${s.scene.active ? 'Active' : 'None'}`;
    }, [], 'Shows brief status line');

    // Available beats
    registerSlashCommand('pdp-available', () => {
        const available = getAvailableBeats();
        if (available.length === 0) {
            return 'No beats available. Check prerequisites or wait for unlocks.';
        }
        return available.map(b => `- **${b.id}** (${b.cost}P): ${b.description}`).join('\n');
    }, [], 'Lists purchasable beats');

    // Buy beat
    registerSlashCommand('pdp-buy', (args) => {
        const beatId = args.trim();
        if (!beatId) {
            return 'Usage: /pdp-buy [beat_id]';
        }
        const result = purchaseBeat(beatId);
        return result.message;
    }, [], 'Purchases a beat (e.g., /pdp-buy jackie_tennis)');

    // Queue
    registerSlashCommand('pdp-queue', () => {
        if (gameState.beats.queue.length === 0) {
            return 'Beat queue is empty.';
        }
        return gameState.beats.queue.map((q, i) => {
            const beat = beatsCatalog[q.id];
            return `${i + 1}. ${beat?.name || q.id}`;
        }).join('\n');
    }, [], 'Shows the beat queue');

    // Start scene
    registerSlashCommand('pdp-start-scene', async () => {
        const injection = await handleStartScene();
        return 'Scene started. Injection sent.';
    }, [], 'Starts the next scene');

    // End scene
    registerSlashCommand('pdp-end-scene', async () => {
        await handleEndScene();
        return 'Scene ended.';
    }, [], 'Ends the current scene and processes resolution');

    // Resource adjustment
    registerSlashCommand('pdp-resource', (args) => {
        const parts = args.trim().split(' ');
        if (parts.length < 2) {
            return 'Usage: /pdp-resource [name] [+/-N]';
        }

        const resourceName = parts[0].toLowerCase();
        const changeStr = parts[1];

        if (!gameState.resources.hasOwnProperty(resourceName)) {
            return `Unknown resource: ${resourceName}. Valid: ${Object.keys(gameState.resources).filter(k => k !== 'troubleMax').join(', ')}`;
        }

        const change = parseInt(changeStr);
        if (isNaN(change)) {
            return `Invalid change value: ${changeStr}`;
        }

        gameState.resources[resourceName] += change;
        saveState();
        updatePanel();

        const sign = change > 0 ? '+' : '';
        return `${resourceName}: ${sign}${change} (now ${gameState.resources[resourceName]})`;
    }, [], 'Adjusts a resource value (e.g., /pdp-resource trouble +1)');

    // Absorb
    registerSlashCommand('pdp-absorb', () => {
        const result = absorbLastFumble();
        return result.message;
    }, [], 'Absorbs the last fumble by spending Heat');

    // Bracelet toggle
    registerSlashCommand('pdp-bracelet', () => {
        gameState.bracelet.worn = !gameState.bracelet.worn;
        saveState();
        return `Bracelet ${gameState.bracelet.worn ? 'worn' : 'removed'}`;
    }, [], 'Toggles bracelet worn status');

    // Reset (debug)
    registerSlashCommand('pdp-reset', () => {
        gameState = createDefaultState();
        saveState();
        updatePanel();
        return 'Game state reset to defaults.';
    }, [], 'Resets game state (debug)');

    // Set flag
    registerSlashCommand('pdp-flag', (args) => {
        const flag = args.trim().toLowerCase();
        if (!flag) {
            return 'Current flags: ' + (gameState.flags.length > 0 ? gameState.flags.join(', ') : '(none)');
        }

        if (flag.startsWith('-')) {
            // Remove flag
            const toRemove = flag.substring(1);
            gameState.flags = gameState.flags.filter(f => f !== toRemove);
            saveState();
            return `Removed flag: ${toRemove}`;
        } else {
            // Add flag
            if (!gameState.flags.includes(flag)) {
                gameState.flags.push(flag);
                saveState();
            }
            return `Added flag: ${flag}`;
        }
    }, [], 'Adds or removes a flag (use -flag to remove)');

    // Resolution injection (for triggering resolution at scene end)
    registerSlashCommand('pdp-resolve', () => {
        const beatId = gameState.beats.currentBeat;
        const beat = beatId ? beatsCatalog[beatId] : null;
        return buildResolutionInjection(beat);
    }, [], 'Generates resolution injection for current scene');
}

// ============================================================================
// GLOBAL FUNCTIONS (for onclick handlers)
// ============================================================================

window.pdpStartScene = handleStartScene;
window.pdpEndScene = handleEndScene;
window.pdpAbsorb = absorbLastFumble;

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Listen for LLM responses to parse TRACE lines
    eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
        if (!gameState.scene.active) return;

        const response = typeof data === 'string' ? data : data?.message;
        if (!response) return;

        const traces = parseTraceLines(response);
        if (traces.length > 0) {
            processTraces(traces);
        }
    });

    // Listen for chat loaded to restore state
    eventSource.on(event_types.CHAT_CHANGED, () => {
        loadState();
        updatePanel();
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function loadCatalogFiles() {
    try {
        // Load beats catalog
        const beatsResponse = await fetch(`${extensionFolderPath}/beats-catalog.json`);
        if (beatsResponse.ok) {
            const beatsData = await beatsResponse.json();
            // Remove meta field
            delete beatsData._meta;
            beatsCatalog = beatsData;
            console.log('[PDP] Loaded beats catalog:', Object.keys(beatsCatalog).length, 'beats');
        }

        // Load ambient seeds
        const seedsResponse = await fetch(`${extensionFolderPath}/ambient-seeds.json`);
        if (seedsResponse.ok) {
            const seedsData = await seedsResponse.json();
            ambientSeeds = seedsData.seeds || [];
            console.log('[PDP] Loaded ambient seeds:', ambientSeeds.length, 'seeds');
        }
    } catch (error) {
        console.error('[PDP] Failed to load catalog files:', error);
    }
}

async function init() {
    console.log('[PDP] Initializing Phi Delta Phi extension v0.2.0');

    // Load catalogs
    await loadCatalogFiles();

    // Load saved state
    await loadState();

    // Create UI panel
    createPanel();

    // Register slash commands
    registerSlashCommands();

    // Setup event listeners
    setupEventListeners();

    console.log('[PDP] Initialization complete');
}

// Wait for ST to be ready
jQuery(async () => {
    await init();
});
