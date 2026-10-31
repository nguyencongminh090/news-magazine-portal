# Claude Prompt Format: Best Practices

Distilled in our own words from Anthropic's "Prompt engineering overview" and "Prompting best practices" pages (fetched 2026-10-23):
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

The overview page is a pointer: it says to start from success criteria and evals, then use "Prompting best practices" as the living reference. Re-fetch that page when it matters, since model-specific advice changes often.

## Before rewriting a prompt

The target prompt needs (1) success criteria, (2) a way to test against them, (3) a first draft. If the user has no draft, use Reverse Role (interview) first. If a problem is about cost or latency, a different model or effort level may fix it faster than rewording.

## Claude-format prompt layout

Apply when the target model is Claude (or unknown and the user works in Claude). Order matters:

1. **Role** (system prompt or first line): one sentence is enough.
2. **Long inputs first.** Documents, data, code go at the top, wrapped in tags. Queries placed after the data can improve quality noticeably on multi-document inputs.
3. **Context and motivation**: say why a rule exists. Claude generalizes from the reason ("read aloud by text-to-speech, so no ellipses") better than from a bare prohibition.
4. **Instructions**: direct, specific, positive. Numbered steps only when order or completeness matters.
5. **Examples**: 3-5, relevant, diverse, each in `<example>` inside `<examples>`.
6. **Output format**: say what to produce, optionally name an output tag (e.g. `<answer>`).
7. **Query / task last.**

## XML structuring rules

- One tag per content type: `<instructions>`, `<context>`, `<input>`, `<examples>`, `<document>`, `<output_format>`.
- Same tag names everywhere in a prompt set; descriptive names, no magic words.
- Nest when content is hierarchical: `<documents><document index="1"><source>..</source><document_content>..</document_content></document></documents>`.
- For long-document tasks, ask for relevant quotes first (`<quotes>`), then the analysis (`<info>`).
- Behavior blocks in system prompts are conventionally named tags, e.g. `<default_to_action>`, `<investigate_before_answering>`.

## Writing rules

| Do | Instead of |
|----|-----------|
| "Write smooth prose paragraphs" | "Do not use markdown" |
| "Change this function to be faster" | "Can you suggest changes?" (Claude may only suggest) |
| "Use X when it helps with Y" | "CRITICAL: you MUST ALWAYS use X" (newer models overtrigger) |
| Ask for the extra effort you want ("go beyond the basics, include interactions") | Assuming Claude infers more than the literal ask |
| Match prompt style to wanted output style (less markdown in, less markdown out) | Markdown-heavy prompt that asks for plain prose |
| Tell what to do after tool use ("summarize what you did") if you want visibility | Assuming progress narration |

Key test: give the prompt to a colleague with no context. If they would be confused, so will Claude.

## Thinking and reasoning

- Prefer a general instruction ("think carefully about this") over a hand-written step plan; Claude's own reasoning often beats the prescribed one.
- Worked examples (problem, method, answer) shape how Claude reasons.
- Manual chain-of-thought (reason first, answer in `<answer>` tags) is a fallback when thinking is off. On the newest models, rely on thinking and effort instead; asking for visible reasoning in `<thinking>` tags may be declined.
- Self-check line is effective on older models ("verify against [criteria] before finishing"); on Opus 5 it can cause over-verification.
- Control depth with the effort setting, not with threats or capital letters. Thinking budgets (`budget_tokens`) are removed on 4.7+ models; use adaptive thinking plus effort.

## Agentic prompts

- Action vs advice: add `<default_to_action>` to make Claude implement, `<do_not_act_before_instructions>` to make it ask first.
- Parallel tool calls: say independent calls should run in parallel; dependent ones sequentially; never guess parameters.
- Autonomy and safety: allow local reversible actions; ask before destructive, hard-to-reverse or outward-facing ones.
- Over-engineering: state scope limits (no extra features, no unrequested refactors, no speculative abstractions).
- Anti-hardcoding: ask for general solutions, tell Claude to report bad tests rather than work around them.
- Grounding: "Never speculate about code you have not opened."
- Long tasks: tell Claude about context compaction so it does not stop early; use files for state (tests.json, progress.txt, git); first window sets up, later windows iterate.
- Subagents: describe when to delegate (parallel, isolated, independent) and when not (small, sequential, shared context).
- Research: success criteria, multi-source verification, competing hypotheses with confidence notes.

## Migration traps

- Prefilled last assistant turn is rejected on 4.6+ models. Replace with direct instructions, structured outputs, XML output tags, or a continuation in the user turn.
- Aggressive "anti-laziness" wording written for older models now causes overtriggering; soften it.
- Each model has its own page (Fable 5.1, Fable 5, Sonnet 5.5, Sonnet 5, Opus 5.5, Opus 5, Opus 4.8, Haiku 5.5). Read the page for the target model before shipping a production prompt.

## Do not use when

- The target is not Claude and the user wants that vendor's idiom (see `prompt-engineering-guide.md` for GPT/Gemini notes).
- The user needs a final copy-paste prompt for a plain chat box and objects to tags: use the flat framework output instead.
