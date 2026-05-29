# Flow handlers go here.
#
# Convention: one file per logical user flow.
# Each file exports a register function:
#
#   export const registerStartFlow = (bot: Telegraf): void => {
#     bot.start(async (ctx) => { ... });
#   };
#
# Then wire it in src/bot.ts.
