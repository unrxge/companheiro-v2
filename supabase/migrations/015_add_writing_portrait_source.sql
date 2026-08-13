-- lib/portrait.ts's PortraitSource type gained 'writing' (writing-chat
-- distillation) without a matching DB migration at the time - every
-- distillPortrait call with source 'writing' has been silently failing at
-- insert ever since (caught and swallowed by distillPortrait's own
-- try/catch, so it never surfaced as a visible error).
--
-- In its own migration file, separate from schema changes that could share
-- a transaction with it: ALTER TYPE ... ADD VALUE cannot be used in the
-- same transaction as a statement that also uses the new value.
alter type portrait_source add value if not exists 'writing';
