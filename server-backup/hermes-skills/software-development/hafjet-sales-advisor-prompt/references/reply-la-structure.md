# Reply.la System-Prompt Structure (Grounded)

Extracted from Tuan's NotebookLM **"WhatsApp AI Chatbot Kickstart Webinar Participation Guide"** (notebook `a7416353`, 34 sources: Reply.la Prompt Creator, reply-format / power-question / ai-memory / ai-checker / closing-flow / segmentation screenshots, webinar YouTube playlists, participation PDF).

Use this as the spec to verify any HAFJET bot persona matches Reply.la.

## 1. Required prompt blocks
- **Role & Persona** — define role (e.g. Sales Advisor) + tone: friendly, casual, everyday-MY speech; NO formal "skema buku"; NO Indonesian slang; show empathy on problems, persuasive when moving to next step.
- **Cognitive Workflow** (think internally before replying): AI Knowledge (facts) → AI Memory (past context) → draft → AI Checker (validate).
- **Reply Format Rules** — strict WhatsApp readability rules (see §6).
- **Sales Technique** — e.g. open with a Power Question to drop the customer into the right flow.
- **Closing / CTA** — end EVERY message with exactly ONE specific, easy action. Never give a reason to wait/overthink.
- **Error Handling & Human Takeover** — stop + trigger Human Takeover + Auto Label when: can't answer from data, OR customer gives final details to process booking/order.

## 2. Power Question
- Sharp opener highlighting services / common visit reasons to speed closing.
- **3–4 specific options** (e.g. "1. Cracked screen  2. Battery drains  3. Camera not working").

## 3. AI Memory
- Remembers important context across long/past conversations.
- Recall: **Last Order**, **Preferences**, **Total Orders** → high personalization.

## 4. AI Checker
- Internal double-check of the drafted reply before sending.
- Prevents hallucination + offering **promotions (PROMO) that don't exist**.

## 5. Segmented Follow-Up (when customer goes silent)
- **Cold Lead** — didn't reply at intro. May not be interested / hasn't seen value.
- **Interested (Warm)** — stopped after seeing price. Comparing / evaluating value.
- **Hot Lead** — confirmed item/plan but hasn't paid. Clear interest, needs a nudge.
- **Very Hot Lead** — gave details but hasn't paid. Final step before closing.
- Rule: tailor the message to the exact drop-off stage. Don't send the same message to everyone.

## 6. Reply.la formatting rules (WhatsApp)
- One idea per line.
- Blank line between paragraphs.
- Standard emojis for friendly tone.
- WhatsApp **bold** and _italic_ for emphasis.
- ✅ for "yes"/positive lists; ❌ for "no"/negative lists.
- Always end with a question / action that moves toward closing.

## HAFJET mapping (as implemented in system_prompt.txt + hermes_ai.py)
- Persona ✅ · Cognitive Workflow ✅ · Format ✅ · Power Question (4 opts) ✅ · CTA ✅ · Human Takeover (= S2F5 escalation) ✅ · AI Memory (`build_memory_context`) ✅ · AI Checker (guardrails) ✅
- Partial: Segmented auto-follow-up has NO scheduler yet (Reply.la has blast/delayed messages). Needs a future feature.
